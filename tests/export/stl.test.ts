import { beforeAll, describe, expect, it } from 'vitest';
import { exportFileName } from '../../src/export/download';
import { stlByteLength, toStl } from '../../src/export/stl';
import { build } from '../../src/geometry/build';
import { loadManifold, type Wasm } from '../../src/geometry/manifold';
import { DEFAULTS } from '../../src/geometry/params';

let wasm: Wasm;
beforeAll(async () => {
  wasm = await loadManifold();
});

describe('toStl', () => {
  it('writes header, triangle count and the exact byte length', () => {
    const mesh = build(wasm, { ...DEFAULTS, wallStyle: 'solid' }, 'preview');
    const n = mesh.indices.length / 3;
    const stl = toStl(mesh);
    const view = new DataView(stl.buffer);
    expect(stl.byteLength).toBe(stlByteLength(n));
    expect(stl.byteLength).toBe(84 + 50 * n);
    expect(view.getUint32(80, true)).toBe(n);
    expect(new TextDecoder().decode(stl.slice(0, 8))).toBe('basketli');
  });

  it('facet normals point outwards (cube)', () => {
    const cube = wasm.Manifold.cube([10, 10, 10], true);
    const m = cube.getMesh();
    cube.delete();
    const mesh = {
      positions: new Float32Array(m.vertProperties),
      indices: new Uint32Array(m.triVerts),
    };
    const stl = toStl(mesh);
    const view = new DataView(stl.buffer);
    const n = mesh.indices.length / 3;
    for (let t = 0; t < n; t++) {
      const o = 84 + t * 50;
      const normal = [0, 4, 8].map((k) => view.getFloat32(o + k, true));
      const centroid = [0, 1, 2].map(
        (axis) =>
          [0, 1, 2].reduce((acc, v) => acc + view.getFloat32(o + 12 + v * 12 + axis * 4, true), 0) /
          3,
      );
      const dot = normal.reduce((acc, x, i) => acc + x * centroid[i]!, 0);
      expect(dot).toBeGreaterThan(0);
      expect(Math.hypot(...normal)).toBeCloseTo(1, 5);
    }
  });
});

describe('exportFileName', () => {
  it('contains the dimensions', () => {
    expect(exportFileName(DEFAULTS, 'stl')).toBe('basketli_150x100x80.stl');
    expect(exportFileName({ ...DEFAULTS, width: 120.5 }, '3mf')).toBe('basketli_120.5x100x80.3mf');
  });
});
