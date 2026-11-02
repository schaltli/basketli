import { beforeAll, describe, expect, it } from 'vitest';
import { buildTub } from '../../src/geometry/basket';
import { buildManifold } from '../../src/geometry/build';
import { dividerFaces, dividerHoles } from '../../src/geometry/dividerPatterns';
import { dividerSolids, effectiveDividerTop, jointWidth } from '../../src/geometry/dividers';
import { loadManifold, Scope, type Wasm } from '../../src/geometry/manifold';
import { clampParams, DEFAULTS, type WallStyle } from '../../src/geometry/params';
import { buildExpanded } from '../../src/geometry/patterns/expanded';
import { MAX_BRIDGE, overhangReport } from '../../src/geometry/printability';
import { wallIntrusion } from '../../src/geometry/stacking';
import { dividerStakes } from '../../src/geometry/weave/divider';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const basket = (wallStyle: WallStyle, dividerHeight = 0) =>
  clampParams({
    ...DEFAULTS,
    wallStyle,
    dividersX: [55, 103],
    dividersY: [40],
    dividerHeight,
    dividerStyle: 'pattern',
  }).params;

describe('divider faces', () => {
  it('stretches run from wall to crossing to wall, keeping half a joint strip at each end', () => {
    const p = basket('hex');
    const half = jointWidth(p) / 2;
    const T = wallIntrusion(p);
    const faces = dividerFaces(p);
    expect(faces).toHaveLength(3);
    const x = faces.find((f) => f.axis === 'x' && f.pos === 55)!;
    expect(x.stretches).toHaveLength(2);
    expect(x.stretches[0]![0]).toBeCloseTo(T + half, 9);
    expect(x.stretches[0]![1]).toBeCloseTo(40 - half, 9);
    expect(x.stretches[1]![0]).toBeCloseTo(40 + half, 9);
    expect(x.stretches[1]![1]).toBeCloseTo(p.depth - T - half, 9);
    const y = faces.find((f) => f.axis === 'y')!;
    expect(y.stretches).toHaveLength(3);
    expect(x.z0).toBeCloseTo(p.floor + p.borderBand, 9);
    expect(x.z1).toBeCloseTo(effectiveDividerTop(p) - p.borderBand, 9);
  });
});

describe.each(['hex', 'voronoi'] as const)('%s dividers', (style) => {
  it('holes stay inside the stretches and the pattern zone', () => {
    const p = basket(style);
    const scope = new Scope();
    try {
      dividerFaces(p).forEach((face, i) => {
        const holes = dividerHoles(wasm, scope, p, face, i);
        expect(holes.length).toBeGreaterThan(0);
        for (const h of holes) {
          const xs = h.map((q) => q[0]);
          const zs = h.map((q) => q[1]);
          const inStretch = face.stretches.some(
            ([a, b]) => Math.min(...xs) >= a - 1e-6 && Math.max(...xs) <= b + 1e-6,
          );
          expect(inStretch).toBe(true);
          expect(Math.min(...zs)).toBeGreaterThanOrEqual(face.z0 - 1e-6);
          expect(Math.max(...zs)).toBeLessThanOrEqual(face.z1 + 1e-6);
        }
      });
    } finally {
      scope.dispose();
    }
  });
});

describe.each(['hex', 'voronoi', 'expanded'] as const)('%s basket with dividers', (style) => {
  it.each([
    ['full-height', 0],
    ['low', 40],
  ] as const)('%s: one body, open dividers, printable', (_n, dividerHeight) => {
    const p = basket(style, dividerHeight);
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      // the x-divider at 55 is open in the middle of its first stretch
      const t = wallIntrusion(p);
      const X = -p.width / 2 + 55;
      const face = dividerFaces(p)[0]!;
      const [a, b] = face.stretches[0]!;
      const box = wasm.Manifold.cube([t - 0.1, b - a, face.z1 - face.z0]).translate([
        X - t / 2 + 0.05,
        -p.depth / 2 + a,
        face.z0,
      ]);
      const cut = m.intersect(box);
      expect(cut.volume() / box.volume()).toBeLessThan(0.85);
      [cut, box].forEach((x) => x.delete());
      // printable: walls and dividers may extend lines in their own plane
      const wall =
        style === 'expanded'
          ? buildExpanded(wasm, scope, p, 'preview', true)
          : buildTub(wasm, scope, p, 'preview');
      const envelope = scope.keep(
        wasm.Manifold.union([wall, ...dividerSolids(wasm, scope, p, 'preview')]),
      );
      const r = overhangReport(m, { envelope });
      expect(r.maxArea, `worst layer z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge, `longest bridge z=${r.bridgeZ.toFixed(1)}`).toBeLessThanOrEqual(
        MAX_BRIDGE,
      );
    } finally {
      m.delete();
      scope.dispose();
    }
  });
});

describe('woven dividers', () => {
  it('stakes at both ends and every crossing, evenly between, within the bridge limit', () => {
    const stakes = dividerStakes([2, 40, 98], 12, 13.8);
    expect(stakes[0]).toBe(2);
    expect(stakes).toContain(40);
    expect(stakes[stakes.length - 1]).toBe(98);
    for (let i = 1; i < stakes.length; i++) {
      expect(stakes[i]! - stakes[i - 1]!).toBeGreaterThan(0);
      expect(stakes[i]! - stakes[i - 1]!).toBeLessThanOrEqual(13.8 + 1e-9);
    }
  });

  it.each([0, 4])('row gap %d: one body, the divider is woven (open between bands)', (rowGap) => {
    const p = clampParams({
      ...DEFAULTS,
      wallStyle: 'weave',
      weave: { ...DEFAULTS.weave, rowGap },
      dividersX: [55, 103],
      dividersY: [40],
      dividerStyle: 'pattern',
    }).params;
    const m = buildManifold(wasm, p, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      // across the x-divider at 55, mid-way between the front wall and the crossing:
      // bands weave round stakes, so the full thickness is not solid all the way up
      const t = wallIntrusion(p);
      const X = -p.width / 2 + 55;
      const box = wasm.Manifold.cube([t, 20, 40]).translate([X - t / 2, -p.depth / 2 + 10, 15]);
      const cut = m.intersect(box);
      expect(cut.volume() / box.volume()).toBeLessThan(0.9);
      expect(cut.volume()).toBeGreaterThan(0.2 * box.volume());
      [cut, box].forEach((x) => x.delete());
    } finally {
      m.delete();
    }
  });
});

describe('plain dividers', () => {
  it.each(['hex', 'voronoi', 'expanded', 'weave'] as const)(
    '%s basket with plain dividers: the dividers are solid',
    (wallStyle) => {
      const p = clampParams({
        ...DEFAULTS,
        wallStyle,
        dividersX: [55],
        dividerStyle: 'plain',
      }).params;
      const m = buildManifold(wasm, p, 'preview');
      try {
        expect(m.decompose().length).toBe(1);
        const t = wallIntrusion(p);
        const X = -p.width / 2 + 55;
        const box = wasm.Manifold.cube([t - 0.1, 30, 40]).translate([X - t / 2 + 0.05, -20, 15]);
        const cut = m.intersect(box);
        expect(cut.volume() / box.volume()).toBeGreaterThan(0.99);
        [cut, box].forEach((x) => x.delete());
      } finally {
        m.delete();
      }
    },
  );
});
