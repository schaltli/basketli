import type { Manifold, Mat4 } from 'manifold-3d';
import type { Quality } from '../basket';
import { effectiveDividerTop } from '../dividers';
import type { Scope, Wasm } from '../manifold';
import { MAX_OPEN_SPACING, type BasketParams } from '../params';
import { STAKE_SEGMENTS } from './index';
import { bandProfile, rimProfile, BAND_SAMPLES_PER_STAKE, type BandProfile } from './bands';
import type { WeaveLayout, WeaveRow } from './layout';

/** Rows reach this far into the row (or plate) below so they fuse. */
const ROW_OVERLAP = 0.05;
/** How far the divider rim reaches past the end stakes' centers (mm). */
const RIM_REACH = 0.6;

/** Column-major matrix: local X, Y, Z → a, b, e, then move by `to`. */
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

/** Distance from the outer edge to the wall's center line at `x` mm along a side `size` long. */
function centerLine(p: BasketParams, x: number, size: number, span: number): number {
  const r = p.cornerRadius;
  const d = Math.min(x, size - x);
  const bulge = d < r ? r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))) : 0;
  return bulge + span / 2;
}

/**
 * Stakes along one woven divider: one at each end (where the wall has a
 * stake at the joint), one at every crossing, evenly spaced between (as
 * close to the target spacing as possible, never above the bridge limit).
 */
export function dividerStakes(keys: number[], target: number, max: number): number[] {
  const out: number[] = [keys[0]!];
  for (let i = 1; i < keys.length; i++) {
    const a = keys[i - 1]!;
    const b = keys[i]!;
    const n = Math.max(Math.ceil((b - a) / max - 1e-9), Math.max(1, Math.round((b - a) / target)));
    for (let j = 1; j <= n; j++) out.push(a + ((b - a) * j) / n);
  }
  return out;
}

/** Where `u` lies between the stakes (integer at a stake) and the local spacing. */
function phaseAt(stakes: number[], u: number): { phase: number; step: number } {
  let i = 0;
  while (i < stakes.length - 2 && stakes[i + 1]! <= u) i++;
  const step = stakes[i + 1]! - stakes[i]!;
  return { phase: i + (u - stakes[i]!) / step, step };
}

/**
 * Closed mesh of a straight relief band, in sheet coordinates (x along the
 * divider, y across, z up): for every column u and height level the inner
 * and outer offset across the sheet. Like the ring's relief shell, but open:
 * capped at both ends.
 */
function openShell(
  wasm: Wasm,
  u: number[],
  z: number[],
  inner: number[][],
  outer: number[][],
): Manifold {
  const N = u.length;
  const K = z.length;
  const vert = new Float32Array(2 * N * K * 3);
  const O = (j: number, k: number) => j * K + k;
  const I = (j: number, k: number) => N * K + j * K + k;
  for (let j = 0; j < N; j++)
    for (let k = 0; k < K; k++) {
      // the sheet's normal is −y (as for the ring: to the right of the path)
      vert.set([u[j]!, -outer[j]![k]!, z[k]!], O(j, k) * 3);
      vert.set([u[j]!, -inner[j]![k]!, z[k]!], I(j, k) * 3);
    }
  const tri: number[] = [];
  const quad = (a: number, b: number, c: number, d: number) => tri.push(a, b, c, a, c, d);
  for (let j = 0; j + 1 < N; j++) {
    const j2 = j + 1;
    for (let k = 0; k + 1 < K; k++) {
      quad(O(j, k), O(j2, k), O(j2, k + 1), O(j, k + 1));
      quad(I(j, k), I(j, k + 1), I(j2, k + 1), I(j2, k));
    }
    quad(O(j, 0), I(j, 0), I(j2, 0), O(j2, 0));
    quad(O(j, K - 1), O(j2, K - 1), I(j2, K - 1), I(j, K - 1));
  }
  for (let k = 0; k + 1 < K; k++) {
    quad(O(0, k), O(0, k + 1), I(0, k + 1), I(0, k)); // start cap
    quad(O(N - 1, k), I(N - 1, k), I(N - 1, k + 1), O(N - 1, k + 1)); // end cap
  }
  return new wasm.Manifold(
    new wasm.Mesh({ numProp: 3, vertProperties: vert, triVerts: Uint32Array.from(tri) }),
  );
}

/** A band (or the rim) along the divider between its end stakes. */
function bandAlong(
  wasm: Wasm,
  stakes: number[],
  amplitude: number,
  half: number,
  prof: BandProfile,
  z0: number,
  row: number | undefined,
  samples: number,
  reach = 0,
): Manifold {
  const a = stakes[0]! - reach;
  const b = stakes[stakes.length - 1]! + reach;
  const cols = Math.max(2, (stakes.length - 1) * samples + 1);
  const u = Array.from({ length: cols }, (_, j) => a + ((b - a) * j) / (cols - 1));
  const z = prof.z.map((dz, k) => (k === 0 ? z0 - ROW_OVERLAP : z0 + dz));
  const inner: number[][] = [];
  const outer: number[][] = [];
  for (const s of u) {
    let mid = 0;
    let stretch = 1;
    if (row !== undefined) {
      const { phase, step } = phaseAt(stakes, s);
      mid = amplitude * Math.cos(Math.PI * phase + Math.PI * row);
      const slope = ((amplitude * Math.PI) / step) * Math.sin(Math.PI * phase + Math.PI * row);
      stretch = Math.sqrt(1 + slope * slope);
    }
    inner.push(prof.inner.map((w) => Math.max(-half, mid - stretch * w)));
    outer.push(prof.outer.map((w) => Math.min(half, mid + stretch * w)));
  }
  return openShell(wasm, u, z, inner, outer);
}

/**
 * Woven dividers for a weave basket: stakes (at both ends on the wall's
 * joint stakes, at every crossing and evenly between), bands weaving round
 * them from the floor plate up, and a flat rim on top like the wall's.
 * Every band's first layer is one line through the stakes, bridging from
 * stake to stake, exactly as in the wall.
 */
export function wovenDividers(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  wall: WeaveLayout,
  quality: Quality,
): Manifold[] {
  if (p.dividersX.length === 0 && p.dividersY.length === 0) return [];
  const w = p.weave;
  const top = effectiveDividerTop(p);
  const rimHeight = Math.min(w.rim, (top - p.floor) / 2);
  const rim: WeaveRow = { z0: top - rimHeight, z1: top };
  // rows from the floor plate up to the rim, each followed by one row gap
  const height = rim.z0 - p.floor;
  const n = Math.max(1, Math.round(height / (w.materialHeight + w.rowGap)));
  const h = height / n - w.rowGap;
  const rows: WeaveRow[] = Array.from({ length: n }, (_, i) => {
    const z0 = p.floor + i * (h + w.rowGap);
    return { z0, z1: z0 + h };
  });
  const r = w.stakeDiameter / 2;
  const half = wall.span / 2;
  const maxStep = MAX_OPEN_SPACING - w.materialThickness;
  const samples = BAND_SAMPLES_PER_STAKE[quality];
  const rimProf = rimProfile(wall.span, w.materialThickness, rimHeight);
  const stakeTop = rim.z0 + Math.min(rimProf.z[2]!, rimProf.z[3]!);
  const W = p.width;
  const D = p.depth;
  const parts: Manifold[] = [];
  const sides = [
    ...p.dividersX.map((x) => ({
      along: [0, 1, 0],
      origin: [-W / 2 + x, -D / 2, 0],
      length: D,
      ends: centerLine(p, x, W, wall.span),
      crossings: p.dividersY,
    })),
    ...p.dividersY.map((y) => ({
      along: [1, 0, 0],
      origin: [-W / 2, -D / 2 + y, 0],
      length: W,
      ends: centerLine(p, y, D, wall.span),
      crossings: p.dividersX,
    })),
  ];
  for (const side of sides) {
    const keys = [side.ends, ...side.crossings, side.length - side.ends];
    const stakes = dividerStakes(keys, w.stakeSpacing, maxStep);
    const [ax, ay] = side.along as [number, number];
    const toWorld = frame([ax, ay, 0], [-ay, ax, 0], [0, 0, 1], side.origin);
    const local: Manifold[] = [];
    rows.forEach((row, i) => {
      const prof = bandProfile(w.materialThickness, row.z1 - row.z0);
      local.push(bandAlong(wasm, stakes, wall.amplitude, half, prof, row.z0, i, samples));
    });
    // the rim reaches a little past the wall's center line into the joint
    // stakes, so the wall rim's first line (on that line) rests on it fully
    local.push(bandAlong(wasm, stakes, 0, half, rimProf, rim.z0, undefined, samples, RIM_REACH));
    const stake = scope.keep(wasm.Manifold.cylinder(stakeTop, r, r, STAKE_SEGMENTS[quality]));
    for (const s of stakes) local.push(stake.translate([s, 0, 0]));
    for (const m of local) parts.push(scope.keep(scope.keep(m).transform(toWorld)));
  }
  return parts;
}
