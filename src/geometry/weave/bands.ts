import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import type { Vec2 } from '../shapes';
import type { Field } from './field';
import type { WeaveLayout } from './layout';
import { displacement } from './path';
import { reliefShell } from './shell';

export const BAND_SAMPLES_PER_STAKE = { preview: 16, export: 32 } as const;
/** Rows overlap the row below by this much so they fuse at the crossings. */
const ROW_OVERLAP = 0.05;
/** Outer 45° chamfer at the top, as a fraction of the band thickness. */
export const CHAMFER_RATIO = 0.5;
/** The bottom keeps at least this much flat width so its bridges print (2 lines). */
export const MIN_BOTTOM = 0.8;

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

/**
 * Band of one row as a height field: inner face vertical, outer face with a
 * 45° chamfer at the top and a smaller one at the bottom that leaves at least
 * MIN_BOTTOM of flat bottom. That bottom rests on the row below at the
 * crossings and bridges between them.
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
  const top = Math.min(CHAMFER_RATIO * t, h / 2);
  const bottom = Math.min(Math.max(0, t - MIN_BOTTOM), top);
  const z0 = r.z0 - ROW_OVERLAP; // fuse with the row (or foot) below
  const z = Float64Array.from([z0, r.z0 + bottom, r.z1 - top, r.z1]);
  const cols = layout.stakeCount * BAND_SAMPLES_PER_STAKE[quality];
  const s = Float64Array.from({ length: cols }, (_, j) => (j / cols) * layout.path.length);
  const K = z.length;
  const inner = new Float64Array(cols * K);
  const outer = new Float64Array(cols * K);
  const chamfer = [bottom, 0, 0, top];
  const step = layout.path.length / layout.stakeCount;
  for (let j = 0; j < cols; j++) {
    const mid = displacement(layout, row, s[j]!);
    // Offsets run along the wall normal; on the slopes of the wave the band
    // is thinner perpendicular to itself, so widen by sqrt(1 + slope²).
    const slope =
      ((layout.amplitude * Math.PI) / step) * Math.sin((Math.PI * s[j]!) / step + Math.PI * row);
    const stretch = Math.sqrt(1 + slope * slope);
    const half = layout.span / 2; // stay within the wall (foot and rim width)
    for (let k = 0; k < K; k++) {
      inner[j * K + k] = Math.max(-half, mid - (stretch * t) / 2);
      outer[j * K + k] = Math.min(half, mid + stretch * (t / 2 - chamfer[k]!));
    }
  }
  return { s, z, inner, outer };
}

/** Interval of a band's (chamfered) top face at arc position s. */
export function bandTopInterval(
  p: BasketParams,
  layout: WeaveLayout,
  row: number,
  s: number,
): [number, number] {
  const r = layout.rows[row]!;
  const t = p.weave.materialThickness;
  const top = Math.min(CHAMFER_RATIO * t, (r.z1 - r.z0) / 2);
  const step = layout.path.length / layout.stakeCount;
  const mid = displacement(layout, row, s);
  const slope =
    ((layout.amplitude * Math.PI) / step) * Math.sin((Math.PI * s) / step + Math.PI * row);
  const stretch = Math.sqrt(1 + slope * slope);
  const half = layout.span / 2;
  return [Math.max(-half, mid - (stretch * t) / 2), Math.min(half, mid + stretch * (t / 2 - top))];
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
