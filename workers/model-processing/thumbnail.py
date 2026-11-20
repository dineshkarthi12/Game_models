"""Render a model thumbnail (Blender Cycles CPU, transparent background).
blender -b --factory-startup -P thumbnail.py -- <model.glb> <out.png> [size] [view: iso|front|back|left|right|top]
"""
import bpy, sys, math, mathutils

args = sys.argv[sys.argv.index("--") + 1:]
src, out = args[0], args[1]
size = int(args[2]) if len(args) > 2 else 512
view = args[3] if len(args) > 3 else "iso"
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
pts = [o.matrix_world @ mathutils.Vector(c) for o in meshes for c in o.bound_box]
lo = mathutils.Vector([min(p[i] for p in pts) for i in range(3)]); hi = mathutils.Vector([max(p[i] for p in pts) for i in range(3)])
center = (lo + hi) / 2; radius = max((hi - lo).length / 2, 1e-6)

# Vertex-coloured meshes (e.g. photogrammetry) get a material that displays COLOR_0.
for o in meshes:
    if o.data.color_attributes and not any(s.material and s.material.use_nodes and any(n.type == "TEX_IMAGE" for n in s.material.node_tree.nodes) for s in o.material_slots):
        m = bpy.data.materials.new("vc"); m.use_nodes = True
        attr = m.node_tree.nodes.new("ShaderNodeVertexColor"); attr.layer_name = o.data.color_attributes[0].name
        m.node_tree.links.new(attr.outputs["Color"], m.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
        o.data.materials.clear(); o.data.materials.append(m)

scene = bpy.context.scene
scene.render.engine = "CYCLES"; scene.cycles.device = "CPU"; scene.cycles.samples = 24; scene.cycles.use_denoising = False
scene.render.resolution_x = scene.render.resolution_y = size; scene.render.film_transparent = True
scene.render.image_settings.file_format = "PNG"; scene.render.image_settings.color_mode = "RGBA"
world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.95, 0.95, 0.97, 1); world.node_tree.nodes["Background"].inputs[1].default_value = 0.9

dirs = {"iso": (0.9, -1.2, 0.7), "front": (0, -1, 0.05), "back": (0, 1, 0.05), "left": (-1, 0, 0.05), "right": (1, 0, 0.05), "top": (0.001, -0.001, 1)}
d = mathutils.Vector(dirs.get(view, dirs["iso"])).normalized()
cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 50; cam = bpy.data.objects.new("cam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
fov = 2 * math.atan(cam_data.sensor_width / (2 * cam_data.lens))
dist = radius / math.sin(fov / 2) * 1.08
cam.location = center + d * dist
cam.rotation_euler = (center - cam.location).to_track_quat("-Z", "Y").to_euler()
cam_data.clip_start = dist / 100; cam_data.clip_end = dist * 10
for loc, e in ((d * dist + mathutils.Vector((dist, -dist, dist)) * 0.5, 2.0), (mathutils.Vector((-dist, dist, dist)) * 0.6, 0.8)):
    ld = bpy.data.lights.new("l", "SUN"); ld.energy = e; lo_ = bpy.data.objects.new("l", ld); scene.collection.objects.link(lo_)
    lo_.rotation_euler = (center - (center + loc)).to_track_quat("-Z", "Y").to_euler()
scene.render.filepath = out
bpy.ops.render.render(write_still=True)
print("THUMB_OK")
