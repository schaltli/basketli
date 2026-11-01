import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { roundedRect, type Vec2 } from '../shapes';
import { filteredField, type Field } from '../weave/field';
import { RoundedRectPath } from '../weave/outline';
import { reliefShell } from '../weave/shell';
import { printableHole } from './voronoi';
import { bentCutter } from './wallcut';

/** Points per lens arc. */
const ARC_POINTS = 24;
/** Column spacing on the corner arcs (straight sides only need their ends). */
const ARC_STEP = { preview: 0.8, export: 0.4 } as const;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

/**
 * Standing lens (vesica): two circular arcs meeting in pointed tips at the
 * top and bottom. Centered at the origin, counter-clockwise.
 */
export function lensPolygon(width: number, height: number): Vec2[] {
  const c = (height * height - width * width) / (4 * width); // arc centers at (±c, 0)
  const r = c + width / 2;
  const a = Math.atan2(height / 2, c);
  const pts: Vec2[] = [];
  for (let i = 0; i < ARC_POINTS; i++) {
    const t = -a + (2 * a * i) / ARC_POINTS; // right arc, bottom → top
    pts.push([-c + r * Math.cos(t), r * Math.sin(t)]);
  }
  for (let i = 0; i < ARC_POINTS; i++) {
    const t = Math.PI - a + (2 * a * i) / ARC_POINTS; // left arc, top → bottom
    pts.push([c + r * Math.cos(t), r * Math.sin(t)]);
  }
  return pts;
}

function segmentDistance(p: Vec2, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const t = Math.max(
    0,
    Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}

/** Smallest distance between two polygons (assumed not to overlap). */
export function polygonDistance(a: Vec2[], b: Vec2[]): number {
  let d = Infinity;
  for (const [p, q] of [
    [a, b],
    [b, a],
  ] as const)
    for (const v of p)
      for (let i = 0; i < q.length; i++)
        d = Math.min(d, segmentDistance(v, q[i]!, q[(i + 1) % q.length]!));
  return d;
}

const shift = (poly: Vec2[], dx: number, dy: number): Vec2[] =>
  poly.map(([x, y]) => [x + dx, y + dy]);

/**
 * Pitch of the diamond lattice (lenses in staggered rows) so every strand is
 * at least `strand` wide: horizontal pitch between lenses of a row and
 * vertical pitch between rows of the same phase.
 */
export function latticePitch(
  width: number,
  height: number,
  strand: number,
): { ps: number; pz: number } {
  const lens = lensPolygon(width, height);
  const ok = (k: number) => {
    const ps = k * width;
    const pz = k * height;
    return (
      polygonDistance(lens, shift(lens, ps / 2, pz / 2)) >= strand &&
      polygonDistance(lens, shift(lens, ps, 0)) >= strand &&
      polygonDistance(lens, shift(lens, 0, pz)) >= strand
    );
  };
  let lo = 1;
  let hi = 6;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (ok(mid)) hi = mid;
    else lo = mid;
  }
  return { ps: hi * width, pz: hi * height };
}

export interface ExpandedLayout {
  /** Centerline of the sheet. */
  path: RoundedRectPath;
  /** Real horizontal pitch (fits the perimeter a whole number of times). */
  ps: number;
  pz: number;
  /** Heights of the lens rows (knot rows of the twisted strands). */
  rows: number[];
}

export function expandedLayout(p: BasketParams): ExpandedLayout {
  const e = p.expanded;
  const off = p.wall / 2 + e.twist / 2;
  const path = new RoundedRectPath(p.width - 2 * off, p.depth - 2 * off, p.cornerRadius - off);
  const pitch = latticePitch(e.lensWidth, e.lensHeight, e.strand);
  const n = Math.max(2, Math.floor(path.length / pitch.ps));
  const ps = path.length / n;
  const y0 = p.floor + p.borderBand;
  const y1 = p.height - p.borderBand;
  const half = pitch.pz / 2;
  const count = Math.floor((y1 - y0 - e.lensHeight) / half) + 1;
  const rows: number[] = [];
  if (count >= 1) {
    const span = (count - 1) * half + e.lensHeight;
    const first = y0 + (y1 - y0 - span) / 2 + e.lensHeight / 2;
    for (let j = 0; j < count; j++) rows.push(first + j * half);
  }
  return { path, ps, pz: pitch.pz, rows };
}

/** All lens holes in wall coordinates (x = arc length along the centerline). */
export function expandedHoles(p: BasketParams, layout: ExpandedLayout): Vec2[][] {
  const lens = printableHole(lensPolygon(p.expanded.lensWidth, p.expanded.lensHeight));
  const n = Math.round(layout.path.length / layout.ps);
  const holes: Vec2[][] = [];
  layout.rows.forEach((y, j) => {
    for (let i = 0; i < n; i++)
      holes.push(shift(lens, i * layout.ps + ((j % 2) * layout.ps) / 2, y));
  });
  return holes;
}

/**
 * Sawtooth offset of the sheet that imitates the twisted strands: between two
 * knot rows the sheet leans outwards, at each knot row it steps back.
 */
export function twistShift(p: BasketParams, layout: ExpandedLayout, z: number): number {
  const rows = layout.rows;
  if (rows.length < 2 || z < rows[0]! || z >= rows[rows.length - 1]!) return 0;
  const phase = (z - rows[0]!) / (layout.pz / 2);
  return p.expanded.twist * (phase - Math.floor(phase) - 0.5);
}

/** The sheet (without holes) as a height field along the centerline. */
export function expandedField(p: BasketParams, layout: ExpandedLayout, quality: Quality): Field {
  // The sheet does not change along the wall: only the corners need columns.
  const s = Float64Array.from(layout.path.breakpoints(ARC_STEP[quality]));
  // Heights: the sawtooth is linear between knot rows; at each knot it steps
  // back (outer face) and the inner face follows at 45° within `twist`.
  const t = p.expanded.twist;
  const levels = new Set<number>([0, p.height]);
  for (const r of layout.rows) {
    levels.add(r - 1e-3);
    levels.add(r);
    if (t > 0) levels.add(Math.min(p.height, r + t));
  }
  const z = Float64Array.from(
    [...levels].filter((v) => v >= 0 && v <= p.height).sort((a, b) => a - b),
  );
  const half = p.wall / 2;
  return filteredField(
    s,
    z,
    (_s, zz) => {
      const d = twistShift(p, layout, zz);
      return [d - half, d + half];
    },
    p.wall,
  );
}

/** Sheet + floor, optionally with the lens holes cut. */
export function buildExpanded(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  withHoles = true,
): Manifold {
  const { Manifold, CrossSection } = wasm;
  const layout = expandedLayout(p);
  const shell = scope.keep(reliefShell(wasm, expandedField(p, layout, quality), layout.path));
  const outline = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(p.width, p.depth, p.cornerRadius, CORNER_SEGMENTS[quality]),
    ]),
  );
  const floor = scope.keep(outline.extrude(p.floor));
  const sheet = scope.keep(Manifold.union([shell, floor]));
  if (!withHoles) return sheet;
  const holes = expandedHoles(p, layout);
  if (holes.length === 0) return sheet;
  const reach = p.wall / 2 + p.expanded.twist / 2 + 1;
  const cutter = scope.keep(bentCutter(wasm, holes, layout.path, reach, -reach));
  return scope.keep(sheet.subtract(cutter));
}
