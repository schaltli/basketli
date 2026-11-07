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

  /**
   * Arc positions that sample the path exactly: both ends of every straight
   * piece and points at most `arcStep` apart on the corner arcs.
   */
  breakpoints(arcStep: number): number[] {
    const out: number[] = [0];
    let start = 0;
    this.ends.forEach((end, piece) => {
      if (piece % 2 === 1 && end > start) {
        const n = Math.max(1, Math.ceil((end - start) / arcStep));
        for (let i = 1; i <= n; i++) out.push(start + ((end - start) * i) / n);
      } else {
        out.push(end);
      }
      start = end;
    });
    // drop the closing point (= 0) and duplicates
    return [...new Set(out.filter((s) => s < this.length - 1e-9).map((s) => +s.toFixed(9)))].sort(
      (a, b) => a - b,
    );
  }

  /** Radius of the corner arcs. */
  get radius(): number {
    return this.r;
  }

  /** Arc position of the point of the path nearest to (x, y). */
  project(x: number, y: number): number {
    const { hx, hy, r, ends } = this;
    const qx = Math.min(hx, Math.max(-hx, x));
    const qy = Math.min(hy, Math.max(-hy, y));
    const vx = x - qx;
    const vy = y - qy;
    if (r > 0 && vx !== 0 && vy !== 0) {
      // corner arc around (qx, qy): angle from its start
      const a = Math.atan2(vy, vx);
      const k = qx > 0 ? (qy < 0 ? 0 : 1) : qy > 0 ? 2 : 3;
      const start = -Math.PI / 2 + (k * Math.PI) / 2;
      const t = (((a - start) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
      return ends[2 * k]! + r * Math.min(Math.PI / 2, t);
    }
    // nearest straight side
    const dx = hx + r - Math.abs(x);
    const dy = hy + r - Math.abs(y);
    if (vx !== 0 || (vy === 0 && dx < dy)) {
      return x > 0 ? ends[1]! + (qy + hy) : ends[5]! + (hy - qy);
    }
    if (y > 0) return ends[3]! + (hx - qx);
    return qx >= 0 ? qx : ends[7]! + (qx + hx);
  }

  /** True if arc position s lies on a corner arc. */
  onArc(s: number): boolean {
    return this.r > 0 && this.pieceAt(s) % 2 === 1;
  }

  /** True if the arc range [s0, s1] lies on one straight side (no corner). */
  isStraight(s0: number, s1: number): boolean {
    const a = this.pieceAt(s0);
    return a % 2 === 0 && a === this.pieceAt(s1) && s1 - s0 < this.length / 2;
  }

  private pieceAt(sIn: number): number {
    const L = this.length;
    const s = ((sIn % L) + L) % L;
    const piece = this.ends.findIndex((e) => s <= e);
    // pieces 0 and 8 are the two halves of the front side
    return piece < 0 || piece === 8 ? 0 : piece;
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
