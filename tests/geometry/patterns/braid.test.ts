import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../../src/geometry/build';
import { loadManifold, Scope, type Wasm } from '../../../src/geometry/manifold';
import { clampParams, DEFAULTS, type BasketParams } from '../../../src/geometry/params';
import { bandOffset, braidLayout, buildBraid } from '../../../src/geometry/patterns/braid';
import { MAX_BRIDGE, overhangReport } from '../../../src/geometry/printability';
import { BRAID_FUSE, wallIntrusion } from '../../../src/geometry/stacking';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const params = (patch: Partial<BasketParams> = {}, b: Partial<BasketParams['braid']> = {}) =>
  clampParams({
    ...DEFAULTS,
    width: 80,
    depth: 60,
    height: 50,
    handles: 'none',
    stackable: false,
    ...patch,
    wallStyle: 'braid',
    braid: { ...DEFAULTS.braid, ...b },
  }).params;

describe('braid layout', () => {
  it('wraps the perimeter with an even number of bands per family', () => {
    const l = braidLayout(params());
    expect(l.count % 2).toBe(0);
    expect(l.count * l.pitch).toBeCloseTo(l.path.length, 9);
    // 45°: horizontal pitch = √2 · (width + gap)
    expect(l.pitch).toBeCloseTo(Math.SQRT2 * (l.width + l.gap), 9);
  });

  it('plain weave: the two bands lie on opposite sides at every crossing', () => {
    const l = braidLayout(params());
    for (const [k, m] of [
      [0, 0],
      [0, 1],
      [3, 4],
      [5, 9],
    ] as const) {
      const s = ((k + m) * l.pitch) / 2;
      const z = l.zRef + ((m - k) * l.pitch) / 2;
      const a = bandOffset(l, 1, k, s, z);
      const b = bandOffset(l, -1, m, s, z);
      expect(Math.abs(a)).toBeCloseTo(l.amplitude, 9);
      expect(a).toBeCloseTo(-b, 9);
      // over one, under one along the "/" band
      expect(bandOffset(l, 1, k, s + l.pitch / 2, z + l.pitch / 2)).toBeCloseTo(-a, 9);
    }
    // crossing bands overlap radially by BRAID_FUSE, so they fuse
    expect(l.amplitude * 2).toBeCloseTo(params().braid.bandThickness - BRAID_FUSE, 9);
  });

  it('bands are flat across their width', () => {
    const l = braidLayout(params());
    // along a line perpendicular to a "/" band (s + z' constant) its offset is constant
    const k = 2;
    const s0 = k * l.pitch + 1;
    const z0 = l.zRef + 1;
    for (const q of [-2, -1, 1, 2])
      expect(bandOffset(l, 1, k, s0 + q, z0 - q)).toBeCloseTo(bandOffset(l, 1, k, s0, z0), 9);
  });

  it('the wall stays inside the stacking inset at the thickest bands', () => {
    const p = params({ stackable: true }, { bandThickness: 2 });
    expect(wallIntrusion(p)).toBeLessThanOrEqual(4);
  });
});

describe('braid basket', () => {
  it.each([
    ['defaults', params()],
    ['tight weave', params({}, { bandGap: 0 })],
    ['loose weave', params({}, { bandWidth: 6, bandGap: 6 })],
    ['wide thick bands', params({}, { bandWidth: 14, bandThickness: 2, bandGap: 3 })],
    ['stackable', params({ stackable: true })],
    ['default size basket', params({ width: 150, depth: 100, height: 80 })],
  ] as const)('%s: one manifold body, exact size, printable', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    const scope = new Scope();
    try {
      const envelope = buildBraid(wasm, scope, p, 'preview', true);
      expect(m.status()).toBe('NoError');
      expect(m.volume()).toBeGreaterThan(0);
      if (p.braid.bandGap > 0) expect(m.volume()).toBeLessThan(envelope.volume()); // gaps there
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const box = m.boundingBox();
      expect(box.max[0]).toBeCloseTo(p.width / 2, 1);
      expect(box.max[1]).toBeCloseTo(p.depth / 2, 1);
      expect(box.max[2]).toBeCloseTo(p.height, 3);
      const r = overhangReport(m, { envelope });
      expect(r.maxArea, `z=${r.worstZ.toFixed(1)}`).toBeLessThan(0.5);
      expect(r.maxBridge).toBeLessThanOrEqual(MAX_BRIDGE);
    } finally {
      m.delete();
      scope.dispose();
    }
  });

  it.each([
    [8, 2],
    [6, 6],
    [6, 9],
    [4, 10],
  ])('width %d, gap %d: the top border band bridges at most (gap − width)/√2', (w, g) => {
    const p = params({}, { bandWidth: w, bandGap: g });
    const l = braidLayout(p);
    const m = buildManifold(wasm, p, 'preview');
    try {
      const r = overhangReport(m);
      // bands at least as wide as the gaps: closed all round, no bridge at all
      const bound = Math.max(0, (l.gap - l.width) / Math.SQRT2);
      expect(r.maxBridge).toBeLessThanOrEqual(bound + 0.8);
      if (w >= g) expect(r.maxBridge).toBeLessThan(0.8);
    } finally {
      m.delete();
    }
  });

  it.each([
    ['dividers', { dividersX: [40], dividersY: [30] }],
    ['handles', { handles: 'ends', width: 120, height: 60 }],
  ] as const)('with %s: one manifold body', (_n, patch) => {
    const m = buildManifold(wasm, params(patch as Partial<BasketParams>), 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
    } finally {
      m.delete();
    }
  });
});
