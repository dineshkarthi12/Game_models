"""Procedural DEMO model (Blender). NOT a reconstruction — geometry depends only on the category.

blender -b --factory-startup -P demo_model.py -- <out.glb> <category> <target_tris> <texture_px|0>
"""
import bpy, bmesh, sys, math, random

out, category, target, tex = sys.argv[sys.argv.index("--") + 1:][:4]
target = int(target); tex = int(tex)
bpy.ops.wm.read_factory_settings(use_empty=True)
random.seed(42)

def lathe(profile, segs=48, name="body"):
    bm = bmesh.new(); rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * i / segs), r * math.sin(2 * math.pi * i / segs), z)) for i in range(segs)])
    for a, b in zip(rings, rings[1:]):
        for i in range(segs):
            bm.faces.new((a[i], a[(i + 1) % segs], b[(i + 1) % segs], b[i]))
    bm.faces.new(list(reversed(rings[0]))); bm.faces.new(rings[-1])
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob); return ob

def box(name, size, loc, bevel=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); ob = bpy.context.object; ob.name = name; ob.scale = size
    bpy.ops.object.transform_apply(scale=True)
    if bevel:
        m = ob.modifiers.new("b", "BEVEL"); m.width = bevel; m.segments = 3
    return ob

def cyl(name, r, d, loc, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=d, location=loc, rotation=rot, vertices=32); ob = bpy.context.object; ob.name = name; return ob

objs = []
if category in ("vehicle",):
    objs.append(box("Body", (1.8, 0.8, 0.45), (0, 0, 0.55), 0.08)); objs.append(box("Cabin", (0.9, 0.7, 0.35), (-0.1, 0, 0.95), 0.08))
    for x in (-0.6, 0.6):
        for y in (-0.42, 0.42): objs.append(cyl("Wheel", 0.22, 0.14, (x, y, 0.24), (math.pi / 2, 0, 0)))
elif category in ("furniture",):
    objs.append(box("Seat", (0.5, 0.5, 0.06), (0, 0, 0.45), 0.01)); objs.append(box("Back", (0.5, 0.05, 0.5), (0, 0.225, 0.75), 0.01))
    for x in (-0.21, 0.21):
        for y in (-0.21, 0.21): objs.append(box("Leg", (0.05, 0.05, 0.42), (x, y, 0.21)))
elif category in ("building", "environment"):
    objs.append(box("Walls", (2, 1.6, 1.4), (0, 0, 0.7)))
    bpy.ops.mesh.primitive_cone_add(vertices=4, radius1=1.6, depth=0.8, location=(0, 0, 1.8), rotation=(0, 0, math.pi / 4)); r = bpy.context.object; r.name = "Roof"; r.scale = (1.0, 0.8, 1); objs.append(r)
else:
    objs.append(lathe([(0.45, 0), (0.45, 0.08), (0.32, 0.14), (0.22, 0.4), (0.18, 0.7), (0.26, 0.95), (0.32, 1.15), (0.24, 1.32), (0.12, 1.42), (0.02, 1.45)], 48, "Sculpture"))

# Approach the triangle budget: subdivide then decimate.
for ob in objs:
    bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
def tri_count():
    dg = bpy.context.evaluated_depsgraph_get()
    return sum(len(o.evaluated_get(dg).data.loop_triangles) or (o.evaluated_get(dg).data.calc_loop_triangles() or len(o.evaluated_get(dg).data.loop_triangles)) for o in objs)
for _ in range(4):
    if tri_count() * 4 > target: break
    for ob in objs:
        m = ob.modifiers.new("sub", "SUBSURF"); m.levels = 1; m.subdivision_type = "SIMPLE"
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier="sub")
tc = tri_count()
if tc > target:
    for ob in objs:
        m = ob.modifiers.new("dec", "DECIMATE"); m.ratio = max(0.01, target / tc)
        bpy.context.view_layer.objects.active = ob; bpy.ops.object.modifier_apply(modifier="dec")

mat = bpy.data.materials.new("DemoMaterial"); mat.use_nodes = True
bsdf = mat.node_tree.nodes["Principled BSDF"]; bsdf.inputs["Roughness"].default_value = 0.7; bsdf.inputs["Metallic"].default_value = 0.0
if tex:
    img = bpy.data.images.new("demo_basecolor", tex, tex); px = [0.0] * (tex * tex * 4)
    for y in range(tex):
        for x in range(tex):
            c = ((x * 8 // tex) + (y * 8 // tex)) % 2
            g = 0.55 + 0.25 * c + 0.05 * math.sin(x * 0.05) * math.cos(y * 0.07)
            i = (y * tex + x) * 4; px[i:i + 4] = [g * 0.95, g * 0.82, g * 0.62, 1.0]
    img.pixels = px; img.filepath_raw = "//demo_basecolor.png"; img.file_format = "PNG"; img.pack()
    node = mat.node_tree.nodes.new("ShaderNodeTexImage"); node.image = img
    mat.node_tree.links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
else:
    bsdf.inputs["Base Color"].default_value = (0.8, 0.72, 0.6, 1)

for ob in objs:
    ob.data.materials.clear(); ob.data.materials.append(mat)
    bpy.ops.object.select_all(action="DESELECT"); ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.02); bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.shade_smooth() if ob.name.startswith("Sculpture") else None

bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_apply=True)
print("DEMO_OK", tri_count())
