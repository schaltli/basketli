import { MIN_COMPARTMENT } from '../../geometry/dividers';
import type { BasketParams } from '../../geometry/params';

/**
 * One side of the basket split by dividers. Positions are divider centers in
 * mm from the outer edge; `size` is the outer size, `t` the wall (and divider)
 * thickness.
 */
export interface Compartment {
  /** Inner faces (mm from the outer edge). */
  from: number;
  to: number;
  /** Clear width. */
  width: number;
  center: number;
}

const r = (v: number) => Math.round(v * 10) / 10;

export function compartments(positions: number[], size: number, t: number): Compartment[] {
  const faces = [t, ...positions.flatMap((x) => [x - t / 2, x + t / 2]), size - t];
  const out: Compartment[] = [];
  for (let i = 0; i < faces.length; i += 2) {
    const from = faces[i]!;
    const to = faces[i + 1]!;
    out.push({ from, to, width: r(to - from), center: (from + to) / 2 });
  }
  return out;
}

/** Positions for n dividers that make all compartments equal. */
export function evenPositions(n: number, size: number, t: number): number[] {
  const c = (size - 2 * t - n * t) / (n + 1);
  return Array.from({ length: n }, (_, i) => r(t + c * (i + 1) + t * i + t / 2));
}

/** Adds a divider in the middle of the widest compartment (if it can be split). */
export function addDivider(positions: number[], size: number, t: number): number[] {
  const widest = compartments(positions, size, t).reduce((a, b) => (b.width > a.width ? b : a));
  if (widest.width < 2 * MIN_COMPARTMENT + t) return positions;
  return [...positions, r(widest.center)].sort((a, b) => a - b);
}

/** Range a divider can be dragged in without squeezing a compartment below the minimum. */
export function dragLimits(
  positions: number[],
  index: number,
  size: number,
  t: number,
): [number, number] {
  const gap = MIN_COMPARTMENT + t;
  const lo = index > 0 ? positions[index - 1]! + gap : t + MIN_COMPARTMENT + t / 2;
  const hi =
    index < positions.length - 1 ? positions[index + 1]! - gap : size - t - MIN_COMPARTMENT - t / 2;
  return [lo, hi];
}

/**
 * Adds a divider across the width ('x') or the depth ('y'). The first
 * divider of a basket also sets how dividers look: woven in a weave
 * basket, plain otherwise (changeable afterwards).
 */
export function insertDivider(p: BasketParams, axis: 'x' | 'y', t: number): BasketParams {
  const key = axis === 'x' ? 'dividersX' : 'dividersY';
  const next = addDivider(p[key], axis === 'x' ? p.width : p.depth, t);
  if (next === p[key]) return p;
  const first = p.dividersX.length + p.dividersY.length === 0;
  return {
    ...p,
    [key]: next,
    ...(first ? { dividerStyle: p.wallStyle === 'weave' ? 'pattern' : 'plain' } : {}),
  };
}
