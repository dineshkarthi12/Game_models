"""Photo-projection texturing.

For every texel of a UV-unwrapped mesh: compute its 3D position and normal, project it into each registered
(undistorted, pinhole) photograph, reject views that are occluded (per-camera depth buffer rendered from the
mesh) or grazing, and blend the sampled colours weighted by how frontally each camera sees the surface.
Texels seen by no camera fall back to interpolated vertex colours. Gutters are dilated to avoid seams.
"""
import numpy as np
import cv2


def rasterize_index(UV, F, size):
    """Map each texel to the triangle covering it (or -1)."""
    idx = np.full((size, size), -1, np.int32)
    pts = np.round(np.stack([UV[F][:, :, 0] * (size - 1), (1 - UV[F][:, :, 1]) * (size - 1)], -1) * 16).astype(np.int32)
    for t in range(len(F)):
        cv2.fillConvexPoly(idx, pts[t], int(t), lineType=cv2.LINE_8, shift=4)
    return idx


def barycentric(p, a, b, c):
    v0, v1, v2 = b - a, c - a, p - a
    d00 = (v0 * v0).sum(1); d01 = (v0 * v1).sum(1); d11 = (v1 * v1).sum(1); d20 = (v2 * v0).sum(1); d21 = (v2 * v1).sum(1)
    den = d00 * d11 - d01 * d01; den[np.abs(den) < 1e-20] = 1e-20
    v = (d11 * d20 - d01 * d21) / den; w = (d00 * d21 - d01 * d20) / den
    return np.clip(np.stack([1 - v - w, v, w], 1), 0, 1)


def bilinear(img, u, v):
    """Bilinear sample an HxWx3 image at float pixel coordinates (vectorised, any length)."""
    h, w = img.shape[:2]
    x0 = np.clip(np.floor(u).astype(np.int64), 0, w - 2); y0 = np.clip(np.floor(v).astype(np.int64), 0, h - 2)
    fx = (u - x0)[:, None]; fy = (v - y0)[:, None]
    a = img[y0, x0].astype(np.float32); b = img[y0, x0 + 1].astype(np.float32)
    c = img[y0 + 1, x0].astype(np.float32); d = img[y0 + 1, x0 + 1].astype(np.float32)
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def depth_buffer(Vc, F, K, w, h, scale):
    """Render a per-camera depth map of the mesh (camera coords), at reduced resolution."""
    W, H = max(1, int(w * scale)), max(1, int(h * scale))
    z = Vc[:, 2]
    u = (K[0, 0] * Vc[:, 0] / np.maximum(z, 1e-9) + K[0, 2]) * scale
    v = (K[1, 1] * Vc[:, 1] / np.maximum(z, 1e-9) + K[1, 2]) * scale
    zb = np.full((H, W), np.inf, np.float32)
    good = (z[F] > 1e-6).all(1)
    tri_z = z[F].max(1)
    order = np.argsort(-tri_z)  # far to near (painter's algorithm)
    pts = np.round(np.stack([u[F], v[F]], -1) * 16).astype(np.int32)
    for t in order:
        if not good[t]:
            continue
        p = pts[t]
        if (p[:, 0] < 0).all() or (p[:, 1] < 0).all() or (p[:, 0] >= W * 16).all() or (p[:, 1] >= H * 16).all():
            continue
        cv2.fillConvexPoly(zb, p, float(z[F[t]].min()), lineType=cv2.LINE_8, shift=4)
    return zb


def texture(V, F, UV, VC, cameras, size=2048, depth_scale=0.25):
    """V: (n,3) world-frame vertices. cameras: list of dict(K, R, t, w, h, image) with x_cam = R @ X + t."""
    idx = rasterize_index(UV, F, size)
    ys, xs = np.nonzero(idx >= 0)
    tri = idx[ys, xs]
    uvp = np.stack([xs / (size - 1), 1 - ys / (size - 1)], 1)
    bc = barycentric(uvp, UV[F[tri, 0]], UV[F[tri, 1]], UV[F[tri, 2]])
    P = (bc[:, :, None] * V[F[tri]]).sum(1)
    fn = np.cross(V[F[:, 1]] - V[F[:, 0]], V[F[:, 2]] - V[F[:, 0]])
    fn /= np.maximum(np.linalg.norm(fn, axis=1, keepdims=True), 1e-20)
    N = fn[tri]
    acc = np.zeros((len(P), 3)); wsum = np.zeros(len(P))
    for cam in cameras:
        K, R, t = cam["K"], cam["R"], cam["t"]
        img = cam["image"]; h, w = img.shape[:2]
        Pc = P @ R.T + t
        z = Pc[:, 2]
        front = z > 1e-6
        u = K[0, 0] * Pc[:, 0] / np.where(front, z, 1) + K[0, 2]
        v = K[1, 1] * Pc[:, 1] / np.where(front, z, 1) + K[1, 2]
        inb = front & (u >= 0) & (u < w - 1) & (v >= 0) & (v < h - 1)
        center = -R.T @ t
        d = center - P; d /= np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-20)
        facing = (N * d).sum(1)
        ok = inb & (facing > 0.25)
        if not ok.any():
            continue
        zb = depth_buffer(V @ R.T + t, F, K, w, h, depth_scale)
        zb = cv2.erode(zb, np.ones((3, 3), np.uint8)) if np.isfinite(zb).any() else zb
        ui = np.clip((u * depth_scale).astype(int), 0, zb.shape[1] - 1); vi = np.clip((v * depth_scale).astype(int), 0, zb.shape[0] - 1)
        zv = zb[vi, ui]
        vis = ok & np.where(np.isfinite(zv), z <= zv * 1.01 + 1e-9, False)
        if not vis.any():
            continue
        col = bilinear(img, u[vis], v[vis])[:, ::-1]
        wt = facing[vis] ** 4
        acc[vis] += col * wt[:, None]; wsum[vis] += wt
    out = np.zeros((size, size, 3), np.float32)
    seen = wsum > 0
    out[ys[seen], xs[seen]] = acc[seen] / wsum[seen, None]
    # Fallback for texels no photo sees: interpolated vertex colours.
    vc = (bc[:, :, None] * VC[F[tri]].astype(np.float32)).sum(1)
    out[ys[~seen], xs[~seen]] = vc[~seen]
    img = np.clip(out, 0, 255).astype(np.uint8)
    mask = (idx >= 0).astype(np.uint8)
    if seen.any():
        img[mask == 0] = np.median(img[mask > 0], axis=0).astype(np.uint8)  # unused atlas space: neutral, not black
    # Dilate into gutters so mip-mapping and bilinear filtering do not bleed black.
    for _ in range(8):
        dil = cv2.dilate(img, np.ones((3, 3), np.uint8)); mdil = cv2.dilate(mask, np.ones((3, 3), np.uint8))
        grow = (mdil > 0) & (mask == 0); img[grow] = dil[grow]; mask = mdil
    return img, {"texels": int(len(P)), "photo_coverage": float(seen.mean()) if len(P) else 0.0}
