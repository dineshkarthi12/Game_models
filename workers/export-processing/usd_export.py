#!/usr/bin/env python3
"""Write USD (.usdc) / USDZ with Pixar's official pxr API (usd-core) from GLB inputs, and verify USD files.

export: usd_export.py export <config.json>   config: {out_dir, name, items: [{label, glb}], formats: ["usd","usdz"], units, up_axis}
verify: usd_export.py verify <file.usdc|usdz>
"""
import sys, os, json, re, shutil, tempfile
import numpy as np
import trimesh
from pxr import Usd, UsdGeom, UsdShade, Sdf, Gf, UsdUtils, Vt

UNIT = {"m": 1.0, "cm": 0.01, "mm": 0.001}


def clean(s):
    return re.sub(r"[^A-Za-z0-9_]", "_", s) or "Mesh"


def write_stage(path, name, glb, units, up_axis, tex_dir_rel, tex_dir_abs):
    stage = Usd.Stage.CreateNew(path)
    UsdGeom.SetStageUpAxis(stage, UsdGeom.Tokens.z if up_axis == "Z" else UsdGeom.Tokens.y)
    UsdGeom.SetStageMetersPerUnit(stage, UNIT[units])
    root = UsdGeom.Xform.Define(stage, f"/{clean(name)}"); stage.SetDefaultPrim(root.GetPrim())
    scene = trimesh.load(glb, force="scene", process=False)
    k = 1.0 / UNIT[units]
    tris_total = 0
    for i, (node, gname) in enumerate([(n, scene.graph[n][1]) for n in scene.graph.nodes_geometry]):
        T, _ = scene.graph[node]; g = scene.geometry[gname]
        if not isinstance(g, trimesh.Trimesh) or not len(g.faces): continue
        m = g.copy(); m.apply_transform(T)
        V = np.asarray(m.vertices) * k
        N = np.asarray(m.vertex_normals)
        if up_axis == "Z":
            V = np.c_[V[:, 0], -V[:, 2], V[:, 1]]; N = np.c_[N[:, 0], -N[:, 2], N[:, 1]]
        prim_path = f"/{clean(name)}/{clean(str(gname))}_{i}"
        mesh = UsdGeom.Mesh.Define(stage, prim_path)
        mesh.CreatePointsAttr(Vt.Vec3fArray.FromNumpy(V.astype(np.float32)))
        mesh.CreateFaceVertexCountsAttr(Vt.IntArray.FromNumpy(np.full(len(m.faces), 3, np.int32)))
        mesh.CreateFaceVertexIndicesAttr(Vt.IntArray.FromNumpy(np.asarray(m.faces, np.int32).ravel()))
        mesh.CreateNormalsAttr(Vt.Vec3fArray.FromNumpy(N.astype(np.float32))); mesh.SetNormalsInterpolation(UsdGeom.Tokens.vertex)
        mesh.CreateSubdivisionSchemeAttr(UsdGeom.Tokens.none)
        lo, hi = V.min(0), V.max(0); mesh.CreateExtentAttr([Gf.Vec3f(*map(float, lo)), Gf.Vec3f(*map(float, hi))])
        tris_total += len(m.faces)
        uv = getattr(m.visual, "uv", None)
        if uv is not None:
            pv = UsdGeom.PrimvarsAPI(mesh).CreatePrimvar("st", Sdf.ValueTypeNames.TexCoord2fArray, UsdGeom.Tokens.vertex)
            pv.Set(Vt.Vec2fArray.FromNumpy(np.asarray(uv, np.float32)))
        mat = getattr(m.visual, "material", None)
        um = UsdShade.Material.Define(stage, f"{prim_path}_Mat")
        sh = UsdShade.Shader.Define(stage, f"{prim_path}_Mat/PreviewSurface"); sh.CreateIdAttr("UsdPreviewSurface")
        rough = float(getattr(mat, "roughnessFactor", None) or 0.8) if mat is not None else 0.8
        metal = float(getattr(mat, "metallicFactor", None) or 0.0) if mat is not None else 0.0
        sh.CreateInput("roughness", Sdf.ValueTypeNames.Float).Set(rough); sh.CreateInput("metallic", Sdf.ValueTypeNames.Float).Set(metal)
        um.CreateSurfaceOutput().ConnectToSource(sh.ConnectableAPI(), "surface")
        def tex(img, slot, label):
            fn = f"{clean(name)}_{i}_{label}.png"; img.save(os.path.join(tex_dir_abs, fn))
            reader = UsdShade.Shader.Define(stage, f"{prim_path}_Mat/st_reader"); reader.CreateIdAttr("UsdPrimvarReader_float2")
            reader.CreateInput("varname", Sdf.ValueTypeNames.Token).Set("st")
            t = UsdShade.Shader.Define(stage, f"{prim_path}_Mat/{label}Tex"); t.CreateIdAttr("UsdUVTexture")
            t.CreateInput("file", Sdf.ValueTypeNames.Asset).Set(f"{tex_dir_rel}/{fn}")
            t.CreateInput("st", Sdf.ValueTypeNames.Float2).ConnectToSource(reader.ConnectableAPI(), "result")
            if label == "Normal":
                t.CreateInput("sourceColorSpace", Sdf.ValueTypeNames.Token).Set("raw")
                t.CreateInput("scale", Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(2, 2, 2, 1)); t.CreateInput("bias", Sdf.ValueTypeNames.Float4).Set(Gf.Vec4f(-1, -1, -1, 0))
                sh.CreateInput("normal", Sdf.ValueTypeNames.Normal3f).ConnectToSource(t.ConnectableAPI(), "rgb")
            else:
                t.CreateInput("sourceColorSpace", Sdf.ValueTypeNames.Token).Set("sRGB")
                sh.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).ConnectToSource(t.ConnectableAPI(), "rgb")
        base = getattr(mat, "baseColorTexture", None) if mat is not None else None
        if base is not None and uv is not None: tex(base.convert("RGB"), "diffuseColor", "BaseColor")
        else:
            c = getattr(mat, "baseColorFactor", None) if mat is not None else None
            col = (np.asarray(c[:3], float) / (255.0 if np.max(c[:3]) > 1 else 1.0)) if c is not None else np.array([0.8, 0.8, 0.8])
            sh.CreateInput("diffuseColor", Sdf.ValueTypeNames.Color3f).Set(Gf.Vec3f(*map(float, col)))
        nt = getattr(mat, "normalTexture", None) if mat is not None else None
        if nt is not None and uv is not None: tex(nt.convert("RGB"), "normal", "Normal")
        UsdShade.MaterialBindingAPI.Apply(mesh.GetPrim()).Bind(um)
    stage.GetRootLayer().Save()
    return tris_total


def export(cfg):
    out = []
    for fmt in cfg["formats"]:
        d = os.path.join(cfg["out_dir"], fmt.upper()); os.makedirs(d, exist_ok=True)
        for item in cfg["items"]:
            base = clean(cfg["name"]) + ("" if item["label"] == "main" else f"_{item['label']}")
            if fmt == "usd":
                td = os.path.join(d, "textures"); os.makedirs(td, exist_ok=True)
                p = os.path.join(d, base + ".usdc"); write_stage(p, base, item["glb"], cfg["units"], cfg["up_axis"], "./textures", td)
            else:
                tmp = tempfile.mkdtemp()
                try:
                    td = os.path.join(tmp, "textures"); os.makedirs(td)
                    src = os.path.join(tmp, base + ".usdc"); write_stage(src, base, item["glb"], cfg["units"], cfg["up_axis"], "./textures", td)
                    p = os.path.join(d, base + ".usdz")
                    if not UsdUtils.CreateNewUsdzPackage(Sdf.AssetPath(src), p): raise RuntimeError("USDZ packaging failed")
                finally:
                    shutil.rmtree(tmp, ignore_errors=True)
            out.append({"format": fmt, "path": p})
            print("EXPORTED " + json.dumps({"format": fmt, "path": p}), flush=True)


def verify(p):
    try:
        stage = Usd.Stage.Open(p)
        tris = meshes = uv = 0; textures = []
        for prim in stage.Traverse():
            if prim.IsA(UsdGeom.Mesh):
                m = UsdGeom.Mesh(prim); meshes += 1
                counts = m.GetFaceVertexCountsAttr().Get() or []
                tris += int(sum(max(0, c - 2) for c in counts))
                if UsdGeom.PrimvarsAPI(prim).GetPrimvar("st"): uv += 1
            if prim.IsA(UsdShade.Shader):
                f = UsdShade.Shader(prim).GetInput("file")
                if f and f.Get(): textures.append(str(f.Get().resolvedPath or f.Get().path))
        unresolved = [t for t in textures if not t or (not t.startswith(("/", "@")) and "[" not in t and not os.path.exists(t))]
        print("VERIFY " + json.dumps({"ok": meshes > 0, "meshes": meshes, "triangles": tris, "meshes_with_uv": uv, "images": len(textures),
                                      "up_axis": str(UsdGeom.GetStageUpAxis(stage)), "meters_per_unit": UsdGeom.GetStageMetersPerUnit(stage), "unresolved_textures": len(unresolved)}))
    except Exception as e:  # noqa: BLE001
        print("VERIFY " + json.dumps({"ok": False, "error": str(e)}))


if __name__ == "__main__":
    if sys.argv[1] == "export": export(json.load(open(sys.argv[2])))
    else: verify(sys.argv[2])
