import { describe, expect, it } from 'vitest';
import {
  clampParams,
  DEFAULTS,
  setWeaveMaterial,
  type BasketParams,
} from '../../../src/geometry/params';
import { weaveLayout } from '../../../src/geometry/weave/layout';
import { MIN_WALL, reliefField } from '../../../src/geometry/weave/relief';

const base = clampParams({ ...DEFAULTS, wallStyle: 'weave', handles: 'none' }).params;
const variants: [string, BasketParams][] = [
  ['cane closed', base],
  ['cane open', { ...base, weave: { ...base.weave, rowGap: 4 } }],
  ['band closed', setWeaveMaterial(base, 'band')],
  [
    'thick stakes',
    clampParams({
      ...base,
      weave: { ...base.weave, stakeDiameter: 8, materialThickness: 4, stakeSpacing: 20 },
    }).params,
  ],
];

describe('reliefField', () => {
  it.each(variants)('%s: 45° rule and minimum thickness in every column', (_n, p) => {
    const layout = weaveLayout(p);
    const f = reliefField(p, layout, 'preview');
    const K = f.z.length;
    const top = p.height - layout.span / 2; // rounded rim top may get thinner
    for (let j = 0; j < f.s.length; j++) {
      for (let k = 0; k < K; k++) {
        const i = j * K + k;
        if (f.z[k]! < top)
          expect(f.outer[i]! - f.inner[i]!).toBeGreaterThanOrEqual(MIN_WALL - 1e-9);
        if (k === 0) continue;
        const dz = f.z[k]! - f.z[k - 1]!;
        expect(f.outer[i]! - f.outer[i - 1]!).toBeLessThanOrEqual(dz + 1e-9);
        expect(f.inner[i - 1]! - f.inner[i]!).toBeLessThanOrEqual(dz + 1e-9);
      }
    }
  });

  it('stays inside the outer basket wall', () => {
    const layout = weaveLayout(base);
    const f = reliefField(base, layout, 'preview');
    for (let i = 0; i < f.outer.length; i++) {
      expect(f.outer[i]!).toBeLessThanOrEqual(layout.span / 2 + 1e-9);
      expect(f.inner[i]!).toBeGreaterThanOrEqual(-layout.span / 2 - 1e-9);
    }
  });

  it('shows over/under: at a stake a row bulges out, the next row in', () => {
    const layout = weaveLayout(base);
    const f = reliefField(base, layout, 'export');
    const K = f.z.length;
    const zIndex = (z: number) => f.z.findIndex((v) => v >= z);
    const r0 = layout.rows[2]!;
    const r1 = layout.rows[3]!;
    // column a bit off the stake so the stake rib does not dominate
    const step = layout.path.length / layout.stakeCount;
    const j = Math.round(((4 * step + 2.5) / layout.path.length) * f.s.length);
    // upper part of the row, above the 45° transition from the row below
    const upper = (r: { z0: number; z1: number }) => zIndex(r.z0 + 0.8 * (r.z1 - r.z0));
    const out0 = f.outer[j * K + upper(r0)]!;
    const out1 = f.outer[j * K + upper(r1)]!;
    expect(Math.abs(out0 - out1)).toBeGreaterThan(layout.amplitude);
  });
});
