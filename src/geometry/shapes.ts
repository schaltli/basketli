/** 2D helpers. All lengths in mm, polygons counter-clockwise. */

export type Vec2 = [number, number];

/**
 * Rounded rectangle centered at the origin, counter-clockwise.
 * `segments` = line segments per quarter circle.
 */
export function roundedRect(
  width: number,
  depth: number,
  radius: number,
  segments: number,
): Vec2[] {
  const r = Math.max(0, Math.min(radius, width / 2, depth / 2));
  const hx = width / 2 - r;
  const hy = depth / 2 - r;
  if (r === 0) {
    return [
      [-hx, -hy],
      [hx, -hy],
      [hx, hy],
      [-hx, hy],
    ];
  }
  const centers: Vec2[] = [
    [hx, -hy],
    [hx, hy],
    [-hx, hy],
    [-hx, -hy],
  ];
  const pts: Vec2[] = [];
  centers.forEach(([cx, cy], quarter) => {
    const start = -Math.PI / 2 + (quarter * Math.PI) / 2;
    for (let i = 0; i <= segments; i++) {
      const a = start + (i / segments) * (Math.PI / 2);
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  });
  return dedupe(pts);
}

/** Exact area of an ideal rounded rectangle. */
export function roundedRectArea(width: number, depth: number, radius: number): number {
  const r = Math.max(0, Math.min(radius, width / 2, depth / 2));
  return width * depth - (4 - Math.PI) * r * r;
}

const EPS = 1e-9;
const same = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]) < EPS;

/** Removes consecutive duplicates, including first/last. */
function dedupe(pts: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (const p of pts) {
    const last = out[out.length - 1];
    if (!last || !same(p, last)) out.push(p);
  }
  const first = out[0];
  const last = out[out.length - 1];
  if (first && last && out.length > 1 && same(first, last)) out.pop();
  return out;
}
