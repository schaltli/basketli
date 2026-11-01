import type { WeaveLayout } from './layout';

/**
 * Signed sideways displacement (along the outward normal) of row `row` at
 * arc position `s`. Plain weave: +amplitude (outside) and −amplitude (inside)
 * alternate from stake to stake; neighbouring rows are shifted by one stake.
 */
export function displacement(layout: WeaveLayout, row: number, s: number): number {
  const step = layout.path.length / layout.stakeCount;
  return layout.amplitude * Math.cos((Math.PI * s) / step + Math.PI * row);
}
