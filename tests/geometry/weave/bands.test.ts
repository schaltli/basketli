import { describe, expect, it } from 'vitest';
import {
  clampParams,
  DEFAULTS,
  MIN_WALL,
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
      // the first line is anchored: at least 90 % of it lies on the stake
      expect(r - (dist(nearest) - FIRST_LINE / 2)).toBeGreaterThanOrEqual(0.9 * FIRST_LINE);
      const side = Math.sign((nearest[0] - at[0]) * n[0] + (nearest[1] - at[1]) * n[1]);
      expect(side).toBe(k % 2 === 0 ? 1 : -1);
    });
  });
});

describe('bandProfile', () => {
  it.each([
    [1.2, 6],
    [1.6, 9],
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
    // no layer thinner than MIN_WALL
    expect(FIRST_LINE).toBeGreaterThanOrEqual(MIN_WALL);
    // top: inner vertical, outer chamfered 45° by half the thickness, but
    // leaving MIN_WALL
    const c = Math.min(CHAMFER_RATIO * t, t - MIN_WALL);
    expect(b.inner[4]).toBeCloseTo(t / 2, 9);
    expect(b.outer[3]! - b.outer[4]!).toBeCloseTo(c, 9);
    expect(b.z[4]! - b.z[3]!).toBeCloseTo(c, 9);
    expect(b.inner[4]! + b.outer[4]!).toBeGreaterThanOrEqual(MIN_WALL - 1e-9);
    expect(b.z[4]).toBeCloseTo(h, 9);
  });
});

describe('bandField', () => {
  const variants: [string, BasketParams][] = [
    ['cane', p],
    ['band', setWeaveMaterial(p, 'band')],
  ];
  it.each(variants)('%s: widths along the normal are never below the profile', (_n, q) => {
    // a row on a row gap starts with its line (bandProfile)
    const open = { ...q, weave: { ...q.weave, rowGap: 3 } };
    const lq = weaveLayout(open);
    const f = bandField(open, lq, 1, 'preview');
    const K = f.z.length;
    const prof = bandProfile(q.weave.materialThickness, lq.rows[1]!.z1 - lq.rows[1]!.z0);
    for (let j = 0; j < f.s.length; j++)
      for (let k = 0; k < K; k++)
        expect(f.outer[j * K + k]! - f.inner[j * K + k]!).toBeGreaterThanOrEqual(
          prof.inner[k]! + prof.outer[k]! - 1e-9,
        );
  });

  it.each(variants)('%s, closed: starts on the row below, moves over at 45°', (_n, q) => {
    const lq = weaveLayout(q);
    const below = bandField(q, lq, 0, 'preview');
    const f = bandField(q, lq, 1, 'preview');
    const K = f.z.length;
    const Kb = below.z.length;
    const t = q.weave.materialThickness;
    for (let j = 0; j < f.s.length; j++) {
      // bottom = top of the row below
      expect(f.inner[j * K]!).toBeCloseTo(below.inner[j * Kb + Kb - 1]!, 6);
      expect(f.outer[j * K]!).toBeCloseTo(below.outer[j * Kb + Kb - 1]!, 6);
      for (let k = 0; k < K; k++) {
        // never thinner than the material
        expect(f.outer[j * K + k]! - f.inner[j * K + k]!).toBeGreaterThanOrEqual(t - 1e-9);
        if (k === 0) continue;
        // at most 45°: the sides move by no more than the height gained
        const dz = f.z[k]! - f.z[k - 1]!;
        expect(Math.abs(f.inner[j * K + k]! - f.inner[j * K + k - 1]!)).toBeLessThanOrEqual(
          dz + 1e-9,
        );
        expect(Math.abs(f.outer[j * K + k]! - f.outer[j * K + k - 1]!)).toBeLessThanOrEqual(
          dz + 1e-9,
        );
      }
    }
  });
});
