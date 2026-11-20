# Vistora 3D

**From Every Angle to Every Detail.** Multi-view AI reconstruction, COLMAP photogrammetry, measured validation,
refinement, game-asset optimisation and validated export to Blender, Maya, Unreal Engine, Unity and Godot.

## What works in this build
* Accounts (local JWT or Supabase), projects, asset library, folders/tags, history, teams with RLS-enforced sharing.
* Multi-view upload studio: angle assignment, per-image quality metrics, coverage, duplicates, ORB/RANSAC overlap check.
* **Photogrammetry** (COLMAP SfM → CPU stereo or GPU PatchMatch → Poisson mesh → photo-projected texture → scale calibration).
  On the bundled synthetic test set, height measured within ~1% of ground truth when width is given.
* AI reconstruction through Meshy/Tripo adapters (**CONFIGURATION REQUIRED**: API keys + network access) and a clearly labelled
  Demo provider.
* 3D workspace (R3F): wireframe, textures, materials, UVs, geometry/integrity, point cloud & cameras, LOD, skeleton, animation, compare.
* Validation report with method and limitations for every metric — no invented accuracy scores.
* Refinement (Blender + pymeshlab) with versioning, texture re-projection; game pipeline with LODs, baked normal maps, collision.
* Export: FBX, GLB, GLTF, OBJ, USD, USDZ, STL — each file re-imported and verified before download; ZIP with README/metadata.

## Quick start
See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). Development:
```bash
npm install && python3 -m venv workers/.venv && workers/.venv/bin/pip install -r workers/requirements.txt
npm run dev:api   # :4000
npm run dev:worker
npm run dev:web   # :5173
```

## Documentation
[Architecture](docs/ARCHITECTURE.md) · [API](docs/API.md) · [AI providers](docs/AI_PROVIDERS.md) · [Photogrammetry](docs/PHOTOGRAMMETRY.md) ·
[Exports](docs/EXPORTS.md) · [Deployment](docs/DEPLOYMENT.md) · [Milestones](MILESTONE_TRACKER.md) · [Decisions](TECHNICAL_DECISIONS.md)
