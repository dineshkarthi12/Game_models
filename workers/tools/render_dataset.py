"""Render a synthetic, fully-known multi-view photogrammetry dataset with Blender (Cycles, CPU).

Purpose: reproducible test data for the upload studio and the COLMAP pipeline. Because the scene is
synthetic, the true object dimensions are known (written to ground_truth.json) so scale calibration and
dimension validation can be checked against real values.

Usage:
  blender -b --factory-startup -P render_dataset.py -- <out_dir> [--views 36] [--size 1024] [--samples 12]
"""
import bpy, sys, math, json, os, argparse

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument("out")
ap.add_argument("--ring1", type=int, default=24)
ap.add_argument("--ring2", type=int, default=16)
ap.add_argument("--size", type=int, default=1024)
ap.add_argument("--samples", type=int, default=12)
a = ap.parse_args(argv)
os.makedirs(a.out, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
scene.cycles.samples = a.samples
scene.cycles.use_denoising = False
scene.render.resolution_x = a.size
scene.render.resolution_y = int(a.size * 0.75)
scene.render.image_settings.file_format = "JPEG"
scene.render.image_settings.quality = 92
scene.unit_settings.system = "METRIC"

world = bpy.data.worlds.new("w"); scene.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0.82, 0.83, 0.86, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.45

def textured_material(name, scale, hue_shift):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; bsdf = nt.nodes["Principled BSDF"]
    tex = nt.nodes.new("ShaderNodeTexVoronoi"); tex.inputs["Scale"].default_value = scale
    noise = nt.nodes.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = scale * 2.5; noise.inputs["Detail"].default_value = 8
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (0.05 + hue_shift * 0.2, 0.035, 0.02, 1)
    ramp.color_ramp.elements[1].color = (0.75, 0.55 - hue_shift * 0.6, 0.30 + hue_shift * 0.4, 1)
    mix = nt.nodes.new("ShaderNodeMix"); mix.data_type = "RGBA"; mix.inputs[0].default_value = 0.35
    nt.links.new(tex.outputs["Distance"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], mix.inputs[6])
    nt.links.new(noise.outputs["Color"], mix.inputs[7])
    nt.links.new(mix.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.85
    return m

# Object: an organic sculpture-like form (noise-displaced sphere on a column) — about 0.3 m wide.
bpy.ops.mesh.primitive_uv_sphere_add(radius=0.13, location=(0, 0, 0.36), segments=96, ring_count=48)
head = bpy.context.object; head.scale = (1.15, 0.85, 1.0)
ntex = bpy.data.textures.new("disp", type="CLOUDS"); ntex.noise_scale = 0.35
disp = head.modifiers.new("d", "DISPLACE"); disp.texture = ntex; disp.strength = 0.05
bpy.ops.object.shade_smooth()
head.data.materials.append(textured_material("head", 14, 0.0))
bpy.ops.mesh.primitive_cylinder_add(radius=0.09, depth=0.24, location=(0, 0, 0.12), vertices=48)
col = bpy.context.object; col.data.materials.append(textured_material("col", 22, 0.25))
# Textured turntable disc gives the matcher background features but stays below the object.
bpy.ops.mesh.primitive_cylinder_add(radius=0.42, depth=0.02, location=(0, 0, -0.01), vertices=96)
disc = bpy.context.object; disc.data.materials.append(textured_material("disc", 30, 0.45))

for loc, energy in [((2, -2, 3), 160), ((-2.5, -1, 2), 70), ((0, 3, 2.5), 70)]:
    bpy.ops.object.light_add(type="AREA", location=loc)
    L = bpy.context.object; L.data.energy = energy; L.data.size = 2.0
    L.rotation_euler = (0, 0, 0)
    c = L.constraints.new("TRACK_TO"); c.target = head; c.track_axis = "TRACK_NEGATIVE_Z"; c.up_axis = "UP_Y"

bpy.ops.object.camera_add(); cam = bpy.context.object; scene.camera = cam
cam.data.lens = 42; cam.data.sensor_width = 36
target = bpy.data.objects.new("target", None); scene.collection.objects.link(target); target.location = (0, 0, 0.3)
tc = cam.constraints.new("TRACK_TO"); tc.target = target; tc.track_axis = "TRACK_NEGATIVE_Z"; tc.up_axis = "UP_Y"

def angle_name(az):
    names = ["front", "front_right", "right", "back_right", "back", "back_left", "left", "front_left"]
    return names[int(((az + 22.5) % 360) // 45)]

shots = []
for ring, (n, elev, dist) in enumerate([(a.ring1, 14, 0.95), (a.ring2, 42, 0.90)]):
    for i in range(n):
        az = 360.0 * i / n
        r = math.radians(az); e = math.radians(elev)
        # Blender front view looks along +Y, so the "front" camera sits at -Y.
        cam.location = (dist * math.cos(e) * math.sin(r), -dist * math.cos(e) * math.cos(r), 0.3 + dist * math.sin(e))
        name = f"r{ring}_{i:02d}_{angle_name(az)}.jpg"
        scene.render.filepath = os.path.join(a.out, name)
        bpy.ops.render.render(write_still=True)
        shots.append({"file": name, "azimuth": az, "elevation": elev, "angle": angle_name(az)})
cam.location = (0.001, -0.05, 1.20); scene.render.filepath = os.path.join(a.out, "r2_00_top.jpg")
bpy.ops.render.render(write_still=True); shots.append({"file": "r2_00_top.jpg", "azimuth": 0, "elevation": 88, "angle": "top"})

bpy.context.view_layer.update()
def world_bbox(objs):
    import mathutils
    pts = [o.matrix_world @ mathutils.Vector(c) for o in objs for c in o.bound_box]
    return [min(p[i] for p in pts) for i in range(3)], [max(p[i] for p in pts) for i in range(3)]
lo, hi = world_bbox([head, col])
json.dump({"unit": "m", "object_bbox_min": lo, "object_bbox_max": hi,
           "object_dimensions": [hi[i] - lo[i] for i in range(3)],
           "turntable_diameter_m": 0.84, "focal_mm": 42, "sensor_width_mm": 36, "shots": shots},
          open(os.path.join(a.out, "ground_truth.json"), "w"), indent=2)
print("DONE", len(shots))
