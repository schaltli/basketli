import type { Manifold } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../src/geometry/build';
import { dividerTop, MIN_COMPARTMENT } from '../../src/geometry/dividers';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  type BasketParams,
  type WallStyle,
} from '../../src/geometry/params';
import { stackPitch, wallIntrusion } from '../../src/geometry/stacking';

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
