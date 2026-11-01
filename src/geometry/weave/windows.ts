import type { Manifold } from 'manifold-3d';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import type { Vec2 } from '../shapes';
import type { WeaveLayout } from './layout';

/** Solid material kept next to each stake. */
const STAKE_MARGIN = 1;

/**
 * Pointed windows for the open weave: one per gap and stake interval,
 * flat at the bottom and with a 45° roof so nothing has to bridge.
 * Windows on the rounded corners are left out.
 */
export function windowCutters(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  layout: WeaveLayout,
): Manifold[] {
  const gap = p.weave.rowGap;
  if (gap <= 0) return [];
  const step = layout.path.length / layout.stakeCount;
  const width = Math.min(
    step - p.weave.stakeDiameter - 2 * STAKE_MARGIN,
    p.weave.materialHeight, // roof (= width/2) at most half a row high
  );
  if (width < 2) return [];

  // Gaps: below each row (incl. above the foot band) and above the last row.
  const gapBottoms = layout.rows.map((r) => r.z0 - gap);
  const last = layout.rows[layout.rows.length - 1];
  if (last) gapBottoms.push(last.z1);

  const half = width / 2;
  const depth = layout.span * 2;
  const cutters: Manifold[] = [];
  for (const z0 of gapBottoms) {
    const shape: Vec2[] = [
      [-half, z0],
      [half, z0],
      [half, z0 + gap],
      [0, z0 + gap + half],
      [-half, z0 + gap],
    ];
    const prism = scope.keep(wasm.Manifold.extrude([shape], depth, 0, 0, [1, 1], true));
    for (let k = 0; k < layout.stakeCount; k++) {
      const sMid = (k + 0.5) * step;
      if (!layout.path.isStraight(sMid - half, sMid + half)) continue;
      const { p: at, n } = layout.path.at(sMid);
      const t: Vec2 = [-n[1], n[0]]; // tangent (counter-clockwise)
      // Columns: local x → tangent, local y → up, local z → outward normal.
      const m = prism.transform([
        t[0],
        t[1],
        0,
        0,
        0,
        0,
        1,
        0,
        n[0],
        n[1],
        0,
        0,
        at[0],
        at[1],
        0,
        1,
      ]);
      cutters.push(scope.keep(m));
    }
  }
  return cutters;
}
