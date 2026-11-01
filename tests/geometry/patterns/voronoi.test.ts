import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import {
  MAX_HOLE_TOP,
  printableHole,
  voronoiCutters,
  voronoiCells,
  voronoiSites,
  type Rect,
} from '../../../src/geometry/patterns/voronoi';
import { MAX_BRIDGE, overhangReport } from '../../../src/geometry/printability';
import type { Vec2 } from '../../../src/geometry/shapes';
import { polygonArea } from './util';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const domain: Rect = { x0: -40, y0: 10, x1: 40, y1: 70 };

describe('voronoi cells', () => {
  it('same seed → same sites, other seed → other sites', () => {
    expect(voronoiSites(domain, 12, 7)).toEqual(voronoiSites(domain, 12, 7));
    expect(voronoiSites(domain, 12, 7)).not.toEqual(voronoiSites(domain, 12, 8));
  });

  it('cells tile the domain exactly and each contains its site', () => {
    const sites = voronoiSites(domain, 12, 3);
    const cells = voronoiCells(domain, sites, 12);
    const total = cells.reduce((a, c) => a + polygonArea(c), 0);
    expect(total).toBeCloseTo((domain.x1 - domain.x0) * (domain.y1 - domain.y0), 6);
    cells.forEach((c, i) => {
      const [sx, sy] = sites[i]!;
      const xs = c.map((q) => q[0]);
      const ys = c.map((q) => q[1]);
      expect(sx).toBeGreaterThanOrEqual(Math.min(...xs));
      expect(sx).toBeLessThanOrEqual(Math.max(...xs));
      expect(sy).toBeGreaterThanOrEqual(Math.min(...ys));
      expect(sy).toBeLessThanOrEqual(Math.max(...ys));
    });
  });
});

describe('printableHole', () => {
  it('cuts the shallow top of a circle-like hole flat', () => {
    const circle: Vec2[] = Array.from({ length: 32 }, (_, i) => {
      const a = (i / 32) * 2 * Math.PI;
      return [5 * Math.cos(a), 5 * Math.sin(a)];
    });
    const hole = printableHole(circle);
    const top = Math.max(...hole.map((q) => q[1]));
    expect(top).toBeLessThan(5);
    expect(top).toBeGreaterThan(5 * Math.SQRT1_2 - 0.5); // ~ where the outline reaches 45°
    // every upper edge is either steep (≥ 45°) or the flat top
    hole.forEach((q, i) => {
      const r = hole[(i + 1) % hole.length]!;
      const dx = r[0] - q[0];
      const dy = r[1] - q[1];
      if (dx < 0 && Math.abs(dy) > 1e-9)
        expect(Math.abs(dy)).toBeGreaterThanOrEqual(Math.abs(dx) - 1e-9);
    });
    expect(polygonArea(hole)).toBeLessThan(polygonArea(circle));
  });

  it('never leaves a flat top wider than MAX_HOLE_TOP', () => {
    const wide: Vec2[] = [
      [-12, 0],
      [12, 0],
      [12, 8],
      [-12, 8],
    ];
    const hole = printableHole(wide);
    const xs = hole.map((q) => q[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeLessThanOrEqual(MAX_HOLE_TOP + 1e-9);
  });
});

describe('voronoi webs', () => {
  it.each([6, 9, 12])('cell size %d: no web thinner than webWidth', async (cellSize) => {
    const p = clampParams({
      ...DEFAULTS,
      handles: 'none',
      wallStyle: 'voronoi',
      voronoi: { cellSize, seed: 1 },
    }).params;
    const wasmLocal = await loadManifold();
    const scope = new Scope();
    try {
      const cutters = voronoiCutters(wasmLocal, scope, p);
      // Slice the front-face cutters at mid height: holes there must be at
      // least webWidth apart (allow 2 % for polygonised round corners).
      const holes = scope.keep(wasmLocal.Manifold.union(cutters)).slice(p.height / 2);
      const grown = scope.keep(holes.offset((p.webWidth / 2) * 0.98, 'Round'));
      const merged = grown.decompose().length;
      const separate = holes.decompose().length;
      expect(merged).toBe(separate);
    } finally {
      scope.dispose();
    }
  });
});

describe('voronoi basket', () => {
  const base = (patch: Partial<BasketParams> = {}) =>
    clampParams({
      ...DEFAULTS,
      width: 80,
      depth: 60,
      height: 50,
      handles: 'none',
      stackable: false,
      wallStyle: 'voronoi',
      ...patch,
    }).params;

  it.each([
    ['default cells', base()],
    ['small cells', base({ voronoi: { cellSize: 6, seed: 2 } })],
    ['large cells', base({ voronoi: { cellSize: 12, seed: 3 } })],
    ['large cells, seed 4', base({ voronoi: { cellSize: 12, seed: 4 } })],
    ['large cells, seed 5', base({ voronoi: { cellSize: 12, seed: 5 } })],
    ['default size basket', base({ width: 150, depth: 100, height: 80 })],
  ] as const)('%s: one manifold body, holes cut, printable', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    const tub = buildManifold(wasm, { ...p, wallStyle: 'solid' }, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      expect(m.volume()).toBeLessThan(tub.volume() * 0.9); // holes really cut
      const r = overhangReport(m);
      expect(r.maxArea, `z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      tub.delete();
    }
  });
});
