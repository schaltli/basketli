import { describe, expect, it } from 'vitest';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import { FUSE, evenStakeCount, weaveLayout } from '../../../src/geometry/weave/layout';
import { RoundedRectPath } from '../../../src/geometry/weave/outline';

const weave = (patch: Partial<BasketParams> = {}, w: Partial<BasketParams['weave']> = {}) =>
  clampParams({
    ...DEFAULTS,
    cornerRadius: 12,
    ...patch,
    wallStyle: 'weave',
    weave: { ...DEFAULTS.weave, ...w },
  }).params;

describe('RoundedRectPath', () => {
  const path = new RoundedRectPath(100, 60, 10);

  it('has the rounded-rectangle perimeter', () => {
    expect(path.length).toBeCloseTo(2 * (100 + 60) - (8 - 2 * Math.PI) * 10, 9);
  });

  it('starts at the middle of the front side and runs counter-clockwise', () => {
    expect(path.at(0).p).toEqual([0, -30]);
    expect(path.at(1).p[0]).toBeGreaterThan(0);
  });

  it('is closed and continuous', () => {
    const steps = 2000;
    let prev = path.at(0).p;
    for (let i = 1; i <= steps; i++) {
      const cur = path.at((i / steps) * path.length).p;
      expect(Math.hypot(cur[0] - prev[0], cur[1] - prev[1])).toBeLessThan(
        (path.length / steps) * 1.0001,
      );
      prev = cur;
    }
    expect(prev[0]).toBeCloseTo(0, 9);
    expect(prev[1]).toBeCloseTo(-30, 9);
  });

  it('has outward unit normals and points on the rounded rectangle', () => {
    for (let i = 0; i < 400; i++) {
      const { p, n } = path.at((i / 400) * path.length);
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 9);
      expect(p[0] * n[0] + p[1] * n[1]).toBeGreaterThan(0); // outward
      // distance from the inner rectangle (hx=40, hy=20) equals the radius
      const dx = Math.max(Math.abs(p[0]) - 40, 0);
      const dy = Math.max(Math.abs(p[1]) - 20, 0);
      expect(Math.hypot(dx, dy)).toBeCloseTo(10, 6);
    }
  });
});

describe('evenStakeCount', () => {
  it.each([
    [100, 12],
    [120, 40],
    [480, 12],
    [1500, 6],
    [37, 12],
  ])('length %d / spacing %d → even, closest of the even candidates', (length, spacing) => {
    const n = evenStakeCount(length, spacing);
    expect(n % 2).toBe(0);
    expect(n).toBeGreaterThanOrEqual(4);
    for (const other of [n - 2, n + 2].filter((k) => k >= 4)) {
      expect(Math.abs(length / n - spacing)).toBeLessThanOrEqual(
        Math.abs(length / other - spacing),
      );
    }
  });
});

describe('weaveLayout', () => {
  it('defaults: even stake count, spacing within ±15 % of the target', () => {
    const l = weaveLayout(weave());
    expect(l.stakeCount % 2).toBe(0);
    const spacing = l.path.length / l.stakeCount;
    expect(
      Math.abs(spacing - DEFAULTS.weave.stakeSpacing) / DEFAULTS.weave.stakeSpacing,
    ).toBeLessThan(0.15);
    expect(l.stakes).toHaveLength(l.stakeCount);
  });

  it('woven wall stays inside the outer dimensions', () => {
    const p = weave();
    const l = weaveLayout(p);
    // outer surface of a strand at max displacement
    const outer = l.centerOffset - l.amplitude - p.weave.materialThickness / 2;
    expect(outer).toBeGreaterThanOrEqual(-1e-9);
    expect(l.span).toBeCloseTo(p.weave.stakeDiameter + 2 * p.weave.materialThickness, 9);
  });

  it('bands overlap the stakes by FUSE', () => {
    const p = weave();
    const l = weaveLayout(p);
    const innerFaceOfBand = l.amplitude - p.weave.materialThickness / 2;
    expect(p.weave.stakeDiameter / 2 - innerFaceOfBand).toBeCloseTo(FUSE, 9);
  });

  const rowCases: [string, 'cane' | 'band', number, number][] = [];
  for (const material of ['cane', 'band'] as const)
    for (const mh of [3, 15, 40])
      for (const gap of [0, 4])
        rowCases.push([`${material} ${mh}mm gap ${gap}`, material, mh, gap]);

  it.each(rowCases)('%s: whole rows only, remainder split evenly', (_n, material, mh, gap) => {
    const p = weave({ height: 120 }, { material, materialHeight: mh, rowGap: gap });
    const l = weaveLayout(p);
    const n = l.rows.length;
    expect(n).toBe(Math.floor((120 - 2 * p.borderBand + gap) / (mh + gap)));
    // stack adds up exactly to the height
    expect(l.footHeight + n * mh + (n - 1) * gap + l.rimHeight).toBeCloseTo(120, 9);
    expect(l.footHeight).toBeCloseTo(l.rimHeight, 9);
    expect(l.footHeight).toBeGreaterThanOrEqual(p.borderBand);
    // rows are ordered, sized and inside the woven zone; foot and rim touch them
    expect(l.rows[0]!.z0).toBeCloseTo(l.footHeight, 9);
    expect(l.rows[n - 1]!.z1).toBeCloseTo(120 - l.rimHeight, 9);
    l.rows.forEach((r, i) => {
      expect(r.z1 - r.z0).toBeCloseTo(mh, 9);
      expect(r.z0).toBeGreaterThanOrEqual(l.footHeight - 1e-9);
      expect(r.z1).toBeLessThanOrEqual(120 - l.rimHeight + 1e-9);
      if (i > 0) expect(r.z0 - l.rows[i - 1]!.z1).toBeCloseTo(gap, 9);
    });
  });
});
