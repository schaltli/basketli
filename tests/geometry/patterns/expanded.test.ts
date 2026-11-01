import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import {
  buildExpanded,
  diamondPitch,
  diamondPolygon,
  expandedLayout,
  maxTwist,
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

describe('diamond lattice', () => {
  it.each([
    [5, 12, 1.6],
    [3, 6, 1],
    [10, 30, 4],
  ])('w=%d h=%d strand=%d: parallel diamond edges exactly a strand apart', (w, h, t) => {
    const { ps, pz } = diamondPitch(w, h, t);
    const d = diamondPolygon(w, h);
    const a = d[1]!; // right vertex
    const b = d[2]!; // top vertex → upper-right edge a–b
    const nx = b[1] - a[1];
    const ny = a[0] - b[0];
    // left vertex of the diagonal neighbour (shifted by ps/2, pz/2) lies on
    // the parallel edge of that neighbour
    const q: [number, number] = [ps / 2 - w / 2, pz / 2];
    const dist = Math.abs((q[0] - a[0]) * nx + (q[1] - a[1]) * ny) / Math.hypot(nx, ny);
    expect(dist).toBeCloseTo(t, 9);
    expect(pz / ps).toBeCloseTo(h / w, 9); // aspect ratio kept
  });

  it('wraps the perimeter: whole number of diamonds per row', () => {
    const l = expandedLayout(params());
    const n = l.path.length / l.ps;
    expect(Math.abs(n - Math.round(n))).toBeLessThan(1e-9);
    expect(l.count).toBe(Math.round(n));
  });
});

describe('twist limit', () => {
  it('clampParams keeps the twist below the 45° limit', () => {
    const e = params({}, { twist: 2, strand: 1 }).expanded;
    expect(e.twist).toBeLessThanOrEqual(maxTwist(e.diamondWidth, e.diamondHeight, e.strand));
  });
});

describe('expanded metal basket', () => {
  it.each([
    ['defaults', params()],
    ['small diamonds', params({}, { diamondWidth: 3, diamondHeight: 6, strand: 1 })],
    ['big diamonds, no twist', params({}, { diamondWidth: 10, diamondHeight: 24, twist: 0 })],
    ['max twist', params({}, { twist: 2 })],
    ['default size basket', params({ width: 150, depth: 100, height: 80 })],
  ] as const)('%s: one manifold body, exact size, holes, printable', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      const envelope = buildExpanded(wasm, scope, p, 'preview', true);
      expect(m.status()).toBe('NoError');
      expect(m.volume()).toBeGreaterThan(0);
      expect(m.volume()).toBeLessThan(envelope.volume() * 0.85); // holes really there
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const box = m.boundingBox();
      expect(box.max[0]).toBeCloseTo(p.width / 2, 1);
      expect(box.max[1]).toBeCloseTo(p.depth / 2, 1);
      expect(box.max[2]).toBeCloseTo(p.height, 3);
      const r = overhangReport(m, { envelope });
      expect(r.maxArea, `z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      scope.dispose();
    }
  });
});
