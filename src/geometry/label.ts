import type { CrossSection, Manifold, Mat4 } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import {
  labelZone,
  sidesOf,
  TAPE_CLEARANCE,
  TAPE_DEPTH,
  wallSite,
  type BasketParams,
  type Side,
  type WallSite,
} from './params';
import { MAX_BRIDGE } from './printability';
import { roundedRect, type Vec2 } from './shapes';
import { wallIntrusion } from './stacking';
import { FIRST_LINE, LAYER } from './weave/layout';
import type { RoundedRectPath } from './weave/outline';

const ARC_SEGMENTS = 12;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

type LabelSite = WallSite;

/** The walls with a label field, in SIDES order. */
function labelSites(p: BasketParams): LabelSite[] {
  return sidesOf(p.labelSides).map((side) => wallSite(p, side));
}

/** Middle height of the label field on a wall: centred in its zone. */
export const labelCenter = (p: BasketParams, side: Side) => {
  const z = labelZone(p, side);
  return (z.bottom + z.top) / 2;
};

const arc = (cx: number, cz: number, r: number, a0: number, a1: number): Vec2[] =>
  Array.from({ length: ARC_SEGMENTS + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / ARC_SEGMENTS;
    return [cx + r * Math.cos(a), cz + r * Math.sin(a)] as Vec2;
  });

/**
 * Label field seen from outside (u along the wall from its middle, z up):
 * a rounded rectangle. Its lower corners follow the rounding only down to
 * 45° and then run on at 45° to the level bottom, so the field's underside
 * is never flatter than 45° (the level bottom is a bridge in open walls).
 */
export function labelOutline(p: BasketParams, side: Side): Vec2[] {
  const w = p.labelWidth / 2;
  const h = p.labelHeight / 2;
  const zc = labelCenter(p, side);
  const r = Math.min(p.labelRadius, w, h);
  const PI = Math.PI;
  const bot = zc - h;
  const top = zc + h;
  if (r <= 0)
    return [
      [-w, bot],
      [w, bot],
      [w, top],
      [-w, top],
    ];
  // the 45° tangent from the arc (at 45°) reaches the bottom this far from the middle
  const foot = w - r * (2 - Math.SQRT2);
  return dedupe([
    [-foot, bot],
    [foot, bot],
    ...arc(w - r, bot + r, r, (7 * PI) / 4, 2 * PI),
    ...arc(w - r, top - r, r, 0, PI / 2),
    ...arc(-w + r, top - r, r, PI / 2, PI),
    ...arc(-w + r, bot + r, r, PI, (5 * PI) / 4),
  ]);
}

function dedupe(pts: Vec2[]): Vec2[] {
  return pts.filter((q, i) => {
    const prev = pts[(i + pts.length - 1) % pts.length]!;
    return Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 1e-9;
  });
}

/** Label fields in wall coordinates (x = arc length on the outer wall, y = height). */
export function labelZonesOnWall(p: BasketParams, path: RoundedRectPath): Vec2[][] {
  return labelSites(p).map((site) => {
    const sc = site.s(path.length);
    return labelOutline(p, site.side).map(([u, z]) => [sc + u, z] as Vec2);
  });
}

/** Column-major matrix mapping local X, Y, Z axes to a, b, e, then moving by `to`. */
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

/** Maps wall-plane coordinates (u, z, offset along the outward normal) onto a label wall. */
const onWall = ({ n, t, c }: LabelSite): Mat4 =>
  frame([t[0], t[1], 0], [0, 0, 1], [n[0], n[1], 0], [c[0], c[1], 0]);

/** The plate's first line ends this far inside its outermost supports (mm). */
const INTO_SUPPORT = 0.3;

/** The polygon counter-clockwise (positive area). */
const ccw = (poly: Vec2[]): Vec2[] => {
  const twice = poly.reduce((acc, q, i) => {
    const r = poly[(i + 1) % poly.length]!;
    return acc + q[0] * r[1] - r[0] * q[1];
  }, 0);
  return twice < 0 ? [...poly].reverse() : poly;
};

/** World XY of wall-plane coordinates (u along the wall, e along the outward normal). */
const toWorld = ({ n, t, c }: LabelSite, u: number, e: number): Vec2 => [
  c[0] + u * t[0] + e * n[0],
  c[1] + u * t[1] + e * n[1],
];

/**
 * Where the plate's level bottom ends on each side. Its first line runs in
 * the middle of the wall and bridges from support to support; it must end
 * inside a support, not hang past the last one. The wall below (`below`,
 * a slice just under the plate) is scanned along that line, and each end
 * moves to the nearer support: inwards (the corner gets a larger 45°
 * chamfer) or outwards (a small 45° nose beside the field).
 */
function bottomEnds(
  scope: Scope,
  wasm: Wasm,
  p: BasketParams,
  site: LabelSite,
  below: CrossSection,
  foot: number,
): { left: number; right: number } {
  const T = wallIntrusion(p);
  const e0 = -T / 2 - FIRST_LINE / 2;
  const e1 = -T / 2 + FIRST_LINE / 2;
  const far = p.labelWidth / 2 + MAX_BRIDGE;
  const strip = scope.keep(
    wasm.CrossSection.ofPolygons([
      ccw([
        toWorld(site, -far, e0),
        toWorld(site, far, e0),
        toWorld(site, far, e1),
        toWorld(site, -far, e1),
      ]),
    ]),
  );
  const u = (q: Vec2) => (q[0] - site.c[0]) * site.t[0] + (q[1] - site.c[1]) * site.t[1];
  const spans = scope
    .keep(below.intersect(strip))
    .toPolygons()
    .map((poly): [number, number] => {
      const us = poly.map((q) => u([q[0], q[1]]));
      return [Math.min(...us), Math.max(...us)];
    })
    .filter(([a, b]) => b - a > 0.05);
  const end = (f: number, sign: number): number => {
    // in the mirrored frame (sign · u), the end is at +f
    const iv: [number, number][] = spans
      .map(([a, b]): [number, number] => (sign > 0 ? [a, b] : [-b, -a]))
      .sort((x, y) => x[0] - y[0]);
    if (iv.some(([a, b]) => a <= f && f <= b)) return f;
    const inner = iv.filter(([, b]) => b < f).at(-1);
    const outer = iv.find(([a]) => a > f);
    const inEnd = inner && Math.max((inner[0] + inner[1]) / 2, inner[1] - INTO_SUPPORT);
    const outEnd = outer && Math.min((outer[0] + outer[1]) / 2, outer[0] + INTO_SUPPORT);
    if (inEnd === undefined) return outEnd ?? f;
    if (outEnd === undefined) return inEnd;
    return f - inEnd <= outEnd - f ? inEnd : outEnd;
  };
  return { left: end(foot, -1), right: end(foot, 1) };
}

/**
 * Solid label plate over the full wall thickness, for open walls (expanded
 * metal, weave, braid). Like a handle band its first layer is one line in
 * the middle of the wall, bridging from support to support (bottomEnds), and
 * it grows 45° to the full thickness above, so its underside needs no
 * support. `wall` is the basket so far: it holds the supports.
 */
export function labelPlates(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  wall: Manifold,
): Manifold[] {
  return labelSites(p).map((site) => labelPlate(wasm, scope, p, quality, wall, site));
}

function labelPlate(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  wall: Manifold,
  site: LabelSite,
): Manifold {
  const T = wallIntrusion(p);
  const steps = Math.max(0, Math.ceil((T - FIRST_LINE) / (2 * LAYER)));
  const { CrossSection } = wasm;
  const w = p.labelWidth / 2;
  const bot = labelCenter(p, site.side) - p.labelHeight / 2;
  const r = Math.min(p.labelRadius, w, p.labelHeight / 2);
  const foot = w - r * (2 - Math.SQRT2);
  const below = scope.keep(wall.slice(bot - LAYER / 2));
  const ends = bottomEnds(scope, wasm, p, site, below, foot);
  let shape = scope.keep(CrossSection.ofPolygons([labelOutline(p, site.side)]));
  const H = p.labelHeight + 2 * w;
  for (const [sign, e] of [
    [1, ends.right],
    [-1, ends.left],
  ] as const) {
    const m = (pts: Vec2[]) => pts.map(([x, z]) => [sign * x, z] as Vec2);
    if (e < foot - 1e-6) {
      // cut the corner at 45° from the new end
      const keep = m([
        [-w - 1, bot - 1],
        [e - 1, bot - 1],
        [e + H, bot + H],
        [-w - 1, bot + H],
      ]);
      const cs = scope.keep(CrossSection.ofPolygons([ccw(keep)]));
      shape = scope.keep(shape.intersect(cs));
    } else if (e > foot + 1e-6) {
      // a nose out to the support, its top falling back at 45° into the field
      const x0 = w - r;
      const rise = Math.min(e - x0, p.labelHeight);
      const nose = m([
        [x0, bot],
        [e, bot],
        [e - rise, bot + rise],
        [x0, bot + rise],
      ]);
      const cs = scope.keep(CrossSection.ofPolygons([ccw(nose)]));
      shape = scope.keep(shape.add(cs));
    }
  }
  const layers = Array.from({ length: steps + 1 }, (_, k) => {
    const thick = Math.min(T, FIRST_LINE + 2 * k * LAYER);
    const raised = k === 0 ? shape : scope.keep(shape.translate([0, k * LAYER]));
    return scope.keep(scope.keep(raised.extrude(thick)).translate([0, 0, -T / 2 - thick / 2]));
  });
  const plate = scope.keep(wasm.Manifold.union(layers));
  // flush with the outer outline (the wall may reach past it nowhere)
  const outline = scope.keep(
    scope
      .keep(
        CrossSection.ofPolygons([
          roundedRect(p.width, p.depth, p.cornerRadius, CORNER_SEGMENTS[quality]),
        ]),
      )
      .extrude(p.height),
  );
  return scope.keep(scope.keep(plate.transform(onWall(site))).intersect(outline));
}

/** Tape recess in wall coordinates (u, z): its rounded outline, centred on the field. */
export function tapeRecess(
  p: BasketParams,
  side: Side,
): { w: number; h: number; r: number; zc: number } {
  const h = Number(p.labelTape) + TAPE_CLEARANCE;
  const margin = Math.max(TAPE_CLEARANCE * 2, (p.labelHeight - h) / 2);
  const w = Math.max(h, p.labelWidth - 2 * margin);
  const r = Math.min(h / 2, Math.max(0.5, p.labelRadius - margin));
  return { w, h, r, zc: labelCenter(p, side) };
}

/**
 * Cutter for the recess the label-maker tape is laid into: TAPE_DEPTH deep
 * below the outer face, so the tape's edges cannot be caught and peeled.
 * Its top edge slopes out at 45°, so the recess has no overhang.
 */
export function tapeCutters(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  if (p.labelTape === 'none') return [];
  return labelSites(p).map((site) => tapeCutter(wasm, scope, p, site));
}

function tapeCutter(wasm: Wasm, scope: Scope, p: BasketParams, site: LabelSite): Manifold {
  const { w, h, r, zc } = tapeRecess(p, site.side);
  const OUT = 1;
  const slab = (top: number, e: number) => {
    const height = h + top;
    const cs = scope.keep(wasm.CrossSection.ofPolygons([roundedRect(w, height, r, 8)]));
    const z = zc - h / 2 + height / 2;
    return scope.keep(scope.keep(cs.extrude(0.01)).translate([0, z, e]));
  };
  // bottom of the recess at -TAPE_DEPTH; outside the wall the top has risen 45°
  const cutter = scope.keep(
    wasm.Manifold.hull([slab(0, -TAPE_DEPTH), slab(TAPE_DEPTH + OUT, OUT - 0.01)]),
  );
  return scope.keep(cutter.transform(onWall(site)));
}
