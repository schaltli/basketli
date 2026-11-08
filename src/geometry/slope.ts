import type { CrossSection, Manifold } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import { topAt, topBand, type BasketParams, type WallStyle } from './params';
import { roundedRect, type Vec2 } from './shapes';
import { wallIntrusion, weaveAmplitude } from './stacking';
import { weaveGrowth } from './weave/grow';
import { FIRST_LINE, LAYER, weaveLayout } from './weave/layout';
import { RoundedRectPath } from './weave/outline';

/**
 * Grid of the surface solid (mm): coarse inside, where the top is bilinear
 * (error of a 10 mm cell under 0.01 mm), fine along the walls and round the
 * corners, where builtTop bends.
 */
const SURFACE_STEP = 10;
const SURFACE_FINE = 2;
/** The cut below the rim reaches this far into the shifted rim (fused). */
const OVERLAP = 0.1;
/** Rows on which the gaps under an open wall's rim are found: the print layers. */
const ROW = LAYER;
/** Pattern on the middle line shorter than this (mm) carries nothing. */
const ON_SUPPORT = 0.6;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
/** Walls built from strands or bands: their rim stands on a base (smoothRimBase). */
const OPEN: readonly WallStyle[] = ['expanded', 'weave', 'braid'];

/** Depth from the outer outline within which the top is level across the wall. */
const wallZone = (p: BasketParams) => wallIntrusion(p) + 0.5;

/**
 * The top as it is built: across the wall (within wallZone of the outer
 * outline) it is level, at its height on the outline, so the rim's underside
 * is level across the wall like every hole top. Further in it follows the
 * measured top, taken wallZone further out (continuous, linear along every
 * wall and divider).
 */
export function builtTop(p: BasketParams, x: number, y: number): number {
  if (!p.irregular) return p.height;
  const a = p.width / 2;
  const b = p.depth / 2;
  const r = Math.max(0, Math.min(p.cornerRadius, a, b));
  const qx = Math.min(a - r, Math.max(-(a - r), x));
  const qy = Math.min(b - r, Math.max(-(b - r), y));
  const vx = x - qx;
  const vy = y - qy;
  const len = Math.hypot(vx, vy);
  // outward direction and depth below the outline
  let nx: number;
  let ny: number;
  let d: number;
  if (len > 1e-9) {
    nx = vx / len;
    ny = vy / len;
    d = r - len;
  } else if (a - Math.abs(x) < b - Math.abs(y)) {
    nx = Math.sign(x) || 1;
    ny = 0;
    d = a - Math.abs(x);
  } else {
    nx = 0;
    ny = Math.sign(y) || 1;
    d = b - Math.abs(y);
  }
  const out = Math.max(0, Math.min(d, wallZone(p)));
  return topAt(p, x + nx * out, y + ny * out);
}

/**
 * Grid coordinates from -half to half: coarse steps, fine ones from `fine`
 * outwards (both sides), plus the given breaks.
 */
function gridLine(half: number, fine: number, breaks: number[]): number[] {
  const n = Math.max(1, Math.ceil((2 * half) / SURFACE_STEP));
  const m = Math.max(1, Math.ceil((half - fine) / SURFACE_FINE));
  const edge = Array.from({ length: m + 1 }, (_, i) => fine + ((half - fine) * i) / m);
  const all = [
    ...Array.from({ length: n + 1 }, (_, i) => -half + (2 * half * i) / n),
    ...[...edge, ...breaks].flatMap((v) => [v, -v]).filter((v) => Math.abs(v) <= half),
  ].sort((u, v) => u - v);
  return all.filter((v, i) => i === 0 || v - all[i - 1]! > 0.05);
}

/**
 * Everything below the irregular top, lowered by `drop` (mm): a solid over
 * the footprint (and 2 mm beyond) whose top follows builtTop − drop. Its grid
 * lines run along the walls and through the bends of builtTop, so along
 * every straight wall the cut is exact.
 */
export function belowTop(wasm: Wasm, scope: Scope, p: BasketParams, drop: number): Manifold {
  const z = wallZone(p);
  const r = p.cornerRadius;
  const fine = (half: number) => Math.max(0, half - Math.max(r, z) - 2);
  const xs = gridLine(p.width / 2 + 2, fine(p.width / 2), [
    p.width / 2,
    p.width / 2 - z,
    p.width / 2 - r,
  ]);
  const ys = gridLine(p.depth / 2 + 2, fine(p.depth / 2), [
    p.depth / 2,
    p.depth / 2 - z,
    p.depth / 2 - r,
  ]);
  const nx = xs.length - 1;
  const ny = ys.length - 1;
  const bottom = -1;
  const vert: number[] = [];
  const tri: number[] = [];
  const top = (i: number, j: number) => j * (nx + 1) + i;
  const n = (nx + 1) * (ny + 1);
  const low = (i: number, j: number) => n + j * (nx + 1) + i;
  for (const side of ['top', 'bottom'] as const)
    for (const y of ys)
      for (const x of xs) vert.push(x, y, side === 'top' ? builtTop(p, x, y) - drop : bottom);
  for (let j = 0; j < ny; j++)
    for (let i = 0; i < nx; i++) {
      tri.push(top(i, j), top(i + 1, j), top(i + 1, j + 1));
      tri.push(top(i, j), top(i + 1, j + 1), top(i, j + 1));
      tri.push(low(i, j), low(i + 1, j + 1), low(i + 1, j));
      tri.push(low(i, j), low(i, j + 1), low(i + 1, j + 1));
    }
  // sides: walk the border counter-clockwise
  const ring: [number, number][] = [
    ...xs.map((_, i): [number, number] => [i, 0]),
    ...ys.slice(1).map((_, j): [number, number] => [nx, j + 1]),
    ...xs.slice(0, -1).map((_, i): [number, number] => [nx - 1 - i, ny]),
    ...ys.slice(1, -1).map((_, j): [number, number] => [0, ny - 1 - j]),
  ];
  for (let k = 0; k < ring.length; k++) {
    const [i0, j0] = ring[k]!;
    const [i1, j1] = ring[(k + 1) % ring.length]!;
    tri.push(low(i0, j0), low(i1, j1), top(i1, j1));
    tri.push(low(i0, j0), top(i1, j1), top(i0, j0));
  }
  const mesh = new wasm.Mesh({
    numProp: 3,
    vertProperties: new Float32Array(vert),
    triVerts: new Uint32Array(tri),
  });
  return scope.keep(new wasm.Manifold(mesh));
}

/**
 * Brings a basket built level at full height (p.height = the highest corner)
 * down to its irregular top. Below the top band everything is cut along
 * builtTop − band; the top band itself (rim, its chamfers, the divider tops)
 * is moved straight down at every point by height − builtTop. The band
 * therefore keeps its height and profile everywhere and runs straight along
 * every wall and divider, where the top is linear (exact on the band's own
 * vertices). Open walls get a base under the rim (smoothRimBase).
 */
export function withIrregularTop(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  body: Manifold,
): Manifold {
  if (!p.irregular) return body;
  const H = p.height;
  const band = topBand(p);
  const lower = scope.keep(body.intersect(belowTop(wasm, scope, p, band - OVERLAP)));
  const slab = scope.keep(
    wasm.Manifold.cube([p.width + 4, p.depth + 4, band + 2], true).translate([
      0,
      0,
      H - band + (band + 2) / 2,
    ]),
  );
  const rim = scope.keep(body.intersect(slab));
  const moved = scope.keep(
    rim.warp((v) => {
      v[2] -= H - builtTop(p, v[0], v[1]);
    }),
  );
  if (!OPEN.includes(p.wallStyle)) return scope.keep(wasm.Manifold.union([lower, moved]));
  // Open walls: the pattern ends on a base that carries the rim (smoothRimBase).
  const { cut, base } = smoothRimBase(wasm, scope, p, lower, quality);
  const pattern = scope.keep(lower.subtract(cut));
  return scope.keep(wasm.Manifold.union([pattern, base, moved]));
}

/**
 * Hole patterns (wall coordinates: x = arc length on the outer wall, y =
 * height): the region above the top band's lower edge, for clipHoles. One
 * polygon per period copy, sampled at the path's breakpoints.
 */
export function aboveBandOnWall(p: BasketParams, path: RoundedRectPath): Vec2[][] {
  if (!p.irregular) return [];
  const L = path.length;
  const band = topBand(p);
  const ss = [...path.breakpoints(2), L];
  const line: Vec2[] = ss.map((s) => {
    const q = path.at(s).p;
    return [s, topAt(p, q[0], q[1]) - band];
  });
  const roof = p.height + 1;
  return [-L, 0, L].map((k) => [
    ...line.map(([s, z]) => [s + k, z] as Vec2),
    [L + k, roof],
    [k, roof],
  ]);
}

/** Ring between two insets (mm in from the outer outline). */
function annulus(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  a: number,
  b: number,
  quality: Quality,
): CrossSection {
  const at = (inset: number) =>
    scope.keep(
      wasm.CrossSection.ofPolygons([
        roundedRect(
          p.width - 2 * inset,
          p.depth - 2 * inset,
          Math.max(0, p.cornerRadius - inset),
          CORNER_SEGMENTS[quality],
        ),
      ]),
    );
  return scope.keep(at(a).subtract(at(b)));
}

/**
 * Where f >= level round a closed path: samples f at the sorted positions
 * ss (0 ≤ s < L, linear in between). Intervals [a, b] with 0 ≤ a < L, b > a
 * (b may pass L).
 */
export function aboveLevel(
  ss: number[],
  f: number[],
  level: number,
  L: number,
): [number, number][] {
  const n = ss.length;
  const start = f.findIndex((v) => v < level);
  if (start < 0) return [[0, L]];
  const pos = (k: number) => ss[(start + k) % n]! + Math.floor((start + k) / n) * L;
  const val = (k: number) => f[(start + k) % n]!;
  const out: [number, number][] = [];
  let open: number | undefined;
  for (let k = 0; k < n; k++) {
    const [si, sj, fi, fj] = [pos(k), pos(k + 1), val(k), val(k + 1)];
    const cross = fi === fj ? si : si + ((level - fi) * (sj - si)) / (fj - fi);
    if (fi < level && fj >= level) open = cross;
    else if (fi >= level && fj < level && open !== undefined) {
      out.push([open, cross]);
      open = undefined;
    }
  }
  return out.map(([a, b]) => {
    const k = Math.floor(a / L) * L;
    return [a - k, b - k];
  });
}

/** Cyclic intervals (a may lie outside [0, L), b may pass L) split at the seam, on [0, L). */
function onCircle(iv: [number, number][], L: number): [number, number][] {
  const out: [number, number][] = [];
  for (const [a0, b0] of iv) {
    if (b0 - a0 >= L - 1e-9) return [[0, L]];
    const k = Math.floor(a0 / L) * L;
    const [a, b] = [a0 - k, b0 - k];
    if (b <= L) out.push([a, b]);
    else out.push([a, L], [0, b - L]);
  }
  return out.sort((x, y) => x[0] - y[0]);
}

/** Merges overlapping intervals. */
function merged(iv: [number, number][]): [number, number][] {
  const out: [number, number][] = [];
  for (const [a, b] of [...iv].sort((x, y) => x[0] - y[0])) {
    const last = out.at(-1);
    if (last && a <= last[1] + 1e-9) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
}

/** A gap in the pattern on the wall's middle line, on one row; `line`: the slope passes below the next row over it. */
interface Gap {
  a: number;
  b: number;
  row: number;
  line: boolean;
}

/**
 * Open walls (expanded metal, weave, braid) under an irregular top. The rim
 * stands on a base whose underside runs straight along the slope wherever
 * the pattern below carries it (material on the wall's middle line, where
 * the base's first line lies). Where the slope crosses a gap in the
 * pattern, a sloping underside would grow along the wall by LAYER / slope
 * per layer into the air; there the gap is closed from its lowest point on
 * the slope up, so its top is a level bridge from one side of the gap to
 * the other (or onto the base, which stands lower there). In the wall the
 * pattern ends on this underside (`cut`: the wall above it). Like a handle
 * band the base grows from one line in the middle of the wall to the full
 * thickness at 45°, which it reaches below the rim; it reaches up into the
 * rim.
 */
export function smoothRimBase(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  lower: Manifold,
  quality: Quality,
): { cut: Manifold; base: Manifold } {
  const { CrossSection, Manifold } = wasm;
  const path = new RoundedRectPath(p.width, p.depth, p.cornerRadius);
  const L = path.length;
  const T = wallIntrusion(p);
  // layers until the base has the full thickness: from the middle line, or
  // in a weave from a band that lies up to the amplitude off the middle
  const steps =
    p.wallStyle === 'weave'
      ? Math.ceil((T / 2 + weaveAmplitude(p)) / LAYER - 1e-9)
      : Math.max(0, Math.ceil((T - FIRST_LINE) / (2 * LAYER)));
  // highest underside allowed: full thickness reached below the rim
  const drop = topBand(p) + steps * LAYER;
  const ss = path.breakpoints(1);
  const f = ss.map((s) => {
    const q = path.at(s).p;
    return topAt(p, q[0], q[1]) - drop;
  });
  const lo = Math.min(...f);
  const hi = Math.max(...f);
  const slopeAt = (s: number) => {
    const q = path.at(s).p;
    return topAt(p, q[0], q[1]) - drop;
  };
  /** Lowest point of the slope over [a, b]. */
  const lowest = (a: number, b: number) => {
    const n = Math.max(1, Math.ceil((b - a) / 0.5));
    return Math.min(...Array.from({ length: n + 1 }, (_, i) => slopeAt(a + ((b - a) * i) / n)));
  };

  // Rows through the band the slope crosses: on each, the gaps between the
  // pieces of pattern on the middle line, below the slope.
  const middle = annulus(wasm, scope, p, T / 2 - FIRST_LINE / 2, T / 2 + FIRST_LINE / 2, quality);
  const onLine = scope.keep(lower.intersect(scope.keep(middle.extrude(p.height + 1))));
  // rows on the layer boundaries, so a bridge is a whole print layer on the one below
  const first = Math.floor(lo / ROW + 1e-9) * ROW;
  const rows = Array.from(
    { length: Math.floor((hi - first) / ROW) + 1 },
    (_, j) => first + j * ROW,
  );
  const gaps: Gap[] = [];
  rows.forEach((z, row) => {
    const sup = merged(
      onCircle(
        scope
          .keep(onLine.slice(z - LAYER / 2))
          .decompose()
          .map((piece) => scope.keep(piece))
          // only real supports, not a speck where a strand grazes the line
          .filter((piece) => piece.area() >= FIRST_LINE * ON_SUPPORT)
          .map((piece): [number, number] => {
            let us = piece
              .toPolygons()
              .flat()
              .map((q) => path.project(q[0], q[1]));
            if (Math.max(...us) - Math.min(...us) > L / 2)
              us = us.map((u) => (u < L / 2 ? u + L : u));
            return [Math.min(...us), Math.max(...us)];
          }),
        L,
      ),
    );
    for (const [a, b] of onCircle(aboveLevel(ss, f, z, L), L)) {
      let from = a;
      const gap = (ga: number, gb: number) =>
        gaps.push({ a: ga, b: gb, row, line: lowest(ga, gb) < z + ROW });
      for (const [sa, sb] of sup) {
        if (sb <= from || sa >= b) continue;
        if (sa > from) gap(from, sa);
        from = Math.max(from, sb);
      }
      if (from < b) gap(from, b);
    }
  });

  // gaps that overlap on neighbouring rows (or meet at the seam) are one hole
  const parent = gaps.map((_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i] = parent[parent[i]!]!;
    return i;
  };
  const join = (i: number, j: number) => {
    parent[find(i)] = find(j);
  };
  const byRow = rows.map(() => [] as number[]);
  gaps.forEach((g, i) => byRow[g.row]!.push(i));
  byRow.forEach((ids, row) => {
    const seamA = ids.filter((i) => gaps[i]!.a < 1e-9);
    const seamB = ids.filter((i) => gaps[i]!.b > L - 1e-9);
    for (const i of seamA) for (const j of seamB) join(i, j);
    for (const i of ids)
      for (const j of byRow[row + 1] ?? [])
        if (gaps[i]!.a < gaps[j]!.b && gaps[j]!.a < gaps[i]!.b) join(i, j);
  });
  // each hole that reaches the slope is closed from its lowest point on it up
  const bridge = new Map<number, number>();
  gaps.forEach((g, i) => {
    if (!g.line) return;
    const r = find(i);
    bridge.set(r, Math.min(bridge.get(r) ?? Infinity, g.row));
  });
  const fills = new Map<number, [number, number][]>();
  gaps.forEach((g, i) => {
    const from = bridge.get(find(i));
    if (from === undefined || g.row < from) return;
    fills.set(from, [...(fills.get(from) ?? []), [g.a, g.b]]);
  });

  // a strip across the wall over [a, b] (square to the wall, radial in the corners)
  const sector = (a: number, b: number): Vec2[] => {
    const n = Math.max(1, Math.ceil((b - a) / 2));
    const at = Array.from({ length: n + 1 }, (_, i) => path.at(a + ((b - a) * i) / n));
    const off =
      (k: number) =>
      ({ p: q, n: o }: { p: Vec2; n: Vec2 }): Vec2 => [q[0] + o[0] * k, q[1] + o[1] * k];
    return [...at.map(off(2)), ...at.reverse().map(off(-(T + 0.01)))];
  };
  const roof = p.height + 1;
  const wall = scope.keep(annulus(wasm, scope, p, -2, T + 0.01, quality).extrude(roof));
  const above = scope.keep(wall.subtract(belowTop(wasm, scope, p, drop)));
  const closed = [...fills].map(([row, iv]) => {
    const cs = scope.keep(CrossSection.ofPolygons(merged(iv).map(([a, b]) => sector(a, b))));
    return scope.keep(scope.keep(cs.extrude(roof - rows[row]!)).translate([0, 0, rows[row]!]));
  });
  const cut = scope.keep(Manifold.union([above, ...closed]));

  // grows from the middle line to the full thickness, one layer at a time;
  // in a weave from the band below, which swings in and out (weaveGrowth)
  const growth =
    p.wallStyle === 'weave'
      ? weaveGrowth(wasm, scope, p, weaveLayout(p), quality, lo, hi)
      : undefined;
  const layers = Array.from({ length: steps + 1 }, (_, k) => {
    const th = growth ? T : Math.min(T, FIRST_LINE + 2 * k * LAYER);
    const ring = annulus(wasm, scope, p, T / 2 - th / 2, T / 2 + th / 2, quality);
    let tall = scope.keep(ring.extrude(roof + 1));
    if (growth) tall = scope.keep(tall.intersect(growth.at(k)));
    return scope.keep(tall.intersect(scope.keep(cut.translate([0, 0, k * LAYER]))));
  });
  const grown = scope.keep(Manifold.union(layers));
  return { cut, base: scope.keep(grown.intersect(belowTop(wasm, scope, p, 0))) };
}
