import type { Manifold } from 'manifold-3d';
import { dividerHoleCutters, expandedDividerParts } from './dividerPatterns';
import { dividerSolids } from './dividers';
import { floorCutter } from './floor';
import { handleBands, handleCutters, handleSupports } from './handles';
import { buildTub, type Quality } from './basket';
import { withChamfers } from './chamfers';
import { Scope, type Wasm } from './manifold';
import type { BasketParams, WallStyle } from './params';
import { buildBraid } from './patterns/braid';
import { buildExpanded } from './patterns/expanded';
import { hexCutters } from './patterns/hex';
import { voronoiCutters } from './patterns/voronoi';
import { withStacking } from './stacking';
import { buildWeave } from './weave';
import { wovenDividers } from './weave/divider';

export type { Quality };

/** Max. surface deviation (mm) allowed when simplifying the export mesh. */
export const EXPORT_TOLERANCE = 0.02;

/** Walls built from strands or bands (no plain tub): handle bands, export simplify. */
const OPEN_WALLS: readonly WallStyle[] = ['weave', 'expanded', 'braid'];

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
    let weave: ReturnType<typeof buildWeave>['layout'] | undefined;
    if (params.wallStyle === 'weave') {
      const built = buildWeave(wasm, scope, params, quality);
      body = built.body;
      weave = built.layout;
    } else if (params.wallStyle === 'expanded') {
      body = buildExpanded(wasm, scope, params, quality);
    } else if (params.wallStyle === 'braid') {
      body = buildBraid(wasm, scope, params, quality);
    } else {
      body = buildTub(wasm, scope, params, quality);
      if (params.wallStyle === 'voronoi' || params.wallStyle === 'hex') {
        const holes =
          params.wallStyle === 'hex'
            ? hexCutters(wasm, scope, params)
            : voronoiCutters(wasm, scope, params);
        if (holes.length > 0)
          body = scope.keep(body.subtract(scope.keep(wasm.Manifold.union(holes))));
      }
    }
    // weave baskets get woven dividers, every other style plain ones (patterned below)
    const patterned = params.dividerStyle === 'pattern';
    const dividers =
      weave && patterned
        ? wovenDividers(wasm, scope, params, weave, quality)
        : dividerSolids(wasm, scope, params, quality);
    if (dividers.length > 0) {
      body = scope.keep(wasm.Manifold.union([body, ...dividers]));
      // dividers carry the wall pattern too
      const holes = patterned ? dividerHoleCutters(wasm, scope, params) : [];
      if (holes.length > 0)
        body = scope.keep(body.subtract(scope.keep(wasm.Manifold.union(holes))));
      const sheet = patterned
        ? expandedDividerParts(wasm, scope, params, quality)
        : { windows: [], strands: [] };
      if (sheet.windows.length > 0) {
        body = scope.keep(body.subtract(scope.keep(wasm.Manifold.union(sheet.windows))));
        body = scope.keep(wasm.Manifold.union([body, ...sheet.strands]));
      }
    }
    if (params.handles !== 'none') {
      // Open walls get a band closing the cut edges; hole patterns leave
      // that band solid already (clipHoles).
      const frames = OPEN_WALLS.includes(params.wallStyle)
        ? handleBands(wasm, scope, params, quality, weave)
        : [];
      if (frames.length > 0) body = scope.keep(wasm.Manifold.union([body, ...frames]));
      body = scope.keep(
        body.subtract(scope.keep(wasm.Manifold.union(handleCutters(wasm, scope, params)))),
      );
      // closed slots: breakaway ribs carry the bar above
      const ribs = handleSupports(wasm, scope, params);
      if (ribs.length > 0) body = scope.keep(wasm.Manifold.union([body, ...ribs]));
      body = dropSlivers(wasm, scope, body);
    }
    body = withStacking(wasm, scope, params, quality, body);
    // after the socket, which brings a solid floor plate of its own
    const floorHoles = floorCutter(wasm, scope, params, quality);
    if (floorHoles.length > 0)
      body = scope.keep(body.subtract(scope.keep(wasm.Manifold.union(floorHoles))));
    // last: bottom edge (elephant's foot, stacking) and top edges of rim and dividers
    body = withChamfers(wasm, scope, params, quality, body);
    // Woven export: drop vertices that move the surface by less than 0.02 mm
    // (the dense relief grid would otherwise be ~1M triangles).
    // Both calls return a new object that survives scope.dispose().
    return quality === 'export' && OPEN_WALLS.includes(params.wallStyle)
      ? body.simplify(EXPORT_TOLERANCE)
      : body.translate(0, 0, 0);
  } finally {
    scope.dispose();
  }
}

/** Volume below which a separate component is a numerical sliver (mm³). */
const SLIVER_VOLUME = 1e-3;

/**
 * Drops zero-volume shards a boolean can leave where stepped handle bands
 * meet the weave's stakes; they would be stray triangles in the export.
 */
function dropSlivers(wasm: Wasm, scope: Scope, body: Manifold): Manifold {
  const parts = body.decompose();
  if (parts.length <= 1) {
    parts.forEach((x) => x.delete());
    return body;
  }
  parts.forEach((x) => scope.keep(x));
  const kept = parts.filter((x) => Math.abs(x.volume()) > SLIVER_VOLUME);
  return scope.keep(wasm.Manifold.compose(kept));
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
