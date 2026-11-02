import type { Manifold, Mat4 } from 'manifold-3d';
import { effectiveDividerTop, jointWidth } from './dividers';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import type { BasketParams } from './params';
import { hexagon } from './patterns/hex';
import { sheetStrands } from './patterns/expanded';
import { printableHole, voronoiCells, voronoiSites } from './patterns/voronoi';
import type { Vec2 } from './shapes';
import { wallIntrusion } from './stacking';

/**
 * One divider seen from its side: u runs along it from the outer edge of
 * the basket (front for dividers across the width, left for dividers across
 * the depth), z up. `stretches` are the u ranges between the walls and the
 * crossing dividers that carry the pattern.
 */
export interface DividerFace {
  axis: 'x' | 'y';
  /** Divider center (mm from the outer left / front edge). */
  pos: number;
  stretches: [number, number][];
  /** Pattern zone in z (between a bottom and a top band). */
  z0: number;
  z1: number;
  /** Local (u, z, across) → world. */
  frame: Mat4;
  /** Direction of u and the face's start on the outer edge (world). */
  along: [number, number, number];
  origin: [number, number, number];
}

/** Distance from the outer edge to the inner wall face at `x` mm along a side `size` long. */
function innerFace(p: BasketParams, x: number, size: number): number {
  const r = p.cornerRadius;
  const d = Math.min(x, size - x);
  const bulge = d < r ? r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))) : 0;
  return bulge + wallIntrusion(p);
}

/** Column-major matrix: local X, Y, Z → a, b, e, then move by `to`. */
const frame = (a: number[], b: number[], e: number[], to: number[]): Mat4 => [
  a[0]!,
  a[1]!,
  a[2]!,
  0,
  b[0]!,
  b[1]!,
  b[2]!,
  0,
  e[0]!,
  e[1]!,
  e[2]!,
  0,
  to[0]!,
  to[1]!,
  to[2]!,
  1,
];

/**
 * The faces of all dividers with their pattern stretches: from the inner
 * wall face to the first crossing, between crossings, and to the far wall,
 * each keeping half a joint strip solid at both ends (the same strip width
 * as where a divider meets the outer wall).
 */
export function dividerFaces(p: BasketParams): DividerFace[] {
  const half = jointWidth(p) / 2;
  const z0 = p.floor + p.borderBand;
  const z1 = effectiveDividerTop(p) - p.borderBand;
  const W = p.width;
  const D = p.depth;
  const faces: DividerFace[] = [];
  const stretches = (length: number, start: number, end: number, crossings: number[]) => {
    const edges = [start, ...crossings.flatMap((c) => [c - half, c + half]), length - end];
    const out: [number, number][] = [];
    for (let i = 0; i < edges.length; i += 2) {
      const a = edges[i]! + (i === 0 ? half : 0);
      const b = edges[i + 1]! - (i + 1 === edges.length - 1 ? half : 0);
      if (b - a > 1) out.push([a, b]);
    }
    return out;
  };
  for (const x of p.dividersX)
    faces.push({
      axis: 'x',
      pos: x,
      stretches: stretches(D, innerFace(p, x, W), innerFace(p, x, W), p.dividersY),
      z0,
      z1,
      // u along +y from the front edge, normal +x
      frame: frame([0, 1, 0], [0, 0, 1], [1, 0, 0], [-W / 2 + x, -D / 2, 0]),
      along: [0, 1, 0],
      origin: [-W / 2 + x, -D / 2, 0],
    });
  for (const y of p.dividersY)
    faces.push({
      axis: 'y',
      pos: y,
      stretches: stretches(W, innerFace(p, y, D), innerFace(p, y, D), p.dividersX),
      z0,
      z1,
      // u along +x from the left edge, normal −y (keeps the frame right-handed)
      frame: frame([1, 0, 0], [0, 0, 1], [0, -1, 0], [-W / 2, -D / 2 + y, 0]),
      along: [1, 0, 0],
      origin: [-W / 2, -D / 2 + y, 0],
    });
  return faces;
}

/** Hexagon rows (centers) for a pattern zone, like the wall's honeycomb. */
function hexRows(p: BasketParams, z0: number, z1: number, px: number): number[] {
  const pz = (px * Math.sqrt(3)) / 2;
  const tall = (2 * p.holeSize) / Math.sqrt(3);
  const m = Math.floor((z1 - z0 - tall) / pz) + 1;
  if (m < 1) return [];
  const first = z0 + tall / 2 + (z1 - z0 - tall - (m - 1) * pz) / 2;
  return Array.from({ length: m }, (_, j) => first + j * pz);
}

/**
 * Holes of one divider face (local u, z): whole hexagons per stretch,
 * centred, n per row and n − 1 in the shifted rows; or a Voronoi field per
 * stretch whose cells keep one web to the stretch edges.
 */
export function dividerHoles(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  face: DividerFace,
  index: number,
): Vec2[][] {
  const holes: Vec2[][] = [];
  if (face.z1 <= face.z0) return holes;
  if (p.wallStyle === 'hex') {
    const px = p.holeSize + p.webWidth;
    const rows = hexRows(p, face.z0, face.z1, px);
    for (const [a, b] of face.stretches) {
      const n = Math.floor((b - a + p.webWidth) / px);
      const mid = (a + b) / 2;
      rows.forEach((z, j) => {
        const m = j % 2 === 0 ? n : n - 1;
        for (let i = 0; i < m; i++)
          holes.push(printableHole(hexagon(p.holeSize, mid + (i - (m - 1) / 2) * px, z)));
      });
    }
  } else if (p.wallStyle === 'voronoi') {
    const size = p.voronoi.cellSize;
    const web = p.webWidth;
    const round = Math.min(1.5, 0.12 * size);
    face.stretches.forEach(([a, b], k) => {
      // cells shrink by half a web: the field reaches half a web past the edges
      const domain = {
        x0: a - web / 2,
        y0: face.z0 - web / 2,
        x1: b + web / 2,
        y1: face.z1 + web / 2,
      };
      if (domain.x1 - domain.x0 < size / 2 || domain.y1 - domain.y0 < size / 2) return;
      const sites = voronoiSites(domain, size, p.voronoi.seed + 101 * (index + 1) + k);
      for (const cell of voronoiCells(domain, sites, size)) {
        const cs = scope.keep(wasm.CrossSection.ofPolygons([cell]));
        const inset = scope.keep(cs.offset(-web / 2 - round, 'Miter'));
        const shrunk = scope.keep(inset.offset(round, 'Round', 2, 16));
        for (const poly of shrunk.toPolygons()) {
          if (poly.length < 3) continue;
          const hole = printableHole(poly.map(([x, y]) => [x, y] as Vec2));
          if (hole.length >= 3) holes.push(hole);
        }
      }
    });
  }
  return holes;
}

/** Cutters for the holes in all dividers (honeycomb and Voronoi). */
export function dividerHoleCutters(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  if (p.wallStyle !== 'hex' && p.wallStyle !== 'voronoi') return [];
  const t = wallIntrusion(p);
  return dividerFaces(p).flatMap((face, i) => {
    const holes = dividerHoles(wasm, scope, p, face, i);
    if (holes.length === 0) return [];
    const shape = scope.keep(wasm.CrossSection.ofPolygons(holes));
    const prism = scope.keep(scope.keep(shape.extrude(t + 2)).translate([0, 0, -(t / 2 + 1)]));
    return [scope.keep(prism.transform(face.frame))];
  });
}

/**
 * Expanded-metal dividers: a window per stretch is cut out of the plain
 * divider (leaving the frame: bands at bottom and top, strips at the ends
 * and crossings) and filled with a flat expanded-metal sheet.
 */
export function expandedDividerParts(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): { windows: Manifold[]; strands: Manifold[] } {
  const windows: Manifold[] = [];
  const strands: Manifold[] = [];
  if (p.wallStyle !== 'expanded') return { windows, strands };
  const t = wallIntrusion(p);
  const half = jointWidth(p) / 2;
  for (const face of dividerFaces(p)) {
    if (face.z1 - face.z0 < 1) continue;
    for (const [a, b] of face.stretches)
      windows.push(
        scope.keep(
          wasm.Manifold.cube([b - a, face.z1 - face.z0, t + 2])
            .translate([a, face.z0, -(t / 2 + 1)])
            .transform(face.frame),
        ),
      );
    // sheet coordinates (u, across, z) → world: u along, across = ez × along
    const [ax, ay] = face.along;
    const toWorld = frame([ax, ay, 0], [-ay, ax, 0], [0, 0, 1], face.origin);
    for (const m of sheetStrands(wasm, p, face.stretches, face.z0, face.z1, half, quality))
      strands.push(scope.keep(scope.keep(m).transform(toWorld)));
  }
  return { windows, strands };
}
