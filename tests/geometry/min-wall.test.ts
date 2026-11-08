import { beforeAll, describe, expect, it } from 'vitest';
import type { CrossSection } from 'manifold-3d';
import { buildManifold } from '../../src/geometry/build';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  MIN_WALL,
  sides,
  type BasketParams,
  type WallStyle,
} from '../../src/geometry/params';
import { LAYER } from '../../src/geometry/weave/layout';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

/**
 * Parts of a layer thinner than MIN_WALL: what an inward offset by half of
 * it removes and the outward offset does not bring back. The outward offset
 * keeps corners sharp (miter), so a hole's corner is not taken for thin wall.
 */
function thinArea(cs: CrossSection): number {
  const h = MIN_WALL / 2 - 0.01;
  const open = cs.offset(-h, 'Round', 2, 32).offset(h, 'Miter', 3);
  const thin = cs.subtract(open);
  const pieces = thin.decompose();
  // specks at sharp acute corners are not walls
  const area = pieces.filter((x) => x.area() > 0.3).reduce((t, x) => t + x.area(), 0);
  [open, thin, ...pieces].forEach((x) => x.delete());
  return area;
}

const styles: WallStyle[] = ['solid', 'hex', 'voronoi', 'expanded', 'braid', 'weave'];
const cases: [string, BasketParams][] = [
  ...styles.map((s): [string, BasketParams] => [
    s,
    clampParams({ ...DEFAULTS, width: 118, depth: 170, height: 60, wallStyle: s }).params,
  ]),
  [
    'weave band material',
    clampParams({
      ...DEFAULTS,
      wallStyle: 'weave',
      weave: { ...DEFAULTS.weave, material: 'band', materialHeight: 9, materialThickness: 1.2 },
    }).params,
  ],
  [
    'weave, handles, label, woven dividers',
    clampParams({
      ...DEFAULTS,
      wallStyle: 'weave',
      handleSides: sides('left', 'right'),
      labelSides: sides('front'),
      dividersX: [75],
      dividerStyle: 'pattern',
    }).params,
  ],
  [
    'braid, handles, label, dividers, not stackable',
    clampParams({
      ...DEFAULTS,
      wallStyle: 'braid',
      stackable: false,
      handleSides: sides('left', 'right'),
      labelSides: sides('front'),
      dividersX: [0],
    }).params,
  ],
];

describe('every layer at least MIN_WALL thick', () => {
  it.each(cases)(
    '%s',
    (_n, p) => {
      const m = buildManifold(wasm, p, 'export');
      try {
        const thin: string[] = [];
        for (let z = LAYER / 2; z < p.height; z += LAYER) {
          const cs = m.slice(z);
          const a = thinArea(cs);
          cs.delete();
          if (a > 0) thin.push(`z=${z.toFixed(1)}: ${a.toFixed(1)} mm²`);
        }
        expect(thin).toEqual([]);
      } finally {
        m.delete();
      }
    },
    180000,
  );
});
