import type { BasketParams } from '../params';
import { RoundedRectPath } from './outline';

/** Strands sink this far into the stakes so they fuse into one body. */
export const FUSE = 0.3;

export interface WeaveRow {
  /** Bottom and top of the material in this row (mm). */
  z0: number;
  z1: number;
}

export interface WeaveLayout {
  /** Centerline of the weave (stakes stand on it). */
  path: RoundedRectPath;
  /** Distance from the outer basket edge to the centerline. */
  centerOffset: number;
  /** Radial thickness of the woven wall (= solid band thickness). */
  span: number;
  /** Max sideways displacement of a strand's center from the centerline. */
  amplitude: number;
  stakeCount: number;
  /** Arc positions of the stakes along `path`. */
  stakes: number[];
  rows: WeaveRow[];
  /** Height of the solid foot band (from z = 0). */
  footHeight: number;
  /** Height of the solid top rim. */
  rimHeight: number;
}

/** Odd stake count whose spacing is closest to the target spacing (min 3). */
export function oddStakeCount(length: number, targetSpacing: number): number {
  const x = length / targetSpacing;
  const lower = Math.max(3, Math.floor(x) % 2 === 1 ? Math.floor(x) : Math.floor(x) - 1);
  const upper = lower + 2;
  const err = (n: number) => Math.abs(length / n - targetSpacing);
  return err(upper) < err(lower) ? upper : lower;
}

/** Pure layout of a woven wall. `p` must be clamped and use wallStyle 'weave'. */
export function weaveLayout(p: BasketParams): WeaveLayout {
  const w = p.weave;
  const span = w.stakeDiameter + 2 * w.materialThickness;
  const centerOffset = span / 2;
  const amplitude = w.stakeDiameter / 2 + w.materialThickness / 2 - FUSE;

  const path = new RoundedRectPath(
    p.width - 2 * centerOffset,
    p.depth - 2 * centerOffset,
    p.cornerRadius - centerOffset,
  );
  const stakeCount = oddStakeCount(path.length, w.stakeSpacing);
  const step = path.length / stakeCount;
  const stakes = Array.from({ length: stakeCount }, (_, i) => i * step);

  // Rows: n rows with n + 1 gaps between the bands; the remainder is split
  // evenly between foot and rim so no row is cut off.
  const usable = p.height - 2 * p.borderBand;
  const pitch = w.materialHeight + w.rowGap;
  const n = Math.max(1, Math.floor((usable - w.rowGap) / pitch));
  const woven = n * w.materialHeight + (n + 1) * w.rowGap;
  const extra = (usable - woven) / 2;
  const footHeight = p.borderBand + extra;
  const rimHeight = p.borderBand + extra;

  const rows: WeaveRow[] = [];
  for (let i = 0; i < n; i++) {
    const z0 = footHeight + w.rowGap + i * pitch;
    rows.push({ z0, z1: z0 + w.materialHeight });
  }

  return {
    path,
    centerOffset,
    span,
    amplitude,
    stakeCount,
    stakes,
    rows,
    footHeight,
    rimHeight,
  };
}
