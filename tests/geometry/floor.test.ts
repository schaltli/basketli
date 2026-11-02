import { beforeAll, describe, expect, it } from 'vitest';
import { buildTub } from '../../src/geometry/basket';
import { buildManifold } from '../../src/geometry/build';
import { dividerSolids } from '../../src/geometry/dividers';
import { floorCompartments, floorHoles } from '../../src/geometry/floor';
import { loadManifold, Scope, type Wasm } from '../../src/geometry/manifold';
import { clampParams, DEFAULTS, type FloorPattern } from '../../src/geometry/params';
import { MAX_BRIDGE, overhangReport } from '../../src/geometry/printability';
import { stackPitch, wallIntrusion } from '../../src/geometry/stacking';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const basket = (floorPattern: FloorPattern, extra = {}) =>
  clampParams({
    ...DEFAULTS,
    wallStyle: 'solid',
    floorPattern,
    dividersX: [55],
    dividersY: [40],
    ...extra,
  }).params;

const PATTERNS = ['hex', 'voronoi', 'diamond', 'slots'] as const;

describe('floor pattern', () => {
  it('closed by default', () => {
    expect(DEFAULTS.floorPattern).toBe('closed');
    const scope = new Scope();
    try {
      expect(floorHoles(wasm, scope, { ...DEFAULTS }, 'preview')).toEqual([]);
    } finally {
      scope.dispose();
    }
  });

  it('compartments: one per cell of the grid, clear of the walls and the divider strips', () => {
    const p = basket('hex');
    const scope = new Scope();
    try {
      const comps = floorCompartments(wasm, scope, p, 'preview');
      expect(comps).toHaveLength(4);
      const half = wallIntrusion(p) / 2 + p.floorWebWidth;
      const X = -p.width / 2 + 55;
      const Y = -p.depth / 2 + 40;
      for (const c of comps)
        for (const [x, y] of c) {
          expect(Math.abs(x - X)).toBeGreaterThanOrEqual(half - 1e-6);
          expect(Math.abs(y - Y)).toBeGreaterThanOrEqual(half - 1e-6);
        }
    } finally {
      scope.dispose();
    }
  });

  it.each(PATTERNS)('%s: holes only inside the compartments', (pattern) => {
    const p = basket(pattern);
    const scope = new Scope();
    try {
      const comps = floorCompartments(wasm, scope, p, 'preview');
      const holes = floorHoles(wasm, scope, p, 'preview');
      expect(holes.length).toBeGreaterThan(4);
      const inside = (q: [number, number], c: [number, number][]) =>
        c.every((a, i) => {
          const b = c[(i + 1) % c.length]!;
          return (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]) >= -1e-3;
        });
      for (const h of holes) expect(comps.some((c) => h.every((q) => inside(q, c)))).toBe(true);
    } finally {
      scope.dispose();
    }
  });

  it.each(['hex', 'diamond', 'slots'] as const)(
    '%s: whole holes, centred in each compartment',
    (pattern) => {
      const p = basket(pattern);
      const scope = new Scope();
      try {
        const comps = floorCompartments(wasm, scope, p, 'preview');
        const holes = floorHoles(wasm, scope, p, 'preview');
        for (const c of comps) {
          const xs = c.map((q) => q[0]);
          const ys = c.map((q) => q[1]);
          const [x0, x1, y0, y1] = [
            Math.min(...xs),
            Math.max(...xs),
            Math.min(...ys),
            Math.max(...ys),
          ];
          const mine = holes.filter((h) =>
            h.every(
              ([x, y]) => x >= x0 - 1e-6 && x <= x1 + 1e-6 && y >= y0 - 1e-6 && y <= y1 + 1e-6,
            ),
          );
          expect(mine.length).toBeGreaterThan(0);
          const hx = mine.flatMap((h) => h.map((q) => q[0]));
          // the same margin left and right (the floor's rounded corners may cut rows short, so
          // check across the middle only)
          const mid = mine.filter((h) => {
            const cy = h.reduce((s, q) => s + q[1], 0) / h.length;
            return Math.abs(cy - (y0 + y1) / 2) < p.floorHoleSize * 1.5;
          });
          const mx = mid.flatMap((h) => h.map((q) => q[0]));
          if (mid.length > 0) expect(Math.min(...mx) - x0).toBeCloseTo(x1 - Math.max(...mx), 1);
          expect(hx.length).toBeGreaterThan(0);
        }
      } finally {
        scope.dispose();
      }
    },
  );

  it.each(PATTERNS)('%s: one body, open floor, printable', (pattern) => {
    const p = basket(pattern, { wallStyle: 'hex' });
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const closed = buildManifold(wasm, { ...p, floorPattern: 'closed' }, 'preview');
      const open = m.slice(p.floor / 2).area();
      const full = closed.slice(p.floor / 2).area();
      closed.delete();
      expect(open).toBeLessThan(0.85 * full);
      const envelope = scope.keep(
        wasm.Manifold.union([
          buildTub(wasm, scope, p, 'preview'),
          ...dividerSolids(wasm, scope, p, 'preview'),
        ]),
      );
      const r = overhangReport(m, { envelope });
      expect(r.maxArea, `worst layer z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      scope.dispose();
    }
  });

  it('a basket with an open floor still stacks at the same pitch', () => {
    const lower = basket('slots');
    const upper = basket('hex');
    const lo = buildManifold(wasm, lower, 'preview');
    const up = buildManifold(wasm, upper, 'preview');
    try {
      const pitch = stackPitch(lower, upper);
      const at = (dz: number) => {
        const moved = up.translate([0, 0, dz]);
        const both = lo.intersect(moved);
        const v = both.volume();
        both.delete();
        moved.delete();
        return v;
      };
      expect(at(pitch + 0.05)).toBeLessThan(1e-3);
      expect(at(pitch - 0.05)).toBeGreaterThan(1e-3);
    } finally {
      lo.delete();
      up.delete();
    }
  });
});
