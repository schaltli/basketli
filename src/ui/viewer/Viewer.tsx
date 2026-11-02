import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import { useEffect, useMemo, useRef, useState } from 'react';
import { BufferAttribute, BufferGeometry, PerspectiveCamera, Vector3 } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshData } from '../../geometry/build';
import type { BasketParams } from '../../geometry/params';
import { DimensionLabels } from './DimensionLabels';
import { materialFor } from './materials';
import { useViewLock } from './viewLock';

/** The camera re-fits once a size has been still for this long (ms). */
const FIT_DELAY_MS = 300;

/** Edges sharper than this stay hard; the woven relief is shaded smoothly. */
const CREASE_ANGLE = { hard: Math.PI / 6, smooth: (Math.PI * 11) / 36 } as const;

function useGeometry(mesh: MeshData | undefined, crease: number): BufferGeometry | undefined {
  const geometry = useMemo(() => {
    if (!mesh) return undefined;
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(mesh.positions, 3));
    g.setIndex(new BufferAttribute(mesh.indices, 1));
    const creased = toCreasedNormals(g, crease);
    g.dispose();
    return creased;
  }, [mesh, crease]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  return geometry;
}

interface ViewerProps {
  mesh: MeshData | undefined;
  params: BasketParams;
}

/**
 * Keeps the whole basket in view when its size changes: keeps the current
 * viewing direction and moves the camera to a distance that fits the box.
 */
function CameraFit({ width, depth, height }: { width: number; depth: number; height: number }) {
  const get = useThree((s) => s.get);
  const editing = useViewLock((s) => s.editing);
  const first = useRef(true);
  useEffect(() => {
    // While a dimension label is edited the view holds still; it fits once
    // the editor closes. Slider drags in the panel fit after a short pause.
    if (editing) return;
    const fit = () => {
      const { camera, controls } = get();
      const orbit = controls as { target?: Vector3; update?: () => void } | null;
      const target = new Vector3(0, height / 2, 0);
      const radius = Math.hypot(width, depth, height) / 2;
      const fov = camera instanceof PerspectiveCamera ? camera.fov : 40;
      const distance = (radius / Math.sin(((fov / 2) * Math.PI) / 180)) * 1.1;
      const from = orbit?.target ?? new Vector3(0, 0, 0);
      const dir = camera.position.clone().sub(from).normalize();
      if (dir.lengthSq() === 0) dir.set(0.5, 0.45, 0.75).normalize();
      camera.position.copy(target.clone().add(dir.multiplyScalar(distance)));
      camera.far = Math.max(5000, distance * 10);
      camera.updateProjectionMatrix();
      if (orbit?.target) {
        orbit.target.copy(target);
        orbit.update?.();
      }
    };
    if (first.current) {
      first.current = false;
      fit();
      return;
    }
    const timer = setTimeout(fit, FIT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [get, width, depth, height, editing]);
  return null;
}

/** 3D scene. Geometry uses Z-up (mm); the group rotates it into three.js Y-up. */
export function Viewer({ mesh, params }: ViewerProps) {
  const geometry = useGeometry(
    mesh,
    params.wallStyle === 'weave' ? CREASE_ANGLE.smooth : CREASE_ANGLE.hard,
  );
  const size = Math.max(params.width, params.depth, params.height);
  const dist = size * 1.8;
  // Only the start value: afterwards CameraFit moves the target, so a size
  // change never swings the view behind its back.
  const [initialTarget] = useState<[number, number, number]>(() => [0, params.height / 2, 0]);

  return (
    <Canvas
      camera={{ position: [dist * 0.8, dist * 0.7, dist], fov: 40, near: 1, far: 5000 }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#f4f1ec']} />
      <hemisphereLight args={['#ffffff', '#b8ad9e', 1.2]} />
      <directionalLight position={[200, 400, 300]} intensity={1.8} />
      <directionalLight position={[-300, 200, -200]} intensity={0.5} />
      <group rotation={[-Math.PI / 2, 0, 0]}>
        {geometry && (
          <mesh geometry={geometry}>
            <meshStandardMaterial {...materialFor(params.wallStyle)} />
          </mesh>
        )}
        <DimensionLabels params={params} />
      </group>
      <Grid
        args={[1000, 1000]}
        cellSize={10}
        sectionSize={50}
        cellColor="#d8d0c4"
        sectionColor="#bfb3a3"
        fadeDistance={size * 6}
        position={[0, -0.01, 0]}
      />
      <OrbitControls makeDefault target={initialTarget} />
      <CameraFit width={params.width} depth={params.depth} height={params.height} />
    </Canvas>
  );
}
