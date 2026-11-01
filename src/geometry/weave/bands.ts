import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import type { Vec2 } from '../shapes';
import type { WeaveLayout } from './layout';
import { displacement } from './path';

export const BAND_SAMPLES_PER_STAKE = { preview: 16, export: 32 } as const;
/** Rows overlap the row below by this much so they fuse at the crossings. */
const ROW_OVERLAP = 0.05;

/** Wavy centerline of one row (closed, counter-clockwise). */
export function bandCenterline(layout: WeaveLayout, row: number, quality: Quality): Vec2[] {
  const count = layout.stakeCount * BAND_SAMPLES_PER_STAKE[quality];
  const pts: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const s = (i / count) * layout.path.length;
    const { p, n } = layout.path.at(s);
    const d = displacement(layout, row, s);
    pts.push([p[0] + n[0] * d, p[1] + n[1] * d]);
  }
  return pts;
}

/**
 * One flat band per row: the wavy centerline thickened to the material
 * thickness and extruded straight up (vertical faces → every layer of a row
 * lies exactly on the one below).
 */
export function bandSolids(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  layout: WeaveLayout,
  quality: Quality,
): Manifold[] {
  const { CrossSection } = wasm;
  const half = p.weave.materialThickness / 2;
  return layout.rows.map((r, i) => {
    const line = scope.keep(CrossSection.ofPolygons([bandCenterline(layout, i, quality)]));
    const ring = scope.keep(
      scope.keep(line.offset(half, 'Round')).subtract(scope.keep(line.offset(-half, 'Round'))),
    );
    const z0 = i === 0 ? r.z0 : r.z0 - ROW_OVERLAP;
    return scope.keep(scope.keep(ring.extrude(r.z1 - z0)).translate(0, 0, z0));
  });
}
