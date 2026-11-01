import type { Vec2 } from '../shapes';

export interface PathPoint {
  /** Position on the path (mm). */
  p: Vec2;
  /** Outward unit normal. */
  n: Vec2;
}

/**
 * Closed rounded-rectangle path centered at the origin, parameterized by arc
 * length. s = 0 is the middle of the front side (y = -depth/2), running
 * counter-clockwise (towards +x first).
 */
export class RoundedRectPath {
  readonly length: number;
  private readonly hx: number;
  private readonly hy: number;
  private readonly r: number;
  /** Cumulative arc length at the end of each of the 9 pieces. */
  private readonly ends: number[];

  constructor(width: number, depth: number, radius: number) {
    this.r = Math.max(0, Math.min(radius, width / 2, depth / 2));
    this.hx = width / 2 - this.r;
    this.hy = depth / 2 - this.r;
    const arc = (Math.PI / 2) * this.r;
    const pieces = [this.hx, arc, 2 * this.hy, arc, 2 * this.hx, arc, 2 * this.hy, arc, this.hx];
    let acc = 0;
    this.ends = pieces.map((len) => (acc += len));
    this.length = acc;
  }

  at(sIn: number): PathPoint {
    const L = this.length;
    let s = ((sIn % L) + L) % L;
    const { hx, hy, r } = this;
    let piece = this.ends.findIndex((e) => s <= e);
    if (piece < 0) piece = this.ends.length - 1;
    s -= piece === 0 ? 0 : this.ends[piece - 1]!;

    switch (piece) {
      case 0: // front, right half
        return { p: [s, -hy - r], n: [0, -1] };
      case 2: // right side
        return { p: [hx + r, -hy + s], n: [1, 0] };
      case 4: // back
        return { p: [hx - s, hy + r], n: [0, 1] };
      case 6: // left side
        return { p: [-hx - r, hy - s], n: [-1, 0] };
      case 8: // front, left half
        return { p: [-hx + s, -hy - r], n: [0, -1] };
      default: {
        // corners 1,3,5,7 → centers (+,-), (+,+), (-,+), (-,-)
        const k = (piece - 1) / 2;
        const centers: Vec2[] = [
          [hx, -hy],
          [hx, hy],
          [-hx, hy],
          [-hx, -hy],
        ];
        const [cx, cy] = centers[k]!;
        const a = -Math.PI / 2 + k * (Math.PI / 2) + (r > 0 ? s / r : 0);
        const n: Vec2 = [Math.cos(a), Math.sin(a)];
        return { p: [cx + r * n[0], cy + r * n[1]], n };
      }
    }
  }
}
