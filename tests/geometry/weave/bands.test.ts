import { describe, expect, it } from 'vitest';
import { clampParams, DEFAULTS, setWeaveMaterial } from '../../../src/geometry/params';
import {
  bandCenterline,
  bandField,
  CHAMFER_RATIO,
  MIN_BOTTOM,
} from '../../../src/geometry/weave/bands';
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

describe('bandField', () => {
  it.each([
    ['cane 1.2', p],
    ['band 0.8', setWeaveMaterial(p, 'band')],
    ['thick 2.4', clampParams({ ...p, weave: { ...p.weave, materialThickness: 2.4 } }).params],
  ] as const)('%s: inner face vertical, outer 45° chamfers, bottom ≥ 0.8 mm', (_n, q) => {
    const lq = weaveLayout(q);
    const f = bandField(q, lq, 1, 'preview');
    const K = f.z.length;
    const t = q.weave.materialThickness;
    for (let j = 0; j < f.s.length; j++) {
      const inner = Array.from({ length: K }, (_, k) => f.inner[j * K + k]!);
      const outer = Array.from({ length: K }, (_, k) => f.outer[j * K + k]!);
      expect(new Set(inner.map((v) => v.toFixed(9))).size).toBe(1);
      // top: full chamfer (half the thickness) over the same height
      expect(outer[2]! - outer[3]!).toBeGreaterThanOrEqual(CHAMFER_RATIO * t - 1e-9);
      expect(f.z[3]! - f.z[2]!).toBeCloseTo(CHAMFER_RATIO * t, 9);
      // bottom: flat width ≥ MIN_BOTTOM, chamfer not steeper than 45°
      // values are along the wall normal, ≥ the perpendicular widths
      expect(outer[0]! - inner[0]!).toBeGreaterThanOrEqual(Math.min(t, MIN_BOTTOM) - 1e-9);
      expect(outer[1]! - inner[1]!).toBeGreaterThanOrEqual(t - 1e-9);
    }
  });
});
