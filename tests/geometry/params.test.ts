import { describe, expect, it } from 'vitest';
import {
  DEFAULTS,
  HANDLE,
  LIMITS,
  MATERIAL_DEFAULTS,
  MIN_WEAVE_CORNER_RADIUS,
  clampParams,
  setWeaveMaterial,
  type BasketParams,
} from '../../src/geometry/params';

const withP = (patch: Partial<BasketParams>): BasketParams => ({ ...DEFAULTS, ...patch });
const withWeave = (patch: Partial<BasketParams['weave']>, base: Partial<BasketParams> = {}) =>
  withP({ ...base, wallStyle: 'weave', weave: { ...DEFAULTS.weave, ...patch } });

describe('DEFAULTS', () => {
  it('match the spec', () => {
    expect(DEFAULTS).toMatchObject({
      width: 150,
      depth: 100,
      height: 80,
      wall: 1.6,
      floor: 1.2,
      cornerRadius: 8,
      stackable: true,
      stackClearance: 0.3,
      wallStyle: 'expanded',
      holeSize: 10,
      webWidth: 2.5,
      borderBand: 4,
      handles: 'ends',
    });
    expect(DEFAULTS.weave).toEqual({
      material: 'cane',
      materialHeight: 6,
      materialThickness: 1.2,
      stakeSpacing: 12,
      stakeDiameter: 3,
      rowGap: 0,
    });
  });

  it('are valid (clamping changes nothing)', () => {
    const r = clampParams(DEFAULTS);
    expect(r.params).toEqual(DEFAULTS);
    expect(r.notices).toEqual([]);
  });
});

describe('clampParams – ranges', () => {
  it.each([
    ['width', 10, LIMITS.width.min],
    ['width', 999, LIMITS.width.max],
    ['height', 5, LIMITS.height.min],
    ['wall', 0.1, LIMITS.wall.min],
    ['stackClearance', 2, LIMITS.stackClearance.max],
  ] as const)('%s=%d is clamped to %d with a notice', (field, value, expected) => {
    const r = clampParams(withP({ [field]: value }));
    expect(r.params[field]).toBe(expected);
    expect(r.notices).toContainEqual(expect.objectContaining({ field }));
  });

  it('clamps nested weave values', () => {
    const r = clampParams(withWeave({ materialHeight: 100, rowGap: -1 }, { height: 300 }));
    expect(r.params.weave.materialHeight).toBe(LIMITS.materialHeight.max);
    expect(r.params.weave.rowGap).toBe(0);
    expect(r.notices.map((n) => n.field)).toEqual(
      expect.arrayContaining(['weave.materialHeight', 'weave.rowGap']),
    );
  });

  it('replaces non-finite numbers with the default', () => {
    const r = clampParams(withP({ width: Number.NaN }));
    expect(r.params.width).toBe(DEFAULTS.width);
    expect(r.notices).toContainEqual(expect.objectContaining({ field: 'width', kind: 'invalid' }));
  });

  it('does not mutate its input', () => {
    const input = withWeave({ materialHeight: 100 });
    const copy = structuredClone(input);
    clampParams(input);
    expect(input).toEqual(copy);
  });
});

describe('clampParams – dependent rules', () => {
  it('corner radius is at most half the shorter side', () => {
    const r = clampParams(withP({ width: 40, depth: 30, cornerRadius: 30, handles: 'none' }));
    expect(r.params.cornerRadius).toBe(15);
    expect(r.notices).toContainEqual(
      expect.objectContaining({ field: 'cornerRadius', kind: 'rule' }),
    );
  });

  it(`weave needs corner radius >= ${MIN_WEAVE_CORNER_RADIUS}`, () => {
    const r = clampParams(withWeave({}, { cornerRadius: 4 }));
    expect(r.params.cornerRadius).toBe(MIN_WEAVE_CORNER_RADIUS);
    expect(r.notices).toContainEqual(
      expect.objectContaining({ field: 'cornerRadius', kind: 'rule' }),
    );
  });

  it('weave: corner radius leaves room for thick strands to bend', () => {
    const r = clampParams(
      withWeave({ stakeDiameter: 8, materialThickness: 4, stakeSpacing: 15 }, { cornerRadius: 10 }),
    );
    // span = 8 + 2*4 = 16 → radius must be >= span + 1
    expect(r.params.cornerRadius).toBe(17);
    expect(r.notices).toContainEqual(
      expect.objectContaining({ field: 'cornerRadius', kind: 'rule' }),
    );
  });

  it('border bands leave room in the wall', () => {
    const r = clampParams(withP({ height: 20, borderBand: 30, handles: 'none' }));
    expect(r.params.borderBand * 2).toBeLessThan(r.params.height);
  });

  it('handles are dropped when the basket is too low', () => {
    const r = clampParams(withP({ height: 30, borderBand: 8, handles: 'ends' }));
    expect(r.params.handles).toBe('none');
    expect(r.notices).toContainEqual(expect.objectContaining({ field: 'handles', kind: 'rule' }));
  });

  it('handles are dropped when the end walls are too narrow (ends = shorter walls)', () => {
    const tooShort = HANDLE.width + 2 * HANDLE.sideMargin - 1 + 2 * DEFAULTS.cornerRadius;
    const r = clampParams(withP({ width: 200, depth: tooShort, handles: 'all' }));
    expect(r.params.handles).toBe('none');
    expect(r.notices).toContainEqual(expect.objectContaining({ field: 'handles', kind: 'rule' }));
  });

  it('weave: at least one row fits between the bands', () => {
    const r = clampParams(withWeave({ materialHeight: 40 }, { height: 50, borderBand: 8 }));
    expect(r.params.weave.materialHeight).toBeLessThanOrEqual(50 - 2 * 8);
  });

  it('weave: stake spacing leaves room for the strands', () => {
    const r = clampParams(withWeave({ stakeSpacing: 6, stakeDiameter: 8, materialThickness: 4 }));
    const w = r.params.weave;
    expect(w.stakeSpacing).toBeGreaterThanOrEqual(w.stakeDiameter + 2 * w.materialThickness);
  });

  it('weave: stake spacing limited so bands bridge at most 15 mm', () => {
    const r = clampParams(withWeave({ stakeSpacing: 30 }));
    expect(r.params.weave.stakeSpacing).toBe(15);
    expect(r.notices).toContainEqual(
      expect.objectContaining({ field: 'weave.stakeSpacing', kind: 'rule' }),
    );
  });

  it('is idempotent', () => {
    const once = clampParams(withWeave({ materialHeight: 40, stakeSpacing: 6 }, { height: 30 }));
    const twice = clampParams(once.params);
    expect(twice.params).toEqual(once.params);
    expect(twice.notices).toEqual([]);
  });
});

describe('setWeaveMaterial', () => {
  it('switching to band applies band defaults when values are untouched', () => {
    const p = setWeaveMaterial(withWeave({}), 'band');
    expect(p.weave).toMatchObject({ material: 'band', ...MATERIAL_DEFAULTS.band });
    expect(MATERIAL_DEFAULTS.band).toEqual({ materialHeight: 9, materialThickness: 0.8 });
  });

  it('keeps user-modified values', () => {
    const p = setWeaveMaterial(withWeave({ materialHeight: 9 }), 'band');
    expect(p.weave.materialHeight).toBe(9);
    expect(p.weave.materialThickness).toBe(MATERIAL_DEFAULTS.band.materialThickness);
  });
});
