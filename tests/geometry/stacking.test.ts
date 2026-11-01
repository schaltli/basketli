import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { buildManifold } from '../../src/geometry/build';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import {
  clampParams,
  DEFAULTS,
  type BasketParams,
  type WallStyle,
} from '../../src/geometry/params';
import { overhangReport } from '../../src/geometry/printability';
import {
  FOOT_HEIGHT,
  footInset,
  STACK_INSET,
  stackPitch,
  wallIntrusion,
} from '../../src/geometry/stacking';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const basket = (wallStyle: WallStyle, rowGap = 0): BasketParams =>
  clampParams({
    ...DEFAULTS,
    width: 80,
    depth: 60,
    height: 40,
    handles: 'none',
    stackable: true,
    wallStyle,
    weave: { ...DEFAULTS.weave, rowGap },
  }).params;

const styles: [string, BasketParams][] = [
  ['Streckmetall', basket('expanded')],
  ['Waben', basket('hex')],
  ['Voronoi', basket('voronoi')],
  ['Geflecht geschlossen', basket('weave')],
  ['Geflecht offen', basket('weave', 4)],
];

describe('stacking interface', () => {
  it.each(styles)('%s: wall reaches at most STACK_INSET in from the outline', (_n, p) => {
    expect(wallIntrusion(p)).toBeLessThanOrEqual(STACK_INSET + 1e-9);
  });

  it.each(styles)('%s: drawn-in foot, full size above, height H, one body', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((x) => x.delete());
      const box = m.boundingBox();
      expect(box.max[0]).toBeCloseTo(p.width / 2, 1);
      expect(box.max[2]).toBeCloseTo(p.height, 3);
      expect(box.min[2]).toBeCloseTo(0, 6);
      const foot = m.slice(FOOT_HEIGHT / 2).bounds();
      expect(foot.max[0]).toBeCloseTo(p.width / 2 - footInset(p), 1);
      expect(foot.max[1]).toBeCloseTo(p.depth / 2 - footInset(p), 1);
    } finally {
      m.delete();
    }
  });

  it.each(styles)('%s: socket prints without support', (_n, p) => {
    const m = buildManifold(wasm, p, 'preview');
    try {
      // only the socket zone (the rest is covered by the style tests)
      const cut = wasm.Manifold.cube([1000, 1000, FOOT_HEIGHT + footInset(p) + 2]).translate([
        -500, -500, 0,
      ]);
      const socket = m.intersect(cut);
      expect(overhangReport(socket).maxArea).toBeLessThan(0.5);
      socket.delete();
      cut.delete();
    } finally {
      m.delete();
    }
  });
});

/** Largest overlap volume when `upper` is lifted by dz onto `lower`. */
function overlap(lower: Manifold, upper: Manifold, dz: number): number {
  const lifted = upper.translate([0, 0, dz]);
  const both = lower.intersect(lifted);
  const v = both.volume();
  both.delete();
  lifted.delete();
  return v;
}

describe('cross-style stacking', () => {
  const pairs: [string, string][] = [
    ['Streckmetall', 'Streckmetall'],
    ['Geflecht geschlossen', 'Streckmetall'],
    ['Streckmetall', 'Geflecht offen'],
    ['Voronoi', 'Geflecht geschlossen'],
    ['Waben', 'Voronoi'],
    ['Geflecht offen', 'Waben'],
  ];
  const byName = Object.fromEntries(styles);

  it.each(pairs)('%s below, %s on top: nests, rests on the chamfer, no collision', (lo, up) => {
    const pl = byName[lo]!;
    const pu = byName[up]!;
    const lower = buildManifold(wasm, pl, 'preview');
    const upper = buildManifold(wasm, pu, 'preview');
    try {
      const pitch = stackPitch(pl, pu);
      expect(pitch).toBeLessThan(pl.height); // the foot really nests
      expect(overlap(lower, upper, pitch + 0.05)).toBeLessThan(0.5); // sits without collision
      expect(overlap(lower, upper, pitch - 0.4)).toBeGreaterThan(0.5); // and actually rests there
      // lateral: the foot is inside the lower basket's opening
      const opening = lower.slice(pl.height - 0.1).bounds();
      const foot = upper.slice(FOOT_HEIGHT / 2).bounds();
      expect(foot.max[0]).toBeLessThan(opening.max[0]);
      expect(foot.min[0]).toBeGreaterThan(opening.min[0]);
    } finally {
      lower.delete();
      upper.delete();
    }
  });
});
