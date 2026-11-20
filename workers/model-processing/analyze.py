#!/usr/bin/env python3
"""Measure a GLB model: statistics + mesh integrity. All values are computed from the file.

Usage: analyze.py <model.glb>   -> JSON on stdout
"""
import json, sys, os
import numpy as np
import trimesh
sys.path.insert(0, os.path.dirname(__file__))
from glb import read_glb, images  # noqa: E402

MAP_KEYS = {"baseColorTexture": "base_color", "metallicRoughnessTexture": "metallic_roughness"}


def texture_roles(js):
    roles = {}
    for m in js.get("materials", []):
        pbr = m.get("pbrMetallicRoughness", {})
        for k, role in MAP_KEYS.items():
            if k in pbr: roles.setdefault(pbr[k]["index"], role)
        for k, role in (("normalTexture", "normal"), ("occlusionTexture", "occlusion"), ("emissiveTexture", "emissive")):
            if k in m: roles.setdefault(m[k]["index"], role)
    return roles


def main(path):
    js, binc = read_glb(path)
    meshes = js.get("meshes", [])
    prims = [p for m in meshes for p in m.get("primitives", [])]
    acc = js.get("accessors", [])
    vertices_file = sum(acc[p["attributes"]["POSITION"]]["count"] for p in prims if "POSITION" in p.get("attributes", {}))
    has = lambda attr: any(attr in p.get("attributes", {}) for p in prims)  # noqa: E731
    imgs = images(js, binc)
    roles = texture_roles(js)
    tex_src = {i: t.get("source") for i, t in enumerate(js.get("textures", []))}
    for ti, role in roles.items():
        src = tex_src.get(ti)
        if src is not None and src < len(imgs): imgs[src]["role"] = role
    skins = js.get("skins", [])

    scene = trimesh.load(path, force="scene", process=False)
    geoms = []
    for node in scene.graph.nodes_geometry:
        T, gname = scene.graph[node]
        g = scene.geometry[gname]
        if isinstance(g, trimesh.Trimesh) and len(g.faces):
            m = g.copy(); m.apply_transform(T); geoms.append(m)
    if not geoms:
        print(json.dumps({"error": "No triangle geometry found in file"})); return
    merged = trimesh.util.concatenate(geoms)
    lo, hi = merged.bounds
    triangles = int(len(merged.faces))

    # Integrity on a vertex-welded copy (UV seams split vertices in glTF; weld by position to evaluate topology).
    welded = merged.copy(); welded.merge_vertices(merge_tex=True, merge_norm=True)
    edges = welded.edges_sorted
    uniq, counts = np.unique(edges, axis=0, return_counts=True)
    boundary = int((counts == 1).sum()); nonmanifold = int((counts > 2).sum())
    areas = welded.area_faces
    degenerate = int((areas < 1e-12).sum())
    comps = welded.split(only_watertight=False)
    integrity = {
        "welded_vertices": int(len(welded.vertices)), "edges": int(len(uniq)), "boundary_edges": boundary, "non_manifold_edges": nonmanifold,
        "degenerate_faces": degenerate, "duplicate_faces": int(len(welded.faces) - len(np.unique(np.sort(welded.faces, axis=1), axis=0))),
        "watertight": bool(welded.is_watertight), "winding_consistent": bool(welded.is_winding_consistent),
        "components": int(len(comps)), "euler_number": int(welded.euler_number),
        "surface_area": float(welded.area), "volume": float(welded.volume) if welded.is_watertight else None,
    }
    stats = {
        "vertices": int(vertices_file), "triangles": triangles, "faces": triangles, "meshes": len(meshes), "primitives": len(prims),
        "materials": len(js.get("materials", [])), "textures": [{"name": i["name"], "width": i["width"], "height": i["height"], "mime": i["mime"], "role": i.get("role")} for i in imgs],
        "max_texture_resolution": max([i["width"] or 0 for i in imgs], default=0) or None,
        "has_uvs": has("TEXCOORD_0"), "has_normals": has("NORMAL"), "has_vertex_colors": has("COLOR_0"), "has_skin": bool(skins),
        "bone_count": sum(len(s.get("joints", [])) for s in skins), "animations": len(js.get("animations", [])),
        "animation_names": [a.get("name", f"anim_{i}") for i, a in enumerate(js.get("animations", []))],
        "bbox_min": [float(x) for x in lo], "bbox_max": [float(x) for x in hi], "dimensions": [float(x) for x in (hi - lo)],
        "unit": "m", "file_size": os.path.getsize(path), "format": "glb", "generator": js.get("asset", {}).get("generator"),
    }
    print(json.dumps({"stats": stats, "integrity": integrity}))


if __name__ == "__main__":
    main(sys.argv[1])
