import type { Manifold } from 'manifold-3d';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { seededRandom } from '../random';
import type { Vec2 } from '../shapes';
import { RoundedRectPath } from '../weave/outline';
import { clipHoles } from '../handles';
import { effectiveDividerTop } from '../dividers';
import { junctionArcs } from '../junctions';
import { holesBottom, wallIntrusion } from '../stacking';
import { bentCutter } from './wallcut';

/** Corner radius of the holes (organic look), scaled down for small cells. */
export const CORNER_ROUND = 1.5;
const cornerRound = (cellSize: number) => Math.min(CORNER_ROUND, 0.12 * cellSize);

/** Widest flat hole top (mm): bridge limit minus a margin for the wall depth. */
export const MAX_HOLE_TOP = 13;

/** Sites move at most this fraction of the cell size away from their grid point. */
const JITTER = 0.38;

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** Jittered-grid sites inside `domain`, reproducible for a given seed. */
export function voronoiSites(domain: Rect, cellSize: number, seed: number): Vec2[] {
  const rnd = seededRandom(seed);
  const w = domain.x1 - domain.x0;
  const h = domain.y1 - domain.y0;
  const nx = Math.max(1, Math.round(w / cellSize));
  const ny = Math.max(1, Math.round(h / cellSize));
  const dx = w / nx;
  const dy = h / ny;
  const sites: Vec2[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      sites.push([
        domain.x0 + (i + 0.5 + (rnd() * 2 - 1) * JITTER) * dx,
        domain.y0 + (j + 0.5 + (rnd() * 2 - 1) * JITTER) * dy,
      ]);
    }
  }
  return sites;
}

/** Keeps the part of convex polygon `poly` that is closer to `a` than to `b`. */
function clipHalfPlane(poly: Vec2[], a: Vec2, b: Vec2): Vec2[] {
  const nx = b[0] - a[0];
  const ny = b[1] - a[1];
  const mx = (a[0] + b[0]) / 2;
  const my = (a[1] + b[1]) / 2;
  const side = (p: Vec2) => (p[0] - mx) * nx + (p[1] - my) * ny; // ≤ 0 → keep
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!;
    const q = poly[(i + 1) % poly.length]!;
    const sp = side(p);
    const sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp < 0 && sq > 0) || (sp > 0 && sq < 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

/**
 * Voronoi cells of `sites`, clipped to `domain` (convex, counter-clockwise).
 * `ghosts` only act as neighbours (e.g. periodic copies), they get no cell.
 */
export function voronoiCells(
  domain: Rect,
  sites: Vec2[],
  cellSize: number,
  ghosts: Vec2[] = [],
): Vec2[][] {
  const reach = 3 * cellSize;
  const all = [...sites, ...ghosts];
  return sites.map((a) => {
    let cell: Vec2[] = [
      [domain.x0, domain.y0],
      [domain.x1, domain.y0],
      [domain.x1, domain.y1],
      [domain.x0, domain.y1],
    ];
    for (const b of all) {
      if (b === a || Math.abs(b[0] - a[0]) > reach || Math.abs(b[1] - a[1]) > reach) continue;
      cell = clipHalfPlane(cell, a, b);
      if (cell.length < 3) break;
    }
    return cell;
  });
}

/**
 * Upper hole outlines flatter than this (degrees) are not printed as they are:
 * every layer would extend the wall lines lengthwise by more than ~1.4 mm.
 */
export const MIN_TOP_DEG = 8;
/** Layer height the hole tops are designed for (mm). */
const LAYER = 0.2;
/** Height step of the scan (mm). */
const SCAN = 0.1;

/** Keeps the part of `poly` where nx·x + ny·y ≤ c. */
function clipLine(poly: Vec2[], nx: number, ny: number, c: number): Vec2[] {
  const out: Vec2[] = [];
  const f = (q: Vec2) => nx * q[0] + ny * q[1] - c;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const fa = f(a);
    const fb = f(b);
    if (fa <= 0) out.push(a);
    if ((fa < 0 && fb > 0) || (fa > 0 && fb < 0)) {
      const t = fa / (fa - fb);
      out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return out;
}

/** [left, right] where the horizontal line at height y crosses a convex polygon. */
function span(poly: Vec2[], y: number): [number, number] | undefined {
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    if ((a[1] - y) * (b[1] - y) > 0 || a[1] === b[1]) continue;
    const x = a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
    lo = Math.min(lo, x);
    hi = Math.max(hi, x);
  }
  return hi > lo ? [lo, hi] : undefined;
}

/**
 * Keeps the Voronoi shape as far as printing allows. In a thin wall the
 * extrusion lines run along the wall: going up, each side of a hole may close
 * in by at most LAYER / tan(MIN_TOP_DEG) per layer (lines get extended
 * lengthwise), and the last opening at the very top is closed by one bridge.
 * A top-down scan enforces this by making the hole smaller where needed –
 * flat shoulders, rounded corners and flat tops alike. Holes wider than
 * MAX_HOLE_TOP are first trimmed to vertical sides.
 */
export function printableHole(hole: Vec2[]): Vec2[] {
  let poly = hole;
  const xs = poly.map((q) => q[0]);
  if (Math.max(...xs) - Math.min(...xs) > MAX_HOLE_TOP) {
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    poly = clipLine(poly, 1, 0, mid + MAX_HOLE_TOP / 2);
    poly = clipLine(poly, -1, 0, -(mid - MAX_HOLE_TOP / 2));
  }
  const ys = poly.map((q) => q[1]);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const steps = Math.ceil((y1 - y0) / SCAN);
  const step = (SCAN / LAYER / Math.tan((MIN_TOP_DEG * Math.PI) / 180)) * LAYER;

  // Scan heights strictly inside the hole, from the top down.
  const rows: { y: number; l: number; r: number }[] = [];
  let above: { l: number; r: number } | undefined;
  for (let k = steps - 1; k >= 1; k--) {
    const y = y0 + ((y1 - y0) * k) / steps;
    const sp = span(poly, y);
    if (!sp) continue;
    let [l, r] = sp;
    if (above) {
      // Below a row the hole may only be wider by `step` per side.
      l = Math.max(l, above.l - step);
      r = Math.min(r, above.r + step);
    }
    if (r - l < 1e-6) continue;
    rows.push({ y, l, r });
    above = { l, r };
  }
  if (rows.length < 2) return [];
  rows.reverse(); // bottom → top
  const out: Vec2[] = [];
  const bottom = span(poly, y0 + 1e-6);
  if (bottom) out.push([bottom[0], y0], [bottom[1], y0]);
  for (const row of rows) out.push([row.r, row.y]);
  for (let i = rows.length - 1; i >= 0; i--) out.push([rows[i]!.l, rows[i]!.y]);
  return dropCollinear(out);
}

/** Removes points that lie on the straight line through their neighbours. */
function dropCollinear(poly: Vec2[]): Vec2[] {
  const out: Vec2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = out[out.length - 1] ?? poly[poly.length - 1]!;
    const b = poly[i]!;
    const c = poly[(i + 1) % poly.length]!;
    const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(cross) > 1e-4) out.push(b);
  }
  return out;
}

/** True if every horizontal line crosses the polygon in at most one span. */
function oneSpanPerRow(poly: Vec2[]): boolean {
  const ys = poly.map((q) => q[1]);
  const lo = Math.min(...ys);
  const hi = Math.max(...ys);
  for (let y = lo + 0.05; y < hi; y += 0.25) {
    let crossings = 0;
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % poly.length]!;
      if ((a[1] - y) * (b[1] - y) < 0) crossings++;
    }
    if (crossings > 2) return false;
  }
  return true;
}

/**
 * Voronoi holes in wall coordinates (x = arc length along the outer wall,
 * starting at the middle of the front, counter-clockwise; y = height).
 * The pattern is periodic in x, so it runs round the corners without a seam.
 *
 * With dividers the comb (each divider joint up to the divider top) is kept
 * free first and the cells fill the rest: no sites inside or right next to
 * the comb, so the cells beside a tooth are whole cells that end on its
 * edge (sites above a tooth are mirrored into it, so cells end on its top).
 * Cells then shrink by half a web like everywhere, leaving exactly one web
 * to the divider face.
 */
export function voronoiHoles(wasm: Wasm, scope: Scope, p: BasketParams): Vec2[][] {
  const { CrossSection } = wasm;
  const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
  const L = path.length;
  const y0 = holesBottom(p);
  const y1 = p.height - p.borderBand;
  const size = p.voronoi.cellSize;
  if (y1 - y0 < size / 2) return [];

  let sites = voronoiSites({ x0: 0, y0, x1: L, y1 }, size, p.voronoi.seed);
  const joints = junctionArcs(p, path);
  // comb edges: divider face plus half a web (the cells add the other half)
  const half = wallIntrusion(p) / 2 + p.webWidth / 2;
  const top = effectiveDividerTop(p) + p.webWidth / 2;
  const toJoint = (x: number) =>
    joints
      .map((s) => ((((x - s) % L) + 1.5 * L) % L) - L / 2)
      .sort((a, b) => Math.abs(a) - Math.abs(b))[0]!;
  const mirrors: Vec2[] = [];
  if (joints.length > 0) {
    const clear = size * 0.35;
    sites = sites.filter(([x, y]) => !(y < top + clear && Math.abs(toJoint(x)) < half + clear));
    // Mirror sites just above a comb tooth into it: the cells there end on
    // the tooth's top edge. (Not across its sides – a tooth is thinner than
    // a cell, so a mirror would land in the next compartment.)
    const reach = 1.5 * size;
    for (const [x, y] of sites) {
      const d = toJoint(x);
      if (y >= top && y < top + reach && Math.abs(d) < half) mirrors.push([x, 2 * top - y]);
    }
  }
  const ghosts = [...sites, ...mirrors].flatMap(([x, y]): Vec2[] => [
    [x - L, y],
    [x + L, y],
  ]);
  const domain: Rect = { x0: -L, y0, x1: 2 * L, y1 };
  const round = cornerRound(size);
  const comb =
    joints.length === 0
      ? undefined
      : scope.keep(
          CrossSection.ofPolygons(
            joints.flatMap((s) =>
              [-L, 0, L].map((k): Vec2[] => [
                [s + k - half, y0 - 1],
                [s + k + half, y0 - 1],
                [s + k + half, top],
                [s + k - half, top],
              ]),
            ),
          ),
        );
  const shapes: Vec2[][] = [];
  for (const cell of voronoiCells(domain, sites, size, [...mirrors, ...ghosts])) {
    let cs = scope.keep(CrossSection.ofPolygons([cell]));
    if (comb) cs = scope.keep(cs.subtract(comb));
    // Shrink by half the web plus the corner radius, then grow back by the
    // radius: rounded corners, webs exactly webWidth wide (on the outside).
    const inset = scope.keep(cs.offset(-p.webWidth / 2 - round, 'Miter'));
    const shrunk = scope.keep(inset.offset(round, 'Round', 2, 16));
    for (const poly of shrunk.toPolygons()) {
      if (poly.length < 3) continue;
      const shape = poly.map(([x, y]) => [x, y] as Vec2);
      if (oneSpanPerRow(shape)) {
        shapes.push(shape);
        continue;
      }
      // rare: a cell wrapping round a comb tooth – split it at the joint
      const s = shape[0]![0] - toJoint(shape[0]![0]);
      const piece = scope.keep(CrossSection.ofPolygons([shape]));
      const cut = (x0: number, x1: number) =>
        scope.keep(
          CrossSection.ofPolygons([
            [
              [x0, y0 - 2],
              [x1, y0 - 2],
              [x1, y1 + 2],
              [x0, y1 + 2],
            ],
          ]),
        );
      for (const side of [cut(s - L, s), cut(s, s + L)])
        for (const q of scope.keep(piece.intersect(side)).toPolygons())
          if (q.length >= 3) shapes.push(q.map(([x, y]) => [x, y] as Vec2));
    }
  }
  // A handle cut-out trims the cells it reaches (the comb is already free);
  // then every piece is made printable.
  return clipHoles(wasm, scope, p, path, shapes, printableHole, { joints: false });
}

/**
 * One cutter body for all holes, bent onto the wall along the outer outline
 * and reaching from 1 mm outside to 1 mm inside the wall.
 */
export function voronoiCutters(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const holes = voronoiHoles(wasm, scope, p);
  if (holes.length === 0) return [];
  const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
  return [scope.keep(bentCutter(wasm, holes, path, 1, -(p.wall + 1)))];
}
