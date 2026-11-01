import type { Manifold } from 'manifold-3d';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { seededRandom } from '../random';
import type { Vec2 } from '../shapes';

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

/** Voronoi cells of `sites`, clipped to `domain` (convex, counter-clockwise). */
export function voronoiCells(domain: Rect, sites: Vec2[], cellSize: number): Vec2[][] {
  const reach = 3 * cellSize;
  return sites.map((a) => {
    let cell: Vec2[] = [
      [domain.x0, domain.y0],
      [domain.x1, domain.y0],
      [domain.x1, domain.y1],
      [domain.x0, domain.y1],
    ];
    for (const b of sites) {
      if (b === a || Math.abs(b[0] - a[0]) > reach || Math.abs(b[1] - a[1]) > reach) continue;
      cell = clipHalfPlane(cell, a, b);
      if (cell.length < 3) break;
    }
    return cell;
  });
}

/**
 * Makes a convex hole printable without support: above the height where its
 * upper outline becomes flatter than 45°, it is cut off flat. What remains is
 * steep sides plus a flat top that bridges between them. Returns the clipped
 * hole (only ever smaller than the input, so webs never get thinner).
 */
export function printableHole(hole: Vec2[]): Vec2[] {
  let cut = Infinity;
  for (let i = 0; i < hole.length; i++) {
    const p = hole[i]!;
    const q = hole[(i + 1) % hole.length]!;
    const dx = q[0] - p[0];
    const dy = q[1] - p[1];
    // Counter-clockwise: an edge running leftwards is on the upper outline.
    if (dx < 0 && Math.abs(dy) < Math.abs(dx)) cut = Math.min(cut, p[1], q[1]);
  }
  let out = hole;
  if (cut !== Infinity) out = clipHalfPlane(out, [0, cut - 1], [0, cut + 1]);
  // Safety net: holes wider than MAX_HOLE_TOP get vertical sides, so the flat
  // top never bridges further than that.
  const xs = out.map((q) => q[0]);
  const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
  const half = MAX_HOLE_TOP / 2;
  out = clipHalfPlane(out, [mid, 0], [mid + 2 * half, 0]);
  out = clipHalfPlane(out, [mid, 0], [mid - 2 * half, 0]);
  return out;
}

/** Straight wall faces of the outer outline: center, tangent (CCW), outward normal, length. */
function wallFaces(p: BasketParams) {
  const lx = p.width - 2 * p.cornerRadius;
  const ly = p.depth - 2 * p.cornerRadius;
  return [
    { c: [0, -p.depth / 2], t: [1, 0], n: [0, -1], len: lx },
    { c: [p.width / 2, 0], t: [0, 1], n: [1, 0], len: ly },
    { c: [0, p.depth / 2], t: [-1, 0], n: [0, 1], len: lx },
    { c: [-p.width / 2, 0], t: [0, -1], n: [-1, 0], len: ly },
  ] as const;
}

/**
 * Hole cutters for the Voronoi wall style: one prism per cell, through the
 * wall, on each straight face. Corners and the border bands stay solid.
 */
export function voronoiCutters(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const { CrossSection } = wasm;
  const cutters: Manifold[] = [];
  const v0 = p.floor + p.borderBand;
  const v1 = p.height - p.borderBand;
  if (v1 - v0 < p.voronoi.cellSize / 2) return cutters;
  const depth = 4 * p.wall + 2;

  wallFaces(p).forEach((face, f) => {
    const half = face.len / 2 - p.webWidth;
    if (half * 2 < p.voronoi.cellSize / 2) return;
    const domain: Rect = { x0: -half, y0: v0, x1: half, y1: v1 };
    const sites = voronoiSites(domain, p.voronoi.cellSize, p.voronoi.seed * 4 + f);
    const holes: Vec2[][] = [];
    for (const cell of voronoiCells(domain, sites, p.voronoi.cellSize)) {
      // Shrink by half the web plus the corner radius, then grow back by the
      // radius: rounded corners, webs exactly webWidth wide.
      const round = cornerRound(p.voronoi.cellSize);
      const cs = scope.keep(CrossSection.ofPolygons([cell]));
      const inset = scope.keep(cs.offset(-p.webWidth / 2 - round, 'Miter'));
      const shrunk = scope.keep(inset.offset(round, 'Round', 2, 16));
      for (const poly of shrunk.toPolygons()) {
        if (poly.length < 3) continue;
        const hole = printableHole(poly.map(([x, y]) => [x, y] as Vec2));
        if (hole.length >= 3) holes.push(hole);
      }
    }
    if (holes.length === 0) return;
    const prism = scope.keep(
      scope.keep(CrossSection.ofPolygons(holes)).extrude(depth, 0, 0, [1, 1], true),
    );
    // Columns: local x → tangent, local y → up, local z → outward normal.
    const m = prism.transform([
      face.t[0],
      face.t[1],
      0,
      0,
      0,
      0,
      1,
      0,
      face.n[0],
      face.n[1],
      0,
      0,
      face.c[0],
      face.c[1],
      0,
      1,
    ]);
    cutters.push(scope.keep(m));
  });
  return cutters;
}
