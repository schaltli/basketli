import { beforeAll, describe, expect, it } from 'vitest';
import type { Manifold } from 'manifold-3d';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import { overhangReport } from '../../src/geometry/printability';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const box = (x: number, y: number, z: number, at: [number, number, number]): Manifold =>
  wasm.Manifold.cube([x, y, z]).translate(at);

/** Two 4×4×10 pillars `span` apart, joined by a 2 mm slab on top. */
function bridge(span: number): Manifold {
  return wasm.Manifold.union([
    box(4, 4, 10, [0, 0, 0]),
    box(4, 4, 10, [4 + span, 0, 0]),
    box(8 + span, 4, 2, [0, 0, 10]),
  ]);
}

describe('overhangReport (the tool itself)', () => {
  it('a straight wall is fully supported', () => {
    const r = overhangReport(box(20, 2, 10, [0, 0, 0]));
    expect(r.maxArea).toBe(0);
    expect(r.maxBridge).toBe(0);
  });

  it('a one-sided shelf (cantilever) is unsupported area, not a bridge', () => {
    const shelf = wasm.Manifold.union([box(4, 4, 10, [0, 0, 0]), box(14, 4, 2, [0, 0, 10])]);
    const r = overhangReport(shelf);
    expect(r.maxArea).toBeGreaterThan(30);
    expect(r.maxBridge).toBe(0);
  });

  it('a slab between two pillars is a bridge of about its span', () => {
    const r = overhangReport(bridge(10));
    expect(r.maxArea).toBe(0);
    expect(r.maxBridge).toBeGreaterThan(10);
    expect(r.maxBridge).toBeLessThan(12);
  });

  it('a single thin line running into two pillars is a bridge', () => {
    const thin = wasm.Manifold.union([
      box(4, 4, 10, [0, 0, 0]),
      box(4, 4, 10, [14, 0, 0]),
      box(18, 0.45, 0.2, [0, 1.75, 10]),
    ]);
    const r = overhangReport(thin);
    expect(r.maxArea).toBe(0);
    expect(r.maxBridge).toBeGreaterThan(9);
  });

  it('a thin line anchored on one pillar only is unsupported', () => {
    const thin = wasm.Manifold.union([box(4, 4, 10, [0, 0, 0]), box(14, 0.45, 2, [0, 1.75, 10])]);
    expect(overhangReport(thin).maxArea).toBeGreaterThan(1);
  });

  it('measures longer bridges too', () => {
    expect(overhangReport(bridge(20)).maxBridge).toBeCloseTo(20, 0);
  });

  it('a 45° slope is supported', () => {
    // wedge: extruded right triangle leaning out at 45°
    const wedge = wasm.Manifold.extrude(
      [
        [
          [0, 0],
          [4, 0],
          [14, 10],
          [10, 10],
        ],
      ],
      4,
    ).rotate([90, 0, 0]);
    expect(overhangReport(wedge).maxArea).toBe(0);
  });
});
