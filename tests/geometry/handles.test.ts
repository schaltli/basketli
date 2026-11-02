import type { Manifold } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTub } from '../../src/geometry/basket';
import { buildManifold } from '../../src/geometry/build';
import { handleArcCenters } from '../../src/geometry/handles';
import { loadManifold, Scope, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  HANDLE_FRAME,
  type BasketParams,
  type HandleMode,
  type WallStyle,
} from '../../src/geometry/params';
import { buildExpanded } from '../../src/geometry/patterns/expanded';
import { MAX_BRIDGE, overhangReport } from '../../src/geometry/printability';
import { stackPitch, wallIntrusion } from '../../src/geometry/stacking';
import { RoundedRectPath } from '../../src/geometry/weave/outline';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const basket = (wallStyle: WallStyle, handles: HandleMode, rowGap = 0): BasketParams =>
  clampParams({ ...DEFAULTS, wallStyle, handles, weave: { ...DEFAULTS.weave, rowGap } }).params;

/** Volume of `m` inside an axis-aligned box. */
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

describe('handle sites', () => {
  it('end walls are the shorter walls; their centers on the outline path', () => {
    const wide = basket('voronoi', 'ends');
    const path = new RoundedRectPath(wide.width, wide.depth, wide.cornerRadius);
    const [a, b] = handleArcCenters(wide, path);
    expect(path.at(a!).p[0]).toBeCloseTo(wide.width / 2, 6);
    expect(path.at(a!).p[1]).toBeCloseTo(0, 6);
    expect(path.at(b!).p[0]).toBeCloseTo(-wide.width / 2, 6);

    const deep = clampParams({ ...wide, width: 100, depth: 150 }).params;
    const p2 = new RoundedRectPath(deep.width, deep.depth, deep.cornerRadius);
    const [c] = handleArcCenters({ ...deep, handles: 'one' }, p2);
    expect(p2.at(c!).p[1]).toBeCloseTo(deep.depth / 2, 6);
    expect(handleArcCenters({ ...deep, handles: 'one' }, p2)).toHaveLength(1);
    expect(handleArcCenters({ ...deep, handles: 'none' }, p2)).toHaveLength(0);
  });
});

const styles: [string, WallStyle, number][] = [
  ['Streckmetall', 'expanded', 0],
  ['Waben', 'hex', 0],
  ['Voronoi', 'voronoi', 0],
  ['Geflecht geschlossen', 'weave', 0],
  ['Geflecht offen', 'weave', 4],
];

describe.each(styles)('%s with a cut-out from the top', (_name, style, gap) => {
  it.each(['one', 'ends'] as const)('%s: open notch, solid frame, one printable body', (mode) => {
    const p = basket(style, mode, gap);
    expect(p.handles).toBe(mode);
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());

      const H = p.height;
      const w = p.handleWidth;
      const d = p.handleDepth;
      const T = wallIntrusion(p);
      const X = p.width / 2;
      // notch: nothing left in the middle of the cut-out, at both ends if asked
      for (const sx of mode === 'ends' ? [1, -1] : [1]) {
        const x0 = sx > 0 ? X - T - 0.5 : -X - 0.5;
        expect(inBox(m, [x0, -w / 4, H - d + 1], [x0 + T + 1, w / 4, H + 1])).toBeLessThan(1e-3);
      }
      // the other end keeps its top edge
      if (mode === 'one')
        expect(inBox(m, [-X - 0.5, -3, H - 1.5], [-X + T, 3, H - 0.5])).toBeGreaterThan(1);
      // solid frame beside the notch: no holes, full wall thickness
      const side: [[number, number, number], [number, number, number]] = [
        [X - T + 0.05, w / 2 + 0.5, H - d + 8], // above the round bottom corner
        [X - 0.05, w / 2 + HANDLE_FRAME - 0.5, H - 5], // below the rounded top edge
      ];
      const sideVol =
        (side[1][0] - side[0][0]) * (side[1][1] - side[0][1]) * (side[1][2] - side[0][2]);
      expect(inBox(m, ...side) / sideVol).toBeGreaterThan(0.97);
      // and under it
      const under: [[number, number, number], [number, number, number]] = [
        [X - T + 0.05, -5, H - d - 1.2],
        [X - 0.05, 5, H - d - 0.3],
      ];
      const underVol = (T - 0.1) * 10 * 0.9;
      expect(inBox(m, ...under) / underVol).toBeGreaterThan(0.97);

      // cells next to the band are cut, not filled: open space right beside it
      if (style === 'hex' || style === 'voronoi') {
        const outside: [[number, number, number], [number, number, number]] = [
          [X - T + 0.05, w / 2 + HANDLE_FRAME + 0.3, H - d - HANDLE_FRAME - 8],
          [X - 0.05, w / 2 + HANDLE_FRAME + 5, H - p.borderBand - 0.5],
        ];
        const vol =
          (outside[1][0] - outside[0][0]) *
          (outside[1][1] - outside[0][1]) *
          (outside[1][2] - outside[0][2]);
        expect(inBox(m, ...outside) / vol).toBeLessThan(0.8);
      }

      // printable without support
      const envelope =
        style === 'expanded'
          ? buildExpanded(wasm, scope, p, 'preview', true)
          : style === 'weave'
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

describe('stacking with cut-outs', () => {
  it('a basket with notches at both ends still carries the next one at the same pitch', () => {
    const lower = basket('voronoi', 'ends');
    const upper = basket('voronoi', 'none');
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
