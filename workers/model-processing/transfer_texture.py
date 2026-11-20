#!/usr/bin/env python3
"""Transfer the base-colour texture from a source mesh to a target mesh with different topology/UVs.

For each target texel: 3D position (barycentric) -> nearest densely-sampled point on the source surface ->
that point's source UV -> bilinear sample of the source texture.
Usage: transfer_texture.py <source.glb> <target.glb> <out.glb> <size>
"""
import sys, os, io
import numpy as np
import trimesh
from PIL import Image
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "photogrammetry"))
from texture import rasterize_index, barycentric, bilinear  # noqa: E402
import cv2  # noqa: E402


def base_texture(mesh):
    mat = getattr(mesh.visual, "material", None)
    img = getattr(mat, "baseColorTexture", None) if mat is not None else None
    if img is None and mat is not None:
        img = getattr(mat, "image", None)
    return img, mat


def main(src, tgt, out, size):
    s = trimesh.load(src, force="mesh", process=False)
    t = trimesh.load(tgt, force="mesh", process=False)
    img, mat = base_texture(s)
    if img is None or getattr(s.visual, "uv", None) is None:
        # No source texture: drop any placeholder texture, keep UVs and a plain material.
        if hasattr(t.visual, "uv") and t.visual.uv is not None:
            col = getattr(mat, "baseColorFactor", None) if mat is not None else None
            t.visual = trimesh.visual.TextureVisuals(uv=t.visual.uv, material=trimesh.visual.material.PBRMaterial(name="Material", baseColorFactor=col if col is not None else [204, 204, 204, 255],
                                                     metallicFactor=getattr(mat, "metallicFactor", 0.0) or 0.0, roughnessFactor=getattr(mat, "roughnessFactor", 0.8) or 0.8))
        t.export(out, include_normals=True); print("TRANSFER_SKIPPED no source texture"); return
    tex = np.asarray(img.convert("RGB"))[:, :, ::-1]
    h, w = tex.shape[:2]
    n = min(3_000_000, max(200_000, len(s.faces) * 30))
    pts, fid = trimesh.sample.sample_surface(s, n, seed=1)
    bc = trimesh.triangles.points_to_barycentric(s.triangles[fid], pts)
    suv = (bc[:, :, None] * np.asarray(s.visual.uv)[s.faces[fid]]).sum(1)
    tree = cKDTree(pts)
    UV = np.asarray(t.visual.uv, float); V = np.asarray(t.vertices, float); F = np.asarray(t.faces)
    idx = rasterize_index(UV, F, size)
    ys, xs = np.nonzero(idx >= 0); tri = idx[ys, xs]
    uvp = np.stack([xs / (size - 1), 1 - ys / (size - 1)], 1)
    b2 = barycentric(uvp, UV[F[tri, 0]], UV[F[tri, 1]], UV[F[tri, 2]])
    P = (b2[:, :, None] * V[F[tri]]).sum(1)
    _, nn = tree.query(P, k=1)
    u = suv[nn, 0] * (w - 1); v = (1 - suv[nn, 1]) * (h - 1)
    col = bilinear(tex, u, v)
    outimg = np.zeros((size, size, 3), np.uint8); outimg[ys, xs] = np.clip(col, 0, 255).astype(np.uint8)
    mask = (idx >= 0).astype(np.uint8)
    if mask.any():
        outimg[mask == 0] = np.median(outimg[mask > 0], axis=0).astype(np.uint8)  # unused atlas space: neutral, not black
    for _ in range(8):
        dil = cv2.dilate(outimg, np.ones((3, 3), np.uint8)); md = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        g = (md > 0) & (mask == 0); outimg[g] = dil[g]; mask = md
    newmat = trimesh.visual.material.PBRMaterial(name=getattr(mat, "name", None) or "Material", baseColorTexture=Image.fromarray(outimg[:, :, ::-1]),
                                                metallicFactor=getattr(mat, "metallicFactor", 0.0) or 0.0, roughnessFactor=getattr(mat, "roughnessFactor", 0.8) or 0.8)
    t.visual = trimesh.visual.TextureVisuals(uv=UV, material=newmat)
    t.export(out, include_normals=True)
    print("TRANSFER_OK")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]))
