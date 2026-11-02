import type { Manifold } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import type { BasketParams } from './params';
import { roundedRect } from './shapes';
import { stackPitch, wallIntrusion } from './stacking';

/** Smallest compartment (clear width between two walls, mm). */
export const MIN_COMPARTMENT = 10;
/** Gap between the divider tops and the foot of a basket stacked on top (mm). */
const STACK_GAP = 0.5;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
/** How far a weave divider reaches past the wall's center line into the stake (mm). */
const WEAVE_REACH = 0.6;

/**
 * Highest possible divider top: just below the foot of a basket of the same
 * kind stacked on top, or the full height for baskets that do not stack.
 */
export function dividerTop(p: BasketParams): number {
  return p.stackable ? stackPitch(p, p) - STACK_GAP : p.height;
}

/**
 * Width of the solid strip in a patterned wall where a divider meets it:
 * twice the wall thickness, at least the divider itself.
 */
export const jointWidth = (p: BasketParams) => Math.max(wallIntrusion(p), 2 * p.wall);

/** The divider top actually used (dividerHeight 0 = as high as possible). */
export const effectiveDividerTop = (p: BasketParams) =>
  p.dividerHeight > 0 ? Math.min(p.dividerHeight, dividerTop(p)) : dividerTop(p);

/**
 * Keeps divider positions (centers, mm from the outer left/front edge) in
 * order and every compartment at least MIN_COMPARTMENT wide. Positions that
 * cannot be kept are dropped. Returns whether anything changed.
 */
export function fitDividers(
  positions: number[],
  size: number,
  thickness: number,
): { positions: number[]; changed: boolean } {
  const sorted = positions.filter(Number.isFinite).sort((a, b) => a - b);
  const step = MIN_COMPARTMENT + thickness; // center to center, and wall face to center
  const out: number[] = [];
  let min = thickness + MIN_COMPARTMENT + thickness / 2;
  const max = size - thickness - MIN_COMPARTMENT - thickness / 2;
  for (const raw of sorted) {
    const x = Math.round(raw * 10) / 10;
    if (x < min - 1e-9 || x > max + 1e-9) continue;
    out.push(x);
    min = x + step;
  }
  const changed = out.length !== positions.length || out.some((x, i) => x !== positions[i]);
  return { positions: out, changed };
}

/**
 * Straight, continuous dividers from wall to wall, as thick as the wall,
 * standing on the floor plate. They reach into the wall to the outer
 * outline (weave: to the stake at the joint), so they join every style.
 */
export function dividerSolids(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): Manifold[] {
  if (p.dividersX.length === 0 && p.dividersY.length === 0) return [];
  const { Manifold, CrossSection } = wasm;
  const t = wallIntrusion(p);
  const top = effectiveDividerTop(p);
  const W = p.width;
  const D = p.depth;
  const walls = [
    ...p.dividersX.map((x) =>
      Manifold.cube([t, D + 2, top]).translate([-W / 2 + x - t / 2, -D / 2 - 1, 0]),
    ),
    ...p.dividersY.map((y) =>
      Manifold.cube([W + 2, t, top]).translate([-W / 2 - 1, -D / 2 + y - t / 2, 0]),
    ),
  ].map((m) => scope.keep(m));
  // Into the wall up to the outline; in a weave into the stake that stands
  // at every divider joint, a little past the wall's center line so the
  // first line of the top rim (on that center line) rests on it fully.
  const inset = p.wallStyle === 'weave' ? t / 2 - WEAVE_REACH : 0;
  const contour = roundedRect(
    W - 2 * inset,
    D - 2 * inset,
    Math.max(0, p.cornerRadius - inset),
    CORNER_SEGMENTS[quality],
  );
  const outline = scope.keep(scope.keep(CrossSection.ofPolygons([contour])).extrude(top));
  return [scope.keep(scope.keep(Manifold.union(walls)).intersect(outline))];
}
