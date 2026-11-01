import { describe, expect, it } from 'vitest';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import { CUT, evenStakeCount, FIRST_LINE, weaveLayout } from '../../../src/geometry/weave/layout';
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

  it('breakpoints: straight ends plus fine steps on the arcs', () => {
    const b = path.breakpoints(1);
    expect(b[0]).toBe(0);
    b.forEach((s, i) => i > 0 && expect(s).toBeGreaterThan(b[i - 1]!));
    expect(b[b.length - 1]).toBeLessThan(path.length);
    // 4 arcs of length π/2·10 ≈ 15.7 → 16 steps each, plus the straight ends
    expect(b.length).toBeGreaterThanOrEqual(4 * 16);
    expect(b.length).toBeLessThan(4 * 16 + 10);
  });

  it('has outward unit normals and points on the rounded rectangle', () => {
    for (let i = 0; i < 400; i++) {
      const { p, n } = path.at((i / 400) * path.length);
      expect(Math.hypot(n[0], n[1])).toBeCloseTo(1, 9);
      expect(p[0] * n[0] + p[1] * n[1]).toBeGreaterThan(0);
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
    const target = DEFAULTS.weave.stakeSpacing;
    expect(Math.abs(spacing - target) / target).toBeLessThan(0.15);
    expect(l.stakes).toHaveLength(l.stakeCount);
  });

  it('the first line of a band runs inside every stake (cuts it)', () => {
    const p = weave();
    const l = weaveLayout(p);
    const r = p.weave.stakeDiameter / 2;
    expect(l.amplitude + FIRST_LINE / 2).toBeCloseTo(r - CUT, 9);
  });

  it('the band still covers the stake on its outer side', () => {
    const p = weave();
    const l = weaveLayout(p);
    expect(l.amplitude + p.weave.materialThickness / 2).toBeGreaterThan(p.weave.stakeDiameter / 2);
  });

  it('woven wall fits in the outer dimensions', () => {
    const p = weave();
    const l = weaveLayout(p);
    expect(l.centerOffset).toBeCloseTo(l.span / 2, 9);
    expect(l.amplitude + p.weave.materialThickness / 2).toBeLessThanOrEqual(l.span / 2 + 1e-9);
    expect(p.weave.stakeDiameter / 2).toBeLessThanOrEqual(l.span / 2 + 1e-9);
  });

  it('real stake spacing ≤ 15 mm − material thickness (bands bridge between stakes)', () => {
    const l = weaveLayout(
      weave(
        { width: 80, depth: 60, height: 50 },
        { stakeDiameter: 8, materialThickness: 4, stakeSpacing: 15 },
      ),
    );
    expect(l.path.length / l.stakeCount).toBeLessThanOrEqual(15 - 4);
    expect(l.stakeCount % 2).toBe(0);
  });

  const rowCases: [string, 'cane' | 'band', number, number][] = [];
  for (const material of ['cane', 'band'] as const)
    for (const mh of [3, 15, 40])
      for (const gap of [0, 4])
        rowCases.push([`${material} ${mh}mm gap ${gap}`, material, mh, gap]);

  it.each(rowCases)('%s: rows fill floor to top exactly', (_n, material, mh, gap) => {
    const p = weave({ height: 120 }, { material, materialHeight: mh, rowGap: gap });
    const l = weaveLayout(p);
    const n = l.rows.length;
    expect(l.rows[0]!.z0).toBeCloseTo(p.floor, 9);
    expect(l.rows[n - 1]!.z1).toBeCloseTo(120, 9);
    const h = l.rows[0]!.z1 - l.rows[0]!.z0;
    // n is the whole number closest to the target → band height close to the target
    const wall = 120 - p.floor;
    const target = p.weave.materialHeight;
    expect(n).toBe(Math.max(1, Math.round((wall + gap) / (target + gap))));
    expect(Math.abs(h - target)).toBeLessThanOrEqual((target + gap) / 2);
    l.rows.forEach((r, i) => {
      expect(r.z1 - r.z0).toBeCloseTo(h, 9);
      if (i > 0) expect(r.z0 - l.rows[i - 1]!.z1).toBeCloseTo(gap, 9);
    });
  });
});
