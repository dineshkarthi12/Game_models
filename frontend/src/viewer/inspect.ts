import * as THREE from 'three';

export interface TextureInfo { key: string; name: string; slot: string; material: string; width: number; height: number; preview: string | null; colorSpace: string }
export interface MaterialInfo { name: string; type: string; color: string | null; roughness: number | null; metalness: number | null; maps: string[]; transparent: boolean; doubleSided: boolean; ref: THREE.Material }
export interface BoneInfo { name: string; depth: number }
export interface SceneInfo {
  meshes: number; triangles: number; vertices: number; materials: MaterialInfo[]; textures: TextureInfo[]; bones: BoneInfo[];
  animations: { name: string; duration: number; tracks: number }[]; hasUV: boolean; uvMeshes: THREE.Mesh[];
}

const SLOTS = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'alphaMap'] as const;
const SLOT_LABEL: Record<string, string> = { map: 'Base Color', normalMap: 'Normal', roughnessMap: 'Roughness', metalnessMap: 'Metallic', aoMap: 'Ambient Occlusion', emissiveMap: 'Emissive', alphaMap: 'Alpha' };

function preview(tex: THREE.Texture, size = 256): string | null {
  const img = tex.image as (HTMLImageElement | ImageBitmap | HTMLCanvasElement) & { width: number; height: number } | undefined;
  if (!img || !img.width) return null;
  try {
    const c = document.createElement('canvas'); const s = Math.min(1, size / Math.max(img.width, img.height));
    c.width = Math.max(1, Math.round(img.width * s)); c.height = Math.max(1, Math.round(img.height * s));
    const ctx = c.getContext('2d'); if (!ctx) return null;
    if (tex.flipY === false) ctx.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height); else { ctx.translate(0, c.height); ctx.scale(1, -1); ctx.drawImage(img as CanvasImageSource, 0, 0, c.width, c.height); }
    return c.toDataURL('image/png');
  } catch { return null; }
}

export function inspectScene(root: THREE.Object3D, animations: THREE.AnimationClip[]): SceneInfo {
  const mats = new Map<THREE.Material, MaterialInfo>(); const texs = new Map<string, TextureInfo>();
  let tris = 0; let verts = 0; let meshes = 0; let hasUV = false; const uvMeshes: THREE.Mesh[] = [];
  const bones: BoneInfo[] = []; const seenBones = new Set<THREE.Bone>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) {
      meshes++;
      const g = m.geometry as THREE.BufferGeometry;
      const pos = g.getAttribute('position'); verts += pos?.count ?? 0;
      tris += g.index ? g.index.count / 3 : (pos?.count ?? 0) / 3;
      if (g.getAttribute('uv')) { hasUV = true; uvMeshes.push(m); }
      for (const mat of Array.isArray(m.material) ? m.material : [m.material]) {
        if (mats.has(mat)) continue;
        const std = mat as THREE.MeshStandardMaterial;
        const maps: string[] = [];
        for (const slot of SLOTS) {
          const t = (std as unknown as Record<string, THREE.Texture | null>)[slot];
          if (!t) continue;
          maps.push(SLOT_LABEL[slot]!);
          const key = `${t.uuid}:${slot}`;
          if (!texs.has(key)) {
            const img = t.image as { width?: number; height?: number } | undefined;
            texs.set(key, { key, name: t.name || `${std.name || 'material'} ${SLOT_LABEL[slot]}`, slot: SLOT_LABEL[slot]!, material: std.name || 'material', width: img?.width ?? 0, height: img?.height ?? 0, preview: preview(t), colorSpace: t.colorSpace });
          }
        }
        mats.set(mat, {
          name: mat.name || `Material ${mats.size + 1}`, type: mat.type, color: std.color ? `#${std.color.getHexString()}` : null,
          roughness: typeof std.roughness === 'number' ? std.roughness : null, metalness: typeof std.metalness === 'number' ? std.metalness : null,
          maps, transparent: mat.transparent, doubleSided: mat.side === THREE.DoubleSide, ref: mat,
        });
      }
    }
    const sk = o as THREE.SkinnedMesh;
    if (sk.isSkinnedMesh && sk.skeleton) {
      const walk = (b: THREE.Object3D, d: number) => { if ((b as THREE.Bone).isBone && !seenBones.has(b as THREE.Bone)) { seenBones.add(b as THREE.Bone); bones.push({ name: b.name || 'bone', depth: d }); } b.children.forEach((c) => walk(c, d + 1)); };
      const roots = sk.skeleton.bones.filter((b) => !(b.parent as THREE.Bone)?.isBone);
      roots.forEach((r) => walk(r, 0));
    }
  });
  return {
    meshes, triangles: Math.round(tris), vertices: verts, materials: [...mats.values()], textures: [...texs.values()], bones, hasUV, uvMeshes,
    animations: animations.map((a) => ({ name: a.name || 'Animation', duration: a.duration, tracks: a.tracks.length })),
  };
}

let checker: THREE.DataTexture | null = null;
export function checkerTexture() {
  if (checker) return checker;
  const n = 512; const cells = 16; const data = new Uint8Array(n * n * 4);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const c = (Math.floor((x * cells) / n) + Math.floor((y * cells) / n)) % 2;
    const i = (y * n + x) * 4; const v = c ? 236 : 104;
    data[i] = c ? 236 : 104; data[i + 1] = c ? 233 : 68; data[i + 2] = c ? 247 : 245; data[i + 3] = 255; void v;
  }
  checker = new THREE.DataTexture(data, n, n); checker.wrapS = checker.wrapT = THREE.RepeatWrapping; checker.colorSpace = THREE.SRGBColorSpace; checker.needsUpdate = true;
  return checker;
}
