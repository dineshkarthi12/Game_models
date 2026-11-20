# Exports

Exports run on the `export` BullMQ queue (`backend/src/services/exporter.ts`).

## Converters (no renamed extensions)

| Format | Produced by | Verified by |
|---|---|---|
| FBX (binary) | Blender `export_scene.fbx` | Blender FBX importer + `Kaydara FBX Binary` signature |
| GLB / GLTF (separate + textures) | Blender `export_scene.gltf` | Blender glTF importer + `glTF` magic / JSON `asset` |
| OBJ + MTL | Blender `wm.obj_export` | Blender OBJ importer |
| STL (binary) | Blender `export_mesh.stl` | Blender STL importer + size = 84 + 50·n |
| USD (`.usdc`) | Pixar `usd-core` (pxr) — UsdGeom mesh, normals, `st` primvar, UsdPreviewSurface (base colour + normal map) | pxr stage open, mesh/triangle/texture-path checks + `PXR-USDC` magic |
| USDZ | pxr `UsdUtils.CreateNewUsdzPackage` | pxr + ZIP signature |

The Ubuntu Blender 4.0.2 build has no USD support, which is why USD/USDZ use Pixar's library directly.

A file is marked **validated** only if its signature is correct, it re-imports, and its triangle count matches the
source version (±1%). Files that fail are listed with the reason in `metadata.json` and are removed from the ZIP;
if no file validates, the export fails.

## Presets

| Preset | Formats | Units | Up / forward | Collision |
|---|---|---|---|---|
| Blender | GLB, FBX, OBJ, USD | m | Y / −Z | — |
| Autodesk Maya | FBX, OBJ, USD | cm | Y / Z | — |
| Unreal Engine | FBX, USD, GLB | cm | Z / −Y | `UCX_<Name>_00` inside the FBX; separate file for other formats |
| Unity | FBX, OBJ, GLB | m | Y / −Z (FBX transform baked, scale 1) | `<Name>_collision` file |
| Godot | GLB, GLTF | m | Y / −Z | `<Name>_collision` file |
| Universal | GLB, GLTF, OBJ, STL, USDZ | m | Y / −Z | — |

All settings can be overridden: formats, scale, units, up/forward axis, texture resolution cap, LOD selection,
textures, materials, normals, UVs, skeleton, animation, collision, triangulation.

## Package layout

```
<Name>_<preset>/
  README.md          import notes for the target, settings, provenance (AI-estimated / photogrammetry / demo)
  metadata.json      settings, triangle counts, LODs, per-file validation results
  FBX/ GLB/ GLTF/ OBJ/ USD/ USDZ/ STL/   one folder per format (LODs as <Name>_LOD1 …)
  Textures/          base colour / normal maps referenced by FBX and OBJ
```

## Notes

* glTF is always metres, Y-up (per specification); FBX carries its own unit scale.
* Normal maps are OpenGL convention (+Y). Unreal needs "Flip Green Channel"; Unity, Blender and Godot do not.
* Skeleton/animation are exported only when the source contains them; nothing is fabricated.
