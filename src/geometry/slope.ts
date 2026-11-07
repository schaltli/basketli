import type { CrossSection, Manifold } from 'manifold-3d';
import type { Quality } from './basket';
import type { Scope, Wasm } from './manifold';
import { topAt, topBand, type BasketParams, type WallStyle } from './params';
import { roundedRect, type Vec2 } from './shapes';
import { wallIntrusion } from './stacking';
import { FIRST_LINE, LAYER } from './weave/layout';
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
/** Rise of one step of the stepped underside below an open wall's rim (mm). */
const STEP = 1;
/** A step ends at least this far inside the support below it (mm). */
const ON_SUPPORT = 0.6;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
/** Walls built from strands or bands: their rim gets a stepped underside. */
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
 * vertices). Open walls get a stepped base under the rim (steppedRimBase).
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
  // Open walls: in the wall the pattern ends level on the steps of a base
  // that carries the rim (steppedRimBase), not along the slope.
  const { cut, base } = steppedRimBase(wasm, scope, p, lower, quality);
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

/**
 * Open walls (expanded metal, weave, braid) under an irregular top. Cut
 * along the slope, the pattern would lose one end of every bridge it cuts
 * through, and a sloping underside grows along the wall by LAYER / slope per
 * layer – far into the air on gentle slopes. So the rim stands on a base
 * with a stepped underside: level steps STEP apart, each ending on a support
 * below it (material on the wall's middle line), so every step is a bridge
 * from support to support. In the wall the pattern ends level on these
 * steps (`cut`: the wall above the steps). Like a handle band the base grows
 * from one line in the middle of the wall to the full thickness at 45°,
 * which it reaches below the rim; it reaches up into the rim.
 */
export function steppedRimBase(
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
  const steps = Math.max(0, Math.ceil((T - FIRST_LINE) / (2 * LAYER)));
  const band = topBand(p);
  // highest underside allowed: full thickness reached below the rim
  const ss = path.breakpoints(1);
  const f = ss.map((s) => {
    const q = path.at(s).p;
    return topAt(p, q[0], q[1]) - band - steps * LAYER;
  });
  const lo = Math.min(...f);
  const hi = Math.max(...f);
  const levels = Array.from({ length: Math.floor((hi - lo) / STEP) + 1 }, (_, j) => lo + j * STEP);

  // Supports: material on the wall's middle line through a whole step. The
  // pattern is cut level on both sides of a step's end at different heights:
  // a bridge of the pattern crossing it there would lose an end. Standing on
  // a support that runs from just below the lower step up to the upper one
  // (a stake, a node), every piece of pattern ends on it.
  const middle = annulus(wasm, scope, p, T / 2 - FIRST_LINE / 2, T / 2 + FIRST_LINE / 2, quality);
  const onLine = scope.keep(lower.intersect(scope.keep(middle.extrude(p.height + 1))));
  const sliceCache = new Map<number, CrossSection>();
  const sliceAt = (z: number) => {
    const key = Math.round(z * 1000);
    let cs = sliceCache.get(key);
    if (!cs) {
      cs = scope.keep(onLine.slice(z));
      sliceCache.set(key, cs);
    }
    return cs;
  };
  const supportsThrough = (z0: number, z1: number): [number, number][] => {
    let cs = sliceAt(z0 - LAYER / 2);
    for (let z = z0 + LAYER / 2; z < z1; z += LAYER) cs = scope.keep(cs.intersect(sliceAt(z)));
    return (
      cs
        .decompose()
        .map((piece) => scope.keep(piece))
        // only real supports: at least ON_SUPPORT long across the whole line,
        // not a speck where a strand grazes the middle line
        .filter((piece) => piece.area() >= FIRST_LINE * ON_SUPPORT)
        .map((piece): [number, number] => {
          let us = piece
            .toPolygons()
            .flat()
            .map((q) => path.project(q[0], q[1]));
          if (Math.max(...us) - Math.min(...us) > L / 2)
            us = us.map((u) => (u < L / 2 ? u + L : u));
          return [Math.min(...us), Math.max(...us)];
        })
        .flatMap(([a, b]): [number, number][] => [
          [a - L, b - L],
          [a, b],
          [a + L, b + L],
        ])
    );
  };

  // Each level where it fits under the rim, its ends moved inwards onto
  // supports, and nested inside the level below: wherever the underside rises
  // the lower step ends, and its end rests on a support at its own level.
  const spans: { a: number; b: number; level: number }[] = [{ a: 0, b: L, level: lo }];
  let below: [number, number][] = [[0, L]];
  for (const level of levels.slice(1)) {
    const fits = aboveLevel(ss, f, level, L);
    if (fits.length === 1 && fits[0]![1] - fits[0]![0] >= L - 1e-9) {
      spans.push({ a: 0, b: L, level });
      continue;
    }
    const sup = supportsThrough(level - STEP, level);
    const here: [number, number][] = [];
    for (const [a, b] of fits) {
      const starts = sup.filter(([sa, sb]) => sb - Math.max(a, sa) >= ON_SUPPORT && sa < b);
      const ends = sup.filter(([sa, sb]) => Math.min(b, sb) - sa >= ON_SUPPORT && sb > a);
      if (starts.length === 0 || ends.length === 0) continue;
      const a2 = Math.max(a, Math.min(...starts.map(([sa]) => sa)));
      const b2 = Math.min(b, Math.max(...ends.map(([, sb]) => sb)));
      for (const [pa, pb] of below)
        for (const k of [-L, 0, L]) {
          const x0 = Math.max(a2, pa + k);
          const x1 = Math.min(b2, pb + k);
          if (x1 - x0 > 2 * ON_SUPPORT) here.push([x0, x1]);
        }
    }
    here.forEach(([a, b]) => spans.push({ a, b, level }));
    below = here;
    if (here.length === 0) break;
  }

  // underside: the highest level over every piece of the path
  const mod = (s: number) => ((s % L) + L) % L;
  const cuts = [...new Set([0, L, ...spans.flatMap(({ a, b }) => [mod(a), mod(b)])])].sort(
    (x, y) => x - y,
  );
  const covers = (s: number, { a, b }: { a: number; b: number }) =>
    (s >= a && s <= b) || (s + L >= a && s + L <= b) || (s - L >= a && s - L <= b);
  const pieces: { a: number; b: number; level: number }[] = [];
  for (let i = 0; i + 1 < cuts.length; i++) {
    const [a, b] = [cuts[i]!, cuts[i + 1]!];
    if (b - a < 1e-6) continue;
    const level = Math.max(...spans.filter((sp) => covers((a + b) / 2, sp)).map((sp) => sp.level));
    const prev = pieces.at(-1);
    if (prev && prev.level === level) prev.b = b;
    else pieces.push({ a, b, level });
  }

  // a strip across the wall over each piece (square to the wall, radial in
  // the corners), from its level up
  const sector = (a: number, b: number): Vec2[] => {
    const n = Math.max(1, Math.ceil((b - a) / 2));
    const at = Array.from({ length: n + 1 }, (_, i) => path.at(a + ((b - a) * i) / n));
    const off =
      (k: number) =>
      ({ p: q, n: o }: { p: Vec2; n: Vec2 }): Vec2 => [q[0] + o[0] * k, q[1] + o[1] * k];
    return [...at.map(off(2)), ...at.reverse().map(off(-(T + 0.01)))];
  };
  const byLevel = new Map<number, Vec2[][]>();
  for (const { a, b, level } of pieces)
    byLevel.set(level, [...(byLevel.get(level) ?? []), sector(a, b)]);
  const roof = p.height + 1;
  const stair = scope.keep(
    Manifold.union(
      [...byLevel].map(([level, polys]) => {
        const cs = scope.keep(CrossSection.ofPolygons(polys));
        return scope.keep(scope.keep(cs.extrude(roof - level)).translate([0, 0, level]));
      }),
    ),
  );

  // grows from the middle line to the full thickness, one layer at a time
  const layers = Array.from({ length: steps + 1 }, (_, k) => {
    const th = Math.min(T, FIRST_LINE + 2 * k * LAYER);
    const ring = annulus(wasm, scope, p, T / 2 - th / 2, T / 2 + th / 2, quality);
    const tall = scope.keep(ring.extrude(roof + 1));
    return scope.keep(tall.intersect(scope.keep(stair.translate([0, 0, k * LAYER]))));
  });
  const grown = scope.keep(Manifold.union(layers));
  return { cut: stair, base: scope.keep(grown.intersect(belowTop(wasm, scope, p, 0))) };
}
