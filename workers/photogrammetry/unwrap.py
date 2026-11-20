"""UV-unwrap a mesh with Blender (Smart UV Project) and export a GLB with UVs.
blender -b --factory-startup -P unwrap.py -- <in.ply> <out.glb>
"""
import bpy, sys, math
src, out = sys.argv[sys.argv.index("--") + 1:][:2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.wm.ply_import(filepath=src)
ob = bpy.context.selected_objects[0]; bpy.context.view_layer.objects.active = ob
bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.003)
bpy.ops.uv.select_all(action="SELECT")
bpy.ops.uv.pack_islands(rotate=True, margin=0.002)  # better texel usage than smart_project's default packing
bpy.ops.object.mode_set(mode="OBJECT")
# A tiny placeholder texture makes the exporter keep TEXCOORD_0 and readers expose UVs (replaced later).
img = bpy.data.images.new("uvholder", 4, 4); img.pack()
mat = bpy.data.materials.new("uv"); mat.use_nodes = True
t = mat.node_tree.nodes.new("ShaderNodeTexImage"); t.image = img
mat.node_tree.links.new(t.outputs["Color"], mat.node_tree.nodes["Principled BSDF"].inputs["Base Color"])
ob.data.materials.clear(); ob.data.materials.append(mat)
bpy.ops.export_scene.gltf(filepath=out, export_format="GLB", export_yup=True, export_apply=True, export_colors=False, export_normals=False)
print("UNWRAP_OK")
