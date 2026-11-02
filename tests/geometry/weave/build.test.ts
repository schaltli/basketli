import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import { roundedRectArea } from '../../../src/geometry/shapes';
import { weaveLayout } from '../../../src/geometry/weave/layout';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const weave = (patch: Partial<BasketParams> = {}, w: Partial<BasketParams['weave']> = {}) =>
  clampParams({
    ...DEFAULTS,
    handles: 'none',
    stackable: false,
    ...patch,
    wallStyle: 'weave',
    weave: { ...DEFAULTS.weave, ...w },
  }).params;

const cases: [string, BasketParams][] = [
  ['cane closed', weave()],
  ['cane open', weave({}, { rowGap: 4 })],
  ['band closed', weave({}, { material: 'band', materialHeight: 15, materialThickness: 1.6 })],
  [
    'band open',
    weave({}, { material: 'band', materialHeight: 15, materialThickness: 1.6, rowGap: 6 }),
  ],
  ['small', weave({ width: 60, depth: 40, height: 30 })],
];

describe('woven basket', () => {
  it.each(cases)('%s: one manifold body with the exact outer size', (_name, p) => {
    const m = buildManifold(wasm, p, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const box = m.boundingBox();
      expect(box.min[0]).toBeCloseTo(-p.width / 2, 1);
      expect(box.max[0]).toBeCloseTo(p.width / 2, 1);
      expect(box.min[1]).toBeCloseTo(-p.depth / 2, 1);
      expect(box.max[1]).toBeCloseTo(p.depth / 2, 1);
      expect(Math.abs(box.min[2])).toBeLessThan(0.05);
      expect(Math.abs(box.max[2] - p.height)).toBeLessThan(0.05);
    } finally {
      m.delete();
    }
  });

  it.each(cases)('%s: closed flat rim round the top, as wide as the wall', (_name, p) => {
    const m = buildManifold(wasm, p, 'export');
    try {
      const { span } = weaveLayout(p);
      const r = p.cornerRadius;
      const ring =
        roundedRectArea(p.width, p.depth, r) -
        roundedRectArea(p.width - 2 * span, p.depth - 2 * span, r - span);
      // below the chamfer, above the bottom taper
      const cut = m.slice(p.height - p.weave.rim / 2);
      expect(cut.numContour()).toBe(2);
      expect(Math.abs(cut.area() - ring) / ring).toBeLessThan(0.02);
      cut.delete();
    } finally {
      m.delete();
    }
  });

  it('open weave lets light through, closed weave is denser', () => {
    const closed = buildManifold(wasm, weave(), 'preview');
    const open = buildManifold(wasm, weave({}, { rowGap: 4 }), 'preview');
    try {
      expect(open.volume()).toBeLessThan(closed.volume());
    } finally {
      closed.delete();
      open.delete();
    }
  });
});
