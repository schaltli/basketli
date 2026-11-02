import type { CrossSection, Manifold, Mat4 } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import { HANDLE_FRAME, type BasketParams } from './params';
import { effectiveDividerTop, jointWidth } from './dividers';
import { junctionArcs } from './junctions';
import { roundedRect, type Vec2 } from './shapes';
import { wallIntrusion } from './stacking';
import { FIRST_LINE, LAYER, type WeaveLayout } from './weave/layout';
import type { RoundedRectPath } from './weave/outline';

/** Radius of the cut-out's bottom corners and of its rounded top edges (mm). */
const BOTTOM_RADIUS = 8;
const TOP_RADIUS = 4;
const ARC_SEGMENTS = 16;
/** The band's first line ends this far inside a stake. */
const INTO_STAKE = 0.3;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

interface Site {
  /** Outward normal and counter-clockwise tangent of the end wall. */
  n: Vec2;
  t: Vec2;
  /** Middle of the end wall on the outer outline. */
  c: Vec2;
}

/** End walls = the shorter walls. 'one' takes the +x (or +y) end. */
function sites(p: BasketParams): Site[] {
  if (p.handles === 'none') return [];
  const alongX = p.width >= p.depth;
  const all: Site[] = alongX
    ? [
        { n: [1, 0], t: [0, 1], c: [p.width / 2, 0] },
        { n: [-1, 0], t: [0, -1], c: [-p.width / 2, 0] },
      ]
    : [
        { n: [0, 1], t: [-1, 0], c: [0, p.depth / 2] },
        { n: [0, -1], t: [1, 0], c: [0, -p.depth / 2] },
      ];
  return p.handles === 'one' ? all.slice(0, 1) : all;
}

/** Arc positions of the cut-out centers on a rounded-rectangle path (s = 0: middle of the front). */
export function handleArcCenters(p: BasketParams, path: RoundedRectPath): number[] {
  const L = path.length;
  const alongX = p.width >= p.depth;
  const centers = alongX ? [L / 4, (3 * L) / 4] : [L / 2, 0];
  return p.handles === 'none' ? [] : p.handles === 'one' ? centers.slice(0, 1) : centers;
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
export function notchOutline(p: BasketParams): Vec2[] {
  const H = p.height;
  const x0 = -p.handleWidth / 2;
  const x1 = p.handleWidth / 2;
  const zb = H - p.handleDepth;
  const rb = bottomRadius(p);
  const rt = TOP_RADIUS;
  return [
    [x0 - rt, H + 1],
    ...arc(x0 - rt, H - rt, rt, PI / 2, 0),
    ...arc(x0 + rb, zb + rb, rb, PI, (3 * PI) / 2),
    ...arc(x1 - rb, zb + rb, rb, (3 * PI) / 2, 2 * PI),
    ...arc(x1 + rt, H - rt, rt, PI, PI / 2),
    [x1 + rt, H + 1],
  ];
}

/** Where the level bottom of the default band outline ends (|u|). */
function flatEnd(p: BasketParams): number {
  const rb = bottomRadius(p);
  const R = rb + HANDLE_FRAME;
  return p.handleWidth / 2 - rb + R * Math.SQRT1_2 - R * (1 - Math.SQRT1_2);
}

/**
 * Outer edge of the band that closes the cut edges (HANDLE_FRAME wide).
 * It follows the cut-out round its bottom corners from the side down to 45°;
 * below that it runs on at 45° to a level bottom, so the band's underside
 * never overhangs flatter than 45° – the level bottom is a bridge.
 * `ends` moves the level bottom's ends (weave: into the next stakes); from
 * there the edge rises at 45° to the side.
 */
export function bandOutline(p: BasketParams, ends?: { left: number; right: number }): Vec2[] {
  const H = p.height;
  const F = HANDLE_FRAME;
  const side = p.handleWidth / 2 + F;
  const zf = H - p.handleDepth - F;
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
  const R = bottomRadius(p) + F;
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

/** Maps wall-plane coordinates (u, z, offset along the outward normal) onto an end wall. */
const onWall = ({ n, t, c }: Site): Mat4 =>
  frame([t[0], t[1], 0], [0, 0, 1], [n[0], n[1], 0], [c[0], c[1], 0]);

/** Cutters for all cut-outs, reaching through the whole wall. */
export function handleNotches(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const T = wallIntrusion(p);
  const shape = scope.keep(wasm.CrossSection.ofPolygons([notchOutline(p)]));
  const prism = scope.keep(scope.keep(shape.extrude(T + 2)).translate([0, 0, -(T + 1)]));
  return sites(p).map((site) => scope.keep(prism.transform(onWall(site))));
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
 * other hole. A divider joint keeps a strip jointWidth wide solid,
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
  const done = (h: Vec2[]) => h.length >= 3;
  if (centers.length === 0 && joints.length === 0) return holes.map(finish).filter(done);
  const L = path.length;
  const band = bandOutline(p);
  const half = jointWidth(p) / 2;
  const jointTop = effectiveDividerTop(p) + p.webWidth;
  const copies = (zone: Vec2[]) => [-L, 0, L].map((k) => zone.map(([x, z]) => [x + k, z] as Vec2));
  const bands = centers.flatMap((sc) => copies(band.map(([u, z]) => [sc + u, z] as Vec2)));
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
    return { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...zone.map((q) => q[1])) };
  };
  const bandBoxes = bands.map(box);
  const stripBoxes = strips.map(box);
  const out: Vec2[][] = [];
  for (const hole of holes) {
    const xs = hole.map((q) => q[0]);
    const ys = hole.map((q) => q[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const overlaps = (b: { x0: number; x1: number; y0: number }) =>
      y1 > b.y0 && x1 > b.x0 && x0 < b.x1;
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
 * Band closing the cut edges of open walls (expanded metal, weave), over the
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
  return all.map((site, i) => {
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
    const shape: CrossSection = scope.keep(wasm.CrossSection.ofPolygons([bandOutline(p, ends)]));
    const layers = Array.from({ length: steps + 1 }, (_, k) => {
      const thick = Math.min(T, FIRST_LINE + 2 * k * LAYER);
      const raised = k === 0 ? shape : scope.keep(shape.translate([0, k * LAYER]));
      return scope.keep(scope.keep(raised.extrude(thick)).translate([0, 0, -T / 2 - thick / 2]));
    });
    const band = scope.keep(wasm.Manifold.union(layers));
    return scope.keep(scope.keep(band.transform(onWall(site))).intersect(outline));
  });
}
