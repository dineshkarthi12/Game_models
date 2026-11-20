#!/usr/bin/env python3
"""Game-readiness checks for a GLB against a preset. Critical checks gate the "game-ready" flag.
Usage: game_check.py <model.glb> <config.json>   config: {budget, max_texture, scale_calibrated, lods, collision}
"""
import sys, os, json
import numpy as np
import trimesh
sys.path.insert(0, os.path.dirname(__file__))
from glb import read_glb, images  # noqa: E402
from validate import uv_overlap  # noqa: E402


def main(path, cfg_path):
    cfg = json.load(open(cfg_path))
    js, binc = read_glb(path)
    m = trimesh.load(path, force="mesh", process=False)
    w = m.copy(); w.merge_vertices(merge_tex=True, merge_norm=True)
    prims = [p for me in js.get("meshes", []) for p in me.get("primitives", [])]
    has = lambda a: all(a in p.get("attributes", {}) for p in prims)  # noqa: E731
    imgs = images(js, binc)
    checks = []
    def c(cid, label, ok, value, detail, critical=True, warn_only=False):
        checks.append({"id": cid, "label": label, "status": "pass" if ok else ("warn" if warn_only or not critical else "fail"), "critical": critical, "value": value, "detail": detail})
    tris = int(len(m.faces))
    c("budget", "Triangle budget", tris <= cfg["budget"], f"{tris:,} / {cfg['budget']:,}", "Triangle count within the preset budget.")
    c("uvs", "UV coordinates", has("TEXCOORD_0"), "present" if has("TEXCOORD_0") else "missing", "Every primitive has TEXCOORD_0.")
    if has("TEXCOORD_0"):
        used, ov = uv_overlap(np.asarray(m.visual.uv), np.asarray(m.faces))
        c("uv_overlap", "Non-overlapping UVs", ov < 0.05, f"{ov:.1%} overlap", f"UV space used {used:.0%}. Overlaps break baked lighting/normal maps.")
    c("normals", "Vertex normals", has("NORMAL"), "present" if has("NORMAL") else "missing", "Engines need normals for shading.")
    pot = lambda n: n and (n & (n - 1)) == 0  # noqa: E731
    bad = [i for i in imgs if not (pot(i["width"] or 0) and pot(i["height"] or 0)) or (i["width"] or 0) > cfg["max_texture"]]
    c("textures", "Texture sizes", not bad, ", ".join(f"{i['width']}×{i['height']}" for i in imgs) or "none",
      f"Power-of-two and ≤ {cfg['max_texture']}px for mipmapping and streaming." + (f" {len(bad)} map(s) do not comply." if bad else ""))
    roles = []
    for mat in js.get("materials", []):
        if "normalTexture" in mat: roles.append("normal")
        if "baseColorTexture" in mat.get("pbrMetallicRoughness", {}): roles.append("base colour")
    c("pbr", "PBR maps", "base colour" in roles, ", ".join(sorted(set(roles))) or "none", "Base colour required; baked normal map recommended.", critical=False)
    nm = 0
    try:
        e, cnt = np.unique(w.edges_sorted, axis=0, return_counts=True); nm = int((cnt > 2).sum())
    except Exception:  # noqa: BLE001
        pass
    c("manifold", "Manifold geometry", nm == 0, f"{nm} non-manifold edges", "Non-manifold edges can break collision and baking.", critical=False)
    c("scale", "Real-world scale", bool(cfg.get("scale_calibrated")), "calibrated" if cfg.get("scale_calibrated") else "relative", "Engines assume metres/centimetres; calibrate scale for correct physics.", critical=False)
    mats = len(js.get("materials", []))
    c("materials", "Material count", mats <= 4, str(mats), "Fewer materials means fewer draw calls.", critical=False)
    c("lods", "LOD chain", cfg.get("lods", 0) >= 2, f"{cfg.get('lods', 0)} levels", "LODs reduce cost at distance.", critical=False)
    c("collision", "Collision mesh", bool(cfg.get("collision")), cfg.get("collision") or "none", "Simplified collision shape exported alongside the render mesh.", critical=False)
    ready = all(x["status"] == "pass" for x in checks if x["critical"])
    print(json.dumps({"game_ready": ready, "checks": checks}))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
