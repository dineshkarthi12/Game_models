#!/usr/bin/env python3
"""Pairwise feature-overlap analysis for a photogrammetry dataset.

ORB features + ratio-test matching + RANSAC fundamental matrix. The number of geometrically
verified inliers between two images is a direct, measurable proxy for usable overlap.

Usage: overlap.py <json-in>   where json-in = {"images": [{"id":..., "path":...}], "max_pairs": 600}
Prints a JSON result to stdout.
"""
import json, sys, itertools, random
from datetime import datetime, timezone
import cv2
import numpy as np

STRONG = 40  # inliers for a pair to count as a reliable connection


def load(path, max_side=1000):
    img = cv2.imread(path, cv2.IMREAD_GRAYSCALE)
    if img is None:
        return None
    h, w = img.shape
    s = max_side / max(h, w)
    if s < 1:
        img = cv2.resize(img, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return img


def main():
    cfg = json.load(open(sys.argv[1]))
    imgs = cfg["images"]
    orb = cv2.ORB_create(nfeatures=3000)
    feats = {}
    for im in imgs:
        g = load(im["path"])
        if g is None:
            feats[im["id"]] = None
            continue
        kp, des = orb.detectAndCompute(g, None)
        feats[im["id"]] = (np.float32([k.pt for k in kp]), des) if des is not None and len(kp) >= 8 else None

    ids = [i["id"] for i in imgs]
    pairs = list(itertools.combinations(range(len(ids)), 2))
    max_pairs = int(cfg.get("max_pairs", 600))
    if len(pairs) > max_pairs:
        # Always include neighbours in upload order (capture sequences) and sample the rest.
        neigh = [(i, j) for i, j in pairs if j - i <= 3]
        rest = [p for p in pairs if p not in set(neigh)]
        random.seed(7)
        pairs = neigh + random.sample(rest, max(0, max_pairs - len(neigh)))

    bf = cv2.BFMatcher(cv2.NORM_HAMMING)
    results = []
    for i, j in pairs:
        a, b = feats[ids[i]], feats[ids[j]]
        inl = 0
        if a is not None and b is not None:
            m = bf.knnMatch(a[1], b[1], k=2)
            good = [x[0] for x in m if len(x) == 2 and x[0].distance < 0.75 * x[1].distance]
            if len(good) >= 8:
                p1 = a[0][[g.queryIdx for g in good]]
                p2 = b[0][[g.trainIdx for g in good]]
                F, mask = cv2.findFundamentalMat(p1, p2, cv2.FM_RANSAC, 3.0, 0.99)
                inl = int(mask.sum()) if mask is not None else 0
        results.append({"a": ids[i], "b": ids[j], "inliers": inl})

    strong = {i: 0 for i in ids}
    adj = {i: set() for i in ids}
    for r in results:
        if r["inliers"] >= STRONG:
            strong[r["a"]] += 1; strong[r["b"]] += 1
            adj[r["a"]].add(r["b"]); adj[r["b"]].add(r["a"])
    # connected components over strong edges
    seen, comps = set(), []
    for i in ids:
        if i in seen:
            continue
        stack, comp = [i], []
        while stack:
            n = stack.pop()
            if n in seen:
                continue
            seen.add(n); comp.append(n); stack.extend(adj[n] - seen)
        comps.append(comp)
    largest = max((len(c) for c in comps), default=0)
    weak = [i for i in ids if strong[i] < 2]
    mean_inl = float(np.mean([r["inliers"] for r in results])) if results else 0.0
    out = {
        "method": f"ORB(3000)+ratio 0.75+RANSAC F; strong pair >= {STRONG} inliers",
        "pairs_checked": len(results),
        "mean_inlier_matches": round(mean_inl, 1),
        "strong_pairs": sum(1 for r in results if r["inliers"] >= STRONG),
        "components": len(comps),
        "largest_component": largest,
        "weakly_connected_image_ids": weak,
        "no_features_image_ids": [i for i in ids if feats[i] is None],
        "suitable_for_photogrammetry": len(ids) >= 3 and largest == len(ids) and not weak,
        "pairs": sorted(results, key=lambda r: -r["inliers"])[:200],
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }
    print(json.dumps(out))


if __name__ == "__main__":
    main()
