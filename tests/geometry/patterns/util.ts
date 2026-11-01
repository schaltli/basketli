import type { Vec2 } from '../../../src/geometry/shapes';

/** Signed polygon area (positive for counter-clockwise). */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length]!;
    a += x * ny - nx * y;
  });
  return a / 2;
}
