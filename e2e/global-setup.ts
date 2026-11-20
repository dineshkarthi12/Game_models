import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

/** Generates textured JPEG fixtures (no binary fixtures committed). */
export default async function globalSetup() {
  const require = createRequire(path.resolve('backend/package.json'));
  const sharp = require('sharp');
  const dir = path.resolve('e2e/.fixtures'); await fs.mkdir(dir, { recursive: true });
  for (const [i, name] of ['front', 'right', 'back', 'left'].entries()) {
    let s = 7 + i * 13; const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const circles = Array.from({ length: 500 }, () => `<circle cx="${(rnd() * 1200).toFixed(0)}" cy="${(rnd() * 900).toFixed(0)}" r="${(4 + rnd() * 26).toFixed(0)}" fill="rgb(${(rnd() * 255) | 0},${(rnd() * 255) | 0},${(rnd() * 255) | 0})"/>`).join('');
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900"><rect width="100%" height="100%" fill="#8a7f70"/>${circles}</svg>`;
    await sharp(Buffer.from(svg)).jpeg({ quality: 88 }).toFile(path.join(dir, `${name}.jpg`));
  }
}
