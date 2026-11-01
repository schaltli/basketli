import { beforeAll, describe, expect, it } from 'vitest';
import { loadManifold, type Wasm } from '../../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  type BasketParams,
  type WeaveMaterial,
} from '../../../src/geometry/params';
import type { Vec2 } from '../../../src/geometry/shapes';
import { weaveLayout } from '../../../src/geometry/weave/layout';
import { strandPath } from '../../../src/geometry/weave/path';
import { polygonArea, strandProfile } from '../../../src/geometry/weave/profile';
import { sweepClosed } from '../../../src/geometry/weave/sweep';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const bounds = (pts: Vec2[]) => ({
  minU: Math.min(...pts.map((p) => p[0])),
  maxU: Math.max(...pts.map((p) => p[0])),
  minV: Math.min(...pts.map((p) => p[1])),
  maxV: Math.max(...pts.map((p) => p[1])),
});

const profileCases: [WeaveMaterial, number, number][] = [
  ['cane', 6, 2.4],
  ['cane', 3, 1],
  ['cane', 40, 4],
  ['band', 15, 1.6],
  ['band', 3, 1],
  ['band', 40, 4],
];

describe('strandProfile', () => {
  it.each(profileCases)('%s %d×%d: exact size, counter-clockwise', (material, h, t) => {
    const pts = strandProfile(material, h, t, 'export');
    const b = bounds(pts);
    expect(b.maxV - b.minV).toBeCloseTo(h, 1);
    expect(b.minV).toBeCloseTo(-h / 2, 6);
    expect(b.maxU - b.minU).toBeLessThanOrEqual(t + 1e-9);
    expect(b.maxU - b.minU).toBeGreaterThan(t - 0.05);
    expect(polygonArea(pts)).toBeGreaterThan(0);
  });

  it.each(profileCases)('%s %d×%d: no downward face flatter than 45°', (material, h, t) => {
    const pts = strandProfile(material, h, t, 'export');
    pts.forEach(([x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length]!;
      const ex = nx - x;
      const ey = ny - y;
      const len = Math.hypot(ex, ey);
      // Outward normal of a CCW polygon edge: (ey, -ex)
      const normalV = -ex / len;
      expect(normalV).toBeGreaterThanOrEqual(-Math.SQRT1_2 - 1e-9);
    });
  });
});

const weaveParams = (w: Partial<BasketParams['weave']> = {}) =>
  clampParams({
    ...DEFAULTS,
    wallStyle: 'weave',
    cornerRadius: 12,
    weave: { ...DEFAULTS.weave, ...w },
  }).params;

describe('sweepClosed', () => {
  const cases: [string, BasketParams][] = [
    ['cane defaults', weaveParams()],
    [
      'band defaults',
      weaveParams({ material: 'band', materialHeight: 15, materialThickness: 1.6 }),
    ],
    ['thick & dense', weaveParams({ stakeDiameter: 8, materialThickness: 4, stakeSpacing: 16 })],
    ['thin & tight', weaveParams({ stakeDiameter: 2, materialThickness: 1, stakeSpacing: 6 })],
  ];

  it.each(cases)('%s: closed manifold tube with plausible volume', (_name, p) => {
    const layout = weaveLayout(p);
    for (const quality of ['preview', 'export'] as const) {
      const path = strandPath(layout, 0, quality);
      const profile = strandProfile(
        p.weave.material,
        p.weave.materialHeight,
        p.weave.materialThickness,
        quality,
      );
      const tube = sweepClosed(wasm, path.points, (path.z0 + path.z1) / 2, profile);
      try {
        expect(tube.status()).toBe('NoError');
        expect(tube.genus()).toBe(1); // a ring
        // Pappus: profile area × length of the (wavy) strand centerline
        const pathLength = path.points.reduce((acc, pt, i) => {
          const nxt = path.points[(i + 1) % path.points.length]!;
          return acc + Math.hypot(nxt[0] - pt[0], nxt[1] - pt[1]);
        }, 0);
        const approx = polygonArea(profile) * pathLength;
        expect(tube.volume()).toBeGreaterThan(approx * 0.95);
        expect(tube.volume()).toBeLessThan(approx * 1.05);
        const box = tube.boundingBox();
        expect(box.min[2]).toBeCloseTo(path.z0, 3);
        expect(box.max[2]).toBeCloseTo(path.z1, 1);
        expect(box.max[0]).toBeLessThanOrEqual(p.width / 2 + 1e-3);
        expect(box.max[1]).toBeLessThanOrEqual(p.depth / 2 + 1e-3);
      } finally {
        tube.delete();
      }
    }
  });
});
