import { describe, expect, it } from 'vitest';
import {
  clampParams,
  DEFAULTS,
  setWeaveMaterial,
  type BasketParams,
} from '../../../src/geometry/params';
import {
  bandCenterline,
  bandField,
  bandProfile,
  CHAMFER_RATIO,
} from '../../../src/geometry/weave/bands';
import { FIRST_LINE, LAYER, weaveLayout } from '../../../src/geometry/weave/layout';

const p = clampParams({ ...DEFAULTS, wallStyle: 'weave' }).params;
const l = weaveLayout(p);

describe('bandCenterline', () => {
  it('passes through every stake, alternately outside and inside its center', () => {
    const line = bandCenterline(l, 0, 'export');
    const r = p.weave.stakeDiameter / 2;
    l.stakes.forEach((s, k) => {
      const { p: at, n } = l.path.at(s);
      const dist = (q: [number, number]) => Math.hypot(q[0] - at[0], q[1] - at[1]);
      const nearest = line.reduce((a, q) => (dist(q) < dist(a) ? q : a));
      expect(dist(nearest) + FIRST_LINE / 2).toBeLessThan(r); // whole first line inside
      const side = Math.sign((nearest[0] - at[0]) * n[0] + (nearest[1] - at[1]) * n[1]);
      expect(side).toBe(k % 2 === 0 ? 1 : -1);
    });
  });
});

describe('bandProfile', () => {
  it.each([
    [1.2, 6],
    [0.8, 9],
    [4, 15],
  ])('t=%d h=%d: one line first, 45° growth both ways, outer top chamfer', (t, h) => {
    const b = bandProfile(t, h);
    expect(b.inner[0]! + b.outer[0]!).toBeCloseTo(FIRST_LINE, 9);
    expect(b.z[1]).toBeCloseTo(LAYER, 9);
    expect(b.inner[1]! + b.outer[1]!).toBeCloseTo(FIRST_LINE, 9);
    // 45° growth on both sides up to the full thickness
    const dz = b.z[2]! - b.z[1]!;
    expect(b.inner[2]! - b.inner[1]!).toBeCloseTo(dz, 9);
    expect(b.outer[2]! - b.outer[1]!).toBeCloseTo(dz, 9);
    expect(b.inner[2]! + b.outer[2]!).toBeCloseTo(t, 9);
    // second layer is already two lines wide
    expect(FIRST_LINE + 2 * Math.min(LAYER, dz)).toBeGreaterThanOrEqual(Math.min(0.8, t));
    // top: inner vertical, outer chamfered 45° by half the thickness
    expect(b.inner[4]).toBeCloseTo(t / 2, 9);
    expect(b.outer[3]! - b.outer[4]!).toBeCloseTo(CHAMFER_RATIO * t, 9);
    expect(b.z[4]! - b.z[3]!).toBeCloseTo(CHAMFER_RATIO * t, 9);
    expect(b.z[4]).toBeCloseTo(h, 9);
  });
});

describe('bandField', () => {
  const variants: [string, BasketParams][] = [
    ['cane', p],
    ['band', setWeaveMaterial(p, 'band')],
  ];
  it.each(variants)('%s: widths along the normal are never below the profile', (_n, q) => {
    const lq = weaveLayout(q);
    const f = bandField(q, lq, 1, 'preview');
    const K = f.z.length;
    const prof = bandProfile(q.weave.materialThickness, lq.rows[1]!.z1 - lq.rows[1]!.z0);
    for (let j = 0; j < f.s.length; j++)
      for (let k = 0; k < K; k++)
        expect(f.outer[j * K + k]! - f.inner[j * K + k]!).toBeGreaterThanOrEqual(
          prof.inner[k]! + prof.outer[k]! - 1e-9,
        );
  });
});
