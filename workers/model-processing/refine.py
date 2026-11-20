"""Apply refinement operations to a GLB with Blender and export a new GLB.

blender -b --factory-startup -P refine.py -- <in.glb> <out.glb> <ops.json>
ops.json: [{"op": "...", ...params}]. Prints "OPRESULT <json>" lines and "REFINE_DONE <json>".
Operations: cleanup, smooth, decimate, remesh, normals, fill_holes, scale, material, uv_unwrap, triangulate, place_on_ground.
"""
import bpy, bmesh, sys, json, math, mathutils

src, out, ops_path = sys.argv[sys.argv.index("--") + 1:][:3]
ops = json.load(open(ops_path))
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
uv_changed = False


def tris():
    dg = bpy.context.evaluated_depsgraph_get(); n = 0
    for o in meshes:
        me = o.evaluated_get(dg).data; me.calc_loop_triangles(); n += len(me.loop_triangles)
    return n


def select_only(o):
    bpy.ops.object.select_all(action="DESELECT"); o.select_set(True); bpy.context.view_layer.objects.active = o


def apply_mod(o, mod):
    select_only(o); bpy.ops.object.modifier_apply(modifier=mod.name)


def bounds():
    pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
    lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
    return lo, hi


def report(op, **k):
    print("OPRESULT " + json.dumps({"op": op, **k}), flush=True)


for spec in ops:
    op = spec["op"]; before = tris()
    if op == "cleanup":
        dist = float(spec.get("merge_distance", 0.0001)); min_ratio = float(spec.get("min_component_ratio", 0.01)); removed_parts = 0
        for o in meshes:
            bm = bmesh.new(); bm.from_mesh(o.data)
            bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=dist)
            bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=dist * 0.1)
            loose = [v for v in bm.verts if not v.link_faces]
            bmesh.ops.delete(bm, geom=loose, context="VERTS")
            # Remove small disconnected islands (floaters).
            bm.faces.ensure_lookup_table(); seen = set(); islands = []
            for f in bm.faces:
                if f.index in seen: continue
                stack = [f]; isl = []
                while stack:
                    x = stack.pop()
                    if x.index in seen: continue
                    seen.add(x.index); isl.append(x)
                    for e in x.edges:
                        for g in e.link_faces:
                            if g.index not in seen: stack.append(g)
                islands.append(isl)
            if islands:
                big = max(len(i) for i in islands)
                kill = [f for i in islands if len(i) < big * min_ratio for f in i]
                removed_parts += sum(1 for i in islands if len(i) < big * min_ratio)
                if kill: bmesh.ops.delete(bm, geom=kill, context="FACES")
            bm.to_mesh(o.data); bm.free(); o.data.update()
        report(op, triangles_before=before, triangles_after=tris(), removed_components=removed_parts)
    elif op == "smooth":
        for o in meshes:
            m = o.modifiers.new("smooth", "LAPLACIANSMOOTH"); m.iterations = int(spec.get("iterations", 5)); m.lambda_factor = float(spec.get("factor", 0.5))
            m.use_volume_preserve = True; m.use_normalized = True; apply_mod(o, m)
        report(op, triangles_before=before, triangles_after=tris())
    elif op == "decimate":
        target = spec.get("target_triangles"); ratio = float(spec.get("ratio", 0.5))
        if target: ratio = max(0.001, min(1.0, float(target) / max(1, before)))
        for o in meshes:
            m = o.modifiers.new("dec", "DECIMATE"); m.decimate_type = "COLLAPSE"; m.ratio = ratio; m.use_collapse_triangulate = True; apply_mod(o, m)
        report(op, triangles_before=before, triangles_after=tris(), ratio=ratio)
    elif op == "remesh":
        lo, hi = bounds(); diag = (hi - lo).length
        voxel = float(spec.get("voxel_size") or diag / float(spec.get("resolution", 200)))
        for o in meshes:
            m = o.modifiers.new("remesh", "REMESH"); m.mode = "VOXEL"; m.voxel_size = voxel; m.adaptivity = float(spec.get("adaptivity", 0.0)); apply_mod(o, m)
        uv_changed = True
        report(op, triangles_before=before, triangles_after=tris(), voxel_size=voxel)
    elif op == "normals":
        for o in meshes:
            select_only(o); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode="OBJECT")
            shade = spec.get("shading", "smooth")
            if shade == "flat": bpy.ops.object.shade_flat()
            else: bpy.ops.object.shade_smooth()
        report(op, triangles_before=before, triangles_after=tris())
    elif op == "fill_holes":
        sides = int(spec.get("max_sides", 64)); filled = 0
        for o in meshes:
            bm = bmesh.new(); bm.from_mesh(o.data)
            boundary = [e for e in bm.edges if e.is_boundary]
            r = bmesh.ops.holes_fill(bm, edges=boundary, sides=sides); filled += len(r.get("faces", []))
            bmesh.ops.triangulate(bm, faces=r.get("faces", []))
            bm.to_mesh(o.data); bm.free(); o.data.update()
        report(op, triangles_before=before, triangles_after=tris(), faces_added=filled)
    elif op == "scale":
        lo, hi = bounds(); dims = hi - lo
        if spec.get("factor"):
            f = float(spec["factor"])
        else:
            unit = {"mm": 0.001, "cm": 0.01, "m": 1.0, "in": 0.0254}[spec.get("unit", "cm")]
            axis = spec.get("axis", "longest")
            # Blender is Z-up: glTF X->X, Y(up)->Z, Z(depth)->-Y
            cur = {"x": dims.x, "y": dims.z, "z": dims.y}.get(axis, max(dims))
            f = float(spec["value"]) * unit / cur
        for o in meshes:
            o.scale = o.scale * f
        bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        report(op, triangles_before=before, triangles_after=tris(), factor=f)
    elif op == "place_on_ground":
        lo, hi = bounds(); c = (lo + hi) / 2
        for o in meshes:
            o.location -= mathutils.Vector((c.x, c.y, lo.z))
        bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.transform_apply(location=True, rotation=False, scale=False)
        report(op, triangles_before=before, triangles_after=tris())
    elif op == "material":
        edited = 0
        for mat in bpy.data.materials:
            if spec.get("name") and mat.name != spec["name"]: continue
            if not mat.use_nodes: continue
            b = next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
            if not b: continue
            if spec.get("base_color"):
                h = spec["base_color"].lstrip("#"); rgb = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
                lin = [c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4 for c in rgb]
                if b.inputs["Base Color"].links:
                    # Textured: tint through a multiply so the texture is preserved.
                    src_link = b.inputs["Base Color"].links[0]
                    mix = mat.node_tree.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.blend_type = "MULTIPLY"; mix.inputs[0].default_value = 1.0
                    mat.node_tree.links.new(src_link.from_socket, mix.inputs[6]); mix.inputs[7].default_value = (*lin, 1)
                    mat.node_tree.links.new(mix.outputs[2], b.inputs["Base Color"])
                else:
                    b.inputs["Base Color"].default_value = (*lin, 1)
            if spec.get("roughness") is not None: b.inputs["Roughness"].default_value = float(spec["roughness"])
            if spec.get("metallic") is not None: b.inputs["Metallic"].default_value = float(spec["metallic"])
            edited += 1
        report(op, triangles_before=before, triangles_after=tris(), materials_edited=edited)
    elif op == "uv_unwrap":
        for o in meshes:
            select_only(o); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(float(spec.get("angle", 66))), island_margin=float(spec.get("margin", 0.003)))
            bpy.ops.uv.select_all(action="SELECT"); bpy.ops.uv.pack_islands(rotate=True, margin=0.002)
            bpy.ops.object.mode_set(mode="OBJECT")
        uv_changed = True
        report(op, triangles_before=before, triangles_after=tris())
    elif op == "triangulate":
        for o in meshes:
            m = o.modifiers.new("tri", "TRIANGULATE"); apply_mod(o, m)
        report(op, triangles_before=before, triangles_after=tris())
    else:
        raise SystemExit(f"Unknown operation {op}")

if uv_changed:
    # New topology/UVs: give every mesh UVs so the texture can be transferred afterwards.
    for o in meshes:
        if not o.data.uv_layers:
            select_only(o); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
            bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003)
            bpy.ops.uv.select_all(action="SELECT"); bpy.ops.uv.pack_islands(rotate=True, margin=0.002); bpy.ops.object.mode_set(mode="OBJECT")
bpy.ops.object.select_all(action="SELECT")
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_apply=True)
print("REFINE_DONE " + json.dumps({"uv_changed": uv_changed, "triangles": tris()}))
