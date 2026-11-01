import type { Manifold } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import type { BasketParams } from './params';
import { roundedRect, type Vec2 } from './shapes';

/**
 * Stacking interface shared by all wall styles, so baskets with the same
 * footprint stack on each other whatever their wall looks like:
 * - the lowest FOOT_HEIGHT mm are drawn in by footInset() all round,
 * - above it a 45° chamfer leads out to the full outline,
 * - no basket's wall reaches further than STACK_INSET in from the outline at
 *   its top edge, so every foot fits into every opening.
 * The chamfer rests on the inner top edge of the basket below.
 */
export const FOOT_HEIGHT = 3;
export const STACK_INSET = 4;
/**
 * Corner radius minimum for every stackable basket. It covers the largest
 * style minimum (weave: wall span ≤ STACK_INSET → span + 1 ≤ 5, at least 10),
 * so the outline – and with it the fit – never depends on the wall style.
 */
export const STACK_MIN_RADIUS = 10;
/** Solid wall of the socket next to the foot (mm). */
const SOCKET_WALL = 1.6;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

export const footInset = (p: BasketParams) => STACK_INSET + p.stackClearance;
/** Top of the solid socket (end of the chamfer). */
export const socketTop = (p: BasketParams) => FOOT_HEIGHT + footInset(p);
/** Where wall patterns may start (above the floor or the socket). */
export const patternBase = (p: BasketParams) => (p.stackable ? socketTop(p) : p.floor);
/** Lowest edge of holes: above the bottom border band, and above the socket. */
export const holesBottom = (p: BasketParams) =>
  p.stackable ? Math.max(p.floor + p.borderBand, socketTop(p) + 1) : p.floor + p.borderBand;

/** How far the wall reaches in from the outer outline at the top edge. */
export function wallIntrusion(p: BasketParams): number {
  switch (p.wallStyle) {
    case 'expanded':
      return p.wall + 2 * p.expanded.twist;
    case 'weave': {
      const r = p.weave.stakeDiameter / 2;
      return 2 * Math.max(r, r - 0.325 + p.weave.materialThickness / 2);
    }
    default:
      return p.wall;
  }
}

/** Stack pitch: how much higher the next basket stands (chamfer on inner edge). */
export function stackPitch(lower: BasketParams, upper: BasketParams): number {
  return lower.height - FOOT_HEIGHT - (footInset(upper) - wallIntrusion(lower));
}

function contour(p: BasketParams, inset: number, quality: Quality) {
  return roundedRect(
    p.width - 2 * inset,
    p.depth - 2 * inset,
    Math.max(0, p.cornerRadius - inset),
    CORNER_SEGMENTS[quality],
  );
}

const lift = (pts: Vec2[], z: number): [number, number, number][] => pts.map(([x, y]) => [x, y, z]);

/** Outer shape of a stackable basket: drawn-in foot, 45° chamfer, full outline. */
export function stackEnvelope(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): Manifold {
  const { Manifold, CrossSection } = wasm;
  const inset = footInset(p);
  const foot = contour(p, inset, quality);
  const full = contour(p, 0, quality);
  const footSolid = scope.keep(scope.keep(CrossSection.ofPolygons([foot])).extrude(FOOT_HEIGHT));
  const chamfer = scope.keep(
    Manifold.hull([...lift(foot, FOOT_HEIGHT), ...lift(full, FOOT_HEIGHT + inset)]),
  );
  const top = socketTop(p);
  const body = scope.keep(
    scope
      .keep(scope.keep(CrossSection.ofPolygons([full])).extrude(p.height - top))
      .translate(0, 0, top),
  );
  return scope.keep(Manifold.union([footSolid, chamfer, body]));
}

/** Solid socket ring (foot + chamfer zone) around a floor plate. */
export function socketSolid(wasm: Wasm, scope: Scope, p: BasketParams, quality: Quality): Manifold {
  const { CrossSection } = wasm;
  const top = socketTop(p);
  const env = stackEnvelope(wasm, scope, p, quality);
  const slab = scope.keep(
    scope.keep(CrossSection.ofPolygons([contour(p, 0, quality)])).extrude(top),
  );
  const cavity = scope.keep(
    scope
      .keep(
        scope
          .keep(CrossSection.ofPolygons([contour(p, footInset(p) + SOCKET_WALL, quality)]))
          .extrude(top + 1),
      )
      .translate(0, 0, p.floor),
  );
  return scope.keep(scope.keep(env.intersect(slab)).subtract(cavity));
}

/** Gives any basket body the shared stacking interface. */
export function withStacking(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  body: Manifold,
): Manifold {
  if (!p.stackable) return body;
  const env = stackEnvelope(wasm, scope, p, quality);
  const merged = scope.keep(wasm.Manifold.union([body, socketSolid(wasm, scope, p, quality)]));
  return scope.keep(merged.intersect(env));
}
