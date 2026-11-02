import type { Manifold } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTub } from '../../src/geometry/basket';
import { buildManifold } from '../../src/geometry/build';
import { dividerTop, MIN_COMPARTMENT } from '../../src/geometry/dividers';
import { junctionArcs, wallSegments } from '../../src/geometry/junctions';
import { loadManifold, Scope, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  type BasketParams,
  type WallStyle,
} from '../../src/geometry/params';
import { buildExpanded } from '../../src/geometry/patterns/expanded';
import { hexHoles } from '../../src/geometry/patterns/hex';
import { voronoiHoles } from '../../src/geometry/patterns/voronoi';
import { MAX_BRIDGE, overhangReport } from '../../src/geometry/printability';
import { stackPitch, wallIntrusion } from '../../src/geometry/stacking';
import { weaveLayout } from '../../src/geometry/weave/layout';
import { RoundedRectPath } from '../../src/geometry/weave/outline';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const withDividers = (patch: Partial<BasketParams>) => clampParams({ ...DEFAULTS, ...patch });

function inBox(m: Manifold, min: [number, number, number], max: [number, number, number]) {
  const box = wasm.Manifold.cube([max[0] - min[0], max[1] - min[1], max[2] - min[2]]).translate(
    min,
  );
  const cut = m.intersect(box);
  const v = cut.volume();
  cut.delete();
  box.delete();
  return v;
}

describe('divider parameters', () => {
  it('none by default, height "as high as possible"', () => {
    expect(DEFAULTS.dividersX).toEqual([]);
    expect(DEFAULTS.dividersY).toEqual([]);
    expect(DEFAULTS.dividerHeight).toBe(0);
  });

  it('sorts positions and keeps every compartment at least MIN_COMPARTMENT wide', () => {
    const r = withDividers({ dividersX: [100, 50, 52, 149] });
    const T = wallIntrusion(r.params);
    const xs = r.params.dividersX;
    expect(xs).toEqual([...xs].sort((a, b) => a - b));
    const edges = [T, ...xs, r.params.width - T];
    for (let i = 1; i < edges.length; i++)
      expect(edges[i]! - edges[i - 1]! - T).toBeGreaterThanOrEqual(MIN_COMPARTMENT - 1e-9);
    expect(xs).toContain(50);
    expect(xs).toContain(100);
    expect(r.notices).toContainEqual(expect.objectContaining({ field: 'dividersX', kind: 'rule' }));
  });

  it('drops dividers that no longer fit when the basket gets smaller', () => {
    const r = withDividers({ width: 80, dividersX: [40, 120] });
    expect(r.params.dividersX).toEqual([40]);
  });

  it('height: 0 stays "maximal"; a set height is limited to what stacking allows', () => {
    expect(withDividers({ dividersX: [75] }).params.dividerHeight).toBe(0);
    const r = withDividers({ dividersX: [75], dividerHeight: 300 });
    expect(r.params.dividerHeight).toBeCloseTo(dividerTop(r.params), 9);
    expect(r.notices).toContainEqual(expect.objectContaining({ field: 'dividerHeight' }));
  });

  it('the top stays below the foot of a basket stacked on top', () => {
    const p = withDividers({ dividersX: [75] }).params;
    expect(dividerTop(p)).toBeLessThan(stackPitch(p, p));
    const loose = withDividers({ dividersX: [75], stackable: false }).params;
    expect(dividerTop(loose)).toBeCloseTo(loose.height, 9);
  });
});

const styles: [string, WallStyle, number][] = [
  ['Streckmetall', 'expanded', 0],
  ['Waben', 'hex', 0],
  ['Voronoi', 'voronoi', 0],
  ['Geflecht geschlossen', 'weave', 0],
  ['Geflecht offen', 'weave', 4],
];

describe.each(styles)('%s with dividers', (_n, wallStyle, rowGap) => {
  it('one body, dividers at their positions, below the stacking limit', () => {
    const p = withDividers({
      wallStyle,
      weave: { ...DEFAULTS.weave, rowGap },
      dividersX: [60],
      dividersY: [45],
    }).params;
    const m = buildManifold(wasm, p, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const t = wallIntrusion(p);
      const top = dividerTop(p);
      const x = -p.width / 2 + 60;
      const y = -p.depth / 2 + 45;
      const z: [number, number] = [p.floor + 2, top - 1];
      // x-divider: solid across its thickness, nothing just beside it
      const inside = inBox(m, [x - t / 2 + 0.02, 10, z[0]], [x + t / 2 - 0.02, 20, z[1]]);
      expect(inside / ((t - 0.04) * 10 * (z[1] - z[0]))).toBeGreaterThan(0.99);
      expect(inBox(m, [x + t / 2 + 0.05, 10, z[0]], [x + t / 2 + 1, 20, z[1]])).toBeLessThan(1e-3);
      // y-divider likewise
      const across = inBox(m, [20, y - t / 2 + 0.02, z[0]], [30, y + t / 2 - 0.02, z[1]]);
      expect(across / ((t - 0.04) * 10 * (z[1] - z[0]))).toBeGreaterThan(0.99);
      // top edge
      expect(inBox(m, [x - t / 2, 10, top + 0.05], [x + t / 2, 20, top + 2])).toBeLessThan(1e-3);
    } finally {
      m.delete();
    }
  });
});

describe('stacking with dividers', () => {
  it('a basket with full-height dividers still carries the next one at the same pitch', () => {
    const lower = withDividers({ wallStyle: 'hex', dividersX: [50, 100], dividersY: [50] }).params;
    const upper = withDividers({ wallStyle: 'hex' }).params;
    const lo = buildManifold(wasm, lower, 'preview');
    const up = buildManifold(wasm, upper, 'preview');
    try {
      const pitch = stackPitch(lower, upper);
      const moved = up.translate([0, 0, pitch + 0.05]);
      const both = lo.intersect(moved);
      expect(both.volume()).toBeLessThan(1e-3);
      [moved, both].forEach((x) => x.delete());
    } finally {
      lo.delete();
      up.delete();
    }
  });
});

describe('wall pattern per compartment', () => {
  const base = (wallStyle: WallStyle, rowGap = 0) =>
    withDividers({
      wallStyle,
      weave: { ...DEFAULTS.weave, rowGap },
      dividersX: [55, 103],
      dividersY: [40],
    }).params;

  it('junctions: where each divider meets the wall', () => {
    const p = base('hex');
    const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
    const arcs = junctionArcs(p, path);
    expect(arcs).toHaveLength(2 * 2 + 2);
    const pts = arcs.map((s) => path.at(s).p);
    for (const x of p.dividersX) {
      const X = -p.width / 2 + x;
      expect(pts.filter((q) => Math.abs(q[0] - X) < 1e-6)).toHaveLength(2);
    }
    const Y = -p.depth / 2 + p.dividersY[0]!;
    expect(pts.filter((q) => Math.abs(q[1] - Y) < 1e-6)).toHaveLength(2);
  });

  it('honeycomb: whole hexagons per stretch, centred, a web away from the dividers', () => {
    const p = base('hex');
    const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
    const arcs = junctionArcs(p, path);
    const t = wallIntrusion(p);
    const holes = hexHoles(p);
    const rowY = Math.min(...holes.map((h) => Math.min(...h.map((q) => q[1]))));
    for (const { a, b } of wallSegments(arcs, path.length)) {
      const lo = a + t / 2;
      const hi = b - t / 2;
      const inside = holes.filter((h) => {
        const c = h.reduce((s, q) => s + q[0], 0) / h.length;
        return c > lo && c < hi;
      });
      for (const h of inside)
        for (const [x] of h) {
          expect(x - lo).toBeGreaterThanOrEqual(p.webWidth - 1e-6);
          expect(hi - x).toBeGreaterThanOrEqual(p.webWidth - 1e-6);
        }
      // bottom row: the same gap to both dividers
      const row = inside.filter((h) => Math.abs(Math.min(...h.map((q) => q[1])) - rowY) < 1e-6);
      if (row.length === 0) continue;
      const xs = row.flatMap((h) => h.map((q) => q[0]));
      expect(Math.min(...xs) - lo).toBeCloseTo(hi - Math.max(...xs), 6);
    }
  });

  it('Voronoi: cells keep a web away from every divider', () => {
    const p = base('voronoi');
    const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
    const arcs = junctionArcs(p, path);
    const t = wallIntrusion(p);
    const scope = new Scope();
    try {
      const holes = voronoiHoles(wasm, scope, p);
      const L = path.length;
      for (const h of holes)
        for (const [x] of h)
          for (const s of arcs) {
            const d = Math.abs(((((x - s) % L) + 1.5 * L) % L) - L / 2);
            expect(d).toBeGreaterThanOrEqual(t / 2 + p.webWidth - 1e-3);
          }
    } finally {
      scope.dispose();
    }
  });

  it.each([0, 4])('weave (row gap %d): a stake at every divider, even count, spacing ok', (gap) => {
    const p = base('weave', gap);
    const l = weaveLayout(p);
    const arcs = junctionArcs(p, l.path);
    for (const s of arcs)
      expect(Math.min(...l.stakes.map((x) => Math.abs(x - s)))).toBeLessThan(1e-6);
    expect(l.stakeCount % 2).toBe(0);
    const L = l.path.length;
    const st = l.stakes;
    for (let i = 0; i < st.length; i++) {
      const next = i + 1 < st.length ? st[i + 1]! : st[0]! + L;
      expect(next - st[i]!).toBeGreaterThan(0);
      expect(next - st[i]!).toBeLessThanOrEqual(15 - p.weave.materialThickness + 1e-9);
    }
  });

  it('expanded metal: a solid strip where a divider meets the wall', () => {
    const p = base('expanded');
    const m = buildManifold(wasm, p, 'preview');
    try {
      const t = wallIntrusion(p);
      const X = -p.width / 2 + p.dividersX[0]!;
      const box: [[number, number, number], [number, number, number]] = [
        [X - t / 2 + 0.05, -p.depth / 2 + 0.05, 15],
        [X + t / 2 - 0.05, -p.depth / 2 + t - 0.05, p.height - 10],
      ];
      const vol = (t - 0.1) * (t - 0.1) * (p.height - 25);
      expect(inBox(m, ...box) / vol).toBeGreaterThan(0.97);
    } finally {
      m.delete();
    }
  });

  it.each(styles)('%s: printable without support', (_n, wallStyle, rowGap) => {
    const p = base(wallStyle, rowGap);
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      const envelope =
        wallStyle === 'expanded'
          ? buildExpanded(wasm, scope, p, 'preview', true)
          : wallStyle === 'weave'
            ? undefined
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
});
