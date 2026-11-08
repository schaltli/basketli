import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import { MIN_WALL, type BasketParams } from '../params';
import type { Vec2 } from '../shapes';
import type { Field } from './field';
import { FIRST_LINE, LAYER, type WeaveLayout } from './layout';
import { displacement, stakePhase } from './path';
import { reliefShell } from './shell';

export const BAND_SAMPLES_PER_STAKE = { preview: 16, export: 32 } as const;
/** Rows reach this far into the row below so they fuse. */
const ROW_OVERLAP = 0.05;
/** Outer 45° chamfer at the top, as a fraction of the band thickness. */
export const CHAMFER_RATIO = 0.5;

/** Wavy centerline of one row (closed, counter-clockwise). */
export function bandCenterline(layout: WeaveLayout, row: number, quality: Quality): Vec2[] {
  const count = layout.stakeCount * BAND_SAMPLES_PER_STAKE[quality];
  const pts: Vec2[] = [];
  for (let i = 0; i < count; i++) {
    const s = (i / count) * layout.path.length;
    const { p, n } = layout.path.at(s);
    const d = displacement(layout, row, s);
    pts.push([p[0] + n[0] * d, p[1] + n[1] * d]);
  }
  return pts;
}

export interface BandProfile {
  /** Heights above the band bottom. */
  z: number[];
  /** Half-widths towards the inside / outside, perpendicular to the band. */
  inner: number[];
  outer: number[];
}

/**
 * Band cross-section (perpendicular widths, mm):
 * - first layer: one extrusion line (FIRST_LINE wide) bridging stake to stake
 * - above: grows 45° inwards and outwards to the full thickness
 * - top: outer face chamfered 45° by half the thickness; inner face vertical
 */
export function bandProfile(t: number, h: number): BandProfile {
  const line = Math.min(FIRST_LINE, t);
  const grow = (t - line) / 2; // 45°: height = sideways growth per side
  // the chamfer leaves at least MIN_WALL
  const top = Math.min(CHAMFER_RATIO * t, Math.max(0, t - MIN_WALL), Math.max(0, h - LAYER - grow));
  return {
    z: [0, LAYER, LAYER + grow, h - top, h],
    inner: [line / 2, line / 2, t / 2, t / 2, t / 2],
    outer: [line / 2, line / 2, t / 2, t / 2, t / 2 - top],
  };
}

/** Whether `upper` starts where `lower` ends (closed weave: no row gap). */
export const touches = (lower: { z1: number }, upper: { z0: number }) => upper.z0 - lower.z1 < 1e-6;

/** Moves `from` towards `to` by at most `by`. */
const toward = (from: number, to: number, by: number) =>
  from + Math.max(-by, Math.min(by, to - from));

/**
 * Band of one row (perpendicular half-widths) at arc position s: centre and
 * the stretch that keeps it `t` thick square to itself on the wave's slopes.
 */
function bandAt(layout: WeaveLayout, row: number, s: number): { mid: number; stretch: number } {
  const mid = displacement(layout, row, s);
  const { phase, step } = stakePhase(layout, s);
  const slope = ((layout.amplitude * Math.PI) / step) * Math.sin(Math.PI * phase + Math.PI * row);
  return { mid, stretch: Math.sqrt(1 + slope * slope) };
}

/**
 * Band of one row as a height field along the wall normal.
 *
 * On a row gap (or the floor) the band starts with its first line, see
 * bandProfile. In a closed weave it stands on the row below, which lies
 * displaced the other way: a narrow first line there would leave a neck
 * thinner than MIN_WALL all round, a full-width one would hang out to the
 * side. So the band starts as the top of the row below and moves over to
 * its own place at 45° (one LAYER per layer), at full thickness all the way;
 * and a band with a row (or the rim) right on top has no top chamfer.
 */
export function bandField(
  p: BasketParams,
  layout: WeaveLayout,
  row: number,
  quality: Quality,
): Field {
  const r = layout.rows[row]!;
  const t = p.weave.materialThickness;
  const h = r.z1 - r.z0;
  const below = row > 0 && touches(layout.rows[row - 1]!, r);
  const above = touches(r, layout.rows[row + 1] ?? layout.rim);
  const prof = bandProfile(t, h);
  const top = above ? 0 : prof.z[4]! - prof.z[3]!;
  // closed weave: LAYER steps while the band moves over from the row below
  const moves = below ? Math.max(1, Math.ceil((2 * layout.amplitude) / LAYER - 1e-9)) : 0;
  // [height, inner, outer half-width] for a band that starts with its line
  const own: [number, number, number][] = [0, 1, 2].map((k) => [
    prof.z[k]!,
    prof.inner[k]!,
    prof.outer[k]!,
  ]);
  const rel = below
    ? [0, ...Array.from({ length: moves }, (_, k) => (k + 1) * LAYER)]
    : own.map((x) => x[0]);
  if (top > 1e-9) rel.push(h - top);
  rel.push(h);
  // The bottom reaches ROW_OVERLAP into the row (or plate) below to fuse.
  const z = Float64Array.from(rel, (dz, k) => (k === 0 ? r.z0 - ROW_OVERLAP : r.z0 + dz));
  const cols = layout.stakeCount * BAND_SAMPLES_PER_STAKE[quality];
  const s = Float64Array.from({ length: cols }, (_, j) => (j / cols) * layout.path.length);
  const K = z.length;
  const inner = new Float64Array(cols * K);
  const outer = new Float64Array(cols * K);
  const half = layout.span / 2;

  for (let j = 0; j < cols; j++) {
    // Offsets run along the wall normal; on the slopes of the wave the band
    // is thinner perpendicular to itself, so widen by sqrt(1 + slope²).
    const { mid, stretch } = bandAt(layout, row, s[j]!);
    const w = (stretch * t) / 2;
    for (let k = 0; k < K; k++) {
      let lo: number;
      let hi: number;
      if (below) {
        const prev = bandAt(layout, row - 1, s[j]!);
        const wp = (prev.stretch * t) / 2;
        const by = Math.max(0, rel[k]!);
        lo = toward(prev.mid - wp, mid - w, by);
        hi = toward(prev.mid + wp, mid + w, by);
        if (k === K - 1) hi -= stretch * top;
      } else {
        const [, wi, wo] = own[k] ?? [0, t / 2, t / 2];
        lo = mid - stretch * wi;
        hi = mid + stretch * (k === K - 1 ? t / 2 - top : wo);
      }
      inner[j * K + k] = Math.max(-half, lo);
      outer[j * K + k] = Math.min(half, hi);
    }
  }
  return { s, z, inner, outer };
}

export function bandSolids(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  layout: WeaveLayout,
  quality: Quality,
): Manifold[] {
  return layout.rows.map((_r, i) =>
    scope.keep(reliefShell(wasm, bandField(p, layout, i, quality), layout.path)),
  );
}

/**
 * Cross-section of the flat top rim (half-widths from the weave centerline):
 * - first layer: one extrusion line on the centerline, i.e. through every
 *   stake, bridging stake to stake like the bands
 * - above: grows 45° to the full wall span
 * - top: outer edge chamfered 45° like the bands
 */
export function rimProfile(span: number, t: number, h: number): BandProfile {
  const half = span / 2;
  const line = Math.min(FIRST_LINE, span);
  const grow = half - line / 2;
  const top = Math.min(
    CHAMFER_RATIO * t,
    Math.max(0, span - MIN_WALL),
    Math.max(0, h - LAYER - grow),
  );
  return {
    z: [0, LAYER, LAYER + grow, h - top, h],
    inner: [line / 2, line / 2, half, half, half],
    outer: [line / 2, line / 2, half, half, half - top],
  };
}

/**
 * Height above the rim's bottom where it has reached the full span: after
 * its own 45° growth, or after growing out of the last row (closed weave).
 */
export function rimFullAt(p: BasketParams, layout: WeaveLayout): number {
  const own = rimProfile(layout.span, p.weave.materialThickness, layout.rim.z1 - layout.rim.z0);
  const last = layout.rows.at(-1);
  if (!last || !touches(last, layout.rim)) return own.z[2]!;
  return Math.ceil((layout.span / 2 + layout.amplitude) / LAYER - 1e-9) * LAYER;
}

/**
 * Flat closing band round the top edge: one closed ring over all stakes.
 * With a lower `z0` the same ring reaches further down (handle frames).
 * On a row gap it starts with its line (rimProfile); in a closed weave it
 * starts as the top of the last row and grows out at 45° to the full span.
 */
export function rimSolid(
  wasm: Wasm,
  p: BasketParams,
  layout: WeaveLayout,
  quality: Quality,
  z0 = layout.rim.z0,
): Manifold {
  const { z1 } = layout.rim;
  const t = p.weave.materialThickness;
  const prof = rimProfile(layout.span, t, z1 - z0);
  const last = layout.rows.at(-1);
  const onRow = z0 === layout.rim.z0 && last !== undefined && touches(last, layout.rim);
  const half = layout.span / 2;
  const top = prof.z[4]! - prof.z[3]!;
  const full = rimFullAt(p, layout);
  const rel = onRow
    ? [
        0,
        ...Array.from({ length: Math.round(full / LAYER) }, (_, k) => (k + 1) * LAYER),
        z1 - z0 - top,
        z1 - z0,
      ]
    : prof.z;
  // The bottom reaches ROW_OVERLAP down to fuse with the row below.
  const z = Float64Array.from(rel, (dz, k) => (k === 0 ? z0 - ROW_OVERLAP : z0 + dz));
  const cols = layout.stakeCount * BAND_SAMPLES_PER_STAKE[quality];
  const s = Float64Array.from({ length: cols }, (_, j) => (j / cols) * layout.path.length);
  const K = z.length;
  const inner = new Float64Array(cols * K);
  const outer = new Float64Array(cols * K);
  for (let j = 0; j < cols; j++) {
    const b = onRow ? bandAt(layout, layout.rows.length - 1, s[j]!) : undefined;
    for (let k = 0; k < K; k++) {
      if (b) {
        const w = (b.stretch * t) / 2;
        const by = Math.max(0, rel[k]!);
        inner[j * K + k] = Math.max(-half, toward(b.mid - w, -half, by));
        outer[j * K + k] = Math.min(half, toward(b.mid + w, half, by)) - (k === K - 1 ? top : 0);
      } else {
        inner[j * K + k] = -prof.inner[k]!;
        outer[j * K + k] = prof.outer[k]!;
      }
    }
  }
  return reliefShell(wasm, { s, z, inner, outer }, layout.path);
}
