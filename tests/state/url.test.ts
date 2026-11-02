import { describe, expect, it } from 'vitest';
import {
  clampParams,
  DEFAULTS,
  HANDLE_MODES,
  LIMITS,
  WALL_STYLES,
  WEAVE_MATERIALS,
  type BasketParams,
} from '../../src/geometry/params';
import { seededRandom } from '../../src/geometry/random';
import { FIELDS, parse, serialize } from '../../src/state/url';

const LIMIT_OF: Record<string, keyof typeof LIMITS> = {
  'weave.materialHeight': 'materialHeight',
  'weave.materialThickness': 'materialThickness',
  'weave.stakeSpacing': 'stakeSpacing',
  'weave.stakeDiameter': 'stakeDiameter',
  'weave.rowGap': 'rowGap',
  'weave.rim': 'rim',
  'voronoi.cellSize': 'cellSize',
  'voronoi.seed': 'seed',
  'expanded.diamondWidth': 'diamondWidth',
  'expanded.diamondHeight': 'diamondHeight',
  'expanded.strand': 'strand',
  'expanded.twist': 'twist',
};

/** Random parameters inside the limits, then clamped (= a reachable state). */
function randomParams(rnd: () => number): BasketParams {
  const p = structuredClone(DEFAULTS) as unknown as Record<string, Record<string, unknown>>;
  for (const { path, kind } of FIELDS) {
    const keys = path.split('.');
    const parent = keys.length === 2 ? p[keys[0]!]! : (p as Record<string, unknown>);
    const key = keys[keys.length - 1]!;
    if (kind.type === 'bool') parent[key] = rnd() < 0.5;
    else if (kind.type === 'enum')
      parent[key] = kind.values[Math.floor(rnd() * kind.values.length)];
    else {
      const lim = LIMITS[(LIMIT_OF[path] ?? path) as keyof typeof LIMITS];
      const v = lim.min + rnd() * (lim.max - lim.min);
      parent[key] = Math.round(v * 10) / 10;
    }
  }
  return clampParams(p as unknown as BasketParams).params;
}

describe('url', () => {
  it('covers every parameter', () => {
    const paths = FIELDS.map((f) => f.path);
    expect(paths).toEqual(
      expect.arrayContaining([
        'width',
        'wallStyle',
        'weave.rowGap',
        'expanded.twist',
        'voronoi.seed',
      ]),
    );
    expect(FIELDS.find((f) => f.path === 'wallStyle')!.kind).toEqual({
      type: 'enum',
      values: WALL_STYLES,
    });
    expect(FIELDS.find((f) => f.path === 'handles')!.kind).toEqual({
      type: 'enum',
      values: HANDLE_MODES,
    });
    expect(FIELDS.find((f) => f.path === 'weave.material')!.kind).toEqual({
      type: 'enum',
      values: WEAVE_MATERIALS,
    });
  });

  it('defaults serialize to just the version', () => {
    expect(serialize(DEFAULTS)).toBe('v=1');
  });

  it('only writes values that differ from the defaults', () => {
    const q = serialize({ ...DEFAULTS, width: 120, weave: { ...DEFAULTS.weave, rowGap: 4 } });
    expect(q).toBe('v=1&width=120&weave.rowGap=4');
  });

  it('round-trips 200 random valid configurations', () => {
    const rnd = seededRandom(42);
    for (let i = 0; i < 200; i++) {
      const p = randomParams(rnd);
      const back = parse(serialize(p));
      expect(back.params).toEqual(p);
      expect(back.notices).toEqual([]);
    }
  });

  it('broken or unknown values fall back to defaults with notices, never throw', () => {
    const r = parse('v=1&width=abc&wallStyle=plaid&stackable=yes&color=red&height=999');
    expect(r.params.width).toBe(DEFAULTS.width);
    expect(r.params.wallStyle).toBe(DEFAULTS.wallStyle);
    expect(r.params.stackable).toBe(DEFAULTS.stackable);
    expect(r.params.height).toBe(LIMITS.height.max);
    const fields = r.notices.map((n) => `${n.field}:${n.kind}`);
    expect(fields).toEqual(
      expect.arrayContaining([
        'width:invalid',
        'wallStyle:invalid',
        'stackable:invalid',
        'color:unknown',
        'height:max',
      ]),
    );
  });

  it('accepts an empty query', () => {
    expect(parse('').params).toEqual(clampParams(DEFAULTS).params);
  });
});
