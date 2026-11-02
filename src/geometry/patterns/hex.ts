import type { Manifold } from 'manifold-3d';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import type { Vec2 } from '../shapes';
import { RoundedRectPath } from '../weave/outline';
import { printableHole } from './voronoi';
import { clipHoles } from '../handles';
import { junctionArcs, wallSegments } from '../junctions';
import { holesBottom } from '../stacking';
import { bentCutter } from './wallcut';

/** Pointy-top regular hexagon, `width` across the flats, centered at (cx, cy). */
export function hexagon(width: number, cx = 0, cy = 0): Vec2[] {
  const r = width / Math.sqrt(3); // circumradius
  return Array.from({ length: 6 }, (_, k) => {
    const a = ((30 + 60 * k) * Math.PI) / 180;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Vec2;
  });
}

export interface HexLayout {
  path: RoundedRectPath;
  /** Holes per row (fits the perimeter exactly). */
  count: number;
  px: number;
  pz: number;
  rows: number[];
}

/**
 * Honeycomb on the unrolled outer wall: rows of pointy-top hexagons, every
 * other row shifted by half a pitch, periodic round the perimeter.
 */
export function hexLayout(p: BasketParams): HexLayout {
  const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
  const w = p.holeSize;
  const count = Math.max(3, Math.floor(path.length / (w + p.webWidth)));
  const px = path.length / count; // ≥ w + web → webs never thinner
  const pz = (px * Math.sqrt(3)) / 2;
  const tall = (2 * w) / Math.sqrt(3);
  const y0 = holesBottom(p);
  const y1 = p.height - p.borderBand;
  const rows: number[] = [];
  const m = Math.floor((y1 - y0 - tall) / pz) + 1;
  if (m >= 1) {
    const first = y0 + (y1 - y0 - (m - 1) * pz) / 2;
    for (let j = 0; j < m; j++) rows.push(first + j * pz);
  }
  return { path, count, px, pz, rows };
}

/**
 * Plain hexagons in wall coordinates (x = arc length on the outer wall).
 * The honeycomb runs round the basket. With dividers its pitch is stretched
 * slightly per wall stretch so that a hexagon sits centred on every divider
 * joint: the stretches are symmetric, and above low dividers the honeycomb
 * runs on across the joints (rows stay at the same height everywhere).
 * clipHoles then trims the cells at the joints below the divider top.
 */
function hexShapes(p: BasketParams): Vec2[][] {
  const l = hexLayout(p);
  const shapes: Vec2[][] = [];
  const arcs = junctionArcs(p, l.path);
  const stretches =
    arcs.length === 0
      ? [{ a: 0, n: l.count, px: l.px }]
      : wallSegments(arcs, l.path.length).map(({ a, b }) => {
          const n = Math.max(1, Math.floor((b - a) / l.px)); // never closer than the plain pitch
          return { a, n, px: (b - a) / n };
        });
  for (const { a, n, px } of stretches)
    l.rows.forEach((y, j) => {
      for (let i = 0; i < n; i++) shapes.push(hexagon(p.holeSize, a + (i + (j % 2) * 0.5) * px, y));
    });
  return shapes;
}

/** All hexagon holes in wall coordinates, made printable (no handle cut-outs). */
export function hexHoles(p: BasketParams): Vec2[][] {
  return hexShapes(p).map(printableHole);
}

/** One cutter body for all hexagons, bent onto the wall along the outer outline. */
export function hexCutters(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
  // A handle cut-out trims the hexagons it reaches; every piece is made printable.
  const holes = clipHoles(wasm, scope, p, path, hexShapes(p), printableHole);
  if (holes.length === 0) return [];
  return [scope.keep(bentCutter(wasm, holes, path, 1, -(p.wall + 1)))];
}
