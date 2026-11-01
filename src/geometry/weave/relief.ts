import type { Quality } from '../basket';
import type { BasketParams } from '../params';
import type { WeaveLayout } from './layout';
import { displacement } from './path';

/** Minimum wall thickness everywhere except the very top of the rim. */
export const MIN_WALL = 1.0;
/** Thickness of the rounded rim's top cap. */
const RIM_TOP = 0.4;

export const RELIEF_RESOLUTION = {
  preview: { columnsPerStake: 12, dz: 0.5 },
  export: { columnsPerStake: 24, dz: 0.25 },
} as const;

/**
 * Wall as a height field: for every column (arc position s) and height z the
 * inner and outer surface offset along the outward wall normal, measured
 * from the weave centerline.
 */
export interface ReliefField {
  s: Float64Array;
  z: Float64Array;
  /** Row-major [column][height]. */
  inner: Float64Array;
  outer: Float64Array;
}

/** Strand thickness factor across a row (1 = full thickness, rounded edges). */
function strandShape(p: BasketParams, zeta: number): number {
  const w = p.weave;
  const r0 = Math.min(1, Math.max(0.3, MIN_WALL / w.materialThickness));
  const edge = Math.min(zeta, 1 - zeta) * w.materialHeight;
  const round = w.material === 'cane' ? w.materialHeight / 2 : Math.min(w.materialHeight / 2, 1.5);
  if (edge >= round) return 1;
  const x = 1 - edge / round;
  return r0 + (1 - r0) * Math.sqrt(Math.max(0, 1 - x * x));
}

/** Height samples: coarse in the foot band, fine where the wall changes. */
function heights(p: BasketParams, layout: WeaveLayout, dz: number): number[] {
  const zs = [0];
  const start = layout.footHeight;
  zs.push(start);
  const steps = Math.ceil((p.height - start) / dz);
  for (let i = 1; i <= steps; i++) zs.push(start + ((p.height - start) * i) / steps);
  return zs;
}

/** Target (unfiltered) wall interval at column s and height z. */
function target(
  p: BasketParams,
  layout: WeaveLayout,
  s: number,
  z: number,
  stakeHalf: number,
): [number, number] {
  const half = layout.span / 2;
  let lo: number;
  let hi: number;

  if (z <= layout.footHeight + 1e-9) {
    lo = -half;
    hi = half;
  } else if (z >= p.height - layout.rimHeight - 1e-9) {
    // Rim: full thickness, rounded top.
    const r = half;
    const zc = p.height - r;
    const h = z <= zc ? half : Math.max(RIM_TOP / 2, Math.sqrt(Math.max(0, r * r - (z - zc) ** 2)));
    lo = -h;
    hi = h;
  } else {
    const rowIndex = layout.rows.findIndex((row) => z >= row.z0 - 1e-9 && z <= row.z1 + 1e-9);
    const row = layout.rows[rowIndex];
    if (row) {
      const c = displacement(layout, rowIndex, s);
      const t = (p.weave.materialThickness / 2) * strandShape(p, (z - row.z0) / (row.z1 - row.z0));
      lo = c - t;
      hi = c + t;
    } else {
      // Gap (open weave): thin web already at the position of the row above,
      // so the 45° transition happens inside the gap, where windows are cut.
      const above = layout.rows.findIndex((r) => r.z0 > z);
      const c = above >= 0 ? displacement(layout, above, s) : 0;
      lo = c - MIN_WALL / 2;
      hi = c + MIN_WALL / 2;
    }
  }

  // Stake ribs (vertical, so always printable).
  if (stakeHalf > 0) {
    lo = Math.min(lo, -stakeHalf);
    hi = Math.max(hi, stakeHalf);
  }
  return [lo, hi];
}

/**
 * Builds the relief field and enforces printability bottom-up: the outer
 * surface may move outwards and the inner surface inwards by at most one
 * height step per step (45°), and the wall never gets thinner than MIN_WALL.
 */
export function reliefField(p: BasketParams, layout: WeaveLayout, quality: Quality): ReliefField {
  const res = RELIEF_RESOLUTION[quality];
  const cols = layout.stakeCount * res.columnsPerStake;
  const zs = heights(p, layout, res.dz);
  const K = zs.length;
  const step = layout.path.length / layout.stakeCount;
  const stakeR = p.weave.stakeDiameter / 2;

  const s = new Float64Array(cols);
  const z = Float64Array.from(zs);
  const inner = new Float64Array(cols * K);
  const outer = new Float64Array(cols * K);

  for (let j = 0; j < cols; j++) {
    const sj = (j / cols) * layout.path.length;
    s[j] = sj;
    // distance along the path to the nearest stake
    const ds = Math.abs(sj - Math.round(sj / step) * step);
    const stakeHalf = ds < stakeR ? Math.sqrt(stakeR * stakeR - ds * ds) : 0;

    let prevIn = 0;
    let prevOut = 0;
    for (let k = 0; k < K; k++) {
      const [tIn, tOut] = target(p, layout, sj, z[k]!, stakeHalf);
      let lo = tIn;
      let hi = tOut;
      if (k > 0) {
        const dz = z[k]! - z[k - 1]!;
        const outClamped = hi > prevOut + dz;
        const inClamped = lo < prevIn - dz;
        if (outClamped) hi = prevOut + dz;
        if (inClamped) lo = prevIn - dz;
        const minT = Math.min(MIN_WALL, tOut - tIn);
        if (hi - lo < minT) {
          // Thicken in the direction that cannot create an overhang.
          if (outClamped) lo = hi - minT;
          else hi = lo + minT;
        }
      }
      inner[j * K + k] = lo;
      outer[j * K + k] = hi;
      prevIn = lo;
      prevOut = hi;
    }
  }
  return { s, z, inner, outer };
}
