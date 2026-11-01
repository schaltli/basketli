import type { Quality } from '../basket';
import type { Vec2 } from '../shapes';
import type { WeaveLayout } from './layout';

/** Path samples between two neighbouring stakes. */
export const SAMPLES_PER_STAKE = { preview: 8, export: 20 } as const;

/**
 * Signed sideways displacement (along the outward normal) of row `row` at
 * arc position `s`. Plain weave: +amplitude (outside) and −amplitude (inside)
 * alternate from stake to stake; neighbouring rows are shifted by one stake.
 */
export function displacement(layout: WeaveLayout, row: number, s: number): number {
  const step = layout.path.length / layout.stakeCount;
  return layout.amplitude * Math.cos((Math.PI * s) / step + Math.PI * row);
}

export interface StrandPath {
  /** Closed loop of strand centers (first point not repeated). */
  points: Vec2[];
  /** Material bottom and top. */
  z0: number;
  z1: number;
}

/** Closed, horizontal centerline of one strand ring. */
export function strandPath(layout: WeaveLayout, row: number, quality: Quality): StrandPath {
  const r = layout.rows[row];
  if (!r) throw new RangeError(`row ${row} out of range`);
  const count = layout.stakeCount * SAMPLES_PER_STAKE[quality];
  const points: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const s = (i / count) * layout.path.length;
    const { p, n } = layout.path.at(s);
    const d = displacement(layout, row, s);
    points.push([p[0] + n[0] * d, p[1] + n[1] * d]);
  }
  return { points, z0: r.z0, z1: r.z1 };
}
