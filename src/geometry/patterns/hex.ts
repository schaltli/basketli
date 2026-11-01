import type { Manifold } from 'manifold-3d';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import type { Vec2 } from '../shapes';
import { RoundedRectPath } from '../weave/outline';
import { printableHole } from './voronoi';
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

/** All hexagon holes in wall coordinates (x = arc length on the outer wall). */
export function hexHoles(p: BasketParams): Vec2[][] {
  const l = hexLayout(p);
  const holes: Vec2[][] = [];
  l.rows.forEach((y, j) => {
    for (let i = 0; i < l.count; i++)
      holes.push(printableHole(hexagon(p.holeSize, (i + (j % 2) * 0.5) * l.px, y)));
  });
  return holes;
}

/** One cutter body for all hexagons, bent onto the wall along the outer outline. */
export function hexCutters(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const holes = hexHoles(p);
  if (holes.length === 0) return [];
  const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
  return [scope.keep(bentCutter(wasm, holes, path, 1, -(p.wall + 1)))];
}
