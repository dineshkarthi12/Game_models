#!/usr/bin/env python3
"""Vistora 3D photogrammetry pipeline.

COLMAP Structure-from-Motion  ->  dense points  ->  mesh  ->  texture  ->  scale  ->  GLB

Dense stage:
  * CUDA available : COLMAP patch_match_stereo + stereo_fusion           (dense_mode = "colmap_patch_match")
  * CPU only       : OpenCV semi-global matching on rectified neighbour  (dense_mode = "cpu_sgbm_fusion")
                     pairs using COLMAP's camera poses, fused with a
                     multi-view support filter.
Meshing: screened Poisson (pymeshlab), trimmed to the support of the dense cloud.

Usage: pipeline.py <config.json>     Emits JSON lines on stdout: {"event": "stage"|"metrics"|"warning"|"result"|"error", ...}
"""
import json, math, os, shutil, subprocess, sys, time, warnings
warnings.filterwarnings("ignore")
import numpy as np
import cv2
import trimesh
import pymeshlab
from scipy.spatial import cKDTree

sys.path.insert(0, os.path.dirname(__file__))
from colmap_io import read_cameras, read_images, read_points  # noqa: E402

LOG = None
FACE_TARGET = {"draft": 30000, "standard": 80000, "high": 200000, "ultra": 400000}
POISSON_DEPTH = {"draft": 8, "standard": 9, "high": 10, "ultra": 10}
SGBM_SIZE = {"draft": 640, "standard": 900, "high": 1200, "ultra": 1600}


class PipelineError(Exception):
    pass


def emit(**k):
    print(json.dumps(k, default=lambda o: o.tolist() if hasattr(o, "tolist") else str(o)), flush=True)


def stage(name, message):
    emit(event="stage", stage=name, message=message)


def log(msg):
    with open(LOG, "a") as f:
        f.write(msg + "\n")


def run(cmd, what, hint=None):
    log("$ " + " ".join(cmd))
    t = time.time()
    with open(LOG, "a") as lf:
        p = subprocess.run(cmd, stdout=lf, stderr=subprocess.STDOUT)
    log(f"# exit {p.returncode} in {time.time() - t:.1f}s")
    if p.returncode != 0:
        raise PipelineError(hint or f"{what} failed (COLMAP exit code {p.returncode}). See the processing log for details.")


def load_model(colmap, model_dir, txt_dir):
    os.makedirs(txt_dir, exist_ok=True)
    run([colmap, "model_converter", "--input_path", model_dir, "--output_path", txt_dir, "--output_type", "TXT"], "Model conversion")
    return read_cameras(f"{txt_dir}/cameras.txt"), read_images(f"{txt_dir}/images.txt"), read_points(f"{txt_dir}/points3D.txt")


# ───────────────────────── dense (CPU) ─────────────────────────
def view_dir(img):
    return img["R"].T @ np.array([0.0, 0.0, 1.0])


def pick_neighbours(imgs, k=2):
    ids = list(imgs)
    sets = {i: set(imgs[i]["point_ids"].tolist()) for i in ids}
    out = {}
    for i in ids:
        cand = []
        for j in ids:
            if i == j:
                continue
            shared = len(sets[i] & sets[j])
            if shared < 30:
                continue
            ang = math.degrees(math.acos(np.clip(view_dir(imgs[i]) @ view_dir(imgs[j]), -1, 1)))
            if not 4 <= ang <= 40:
                continue
            cand.append((shared * math.exp(-((ang - 15) / 12) ** 2), j))
        out[i] = [j for _, j in sorted(cand, reverse=True)[:k]]
    return out


def depth_range(img, pts_by_id):
    ids = [p for p in img["point_ids"].tolist() if p in pts_by_id]
    if len(ids) < 10:
        return None
    X = np.array([pts_by_id[p] for p in ids])
    z = (img["R"] @ X.T).T[:, 2] + img["t"][2]
    z = z[z > 0]
    if len(z) < 10:
        return None
    return float(np.percentile(z, 2)) * 0.85, float(np.percentile(z, 98)) * 1.15


def cpu_dense(dense_dir, cams, imgs, pts, quality):
    pts_by_id = {int(i): x for i, x in zip(pts["ids"], pts["xyz"])}
    nbrs = pick_neighbours(imgs)
    target = SGBM_SIZE.get(quality, 900)
    P, C, S, CAMS = [], [], [], []
    done_pairs = set(); pair_no = 0
    for i, js in nbrs.items():
        for j in js:
            key = tuple(sorted((i, j)))
            if key in done_pairs:
                continue
            done_pairs.add(key)
            rect = None
            for a, b in ((imgs[i], imgs[j]), (imgs[j], imgs[i])):
                ca, cb = cams[a["camera_id"]], cams[b["camera_id"]]
                if (ca["w"], ca["h"]) != (cb["w"], cb["h"]):
                    break
                s = target / max(ca["w"], ca["h"])
                size = (int(round(ca["w"] * s)), int(round(ca["h"] * s)))
                Ka = ca["K"].copy(); Kb = cb["K"].copy(); Ka[:2] *= s; Kb[:2] *= s
                Rrel = b["R"] @ a["R"].T; Trel = b["t"] - Rrel @ a["t"]
                R1, R2, P1, P2, Q, _, _ = cv2.stereoRectify(Ka, np.zeros(5), Kb, np.zeros(5), size, Rrel.astype(np.float64), Trel.reshape(3, 1).astype(np.float64), flags=cv2.CALIB_ZERO_DISPARITY, alpha=1)
                if abs(P2[1, 3]) > abs(P2[0, 3]):
                    break  # vertical baseline: SGBM needs horizontal disparity
                if P2[0, 3] < 0:  # b is to the right of a: standard left/right order
                    rect = (a, b, size, Ka, Kb, R1, R2, P1, P2, Q)
                    break
            if rect is None:
                continue
            a, b, size, Ka, Kb, R1, R2, P1, P2, Q = rect
            rng = depth_range(a, pts_by_id)
            if rng is None:
                continue
            ia = cv2.resize(cv2.imread(os.path.join(dense_dir, "images", a["name"])), size, interpolation=cv2.INTER_AREA)
            ib = cv2.resize(cv2.imread(os.path.join(dense_dir, "images", b["name"])), size, interpolation=cv2.INTER_AREA)
            m1 = cv2.initUndistortRectifyMap(Ka, np.zeros(5), R1, P1, size, cv2.CV_32FC1)
            m2 = cv2.initUndistortRectifyMap(Kb, np.zeros(5), R2, P2, size, cv2.CV_32FC1)
            ra = cv2.remap(ia, *m1, cv2.INTER_LINEAR); rb = cv2.remap(ib, *m2, cv2.INTER_LINEAR)
            f = P1[0, 0]; B = abs(P2[0, 3] / P2[0, 0])
            dmin = f * B / rng[1]; dmax = f * B / rng[0]
            mind = max(0, int(math.floor(dmin)) - 2)
            num = int(math.ceil((dmax - mind + 4) / 16.0)) * 16
            num = max(16, min(num, 320))
            sgbm = cv2.StereoSGBM_create(minDisparity=mind, numDisparities=num, blockSize=5, P1=8 * 3 * 25, P2=32 * 3 * 25,
                                         disp12MaxDiff=1, uniquenessRatio=12, speckleWindowSize=100, speckleRange=2, mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY)
            ga, gb = cv2.cvtColor(ra, cv2.COLOR_BGR2GRAY), cv2.cvtColor(rb, cv2.COLOR_BGR2GRAY)
            disp = sgbm.compute(ga, gb).astype(np.float32) / 16.0
            # Left-right consistency check.
            sgbm_r = cv2.StereoSGBM_create(minDisparity=-(mind + num), numDisparities=num, blockSize=5, P1=8 * 3 * 25, P2=32 * 3 * 25,
                                           disp12MaxDiff=1, uniquenessRatio=12, speckleWindowSize=100, speckleRange=2, mode=cv2.STEREO_SGBM_MODE_SGBM_3WAY)
            disp_r = -sgbm_r.compute(gb, ga).astype(np.float32) / 16.0
            h, w = disp.shape
            xs = np.arange(w)[None, :].repeat(h, 0)
            xr = np.clip(np.round(xs - disp).astype(int), 0, w - 1)
            lr = np.abs(disp - disp_r[np.arange(h)[:, None], xr]) <= 1.0
            valid = (disp > mind + 0.5) & lr
            # Texture-less pixels (plain backgrounds) give unreliable matches.
            tex = cv2.Laplacian(ga, cv2.CV_32F, ksize=3)
            valid &= cv2.blur(np.abs(tex), (7, 7)) > 2.0
            X = cv2.reprojectImageTo3D(disp, Q)
            stride = 2
            sel = np.zeros_like(valid); sel[::stride, ::stride] = True
            valid &= sel
            pr = X[valid]; col = ra[valid][:, ::-1]
            z = pr[:, 2]
            keep = (z > rng[0]) & (z < rng[1]) & np.isfinite(pr).all(1)
            pr, col = pr[keep], col[keep]
            Xc = (R1.T @ pr.T).T
            Xw = (a["R"].T @ (Xc - a["t"]).T).T
            P.append(Xw); C.append(col); S.append(np.full(len(Xw), pair_no, np.int32)); CAMS.append(np.repeat(a["center"][None], len(Xw), 0))
            pair_no += 1
    if not P:
        raise PipelineError("Dense matching produced no points: neighbouring photos do not overlap enough for stereo.")
    return np.concatenate(P), np.concatenate(C), np.concatenate(S), np.concatenate(CAMS), pair_no


def fuse(P, C, S, CAMS, voxel, min_support=2):
    """Voxel fusion: keep voxels observed by >= min_support independent stereo pairs."""
    keys = np.floor(P / voxel).astype(np.int64)
    k = keys[:, 0] * 73856093 ^ keys[:, 1] * 19349663 ^ keys[:, 2] * 83492791
    order = np.lexsort((S, k))
    k, S2 = k[order], S[order]
    first = np.r_[True, k[1:] != k[:-1]]
    grp = np.cumsum(first) - 1
    new_pair = np.r_[True, (k[1:] != k[:-1]) | (S2[1:] != S2[:-1])]
    support = np.bincount(grp, weights=new_pair)
    cnt = np.bincount(grp)
    sumP = np.stack([np.bincount(grp, weights=P[order][:, d]) for d in range(3)], 1)
    sumC = np.stack([np.bincount(grp, weights=C[order][:, d].astype(float)) for d in range(3)], 1)
    sumCam = np.stack([np.bincount(grp, weights=CAMS[order][:, d]) for d in range(3)], 1)
    ok = support >= min_support
    return (sumP / cnt[:, None])[ok], (sumC / cnt[:, None])[ok].astype(np.uint8), (sumCam / cnt[:, None])[ok]


# ───────────────────────── geometry helpers ─────────────────────────
def focus_point(imgs):
    A = np.zeros((3, 3)); b = np.zeros(3)
    for im in imgs.values():
        d = view_dir(im); M = np.eye(3) - np.outer(d, d)
        A += M; b += M @ im["center"]
    return np.linalg.lstsq(A, b, rcond=None)[0]


def orientation(imgs, front_ids, focus):
    up = np.mean([im["R"].T @ np.array([0, -1.0, 0]) for im in imgs.values()], 0)
    up /= np.linalg.norm(up)
    fronts = [imgs[i]["center"] for i in front_ids if i in imgs]
    ref = np.mean(fronts, 0) if fronts else next(iter(imgs.values()))["center"]
    fwd = ref - focus; fwd -= up * (fwd @ up); fwd /= np.linalg.norm(fwd)
    x = np.cross(up, fwd); x /= np.linalg.norm(x)
    return np.stack([x, up, fwd]), bool(fronts)   # rows: new X, Y(up), Z(front, glTF +Z)


def remove_ground(P, thr):
    """RANSAC for a dominant horizontal support plane (turntable / floor); removes it and everything below."""
    rng = np.random.default_rng(0)
    best, best_n = None, 0
    if len(P) < 100:
        return np.ones(len(P), bool), None
    for _ in range(300):
        s = P[rng.choice(len(P), 3, replace=False)]
        n = np.cross(s[1] - s[0], s[2] - s[0]); ln = np.linalg.norm(n)
        if ln < 1e-12:
            continue
        n /= ln
        if n[1] < 0:
            n = -n
        if n[1] < math.cos(math.radians(12)):
            continue
        d = (P - s[0]) @ n
        inl = int((np.abs(d) < thr).sum())
        if inl > best_n:
            best_n, best = inl, (n, s[0])
    if best is None or best_n < 0.08 * len(P):
        return np.ones(len(P), bool), None
    n, p0 = best
    d = (P - p0) @ n
    return d > thr * 1.5, {"normal": n.tolist(), "inliers": best_n, "ratio": best_n / len(P)}


# ───────────────────────── main ─────────────────────────
def main(cfg_path):
    global LOG
    cfg = json.load(open(cfg_path))
    W = cfg["work_dir"]; os.makedirs(W, exist_ok=True)
    LOG = os.path.join(W, "pipeline.log")
    colmap = cfg.get("colmap_bin", "colmap"); threads = str(cfg.get("threads", 4))
    quality = cfg.get("quality", "standard"); max_size = int(cfg.get("max_image_size", 1600))
    img_dir = os.path.join(W, "images"); os.makedirs(img_dir, exist_ok=True)
    name_to_id, angle = {}, {}
    for im in cfg["images"]:
        ext = os.path.splitext(im["path"])[1].lower() or ".jpg"
        name = f"{im['id']}{ext}"
        dst = os.path.join(img_dir, name)
        if not os.path.exists(dst):
            try:
                os.symlink(im["path"], dst)
            except OSError:
                shutil.copy(im["path"], dst)
        name_to_id[name] = im["id"]; angle[name] = im.get("angle", "custom")
    total = len(cfg["images"])
    if total < 3:
        raise PipelineError("At least 3 images are required")

    stage("feature_extraction", f"Extracting SIFT features from {total} images (max {max_size}px, CPU)")
    db = os.path.join(W, "database.db")
    sizes = {tuple(cv2.imread(os.path.join(img_dir, n), cv2.IMREAD_REDUCED_GRAYSCALE_8).shape) for n in list(name_to_id)[:50]}
    run([colmap, "feature_extractor", "--database_path", db, "--image_path", img_dir, "--ImageReader.camera_model", "SIMPLE_RADIAL",
         "--ImageReader.single_camera", "1" if len(sizes) == 1 else "0", "--SiftExtraction.use_gpu", "1" if cfg.get("cuda") else "0",
         "--SiftExtraction.max_image_size", str(max_size), "--SiftExtraction.max_num_features", "12000",
         "--SiftExtraction.peak_threshold", "0.004", "--SiftExtraction.num_threads", threads], "Feature extraction")

    matcher = cfg.get("matcher", "exhaustive")
    stage("feature_matching", f"{matcher.title()} feature matching with geometric verification")
    if matcher == "sequential":
        run([colmap, "sequential_matcher", "--database_path", db, "--SiftMatching.use_gpu", "1" if cfg.get("cuda") else "0", "--SiftMatching.num_threads", threads,
             "--SequentialMatching.overlap", "12"], "Feature matching")
    else:
        run([colmap, "exhaustive_matcher", "--database_path", db, "--SiftMatching.use_gpu", "1" if cfg.get("cuda") else "0", "--SiftMatching.num_threads", threads], "Feature matching")

    stage("sparse_reconstruction", "Estimating camera poses and triangulating the sparse point cloud")
    sparse = os.path.join(W, "sparse"); os.makedirs(sparse, exist_ok=True)
    run([colmap, "mapper", "--database_path", db, "--image_path", img_dir, "--output_path", sparse, "--Mapper.num_threads", threads], "Sparse reconstruction",
        hint="COLMAP could not register the images into one reconstruction: no image pair has enough verified matches. "
             "The photos probably do not overlap enough, show different objects, or the surface lacks texture.")
    models = sorted(d for d in os.listdir(sparse) if os.path.isdir(os.path.join(sparse, d)))
    if not models:
        raise PipelineError("COLMAP could not register any images. The photos probably do not overlap or show too little texture.")
    best = None
    for m in models:
        cams, imgs, pts = load_model(colmap, os.path.join(sparse, m), os.path.join(W, f"sparse_txt_{m}"))
        if best is None or len(imgs) > len(best[2]):
            best = (m, cams, imgs, pts)
    m, cams, imgs, pts = best
    reg = len(imgs)
    reg_ids = [name_to_id[i["name"]] for i in imgs.values()]
    sparse_metrics = {
        "registered_images": reg, "total_images": total, "sparse_points": int(len(pts["xyz"])),
        "mean_reprojection_error": float(np.mean(pts["error"])) if len(pts["error"]) else None,
        "mean_track_length": float(np.mean(pts["track"])) if len(pts["track"]) else None,
        "models_found": len(models), "registered_image_ids": reg_ids,
        "unregistered_image_ids": [i for i in name_to_id.values() if i not in set(reg_ids)],
    }
    emit(event="metrics", **sparse_metrics)
    if reg < 3:
        raise PipelineError(f"Only {reg} of {total} images could be registered. Capture more overlapping photos.")
    if reg < total:
        emit(event="warning", message=f"{total - reg} image(s) could not be registered and were ignored.")

    # ── dense ──
    dense = os.path.join(W, "dense")
    run([colmap, "image_undistorter", "--image_path", img_dir, "--input_path", os.path.join(sparse, m), "--output_path", dense,
         "--output_type", "COLMAP", "--max_image_size", str(max_size)], "Image undistortion")
    dcams, dimgs, dpts = load_model(colmap, os.path.join(dense, "sparse"), os.path.join(W, "dense_txt"))
    if cfg.get("cuda"):
        stage("dense_reconstruction", "COLMAP PatchMatch stereo (GPU)")
        run([colmap, "patch_match_stereo", "--workspace_path", dense, "--PatchMatchStereo.geom_consistency", "true"], "PatchMatch stereo")
        run([colmap, "stereo_fusion", "--workspace_path", dense, "--output_path", os.path.join(dense, "fused.ply")], "Stereo fusion")
        pc = trimesh.load(os.path.join(dense, "fused.ply"))
        P = np.asarray(pc.vertices); Cc = np.asarray(pc.colors)[:, :3] if pc.colors is not None else np.full((len(P), 3), 180, np.uint8)
        CAMC = np.repeat(focus_point(dimgs)[None], len(P), 0); dense_mode = "colmap_patch_match"; pairs = None
    else:
        stage("dense_reconstruction", "CPU fallback: semi-global stereo matching on rectified neighbour pairs (no CUDA GPU available)")
        P0, C0, S0, CAM0, pairs = cpu_dense(dense, dcams, dimgs, dpts, quality)
        dense_mode = "cpu_sgbm_fusion"
    focus = focus_point(dimgs)
    cam_dist = np.median([np.linalg.norm(im["center"] - focus) for im in dimgs.values()])
    if not cfg.get("cuda"):
        # Crop to the region the cameras look at, then fuse with multi-pair support.
        roi = np.linalg.norm(P0 - focus, axis=1) < cam_dist * 0.75
        P0, C0, S0, CAM0 = P0[roi], C0[roi], S0[roi], CAM0[roi]
        voxel = cam_dist / 400.0
        P, Cc, CAMC = fuse(P0, C0, S0, CAM0, voxel, 2)
        if len(P) < 500:
            raise PipelineError("Too few consistent dense points after fusion. Photos may be blurry or lack overlap.")
    else:
        roi = np.linalg.norm(P - focus, axis=1) < cam_dist * 0.75
        P, Cc, CAMC = P[roi], Cc[roi], CAMC[roi]
        voxel = cam_dist / 400.0
    emit(event="metrics", dense_mode=dense_mode, dense_points=int(len(P)), stereo_pairs=pairs)

    # ── orientation & ground removal ──
    front_ids = [i for i, im in dimgs.items() if angle.get(im["name"]) == "front"]
    Rm, has_front = orientation(dimgs, front_ids, focus)
    to_local = lambda X: (Rm @ (X - focus).T).T  # noqa: E731
    PL = to_local(P); CAML = to_local(CAMC)
    trimesh.PointCloud(PL, colors=np.c_[Cc, np.full(len(Cc), 255, np.uint8)]).export(os.path.join(W, "dense_points.ply"))
    ground = None
    if cfg.get("remove_ground", True):
        keep, ground = remove_ground(PL, voxel * 2.5)
        PL, Cc, CAML = PL[keep], Cc[keep], CAML[keep]

    stage("meshing", f"Screened Poisson surface reconstruction from {len(PL):,} points")
    ms = pymeshlab.MeshSet()
    ms.add_mesh(pymeshlab.Mesh(vertex_matrix=PL.astype(np.float64)))
    ms.compute_normal_for_point_clouds(k=16, smoothiter=1)
    N = ms.current_mesh().vertex_normal_matrix().copy()
    flip = np.einsum("ij,ij->i", N, CAML - PL) < 0
    N[flip] *= -1
    ms.clear(); ms.add_mesh(pymeshlab.Mesh(vertex_matrix=PL.astype(np.float64), v_normals_matrix=N))
    ms.generate_surface_reconstruction_screened_poisson(depth=POISSON_DEPTH.get(quality, 9), preclean=True)
    mesh = ms.current_mesh()
    V, F = mesh.vertex_matrix(), mesh.face_matrix()
    # Trim surface that is not supported by any dense point (Poisson hallucinates closing surfaces).
    tree = cKDTree(PL)
    dist, _ = tree.query(V, k=1)
    vkeep = dist < voxel * 4
    fkeep = vkeep[F].all(1)
    tm = trimesh.Trimesh(V, F[fkeep], process=True)
    tm.remove_unreferenced_vertices()
    comps = tm.split(only_watertight=False)
    if not comps:
        raise PipelineError("Meshing produced no surface")
    big = max(len(c.faces) for c in comps)
    tm = trimesh.util.concatenate([c for c in comps if len(c.faces) >= 0.02 * big])
    ms = pymeshlab.MeshSet(); ms.add_mesh(pymeshlab.Mesh(vertex_matrix=tm.vertices, face_matrix=tm.faces))
    target = FACE_TARGET.get(quality, 80000)
    if len(tm.faces) > target:
        ms.meshing_decimation_quadric_edge_collapse(targetfacenum=target, preservenormal=True, planarquadric=True)
    ms.meshing_remove_duplicate_faces(); ms.meshing_remove_unreferenced_vertices()
    V = ms.current_mesh().vertex_matrix(); F = ms.current_mesh().face_matrix()

    # Vertex colours from the dense cloud.
    _, nn = tree.query(V, k=4)
    VC = Cc[nn].mean(1).astype(np.uint8)

    # ── scale & placement ──
    lo, hi = V.min(0), V.max(0)
    offset = np.array([(lo[0] + hi[0]) / 2, lo[1], (lo[2] + hi[2]) / 2])
    V = V - offset; PLs = PL - offset
    dims = hi - lo
    kd = cfg.get("known_dimension")
    if kd:
        to_m = {"mm": 0.001, "cm": 0.01, "m": 1.0, "in": 0.0254}[kd["unit"]]
        axis = {"x": 0, "y": 1, "z": 2}.get(kd["axis"])
        measured = float(dims.max() if axis is None else dims[axis])
        scale = kd["value"] * to_m / measured; scale_source = f"known dimension ({kd['axis']} = {kd['value']} {kd['unit']})"; calibrated = True
    else:
        scale = 1.0 / float(dims.max()); scale_source = "uncalibrated (normalised: longest side = 1 unit)"; calibrated = False
    V = V * scale; PLs = PLs * scale

    ply = os.path.join(W, "mesh_colored.ply")
    # Blender is Z-up: store (x, -z, y) so the glTF exporter's Y-up conversion restores (x, y, z).
    trimesh.Trimesh(np.c_[V[:, 0], -V[:, 2], V[:, 1]], F, vertex_colors=np.c_[VC, np.full(len(VC), 255, np.uint8)], process=False).export(ply)

    stage("texturing", "UV unwrapping, then projecting the registered photos onto the surface")
    out_glb = os.path.join(W, "model.glb")
    tex_size = int(cfg.get("texture_size", 2048))
    textured, tex_info = False, None
    if cfg.get("blender_bin") and tex_size > 0:
        uv_glb = os.path.join(W, "unwrapped.glb")
        cmd = [cfg["blender_bin"], "-b", "--factory-startup", "-P", os.path.join(os.path.dirname(__file__), "unwrap.py"), "--", ply, uv_glb]
        log("$ " + " ".join(cmd))
        r = subprocess.run(cmd, capture_output=True, text=True)
        log(r.stdout[-3000:] + r.stderr[-3000:])
        if r.returncode == 0 and "UNWRAP_OK" in r.stdout:
            from PIL import Image
            from texture import texture as project_texture
            um = trimesh.load(uv_glb, force="mesh", process=False)
            UV = np.asarray(um.visual.uv, dtype=np.float64)
            Vf = np.asarray(um.vertices, dtype=np.float64); Fu = np.asarray(um.faces)
            Vw = (Rm.T @ (Vf / scale + offset).T).T + focus          # final frame -> COLMAP world frame
            _, nn2 = tree.query(Vf / scale + offset, k=4)
            VCu = Cc[nn2].mean(1)
            cams_t = []
            for im in dimgs.values():
                cam = dcams[im["camera_id"]]
                cams_t.append({"K": cam["K"], "R": im["R"], "t": im["t"], "image": cv2.imread(os.path.join(dense, "images", im["name"]))})
            img, tex_info = project_texture(Vw, Fu, UV, VCu, cams_t, tex_size)
            mat = trimesh.visual.material.PBRMaterial(name="Photogrammetry", baseColorTexture=Image.fromarray(img), metallicFactor=0.0, roughnessFactor=0.85)
            tm_out = trimesh.Trimesh(Vf, Fu, visual=trimesh.visual.TextureVisuals(uv=UV, material=mat), process=False)
            tm_out.export(out_glb, include_normals=True)
            textured = True
            emit(event="metrics", texture_size=tex_size, texture_photo_coverage=tex_info["photo_coverage"])
        else:
            emit(event="warning", message="UV unwrapping failed; exporting with vertex colours instead.")
    if not textured:
        trimesh.Trimesh(V, F, vertex_colors=np.c_[VC, np.full(len(VC), 255, np.uint8)], process=False).export(out_glb)

    stage("scale_calibration", f"Scale: {scale_source}; factor {scale:.6g}")
    # Point cloud + camera poses (same final frame) for inspection.
    sel = np.random.default_rng(1).choice(len(PLs), min(len(PLs), 60000), replace=False)
    pc_path = os.path.join(W, "pointcloud.glb")
    trimesh.PointCloud(PLs[sel], colors=np.c_[Cc[sel], np.full(len(sel), 255, np.uint8)]).export(pc_path)
    cams_out = []
    for im in dimgs.values():
        c = (Rm @ (im["center"] - focus) - offset) * scale
        Rw = Rm @ im["R"].T  # camera-to-local rotation
        cam = dcams[im["camera_id"]]
        cams_out.append({"image_id": name_to_id.get(im["name"]), "angle": angle.get(im["name"]), "center": c.tolist(), "rotation": Rw.tolist(),
                         "fx": cam["fx"], "width": cam["w"], "height": cam["h"], "observations": int(len(im["point_ids"]))})
    cams_path = os.path.join(W, "cameras.json"); json.dump(cams_out, open(cams_path, "w"))

    stage("finalizing", "Writing model, point cloud and camera poses")
    final_dims = (V.max(0) - V.min(0)).tolist()
    emit(event="result", glb=out_glb, pointcloud=pc_path, cameras=cams_path, log=LOG, metrics={
        **sparse_metrics, "dense_mode": dense_mode, "dense_points": int(len(PL)), "stereo_pairs": pairs,
        "mesh_vertices": int(len(V)), "mesh_faces": int(len(F)), "textured": textured, "texture_size": tex_size if textured else None, "texture_photo_coverage": tex_info["photo_coverage"] if tex_info else None,
        "ground_plane_removed": ground is not None, "ground_plane": ground, "oriented_by_front_image": has_front,
        "scale_factor": scale, "scale_source": scale_source, "scale_calibrated": calibrated,
        "dimensions": final_dims, "unit": "m" if calibrated else "relative",
    })


if __name__ == "__main__":
    try:
        main(sys.argv[1])
    except PipelineError as e:
        emit(event="error", message=str(e)); sys.exit(2)
    except Exception as e:  # noqa: BLE001
        import traceback
        if LOG:
            log(traceback.format_exc())
        emit(event="error", message=f"Unexpected pipeline error: {e}"); sys.exit(3)
