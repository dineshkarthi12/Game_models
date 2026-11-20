#!/usr/bin/env python3
"""Accuracy validation engine. Every check reports the measured value, a status and the method used.

No overall "accuracy %" is produced. Checks that cannot be measured for a model are reported as
not_available with the reason.

Usage: validate.py <config.json>  ->  JSON report on stdout
config: { glb, source: "ai"|"photogrammetry"|"upload", is_demo, stats, integrity, metrics (generation metrics),
          references: [{id, path, angle}], cameras: [...] (photogrammetry poses in model frame) | null,
          measurements: {width?, height?, depth?, unit} | null, coverage_ratio: float | null }
"""
import json, sys, os, math
import numpy as np
import cv2
import trimesh

sys.path.insert(0, os.path.dirname(__file__))

UNIT = {"mm": 0.001, "cm": 0.01, "m": 1.0, "in": 0.0254}
VIEW_DIR = {"front": (0, 0, 1), "back": (0, 0, -1), "left": (-1, 0, 0), "right": (1, 0, 0), "top": (0, 1, 0), "bottom": (0, -1, 0)}


def check(cid, group, label, status, value, detail, method):
    return {"id": cid, "group": group, "label": label, "status": status, "value": value, "detail": detail, "method": method}


def foreground_mask(path, size=320):
    """GrabCut segmentation initialised from the image border (assumes the object is roughly centred)."""
    img = cv2.imread(path)
    if img is None:
        return None
    h, w = img.shape[:2]; s = size / max(h, w)
    img = cv2.resize(img, (max(8, int(w * s)), max(8, int(h * s))), interpolation=cv2.INTER_AREA)
    h, w = img.shape[:2]
    mask = np.zeros((h, w), np.uint8)
    rect = (int(w * 0.04), int(h * 0.04), int(w * 0.92), int(h * 0.92))
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    try:
        cv2.grabCut(img, mask, rect, bgd, fgd, 5, cv2.GC_INIT_WITH_RECT)
    except cv2.error:
        return None
    fg = ((mask == cv2.GC_FGD) | (mask == cv2.GC_PR_FGD)).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(fg)
    if n > 1:
        keep = 1 + int(np.argmax(st[1:, cv2.CC_STAT_AREA])); fg = (lab == keep).astype(np.uint8)
    return fg, s


def render_mask(V, F, project, w, h):
    uv, ok = project(V)
    m = np.zeros((h, w), np.uint8)
    pts = np.round(uv[F] * 16).astype(np.int32)
    good = ok[F].all(1)
    for t in np.nonzero(good)[0]:
        cv2.fillConvexPoly(m, pts[t], 1, lineType=cv2.LINE_8, shift=4)
    return m


def bbox_normalise(mask, n=256):
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    crop = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    ch, cw = crop.shape; s = n / max(ch, cw)
    r = cv2.resize(crop, (max(1, int(cw * s)), max(1, int(ch * s))), interpolation=cv2.INTER_NEAREST)
    out = np.zeros((n, n), np.uint8); oy = (n - r.shape[0]) // 2; ox = (n - r.shape[1]) // 2
    out[oy:oy + r.shape[0], ox:ox + r.shape[1]] = r
    return out


def iou(a, b):
    u = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / u) if u else 0.0


def uv_overlap(uv, F, n=250_000, G=256):
    """Fraction of UV space covered, and fraction of covered area hit by more than one triangle."""
    T = uv[F]
    lo = np.clip(np.floor(T.min(1) * G).astype(int), 0, G - 1); hi = np.clip(np.floor(T.max(1) * G).astype(int), 0, G - 1)
    tri_ids, cells = [], []
    span = (hi - lo + 1)
    for dy in range(int(span[:, 1].max())):
        for dx in range(int(span[:, 0].max())):
            ok = (dx < span[:, 0]) & (dy < span[:, 1])
            if not ok.any():
                continue
            t = np.nonzero(ok)[0]
            tri_ids.append(t); cells.append((lo[t, 1] + dy) * G + lo[t, 0] + dx)
    tri_ids = np.concatenate(tri_ids); cells = np.concatenate(cells)
    order = np.argsort(cells); cells, tri_ids = cells[order], tri_ids[order]
    starts = np.searchsorted(cells, np.arange(G * G)); ends = np.searchsorted(cells, np.arange(G * G), side="right")
    rng = np.random.default_rng(0); P = rng.random((n, 2))
    pc = np.clip((P[:, 1] * G).astype(int), 0, G - 1) * G + np.clip((P[:, 0] * G).astype(int), 0, G - 1)
    cnt = ends[pc] - starts[pc]
    pi = np.repeat(np.arange(n), cnt)
    ti = tri_ids[np.concatenate([np.arange(starts[c], ends[c]) for c in pc[cnt > 0]])] if cnt.sum() else np.zeros(0, int)
    pi = np.repeat(np.nonzero(cnt > 0)[0], cnt[cnt > 0])
    a, b, c = T[ti, 0], T[ti, 1], T[ti, 2]; p = P[pi]
    d = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
    d = np.where(np.abs(d) < 1e-15, 1e-15, d)
    l1 = ((b[:, 1] - c[:, 1]) * (p[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (p[:, 1] - c[:, 1])) / d
    l2 = ((c[:, 1] - a[:, 1]) * (p[:, 0] - c[:, 0]) + (a[:, 0] - c[:, 0]) * (p[:, 1] - c[:, 1])) / d
    inside = (l1 > 0) & (l2 > 0) & (1 - l1 - l2 > 0)
    hits = np.bincount(pi[inside], minlength=n)
    covered = (hits >= 1).sum()
    return float(covered / n), float((hits >= 2).sum() / covered) if covered else 0.0


def ortho_projector(direction, V):
    d = np.array(direction, float); d /= np.linalg.norm(d)
    up = np.array([0, 1.0, 0]) if abs(d[1]) < 0.9 else np.array([0, 0, -1.0])
    x = np.cross(up, d); x /= np.linalg.norm(x); y = np.cross(d, x)
    P = np.c_[V @ x, -(V @ y)]
    lo, hi = P.min(0), P.max(0); span = (hi - lo).max() or 1
    return lambda W: (((np.c_[W @ x, -(W @ y)] - lo) / span) * 300 + 6, np.ones(len(W), bool)), 312, 312


def main(cfg_path):
    cfg = json.load(open(cfg_path))
    stats, integ, metrics = cfg.get("stats") or {}, cfg.get("integrity") or {}, cfg.get("metrics") or {}
    source = cfg.get("source"); checks = []; limitations = []
    mesh = trimesh.load(cfg["glb"], force="mesh", process=False)
    V = np.asarray(mesh.vertices, float); F = np.asarray(mesh.faces)
    welded = mesh.copy(); welded.merge_vertices(merge_tex=True, merge_norm=True)

    # ── Geometry ──
    edges = max(1, integ.get("edges", 1))
    nm = integ.get("non_manifold_edges", 0)
    checks.append(check("non_manifold", "Geometry", "Non-manifold edges", "pass" if nm == 0 else "warn" if nm / edges < 0.001 else "fail", nm,
                        f"{nm} edge(s) shared by more than two faces ({nm / edges:.4%} of edges).", "Edge-face incidence count on position-welded mesh"))
    try:
        holes = len(welded.outline().entities) if integ.get("boundary_edges", 0) else 0
    except Exception:  # noqa: BLE001
        holes = None
    be = integ.get("boundary_edges", 0)
    checks.append(check("missing_faces", "Geometry", "Missing faces / holes", "pass" if be == 0 else "warn", holes if holes is not None else be,
                        f"{be} open boundary edge(s) forming {holes if holes is not None else '?'} boundary loop(s). Scans of objects on a surface usually have an open base.",
                        "Boundary loops from edges used by exactly one face"))
    comps = integ.get("components", 1)
    checks.append(check("continuity", "Geometry", "Surface continuity", "pass" if comps == 1 else "warn", comps,
                        f"{comps} disconnected surface component(s).", "Connected components of the welded mesh"))
    checks.append(check("normals", "Geometry", "Normal consistency", "pass" if integ.get("winding_consistent") else "warn", "consistent" if integ.get("winding_consistent") else "inconsistent",
                        "Adjacent faces agree on orientation." if integ.get("winding_consistent") else "Some adjacent faces have opposite winding; shading and boolean operations may be affected. Use Normal Correction.",
                        "Shared-edge winding comparison"))
    dg = integ.get("degenerate_faces", 0) + integ.get("duplicate_faces", 0)
    checks.append(check("degenerate", "Geometry", "Degenerate / duplicate faces", "pass" if dg == 0 else "warn", dg, f"{dg} zero-area or duplicate face(s).", "Face area < 1e-12 and sorted-index duplicates"))

    # ── Texture ──
    if stats.get("has_uvs"):
        uv = np.asarray(getattr(mesh.visual, "uv", None)) if hasattr(mesh.visual, "uv") and mesh.visual.uv is not None else None
        if uv is not None and len(uv):
            oob = float(((uv < -1e-4) | (uv > 1 + 1e-4)).any(1).mean())
            used, overlap = uv_overlap(uv, F)
            a3 = mesh.area_faces; uvp = uv[F]
            a2 = 0.5 * np.abs((uvp[:, 1, 0] - uvp[:, 0, 0]) * (uvp[:, 2, 1] - uvp[:, 0, 1]) - (uvp[:, 2, 0] - uvp[:, 0, 0]) * (uvp[:, 1, 1] - uvp[:, 0, 1]))
            ratio = (a2 / a2.sum()) / np.maximum(a3 / a3.sum(), 1e-20)
            stretch = float(np.median(np.abs(np.log(np.clip(ratio[a3 > 0], 1e-6, 1e6)))))
            st = "pass" if oob < 0.01 and overlap < 0.05 else "warn"
            checks.append(check("uv", "Texture", "UV validity", st, f"{used:.0%} used",
                                f"UV space used {used:.1%}; overlapping UV area {overlap:.1%}; out-of-range UVs {oob:.2%}; median log area distortion {stretch:.2f}.",
                                "Point-in-triangle test of 250k random UV samples (exact containment, spatial grid)"))
    else:
        checks.append(check("uv", "Texture", "UV validity", "not_available", None, "The model has no UV coordinates.", "—"))
    tex = stats.get("textures") or []
    if tex:
        maxres = max(t.get("width") or 0 for t in tex); roles = sorted({t.get("role") or "unknown" for t in tex})
        checks.append(check("texture_quality", "Texture", "Texture maps", "pass" if maxres >= 1024 else "warn", f"{maxres}px",
                            f"{len(tex)} map(s): {', '.join(roles)}; largest {maxres}×{maxres}.", "glTF image headers"))
    else:
        checks.append(check("texture_quality", "Texture", "Texture maps", "warn" if not stats.get("has_vertex_colors") else "pass", "none",
                            "No texture maps" + (" (colour stored per vertex)." if stats.get("has_vertex_colors") else "."), "glTF materials"))
    if source == "photogrammetry" and metrics.get("texture_photo_coverage") is not None:
        c = metrics["texture_photo_coverage"]
        checks.append(check("texture_consistency", "Reference comparison", "Texture photo coverage", "pass" if c >= 0.85 else "warn", f"{c:.0%}",
                            f"{c:.1%} of texels were coloured from at least one unoccluded photo; the rest use interpolated colours.", "Per-texel visibility in registered photos"))

    # ── Reference comparison: silhouettes ──
    refs = cfg.get("references") or []; cams = cfg.get("cameras")
    ious = {}; missing = {}
    if refs:
        by_id = {c.get("image_id"): c for c in (cams or [])}
        for r in refs[:8]:
            fm = foreground_mask(r["path"])
            if fm is None:
                continue
            fg, s = fm
            h, w = fg.shape
            cam = by_id.get(r["id"]) if cams else None
            if cam:
                R = np.asarray(cam["rotation"]); C = np.asarray(cam["center"]); f = cam["fx"] * (w / cam["width"])
                cx, cy = w / 2, h / 2
                def proj(W, R=R, C=C, f=f, cx=cx, cy=cy):
                    pc = (W - C) @ R  # local -> camera (R is camera-to-local)
                    z = pc[:, 2]; ok = z > 1e-6
                    return np.c_[f * pc[:, 0] / np.where(ok, z, 1) + cx, f * pc[:, 1] / np.where(ok, z, 1) + cy], ok
                rm = render_mask(V, F, proj, w, h)
                a, b = fg, rm; method = "true camera projection (COLMAP pose)"
            elif r.get("angle") in VIEW_DIR:
                p, W2, H2 = ortho_projector(VIEW_DIR[r["angle"]], V)
                rm = render_mask(V, F, p, W2, H2)
                a, b = bbox_normalise(fg), bbox_normalise(rm); method = "bounding-box-normalised orthographic silhouette"
                if a is None or b is None:
                    continue
            else:
                continue
            key = f"{r.get('angle', 'view')}:{r['id'][:8]}"
            ious[key] = round(iou(a > 0, b > 0), 4)
            missing[key] = round(float(np.logical_and(a > 0, b == 0).sum() / max(1, (a > 0).sum())), 4)
        if ious:
            mean = float(np.mean(list(ious.values())))
            checks.append(check("silhouette", "Reference comparison", "Silhouette overlap (IoU)", "pass" if mean >= 0.85 else "warn" if mean >= 0.65 else "fail", round(mean, 3),
                                f"Mean IoU {mean:.3f} over {len(ious)} reference view(s): " + ", ".join(f"{k.split(':')[0]} {v:.2f}" for k, v in ious.items()) + ".",
                                f"GrabCut foreground of each photo vs. rendered model silhouette — {method}"))
            worst = max(missing.values())
            checks.append(check("missing_geometry", "Reference comparison", "Missing geometry (silhouette)", "pass" if worst < 0.1 else "warn", f"{worst:.0%}",
                                f"Up to {worst:.1%} of the photographed outline is not covered by the model in one view.", "Reference foreground pixels outside the model silhouette"))
            limitations.append("Silhouette checks depend on automatic background segmentation; turntables, stands or cluttered backgrounds reduce IoU.")
            if not cams:
                limitations.append("For models without camera poses, silhouettes are compared after bounding-box normalisation and assume the model faces the canonical front.")
    else:
        checks.append(check("silhouette", "Reference comparison", "Silhouette overlap (IoU)", "not_available", None, "No reference images available for this model.", "—"))

    # ── Dimensions ──
    dims = np.asarray(stats.get("dimensions") or (V.max(0) - V.min(0)))
    meas = cfg.get("measurements") or {}
    calibrated = bool(stats.get("scale_calibrated"))
    checks.append(check("scale", "Dimensions", "Scale calibration", "pass" if calibrated else "warn", "calibrated" if calibrated else "relative",
                        f"Model units are {'metres (calibrated)' if calibrated else 'relative — not tied to real-world size'}.", "Version metadata"))
    deviation = None
    given = {k: meas[k] * UNIT[meas.get("unit", "cm")] for k in ("width", "height", "depth") if meas.get(k)}
    if given:
        idx = {"width": 0, "height": 1, "depth": 2}
        if calibrated:
            devs = {k: (dims[idx[k]] - v) / v for k, v in given.items()}
            mode = "absolute"
        elif len(given) >= 2:
            ref_k = max(given, key=lambda k: given[k])
            s = given[ref_k] / dims[idx[ref_k]]
            devs = {k: (dims[idx[k]] * s - v) / v for k, v in given.items() if k != ref_k}
            mode = f"proportional (scaled so {ref_k} matches)"
        else:
            devs = {}; mode = "insufficient"
        if devs:
            deviation = float(max(abs(d) for d in devs.values()))
            checks.append(check("dimensions", "Dimensions", "Measurement deviation", "pass" if deviation < 0.02 else "warn" if deviation < 0.05 else "fail", f"{deviation:.2%}",
                                f"{mode.capitalize()} comparison: " + ", ".join(f"{k} {d:+.2%}" for k, d in devs.items()) + ".", "Axis-aligned bounding box vs. your measurements"))
        else:
            checks.append(check("dimensions", "Dimensions", "Measurement deviation", "not_available", None, "Uncalibrated model: provide at least two measurements to compare proportions.", "—"))
    else:
        checks.append(check("dimensions", "Dimensions", "Measurement deviation", "not_available", None, "No real-world measurements were provided.", "—"))

    # ── Photogrammetry / AI specific ──
    confidence = None
    if source == "photogrammetry" and metrics:
        reg, tot = metrics.get("registered_images"), metrics.get("total_images")
        if reg is not None and tot:
            r = reg / tot
            checks.append(check("camera_quality", "Photogrammetry", "Camera reconstruction", "pass" if r >= 0.9 else "warn" if r >= 0.6 else "fail", f"{reg}/{tot}",
                                f"{r:.0%} of photos were registered by structure-from-motion.", "COLMAP mapper"))
        re = metrics.get("mean_reprojection_error")
        if re is not None:
            checks.append(check("reprojection", "Photogrammetry", "Mean reprojection error", "pass" if re < 1 else "warn" if re < 2 else "fail", f"{re:.3f} px",
                                "Average pixel distance between observed features and re-projected 3D points.", "COLMAP sparse model"))
        dp = metrics.get("dense_points"); area = integ.get("surface_area")
        if dp and area:
            dens = dp / (area * (1e4 if calibrated else 1))
            checks.append(check("density", "Photogrammetry", "Point cloud density", "pass" if dp > 50000 else "warn", f"{dens:,.0f} pts/{'cm²' if calibrated else 'unit²'}",
                                f"{dp:,} fused dense points ({metrics.get('dense_mode')}).", "Dense points / mesh surface area"))
        if reg is not None and tot and re is not None:
            r = reg / tot
            confidence = "High" if r >= 0.9 and re < 1 else "Medium" if r >= 0.6 and re < 2 else "Low"
            confidence += f" — {reg}/{tot} registered, {re:.2f} px reprojection error"
        limitations.append("CPU stereo (no CUDA) captures less fine detail than GPU PatchMatch." if metrics.get("dense_mode") == "cpu_sgbm_fusion" else "")
    elif source == "ai":
        used = cfg.get("used_images"); prov = cfg.get("input_images")
        checks.append(check("reference_consistency", "AI model", "Reference consistency", "pass" if used else "warn", f"{used}/{prov} images used",
                            "AI providers estimate unseen geometry; only the images listed were sent to the provider.", "Generation record"))
        confidence = "Not measurable — AI-estimated geometry"
        limitations.append("AI-generated geometry is an estimate. Silhouette agreement does not prove that hidden surfaces are correct.")
    if cfg.get("is_demo"):
        limitations.insert(0, "DEMO model: procedural geometry not derived from the reference photos. Results are not meaningful for accuracy.")

    summary = {k: sum(1 for c in checks if c["status"] == k) for k in ("pass", "warn", "fail", "not_available")}
    report = {
        "summary": summary, "checks": checks,
        "metrics": {
            "reference_coverage": cfg.get("coverage_ratio"),
            "reconstruction_confidence": confidence,
            "geometric_deviation": deviation,
            "texture_quality": next((c["detail"] for c in checks if c["id"] == "texture_quality"), None),
            "model_integrity": f"{comps} component(s), {nm} non-manifold edge(s), {be} open boundary edge(s)",
            "silhouette_iou": ious or None,
        },
        "limitations": [l for l in limitations if l],
    }
    print(json.dumps(report))


if __name__ == "__main__":
    main(sys.argv[1])
