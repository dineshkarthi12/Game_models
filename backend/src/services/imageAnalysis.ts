import sharp from 'sharp';
import crypto from 'node:crypto';

export type ImageKind = { mime: 'image/jpeg' | 'image/png' | 'image/webp'; ext: '.jpg' | '.png' | '.webp' };

/** Identify the real file type from magic bytes (never trust the extension or client MIME type). */
export function sniffImage(buf: Buffer): ImageKind | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: 'image/jpeg', ext: '.jpg' };
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { mime: 'image/png', ext: '.png' };
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return { mime: 'image/webp', ext: '.webp' };
  return null;
}

export interface ImageQuality {
  width: number; height: number; megapixels: number; blur_score: number; is_blurry: boolean; brightness: number; contrast: number;
  exposure: 'under' | 'ok' | 'over'; clipped_dark: number; clipped_bright: number; resolution_ok: boolean; aspect_ratio: number;
  color_hist: number[]; warnings: string[]; method: string;
}

export const QUALITY_THRESHOLDS = { blur: 45, minShortSide: 768, recommendedShortSide: 1500, dark: 55, bright: 205, clip: 0.08 };

/**
 * Per-image measurable quality metrics.
 * - blur_score: variance of the Laplacian on a 1024px-long-edge greyscale copy (higher = sharper).
 * - brightness/contrast: mean / standard deviation of luminance (0–255).
 * - exposure: under/over when mean is extreme or >8% of pixels are clipped.
 * - color_hist: 24-bin (8 per RGB channel) normalised histogram for set-level similarity.
 */
export async function analyzeImage(buf: Buffer) {
  const img = sharp(buf, { failOn: 'error' }).rotate();
  const meta = await img.metadata();
  const oriented = meta.orientation && meta.orientation >= 5;
  const width = (oriented ? meta.height : meta.width) ?? 0;
  const height = (oriented ? meta.width : meta.height) ?? 0;

  const g = await sharp(buf).rotate().resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true }).greyscale().raw().toBuffer({ resolveWithObject: true });
  const { data, info } = g; const W = info.width; const H = info.height;
  let sum = 0; let sumSq = 0; let dark = 0; let bright = 0;
  for (let i = 0; i < data.length; i++) { const v = data[i]!; sum += v; sumSq += v * v; if (v <= 5) dark++; if (v >= 250) bright++; }
  const n = data.length; const mean = sum / n; const std = Math.sqrt(Math.max(0, sumSq / n - mean * mean));
  let lapSum = 0; let lapSq = 0; let lapN = 0;
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) {
    const i = y * W + x;
    const l = data[i - W]! + data[i + W]! + data[i - 1]! + data[i + 1]! - 4 * data[i]!;
    lapSum += l; lapSq += l * l; lapN++;
  }
  const lapMean = lapSum / lapN; const blur = lapSq / lapN - lapMean * lapMean;

  const c = await sharp(buf).rotate().resize(64, 64, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const hist = new Array(24).fill(0);
  for (let i = 0; i < c.length; i += 3) { hist[c[i]! >> 5]++; hist[8 + (c[i + 1]! >> 5)]++; hist[16 + (c[i + 2]! >> 5)]++; }
  const px = c.length / 3;

  const T = QUALITY_THRESHOLDS;
  const clipped_dark = dark / n; const clipped_bright = bright / n;
  const exposure: ImageQuality['exposure'] = mean < T.dark || clipped_dark > T.clip ? 'under' : mean > T.bright || clipped_bright > T.clip ? 'over' : 'ok';
  const short = Math.min(width, height);
  const warnings: string[] = [];
  const is_blurry = blur < T.blur;
  if (is_blurry) warnings.push('Image appears blurry (low Laplacian variance)');
  if (short < T.minShortSide) warnings.push(`Low resolution: short side ${short}px (< ${T.minShortSide}px)`);
  else if (short < T.recommendedShortSide) warnings.push(`Resolution is usable; ${T.recommendedShortSide}px+ recommended for photogrammetry`);
  if (exposure === 'under') warnings.push('Underexposed or heavy shadow clipping');
  if (exposure === 'over') warnings.push('Overexposed or blown highlights');
  if (std < 20) warnings.push('Very low contrast — surface detail may be hard to match');
  const aspect = width && height ? width / height : 1;
  if (aspect > 2.5 || aspect < 0.4) warnings.push('Extreme aspect ratio (possible panorama or heavy crop)');

  const quality: ImageQuality = {
    width, height, megapixels: +((width * height) / 1e6).toFixed(2), blur_score: +blur.toFixed(1), is_blurry,
    brightness: +mean.toFixed(1), contrast: +std.toFixed(1), exposure, clipped_dark: +clipped_dark.toFixed(4), clipped_bright: +clipped_bright.toFixed(4),
    resolution_ok: short >= T.minShortSide, aspect_ratio: +aspect.toFixed(3), color_hist: hist.map((h) => +(h / px).toFixed(4)), warnings,
    method: 'laplacian-variance@1024px, luminance stats, 24-bin RGB histogram',
  };
  return { quality, width, height, dhash: await dHash(buf), sha256: crypto.createHash('sha256').update(buf).digest('hex') };
}

/** 64-bit difference hash (perceptual) used for near-duplicate detection. */
export async function dHash(buf: Buffer): Promise<string> {
  const d = await sharp(buf).rotate().greyscale().resize(9, 8, { fit: 'fill' }).raw().toBuffer();
  let bits = 0n;
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) bits = (bits << 1n) | (d[y * 9 + x]! > d[y * 9 + x + 1]! ? 1n : 0n);
  return bits.toString(16).padStart(16, '0');
}
export function hamming(a: string, b: string): number {
  let x = BigInt(`0x${a}`) ^ BigInt(`0x${b}`); let c = 0;
  while (x) { c += Number(x & 1n); x >>= 1n; }
  return c;
}

export async function makeThumb(buf: Buffer): Promise<Buffer> {
  return sharp(buf).rotate().resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true }).webp({ quality: 78 }).toBuffer();
}
