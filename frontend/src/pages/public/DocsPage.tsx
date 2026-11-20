import { BookOpen, Camera, Cpu, Ruler, Download, Code2, AlertTriangle } from 'lucide-react';
import { Callout } from '@/components/ui/misc';

const NAV = [
  ['getting-started', 'Getting started', BookOpen], ['capture', 'Capture guide', Camera], ['modes', 'Reconstruction modes', Cpu],
  ['validation', 'Validation metrics', Ruler], ['export', 'Export guide', Download], ['api', 'REST API', Code2], ['limitations', 'Limitations', AlertTriangle],
] as const;

function H({ id, children }: { id: string; children: React.ReactNode }) {
  return <h2 id={id} className="scroll-mt-24 border-t border-line pt-10 text-2xl font-bold first:border-0 first:pt-0">{children}</h2>;
}
function Table({ rows, head }: { head: string[]; rows: string[][] }) {
  return (
    <div className="mt-4 overflow-x-auto rounded-lg border border-line">
      <table className="w-full text-left text-[13px]">
        <thead className="bg-canvas text-ink-muted"><tr>{head.map((h) => <th key={h} className="px-3 py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-line">{rows.map((r) => <tr key={r[0]}>{r.map((c, i) => <td key={i} className={i === 0 ? 'px-3 py-2 font-medium' : 'px-3 py-2 text-ink-muted'}>{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function DocsPage() {
  return (
    <div className="container grid gap-10 py-12 lg:grid-cols-[220px_1fr]">
      <aside className="min-w-0 lg:sticky lg:top-24 lg:self-start">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-muted">Documentation</p>
        <nav className="flex gap-1 overflow-x-auto lg:flex-col" aria-label="Documentation sections">
          {NAV.map(([id, l, I]) => <a key={id} href={`#${id}`} className="flex shrink-0 items-center gap-2 rounded-md px-2.5 py-2 text-[13px] font-medium text-ink-muted hover:bg-canvas hover:text-ink"><I className="size-4" />{l}</a>)}
        </nav>
      </aside>
      <article className="min-w-0 max-w-3xl space-y-4 text-[15px] leading-relaxed text-ink [&_p]:text-ink-muted [&_li]:text-ink-muted">
        <H id="getting-started">Getting started</H>
        <ol className="list-decimal space-y-1.5 pl-5">
          <li>Create a project from <strong className="text-ink">Create 3D</strong> and choose the asset category.</li>
          <li>Upload photographs of the <em>same physical object</em> and assign each one an angle.</li>
          <li>Review the reference report: blurry, duplicate and low-resolution images are flagged; missing angles are listed.</li>
          <li>Choose <strong className="text-ink">AI Reconstruction</strong> or <strong className="text-ink">Precision Photogrammetry</strong>, configure and start.</li>
          <li>Open the model workspace to inspect, validate, refine, optimise and export.</li>
        </ol>

        <H id="capture">Capture guide</H>
        <p>Good input matters more than any setting. For photogrammetry, every surface point must appear sharply in at least three photographs taken from different positions.</p>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>Walk around the object in two or three rings (low, eye-level, high), one photo every 10–15°: roughly 24–36 photos per ring.</li>
          <li>Keep 60–80% overlap between neighbouring photos. Move the camera, not the object, unless you use a turntable with a plain, featureless background.</li>
          <li>Use soft, even light. Avoid hard shadows and changing light between shots. Lock exposure and white balance if you can.</li>
          <li>Fill the frame with the object; use the highest resolution available. Avoid digital zoom and heavy compression.</li>
          <li>Add a scale reference (ruler, calibration card or a measured dimension) if you need real-world units.</li>
        </ul>
        <Callout tone="warning" title="Reflective, transparent and featureless objects">
          Feature matching needs stable, textured surface detail. Mirror-like metal, glass and plain single-colour plastic rarely reconstruct well. Options: diffuse or cross-polarised lighting, a temporary matte scanning spray, textured tape or markers around the object, or AI reconstruction (which estimates rather than measures geometry).
        </Callout>
        <p>For AI reconstruction, fewer but clean images work best: a plain background, the whole object in frame, and canonical views (front, left, back, right) where the provider supports multi-view input.</p>

        <H id="modes">Reconstruction modes</H>
        <Table head={['', 'AI Reconstruction', 'Precision Photogrammetry']} rows={[
          ['Engine', 'Meshy or Tripo (cloud API)', 'COLMAP Structure-from-Motion on Vistora workers'],
          ['Input', '1 image, or 1–4 views where the endpoint supports multi-view', '20+ overlapping photographs of the same object'],
          ['Geometry', 'Estimated — unseen areas are generated', 'Triangulated from matched image features'],
          ['Scale', 'Arbitrary; calibrate manually', 'Relative; calibrated with a known dimension'],
          ['Typical use', 'Concepts, props, characters from few photos', 'Real objects needing measured shape'],
        ]} />
        <p>Dense multi-view stereo in COLMAP requires a CUDA GPU. On CPU-only workers Vistora meshes the sparse reconstruction (Delaunay) and projects your photos onto the mesh for colour. The processing log and quality report always state which path was used.</p>

        <H id="validation">Validation metrics</H>
        <Table head={['Metric', 'What it measures', 'Source']} rows={[
          ['Reference Coverage', 'Which of the 10 canonical angles have at least one image', 'Your upload set'],
          ['Reconstruction Confidence', 'Registered cameras, reprojection error, point density', 'COLMAP (photogrammetry only)'],
          ['Model Integrity', 'Non-manifold edges, boundary edges, degenerate faces, winding consistency', 'Mesh analysis'],
          ['Silhouette overlap (IoU)', 'Rendered outline vs. foreground of a reference photo', 'Approximate; assumes canonical orientation'],
          ['Geometric Deviation', 'Bounding-box vs. measurements you entered', 'Only when you supply dimensions'],
          ['Texture Quality', 'Resolution, presence of UVs, map types', 'Model file'],
        ]} />
        <p>Vistora never reports an overall "accuracy percentage". If a metric cannot be measured for a model it is shown as <em>not available</em>, with the reason.</p>

        <H id="export">Export guide</H>
        <Table head={['Target', 'Recommended', 'Notes']} rows={[
          ['Blender', 'GLB', 'Keeps PBR materials and textures in one file. FBX/OBJ/USD also available.'],
          ['Autodesk Maya', 'FBX', 'Centimetre units, Y-up. Textures are packaged alongside.'],
          ['Unreal Engine', 'FBX', 'Centimetre units, Z-up, LOD meshes and UCX_ collision mesh where enabled.'],
          ['Unity', 'FBX', 'Metre units, Y-up. Import textures from the Textures folder of the package.'],
          ['Godot', 'GLB', 'glTF 2.0 is Godot\'s native interchange format.'],
          ['Universal', 'GLB / GLTF / OBJ', 'STL for 3D printing (geometry only).'],
        ]} />
        <p>Every export is produced by Blender's native exporters and re-imported to verify mesh and vertex counts before a download link is created.</p>

        <H id="api">REST API</H>
        <p>All endpoints live under <code className="kbd">/api</code> and use bearer tokens. Highlights:</p>
        <pre className="overflow-x-auto rounded-lg border border-line bg-canvas p-4 font-mono text-[12.5px] text-ink">{`POST /api/projects                 create a project
POST /api/uploads                  multipart image upload (project_id, angle)
POST /api/generations              start AI generation
POST /api/reconstruction           start photogrammetry
GET  /api/generations/:id          status, stage, events
GET  /api/models/:id/metadata      measured statistics
POST /api/models/:id/validate      run validation
POST /api/models/:id/export        start an export
GET  /api/exports/:id/download     signed download URL`}</pre>

        <H id="limitations">Limitations</H>
        <ul className="list-disc space-y-1.5 pl-5">
          <li>AI providers fill hidden regions; generated geometry is not a measurement of the real object.</li>
          <li>Photogrammetry fails on insufficient overlap, motion blur, moving objects or changing lighting.</li>
          <li>Silhouette comparison for AI models assumes the model faces the canonical front; it is a rough consistency check.</li>
          <li>Rigging is only offered when the selected provider supports it for the asset type.</li>
        </ul>
      </article>
    </div>
  );
}
