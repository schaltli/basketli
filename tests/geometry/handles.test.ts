import type { Manifold } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildTub } from '../../src/geometry/basket';
import { buildManifold } from '../../src/geometry/build';
import {
  handleArcCenters,
  RIB_NECK,
  RIB_WIDTH,
  ribOutline,
  ribPositions,
  slotGeometry,
} from '../../src/geometry/handles';
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

const slotBasket = (wallStyle: WallStyle, handles: HandleMode, rowGap = 0): BasketParams =>
  clampParams({
    ...DEFAULTS,
    wallStyle,
    handles,
    handleType: 'slot',
    weave: { ...DEFAULTS.weave, rowGap },
  }).params;

describe('slot geometry', () => {
  it('ribs stand at most 12 mm apart over the flat part, outermost at the round ends', () => {
    const p = slotBasket('hex', 'ends');
    const ribs = ribPositions(p);
    const { uc } = slotGeometry(p);
    expect(ribs[0]).toBeCloseTo(-uc, 9);
    expect(ribs.at(-1)).toBeCloseTo(uc, 9);
    for (let i = 1; i < ribs.length; i++)
      expect(ribs[i]! - ribs[i - 1]!).toBeLessThanOrEqual(12 + 1e-9);
    expect(ribPositions({ ...p, handleType: 'notch' })).toEqual([]);
  });

  it('rib necks are one line wide and widen at no more than 45°', () => {
    const p = slotBasket('hex', 'ends');
    const rib = ribOutline(p, 0);
    const xs = rib.map((q) => q[0]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(RIB_WIDTH, 9);
    const { top, bottom } = slotGeometry(p);
    const at = (z: number) => rib.filter((q) => Math.abs(q[1] - z) < 1e-9).map((q) => q[0]);
    const bottomContact = at(bottom - 0.1);
    expect(Math.max(...bottomContact) - Math.min(...bottomContact)).toBeCloseTo(RIB_NECK, 9);
    const topContact = at(top + 0.1);
    expect(Math.max(...topContact) - Math.min(...topContact)).toBeCloseTo(RIB_NECK, 9);
    for (let i = 0; i < rib.length; i++) {
      const [a, b] = [rib[i]!, rib[(i + 1) % rib.length]!];
      const dx = Math.abs(b[0] - a[0]);
      const dz = Math.abs(b[1] - a[1]);
      // the contact edges themselves lie inside the wall
      const contact = [bottom - 0.1, top + 0.1].some((z) => Math.abs(a[1] - z) < 1e-9);
      if (dx > 1e-9 && !(contact && dz < 1e-9)) expect(dz).toBeGreaterThanOrEqual(dx - 1e-9);
    }
  });

  it('clamps the slot into the wall, or drops it when the basket is too low', () => {
    const low = clampParams({ ...DEFAULTS, height: 50, handles: 'ends', handleType: 'slot' });
    expect(low.params.handles).toBe('ends');
    expect(low.params.slotBar + low.params.slotHeight).toBeLessThanOrEqual(
      50 - 3 - HANDLE_FRAME - 5 + 1e-9,
    );
    expect(low.notices.some((n) => n.field === 'slotHeight')).toBe(true);
    const tiny = clampParams({ ...DEFAULTS, height: 30, handles: 'ends', handleType: 'slot' });
    expect(tiny.params.handles).toBe('none');
    const narrow = clampParams({ ...DEFAULTS, depth: 90, handles: 'one', handleType: 'slot' });
    expect(narrow.params.slotWidth).toBe(90 - 2 * 10 - 2 * (HANDLE_FRAME + 5));
  });
});

describe.each(styles)('%s with a closed slot', (_name, style, gap) => {
  it.each(['one', 'ends'] as const)(
    '%s: open slot, solid bar, ribs, one printable body',
    (mode) => {
      const p = slotBasket(style, mode, gap);
      expect(p.handles).toBe(mode);
      expect(p.handleType).toBe('slot');
      const m = buildManifold(wasm, p, 'preview');
      const scope = new Scope();
      try {
        expect(m.status()).toBe('NoError');
        const parts = m.decompose();
        expect(parts.length).toBe(1);
        parts.forEach((x) => x.delete());

        const T = wallIntrusion(p);
        const X = p.width / 2;
        const { top, bottom, uc } = slotGeometry(p);
        const ribs = ribPositions(p);
        for (const sx of mode === 'ends' ? [1, -1] : [1]) {
          const x0 = sx > 0 ? X - T - 0.5 : -X - 0.5;
          // open between the ribs (only the ribs remain in the hole)
          const ribVolume = RIB_WIDTH * T * (top - bottom);
          const hole = inBox(m, [x0, -uc, bottom + 0.5], [x0 + T + 1, uc, top - 0.5]);
          expect(hole).toBeLessThan(ribs.length * ribVolume);
          expect(hole).toBeGreaterThan(0.5 * ribs.length * ribVolume);
          // and nothing at all just beside a rib
          const between = (ribs[0]! + ribs[1]!) / 2;
          expect(
            inBox(m, [x0, between - 2, bottom + 0.5], [x0 + T + 1, between + 2, top - 0.5]),
          ).toBeLessThan(1e-3);
        }
        // solid bar above the slot, full wall thickness
        const bar: [[number, number, number], [number, number, number]] = [
          [X - T + 0.05, -uc, top + 0.3],
          [X - 0.05, uc, top + Math.min(4, p.slotBar - 2)],
        ];
        const barVol = (bar[1][0] - bar[0][0]) * (bar[1][1] - bar[0][1]) * (bar[1][2] - bar[0][2]);
        expect(inBox(m, ...bar) / barVol).toBeGreaterThan(0.97);
        // solid frame below it
        const under: [[number, number, number], [number, number, number]] = [
          [X - T + 0.05, -5, bottom - 1.2],
          [X - 0.05, 5, bottom - 0.3],
        ];
        const underVol =
          (under[1][0] - under[0][0]) * (under[1][1] - under[0][1]) * (under[1][2] - under[0][2]);
        expect(inBox(m, ...under) / underVol).toBeGreaterThan(0.97);
        // the other end keeps its wall
        if (mode === 'one')
          expect(inBox(m, [-X - 0.5, -3, bottom + 5], [-X + T, 3, top - 5])).toBeGreaterThan(1);

        // printable: the bar only bridges from rib to rib. Above the round
        // ends the wall lines just run on lengthwise (in-plane extension).
        const envelope =
          style === 'expanded'
            ? buildExpanded(wasm, scope, p, 'preview', true)
            : buildTub(wasm, scope, { ...p, wall: T, wallStyle: 'solid' }, 'preview');
        const r = overhangReport(m, { envelope });
        expect(r.maxArea, `worst layer z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
        expect(r.maxBridge, `longest bridge z=${r.bridgeZ.toFixed(1)}`).toBeLessThanOrEqual(
          MAX_BRIDGE,
        );
      } finally {
        m.delete();
        scope.dispose();
      }
    },
  );
});
