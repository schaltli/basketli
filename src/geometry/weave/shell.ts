import type { Manifold } from 'manifold-3d';
import type { Wasm } from '../manifold';
import type { RoundedRectPath } from './outline';
import type { ReliefField } from './relief';

/**
 * Turns a relief field into a closed shell: outer surface, inner surface,
 * bottom and top caps. Vertices: outer grid then inner grid.
 */
export function reliefShell(wasm: Wasm, field: ReliefField, path: RoundedRectPath): Manifold {
  const N = field.s.length;
  const K = field.z.length;
  const vert = new Float32Array(2 * N * K * 3);
  const O = (j: number, k: number) => j * K + k;
  const I = (j: number, k: number) => N * K + j * K + k;

  for (let j = 0; j < N; j++) {
    const { p, n } = path.at(field.s[j]!);
    for (let k = 0; k < K; k++) {
      const z = field.z[k]!;
      for (const [index, u] of [
        [O(j, k), field.outer[j * K + k]!],
        [I(j, k), field.inner[j * K + k]!],
      ] as const) {
        vert[index * 3] = p[0] + n[0] * u;
        vert[index * 3 + 1] = p[1] + n[1] * u;
        vert[index * 3 + 2] = z;
      }
    }
  }

  const tri: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => tri.push(a, b, c, a, c, d);
  for (let j = 0; j < N; j++) {
    const j2 = (j + 1) % N;
    for (let k = 0; k + 1 < K; k++) {
      // Outer faces outward (+n), inner faces inward (−n); s runs counter-clockwise.
      quad(O(j, k), O(j2, k), O(j2, k + 1), O(j, k + 1));
      quad(I(j, k), I(j, k + 1), I(j2, k + 1), I(j2, k));
    }
    quad(O(j, 0), I(j, 0), I(j2, 0), O(j2, 0)); // bottom, facing down
    quad(O(j, K - 1), O(j2, K - 1), I(j2, K - 1), I(j, K - 1)); // top, facing up
  }

  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: vert,
    triVerts: Uint32Array.from(tri),
  });
  return new wasm.Manifold(mesh);
}
