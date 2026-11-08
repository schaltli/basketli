import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { bandField, touches } from './bands';
import { FIRST_LINE, LAYER, type WeaveLayout } from './layout';
import { reliefShell } from './shell';

/** One height of the woven wall: per column the interval along the normal. */
interface Level {
  z: number;
  lo: Float64Array;
  hi: Float64Array;
}

/**
 * Where a base (handle band, label plate, rim base) standing on a woven wall
 * may reach, layer by layer. A line in the middle of the wall would hang out
 * beside a band, which swings in and out by the weave's amplitude; so the
 * base starts as whatever lies below it – a band, or across a row gap the
 * first line through the stakes – and grows 45° from there, LAYER sideways
 * per layer, to the full span.
 *
 * Returns the number of growth steps and, per step k, the region the base's
 * k-th layer may fill: the wall below, grown by k · LAYER and raised by
 * k · LAYER. Only heights in [zFrom, zTo] (where bases start) are followed;
 * elsewhere the region is the full span.
 */
export function weaveGrowth(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  layout: WeaveLayout,
  quality: Quality,
  zFrom: number,
  zTo: number,
): { steps: number; at: (k: number) => Manifold } {
  const half = layout.span / 2;
  const fields = layout.rows.map((_r, i) => bandField(p, layout, i, quality));
  const s = fields[0]!.s;
  const N = s.length;
  const flat = (lo: number, hi: number) => ({
    lo: new Float64Array(N).fill(lo),
    hi: new Float64Array(N).fill(hi),
  });
  const full = flat(-half, half);
  const line = flat(-FIRST_LINE / 2, FIRST_LINE / 2);
  const all: Level[] = [];
  const push = (z: number, v: { lo: Float64Array; hi: Float64Array }) => {
    if (all.length === 0 || z > all.at(-1)!.z + 1e-6) all.push({ z, ...v });
  };
  push(-1, full);
  layout.rows.forEach((r, i) => {
    const f = fields[i]!;
    const K = f.z.length;
    // below the first row lies the floor or socket; across a row gap the
    // base bridges with its first line through the stakes
    const prev = layout.rows[i - 1];
    if (!prev) push(f.z[0]! - 1e-3, full);
    else if (!touches(prev, r)) {
      push(prev.z1 + 1e-3, line);
      push(f.z[0]! - 1e-3, line);
    }
    for (let k = 0; k < K; k++)
      push(f.z[k]!, {
        lo: Float64Array.from({ length: N }, (_, j) => f.inner[j * K + k]!),
        hi: Float64Array.from({ length: N }, (_, j) => f.outer[j * K + k]!),
      });
  });
  const last = layout.rows.at(-1);
  if (last && !touches(last, layout.rim)) {
    push(last.z1 + 1e-3, line);
    push(layout.rim.z0 - 1e-3, line);
  }
  push(layout.rim.z0 + 1e-3, full);
  push(p.height + 2, full);

  // only the window where bases start, full span round it
  const lo = zFrom - 2 * LAYER;
  const hi = zTo + 2 * LAYER;
  const inside = all.filter((l) => l.z > lo && l.z < hi);
  const before = all.filter((l) => l.z <= lo).at(-1) ?? all[0]!;
  const after = all.find((l) => l.z >= hi) ?? all.at(-1)!;
  const levels = [{ ...before, z: lo }, ...inside, { ...after, z: hi }];

  const steps = Math.ceil((half + layout.amplitude) / LAYER - 1e-9);
  const at = (k: number): Manifold => {
    const d = k * LAYER;
    const zs = [-1, ...levels.map((l) => l.z + d), p.height + 2 + d];
    const K = zs.length;
    const inner = new Float64Array(N * K);
    const outer = new Float64Array(N * K);
    for (let j = 0; j < N; j++) {
      inner[j * K] = -half;
      outer[j * K] = half;
      levels.forEach((l, m) => {
        inner[j * K + m + 1] = Math.max(-half, l.lo[j]! - d);
        outer[j * K + m + 1] = Math.min(half, l.hi[j]! + d);
      });
      inner[j * K + K - 1] = -half;
      outer[j * K + K - 1] = half;
    }
    // a little past the span, so cuts flush with the wall faces stay clean
    for (let i = 0; i < N * K; i++) {
      if (inner[i]! <= -half + 1e-9) inner[i] = -half - 0.5;
      if (outer[i]! >= half - 1e-9) outer[i] = half + 0.5;
    }
    return scope.keep(
      reliefShell(wasm, { s, z: Float64Array.from(zs), inner, outer }, layout.path),
    );
  };
  return { steps, at };
}
