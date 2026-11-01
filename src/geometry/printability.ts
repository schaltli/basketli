import type { Manifold } from 'manifold-3d';
import { Scope } from './manifold';

export interface OverhangReport {
  /** Largest unsupported area found in a single layer (mm²). */
  maxArea: number;
  /** Height of that layer (mm). */
  worstZ: number;
}

/**
 * Slices the body layer by layer and measures how much of each layer is not
 * supported by the layer below within a 45° overhang (lateral reach = layer
 * height). Bridges count as unsupported: basketli geometry must print with
 * no support and no bridging.
 *
 * Unsupported specks narrower than `minFeature` (half a 0.4 mm extrusion
 * line) are ignored: they cannot be printed as separate features anyway.
 */
export function overhangReport(
  m: Manifold,
  layer = 0.2,
  tolerance = 0.02,
  minFeature = 0.2,
): OverhangReport {
  const box = m.boundingBox();
  const scope = new Scope();
  let maxArea = 0;
  let worstZ = 0;
  try {
    let prev = scope.keep(m.slice(box.min[2] + layer / 2));
    for (let z = box.min[2] + layer * 1.5; z < box.max[2]; z += layer) {
      const cur = scope.keep(m.slice(z));
      const allowed = scope.keep(prev.offset(layer + tolerance, 'Round'));
      const unsupported = scope.keep(cur.subtract(allowed));
      const area = scope.keep(unsupported.offset(-minFeature / 2, 'Round')).area();
      if (area > maxArea) {
        maxArea = area;
        worstZ = z;
      }
      prev = cur;
    }
  } finally {
    scope.dispose();
  }
  return { maxArea, worstZ };
}
