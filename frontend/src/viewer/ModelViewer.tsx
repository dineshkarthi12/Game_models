import { Component, Suspense, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, Grid } from '@react-three/drei';
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import { AlertTriangle } from 'lucide-react';
import { useViewer, cameraSync, type ViewDir } from './store';
import { checkerTexture, inspectScene, type SceneInfo } from './inspect';

const BG = { light: '#EEF0F6', white: '#FFFFFF', dark: '#1B2133' } as const;
const DIRS: Record<ViewDir, [number, number, number]> = { front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0], top: [0, 1, 0.0001], bottom: [0, -1, 0.0001], iso: [0.75, 0.45, 1] };

class ErrorBoundary extends Component<{ children: ReactNode; onError: (m: string) => void }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(e: Error) { this.props.onError(e.message || 'Failed to load model'); }
  render() { return this.state.err ? null : this.props.children; }
}

function Lights() {
  const lighting = useViewer((s) => s.lighting);
  const k = lighting === 'soft' ? [1.1, 0.6, 0.3] : lighting === 'dramatic' ? [0.25, 2.2, 0.15] : [0.7, 1.4, 0.6];
  return (
    <>
      <hemisphereLight args={['#ffffff', '#c9cede', k[0]]} />
      <directionalLight position={[3, 5, 4]} intensity={k[1]} />
      <directionalLight position={[-4, 2, -3]} intensity={k[2]} />
      <ambientLight intensity={lighting === 'soft' ? 0.4 : 0.15} />
    </>
  );
}

function Model({ url, onInfo, onBounds, onLoadProgress }: { url: string; onInfo?: (i: SceneInfo, gltf: GLTF) => void; onBounds: (b: THREE.Box3) => void; onLoadProgress: (p: number | null) => void }) {
  // Real byte-level progress from the loader (null when the server does not send Content-Length).
  const gltf = useLoader(GLTFLoader, url, undefined, (e) => onLoadProgress(e.total ? (e.loaded / e.total) * 100 : null)) as GLTF;
  const scene = useMemo(() => cloneSkinned(gltf.scene), [gltf]);
  const { mode, showSkeleton, clip, playing } = useViewer();
  const originals = useRef(new Map<THREE.Mesh, THREE.Material | THREE.Material[]>());
  const overlays = useRef<THREE.LineSegments[]>([]);
  const mixer = useMemo(() => new THREE.AnimationMixer(scene), [scene]);
  const { scene: root } = useThree();

  useEffect(() => {
    const box = new THREE.Box3().setFromObject(scene);
    onBounds(box);
    onInfo?.(inspectScene(scene, gltf.animations), gltf);
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      // Meshes without normals (some scans) render black with override materials: compute display normals.
      if (!m.geometry.getAttribute('normal')) m.geometry.computeVertexNormals();
      originals.current.set(m, m.material);
    });
    return () => { mixer.stopAllAction(); };
  }, [scene]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    overlays.current.forEach((l) => { l.parent?.remove(l); l.geometry.dispose(); (l.material as THREE.Material).dispose(); });
    overlays.current = [];
    const clay = new THREE.MeshStandardMaterial({ color: '#d9dbe4', roughness: 0.75, metalness: 0, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
    const normals = new THREE.MeshNormalMaterial();
    const uv = new THREE.MeshStandardMaterial({ map: checkerTexture(), roughness: 0.9 });
    originals.current.forEach((orig, mesh) => {
      if (mode === 'shaded') mesh.material = orig;
      else if (mode === 'clay') mesh.material = clay;
      else if (mode === 'normals') mesh.material = normals;
      else if (mode === 'uv') mesh.material = uv;
      else if (mode === 'wireframe') {
        mesh.material = clay;
        const line = new THREE.LineSegments(new THREE.WireframeGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#6844F5', transparent: true, opacity: 0.55 }));
        mesh.add(line); overlays.current.push(line);
      }
    });
    return () => { clay.dispose(); normals.dispose(); uv.dispose(); };
  }, [mode, scene]);

  useEffect(() => {
    if (!showSkeleton) return;
    const helper = new THREE.SkeletonHelper(scene);
    (helper.material as THREE.LineBasicMaterial).depthTest = false;
    root.add(helper);
    return () => { root.remove(helper); helper.dispose(); };
  }, [showSkeleton, scene, root]);

  useEffect(() => {
    mixer.stopAllAction();
    const c = gltf.animations.find((a) => a.name === clip) ?? (clip ? gltf.animations[0] : null);
    if (c && playing) mixer.clipAction(c).reset().play();
  }, [clip, playing, gltf, mixer]);
  useFrame((_, dt) => mixer.update(dt));

  return <primitive object={scene} />;
}

function PointCloud({ url }: { url: string }) {
  const gltf = useLoader(GLTFLoader, url) as GLTF;
  const obj = useMemo(() => {
    const s = gltf.scene.clone();
    s.traverse((o) => { const p = o as THREE.Points; if (p.isPoints) p.material = new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: !!p.geometry.getAttribute('color') }); });
    return s;
  }, [gltf]);
  return <primitive object={obj} />;
}

interface CamPose { center: number[]; rotation: number[][]; fx: number; width: number; height: number }
function Cameras({ url, size }: { url: string; size: number }) {
  const [cams, setCams] = useState<CamPose[]>([]);
  useEffect(() => { let on = true; fetch(url).then((r) => r.json()).then((c) => on && setCams(c)).catch(() => {}); return () => { on = false; }; }, [url]);
  const geom = useMemo(() => {
    const pts: number[] = []; const d = size * 0.08;
    for (const c of cams) {
      const R = new THREE.Matrix3().set(...(c.rotation.flat() as [number, number, number, number, number, number, number, number, number]));
      const C = new THREE.Vector3(...(c.center as [number, number, number]));
      const hw = (c.width / 2 / c.fx) * d; const hh = (c.height / 2 / c.fx) * d;
      const corners = [[-hw, -hh, d], [hw, -hh, d], [hw, hh, d], [-hw, hh, d]].map((p) => new THREE.Vector3(...(p as [number, number, number])).applyMatrix3(R).add(C));
      for (let i = 0; i < 4; i++) { pts.push(...C.toArray(), ...corners[i]!.toArray(), ...corners[i]!.toArray(), ...corners[(i + 1) % 4]!.toArray()); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3)); return g;
  }, [cams, size]);
  return <lineSegments geometry={geom}><lineBasicMaterial color="#4C8DFF" /></lineSegments>;
}

function CameraRig({ bounds, syncId }: { bounds: THREE.Box3 | null; syncId?: string }) {
  const { camera, controls } = useThree() as unknown as { camera: THREE.PerspectiveCamera; controls: OrbitControlsImpl | null };
  const req = useViewer((s) => s.viewRequest);
  const fit = (dir: ViewDir) => {
    if (!bounds || bounds.isEmpty() || !controls) return;
    const center = bounds.getCenter(new THREE.Vector3()); const r = bounds.getBoundingSphere(new THREE.Sphere()).radius || 1;
    const dist = r / Math.sin(THREE.MathUtils.degToRad(camera.fov / 2)) * 1.05;
    camera.position.copy(center).add(new THREE.Vector3(...DIRS[dir]).normalize().multiplyScalar(dist));
    camera.near = dist / 200; camera.far = dist * 50; camera.updateProjectionMatrix();
    controls.target.copy(center); controls.update();
  };
  useEffect(() => { fit('iso'); }, [bounds, controls]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (req) fit(req.dir); }, [req]); // eslint-disable-line react-hooks/exhaustive-deps
  useFrame(() => {
    if (!syncId || !controls) return;
    if (cameraSync.source && cameraSync.source !== syncId && cameraSync.position && cameraSync.target) {
      camera.position.set(...cameraSync.position); controls.target.set(...cameraSync.target); controls.update();
    }
  });
  useEffect(() => {
    if (!syncId || !controls) return;
    const onStart = () => { cameraSync.source = syncId; };
    const onChange = () => { if (cameraSync.source === syncId) { cameraSync.position = camera.position.toArray() as [number, number, number]; cameraSync.target = controls.target.toArray() as [number, number, number]; } };
    controls.addEventListener('start', onStart); controls.addEventListener('change', onChange);
    return () => { controls.removeEventListener('start', onStart); controls.removeEventListener('change', onChange); };
  }, [controls, syncId, camera]);
  return null;
}

export function ModelViewer({ url, pointCloudUrl, camerasUrl, onInfo, syncId, className, onProgress }: {
  url: string; pointCloudUrl?: string | null; camerasUrl?: string | null; onInfo?: (i: SceneInfo, gltf: GLTF) => void; syncId?: string; className?: string; onProgress?: (p: number | null) => void;
}) {
  const { autoRotate, grid, background, showPointCloud, showCameras } = useViewer();
  const [bounds, setBounds] = useState<THREE.Box3 | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  useEffect(() => { setError(null); setBounds(null); setLoading(true); setProgress(null); }, [url]);
  const size = bounds ? bounds.getSize(new THREE.Vector3()).length() : 1;
  const floorY = bounds && !bounds.isEmpty() ? bounds.min.y : 0;

  return (
    <div className={className} style={{ position: 'relative' }}>
      <Canvas dpr={[1, 2]} camera={{ fov: 40, position: [2, 1.5, 3] }} gl={{ antialias: true, preserveDrawingBuffer: true }} frameloop="always"
        onCreated={({ gl }) => { gl.toneMapping = THREE.ACESFilmicToneMapping; gl.outputColorSpace = THREE.SRGBColorSpace; }}>
        <color attach="background" args={[BG[background]]} />
        <Lights />
        <ErrorBoundary key={url} onError={setError}>
          <Suspense fallback={null}>
            <Model url={url} onInfo={onInfo} onBounds={(b) => { setBounds(b); setLoading(false); onProgress?.(null); }} onLoadProgress={(p) => { setProgress(p); onProgress?.(p); }} />
            {showPointCloud && pointCloudUrl && <PointCloud url={pointCloudUrl} />}
          </Suspense>
        </ErrorBoundary>
        {showCameras && camerasUrl && <Cameras url={camerasUrl} size={size} />}
        {grid && <Grid position={[0, floorY - size * 0.001, 0]} infiniteGrid cellSize={size / 40} sectionSize={size / 8} cellColor={background === 'dark' ? '#2E3650' : '#D6DBE7'} sectionColor={background === 'dark' ? '#4C5675' : '#B39FFC'} fadeDistance={size * 6} fadeStrength={2} />}
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} autoRotate={autoRotate} autoRotateSpeed={1.6} />
        <CameraRig bounds={bounds} syncId={syncId} />
      </Canvas>
      {loading && !error && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="w-48 rounded-lg bg-surface/95 px-4 py-3 text-center text-[13px] font-medium text-ink-muted shadow-card" role="status">
            Loading model{progress != null ? ` · ${Math.round(progress)}%` : '…'}
            {progress != null && <div className="mt-2 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand" style={{ width: `${progress}%` }} /></div>}
          </div>
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center p-6">
          <div className="max-w-sm rounded-xl border border-danger/30 bg-surface p-4 text-center shadow-raised" role="alert">
            <AlertTriangle className="mx-auto size-6 text-danger" /><p className="mt-2 text-sm font-semibold">The model could not be loaded</p><p className="mt-1 text-xs text-ink-muted">{error}</p>
          </div>
        </div>
      )}
    </div>
  );
}
