import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import type { Vec2 } from '../shapes';
import type { Field } from './field';
import { FIRST_LINE, LAYER, type WeaveLayout } from './layout';
import { displacement } from './path';
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
  const top = Math.min(CHAMFER_RATIO * t, Math.max(0, h - LAYER - grow));
  return {
    z: [0, LAYER, LAYER + grow, h - top, h],
    inner: [line / 2, line / 2, t / 2, t / 2, t / 2],
    outer: [line / 2, line / 2, t / 2, t / 2, t / 2 - top],
  };
}

/** Band of one row as a height field along the wall normal. */
export function bandField(
  p: BasketParams,
  layout: WeaveLayout,
  row: number,
  quality: Quality,
): Field {
  const r = layout.rows[row]!;
  const prof = bandProfile(p.weave.materialThickness, r.z1 - r.z0);
  // The bottom reaches ROW_OVERLAP into the row (or plate) below to fuse.
  const z = Float64Array.from(prof.z, (dz, k) => (k === 0 ? r.z0 - ROW_OVERLAP : r.z0 + dz));
  const cols = layout.stakeCount * BAND_SAMPLES_PER_STAKE[quality];
  const s = Float64Array.from({ length: cols }, (_, j) => (j / cols) * layout.path.length);
  const K = z.length;
  const inner = new Float64Array(cols * K);
  const outer = new Float64Array(cols * K);
  const step = layout.path.length / layout.stakeCount;
  const half = layout.span / 2;

  for (let j = 0; j < cols; j++) {
    const mid = displacement(layout, row, s[j]!);
    // Offsets run along the wall normal; on the slopes of the wave the band
    // is thinner perpendicular to itself, so widen by sqrt(1 + slope²).
    const slope =
      ((layout.amplitude * Math.PI) / step) * Math.sin((Math.PI * s[j]!) / step + Math.PI * row);
    const stretch = Math.sqrt(1 + slope * slope);
    for (let k = 0; k < K; k++) {
      inner[j * K + k] = Math.max(-half, mid - stretch * prof.inner[k]!);
      outer[j * K + k] = Math.min(half, mid + stretch * prof.outer[k]!);
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
