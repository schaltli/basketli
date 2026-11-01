import type { CrossSection } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import {
  MAX_HOLE_TOP,
  MIN_TOP_DEG,
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

/** Width of a convex polygon at height y (0 outside). */
function widthAt(poly: Vec2[], y: number): [number, number] | undefined {
  const xs: number[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) return;
    xs.push(a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]));
  });
  return xs.length >= 2 ? [Math.min(...xs), Math.max(...xs)] : undefined;
}

function isInside(poly: Vec2[], q: Vec2): boolean {
  return poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    return (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= -1e-6;
  });
}

describe('printableHole', () => {
  const circle: Vec2[] = Array.from({ length: 48 }, (_, i) => {
    const a = (i / 48) * 2 * Math.PI;
    return [5 * Math.cos(a), 5 * Math.sin(a)];
  });
  // convex cell whose top flattens out (rounded corner + nearly flat top)
  const flatTop: Vec2[] = [
    [0, 0],
    [10, 0],
    [10, 6],
    [9.5, 7.5],
    [8, 8.2],
    [2, 8.6], // ~4° top edge
    [0, 7],
  ];

  it.each([
    ['circle', circle],
    ['flat top', flatTop],
  ] as const)('%s: only shrinks, closes ≤ MIN_TOP_DEG per side, flat bridge on top', (_n, cell) => {
    const hole = printableHole(cell);
    hole.forEach((q) => expect(isInside(cell, q)).toBe(true));
    const tan = Math.tan((MIN_TOP_DEG * Math.PI) / 180);
    const maxStep = (0.2 / tan) * 1.001;
    const ys = hole.map((q) => q[1]);
    const top = Math.max(...ys);
    for (let y = Math.min(...ys) + 0.2; y < top - 0.2; y += 0.2) {
      const lower = widthAt(hole, y)!;
      const upper = widthAt(hole, y + 0.2);
      if (!upper) continue;
      expect(upper[0] - lower[0]).toBeLessThanOrEqual(maxStep); // left side closes in
      expect(lower[1] - upper[1]).toBeLessThanOrEqual(maxStep); // right side closes in
    }
  });

  it('keeps steep parts of the real cell shape', () => {
    const cell: Vec2[] = [
      [0, 0],
      [6, 0],
      [7, 6],
      [3, 10],
      [-1, 6],
    ];
    const hole = printableHole(cell);
    // the steep lower flanks are unchanged
    expect(widthAt(hole, 3)![0]).toBeCloseTo(widthAt(cell, 3)![0], 1);
    expect(widthAt(hole, 3)![1]).toBeCloseTo(widthAt(cell, 3)![1], 1);
  });

  it('never leaves a hole wider than MAX_HOLE_TOP', () => {
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
      const r = overhangReport(m, { envelope: tub });
      expect(r.maxArea, `z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      tub.delete();
    }
  });
});
