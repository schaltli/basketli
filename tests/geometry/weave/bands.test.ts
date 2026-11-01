import { describe, expect, it } from 'vitest';
import { clampParams, DEFAULTS } from '../../../src/geometry/params';
import { bandCenterline } from '../../../src/geometry/weave/bands';
import { weaveLayout } from '../../../src/geometry/weave/layout';

const p = clampParams({ ...DEFAULTS, wallStyle: 'weave' }).params;
const l = weaveLayout(p);

describe('bandCenterline', () => {
  it('touches every stake from alternating sides', () => {
    const line = bandCenterline(l, 0, 'export');
    const t = p.weave.materialThickness / 2;
    const r = p.weave.stakeDiameter / 2;
    l.stakes.forEach((s, k) => {
      const { p: at, n } = l.path.at(s);
      // nearest centerline point to the stake
      const d = Math.min(...line.map((q) => Math.hypot(q[0] - at[0], q[1] - at[1])));
      expect(d - t).toBeLessThan(r); // band surface overlaps the stake
      expect(d - t).toBeGreaterThan(r - 0.5);
      const nearest = line.reduce((a, q) =>
        Math.hypot(q[0] - at[0], q[1] - at[1]) < Math.hypot(a[0] - at[0], a[1] - at[1]) ? q : a,
      );
      const side = Math.sign((nearest[0] - at[0]) * n[0] + (nearest[1] - at[1]) * n[1]);
      expect(side).toBe(k % 2 === 0 ? 1 : -1);
    });
  });

  it('crosses the row below between two stakes', () => {
    const a = bandCenterline(l, 0, 'export');
    const b = bandCenterline(l, 1, 'export');
    const crossings = a.filter(
      (q, i) => Math.hypot(q[0] - b[i]![0], q[1] - b[i]![1]) < p.weave.materialThickness,
    ).length;
    expect(crossings).toBeGreaterThan(l.stakeCount); // overlap near every crossing
  });
});
