"""Export a model (and optional LODs / collision mesh) to professional formats with Blender's native exporters.

blender -b --factory-startup -P export.py -- <config.json>
config: { out_dir, name, main: glb, lods: [{level, path}], collision: glb|null, formats: [...], preset,
          settings: {scale, units, up_axis, forward_axis, texture_resolution, include_*, triangulate} }
Writes files into out_dir/<Format>/ and prints EXPORTED <json> per file.
"""
import bpy, sys, os, json, re

cfg = json.load(open(sys.argv[sys.argv.index("--") + 1]))
S = cfg["settings"]; name = re.sub(r"[^A-Za-z0-9_]+", "_", cfg["name"]).strip("_") or "Model"
out_dir = cfg["out_dir"]; os.makedirs(out_dir, exist_ok=True)
UNIT = {"m": 1.0, "cm": 100.0, "mm": 1000.0}[S.get("units", "m")]
TEX = {"original": 0, "1k": 1024, "2k": 2048, "4k": 4096}[S.get("texture_resolution", "original")]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = "METRIC"; scene.unit_settings.scale_length = 1.0


def import_glb(path, prefix):
    before = set(bpy.data.objects)
    bpy.ops.import_scene.gltf(filepath=path)
    new = [o for o in bpy.data.objects if o not in before]
    meshes = [o for o in new if o.type == "MESH"]
    for i, o in enumerate(meshes):
        o.name = prefix if len(meshes) == 1 else f"{prefix}_{i:02d}"
        o.data.name = o.name
    return new, meshes


main_objs, main_meshes = import_glb(cfg["main"], name)
lod_objs = []
for lod in cfg.get("lods", []):
    objs, ms = import_glb(lod["path"], f"{name}_LOD{lod['level']}")
    lod_objs += objs
col_objs = []
if cfg.get("collision") and S.get("include_collision"):
    objs, ms = import_glb(cfg["collision"], f"UCX_{name}" if cfg.get("preset") == "unreal" else f"{name}_collision")
    for o in ms:
        o.data.materials.clear()
        if cfg.get("preset") == "unreal": o.name = f"UCX_{name}_00"
    col_objs += objs

all_mesh = [o for o in bpy.data.objects if o.type == "MESH"]
# User scale, applied to geometry so every format sees it.
if float(S.get("scale", 1.0)) != 1.0:
    for o in bpy.data.objects:
        if o.parent is None: o.scale = [c * float(S["scale"]) for c in o.scale]
    bpy.ops.object.select_all(action="SELECT"); bpy.ops.object.transform_apply(location=True, rotation=False, scale=True)
if S.get("triangulate"):
    for o in all_mesh:
        m = o.modifiers.new("tri", "TRIANGULATE"); bpy.context.view_layer.objects.active = o; bpy.ops.object.select_all(action="DESELECT"); o.select_set(True)
        bpy.ops.object.modifier_apply(modifier=m.name)
# Texture resolution cap.
if TEX:
    for img in bpy.data.images:
        if img.size[0] > TEX or img.size[1] > TEX:
            img.scale(min(TEX, img.size[0]), min(TEX, img.size[1]))
if not S.get("include_materials", True):
    for o in all_mesh: o.data.materials.clear()
# Packed textures (from GLB) have no file path: write them once to <out>/Textures and reference them relatively.
tex_dir = os.path.join(out_dir, "Textures"); used_names = set()
if S.get("include_textures", True):
    os.makedirs(tex_dir, exist_ok=True)
    for img in bpy.data.images:
        if not img.users or img.size[0] == 0: continue
        role = "Texture"; owner = name
        for o in all_mesh:
            if any(sl.material and sl.material.use_nodes and any(n.type == "TEX_IMAGE" and n.image == img for n in sl.material.node_tree.nodes) for sl in o.material_slots):
                owner = o.name; break
        for mat in bpy.data.materials:
            if not mat.use_nodes: continue
            for n in mat.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image == img:
                    for l in n.outputs["Color"].links:
                        sock = l.to_socket.name; tgt = l.to_node
                        role = "BaseColor" if sock == "Base Color" else "Normal" if tgt.type == "NORMAL_MAP" else "Roughness" if "Rough" in sock else "Metallic" if "Metal" in sock else role
        base = f"{owner}_{role}"; fn = base; k = 1
        while fn in used_names: k += 1; fn = f"{base}_{k}"
        used_names.add(fn)
        path = os.path.join(tex_dir, fn + ".png")
        img.filepath_raw = path; img.file_format = "PNG"; img.save()
        img.filepath = path
        if img.packed_file: img.unpack(method="REMOVE")

AX = {"Y": "Y", "Z": "Z", "-Z": "-Z", "X": "X", "-X": "-X", "-Y": "-Y"}
up = AX.get(S.get("up_axis", "Y"), "Y"); fwd = AX.get(S.get("forward_axis", "-Z"), "-Z")
if fwd.lstrip("-") == up.lstrip("-"): fwd = "-Z" if up != "Z" else "Y"


def select(objs):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs: o.select_set(True)
    if objs: bpy.context.view_layer.objects.active = objs[0]


def report(fmt, path, objects):
    print("EXPORTED " + json.dumps({"format": fmt, "path": path, "objects": [o.name for o in objects if o.type == "MESH"]}), flush=True)


def groups_for(fmt):
    # Unreal reads UCX_ collision from the same FBX; every other format gets a separate collision file.
    in_fbx = cfg.get("preset") == "unreal" and fmt == "fbx"
    g = [("main", main_objs + (col_objs if in_fbx else []))]
    g += [(f"LOD{l['level']}", [o for o in lod_objs if o.name.startswith(f"{name}_LOD{l['level']}")]) for l in cfg.get("lods", [])]
    if col_objs and not in_fbx: g.append(("collision", col_objs))
    return g


for fmt in [f for f in cfg["formats"] if f not in ("usd", "usdz")]:  # USD is written with Pixar's pxr (usd_export.py)
    d = os.path.join(out_dir, fmt.upper()); os.makedirs(d, exist_ok=True)
    for gname, objs in groups_for(fmt):
        if fmt == "stl":  # 3D-printing format: never include collision shapes
            objs = [o for o in objs if not (o.name.startswith("UCX_") or o.name.endswith("_collision"))]
            if gname == "collision": continue
        if not objs: continue
        base = name if gname == "main" else (f"{name}_{gname}" if gname != "collision" else f"{name}_collision")
        select(objs)
        tex_ok = S.get("include_textures", True)
        if fmt == "fbx":
            p = os.path.join(d, base + ".fbx")
            bpy.ops.export_scene.fbx(filepath=p, use_selection=True, global_scale=1.0, apply_unit_scale=True,
                apply_scale_options="FBX_SCALE_UNITS" if cfg.get("preset") == "unity" else "FBX_SCALE_NONE",
                bake_space_transform=cfg.get("preset") == "unity", axis_forward=fwd, axis_up=up, object_types={"MESH", "ARMATURE", "EMPTY"},
                use_mesh_modifiers=True, mesh_smooth_type="FACE", add_leaf_bones=False, bake_anim=bool(S.get("include_animation", True)),
                path_mode="RELATIVE" if tex_ok else "STRIP", embed_textures=False, use_tspace=True)
            # FBX scene unit: scale_length=1 → centimetre-based UnitScaleFactor, which Unreal/Maya convert correctly.
        elif fmt in ("glb", "gltf"):
            p = os.path.join(d, base + (".glb" if fmt == "glb" else ".gltf"))
            kw = dict(filepath=p, use_selection=True, export_format="GLB" if fmt == "glb" else "GLTF_SEPARATE", export_yup=True,
                      export_texcoords=S.get("include_uvs", True), export_normals=S.get("include_normals", True),
                      export_materials="EXPORT" if S.get("include_materials", True) else "NONE", export_animations=bool(S.get("include_animation", True)),
                      export_skins=bool(S.get("include_skeleton", True)), export_image_format="AUTO" if tex_ok else "NONE")
            if fmt == "gltf": kw["export_texture_dir"] = "textures"
            bpy.ops.export_scene.gltf(**kw)
        elif fmt == "obj":
            p = os.path.join(d, base + ".obj")
            bpy.ops.wm.obj_export(filepath=p, export_selected_objects=True, global_scale=UNIT, forward_axis=fwd.replace("-", "NEGATIVE_") if "-" in fwd else fwd,
                up_axis=up.replace("-", "NEGATIVE_") if "-" in up else up, export_uv=S.get("include_uvs", True), export_normals=S.get("include_normals", True),
                export_materials=S.get("include_materials", True), path_mode="RELATIVE" if tex_ok else "STRIP", export_triangulated_mesh=bool(S.get("triangulate")))
        elif fmt == "stl":
            p = os.path.join(d, base + ".stl")
            bpy.ops.export_mesh.stl(filepath=p, use_selection=True, global_scale=UNIT, ascii=False, axis_forward=fwd, axis_up=up, use_mesh_modifiers=True)
        else:
            raise SystemExit(f"unsupported format {fmt}")
        report(fmt, p, objs)
print("EXPORT_DONE")
