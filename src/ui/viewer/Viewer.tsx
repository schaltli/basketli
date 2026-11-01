import { Grid, OrbitControls } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useEffect, useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import { toCreasedNormals } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { MeshData } from '../../geometry/build';
import type { BasketParams } from '../../geometry/params';
import { materialFor } from './materials';

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

/** 3D scene. Geometry uses Z-up (mm); the group rotates it into three.js Y-up. */
export function Viewer({ mesh, params }: ViewerProps) {
  const geometry = useGeometry(
    mesh,
    params.wallStyle === 'weave' ? CREASE_ANGLE.smooth : CREASE_ANGLE.hard,
  );
  const size = Math.max(params.width, params.depth, params.height);
  const dist = size * 1.8;

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
      <OrbitControls makeDefault target={[0, params.height / 2, 0]} />
    </Canvas>
  );
}
