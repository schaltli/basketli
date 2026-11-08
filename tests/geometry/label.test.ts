import { beforeAll, describe, expect, it } from 'vitest';
import { buildTub } from '../../src/geometry/basket';
import { buildManifold } from '../../src/geometry/build';
import { labelCenter, tapeRecess } from '../../src/geometry/label';
import { loadManifold, Scope, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  TAPE_DEPTH,
  TAPE_RIM,
  type BasketParams,
  type WallStyle,
  sides,
  sidesOf,
} from '../../src/geometry/params';
import { buildBraid } from '../../src/geometry/patterns/braid';
import { buildExpanded } from '../../src/geometry/patterns/expanded';
import { MAX_BRIDGE, overhangReport } from '../../src/geometry/printability';
import { wallIntrusion } from '../../src/geometry/stacking';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const params = (patch: Partial<BasketParams> = {}) =>
  clampParams({
    ...DEFAULTS,
    labelSides: sides('front'),
    labelWidth: 60,
    labelHeight: 20,
    labelRadius: 4,
    labelTape: '12',
    ...patch,
  });

/** Volume of `m` inside an axis-aligned box. */
function inBox(m: Manifold, lo: [number, number, number], hi: [number, number, number]): number {
  const size: [number, number, number] = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
  const box = wasm.Manifold.cube(size).translate(lo);
  const cut = m.intersect(box);
  const v = cut.volume();
  cut.delete();
  box.delete();
  return v;
}
type Manifold = ReturnType<typeof buildManifold>;

describe('label clamping', () => {
  it('fits the field into the straight wall and its zone', () => {
    const { params: p, notices } = params({ height: 50, labelWidth: 150, labelHeight: 60 });
    expect(p.labelWidth).toBeLessThanOrEqual(150 - 2 * p.cornerRadius - 6 + 1e-9);
    expect(p.labelHeight).toBeLessThan(p.height);
    expect(notices.map((n) => n.field)).toEqual(
      expect.arrayContaining(['labelWidth', 'labelHeight']),
    );
  });

  it('makes room for the tape: taller field, or a narrower tape', () => {
    const grown = params({ labelHeight: 10, labelTape: '12' }).params;
    expect(grown.labelHeight).toBeCloseTo(tapeRecess(grown, 'front').h + 2 * TAPE_RIM, 9);
    const low = params({ height: 30, labelHeight: 10, labelTape: '24' }).params;
    expect(low.labelTape).not.toBe('24');
  });

  it('is idempotent', () => {
    const once = params({ labelWidth: 150, labelHeight: 5, labelTape: '24', labelRadius: 15 });
    const twice = clampParams(once.params);
    expect(twice.params).toEqual(once.params);
    expect(twice.notices).toEqual([]);
  });

  it('drops the field when the wall has no room', () => {
    const { params: p } = params({
      width: 40,
      depth: 40,
      cornerRadius: 10,
      labelSides: sides('right'),
    });
    expect(p.labelSides).toEqual(sides());
  });

  it('drops it only on walls without room', () => {
    // 150 × 44: the 24 mm straight end walls are too short for a 20 mm field and its margins
    const { params: p, notices } = params({ depth: 44, labelSides: sides('front', 'right') });
    expect(p.labelSides).toEqual(sides('front'));
    expect(notices).toContainEqual(
      expect.objectContaining({ field: 'labelSides.right', kind: 'rule' }),
    );
  });

  it('goes below a handle on the same wall', () => {
    const both = params({
      labelSides: sides('right'),
      handleSides: sides('left', 'right'),
      height: 100,
    }).params;
    expect(labelCenter(both, 'right') + both.labelHeight / 2).toBeLessThanOrEqual(
      both.height - both.handleDepth,
    );
  });
});

describe('label field', () => {
  const styles: WallStyle[] = ['solid', 'hex', 'voronoi', 'expanded', 'braid', 'weave'];
  it.each(styles)('%s: solid field with tape recess, one body, printable', (style) => {
    const p = params({ wallStyle: style }).params;
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());

      // front wall (y = -depth/2): solid behind the recess, recess open in front
      const Y = -p.depth / 2;
      const T = wallIntrusion(p);
      const zc = labelCenter(p, 'front');
      const solid = inBox(m, [-20, Y + TAPE_DEPTH + 0.05, zc - 3], [20, Y + T - 0.05, zc + 3]);
      expect(solid / (40 * (T - TAPE_DEPTH - 0.1) * 6)).toBeGreaterThan(0.97);
      const recess = inBox(m, [-20, Y + 0.02, zc - 3], [20, Y + TAPE_DEPTH - 0.05, zc + 3]);
      expect(recess).toBeLessThan(0.01);
      // the field below the recess is flush with the outer face (above the
      // first layers, which grow out from the middle of an open wall)
      const below = zc - tapeRecess(p, 'front').h / 2;
      const rim = inBox(m, [-20, Y + 0.02, below - 1.4], [20, Y + TAPE_DEPTH - 0.05, below - 0.2]);
      expect(rim / (40 * (TAPE_DEPTH - 0.07) * 1.2)).toBeGreaterThan(0.97);

      const envelope =
        style === 'expanded'
          ? buildExpanded(wasm, scope, p, 'preview', true)
          : style === 'braid'
            ? buildBraid(wasm, scope, p, 'preview', true)
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

  it.each([
    ['end wall', { labelSides: sides('right') }],
    [
      'below handles',
      { labelSides: sides('right'), handleSides: sides('left', 'right'), height: 100 },
    ],
    ['handle on another wall', { labelSides: sides('left'), handleSides: sides('right') }],
    ['on all four walls', { labelSides: sides('front', 'back', 'left', 'right'), labelWidth: 40 }],
    ['square corners, no tape', { labelRadius: 0, labelTape: 'none' }],
    ['with dividers', { dividersX: [60] }],
  ] as const)('%s: one manifold body', (_n, patch) => {
    for (const wallStyle of ['voronoi', 'expanded'] as const) {
      const p = params({ wallStyle, ...(patch as Partial<BasketParams>) }).params;
      expect(sidesOf(p.labelSides).length).toBeGreaterThan(0);
      const m = buildManifold(wasm, p, 'preview');
      try {
        expect(m.status()).toBe('NoError');
        const parts = m.decompose();
        expect(parts.length).toBe(1);
        parts.forEach((x) => x.delete());
      } finally {
        m.delete();
      }
    }
  });
});
