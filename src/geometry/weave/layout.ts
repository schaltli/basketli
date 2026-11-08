import { MAX_OPEN_SPACING, MIN_WALL, type BasketParams } from '../params';
import { junctionArcs, wallSegments } from '../junctions';
import { patternBase, weaveAmplitude } from '../stacking';
import { RoundedRectPath } from './outline';

/**
 * First layer of every band and of every base that grows out of a wall
 * (mm): as wide as the thinnest wall, so no layer is thinner (MIN_WALL).
 */
export const FIRST_LINE = MIN_WALL;
/** Layer height the band bottom is designed for (mm). */
export const LAYER = 0.2;

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
  /** Flat closing band round the top edge. */
  rim: WeaveRow;
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
 * With dividers: a stake at every divider joint and evenly spaced stakes in
 * between (spacing as close to the target as possible, never above `max`).
 * The total stays even, so every row still closes over/under round the
 * basket. Sorted, in [0, L).
 */
export function jointStakes(joints: number[], L: number, target: number, max: number): number[] {
  const segs = wallSegments(joints, L);
  const counts = segs.map(({ a, b }) =>
    Math.max(Math.ceil((b - a) / max - 1e-9), Math.max(1, Math.round((b - a) / target))),
  );
  if (counts.reduce((s, n) => s + n, 0) % 2 === 1) {
    // one more stake where the spacing is widest
    let k = 0;
    segs.forEach(({ a, b }, i) => {
      if ((b - a) / counts[i]! > (segs[k]!.b - segs[k]!.a) / counts[k]!) k = i;
    });
    counts[k] = counts[k]! + 1;
  }
  return segs
    .flatMap(({ a, b }, i) =>
      Array.from({ length: counts[i]! }, (_, j) => (a + ((b - a) * j) / counts[i]!) % L),
    )
    .sort((x, y) => x - y);
}

/**
 * Pure layout of a woven wall standing on the floor plate. `p` must be
 * clamped and use wallStyle 'weave'.
 */
export function weaveLayout(p: BasketParams): WeaveLayout {
  const w = p.weave;
  const r = w.stakeDiameter / 2;
  const amplitude = weaveAmplitude(p);
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
  let stakes = Array.from({ length: stakeCount }, (_, i) => i * step);
  const joints = junctionArcs(p, path);
  if (joints.length > 0) {
    stakes = jointStakes(joints, path.length, w.stakeSpacing, maxStep);
    stakeCount = stakes.length;
  }

  // Rows fill the wall from the floor plate up to the top rim; every row
  // (the last one too) is followed by one row gap. The band height is
  // adjusted slightly so a whole number of rows fits exactly.
  const base = patternBase(p);
  const rim: WeaveRow = { z0: p.height - w.rim, z1: p.height };
  const wall = rim.z0 - base;
  const n = Math.max(1, Math.round(wall / (w.materialHeight + w.rowGap)));
  const h = wall / n - w.rowGap;
  const rows: WeaveRow[] = [];
  for (let i = 0; i < n; i++) {
    const z0 = base + i * (h + w.rowGap);
    rows.push({ z0, z1: z0 + h });
  }

  return { path, centerOffset, span, amplitude, stakeCount, stakes, rows, rim };
}
