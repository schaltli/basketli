import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildTub } from '../../src/geometry/basket';
import { buildManifold } from '../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  topAt,
  type BasketParams,
  type WallStyle,
  sides,
} from '../../src/geometry/params';
import { buildBraid } from '../../src/geometry/patterns/braid';
import { buildExpanded } from '../../src/geometry/patterns/expanded';
import { MAX_BRIDGE, overhangReport } from '../../src/geometry/printability';
import { wallIntrusion } from '../../src/geometry/stacking';
import { RoundedRectPath } from '../../src/geometry/weave/outline';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const params = (patch: Partial<BasketParams> = {}) =>
  clampParams({
    ...DEFAULTS,
    irregular: true,
    heightFL: 80,
    heightFR: 72,
    heightBL: 60,
    heightBR: 48,
    ...patch,
  });

/** Highest point of the body in a thin column over (x, y). */
function topOver(m: Manifold, x: number, y: number): number {
  const probe = wasm.Manifold.cube([0.6, 0.6, 400]).translate([x - 0.3, y - 0.3, -1]);
  const cut = m.intersect(probe);
  const z = cut.isEmpty() ? -Infinity : cut.boundingBox().max[2];
  cut.delete();
  probe.delete();
  return z;
}

describe('irregular top: parameters', () => {
  it('is not stackable, height is the highest corner', () => {
    const { params: p, notices } = params();
    expect(p.stackable).toBe(false);
    expect(p.height).toBe(80);
    expect(notices.map((n) => n.field)).toContain('stackable');
  });

  it('limits every wall top to 45°', () => {
    const p = params({ width: 60, depth: 40, heightFL: 200, heightFR: 30, heightBL: 30 }).params;
    expect(p.heightFL - p.heightFR).toBeLessThanOrEqual(60);
    expect(p.heightFL - p.heightBL).toBeLessThanOrEqual(40);
  });

  it('is idempotent', () => {
    const once = params({ width: 60, depth: 40, heightFL: 200, heightFR: 30, heightBL: 30 });
    const twice = clampParams(once.params);
    expect(twice.params).toEqual(once.params);
    expect(twice.notices).toEqual([]);
  });

  it('runs straight from corner to corner along every wall', () => {
    const p = params().params;
    expect(topAt(p, -p.width / 2, -p.depth / 2)).toBe(80);
    expect(topAt(p, p.width / 2, p.depth / 2)).toBe(48);
    expect(topAt(p, 0, -p.depth / 2)).toBeCloseTo(76, 9);
    expect(topAt(p, p.width / 2, 0)).toBeCloseTo(60, 9);
  });
});

describe('outline projection', () => {
  it('finds the arc position of points on and near the outline', () => {
    const path = new RoundedRectPath(150, 100, 10);
    for (let s = 0; s < path.length; s += 3.7) {
      const { p: q, n } = path.at(s);
      expect(path.project(q[0], q[1])).toBeCloseTo(s, 6);
      // 1.5 mm inside the wall, along the normal
      expect(path.project(q[0] - 1.5 * n[0], q[1] - 1.5 * n[1])).toBeCloseTo(s, 6);
    }
  });
});

describe('irregular top: geometry', () => {
  const styles: WallStyle[] = ['solid', 'hex', 'voronoi', 'expanded', 'braid', 'weave'];
  it.each(styles)('%s: follows the measured top, one body, printable', (style) => {
    const p = params({ wallStyle: style }).params;
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      // the rim's top along the walls is at the measured height
      const W = p.width / 2;
      const D = p.depth / 2;
      for (const [x, y] of [
        [0, -D + 0.5],
        [W - 0.5, 0],
        [0, D - 0.5],
        [-W + 0.5, 0],
        [-W + 30, -D + 0.5],
      ] as const)
        expect(topOver(m, x, y), `at ${x}, ${y}`).toBeCloseTo(topAt(p, x, y), 0);
      // 80 mm at the sharp corner of the footprint; the rounded corner stays a little lower
      expect(m.boundingBox().max[2]).toBeLessThanOrEqual(80 + 1e-6);
      expect(m.boundingBox().max[2]).toBeGreaterThan(79);

      const envelope =
        style === 'expanded'
          ? buildExpanded(wasm, scope, p, 'preview', true)
          : style === 'braid'
            ? buildBraid(wasm, scope, p, 'preview', true)
            : style === 'weave'
              ? // a solid wall as thick as the weave: lines may run on lengthwise in it
                buildTub(
                  wasm,
                  scope,
                  { ...p, wall: wallIntrusion(p), wallStyle: 'solid' },
                  'preview',
                )
              : buildTub(wasm, scope, p, 'preview');
      const r = overhangReport(m, envelope ? { envelope } : {});
      expect(r.maxArea, `worst layer z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge, `longest bridge z=${r.bridgeZ.toFixed(1)}`).toBeLessThanOrEqual(
        MAX_BRIDGE,
      );
    } finally {
      m.delete();
      scope.dispose();
    }
  });

  it.each([
    ['notch handles', { handleSides: sides('left', 'right') }],
    [
      'slot handles',
      { handleSides: sides('left', 'right'), handleType: 'slot', heightBR: 60, heightBL: 66 },
    ],
    ['dividers', { dividersX: [50, 100], dividersY: [40] }],
    ['label', { labelSides: sides('front'), labelTape: '12' }],
  ] as const)('with %s: one manifold body', (_n, patch) => {
    for (const wallStyle of ['voronoi', 'expanded'] as const) {
      const p = params({ wallStyle, ...(patch as Partial<BasketParams>) }).params;
      const m = buildManifold(wasm, p, 'preview');
      try {
        expect(m.status()).toBe('NoError');
        const parts = m.decompose();
        expect(parts.length, wallStyle).toBe(1);
        parts.forEach((x) => x.delete());
      } finally {
        m.delete();
      }
    }
  });

  it.each([
    ['gentle (under 2°)', 'expanded', { heightFL: 80, heightFR: 78, heightBL: 77, heightBR: 75 }],
    ['gentle (under 2°)', 'weave', { heightFL: 80, heightFR: 78, heightBL: 77, heightBR: 75 }],
    ['steep (22°)', 'expanded', { heightFL: 80, heightFR: 80, heightBL: 40, heightBR: 40 }],
    ['twisted', 'braid', { heightFL: 80, heightFR: 60, heightBL: 60, heightBR: 80 }],
    ['open weave', 'weave', { weave: { ...DEFAULTS.weave, rowGap: 4 } }],
    [
      'one corner raised, wide gaps',
      'braid',
      {
        heightFL: 80,
        heightFR: 80,
        heightBL: 97,
        heightBR: 80,
        braid: { ...DEFAULTS.braid, bandGap: 4.5 },
      },
    ],
  ] as const)('%s %s: printable', (_n, wallStyle, patch) => {
    const p = params({ wallStyle, ...(patch as Partial<BasketParams>) }).params;
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const envelope =
        wallStyle === 'expanded'
          ? buildExpanded(wasm, scope, p, 'preview', true)
          : wallStyle === 'braid'
            ? buildBraid(wasm, scope, p, 'preview', true)
            : buildTub(
                wasm,
                scope,
                { ...p, wall: wallIntrusion(p), wallStyle: 'solid' },
                'preview',
              );
      const r = overhangReport(m, envelope ? { envelope } : {});
      expect(r.maxArea, `worst layer z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      scope.dispose();
    }
  });

  it('dividers reach up to the sloping top', () => {
    const p = params({ wallStyle: 'solid', dividersX: [75] }).params;
    const m = buildManifold(wasm, p, 'preview');
    try {
      // divider at x = 0 runs front to back
      expect(topOver(m, 0, -20)).toBeCloseTo(topAt(p, 0, -20), 0);
      expect(topOver(m, 0, 30)).toBeCloseTo(topAt(p, 0, 30), 0);
    } finally {
      m.delete();
    }
  });
});
