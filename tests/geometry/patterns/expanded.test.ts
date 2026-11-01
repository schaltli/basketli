import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import {
  buildExpanded,
  expandedField,
  expandedHoles,
  expandedLayout,
  latticePitch,
  lensPolygon,
  polygonDistance,
} from '../../../src/geometry/patterns/expanded';
import { MAX_BRIDGE, overhangReport } from '../../../src/geometry/printability';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const params = (patch: Partial<BasketParams> = {}, e: Partial<BasketParams['expanded']> = {}) =>
  clampParams({
    ...DEFAULTS,
    width: 80,
    depth: 60,
    height: 50,
    handles: 'none',
    stackable: false,
    ...patch,
    wallStyle: 'expanded',
    expanded: { ...DEFAULTS.expanded, ...e },
  }).params;

describe('lens', () => {
  it('stands upright with pointed tips and the requested size', () => {
    const lens = lensPolygon(5, 12);
    const xs = lens.map((q) => q[0]);
    const ys = lens.map((q) => q[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(5, 2);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(12, 6);
    expect(lens).toContainEqual([expect.closeTo(0, 9), expect.closeTo(-6, 9)]); // bottom tip
  });
});

describe('lattice', () => {
  it.each([
    [5, 12, 1.6],
    [3, 6, 1],
    [10, 30, 4],
  ])('w=%d h=%d strand=%d: neighbours exactly a strand apart', (w, h, t) => {
    const { ps, pz } = latticePitch(w, h, t);
    const lens = lensPolygon(w, h);
    const moved = (dx: number, dy: number) =>
      lens.map(([x, y]) => [x + dx, y + dy] as [number, number]);
    const diag = polygonDistance(lens, moved(ps / 2, pz / 2));
    expect(diag).toBeGreaterThanOrEqual(t - 1e-6);
    const narrowest = Math.min(
      diag,
      polygonDistance(lens, moved(ps, 0)),
      polygonDistance(lens, moved(0, pz)),
    );
    expect(narrowest).toBeLessThan(t + 0.05); // not wastefully wide
  });

  it('wraps the whole perimeter: whole number of lenses per row, staggered rows', () => {
    const p = params();
    const l = expandedLayout(p);
    const n = l.path.length / l.ps;
    expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
    expect(l.rows.length).toBeGreaterThan(2);
    const holes = expandedHoles(p, l);
    expect(holes.length).toBe(Math.round(n) * l.rows.length);
  });
});

describe('twisted sheet', () => {
  it('outer face leans out at most 45°, inner face too', () => {
    const p = params();
    const l = expandedLayout(p);
    const f = expandedField(p, l, 'preview');
    const K = f.z.length;
    for (let k = 1; k < K; k++) {
      const dz = f.z[k]! - f.z[k - 1]!;
      expect(f.outer[k]! - f.outer[k - 1]!).toBeLessThanOrEqual(dz + 1e-9);
      expect(f.inner[k - 1]! - f.inner[k]!).toBeLessThanOrEqual(dz + 1e-9);
    }
    // the relief is really there
    const outs = Array.from({ length: K }, (_, k) => f.outer[k]!);
    expect(Math.max(...outs) - Math.min(...outs)).toBeGreaterThan(p.expanded.twist * 0.8);
    // and the mesh stays light: few columns, few levels
    expect(f.s.length * K).toBeLessThan(20000);
  });
});

describe('expanded metal basket', () => {
  it.each([
    ['defaults', params()],
    ['small lenses', params({}, { lensWidth: 3, lensHeight: 6, strand: 1 })],
    ['big lenses, no twist', params({}, { lensWidth: 10, lensHeight: 24, twist: 0 })],
    ['default size basket', params({ width: 150, depth: 100, height: 80 })],
  ] as const)('%s: one manifold body, exact size, printable', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      const sheet = buildExpanded(wasm, scope, p, 'preview', false);
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const box = m.boundingBox();
      expect(box.max[0]).toBeCloseTo(p.width / 2, 1);
      expect(box.max[1]).toBeCloseTo(p.depth / 2, 1);
      expect(m.volume()).toBeLessThan(sheet.volume() * 0.85); // holes really cut
      const r = overhangReport(m, { envelope: sheet });
      expect(r.maxArea, `z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      scope.dispose();
    }
  });
});
