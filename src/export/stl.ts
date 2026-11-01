import type { MeshData } from '../geometry/build';

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

/**
 * Binary STL. Units are mm; facet normals are computed from the
 * counter-clockwise (outward) winding.
 */
export function toStl(mesh: MeshData, header = 'basketli'): Uint8Array {
  const { positions: pos, indices: idx } = mesh;
  const count = idx.length / 3;
  const bytes = new Uint8Array(HEADER_BYTES + 4 + count * TRIANGLE_BYTES);
  const view = new DataView(bytes.buffer);

  const label = new TextEncoder().encode(header.slice(0, HEADER_BYTES));
  bytes.set(label, 0);
  view.setUint32(HEADER_BYTES, count, true);

  let o = HEADER_BYTES + 4;
  for (let t = 0; t < count; t++) {
    const a = idx[t * 3]! * 3;
    const b = idx[t * 3 + 1]! * 3;
    const c = idx[t * 3 + 2]! * 3;
    const ux = pos[b]! - pos[a]!;
    const uy = pos[b + 1]! - pos[a + 1]!;
    const uz = pos[b + 2]! - pos[a + 2]!;
    const vx = pos[c]! - pos[a]!;
    const vy = pos[c + 1]! - pos[a + 1]!;
    const vz = pos[c + 2]! - pos[a + 2]!;
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len;
    ny /= len;
    nz /= len;

    view.setFloat32(o, nx, true);
    view.setFloat32(o + 4, ny, true);
    view.setFloat32(o + 8, nz, true);
    o += 12;
    for (const v of [a, b, c]) {
      view.setFloat32(o, pos[v]!, true);
      view.setFloat32(o + 4, pos[v + 1]!, true);
      view.setFloat32(o + 8, pos[v + 2]!, true);
      o += 12;
    }
    view.setUint16(o, 0, true);
    o += 2;
  }
  return bytes;
}

export function stlByteLength(triangles: number): number {
  return HEADER_BYTES + 4 + triangles * TRIANGLE_BYTES;
}
