import type { Manifold } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import type { BasketParams } from './params';
import { diamondPitch } from './patterns/expanded';
import { hexagon } from './patterns/hex';
import { voronoiCells, voronoiSites } from './patterns/voronoi';
import { roundedRect, type Vec2 } from './shapes';
import { footInset, SOCKET_WALL, wallIntrusion } from './stacking';

const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
/** Diamonds in the floor are this much taller than wide. */
const DIAMOND_ASPECT = 2;
/** Slots are this many times longer than wide (shorter if the compartment is). */
const SLOT_LENGTH = 4;

/** Inset of the free floor from the outer outline: inside the wall or the socket ring. */
function floorInset(p: BasketParams): number {
  return p.stackable ? footInset(p) + SOCKET_WALL : wallIntrusion(p);
}

/**
 * The floor's compartments (model x/y, convex polygons): the floor inside
 * the wall (or socket ring) less one floor web, split by solid strips under
 * the dividers (the divider plus a web on each side).
 */
export function floorCompartments(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): Vec2[][] {
  const web = p.floorWebWidth;
  const inset = floorInset(p) + web;
  const W = p.width;
  const D = p.depth;
  if (W - 2 * inset <= 0 || D - 2 * inset <= 0) return [];
  const region = scope.keep(
    wasm.CrossSection.ofPolygons([
      roundedRect(
        W - 2 * inset,
        D - 2 * inset,
        Math.max(0, p.cornerRadius - inset),
        CORNER_SEGMENTS[quality],
      ),
    ]),
  );
  const half = wallIntrusion(p) / 2 + web;
  const spans = (size: number, cuts: number[]): [number, number][] => {
    const edges = [
      -size / 2,
      ...cuts.flatMap((c) => [c - size / 2 - half, c - size / 2 + half]),
      size / 2,
    ];
    const out: [number, number][] = [];
    for (let i = 0; i < edges.length; i += 2)
      if (edges[i + 1]! > edges[i]!) out.push([edges[i]!, edges[i + 1]!]);
    return out;
  };
  const out: Vec2[][] = [];
  for (const [x0, x1] of spans(W, p.dividersX))
    for (const [y0, y1] of spans(D, p.dividersY)) {
      const box = scope.keep(
        wasm.CrossSection.ofPolygons([
          [
            [x0, y0],
            [x1, y0],
            [x1, y1],
            [x0, y1],
          ],
        ]),
      );
      for (const poly of scope.keep(region.intersect(box)).toPolygons())
        if (poly.length >= 3) out.push(poly.map(([x, y]) => [x, y] as Vec2));
    }
  return out;
}

/** True if every point lies inside the convex polygon (counter-clockwise). */
function insideConvex(points: Vec2[], poly: Vec2[]): boolean {
  return points.every(([x, y]) =>
    poly.every((a, i) => {
      const b = poly[(i + 1) % poly.length]!;
      return (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-9;
    }),
  );
}

interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

const boundsOf = (poly: Vec2[]): Box => {
  const xs = poly.map((q) => q[0]);
  const ys = poly.map((q) => q[1]);
  return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
};

/**
 * Centred staggered grid covering a box (and a pitch beyond): rows `pz`
 * apart, `ps` apart in a row, every other row shifted by ps / 2. The box
 * centre is a node, so the pattern sits symmetric in the compartment.
 */
function staggered(b: Box, ps: number, pz: number): Vec2[] {
  const cx = (b.x0 + b.x1) / 2;
  const cy = (b.y0 + b.y1) / 2;
  const nx = Math.ceil((b.x1 - b.x0) / 2 / ps) + 1;
  const ny = Math.ceil((b.y1 - b.y0) / 2 / pz) + 1;
  const out: Vec2[] = [];
  for (let j = -ny; j <= ny; j++)
    for (let i = -nx; i <= nx; i++)
      out.push([cx + (i + (Math.abs(j) % 2) * 0.5) * ps, cy + j * pz]);
  return out;
}

/** Pieces of a cut hole thinner than this (mm) are left solid. */
const MIN_PIECE = 1.2;

/** A slot (rounded both ends) centred at (x, y), along x or along y. */
function slot(x: number, y: number, length: number, width: number, alongX: boolean): Vec2[] {
  const r = width / 2;
  const half = length / 2 - r;
  const pts: Vec2[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = -Math.PI / 2 + (Math.PI * i) / 8;
    pts.push([half + r * Math.cos(a), r * Math.sin(a)]);
  }
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI / 2 + (Math.PI * i) / 8;
    pts.push([-half + r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts.map(([u, v]) => (alongX ? [x + u, y + v] : [x - v, y + u]) as Vec2);
}

/**
 * Hole outlines in the floor (model x/y). Every compartment gets its own
 * centred pattern: honeycomb and diamonds run on to its edge and are cut
 * there, slots are whole and stretched to fill it, Voronoi fills it; holes keep one floor web to the wall, to the divider
 * strips and to each other.
 */
export function floorHoles(wasm: Wasm, scope: Scope, p: BasketParams, quality: Quality): Vec2[][] {
  if (p.floorPattern === 'closed') return [];
  const size = p.floorHoleSize;
  const web = p.floorWebWidth;
  const holes: Vec2[][] = [];
  floorCompartments(wasm, scope, p, quality).forEach((comp, k) => {
    const b = boundsOf(comp);
    const region = scope.keep(wasm.CrossSection.ofPolygons([comp]));
    // Holes run on to the compartment edge and are cut there (one web to the
    // wall, like on the walls); pieces too thin to print stay solid.
    const cut = (h: Vec2[]) => {
      if (insideConvex(h, comp)) {
        holes.push(h);
        return;
      }
      const piece = scope.keep(scope.keep(wasm.CrossSection.ofPolygons([h])).intersect(region));
      if (piece.isEmpty() || scope.keep(piece.offset(-MIN_PIECE / 2, 'Miter')).isEmpty()) return;
      for (const poly of piece.toPolygons())
        if (poly.length >= 3) holes.push(poly.map(([x, y]) => [x, y] as Vec2));
    };
    if (p.floorPattern === 'hex') {
      const ps = size + web;
      for (const [x, y] of staggered(b, ps, (ps * Math.sqrt(3)) / 2)) cut(hexagon(size, x, y));
    } else if (p.floorPattern === 'diamond') {
      const h = size * DIAMOND_ASPECT;
      const { ps, pz } = diamondPitch(size, h, web);
      for (const [x, y] of staggered(b, ps, pz / 2))
        cut([
          [x, y - h / 2],
          [x + size / 2, y],
          [x, y + h / 2],
          [x - size / 2, y],
        ]);
    } else if (p.floorPattern === 'slots') {
      // slots run along the compartment's longer side and fill it: their
      // length stretches to fit, across they spread to the edges
      const alongX = b.x1 - b.x0 >= b.y1 - b.y0;
      const long = Math.max(b.x1 - b.x0, b.y1 - b.y0);
      const short = Math.min(b.x1 - b.x0, b.y1 - b.y0);
      const fitA = Math.max(1, Math.round((long + web) / (SLOT_LENGTH * size + web)));
      const len = Math.max(size, (long + web) / fitA - web);
      const pA = len + web;
      const fitC = Math.max(1, Math.floor((short + web) / (size + web)));
      const pC = fitC > 1 ? (short - size) / (fitC - 1) : 0;
      const cx = (b.x0 + b.x1) / 2;
      const cy = (b.y0 + b.y1) / 2;
      for (let i = 0; i < fitA; i++)
        for (let j = 0; j < fitC; j++) {
          const a = (i - (fitA - 1) / 2) * pA;
          const c = (j - (fitC - 1) / 2) * pC;
          // a slot cut by a rounded corner gets shorter from its outer end
          for (let l = len; l >= 2 * size; l -= size / 2) {
            const shift = ((a === 0 ? 0 : Math.sign(a)) * -(len - l)) / 2;
            const h = alongX
              ? slot(cx + a + shift, cy + c, l, size, true)
              : slot(cx + c, cy + a + shift, l, size, false);
            if (insideConvex(h, comp)) {
              holes.push(h);
              break;
            }
          }
        }
    } else if (p.floorPattern === 'voronoi') {
      const cell = Math.max(6, size + web);
      const round = Math.min(1.5, 0.12 * cell);
      const sites = voronoiSites(b, cell, p.voronoi.seed + 211 + k);
      for (const c of voronoiCells(b, sites, cell)) {
        const cs = scope.keep(scope.keep(wasm.CrossSection.ofPolygons([c])).intersect(region));
        const inset = scope.keep(cs.offset(-web / 2 - round, 'Miter'));
        for (const poly of scope.keep(inset.offset(round, 'Round', 2, 16)).toPolygons())
          if (poly.length >= 3) holes.push(poly.map(([x, y]) => [x, y] as Vec2));
      }
    }
  });
  return holes;
}

/** One cutter through the floor plate for all floor holes (none for a closed floor). */
export function floorCutter(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): Manifold[] {
  const holes = floorHoles(wasm, scope, p, quality);
  if (holes.length === 0) return [];
  const shape = scope.keep(wasm.CrossSection.ofPolygons(holes));
  return [scope.keep(scope.keep(shape.extrude(p.floor + 2)).translate([0, 0, -1]))];
}
