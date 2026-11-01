import type { Manifold } from 'manifold-3d';
import { buildTub, type Quality } from './basket';
import { Scope, type Wasm } from './manifold';
import type { BasketParams } from './params';
import { buildWeave } from './weave';

export type { Quality };

/** Plain triangle mesh, independent of manifold and three.js. */
export interface MeshData {
  positions: Float32Array;
  indices: Uint32Array;
}

/**
 * Builds the basket as a Manifold. The caller owns the returned object and
 * must call `.delete()` on it. `params` must already be clamped.
 */
export function buildManifold(wasm: Wasm, params: BasketParams, quality: Quality): Manifold {
  const scope = new Scope();
  try {
    const body =
      params.wallStyle === 'weave'
        ? buildWeave(wasm, scope, params, quality).body
        : buildTub(wasm, scope, params, quality);
    // A transformed copy is a new object that survives scope.dispose().
    return body.translate(0, 0, 0);
  } finally {
    scope.dispose();
  }
}

export function toMeshData(m: Manifold): MeshData {
  const mesh = m.getMesh();
  const n = mesh.numProp;
  const count = mesh.vertProperties.length / n;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    positions[i * 3] = mesh.vertProperties[i * n]!;
    positions[i * 3 + 1] = mesh.vertProperties[i * n + 1]!;
    positions[i * 3 + 2] = mesh.vertProperties[i * n + 2]!;
  }
  return { positions, indices: new Uint32Array(mesh.triVerts) };
}

/** Entry point: params → mesh. Throws if the result is not a valid manifold. */
export function build(wasm: Wasm, params: BasketParams, quality: Quality): MeshData {
  const m = buildManifold(wasm, params, quality);
  try {
    const status = m.status();
    if (status !== 'NoError') throw new Error(`Geometry invalid: ${status}`);
    return toMeshData(m);
  } finally {
    m.delete();
  }
}
