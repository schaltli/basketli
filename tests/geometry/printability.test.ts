import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../src/geometry/build';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  setWeaveMaterial,
  type BasketParams,
} from '../../src/geometry/params';
import { overhangReport } from '../../src/geometry/printability';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

/** Unsupported area per layer that still counts as printable (numerical noise). */
const MAX_UNSUPPORTED_MM2 = 0.5;

const small = (patch: Partial<BasketParams>): BasketParams =>
  clampParams({ ...DEFAULTS, width: 80, depth: 60, height: 50, handles: 'none', ...patch }).params;

const weave = small({ wallStyle: 'weave' });
const band = setWeaveMaterial(weave, 'band');

const open = (p: BasketParams, gap: number): BasketParams => ({
  ...p,
  weave: { ...p.weave, rowGap: gap },
});

const cases: [string, BasketParams][] = [
  ['solid tub', small({ wallStyle: 'solid', stackable: false })],
  ['weave cane closed', weave],
  ['weave cane open', open(weave, 4)],
  ['weave band closed', band],
  ['weave band open', open(band, 6)],
  [
    'weave thick stakes',
    clampParams({
      ...weave,
      weave: { ...weave.weave, stakeDiameter: 8, materialThickness: 4, stakeSpacing: 20 },
    }).params,
  ],
];

describe('printability (no support, no bridges, 45° rule)', () => {
  it('weave cane closed, simplified export mesh', () => {
    const m = buildManifold(wasm, weave, 'export');
    try {
      expect(overhangReport(m).maxArea).toBeLessThan(MAX_UNSUPPORTED_MM2);
    } finally {
      m.delete();
    }
  });

  it.each(cases)('%s', (_name, p) => {
    const m = buildManifold(wasm, p, 'preview');
    try {
      const r = overhangReport(m);
      expect(r, `worst layer at z=${r.worstZ.toFixed(1)} mm`).toMatchObject({
        maxArea: expect.any(Number),
      });
      expect(r.maxArea).toBeLessThan(MAX_UNSUPPORTED_MM2);
    } finally {
      m.delete();
    }
  });
});
