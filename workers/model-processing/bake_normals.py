#!/usr/bin/env python3
"""High-to-low tangent-space normal map bake (glTF / OpenGL convention, +Y = +V).

For each low-poly texel: position + interpolated normal on the low mesh, nearest point on a dense sampling of the
high-poly surface, high-poly face normal expressed in the low-poly's per-texel tangent frame (MikkTSpace-like
per-triangle tangents from UV derivatives, Gram-Schmidt orthogonalised against the interpolated normal).
Usage: bake_normals.py <high.glb> <low.glb> <out.glb> <size>   ->  prints NORMALS_OK <json stats>
"""
import sys, os, json
import numpy as np
import trimesh
from PIL import Image
from scipy.spatial import cKDTree
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "photogrammetry"))
from texture import rasterize_index, barycentric  # noqa: E402
import cv2  # noqa: E402


def main(high_p, low_p, out_p, size):
    high = trimesh.load(high_p, force="mesh", process=False)
    low = trimesh.load(low_p, force="mesh", process=False)
    if getattr(low.visual, "uv", None) is None:
        raise SystemExit("low-poly mesh has no UVs")
    n = min(4_000_000, max(300_000, len(high.faces) * 20))
    pts, fid = trimesh.sample.sample_surface(high, n, seed=2)
    hn = high.face_normals[fid]
    tree = cKDTree(pts)

    V = np.asarray(low.vertices, float); F = np.asarray(low.faces); UV = np.asarray(low.visual.uv, float)
    VN = np.asarray(low.vertex_normals, float)
    e1 = V[F[:, 1]] - V[F[:, 0]]; e2 = V[F[:, 2]] - V[F[:, 0]]
    d1 = UV[F[:, 1]] - UV[F[:, 0]]; d2 = UV[F[:, 2]] - UV[F[:, 0]]
    det = d1[:, 0] * d2[:, 1] - d2[:, 0] * d1[:, 1]; det = np.where(np.abs(det) < 1e-12, 1e-12, det)
    T = (e1 * d2[:, 1:2] - e2 * d1[:, 1:2]) / det[:, None]
    B = (e2 * d1[:, 0:1] - e1 * d2[:, 0:1]) / det[:, None]

    idx = rasterize_index(UV, F, size)
    ys, xs = np.nonzero(idx >= 0); tri = idx[ys, xs]
    uvp = np.stack([xs / (size - 1), 1 - ys / (size - 1)], 1)
    bc = barycentric(uvp, UV[F[tri, 0]], UV[F[tri, 1]], UV[F[tri, 2]])
    P = (bc[:, :, None] * V[F[tri]]).sum(1)
    N = (bc[:, :, None] * VN[F[tri]]).sum(1); N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-12)
    t = T[tri]; t = t - N * (t * N).sum(1, keepdims=True); t /= np.maximum(np.linalg.norm(t, axis=1, keepdims=True), 1e-12)
    handed = np.sign((np.cross(N, t) * B[tri]).sum(1)); handed[handed == 0] = 1
    b = np.cross(N, t) * handed[:, None]
    dist, nn = tree.query(P, k=4)
    w = 1.0 / np.maximum(dist, 1e-9); w /= w.sum(1, keepdims=True)
    nh = (hn[nn] * w[:, :, None]).sum(1); nh /= np.maximum(np.linalg.norm(nh, axis=1, keepdims=True), 1e-12)
    ts = np.stack([(nh * t).sum(1), (nh * b).sum(1), (nh * N).sum(1)], 1)
    ts[:, 2] = np.clip(ts[:, 2], 0.0, 1.0); ts /= np.maximum(np.linalg.norm(ts, axis=1, keepdims=True), 1e-12)
    img = np.zeros((size, size, 3), np.uint8); img[..., 0] = 128; img[..., 1] = 128; img[..., 2] = 255
    img[ys, xs] = np.clip((ts * 0.5 + 0.5) * 255, 0, 255).astype(np.uint8)
    mask = (idx >= 0).astype(np.uint8)
    for _ in range(8):
        dil = cv2.dilate(img, np.ones((3, 3), np.uint8)); md = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        g = (md > 0) & (mask == 0); img[g] = dil[g]; mask = md
    mat = low.visual.material
    pbr = trimesh.visual.material.PBRMaterial(
        name=getattr(mat, "name", None) or "Material",
        baseColorTexture=getattr(mat, "baseColorTexture", None),
        baseColorFactor=getattr(mat, "baseColorFactor", None),
        metallicFactor=getattr(mat, "metallicFactor", None) or 0.0,
        roughnessFactor=getattr(mat, "roughnessFactor", None) if getattr(mat, "roughnessFactor", None) is not None else 0.8,
        normalTexture=Image.fromarray(img))
    low.visual = trimesh.visual.TextureVisuals(uv=UV, material=pbr)
    low.export(out_p, include_normals=True)
    flat = float(np.mean(ts[:, 2]))
    print("NORMALS_OK " + json.dumps({"texels": int(len(P)), "mean_normal_z": round(flat, 4), "mean_distance": float(dist[:, 0].mean())}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]))
