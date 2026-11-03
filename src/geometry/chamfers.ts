import type { Manifold, Mat4 } from 'manifold-3d';
import type { Quality } from './basket';
import { effectiveDividerTop } from './dividers';
import type { Scope, Wasm } from './manifold';
import type { BasketParams } from './params';
import { roundedRect, type Vec2 } from './shapes';
import { footInset, topChamfer, wallIntrusion } from './stacking';

/** 45° chamfer round the bottom edge: against elephant's foot, eases stacking (mm). */
export const BOTTOM_CHAMFER = 1;
/** How far the rim cutter reaches into the opening (mm). */
const RING_CLEAR = 0.2;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

/** Outline drawn in by `inset` (negative: pushed out), corner radius following. */
function contour(p: BasketParams, inset: number, quality: Quality): Vec2[] {
  return roundedRect(
    p.width - 2 * inset,
    p.depth - 2 * inset,
    Math.max(0, p.cornerRadius - inset),
    CORNER_SEGMENTS[quality],
  );
}

const lift = (pts: Vec2[], z: number): [number, number, number][] => pts.map(([x, y]) => [x, y, z]);

/** Column-major matrix: local X, Y, Z → a, b, e, then move by `to`. */
type V3 = [number, number, number];
const frame = (a: V3, b: V3, e: V3, to: V3): Mat4 => [...a, 0, ...b, 0, ...e, 0, ...to, 1];

/**
 * Everything that stays: the bottom edge drawn in at 45° (on the foot for
 * stackable baskets) and the outer top edge cut at 45°. Two convex hulls;
 * their 45° planes pass through the chamfer lines, the hulls themselves
 * reach past every face of the body, so no faces coincide.
 */
function keepVolume(wasm: Wasm, scope: Scope, p: BasketParams, quality: Quality): Manifold {
  const { Manifold } = wasm;
  const b = p.stackable ? footInset(p) : 0;
  const c = BOTTOM_CHAMFER;
  const ct = topChamfer(p);
  const h = p.height;
  const bottom = Manifold.hull([
    ...lift(contour(p, b + c, quality), 0),
    ...lift(contour(p, b - c, quality), 2 * c),
    ...lift(contour(p, b - c, quality), 2 * c + 1),
  ]);
  const top = Manifold.hull([
    ...lift(contour(p, -1, quality), 2 * c),
    ...lift(contour(p, -1, quality), h - ct - 1),
    ...lift(contour(p, ct, quality), h),
  ]);
  return scope.keep(scope.keep(bottom).add(scope.keep(top)));
}

/** Straight slabs of all dividers (thickness t, up to `top`), split by direction. */
function slabs(wasm: Wasm, p: BasketParams, t: number, top: number) {
  const { Manifold } = wasm;
  const W = p.width;
  const D = p.depth;
  return {
    x: p.dividersX.map((x) =>
      Manifold.cube([t, D + 2, top]).translate([-W / 2 + x - t / 2, -D / 2 - 1, 0]),
    ),
    y: p.dividersY.map((y) =>
      Manifold.cube([W + 2, t, top]).translate([-W / 2 - 1, -D / 2 + y - t / 2, 0]),
    ),
  };
}

/**
 * Cutters for the inner top edge of the rim and the top edges of the
 * dividers, all 45° and topChamfer(p) wide.
 * - Rim: a ring between the inner wall face and a cone widening upwards;
 *   where a divider reaches the top it stays solid.
 * - Dividers: a wedge along both top edges, inside the opening only and not
 *   through crossing dividers (no notches in their tops).
 * Woven dividers keep their own rim profile.
 */
function edgeCutters(wasm: Wasm, scope: Scope, p: BasketParams, quality: Quality): Manifold[] {
  const { Manifold, CrossSection } = wasm;
  const i = wallIntrusion(p);
  const c = topChamfer(p);
  const h = p.height;
  const opening = scope.keep(
    scope.keep(CrossSection.ofPolygons([contour(p, i, quality)])).extrude(h + 2),
  );
  const cone = scope.keep(
    Manifold.hull([
      ...lift(contour(p, i + 0.5, quality), h - c - 0.5),
      ...lift(contour(p, i - c - 1, quality), h + 1),
    ]),
  );
  // The ring's inner face stands a little inside the opening: on the wall's
  // own inner face the boolean would leave zero-volume shards.
  const clear = scope.keep(
    scope.keep(CrossSection.ofPolygons([contour(p, i + RING_CLEAR, quality)])).extrude(h + 2),
  );
  let ring = scope.keep(cone.subtract(clear));
  const top = effectiveDividerTop(p);
  const all = slabs(wasm, p, i, top);
  const slabX = all.x.map((m) => scope.keep(m));
  const slabY = all.y.map((m) => scope.keep(m));
  if (slabX.length + slabY.length > 0)
    ring = scope.keep(ring.subtract(scope.keep(Manifold.union([...slabX, ...slabY]))));
  const cutters = [ring];
  if (p.wallStyle === 'weave' && p.dividerStyle === 'pattern') return cutters;

  // Wedge profiles (u across the divider, v = z), 45° through the chamfer
  // line, reaching 1 mm past the side face and the top.
  const wedges = (center: number): Vec2[][] => {
    const s = center + i / 2;
    const n = center - i / 2;
    return [
      [
        [s - c - 1, top + 1],
        [s + 1, top - c - 1],
        [s + 1, top + 1],
      ],
      [
        [n + c + 1, top + 1],
        [n - 1, top + 1],
        [n - 1, top - c - 1],
      ],
    ];
  };
  const W = p.width;
  const D = p.depth;
  const along = (
    centers: number[],
    length: number,
    toWorld: Mat4,
    crossing: Manifold[],
  ): Manifold | undefined => {
    if (centers.length === 0) return undefined;
    const shape = scope.keep(CrossSection.ofPolygons(centers.flatMap(wedges)));
    let m = scope.keep(scope.keep(shape.extrude(length)).transform(toWorld));
    m = scope.keep(m.intersect(opening));
    if (crossing.length > 0) m = scope.keep(m.subtract(scope.keep(Manifold.union(crossing))));
    return m;
  };
  // dividers across the width run along y: u = x, v = z, extruded along −y
  const xs = along(
    p.dividersX.map((x) => -W / 2 + x),
    D + 2,
    frame([1, 0, 0], [0, 0, 1], [0, -1, 0], [0, D / 2 + 1, 0]),
    slabY,
  );
  // dividers across the depth run along x: u = y, v = z, extruded along +x
  const ys = along(
    p.dividersY.map((y) => -D / 2 + y),
    W + 2,
    frame([0, 1, 0], [0, 0, 1], [1, 0, 0], [-W / 2 - 1, 0, 0]),
    slabX,
  );
  for (const m of [xs, ys]) if (m) cutters.push(m);
  return cutters;
}

/** Chamfers every basket's bottom edge and the top edges of rim and dividers. */
export function withChamfers(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  body: Manifold,
): Manifold {
  const kept = scope.keep(body.intersect(keepVolume(wasm, scope, p, quality)));
  const cutters = edgeCutters(wasm, scope, p, quality);
  return scope.keep(kept.subtract(scope.keep(wasm.Manifold.union(cutters))));
}
