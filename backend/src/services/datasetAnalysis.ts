import { hamming, QUALITY_THRESHOLDS } from './imageAnalysis.js';

export const CANONICAL_ANGLES = ['front', 'back', 'left', 'right', 'front_left', 'front_right', 'back_left', 'back_right', 'top', 'bottom'] as const;

interface Img { id: string; angle: string; dhash: string; sha256: string; quality: { is_blurry: boolean; resolution_ok: boolean; brightness: number; color_hist: number[] } | null }

const chi = (a: number[], b: number[]) => {
  // Histogram intersection similarity (0..1) averaged over the 3 channels.
  let s = 0; for (let i = 0; i < a.length; i++) s += Math.min(a[i] ?? 0, b[i] ?? 0);
  return s / 3;
};

/**
 * Reference-set analysis. All values are derived from stored per-image measurements.
 * "Same object" similarity is a colour-histogram heuristic, reported as such — it cannot prove identity.
 */
export function analyzeDataset(images: Img[], overlap: unknown) {
  const coverage = CANONICAL_ANGLES.map((angle) => {
    const ids = images.filter((i) => i.angle === angle).map((i) => i.id);
    return { angle, present: ids.length > 0, image_ids: ids };
  });
  const missing = coverage.filter((c) => !c.present).map((c) => c.angle);

  const duplicates: { a: string; b: string; distance: number; exact: boolean }[] = [];
  for (let i = 0; i < images.length; i++) for (let j = i + 1; j < images.length; j++) {
    const a = images[i]!; const b = images[j]!;
    const exact = a.sha256 === b.sha256; const d = hamming(a.dhash, b.dhash);
    if (exact || d <= 4) duplicates.push({ a: a.id, b: b.id, distance: d, exact });
  }

  const q = images.filter((i) => i.quality);
  const bright = q.map((i) => i.quality!.brightness);
  const mean = bright.length ? bright.reduce((s, v) => s + v, 0) / bright.length : 0;
  const sd = bright.length ? Math.sqrt(bright.reduce((s, v) => s + (v - mean) ** 2, 0) / bright.length) : 0;

  // Similarity of each image to the set's median histogram.
  let simMean = 0; const outliers: string[] = [];
  if (q.length >= 3) {
    const bins = q[0]!.quality!.color_hist.length;
    const median = Array.from({ length: bins }, (_, k) => { const v = q.map((i) => i.quality!.color_hist[k] ?? 0).sort((x, y) => x - y); return v[Math.floor(v.length / 2)]!; });
    const sims = q.map((i) => ({ id: i.id, s: chi(i.quality!.color_hist, median) }));
    simMean = sims.reduce((s, v) => s + v.s, 0) / sims.length;
    for (const s of sims) if (s.s < 0.55) outliers.push(s.id);
  }

  const blurry = q.filter((i) => i.quality!.is_blurry).map((i) => i.id);
  const lowRes = q.filter((i) => !i.quality!.resolution_ok).map((i) => i.id);
  const recs: string[] = [];
  if (images.length === 0) recs.push('Upload photographs of the object from several angles to begin.');
  const keyMissing = missing.filter((m) => ['front', 'back', 'left', 'right'].includes(m));
  if (keyMissing.length) recs.push(`Add the main views: ${keyMissing.map((m) => m.replace('_', ' ')).join(', ')}.`);
  const diagMissing = missing.filter((m) => m.includes('_'));
  if (diagMissing.length && images.length) recs.push(`Diagonal views improve overlap: ${diagMissing.map((m) => m.replace('_', ' ')).join(', ')}.`);
  if (missing.includes('top')) recs.push('A top-down view helps close the upper surface.');
  if (blurry.length) recs.push(`Retake ${blurry.length} blurry image${blurry.length > 1 ? 's' : ''} with a faster shutter or a tripod.`);
  if (lowRes.length) recs.push(`${lowRes.length} image${lowRes.length > 1 ? 's are' : ' is'} below ${QUALITY_THRESHOLDS.minShortSide}px on the short side.`);
  if (duplicates.length) recs.push(`Remove ${duplicates.length} duplicate or near-identical pair${duplicates.length > 1 ? 's' : ''}; they add no new viewpoints.`);
  if (sd > 35) recs.push('Lighting varies strongly between photos; keep lighting constant for best texture consistency.');
  if (outliers.length) recs.push(`${outliers.length} image${outliers.length > 1 ? 's look' : ' looks'} different in colour from the rest — check they show the same object.`);
  if (images.length > 0 && images.length < 20) recs.push('For photogrammetry, 20–80 overlapping photos (every 10–15° in rings) are recommended.');

  return {
    image_count: images.length, coverage, coverage_ratio: coverage.filter((c) => c.present).length / CANONICAL_ANGLES.length, missing_angles: missing,
    duplicates, blurry_image_ids: blurry, low_resolution_image_ids: lowRes,
    lighting: { mean_brightness: +mean.toFixed(1), stddev_brightness: +sd.toFixed(1), consistent: sd <= 35 },
    similarity: { method: '24-bin RGB histogram intersection vs. set median', mean: +simMean.toFixed(3), outlier_image_ids: outliers,
      note: 'Heuristic: flags images whose colour distribution differs from the rest. It cannot prove that photos show the same object.' },
    overlap: overlap ?? null, recommendations: recs,
  };
}
