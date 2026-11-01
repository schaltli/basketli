import type { Quality } from '../basket';
import type { WeaveMaterial } from '../params';
import type { Vec2 } from '../shapes';

/** Points on the rounded part of a profile. */
export const PROFILE_SEGMENTS = { preview: 10, export: 24 } as const;

/**
 * Strand cross-section in local coordinates: u = sideways (outward positive),
 * v = up. Centered on the row: v spans [-height/2, height/2], u spans
 * [-thickness/2, thickness/2]. Counter-clockwise, first point not repeated.
 *
 * Both profiles end in a 45° point at the bottom so no downward face is
 * flatter than 45° (support-free FDM printing).
 */
export function strandProfile(
  material: WeaveMaterial,
  height: number,
  thickness: number,
  quality: Quality,
): Vec2[] {
  const seg = PROFILE_SEGMENTS[quality];
  return material === 'cane'
    ? teardropOval(height, thickness, seg)
    : roundedBand(height, thickness, seg);
}

/**
 * Flat-oval cane: an ellipse whose lower part, where it would overhang more
 * than 45°, is replaced by its 45° tangents meeting in a point.
 */
function teardropOval(h: number, t: number, seg: number): Vec2[] {
  const A = t / 2;
  // Solve B + sqrt(A² + B²) = h so the total height is exactly h.
  const B = (h * h - A * A) / (2 * h);
  const cv = -h / 2 + Math.hypot(A, B); // ellipse center
  const tangentAngle = Math.atan(B / A); // below the center, on each side
  const pts: Vec2[] = [[0, -h / 2]];
  // From the right tangent point (angle -θ*) round over the top to the left one (π + θ*).
  const start = -tangentAngle;
  const end = Math.PI + tangentAngle;
  const n = seg * 2;
  for (let i = 0; i <= n; i++) {
    const a = start + ((end - start) * i) / n;
    pts.push([A * Math.cos(a), cv + B * Math.sin(a)]);
  }
  return pts;
}

/** Flat band: vertical faces, round top, 45° point at the bottom. */
function roundedBand(h: number, t: number, seg: number): Vec2[] {
  const r = t / 2;
  const top = h / 2 - r; // center of the top round
  const pts: Vec2[] = [
    [0, -h / 2],
    [r, -h / 2 + r],
  ];
  for (let i = 0; i <= seg; i++) {
    const a = (Math.PI * i) / seg;
    pts.push([r * Math.cos(a), top + r * Math.sin(a)]);
  }
  pts.push([-r, -h / 2 + r]);
  return pts;
}

/** Signed area (positive for counter-clockwise). */
export function polygonArea(pts: Vec2[]): number {
  let a = 0;
  pts.forEach(([x, y], i) => {
    const [nx, ny] = pts[(i + 1) % pts.length]!;
    a += x * ny - nx * y;
  });
  return a / 2;
}
