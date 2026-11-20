import { useMemo } from 'react';
import { Camera } from 'lucide-react';
import { cn } from '@/utils/cn';

type V3 = [number, number, number];

/** Build a low-poly lathe (statue/vase-like) mesh and project it with flat shading. */
function useLatheFaces(segments: number, rotY: number, profile: [number, number][]) {
  return useMemo(() => {
    const verts: V3[][] = profile.map(([r, y]) =>
      Array.from({ length: segments }, (_, i) => {
        const a = (i / segments) * Math.PI * 2 + rotY;
        return [Math.cos(a) * r, y, Math.sin(a) * r] as V3;
      }),
    );
    const faces: { pts: V3[]; depth: number; shade: number; wire: boolean }[] = [];
    const light: V3 = norm([-0.5, 0.7, 0.6]);
    const tiltX = -0.38;
    const rot = (p: V3): V3 => [p[0], p[1] * Math.cos(tiltX) - p[2] * Math.sin(tiltX), p[1] * Math.sin(tiltX) + p[2] * Math.cos(tiltX)];
    for (let r = 0; r < verts.length - 1; r++) {
      for (let i = 0; i < segments; i++) {
        const a = rot(verts[r][i]), b = rot(verts[r][(i + 1) % segments]), c = rot(verts[r + 1][(i + 1) % segments]), d = rot(verts[r + 1][i]);
        for (const tri of [[a, b, c], [a, c, d]] as V3[][]) {
          const n = norm(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
          if (n[2] < 0) continue; // back-face cull (camera looks down -z)
          const shade = Math.max(0.15, dot(n, light));
          const cx = (tri[0][0] + tri[1][0] + tri[2][0]) / 3;
          faces.push({ pts: tri, depth: (tri[0][2] + tri[1][2] + tri[2][2]) / 3, shade, wire: cx < -0.05 });
        }
      }
    }
    faces.sort((f, g) => f.depth - g.depth);
    return faces;
  }, [segments, rotY, profile]);
}
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const STATUE: [number, number][] = [
  [0.95, -1.3], [0.95, -1.05], [0.78, -0.98], [0.62, -0.7], [0.5, -0.35], [0.58, 0.0], [0.7, 0.3], [0.66, 0.6], [0.45, 0.85], [0.3, 0.98], [0.42, 1.12], [0.36, 1.3], [0.0, 1.38],
];

export function FacetedModel({ className, split = true, segments = 14, rotY = 0.35, size = 320 }: { className?: string; split?: boolean; segments?: number; rotY?: number; size?: number }) {
  const faces = useLatheFaces(segments, rotY, STATUE);
  const s = size / 3.2; const ox = size / 2; const oy = size / 2;
  const toPts = (p: V3[]) => p.map((v) => `${(ox + v[0] * s).toFixed(1)},${(oy - v[1] * s).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className={cn('h-auto w-full', className)} aria-hidden>
      <ellipse cx={ox} cy={oy + 1.32 * s} rx={1.15 * s} ry={0.22 * s} fill="#18213B" opacity="0.08" />
      {faces.map((f, i) => {
        const wire = split && f.wire;
        const l = Math.round(60 + f.shade * 34);
        return (
          <polygon key={i} points={toPts(f.pts)}
            fill={wire ? `rgba(104,68,245,${0.05 + f.shade * 0.08})` : `hsl(38 22% ${l}%)`}
            stroke={wire ? '#6844F5' : `hsl(38 18% ${l - 8}%)`} strokeWidth={wire ? 0.8 : 0.4} strokeLinejoin="round" />
        );
      })}
    </svg>
  );
}

function PhotoCard({ x, y, rot, hue, label }: { x: number; y: number; rot: number; hue: number; label: string }) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${rot})`}>
      <rect width="118" height="96" rx="8" fill="#fff" stroke="#E7EAF2" />
      <rect x="6" y="6" width="106" height="72" rx="5" fill={`hsl(${hue} 30% 86%)`} />
      <rect x="6" y="54" width="106" height="24" fill={`hsl(${hue} 22% 74%)`} />
      <path d="M48 58 q11 -30 22 0 z M53 40 a6.5 6.5 0 1 0 13 0 a6.5 6.5 0 1 0 -13 0" fill="hsl(38 18% 62%)" />
      <text x="10" y="90" fontSize="8.5" fontFamily="Inter, sans-serif" fontWeight="600" fill="#69738A">{label}</text>
    </g>
  );
}

export function HeroIllustration({ className }: { className?: string }) {
  const points = useMemo(() => Array.from({ length: 140 }, (_, i) => {
    const a = i * 2.39996; const r = Math.sqrt(i / 140);
    return { x: Math.cos(a) * r * 34, y: Math.sin(a) * r * 60 + (i % 7) - 3 };
  }), []);
  return (
    <div className={cn('relative', className)}>
      <svg viewBox="0 0 560 420" className="h-auto w-full" role="img" aria-label="Photographs from several angles become a point cloud and then a textured 3D model">
        <PhotoCard x={10} y={40} rot={-6} hue={120} label="Front" />
        <PhotoCard x={34} y={160} rot={3} hue={140} label="Left 45°" />
        <PhotoCard x={14} y={280} rot={-3} hue={100} label="Back" />
        <g transform="translate(205 210)">
          {points.map((p, i) => <circle key={i} cx={p.x} cy={p.y} r="1.6" fill={i % 3 ? '#6844F5' : '#4C8DFF'} opacity="0.7" />)}
          <text x="0" y="90" textAnchor="middle" fontSize="10" fontFamily="Inter, sans-serif" fontWeight="600" fill="#69738A">Sparse points</text>
        </g>
        <path d="M150 210 h22" stroke="#6844F5" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#arrow)" />
        <path d="M250 210 h22" stroke="#6844F5" strokeWidth="2.5" strokeLinecap="round" markerEnd="url(#arrow)" />
        <defs><marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0 0 L10 5 L0 10 z" fill="#6844F5" /></marker></defs>
      </svg>
      <div className="absolute right-0 top-[4%] w-[52%]"><FacetedModel /></div>
    </div>
  );
}

export function CaptureRingIllustration({ className }: { className?: string }) {
  const cams = Array.from({ length: 8 }, (_, i) => (i / 8) * Math.PI * 2);
  return (
    <div className={cn('relative aspect-square', className)}>
      <svg viewBox="0 0 400 400" className="absolute inset-0 h-full w-full" aria-hidden>
        <ellipse cx="200" cy="250" rx="170" ry="62" fill="none" stroke="#B39FFC" strokeDasharray="4 6" />
        <ellipse cx="200" cy="150" rx="120" ry="40" fill="none" stroke="#DCE8FF" strokeDasharray="4 6" />
      </svg>
      <div className="absolute left-1/2 top-[18%] w-[52%] -translate-x-1/2"><FacetedModel segments={16} /></div>
      {cams.map((a, i) => (
        <div key={i} className="absolute grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-brand-200 bg-white text-brand shadow-card"
          style={{ left: `${50 + Math.cos(a) * 42.5}%`, top: `${62.5 + Math.sin(a) * 15.5}%` }}>
          <Camera className="size-4" />
        </div>
      ))}
    </div>
  );
}
