import type { WeaveLayout } from './layout';

/**
 * Where arc position `s` lies between the stakes: `phase` counts stakes
 * (integer at a stake, fraction in between), `step` is the local spacing.
 * Works for evenly and unevenly spaced stakes (dividers).
 */
export function stakePhase(layout: WeaveLayout, s: number): { phase: number; step: number } {
  const L = layout.path.length;
  const st = layout.stakes;
  const n = st.length;
  const x = ((s % L) + L) % L;
  let i: number;
  let s0: number;
  if (x < st[0]!) {
    i = n - 1;
    s0 = st[n - 1]! - L;
  } else {
    let lo = 0;
    let hi = n - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (st[mid]! <= x) lo = mid;
      else hi = mid - 1;
    }
    i = lo;
    s0 = st[i]!;
  }
  const s1 = i + 1 < n ? st[i + 1]! : st[0]! + L;
  const step = s1 - s0;
  return { phase: i + (x - s0) / step, step };
}

/**
 * Signed sideways displacement (along the outward normal) of row `row` at
 * arc position `s`. Plain weave: +amplitude (outside) and −amplitude (inside)
 * alternate from stake to stake; neighbouring rows are shifted by one stake.
 */
export function displacement(layout: WeaveLayout, row: number, s: number): number {
  const { phase } = stakePhase(layout, s);
  return layout.amplitude * Math.cos(Math.PI * phase + Math.PI * row);
}
