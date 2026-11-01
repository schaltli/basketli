import type { Manifold } from 'manifold-3d';
import { buildTub, type Quality } from './basket';
import { Scope, type Wasm } from './manifold';
import type { BasketParams } from './params';
import { buildExpanded } from './patterns/expanded';
import { voronoiCutters } from './patterns/voronoi';
import { buildWeave } from './weave';

export type { Quality };

/** Max. surface deviation (mm) allowed when simplifying the export mesh. */
export const EXPORT_TOLERANCE = 0.02;

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
    let body: Manifold;
    if (params.wallStyle === 'weave') {
      body = buildWeave(wasm, scope, params, quality).body;
    } else if (params.wallStyle === 'expanded') {
      body = buildExpanded(wasm, scope, params, quality);
    } else {
      body = buildTub(wasm, scope, params, quality);
      if (params.wallStyle === 'voronoi') {
        const holes = voronoiCutters(wasm, scope, params);
        if (holes.length > 0)
          body = scope.keep(body.subtract(scope.keep(wasm.Manifold.union(holes))));
      }
    }
    // Woven export: drop vertices that move the surface by less than 0.02 mm
    // (the dense relief grid would otherwise be ~1M triangles).
    // Both calls return a new object that survives scope.dispose().
    return quality === 'export' && (params.wallStyle === 'weave' || params.wallStyle === 'expanded')
      ? body.simplify(EXPORT_TOLERANCE)
      : body.translate(0, 0, 0);
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
