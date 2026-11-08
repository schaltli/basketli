import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import { hexagon, hexHoles, hexLayout } from '../../../src/geometry/patterns/hex';
import { MAX_BRIDGE, overhangReport } from '../../../src/geometry/printability';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const params = (patch: Partial<BasketParams> = {}) =>
  clampParams({
    ...DEFAULTS,
    width: 80,
    depth: 60,
    height: 50,
    stackable: false,
    ...patch,
    wallStyle: 'hex',
  }).params;

describe('hexagon', () => {
  it('pointy top, width across the flats', () => {
    const h = hexagon(10);
    const xs = h.map((q) => q[0]);
    const ys = h.map((q) => q[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(10, 9);
    expect(Math.max(...ys)).toBeCloseTo(10 / Math.sqrt(3), 9); // top vertex
  });
});

describe('honeycomb layout', () => {
  it('wraps the perimeter exactly, staggered rows, webs ≥ web width', () => {
    const p = params();
    const l = hexLayout(p);
    expect(l.count * l.px).toBeCloseTo(l.path.length, 9);
    expect(l.px - p.holeSize).toBeGreaterThanOrEqual(p.webWidth - 1e-9);
    expect(hexHoles(p)).toHaveLength(l.count * l.rows.length);
    expect(l.rows.length).toBeGreaterThan(1);
  });

  it('webs between all neighbours are at least the web width', () => {
    const p = params();
    const scope = new Scope();
    try {
      const cs = scope.keep(wasm.CrossSection.ofPolygons(hexHoles(p)));
      const grown = scope.keep(cs.offset((p.webWidth / 2) * 0.98, 'Round'));
      const a = grown.decompose();
      const b = cs.decompose();
      expect(a.length).toBe(b.length);
      [...a, ...b].forEach((x) => x.delete());
    } finally {
      scope.dispose();
    }
  });
});

describe('honeycomb basket', () => {
  it.each([
    ['defaults', params()],
    ['small holes', params({ holeSize: 4, webWidth: 1.5 })],
    ['large holes', params({ holeSize: 16 })],
    ['default size basket', params({ width: 150, depth: 100, height: 80 })],
  ] as const)('%s: one manifold body, holes, printable', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    const tub = buildManifold(wasm, { ...p, wallStyle: 'solid' }, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      expect(m.volume()).toBeLessThan(tub.volume() * 0.9);
      const r = overhangReport(m, { envelope: tub });
      expect(r.maxArea, `z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      tub.delete();
    }
  });
});
