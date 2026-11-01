/**
 * Wall as a height field: for every column (arc position s) and height z the
 * inner and outer surface offset along the outward wall normal, measured
 * from the weave centerline.
 */
export interface Field {
  s: Float64Array;
  z: Float64Array;
  /** Row-major [column][height]. */
  inner: Float64Array;
  outer: Float64Array;
}

/** Target wall interval [inner, outer] at arc position s and height z. */
export type FieldTarget = (s: number, z: number) => [number, number];

/**
 * Samples `target` and enforces printability bottom-up: per height step the
 * outer surface may move outwards and the inner surface inwards by at most
 * the step (45°); the wall never gets thinner than `minWall` unless the
 * target itself is thinner.
 */
export function filteredField(
  s: Float64Array,
  z: Float64Array,
  target: FieldTarget,
  minWall: number,
): Field {
  const K = z.length;
  const inner = new Float64Array(s.length * K);
  const outer = new Float64Array(s.length * K);

  for (let j = 0; j < s.length; j++) {
    let prevIn = 0;
    let prevOut = 0;
    for (let k = 0; k < K; k++) {
      const [tIn, tOut] = target(s[j]!, z[k]!);
      let lo = tIn;
      let hi = tOut;
      if (k > 0) {
        const dz = z[k]! - z[k - 1]!;
        const outClamped = hi > prevOut + dz;
        if (outClamped) hi = prevOut + dz;
        if (lo < prevIn - dz) lo = prevIn - dz;
        const minT = Math.min(minWall, tOut - tIn);
        if (hi - lo < minT) {
          // Thicken in the direction that cannot create an overhang.
          if (outClamped) lo = hi - minT;
          else hi = lo + minT;
        }
      }
      inner[j * K + k] = lo;
      outer[j * K + k] = hi;
      prevIn = lo;
      prevOut = hi;
    }
  }
  return { s, z, inner, outer };
}

/** Evenly spaced samples from a to b (inclusive), at most `step` apart. */
export function samples(a: number, b: number, step: number): Float64Array {
  const n = Math.max(1, Math.ceil((b - a) / step));
  return Float64Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}
