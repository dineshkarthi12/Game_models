import sharp from 'sharp';

/** Deterministic textured RGB image (pseudo-random blobs) — rich in features for matching. */
export async function texturedImage(w = 1600, h = 1200, seed = 1, opts: { blur?: number; shiftX?: number } = {}) {
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const W = w + 400; const shapes: string[] = [];
  for (let i = 0; i < 900; i++) {
    const x = rnd() * W; const y = rnd() * h; const r = 4 + rnd() * 30;
    shapes.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="rgb(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0})"/>`);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${h}"><rect width="100%" height="100%" fill="#8a7f70"/>${shapes.join('')}</svg>`;
  let img = sharp(Buffer.from(svg)).extract({ left: opts.shiftX ?? 0, top: 0, width: w, height: h });
  let buf = await img.jpeg({ quality: 90 }).toBuffer();
  if (opts.blur) buf = await sharp(buf).blur(opts.blur).jpeg({ quality: 90 }).toBuffer();
  void img; img = sharp(buf);
  return buf;
}
