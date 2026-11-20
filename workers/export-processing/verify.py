"""Re-import an exported file in a fresh Blender session and report what it contains.
blender -b --factory-startup -P verify.py -- <file>   ->  VERIFY <json>
"""
import bpy, sys, json, os
p = sys.argv[sys.argv.index("--") + 1]
ext = os.path.splitext(p)[1].lower()
bpy.ops.wm.read_factory_settings(use_empty=True)
try:
    if ext == ".fbx": bpy.ops.import_scene.fbx(filepath=p)
    elif ext in (".glb", ".gltf"): bpy.ops.import_scene.gltf(filepath=p)
    elif ext == ".obj": bpy.ops.wm.obj_import(filepath=p)
    elif ext in (".usd", ".usdc", ".usda", ".usdz"): bpy.ops.wm.usd_import(filepath=p)
    elif ext == ".stl": bpy.ops.import_mesh.stl(filepath=p)
    else: raise RuntimeError("unknown extension")
    dg = bpy.context.evaluated_depsgraph_get(); tris = 0; meshes = 0; uv = 0
    for o in bpy.context.scene.objects:
        if o.type != "MESH": continue
        meshes += 1; me = o.evaluated_get(dg).data; me.calc_loop_triangles()
        if not (o.name.startswith("UCX_") or o.name.endswith("_collision")): tris += len(me.loop_triangles)
        uv += 1 if me.uv_layers else 0
    lo = [float("inf")] * 3; hi = [float("-inf")] * 3
    import mathutils
    for o in bpy.context.scene.objects:
        if o.type != "MESH" or o.name.startswith("UCX_"): continue
        for c in o.bound_box:
            w = o.matrix_world @ mathutils.Vector(c)
            for i in range(3): lo[i] = min(lo[i], w[i]); hi[i] = max(hi[i], w[i])
    print("VERIFY " + json.dumps({"ok": meshes > 0, "meshes": meshes, "triangles": tris, "meshes_with_uv": uv,
        "materials": len([m for m in bpy.data.materials if m.users]), "images": len([i for i in bpy.data.images if i.users and i.size[0] > 0]),
        "armatures": len([o for o in bpy.context.scene.objects if o.type == "ARMATURE"]), "dimensions_blender": [round(hi[i] - lo[i], 6) for i in range(3)] if meshes and lo[0] != float("inf") else None}))
except Exception as e:  # noqa: BLE001
    print("VERIFY " + json.dumps({"ok": False, "error": str(e)}))
