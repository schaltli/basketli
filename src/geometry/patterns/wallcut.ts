import type { Manifold } from 'manifold-3d';
import type { Wasm } from '../manifold';
import type { Vec2 } from '../shapes';
import type { RoundedRectPath } from '../weave/outline';

/** Longest step (mm) along the wall between two cutter vertices (follows the corners). */
const MAX_SEGMENT = 0.5;

/** Inserts points so no edge is longer than `max` (keeps curved walls smooth). */
function subdivide(poly: Vec2[], max: number): Vec2[] {
  const out: Vec2[] = [];
  poly.forEach((a, i) => {
    const b = poly[(i + 1) % poly.length]!;
    const n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / max));
    for (let k = 0; k < n; k++)
      out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  });
  return out;
}

/**
 * One cutter body for many holes. Each hole is a convex polygon in wall
 * coordinates (x = arc length along `path`, y = height). It is bent onto the
 * wall along `path` and spans from `uOut` to `uIn` along the wall normal, so
 * holes follow rounded corners.
 */
export function bentCutter(
  wasm: Wasm,
  holes: Vec2[][],
  path: RoundedRectPath,
  uOut: number,
  uIn: number,
): Manifold {
  const vert: number[] = [];
  const tri: number[] = [];
  const put = (x: number, y: number, u: number) => {
    const { p: at, n } = path.at(x);
    vert.push(at[0] + n[0] * u, at[1] + n[1] * u, y);
    return vert.length / 3 - 1;
  };

  for (const hole of holes) {
    const ring = subdivide(hole, MAX_SEGMENT);
    const cx = ring.reduce((a, q) => a + q[0], 0) / ring.length;
    const cy = ring.reduce((a, q) => a + q[1], 0) / ring.length;
    const m = ring.length;
    const cO = put(cx, cy, uOut);
    const cI = put(cx, cy, uIn);
    const O = ring.map(([x, y]) => put(x, y, uOut));
    const I = ring.map(([x, y]) => put(x, y, uIn));
    for (let i = 0; i < m; i++) {
      const j = (i + 1) % m;
      tri.push(cO, O[i]!, O[j]!); // outer cap, facing outwards
      tri.push(cI, I[j]!, I[i]!); // inner cap, facing inwards
      tri.push(O[i]!, I[j]!, O[j]!, O[i]!, I[i]!, I[j]!); // side wall
    }
  }
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: Float32Array.from(vert),
    triVerts: Uint32Array.from(tri),
  });
  return new wasm.Manifold(mesh);
}
