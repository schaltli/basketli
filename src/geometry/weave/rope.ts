import type { Quality } from '../basket';
import type { BasketParams } from '../params';
import { filteredField, samples, type Field } from './field';
import type { WeaveLayout } from './layout';
import { bandTopInterval } from './bands';

export const MIN_WALL = 1.0;
/** Thickness of the rope's top cap. */
const ROPE_TOP = 0.4;
/** Strands in the rope and depth of the grooves between them (fraction of the radius). */
const STRANDS = 3;
const GROOVE = 0.18;
/** Overlap with the band the rope sits on / carries. */
const OVERLAP = 0.4;

export const ROPE_RESOLUTION = {
  preview: { columnsPerStake: 12, dz: 0.35 },
  export: { columnsPerStake: 24, dz: 0.2 },
} as const;

interface Rope {
  zc: number;
  rv: number;
  rh: number;
  pitch: number;
}

/** Half-width of a twisted rope at angle phi around its axis. */
function ropeRadius(rope: Rope, phi: number, s: number, grooveDepth = GROOVE): number {
  const twist = (2 * Math.PI * s) / rope.pitch;
  const groove = Math.abs(Math.cos((STRANDS / 2) * (phi - twist)));
  return rope.rh * (1 - grooveDepth * (1 - groove));
}

/**
 * Rope cross-section interval at height z (outer side uses phi, inner π − phi).
 * `flatTop`: the upper half keeps the full width so a band can sit on it.
 */
function ropeInterval(rope: Rope, s: number, z: number, flatTop = false): [number, number] {
  const raw = (z - rope.zc) / rope.rv;
  const sinPhi = Math.max(-1, Math.min(flatTop ? 0 : 1, raw));
  const phi = Math.asin(sinPhi);
  const cos = Math.cos(phi);
  // Flat top: grooves fade out towards the top so the band above rests fully.
  const depth = flatTop && raw > 0 ? GROOVE * Math.max(0, 1 - raw) : GROOVE;
  const hi = Math.max(ROPE_TOP / 2, cos * ropeRadius(rope, phi, s, depth));
  const lo = -Math.max(ROPE_TOP / 2, cos * ropeRadius(rope, Math.PI - phi, s, depth));
  return [lo, hi];
}

function columns(layout: WeaveLayout, quality: Quality): Float64Array {
  const cols = layout.stakeCount * ROPE_RESOLUTION[quality].columnsPerStake;
  return Float64Array.from({ length: cols }, (_, j) => (j / cols) * layout.path.length);
}

/**
 * Twisted rope rim on top of the last row. Below the rope the field follows
 * the (chamfered) top face of the last band, so the 45° filter grows the
 * rope out of it.
 */
export function rimField(p: BasketParams, layout: WeaveLayout, quality: Quality): Field {
  const last = layout.rows.length - 1;
  const rimStart = layout.rows[last]!.z1;
  const rope: Rope = {
    zc: (rimStart + p.height) / 2,
    rv: (p.height - rimStart) / 2,
    rh: layout.span / 2,
    pitch: 3 * (p.height - rimStart),
  };
  const z = samples(rimStart - OVERLAP, p.height, ROPE_RESOLUTION[quality].dz);
  return filteredField(
    columns(layout, quality),
    z,
    (s, zz) => (zz < rimStart ? bandTopInterval(p, layout, last, s) : ropeInterval(rope, s, zz)),
    MIN_WALL,
  );
}

/** Twisted rope foot under the first row; flat on top so the first band rests on it. */
export function footField(_p: BasketParams, layout: WeaveLayout, quality: Quality): Field {
  const footTop = layout.rows[0]!.z0;
  const rope: Rope = { zc: footTop / 2, rv: footTop / 2, rh: layout.span / 2, pitch: 3 * footTop };
  // Ends exactly at the flat top; the first band reaches down into it.
  const z = samples(0, footTop, ROPE_RESOLUTION[quality].dz);
  return filteredField(
    columns(layout, quality),
    z,
    (s, zz) => ropeInterval(rope, s, zz, true),
    MIN_WALL,
  );
}
