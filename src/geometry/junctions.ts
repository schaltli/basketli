import type { BasketParams } from './params';
import type { RoundedRectPath } from './weave/outline';

/** Sampling step when locating junctions on a path (mm). */
const SCAN = 0.25;

/**
 * Arc positions (on `path`, s = 0 at the middle of the front) where the
 * dividers meet the wall: each divider across the width meets the front and
 * the back, each divider across the depth meets the right and the left
 * side. Sorted, in [0, L).
 */
export function junctionArcs(p: BasketParams, path: RoundedRectPath): number[] {
  const L = path.length;
  const out: number[] = [];
  const find = (coord: 0 | 1, value: number, side: (q: [number, number]) => boolean) => {
    const f = (s: number) => path.at(s).p[coord] - value;
    const n = Math.ceil(L / SCAN);
    for (let i = 0; i < n; i++) {
      let a = (i * L) / n;
      let b = ((i + 1) * L) / n;
      const pa = path.at(a).p;
      if (!side(pa)) continue;
      let fa = f(a);
      const fb = f(b);
      if (fa === 0) {
        out.push(a);
        continue;
      }
      if (fa * fb > 0) continue;
      for (let k = 0; k < 40; k++) {
        const m = (a + b) / 2;
        const fm = f(m);
        if (fa * fm <= 0) b = m;
        else {
          a = m;
          fa = fm;
        }
      }
      out.push((a + b) / 2);
    }
  };
  for (const x of p.dividersX) {
    const X = -p.width / 2 + x;
    find(0, X, (q) => q[1] < 0);
    find(0, X, (q) => q[1] > 0);
  }
  for (const y of p.dividersY) {
    const Y = -p.depth / 2 + y;
    find(1, Y, (q) => q[0] > 0);
    find(1, Y, (q) => q[0] < 0);
  }
  // one crossing per wall; drop duplicates found at a sample boundary
  return [...new Set(out.map((s) => Math.round(s * 1e6) / 1e6))]
    .sort((a, b) => a - b)
    .filter((s, i, all) => i === 0 || s - all[i - 1]! > 1e-4);
}

/**
 * Wall stretches between neighbouring junctions as arc ranges [a, b] of
 * the junction centers; the last one wraps round (b may exceed L).
 */
export function wallSegments(arcs: number[], L: number): { a: number; b: number }[] {
  if (arcs.length === 0) return [];
  return arcs.map((a, i) => ({ a, b: i + 1 < arcs.length ? arcs[i + 1]! : arcs[0]! + L }));
}
