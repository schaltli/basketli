import type { Manifold, Mat4 } from 'manifold-3d';
import type { Scope, Wasm } from './manifold';
import { HANDLE_FRAME, type BasketParams } from './params';
import type { Vec2 } from './shapes';
import { wallIntrusion } from './stacking';
import type { Quality } from './basket';
import { rimSolid } from './weave/bands';
import { FIRST_LINE, LAYER, type WeaveLayout } from './weave/layout';
import type { RoundedRectPath } from './weave/outline';

/** Radius of the notch's bottom corners and of the fillets at the top edge (mm). */
const BOTTOM_RADIUS = 8;
const TOP_FILLET = 2;
const ARC_SEGMENTS = 12;

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

/**
 * Zones in wall coordinates (x = arc length on the outer wall, y = height)
 * that patterns must leave solid: the cut-out plus its frame.
 */
export function handleKeepOut(p: BasketParams, path: RoundedRectPath) {
  const half = p.handleWidth / 2 + HANDLE_FRAME;
  const y0 = p.height - p.handleDepth - HANDLE_FRAME;
  return handleArcCenters(p, path).map((s) => ({ s, half, y0, length: path.length }));
}

/** True if a hole (wall coordinates) touches one of the keep-out zones. */
export function holeBlocked(hole: Vec2[], zones: ReturnType<typeof handleKeepOut>): boolean {
  if (zones.length === 0) return false;
  const xs = hole.map((q) => q[0]);
  const top = Math.max(...hole.map((q) => q[1]));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  return zones.some(({ s, half, y0, length }) => {
    if (top <= y0) return false;
    // the pattern is periodic round the outline: compare in the period nearest s
    const k = Math.round(((x0 + x1) / 2 - s) / length);
    return x1 - k * length > s - half && x0 - k * length < s + half;
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

const arc = (cx: number, cy: number, r: number, a0: number, a1: number): Vec2[] =>
  Array.from({ length: ARC_SEGMENTS + 1 }, (_, i) => {
    const a = a0 + ((a1 - a0) * i) / ARC_SEGMENTS;
    return [cx + r * Math.cos(a), cy + r * Math.sin(a)] as Vec2;
  });

/**
 * U-shaped cut-out seen from outside (u along the wall, z up), open at the
 * top: round bottom corners, small fillets where it meets the top edge.
 * No overhang anywhere – the cut opens upwards.
 */
function notchOutline(p: BasketParams): Vec2[] {
  const H = p.height;
  const x0 = -p.handleWidth / 2;
  const x1 = p.handleWidth / 2;
  const zb = H - p.handleDepth;
  const rb = Math.min(BOTTOM_RADIUS, p.handleWidth / 2, p.handleDepth);
  const rf = TOP_FILLET;
  const pi = Math.PI;
  return [
    [x0 - rf, H + 1],
    ...arc(x0 - rf, H - rf, rf, pi / 2, 0),
    ...arc(x0 + rb, zb + rb, rb, pi, (3 * pi) / 2),
    ...arc(x1 - rb, zb + rb, rb, (3 * pi) / 2, 2 * pi),
    ...arc(x1 + rf, H - rf, rf, pi, pi / 2),
    [x1 + rf, H + 1],
  ];
}

/** Cutters for all cut-outs, reaching through the whole wall. */
export function handleNotches(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const T = wallIntrusion(p);
  const shape = scope.keep(wasm.CrossSection.ofPolygons([notchOutline(p)]));
  const prism = scope.keep(scope.keep(shape.extrude(T + 2)).translate([0, 0, -(T + 1)]));
  return sites(p).map(({ n, t, c }) =>
    scope.keep(
      prism.transform(frame([t[0], t[1], 0], [0, 0, 1], [n[0], n[1], 0], [c[0], c[1], 0])),
    ),
  );
}

/**
 * Solid frame round each cut-out for expanded metal: full wall thickness,
 * HANDLE_FRAME wider and deeper than the cut-out. Like the top rim of the
 * weave, its first layer is one line in the middle of the wall (through the
 * strand crossings), bridging from support to support, and it grows 45° to
 * the full thickness above.
 */
export function handleFrames(wasm: Wasm, scope: Scope, p: BasketParams): Manifold[] {
  const T = wallIntrusion(p);
  const H = p.height;
  const zf = H - p.handleDepth - HANDLE_FRAME;
  const mid = -T / 2;
  const h = Math.min(FIRST_LINE, T) / 2;
  const grow = T / 2 - h;
  // (offset along the outward normal, z); outer face at 0, inner at −T
  const profile: Vec2[] = [
    [mid - h, zf - 0.05],
    [mid + h, zf - 0.05],
    [mid + h, zf + LAYER],
    [0, zf + LAYER + grow],
    [0, H],
    [-T, H],
    [-T, zf + LAYER + grow],
    [mid - h, zf + LAYER],
  ];
  const length = p.handleWidth + 2 * HANDLE_FRAME;
  const shape = scope.keep(wasm.CrossSection.ofPolygons([profile]));
  const bar = scope.keep(scope.keep(shape.extrude(length)).translate([0, 0, -length / 2]));
  return sites(p).map(({ n, t, c }) =>
    scope.keep(
      bar.transform(frame([n[0], n[1], 0], [0, 0, 1], [-t[0], -t[1], 0], [c[0], c[1], 0])),
    ),
  );
}

/** Half-space beyond the plane through `at` with normal `dir` (vertical plane). */
function halfSpace(wasm: Wasm, scope: Scope, at: Vec2, dir: Vec2): Manifold {
  const big = 4000;
  const cube = scope.keep(wasm.Manifold.cube([big, big, big]).translate([0, -big / 2, -big / 2]));
  // local +x → dir, +y → ez × dir, +z → ez (right-handed)
  return scope.keep(
    cube.transform(frame([dir[0], dir[1], 0], [-dir[1], dir[0], 0], [0, 0, 1], [at[0], at[1], 0])),
  );
}

/**
 * Weave version of the handle frame: the top rim ring, reaching down to the
 * frame bottom, cut to the arc range of the cut-out. Its ends sit inside the
 * next stake beyond the frame width, so the first line (through the stakes)
 * is a bridge from stake to stake – also where it runs round a corner.
 */
export function weaveHandleFrames(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  layout: WeaveLayout,
  quality: Quality,
): Manifold[] {
  const centers = handleArcCenters(p, layout.path);
  if (centers.length === 0) return [];
  const zf = p.height - p.handleDepth - HANDLE_FRAME;
  const ring = scope.keep(rimSolid(wasm, p, layout, quality, zf));
  const L = layout.path.length;
  const reach = p.handleWidth / 2 + HANDLE_FRAME;
  const INTO_STAKE = 0.3;
  return centers.map((sc, i) => {
    const rel = layout.stakes.map((s) => ((((s - sc) % L) + 1.5 * L) % L) - L / 2);
    const right = Math.min(...rel.filter((u) => u >= reach)) + INTO_STAKE;
    const left = Math.min(...rel.filter((u) => u <= -reach).map((u) => -u)) + INTO_STAKE;
    const a = layout.path.at(sc + right);
    const b = layout.path.at(sc - left);
    const tangent = (n: Vec2): Vec2 => [-n[1], n[0]];
    const site = sites(p)[i]!;
    const keep = [
      halfSpace(wasm, scope, a.p, tangent(a.n).map((v) => -v) as Vec2),
      halfSpace(wasm, scope, b.p, tangent(b.n)),
      halfSpace(wasm, scope, [0, 0], site.n),
    ];
    return keep.reduce((m, h) => scope.keep(m.intersect(h)), ring);
  });
}
