# Photogrammetry

Precision reconstruction runs `workers/photogrammetry/pipeline.py` on the `photogrammetry` BullMQ queue
(never in the API process or the browser). The script prints JSON-line events that the worker mirrors into
`generations.events`, `generations.metrics` and `reconstruction_jobs`.

## Pipeline

| Stage | Tool | Output / metric |
|---|---|---|
| Validation | Node worker | ≥ 3 images; images materialised from storage |
| Feature extraction | `colmap feature_extractor` (SIFT, `SIMPLE_RADIAL`, single camera when sizes match) | — |
| Feature matching | `colmap exhaustive_matcher` or `sequential_matcher` | geometric verification |
| Sparse reconstruction | `colmap mapper` (largest model kept) | registered images, sparse points, mean reprojection error, mean track length |
| Undistortion | `colmap image_undistorter` | pinhole images for stereo |
| Dense — GPU | `patch_match_stereo` + `stereo_fusion` | `dense_mode = colmap_patch_match` |
| Dense — CPU fallback | OpenCV SGBM on rectified neighbour pairs (COLMAP poses), left-right check, texture mask, voxel fusion requiring ≥ 2 independent pairs | `dense_mode = cpu_sgbm_fusion`, dense points, stereo pairs |
| Orientation | camera up-vectors (gravity) + the image tagged **Front** | model faces glTF +Z, up = +Y |
| Support-plane removal | RANSAC horizontal plane (turntable/floor), optional | `ground_plane_removed` |
| Meshing | normals oriented to source cameras → screened Poisson (pymeshlab) → trimmed to dense support → small components removed → quadric decimation to the quality budget | mesh vertices/faces |
| Texturing | Blender Smart UV unwrap → **photo projection**: each texel projected into every registered photo, occlusion-tested against a per-camera depth buffer of the mesh, blended by viewing angle; vertex-colour fallback; gutter dilation | `texture_photo_coverage` |
| Scale calibration | known dimension (axis + value + unit) → metres; otherwise normalised and flagged *relative* | `scale_factor`, `scale_source`, `scale_calibrated` |
| Outputs | GLB (textured), point-cloud GLB (≤ 60k points), `cameras.json` (poses in model frame), `pipeline.log` | stored per model version |

Face budgets: draft 30k · standard 80k · high 200k · ultra 400k. Texture: 1K/2K/4K/4K.

## Measured result on the synthetic test dataset

`workers/tools/render_dataset.py` renders a textured object from two camera rings plus a top view with Blender and
writes `ground_truth.json`. With width supplied as the known dimension (28.94 cm), the reconstructed **height** is an
independent measurement:

| Run | Images registered | Mean reprojection error | Height vs. ground truth |
|---|---|---|---|
| 41 views, standard (manual run) | 41 / 41 | 0.47 px | −1.0 % |
| 31 views, draft (`test/photogrammetry.test.ts`) | ≥ 90 % required | < 1.5 px required | 0.84 % (asserted < 8 %) |

Synthetic renders are an idealised case (perfect focus, static lighting, known intrinsics model). Real captures will
usually be less accurate; the validation report states what was measured for each model.

## Known limitations

* **COLMAP 3.9.1 (Ubuntu package) `delaunay_mesher --input_type sparse` hangs** at "Integrating image [1/N]" even
  single-threaded, so it is not used. Poisson meshing of the dense cloud replaces it.
* **Ubuntu's Blender 4.0.2 Cycles baking writes black images** in this environment (even a constant-colour cube), which is
  why texturing is done by the Python photo-projection texturer and Blender is used only for UV unwrapping.
* CPU stereo uses horizontal-baseline pairs only (pairs across rings are skipped) and is less detailed than GPU PatchMatch.
* Thin structures, fine hair, transparent, reflective and texture-less surfaces reconstruct poorly or not at all.
* The support-plane removal assumes the object stands on a horizontal surface; disable for wall-mounted or hanging objects.

## Cancellation & failure

Cancel sets the generation to `cancelled`; the worker polls every 2 s and terminates the **process group**
(Python + COLMAP children). Failures store the pipeline log, explain the likely cause (e.g. "no image pair has enough
verified matches"), refund credits exactly once and notify the user.

## GPU deployment

On a CUDA host, install a CUDA-enabled COLMAP. `colmap help` then reports "with CUDA", the worker passes `cuda: true`,
and SIFT extraction/matching plus PatchMatch stereo run on the GPU.
