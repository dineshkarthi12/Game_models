#!/usr/bin/env python3
"""Collision mesh for game engines. convex: single convex hull; simplified: decimated convex hull (<= max_tris).
Usage: collision.py <in.glb> <out.glb> <convex|box> [max_tris]  -> COLLISION_OK <json>
"""
import sys, json
import trimesh
import pymeshlab


def main(src, out, kind, max_tris=128):
    m = trimesh.load(src, force="mesh", process=False)
    if kind == "box":
        hull = m.bounding_box_oriented.to_mesh() if hasattr(m.bounding_box_oriented, "to_mesh") else trimesh.Trimesh(*m.bounding_box_oriented.as_outline().vertices)
    else:
        hull = m.convex_hull
        if len(hull.faces) > max_tris:
            ms = pymeshlab.MeshSet(); ms.add_mesh(pymeshlab.Mesh(vertex_matrix=hull.vertices, face_matrix=hull.faces))
            ms.meshing_decimation_quadric_edge_collapse(targetfacenum=int(max_tris), preservetopology=True)
            c = ms.current_mesh(); hull = trimesh.Trimesh(c.vertex_matrix(), c.face_matrix()).convex_hull
    hull.export(out)
    print("COLLISION_OK " + json.dumps({"type": kind, "triangles": int(len(hull.faces)), "convex": bool(hull.is_convex), "volume": float(hull.volume)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]) if len(sys.argv) > 4 else 128)
