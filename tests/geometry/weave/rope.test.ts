import { describe, expect, it } from 'vitest';
import {
  clampParams,
  DEFAULTS,
  setWeaveMaterial,
  type BasketParams,
} from '../../../src/geometry/params';
import type { Field } from '../../../src/geometry/weave/field';
import { weaveLayout } from '../../../src/geometry/weave/layout';
import { footField, MIN_WALL, rimField } from '../../../src/geometry/weave/rope';

const cane = clampParams({ ...DEFAULTS, wallStyle: 'weave', handles: 'none' }).params;
const variants: [string, BasketParams][] = [
  ['cane', cane],
  ['band', setWeaveMaterial(cane, 'band')],
  ['open', clampParams({ ...cane, weave: { ...cane.weave, rowGap: 4 } }).params],
];

function check45(f: Field) {
  const K = f.z.length;
  for (let j = 0; j < f.s.length; j++) {
    for (let k = 1; k < K; k++) {
      const i = j * K + k;
      const dz = f.z[k]! - f.z[k - 1]!;
      expect(f.outer[i]! - f.outer[i - 1]!).toBeLessThanOrEqual(dz + 1e-9);
      expect(f.inner[i - 1]! - f.inner[i]!).toBeLessThanOrEqual(dz + 1e-9);
    }
  }
}

describe('rope rim and foot', () => {
  it.each(variants)('%s: 45° rule, within the wall, rim reaches the top', (_n, p) => {
    const l = weaveLayout(p);
    for (const f of [rimField(p, l, 'preview'), footField(p, l, 'preview')]) {
      check45(f);
      for (let i = 0; i < f.outer.length; i++) {
        expect(f.outer[i]!).toBeLessThanOrEqual(l.span / 2 + 1e-9);
        expect(f.inner[i]!).toBeGreaterThanOrEqual(-l.span / 2 - 1e-9);
      }
    }
    const rim = rimField(p, l, 'preview');
    expect(rim.z[rim.z.length - 1]).toBeCloseTo(p.height, 9);
    const foot = footField(p, l, 'preview');
    expect(foot.z[0]).toBe(0);
    expect(foot.z[foot.z.length - 1]).toBeCloseTo(l.rows[0]!.z0, 9);
  });

  it('rim keeps the minimum wall below its rounded top', () => {
    const l = weaveLayout(cane);
    const f = rimField(cane, l, 'preview');
    const K = f.z.length;
    const rimStart = l.rows[l.rows.length - 1]!.z1;
    const zc = (rimStart + cane.height) / 2;
    for (let j = 0; j < f.s.length; j++)
      for (let k = 0; k < K; k++)
        if (f.z[k]! >= rimStart && f.z[k]! <= zc)
          expect(f.outer[j * K + k]! - f.inner[j * K + k]!).toBeGreaterThanOrEqual(MIN_WALL - 1e-9);
  });

  it('rope has twisted grooves (outer surface varies along s at mid height)', () => {
    const l = weaveLayout(cane);
    const f = rimField(cane, l, 'export');
    const K = f.z.length;
    const zc = (l.rows[l.rows.length - 1]!.z1 + cane.height) / 2;
    const k = f.z.findIndex((z) => z >= zc);
    const values = Array.from(f.s, (_s, j) => f.outer[j * K + k]!);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.3);
  });
});
