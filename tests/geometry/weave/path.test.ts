import { describe, expect, it } from 'vitest';
import { clampParams, DEFAULTS } from '../../../src/geometry/params';
import { weaveLayout } from '../../../src/geometry/weave/layout';
import { displacement } from '../../../src/geometry/weave/path';

const p = clampParams({ ...DEFAULTS, wallStyle: 'weave', cornerRadius: 12 }).params;
const layout = weaveLayout(p);

describe('displacement', () => {
  it('reaches ±amplitude exactly at the stakes', () => {
    layout.stakes.forEach((s) => {
      expect(Math.abs(displacement(layout, 0, s))).toBeCloseTo(layout.amplitude, 9);
    });
  });

  it('alternates sides from stake to stake, also across the seam', () => {
    const signs = layout.stakes.map((s) => Math.sign(displacement(layout, 0, s)));
    for (let k = 0; k < signs.length; k++) {
      const next = signs[(k + 1) % signs.length]!;
      expect(next).toBe(-signs[k]!);
    }
  });

  it('neighbouring rows are on opposite sides at the same stake', () => {
    for (const s of layout.stakes) {
      for (let row = 0; row + 1 < layout.rows.length; row++) {
        expect(Math.sign(displacement(layout, row + 1, s))).toBe(
          -Math.sign(displacement(layout, row, s)),
        );
      }
    }
  });

  it('is periodic over the whole loop (no seam)', () => {
    const L = layout.path.length;
    for (const row of [0, 1]) {
      expect(displacement(layout, row, L)).toBeCloseTo(displacement(layout, row, 0), 9);
      expect(displacement(layout, row, L + 1.7)).toBeCloseTo(displacement(layout, row, 1.7), 9);
    }
  });
});
