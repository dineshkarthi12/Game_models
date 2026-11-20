#!/usr/bin/env python3
"""Quadric edge-collapse decimation that refuses collapses which flip faces (pymeshlab).
Usage: decimate.py <in.glb> <out.glb> <target_triangles|0> <ratio>  -> DECIMATE_OK <json>
Multiple meshes are merged into one. UVs are regenerated afterwards by the caller.
"""
import sys, json
import numpy as np
import trimesh
import pymeshlab


def main(src, out, target, ratio):
    m = trimesh.load(src, force="mesh", process=False)
    w = m.copy(); w.merge_vertices(merge_tex=True, merge_norm=True)
    before = len(w.faces)
    tgt = int(target) if int(target) > 0 else max(4, int(before * float(ratio)))
    ms = pymeshlab.MeshSet(); ms.add_mesh(pymeshlab.Mesh(vertex_matrix=np.asarray(w.vertices, float), face_matrix=np.asarray(w.faces)))
    if tgt < before:
        ms.meshing_decimation_quadric_edge_collapse(targetfacenum=tgt, preservenormal=True, preservetopology=True, preserveboundary=True,
                                                    optimalplacement=True, planarquadric=True, qualitythr=0.4, autoclean=True)
    cm = ms.current_mesh()
    r = trimesh.Trimesh(cm.vertex_matrix(), cm.face_matrix(), process=True)
    trimesh.repair.fix_winding(r); trimesh.repair.fix_normals(r)
    r.export(out, include_normals=True)
    print("DECIMATE_OK " + json.dumps({"op": "decimate", "triangles_before": before, "triangles_after": int(len(r.faces)), "winding_consistent": bool(r.is_winding_consistent)}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4])
