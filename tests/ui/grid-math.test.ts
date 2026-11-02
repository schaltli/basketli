import { describe, expect, it } from 'vitest';
import {
  addDivider,
  compartments,
  dragLimits,
  evenPositions,
} from '../../src/ui/controls/gridMath';
import { MIN_COMPARTMENT } from '../../src/geometry/dividers';

// a 150 mm side with 2 mm walls and 2 mm dividers
const SIZE = 150;
const T = 2;

describe('grid math', () => {
  it('compartments: clear widths between wall and divider faces, with centers', () => {
    expect(compartments([], SIZE, T)).toEqual([{ from: 2, to: 148, width: 146, center: 75 }]);
    const c = compartments([50], SIZE, T);
    expect(c.map((x) => x.width)).toEqual([47, 97]);
    expect(c[0]!.center).toBeCloseTo(25.5, 9);
  });

  it('evenPositions: n dividers give n + 1 equal compartments', () => {
    const xs = evenPositions(3, SIZE, T);
    const widths = compartments(xs, SIZE, T).map((x) => x.width);
    widths.forEach((w) => expect(w).toBeCloseTo(widths[0]!, 6));
    expect(widths).toHaveLength(4);
  });

  it('addDivider: goes into the middle of the widest compartment', () => {
    expect(addDivider([], SIZE, T)).toEqual([75]);
    const next = addDivider([50], SIZE, T);
    expect(next).toHaveLength(2);
    expect(next[1]).toBeCloseTo(99.5, 6); // middle of 51..148
  });

  it('addDivider: no change when no compartment can be split', () => {
    const narrow = 2 * MIN_COMPARTMENT + 3 * T - 0.5;
    expect(addDivider([], narrow, T)).toEqual([]);
  });

  it('dragLimits: a divider stays between its neighbours with room for a compartment', () => {
    const [lo, hi] = dragLimits([40, 80, 120], 1, SIZE, T);
    expect(lo).toBeCloseTo(40 + T + MIN_COMPARTMENT, 9);
    expect(hi).toBeCloseTo(120 - T - MIN_COMPARTMENT, 9);
    const [first] = dragLimits([40], 0, SIZE, T);
    expect(first).toBeCloseTo(T + MIN_COMPARTMENT + T / 2, 9);
  });
});
