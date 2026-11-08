import type { CrossSection, Manifold, Mat4 } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import { HANDLE_FRAME, sidesOf, topAt, wallSite, type BasketParams, type WallSite } from './params';
import { effectiveDividerTop, jointWidth } from './dividers';
import { junctionArcs } from './junctions';
import { labelZonesOnWall } from './label';
import { aboveBandOnWall, belowTop } from './slope';
import { roundedRect, type Vec2 } from './shapes';
import { wallIntrusion } from './stacking';
import { weaveGrowth } from './weave/grow';
import { FIRST_LINE, LAYER, type WeaveLayout } from './weave/layout';
import type { RoundedRectPath } from './weave/outline';

/** Radius of the cut-out's bottom corners and of its rounded top edges (mm). */
const BOTTOM_RADIUS = 8;
const TOP_RADIUS = 4;
const ARC_SEGMENTS = 16;
/** The band's first line ends this far inside a stake. */
const INTO_STAKE = 0.3;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

type Site = WallSite;

/**
 * The top of a handle wall around its middle (u along the wall): height there
 * and rise per mm. Level baskets: the height, no rise.
 */
export interface WallTop {
  hc: number;
  k: number;
}
const level = (p: BasketParams): WallTop => ({ hc: p.height, k: 0 });
const wallTop = (p: BasketParams, { c, t }: Site): WallTop => {
  const hc = topAt(p, c[0], c[1]);
  return { hc, k: topAt(p, c[0] + t[0], c[1] + t[1]) - hc };
};

/** The walls with a handle, in SIDES order. */
function sites(p: BasketParams): Site[] {
  return sidesOf(p.handleSides).map((side) => wallSite(p, side));
}

/** Arc positions of the cut-out centers on a rounded-rectangle path (s = 0: middle of the front), in sites order. */
export function handleArcCenters(p: BasketParams, path: RoundedRectPath): number[] {
  return sites(p).map((site) => site.s(path.length));
}

const PI = Math.PI;
const arc = (cx: number, cy: number, r: number, a0: number, a1: number): Vec2[] =>
  Array.from({ length: ARC_SEGMENTS + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / ARC_SEGMENTS;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Vec2;
  });

const bottomRadius = (p: BasketParams) => Math.min(BOTTOM_RADIUS, p.handleWidth / 2, p.handleDepth);

/**
 * The punched-out cut-out seen from outside (u along the wall, z up), open
 * at the top: round bottom corners, rounded top edges. It opens upwards, so
 * it has no overhang.
 */
export function notchOutline(p: BasketParams, top: WallTop = level(p)): Vec2[] {
  const H = p.height;
  const x0 = -p.handleWidth / 2;
  const x1 = p.handleWidth / 2;
  const zb = top.hc - p.handleDepth;
  const rb = bottomRadius(p);
  const rt = TOP_RADIUS;
  // the rounded top edges sit on the (possibly sloping) rim
  const hl = top.hc + top.k * (x0 - rt);
  const hr = top.hc + top.k * (x1 + rt);
  return [
    [x0 - rt, H + 1],
    ...arc(x0 - rt, hl - rt, rt, PI / 2, 0),
    ...arc(x0 + rb, zb + rb, rb, PI, (3 * PI) / 2),
    ...arc(x1 - rb, zb + rb, rb, (3 * PI) / 2, 2 * PI),
    ...arc(x1 + rt, hr - rt, rt, PI, PI / 2),
    [x1 + rt, H + 1],
  ];
}

/**
 * Closed slot below the rim (u along the wall, z up): a stadium with flat
 * top and bottom and round ends. Its flat top is carried by breakaway ribs.
 */
export function slotGeometry(p: BasketParams, wall: WallTop = level(p)) {
  const r = p.slotHeight / 2;
  const top = wall.hc - p.slotBar;
  const bottom = top - p.slotHeight;
  /** Centers of the round ends at ±uc. */
  const uc = Math.max(0, p.slotWidth / 2 - r);
  return { r, top, bottom, uc, zc: bottom + r };
}

export function slotOutline(p: BasketParams, top: WallTop = level(p)): Vec2[] {
  const { r, uc, zc } = slotGeometry(p, top);
  return [...arc(uc, zc, r, -PI / 2, PI / 2), ...arc(-uc, zc, r, PI / 2, (3 * PI) / 2)];
}

/** The opening a handle band frames: half width, lowest point, bottom corner radius. */
function opening(
  p: BasketParams,
  top: WallTop = level(p),
): { half: number; bottom: number; rb: number } {
  if (p.handleType === 'slot') {
    const g = slotGeometry(p, top);
    return { half: p.slotWidth / 2, bottom: g.bottom, rb: g.r };
  }
  return { half: p.handleWidth / 2, bottom: top.hc - p.handleDepth, rb: bottomRadius(p) };
}

/** Where the level bottom of the default band outline ends (|u|). */
function flatEnd(p: BasketParams): number {
  const { half, rb } = opening(p);
  const R = rb + HANDLE_FRAME;
  return half - rb + R * Math.SQRT1_2 - R * (1 - Math.SQRT1_2);
}

/**
 * Outer edge of the band that closes the cut edges (HANDLE_FRAME wide).
 * It follows the cut-out round its bottom corners from the side down to 45°;
 * below that it runs on at 45° to a level bottom, so the band's underside
 * never overhangs flatter than 45° – the level bottom is a bridge.
 * `ends` moves the level bottom's ends (weave: into the next stakes); from
 * there the edge rises at 45° to the side.
 */
export function bandOutline(
  p: BasketParams,
  ends?: { left: number; right: number },
  top: WallTop = level(p),
): Vec2[] {
  const H = p.height;
  const F = HANDLE_FRAME;
  const o = opening(p, top);
  const side = o.half + F;
  const zf = o.bottom - F;
  if (ends) {
    const pts: Vec2[] = [
      [-side, zf + Math.abs(ends.left - side)],
      [-ends.left, zf],
      [ends.right, zf],
      [side, zf + Math.abs(ends.right - side)],
      [side, H + 1],
      [-side, H + 1],
    ];
    return pts.filter((q, i) => {
      const prev = pts[(i + pts.length - 1) % pts.length]!;
      return Math.hypot(q[0] - prev[0], q[1] - prev[1]) > 1e-9;
    });
  }
  const R = o.rb + F;
  const cx = side - R;
  const cz = zf + R;
  const flat = flatEnd(p);
  return [
    [-side, H + 1],
    ...arc(-cx, cz, R, PI, (5 * PI) / 4),
    [-flat, zf],
    [flat, zf],
    ...arc(cx, cz, R, (7 * PI) / 4, 2 * PI),
    [side, H + 1],
  ];
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

/** Maps wall-plane coordinates (u, z, offset along the outward normal) onto a handle wall. */
const onWall = ({ n, t, c }: Site): Mat4 =>
  frame([t[0], t[1], 0], [0, 0, 1], [n[0], n[1], 0], [c[0], c[1], 0]);

/** Cutters for all cut-outs or slots, reaching through the whole wall. */
export function handleCutters(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const T = wallIntrusion(p);
  return sites(p).map((site) => {
    const top = wallTop(p, site);
    const outline = p.handleType === 'slot' ? slotOutline(p, top) : notchOutline(p, top);
    const shape = scope.keep(wasm.CrossSection.ofPolygons([outline]));
    const prism = scope.keep(scope.keep(shape.extrude(T + 2)).translate([0, 0, -(T + 1)]));
    return scope.keep(prism.transform(onWall(site)));
  });
}

/** Breakaway ribs: body width, neck width at both contacts, neck height (mm). */
export const RIB_WIDTH = 0.8;
export const RIB_NECK = 0.4;
const NECK_HEIGHT = 0.4;
/** Ribs reach this far into the wall above and below (fused, not touching). */
const RIB_OVERLAP = 0.1;
/** Target distance between ribs, well inside MAX_BRIDGE. */
const RIB_SPACING = 12;

/** Rib centers along the slot (u): evenly over its flat part, outermost at the round ends. */
export function ribPositions(p: BasketParams): number[] {
  if (p.handleType !== 'slot') return [];
  const { uc } = slotGeometry(p);
  const gaps = Math.ceil((2 * uc) / RIB_SPACING);
  if (gaps === 0) return [0];
  return Array.from({ length: gaps + 1 }, (_, i) => -uc + (2 * uc * i) / gaps);
}

/** One rib in wall coordinates: a thin plate, necked at the top and bottom contact. */
export function ribOutline(p: BasketParams, u: number, wall: WallTop = level(p)): Vec2[] {
  const { top, bottom } = slotGeometry(p, wall);
  const a = RIB_WIDTH / 2;
  const n = RIB_NECK / 2;
  // widens 45° above the bottom neck; narrows towards the top neck
  const lo = bottom + NECK_HEIGHT;
  const hi = top - NECK_HEIGHT;
  return [
    [u - n, bottom - RIB_OVERLAP],
    [u + n, bottom - RIB_OVERLAP],
    [u + n, lo],
    [u + a, lo + (a - n)],
    [u + a, hi - (a - n)],
    [u + n, hi],
    [u + n, top + RIB_OVERLAP],
    [u - n, top + RIB_OVERLAP],
    [u - n, hi],
    [u - a, hi - (a - n)],
    [u - a, lo + (a - n)],
    [u - n, lo],
  ];
}

/**
 * Support built into the model: thin ribs standing in each slot, at most
 * RIB_SPACING apart, so the bar above it only bridges short spans. Each rib
 * is joined to the wall by a one-line neck at the top and bottom, so it
 * snaps off after printing.
 */
export function handleSupports(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  if (p.handleType !== 'slot') return [];
  const T = wallIntrusion(p);
  return sites(p).map((site) => {
    const top = wallTop(p, site);
    const ribs = scope.keep(
      wasm.CrossSection.ofPolygons(ribPositions(p).map((u) => ribOutline(p, u, top))),
    );
    const plate = scope.keep(scope.keep(ribs.extrude(T)).translate([0, 0, -T]));
    return scope.keep(plate.transform(onWall(site)));
  });
}

/** Pieces of a cut hole smaller than this share of the hole are dropped (no slivers). */
const MIN_PIECE_SHARE = 0.2;

const polyArea = (h: Vec2[]) =>
  Math.abs(
    h.reduce((s, q, i) => {
      const r = h[(i + 1) % h.length]!;
      return s + q[0] * r[1] - r[0] * q[1];
    }, 0),
  ) / 2;

/**
 * Trims wall-pattern holes (wall coordinates: x = arc length on the outer
 * wall, y = height) where they meet a handle band or a divider joint, then
 * `finish` (the pattern's printability rule) reshapes every piece like any
 * other hole. A label field stays solid like a handle band. A divider joint keeps a strip jointWidth wide solid,
 * but only up to the divider top (plus a web): above it the pattern runs on
 * across the joint. A hole reaching below that top is cut over its whole
 * height, so every piece stays one span per row. Slivers are dropped.
 */
export function clipHoles(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  path: RoundedRectPath,
  holes: Vec2[][],
  finish: (hole: Vec2[]) => Vec2[],
  { joints: withJoints = true }: { joints?: boolean } = {},
): Vec2[][] {
  const centers = handleArcCenters(p, path);
  const joints = withJoints ? junctionArcs(p, path) : [];
  const labels = labelZonesOnWall(p, path);
  const done = (h: Vec2[]) => h.length >= 3;
  if (centers.length === 0 && joints.length === 0 && labels.length === 0 && !p.irregular)
    return holes.map(finish).filter(done);
  const L = path.length;
  const tops = sites(p).map((site) => wallTop(p, site));
  const half = jointWidth(p) / 2;
  const jointTop = effectiveDividerTop(p) + p.webWidth;
  const copies = (zone: Vec2[]) => [-L, 0, L].map((k) => zone.map(([x, z]) => [x + k, z] as Vec2));
  const bands = [
    ...centers.flatMap((sc, i) =>
      copies(bandOutline(p, undefined, tops[i]).map(([u, z]) => [sc + u, z] as Vec2)),
    ),
    ...labels.flatMap(copies),
    ...aboveBandOnWall(p, path),
  ];
  const strips = joints.flatMap((s) =>
    copies([
      [s - half, -1],
      [s + half, -1],
      [s + half, p.height + 1],
      [s - half, p.height + 1],
    ]),
  );
  const box = (zone: Vec2[]) => {
    const xs = zone.map((q) => q[0]);
    const ys = zone.map((q) => q[1]);
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
  };
  const bandBoxes = bands.map(box);
  const stripBoxes = strips.map(box);
  const out: Vec2[][] = [];
  for (const hole of holes) {
    const xs = hole.map((q) => q[0]);
    const ys = hole.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const overlaps = (b: { x0: number; x1: number; y0: number; y1: number }) =>
      y1 > b.y0 && y0 < b.y1 && x1 > b.x0 && x0 < b.x1;
    const cutters = [
      ...bands.filter((_, i) => overlaps(bandBoxes[i]!)),
      ...(y0 < jointTop ? strips.filter((_, i) => overlaps(stripBoxes[i]!)) : []),
    ];
    if (cutters.length === 0) {
      const h = finish(hole);
      if (done(h)) out.push(h);
      continue;
    }
    const whole = polyArea(hole);
    const pieces = scope
      .keep(
        scope
          .keep(wasm.CrossSection.ofPolygons([hole]))
          .subtract(scope.keep(wasm.CrossSection.ofPolygons(cutters))),
      )
      .toPolygons()
      .map((poly) => poly.map(([x, y]) => [x, y] as Vec2));
    for (const piece of pieces) {
      if (polyArea(piece) < MIN_PIECE_SHARE * whole) continue;
      const h = finish(piece);
      if (done(h)) out.push(h);
    }
  }
  return out;
}

/**
 * Band closing the cut edges of open walls (expanded metal, weave, braid), over the
 * full wall thickness. Like the top rim of the weave its first layer is one
 * line in the middle of the wall, bridging from support to support, and it
 * grows 45° to the full thickness above (one step per print layer). In the
 * weave its level bottom ends inside the next stakes.
 */
export function handleBands(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  weave?: WeaveLayout,
): Manifold[] {
  const all = sites(p);
  if (all.length === 0) return [];
  const T = wallIntrusion(p);
  const steps = Math.max(0, Math.ceil((T - FIRST_LINE) / (2 * LAYER)));
  const centers = weave ? handleArcCenters(p, weave.path) : [];
  // Clip to the outer outline (a weave band may reach a little past the
  // straight wall to its anchor stake) and to the top edge.
  const outline = scope.keep(
    scope
      .keep(
        wasm.CrossSection.ofPolygons([
          roundedRect(p.width, p.depth, p.cornerRadius, CORNER_SEGMENTS[quality]),
        ]),
      )
      .extrude(p.height),
  );
  // an irregular top cuts the band like the rim
  const clip = p.irregular ? scope.keep(outline.intersect(belowTop(wasm, scope, p, 0))) : outline;
  const shapes = all.map((site, i) => {
    let ends: { left: number; right: number } | undefined;
    if (weave) {
      const L = weave.path.length;
      const sc = centers[i]!;
      const rel = weave.stakes.map((s) => ((((s - sc) % L) + 1.5 * L) % L) - L / 2);
      const reach = flatEnd(p);
      ends = {
        right: Math.min(...rel.filter((u) => u >= reach)) + INTO_STAKE,
        left: Math.min(...rel.filter((u) => u <= -reach).map((u) => -u)) + INTO_STAKE,
      };
    }
    return scope.keep(
      wasm.CrossSection.ofPolygons([bandOutline(p, ends, wallTop(p, site))]),
    ) as CrossSection;
  });
  // In a weave the bands below swing in and out: grow from them (weaveGrowth).
  const bottoms = shapes.map((sh) => sh.bounds().min[1]);
  const growth = weave
    ? weaveGrowth(wasm, scope, p, weave, quality, Math.min(...bottoms), Math.max(...bottoms))
    : undefined;
  return all.map((site, i) => {
    const shape = shapes[i]!;
    const n = growth ? growth.steps : steps;
    const layers = Array.from({ length: n + 1 }, (_, k) => {
      const thick = growth ? T : Math.min(T, FIRST_LINE + 2 * k * LAYER);
      const raised = k === 0 ? shape : scope.keep(shape.translate([0, k * LAYER]));
      const layer = scope.keep(
        scope.keep(raised.extrude(thick)).translate([0, 0, -T / 2 - thick / 2]),
      );
      if (!growth) return layer;
      return scope.keep(scope.keep(layer.transform(onWall(site))).intersect(growth.at(k)));
    });
    const band = scope.keep(wasm.Manifold.union(layers));
    const placed = growth ? band : scope.keep(band.transform(onWall(site)));
    return scope.keep(placed.intersect(clip));
  });
}
