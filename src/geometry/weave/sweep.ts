import type { Manifold } from 'manifold-3d';
import type { Wasm } from '../manifold';
import type { Vec2 } from '../shapes';

/**
 * Sweeps a 2D profile (u = outward, v = up) along a closed horizontal path at
 * height `zCenter`. The profile stays upright (no twist): its u axis is the
 * horizontal normal of the path. Returns a closed, watertight tube.
 */
export function sweepClosed(wasm: Wasm, path: Vec2[], zCenter: number, profile: Vec2[]): Manifold {
  const n = path.length;
  const m = profile.length;
  const vert = new Float32Array(n * m * 3);

  for (let i = 0; i < n; i++) {
    const prev = path[(i - 1 + n) % n]!;
    const next = path[(i + 1) % n]!;
    const cur = path[i]!;
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    const len = Math.hypot(tx, ty) || 1;
    tx /= len;
    ty /= len;
    // Outward normal of a counter-clockwise path: tangent rotated clockwise.
    const nx = ty;
    const ny = -tx;
    for (let j = 0; j < m; j++) {
      const [u, v] = profile[j]!;
      const k = (i * m + j) * 3;
      vert[k] = cur[0] + nx * u;
      vert[k + 1] = cur[1] + ny * u;
      vert[k + 2] = zCenter + v;
    }
  }

  const tri = new Uint32Array(n * m * 6);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const i2 = (i + 1) % n;
    for (let j = 0; j < m; j++) {
      const j2 = (j + 1) % m;
      const a = i * m + j;
      const b = i * m + j2;
      const c = i2 * m + j;
      const d = i2 * m + j2;
      // Counter-clockwise seen from outside.
      tri[t++] = a;
      tri[t++] = c;
      tri[t++] = b;
      tri[t++] = b;
      tri[t++] = c;
      tri[t++] = d;
    }
  }

  const mesh = new wasm.Mesh({ numProp: 3, vertProperties: vert, triVerts: tri });
  return new wasm.Manifold(mesh);
}
