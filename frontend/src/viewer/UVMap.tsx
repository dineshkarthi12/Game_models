import { useEffect, useRef, useState } from 'react';
import type * as THREE from 'three';

/** Draws the UV layout (triangle edges in 0–1 UV space), optionally over the base colour texture. */
export function UVMap({ meshes, texture, size = 512 }: { meshes: THREE.Mesh[]; texture?: string | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [drawn, setDrawn] = useState<{ drawn: number; total: number } | null>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    const ctx = c.getContext('2d')!; ctx.clearRect(0, 0, size, size);
    const MAX = 25000;
    const draw = () => {
      ctx.strokeStyle = 'rgba(104,68,245,0.55)'; ctx.lineWidth = 0.5;
      let tris = 0; let total = 0;
      for (const m of meshes) { const g = m.geometry; total += (g.index ? g.index.count : g.getAttribute('position').count) / 3; }
      const stride = Math.max(1, Math.ceil(total / MAX));
      for (const m of meshes) {
        const g = m.geometry; const uv = g.getAttribute('uv'); if (!uv) continue;
        const idx = g.index; const n = idx ? idx.count : uv.count;
        ctx.beginPath(); let inPath = 0;
        for (let t = 0; t * 3 + 2 < n; t += stride) {
          const i = t * 3;
          const a = idx ? idx.getX(i) : i, b = idx ? idx.getX(i + 1) : i + 1, d = idx ? idx.getX(i + 2) : i + 2;
          ctx.moveTo(uv.getX(a) * size, (1 - uv.getY(a)) * size); ctx.lineTo(uv.getX(b) * size, (1 - uv.getY(b)) * size);
          ctx.lineTo(uv.getX(d) * size, (1 - uv.getY(d)) * size); ctx.closePath(); tris++;
          // Stroke in small batches: one huge path is extremely slow to rasterise.
          if (++inPath >= 500) { ctx.stroke(); ctx.beginPath(); inPath = 0; }
        }
        ctx.stroke();
      }
      setDrawn({ drawn: tris, total: Math.round(total) });
    };
    if (texture) { const img = new Image(); img.onload = () => { ctx.globalAlpha = 0.85; ctx.drawImage(img, 0, 0, size, size); ctx.globalAlpha = 1; draw(); }; img.src = texture; }
    else { ctx.fillStyle = '#F7F8FC'; ctx.fillRect(0, 0, size, size); draw(); }
  }, [meshes, texture, size]);
  return (
    <>
      <canvas ref={ref} width={size} height={size} className="aspect-square w-full rounded-lg border border-line" role="img" aria-label="UV layout" />
      {drawn && drawn.drawn < drawn.total && <p className="mt-1 text-[11px] text-ink-subtle">Showing {drawn.drawn.toLocaleString()} of {drawn.total.toLocaleString()} triangles for responsiveness.</p>}
    </>
  );
}
