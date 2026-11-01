import type { CrossSection } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import {
  MAX_HOLE_TOP,
  printableHole,
  voronoiCutters,
  voronoiHoles,
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
  const params = (cellSize: number) =>
    clampParams({
      ...DEFAULTS,
      handles: 'none',
      wallStyle: 'voronoi',
      voronoi: { cellSize, seed: 1 },
    }).params;

  /** True if no two of the holes come closer than `gap`. */
  function apart(cs: CrossSection, gap: number, scope: Scope): boolean {
    const grown = scope.keep(cs.offset(gap / 2, 'Round'));
    const merged = grown.decompose();
    const separate = cs.decompose();
    const ok = merged.length === separate.length;
    [...merged, ...separate].forEach((x) => x.delete());
    return ok;
  }

  it.each([6, 9, 12])('cell size %d: webs exactly webWidth on the outside', (cellSize) => {
    const p = params(cellSize);
    const scope = new Scope();
    try {
      const holes = voronoiHoles(wasm, scope, p);
      const cs = scope.keep(wasm.CrossSection.ofPolygons(holes));
      // 2 % allowance for polygonised round corners
      expect(apart(cs, p.webWidth * 0.98, scope)).toBe(true);
      expect(apart(cs, p.webWidth * 1.1, scope)).toBe(false); // and not much wider
    } finally {
      scope.dispose();
    }
  });

  it.each([6, 9, 12])('cell size %d: inner corner webs ≥ 80 % of webWidth', (cellSize) => {
    const p = params(cellSize);
    const scope = new Scope();
    try {
      const cutters = voronoiCutters(wasm, scope, p);
      const cut = scope.keep(scope.keep(wasm.Manifold.union(cutters)).slice(p.height / 2));
      // only the part of each hole that lies inside the wall material
      const tub = scope.keep(buildManifold(wasm, { ...p, wallStyle: 'solid' }, 'export'));
      const wall = scope.keep(tub.slice(p.height / 2));
      const holes = scope.keep(cut.intersect(wall));
      expect(apart(holes, p.webWidth * 0.8 * 0.98, scope)).toBe(true);
    } finally {
      scope.dispose();
    }
  });

  it('runs round the corners (holes on the corner arcs)', () => {
    const p = params(9);
    const scope = new Scope();
    try {
      const L = 2 * (p.width + p.depth) - (8 - 2 * Math.PI) * p.cornerRadius;
      const firstCorner = (p.width - 2 * p.cornerRadius) / 2; // arc length of the first corner start
      const arc = (Math.PI / 2) * p.cornerRadius;
      const holes = voronoiHoles(wasm, scope, p);
      const onCorner = holes.filter((h) =>
        h.some(([x]) => {
          const s = ((x % L) + L) % L;
          return s > firstCorner && s < firstCorner + arc;
        }),
      );
      expect(onCorner.length).toBeGreaterThan(0);
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
