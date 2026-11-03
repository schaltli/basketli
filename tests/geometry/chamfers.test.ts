import type { Manifold } from 'manifold-3d';
import { beforeAll, describe, expect, it } from 'vitest';
import { buildManifold } from '../../src/geometry/build';
import { BOTTOM_CHAMFER } from '../../src/geometry/chamfers';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import { clampParams, DEFAULTS, WALL_STYLES, type BasketParams } from '../../src/geometry/params';
import { footInset, topChamfer, wallIntrusion } from '../../src/geometry/stacking';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const basket = (patch: Partial<BasketParams> = {}) =>
  clampParams({ ...DEFAULTS, width: 100, depth: 80, height: 50, ...patch }).params;

/** Width (x extent) of the horizontal slice at z. */
function widthAt(m: Manifold, z: number): number {
  const cs = m.slice(z);
  const b = cs.bounds();
  cs.delete();
  return b.max[0] - b.min[0];
}

/** Solid length across a slice at z along the line x = x0 (y extent of a thin strip). */
function stripArea(m: Manifold, z: number, x0: number, half: number): number {
  const cs = m.slice(z);
  const box = wasm.CrossSection.square([2 * half, 1000]).translate([x0 - half, -500]);
  const cut = cs.intersect(box);
  const a = cut.area();
  [cs, box, cut].forEach((x) => x.delete());
  return a;
}

describe('chamfers', () => {
  it.each(WALL_STYLES)('%s: bottom edge drawn in by 1 mm at 45°, top outer edge too', (style) => {
    for (const stackable of [false, true]) {
      const p = basket({ wallStyle: style, stackable });
      const m = buildManifold(wasm, p, 'preview');
      try {
        expect(m.status()).toBe('NoError');
        const foot = p.width - 2 * (stackable ? footInset(p) : 0);
        const bottom = foot - 2 * (BOTTOM_CHAMFER - 0.01);
        if (style === 'weave' && !stackable) {
          // the woven wall bulges in and out: only the limit is exact
          expect(widthAt(m, 0.01)).toBeLessThan(bottom + 0.05);
        } else {
          expect(widthAt(m, 0.01)).toBeCloseTo(bottom, 1);
          expect(widthAt(m, BOTTOM_CHAMFER + 0.2)).toBeCloseTo(foot, 1);
        }
        const c = topChamfer(p);
        expect(widthAt(m, p.height - 0.01)).toBeLessThan(p.width - 2 * (c - 0.05));
      } finally {
        m.delete();
      }
    }
  });

  it('top chamfer keeps half the rim flat', () => {
    for (const wall of [0.8, 1.6, 4]) {
      const p = basket({ wallStyle: 'solid', wall });
      expect(topChamfer(p)).toBeLessThanOrEqual(0.5);
      expect(topChamfer(p)).toBeLessThanOrEqual(wallIntrusion(p) / 4);
    }
  });

  it('rim inner edge and full-height divider tops are chamfered, one body', () => {
    const p = basket({ wallStyle: 'solid', stackable: false, dividersX: [50], dividersY: [40] });
    const m = buildManifold(wasm, p, 'preview');
    try {
      expect(m.status()).toBe('NoError');
      expect(m.decompose().map((x) => (x.delete(), 0)).length).toBe(1);
      const t = wallIntrusion(p);
      const c = topChamfer(p);
      // divider across the width, at x = 50 from the left (center 0)
      const dz = 0.01;
      const strip = (z: number) => stripArea(m, z, 0, 2 * t); // all y, both walls included
      const below = strip(p.height - 1);
      const top = strip(p.height - dz);
      // divider (≈ 80 mm long) loses 2·(c − dz) of width along its length
      expect(below - top).toBeGreaterThan(2 * (c - dz) * 60);
      // rim slice at the top: narrower than the wall on both sides
      const rimTop = stripArea(m, p.height - dz, -45, 1);
      const rimBelow = stripArea(m, p.height - 1, -45, 1);
      expect(rimBelow - rimTop).toBeGreaterThan(2 * 2 * (c - dz) * 0.9);
    } finally {
      m.delete();
    }
  });
});
