#!/usr/bin/env python3
"""Texture enhancement for a GLB's base-colour map: unsharp mask + gentle auto-contrast (no generative content).
Usage: enhance_texture.py <in.glb> <out.glb> <amount 0..2> <contrast_cutoff_percent>
"""
import sys
import trimesh
from PIL import ImageFilter, ImageOps


def main(src, out, amount, cutoff):
    scene = trimesh.load(src, force="scene", process=False)
    n = 0
    for g in scene.geometry.values():
        mat = getattr(getattr(g, "visual", None), "material", None)
        img = getattr(mat, "baseColorTexture", None) if mat is not None else None
        if img is None:
            continue
        mode = img.mode
        rgb = img.convert("RGB").filter(ImageFilter.UnsharpMask(radius=2, percent=int(amount * 100), threshold=2))
        if cutoff > 0:
            rgb = ImageOps.autocontrast(rgb, cutoff=cutoff)
        if mode == "RGBA":
            rgb = rgb.convert("RGBA"); rgb.putalpha(img.getchannel("A"))
        mat.baseColorTexture = rgb; n += 1
    scene.export(out)
    print(f"ENHANCE_OK {n}")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], float(sys.argv[3]), float(sys.argv[4]))
