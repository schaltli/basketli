import { MAX_OPEN_SPACING, type BasketParams } from '../params';
import { RoundedRectPath } from './outline';

/** Width of one extrusion line: the first layer of every band (mm). */
export const FIRST_LINE = 0.45;
/** Layer height the band bottom is designed for (mm). */
export const LAYER = 0.2;
/** The first line runs this far inside each stake (it cuts, not touches). */
export const CUT = 0.1;

export interface WeaveRow {
  /** Bottom and top of the band in this row (mm). */
  z0: number;
  z1: number;
}

export interface WeaveLayout {
  /** Centerline of the weave (stakes stand on it). */
  path: RoundedRectPath;
  /** Distance from the outer basket edge to the centerline. */
  centerOffset: number;
  /** Radial thickness of the woven wall. */
  span: number;
  /** Max sideways displacement of a band's center line from the centerline. */
  amplitude: number;
  stakeCount: number;
  /** Arc positions of the stakes along `path`. */
  stakes: number[];
  rows: WeaveRow[];
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

/**
 * Pure layout of a woven wall standing on the floor plate. `p` must be
 * clamped and use wallStyle 'weave'.
 */
export function weaveLayout(p: BasketParams): WeaveLayout {
  const w = p.weave;
  const r = w.stakeDiameter / 2;
  // The band's center line (= its single-line first layer) passes through
  // every stake, CUT inside the stake's surface.
  const amplitude = Math.max(0, r - FIRST_LINE / 2 - CUT);
  const span = 2 * Math.max(r, amplitude + w.materialThickness / 2);
  const centerOffset = span / 2;

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

  // Rows fill the wall from the floor plate to the top. The band height is
  // adjusted slightly so a whole number of rows fits exactly.
  const wall = p.height - p.floor;
  const n = Math.max(1, Math.round((wall + w.rowGap) / (w.materialHeight + w.rowGap)));
  const h = (wall - (n - 1) * w.rowGap) / n;
  const rows: WeaveRow[] = [];
  for (let i = 0; i < n; i++) {
    const z0 = p.floor + i * (h + w.rowGap);
    rows.push({ z0, z1: z0 + h });
  }

  return { path, centerOffset, span, amplitude, stakeCount, stakes, rows };
}
