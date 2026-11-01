/** All lengths in mm. */

export type WallStyle = 'solid' | 'hex' | 'slots' | 'diamond' | 'voronoi' | 'expanded' | 'weave';
export type HandleMode = 'none' | 'ends' | 'all';
export type WeaveMaterial = 'cane' | 'band';

export interface WeaveParams {
  material: WeaveMaterial;
  /** Cane: cross-section height. Band: band width. */
  materialHeight: number;
  materialThickness: number;
  /** Target spacing; the layout rounds to an odd stake count. */
  stakeSpacing: number;
  stakeDiameter: number;
  /** Gap between rows; 0 = closed weave. */
  rowGap: number;
}

/** Expanded metal ("Streckmetall"): standing diamond holes, twisted strands. */
export interface ExpandedParams {
  /** Diagonals of the standing diamond holes. */
  diamondWidth: number;
  diamondHeight: number;
  /** Strand width (between two diamonds). */
  strand: number;
  /** Each strand is tilted about its axis: edges shifted ± this much (mm). */
  twist: number;
}

export interface VoronoiParams {
  /** Mean cell size (mm). */
  cellSize: number;
  /** Seed of the random cell layout ("re-roll"). */
  seed: number;
}

export interface BasketParams {
  width: number;
  depth: number;
  height: number;
  wall: number;
  floor: number;
  cornerRadius: number;
  stackable: boolean;
  stackClearance: number;
  wallStyle: WallStyle;
  holeSize: number;
  webWidth: number;
  borderBand: number;
  handles: HandleMode;
  weave: WeaveParams;
  voronoi: VoronoiParams;
  expanded: ExpandedParams;
}

export interface Range {
  min: number;
  max: number;
}

export const LIMITS = {
  width: { min: 30, max: 400 },
  depth: { min: 30, max: 400 },
  height: { min: 20, max: 300 },
  wall: { min: 0.8, max: 5 },
  floor: { min: 0.6, max: 5 },
  cornerRadius: { min: 0, max: 30 },
  stackClearance: { min: 0.1, max: 1 },
  holeSize: { min: 3, max: 40 },
  webWidth: { min: 1, max: 10 },
  borderBand: { min: 3, max: 30 },
  materialHeight: { min: 3, max: 40 },
  materialThickness: { min: 0.8, max: 4 },
  stakeSpacing: { min: 6, max: 40 },
  stakeDiameter: { min: 2, max: 8 },
  rowGap: { min: 0, max: 10 },
  cellSize: { min: 6, max: 12 },
  seed: { min: 0, max: 9999 },
  diamondWidth: { min: 3, max: 15 },
  diamondHeight: { min: 6, max: 40 },
  strand: { min: 1, max: 4 },
  twist: { min: 0, max: 2 },
} as const satisfies Record<string, Range>;

export const MIN_WEAVE_CORNER_RADIUS = 10;
/** Voronoi wraps round the corners: keeps inner webs at ≥ 80 % (wall 1.6 mm). */
export const MIN_VORONOI_CORNER_RADIUS = 8;

/** Max. stake spacing of a weave (longest bridge, SPEC: Druckbarkeit). */
export const MAX_OPEN_SPACING = 15;

/** Fixed handle cut-out geometry (SPEC: Griffmulden). */
export const HANDLE = {
  width: 60,
  height: 20,
  topOffset: 8,
  /** Minimum solid wall left and right of the handle. */
  sideMargin: 5,
} as const;

export const MATERIAL_DEFAULTS: Record<
  WeaveMaterial,
  Pick<WeaveParams, 'materialHeight' | 'materialThickness'>
> = {
  cane: { materialHeight: 6, materialThickness: 1.2 },
  band: { materialHeight: 9, materialThickness: 0.8 },
};

export const DEFAULTS: BasketParams = {
  width: 150,
  depth: 100,
  height: 80,
  wall: 1.6,
  floor: 1.2,
  cornerRadius: 4,
  stackable: true,
  stackClearance: 0.3,
  wallStyle: 'hex',
  holeSize: 10,
  webWidth: 2.5,
  borderBand: 4,
  handles: 'ends',
  voronoi: { cellSize: 12, seed: 1 },
  expanded: { diamondWidth: 5, diamondHeight: 12, strand: 1.6, twist: 0.6 },
  weave: {
    material: 'cane',
    ...MATERIAL_DEFAULTS.cane,
    stakeSpacing: 12,
    stakeDiameter: 3,
    rowGap: 0,
  },
};

export type NoticeKind = 'min' | 'max' | 'invalid' | 'rule';

/** Machine-readable correction; the UI translates it into text. */
export interface Notice {
  field: string;
  kind: NoticeKind;
  /** The value that was applied. */
  value: number | string;
}

export interface ClampResult {
  params: BasketParams;
  notices: Notice[];
}

type TopNumberKey = {
  [K in keyof BasketParams]: BasketParams[K] extends number ? K : never;
}[keyof BasketParams];
type WeaveNumberKey = Exclude<keyof WeaveParams, 'material'>;

const TOP_NUMBERS: TopNumberKey[] = [
  'width',
  'depth',
  'height',
  'wall',
  'floor',
  'cornerRadius',
  'stackClearance',
  'holeSize',
  'webWidth',
  'borderBand',
];
const WEAVE_NUMBERS: WeaveNumberKey[] = [
  'materialHeight',
  'materialThickness',
  'stakeSpacing',
  'stakeDiameter',
  'rowGap',
];

const round = (v: number) => Math.round(v * 1000) / 1000;

/** Straight length of the shorter (end) and longer (side) walls. */
export function straightWallLengths(p: BasketParams): { ends: number; sides: number } {
  const shorter = Math.min(p.width, p.depth);
  const longer = Math.max(p.width, p.depth);
  return { ends: shorter - 2 * p.cornerRadius, sides: longer - 2 * p.cornerRadius };
}

/**
 * Returns params with every value inside its range and all dependent rules
 * satisfied. Pure: never mutates its input. Idempotent.
 */
export function clampParams(input: BasketParams): ClampResult {
  const p: BasketParams = { ...input, weave: { ...input.weave } };
  const notices: Notice[] = [];

  const fit = (field: string, value: number, range: Range, fallback: number): number => {
    if (!Number.isFinite(value)) {
      notices.push({ field, kind: 'invalid', value: fallback });
      return fallback;
    }
    if (value < range.min) {
      notices.push({ field, kind: 'min', value: range.min });
      return range.min;
    }
    if (value > range.max) {
      notices.push({ field, kind: 'max', value: range.max });
      return range.max;
    }
    return value;
  };
  const rule = (field: string, value: number | string) =>
    notices.push({ field, kind: 'rule', value });

  for (const k of TOP_NUMBERS) p[k] = fit(k, p[k], LIMITS[k], DEFAULTS[k]);
  p.expanded = { ...input.expanded };
  for (const k of ['diamondWidth', 'diamondHeight', 'strand', 'twist'] as const)
    p.expanded[k] = fit(`expanded.${k}`, p.expanded[k], LIMITS[k], DEFAULTS.expanded[k]);
  // Diamonds stand upright: clearly taller than wide (steep, pointed tops).
  const e = p.expanded;
  const minHeight = round(1.5 * e.diamondWidth);
  if (e.diamondHeight < minHeight) {
    e.diamondHeight = Math.min(minHeight, LIMITS.diamondHeight.max);
    rule('expanded.diamondHeight', e.diamondHeight);
  }
  // Twisted strands: outer face must not overhang more than 45°.
  const twistLimit = round(
    (e.strand * Math.hypot(e.diamondWidth, e.diamondHeight)) / (2 * e.diamondWidth) - 0.01,
  );
  if (e.twist > twistLimit) {
    e.twist = Math.max(0, twistLimit);
    rule('expanded.twist', e.twist);
  }
  p.voronoi = { ...input.voronoi };
  p.voronoi.cellSize = fit(
    'voronoi.cellSize',
    p.voronoi.cellSize,
    LIMITS.cellSize,
    DEFAULTS.voronoi.cellSize,
  );
  p.voronoi.seed = Math.round(
    fit('voronoi.seed', p.voronoi.seed, LIMITS.seed, DEFAULTS.voronoi.seed),
  );
  for (const k of WEAVE_NUMBERS)
    p.weave[k] = fit(`weave.${k}`, p.weave[k], LIMITS[k], DEFAULTS.weave[k]);

  const isWeave = p.wallStyle === 'weave';

  // Corner radius: fits the footprint; weave strands need room to bend.
  const maxRadius = round(Math.min(p.width, p.depth) / 2);
  if (p.cornerRadius > maxRadius) {
    p.cornerRadius = maxRadius;
    rule('cornerRadius', maxRadius);
  }
  if (
    (p.wallStyle === 'voronoi' || p.wallStyle === 'expanded') &&
    p.cornerRadius < MIN_VORONOI_CORNER_RADIUS
  ) {
    // Holes run round the corners; tighter corners squeeze the inner webs.
    p.cornerRadius = Math.min(MIN_VORONOI_CORNER_RADIUS, maxRadius);
    rule('cornerRadius', p.cornerRadius);
  }
  if (isWeave) {
    // Strands must not self-intersect where they bend round the corners.
    const span = p.weave.stakeDiameter + 2 * p.weave.materialThickness;
    const minRadius = Math.max(MIN_WEAVE_CORNER_RADIUS, round(span + 1));
    if (p.cornerRadius < minRadius) {
      p.cornerRadius = Math.min(minRadius, maxRadius);
      rule('cornerRadius', p.cornerRadius);
    }
  }

  // Border bands must leave a usable wall zone.
  const maxBand = Math.max(LIMITS.borderBand.min, round(p.height / 2 - 2));
  if (p.borderBand > maxBand) {
    p.borderBand = maxBand;
    rule('borderBand', maxBand);
  }

  if (isWeave) {
    const w = p.weave;
    const maxMaterial = Math.max(LIMITS.materialHeight.min, round(p.height - 2 * p.borderBand));
    if (w.materialHeight > maxMaterial) {
      w.materialHeight = maxMaterial;
      rule('weave.materialHeight', maxMaterial);
    }
    // Bands bridge between stakes/crossings → spacing ≤ MAX_OPEN_SPACING.
    if (w.stakeSpacing > MAX_OPEN_SPACING) {
      w.stakeSpacing = MAX_OPEN_SPACING;
      rule('weave.stakeSpacing', MAX_OPEN_SPACING);
    }
    const minSpacing = round(w.stakeDiameter + 2 * w.materialThickness);
    if (w.stakeSpacing < minSpacing) {
      w.stakeSpacing = Math.min(minSpacing, LIMITS.stakeSpacing.max);
      rule('weave.stakeSpacing', w.stakeSpacing);
    }
  }

  // Handles: need height below the top rim and enough straight wall.
  if (p.handles !== 'none') {
    const neededHeight = HANDLE.topOffset + HANDLE.height + p.borderBand + p.floor;
    const neededLength = HANDLE.width + 2 * HANDLE.sideMargin;
    const { ends } = straightWallLengths(p);
    if (p.height < neededHeight || ends < neededLength) {
      p.handles = 'none';
      rule('handles', 'none');
    }
  }

  return { params: p, notices };
}

/** Switches weave material; untouched size values follow the new material's defaults. */
export function setWeaveMaterial(p: BasketParams, material: WeaveMaterial): BasketParams {
  const prev = MATERIAL_DEFAULTS[p.weave.material];
  const next = MATERIAL_DEFAULTS[material];
  const weave: WeaveParams = { ...p.weave, material };
  if (p.weave.materialHeight === prev.materialHeight) weave.materialHeight = next.materialHeight;
  if (p.weave.materialThickness === prev.materialThickness)
    weave.materialThickness = next.materialThickness;
  return { ...p, weave };
}
