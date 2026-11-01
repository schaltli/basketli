import { beforeAll, describe, expect, it } from 'vitest';
import { build, buildManifold } from '../../src/geometry/build';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import { DEFAULTS, type BasketParams } from '../../src/geometry/params';
import { roundedRect, roundedRectArea } from '../../src/geometry/shapes';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

const solid: BasketParams = { ...DEFAULTS, wallStyle: 'solid', handles: 'none', stackable: false };

function analyticVolume(p: BasketParams): number {
  const outer = roundedRectArea(p.width, p.depth, p.cornerRadius);
  const inner = roundedRectArea(
    p.width - 2 * p.wall,
    p.depth - 2 * p.wall,
    Math.max(0, p.cornerRadius - p.wall),
  );
  return outer * p.height - inner * (p.height - p.floor);
}

describe('roundedRect', () => {
  it('is closed, counter-clockwise and within the bounds', () => {
    const pts = roundedRect(100, 60, 10, 8);
    let signedArea = 0;
    pts.forEach(([x, y], i) => {
      const [nx, ny] = pts[(i + 1) % pts.length]!;
      signedArea += x * ny - nx * y;
      expect(Math.abs(x)).toBeLessThanOrEqual(50 + 1e-9);
      expect(Math.abs(y)).toBeLessThanOrEqual(30 + 1e-9);
    });
    expect(signedArea).toBeGreaterThan(0);
    expect(new Set(pts.map((p) => p.join())).size).toBe(pts.length);
  });

  it('handles radius 0 as a plain rectangle', () => {
    expect(roundedRect(10, 20, 0, 8)).toHaveLength(4);
  });
});

describe('tub', () => {
  const cases: [string, BasketParams][] = [
    ['defaults', solid],
    ['no corner radius', { ...solid, cornerRadius: 0 }],
    ['large radius', { ...solid, width: 60, depth: 60, cornerRadius: 30 }],
    ['thick walls', { ...solid, wall: 5, floor: 5 }],
  ];

  it.each(cases)('%s: manifold, exact bounding box, plausible volume', (_name, p) => {
    const m = buildManifold(wasm, p, 'export');
    try {
      expect(m.status()).toBe('NoError');
      const parts = m.decompose();
      expect(parts.length).toBe(1);
      parts.forEach((part) => part.delete());
      const box = m.boundingBox();
      expect(box.min[0]).toBeCloseTo(-p.width / 2, 2);
      expect(box.max[0]).toBeCloseTo(p.width / 2, 2);
      expect(box.min[1]).toBeCloseTo(-p.depth / 2, 2);
      expect(box.max[1]).toBeCloseTo(p.depth / 2, 2);
      expect(box.min[2]).toBeCloseTo(0, 2);
      expect(box.max[2]).toBeCloseTo(p.height, 2);
      const expected = analyticVolume(p);
      expect(Math.abs(m.volume() - expected) / expected).toBeLessThan(0.01);
    } finally {
      m.delete();
    }
  });

  it('build() returns flat buffers', () => {
    const mesh = build(wasm, solid, 'preview');
    expect(mesh.positions.length % 3).toBe(0);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(Math.max(...mesh.indices)).toBeLessThan(mesh.positions.length / 3);
  });
});
