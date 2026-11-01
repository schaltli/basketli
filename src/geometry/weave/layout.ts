import { MAX_OPEN_SPACING, type BasketParams } from '../params';
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

/**
 * Even stake count whose spacing is closest to the target spacing (min 4).
 * Each row is a closed ring that alternates over/under, so it only closes
 * without a seam when the count is even.
 */
export function evenStakeCount(length: number, targetSpacing: number): number {
  const x = length / targetSpacing;
  const lower = Math.max(4, Math.floor(x / 2) * 2);
  const upper = lower + 2;
  const err = (n: number) => Math.abs(length / n - targetSpacing);
  return err(upper) < err(lower) ? upper : lower;
}

/** Pure layout of a woven wall. `p` must be clamped and use wallStyle 'weave'. */
export function weaveLayout(p: BasketParams): WeaveLayout {
  const w = p.weave;
  const span = w.stakeDiameter + 2 * w.materialThickness;
  const centerOffset = span / 2;
  // Bands touch every stake (overlapping it by FUSE).
  const amplitude = w.stakeDiameter / 2 + w.materialThickness / 2 - FUSE;

  const path = new RoundedRectPath(
    p.width - 2 * centerOffset,
    p.depth - 2 * centerOffset,
    p.cornerRadius - centerOffset,
  );
  let stakeCount = evenStakeCount(path.length, w.stakeSpacing);
  // Bands bridge from stake to stake; across a wide band the far edge is
  // further from the anchor, so the real spacing stays ≤ limit − thickness.
  const maxStep = MAX_OPEN_SPACING - w.materialThickness;
  while (path.length / stakeCount > maxStep) stakeCount += 2;
  const step = path.length / stakeCount;
  const stakes = Array.from({ length: stakeCount }, (_, i) => i * step);

  // Rows: n rows with n − 1 gaps; foot and rim sit directly on the first
  // and last row. The remainder is split evenly so no row is cut off.
  const usable = p.height - 2 * p.borderBand;
  const pitch = w.materialHeight + w.rowGap;
  const n = Math.max(1, Math.floor((usable + w.rowGap) / pitch));
  const woven = n * w.materialHeight + (n - 1) * w.rowGap;
  const extra = (usable - woven) / 2;
  const footHeight = p.borderBand + extra;
  const rimHeight = p.borderBand + extra;

  const rows: WeaveRow[] = [];
  for (let i = 0; i < n; i++) {
    const z0 = footHeight + i * pitch;
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
