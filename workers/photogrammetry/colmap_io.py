"""Read COLMAP TXT models (cameras.txt, images.txt, points3D.txt)."""
import numpy as np


def qvec2rotmat(q):
    w, x, y, z = q
    return np.array([
        [1 - 2 * y * y - 2 * z * z, 2 * x * y - 2 * w * z, 2 * x * z + 2 * w * y],
        [2 * x * y + 2 * w * z, 1 - 2 * x * x - 2 * z * z, 2 * y * z - 2 * w * x],
        [2 * x * z - 2 * w * y, 2 * y * z + 2 * w * x, 1 - 2 * x * x - 2 * y * y]])


def _lines(path):
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#"):
                yield line


def read_cameras(path):
    cams = {}
    for line in _lines(path):
        e = line.split()
        cid, model, w, h = int(e[0]), e[1], int(e[2]), int(e[3])
        p = [float(x) for x in e[4:]]
        if model == "PINHOLE":
            fx, fy, cx, cy, k = p[0], p[1], p[2], p[3], 0.0
        elif model in ("SIMPLE_RADIAL", "SIMPLE_PINHOLE", "RADIAL"):
            fx = fy = p[0]; cx, cy = p[1], p[2]; k = p[3] if len(p) > 3 else 0.0
        else:
            fx, fy, cx, cy, k = p[0], p[1], p[2], p[3], 0.0
        cams[cid] = {"model": model, "w": w, "h": h, "fx": fx, "fy": fy, "cx": cx, "cy": cy, "k": k,
                     "K": np.array([[fx, 0, cx], [0, fy, cy], [0, 0, 1.0]])}
    return cams


def read_images(path):
    imgs = {}
    it = iter(_lines(path))
    for line in it:
        e = line.split()
        iid = int(e[0]); q = [float(x) for x in e[1:5]]; t = np.array([float(x) for x in e[5:8]])
        cid = int(e[8]); name = " ".join(e[9:])
        pts = next(it).split()
        ids = np.array([int(pts[i + 2]) for i in range(0, len(pts), 3)], dtype=np.int64) if pts else np.zeros(0, np.int64)
        R = qvec2rotmat(q)
        imgs[iid] = {"id": iid, "name": name, "camera_id": cid, "R": R, "t": t, "center": -R.T @ t, "point_ids": ids[ids >= 0]}
    return imgs


def read_points(path):
    xyz, rgb, err, ids, track = [], [], [], [], []
    for line in _lines(path):
        e = line.split()
        ids.append(int(e[0])); xyz.append([float(x) for x in e[1:4]]); rgb.append([int(x) for x in e[4:7]])
        err.append(float(e[7])); track.append((len(e) - 8) // 2)
    return {"ids": np.array(ids, np.int64), "xyz": np.array(xyz).reshape(-1, 3), "rgb": np.array(rgb, np.uint8).reshape(-1, 3),
            "error": np.array(err), "track": np.array(track)}
