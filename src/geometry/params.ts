/** All lengths in mm. */
import { dividerTop, fitDividers } from './dividers';
import { holesBottom, patternBase, STACK_INSET, STACK_MIN_RADIUS, wallIntrusion } from './stacking';

/** 'solid' is the plain tub (internal base and reference body, not offered in the UI). */
export const WALL_STYLES = ['solid', 'hex', 'voronoi', 'expanded', 'weave', 'braid'] as const;
export type WallStyle = (typeof WALL_STYLES)[number];
/** Cut-out from the top edge: none, on one end wall, or on both end walls. */
export const HANDLE_MODES = ['none', 'one', 'ends'] as const;
export type HandleMode = (typeof HANDLE_MODES)[number];
/** Handle kind: cut-out from the top edge, or a closed slot below the rim. */
export const HANDLE_TYPES = ['notch', 'slot'] as const;
export type HandleType = (typeof HANDLE_TYPES)[number];
/** Label field: none, on an end wall (shorter) or on a side wall (longer). */
export const LABEL_POSITIONS = ['none', 'end', 'side'] as const;
export type LabelPosition = (typeof LABEL_POSITIONS)[number];
/** Recess for label-maker tape (P-touch TZe widths, mm), or none. */
export const LABEL_TAPES = ['none', '6', '9', '12', '18', '24'] as const;
export type LabelTape = (typeof LABEL_TAPES)[number];
/** Floor: closed, or holes in one of these patterns. */
export const FLOOR_PATTERNS = ['closed', 'hex', 'voronoi', 'diamond', 'slots'] as const;
export type FloorPattern = (typeof FLOOR_PATTERNS)[number];
/** Dividers carry the basket's pattern (weave: woven) or are plain. */
export const DIVIDER_STYLES = ['plain', 'pattern'] as const;
export type DividerStyle = (typeof DIVIDER_STYLES)[number];
export const WEAVE_MATERIALS = ['cane', 'band'] as const;
export type WeaveMaterial = (typeof WEAVE_MATERIALS)[number];

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
  /** Height of the flat closing band round the top edge (mm). */
  rim: number;
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

/**
 * 45° braid ("Geflecht 45°"): flat bands of equal width running at +45° and
 * −45°, woven in plain weave (over one, under one). No stakes.
 */
export interface BraidParams {
  /** Width of every band, across the band (mm). */
  bandWidth: number;
  bandThickness: number;
  /** Clear distance between neighbouring parallel bands; 0 = tight weave. */
  bandGap: number;
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
  /** Width and depth of the cut-out from the top edge (mm). */
  handleWidth: number;
  handleDepth: number;
  handleType: HandleType;
  /** Closed slot: width, height of the hole and of the solid bar above it (mm). */
  slotWidth: number;
  slotHeight: number;
  slotBar: number;
  /** Solid label field in the wall: where, size, corner radius, tape recess. */
  labelPosition: LabelPosition;
  labelWidth: number;
  labelHeight: number;
  labelRadius: number;
  labelTape: LabelTape;
  /**
   * Divider positions (centers, mm from the outer left / front edge):
   * dividersX split the width, dividersY the depth.
   */
  dividersX: number[];
  dividersY: number[];
  /** Divider top above the bottom (mm); 0 = as high as stacking allows. */
  dividerHeight: number;
  dividerStyle: DividerStyle;
  /** Holes in the floor (e.g. for cool boxes) and their size / web. */
  floorPattern: FloorPattern;
  floorHoleSize: number;
  floorWebWidth: number;
  weave: WeaveParams;
  braid: BraidParams;
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
  rim: { min: 3, max: 10 },
  cellSize: { min: 6, max: 12 },
  seed: { min: 0, max: 9999 },
  diamondWidth: { min: 3, max: 15 },
  diamondHeight: { min: 6, max: 40 },
  strand: { min: 1, max: 4 },
  twist: { min: 0, max: 2 },
  bandWidth: { min: 4, max: 20 },
  bandThickness: { min: 0.8, max: 2 },
  bandGap: { min: 0, max: 10 },
  handleWidth: { min: 30, max: 120 },
  handleDepth: { min: 10, max: 40 },
  slotWidth: { min: 40, max: 120 },
  slotHeight: { min: 15, max: 40 },
  slotBar: { min: 8, max: 30 },
  labelWidth: { min: 20, max: 150 },
  labelHeight: { min: 8, max: 60 },
  labelRadius: { min: 0, max: 15 },
  dividerHeight: { min: 0, max: 300 },
  floorHoleSize: { min: 4, max: 30 },
  floorWebWidth: { min: 1.5, max: 10 },
} as const satisfies Record<string, Range>;

export const MIN_WEAVE_CORNER_RADIUS = 10;
/** Voronoi wraps round the corners: keeps inner webs at ≥ 80 % (wall 1.6 mm). */
export const MIN_VORONOI_CORNER_RADIUS = 8;

/** Max. stake spacing of a weave (longest bridge, SPEC: Druckbarkeit). */
export const MAX_OPEN_SPACING = 15;

/** Solid frame round a handle cut-out, and solid wall left before a corner (mm). */
export const HANDLE_FRAME = 3;
export const HANDLE_MARGIN = 5;
/** Label field: distance to the corner arcs, border bands and a handle frame (mm). */
export const LABEL_MARGIN = 3;
/** Tape recess: clearance over the tape width, solid rim left round it (mm). */
export const TAPE_CLEARANCE = 0.6;
export const TAPE_RIM = 1.5;
/** Lowest divider (above the floor plate, mm). */
export const MIN_DIVIDER_HEIGHT = 10;

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
  cornerRadius: 10,
  stackable: true,
  stackClearance: 0.3,
  wallStyle: 'expanded',
  holeSize: 10,
  webWidth: 2.5,
  borderBand: 4,
  handles: 'none',
  handleWidth: 60,
  handleDepth: 20,
  handleType: 'notch',
  slotWidth: 80,
  slotHeight: 25,
  slotBar: 15,
  labelPosition: 'none',
  labelWidth: 60,
  labelHeight: 20,
  labelRadius: 3,
  labelTape: 'none',
  dividersX: [],
  dividersY: [],
  dividerHeight: 0,
  dividerStyle: 'plain',
  floorPattern: 'closed',
  floorHoleSize: 8,
  floorWebWidth: 3,
  voronoi: { cellSize: 12, seed: 1 },
  expanded: { diamondWidth: 5, diamondHeight: 12, strand: 1.6, twist: 0.6 },
  braid: { bandWidth: 8, bandThickness: 1, bandGap: 2 },
  weave: {
    material: 'cane',
    ...MATERIAL_DEFAULTS.cane,
    stakeSpacing: 12,
    stakeDiameter: 3,
    rowGap: 0,
    rim: 5,
  },
};

export type NoticeKind = 'min' | 'max' | 'invalid' | 'rule' | 'unknown';

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
  'handleWidth',
  'handleDepth',
  'slotWidth',
  'slotHeight',
  'slotBar',
  'labelWidth',
  'labelHeight',
  'labelRadius',
  'dividerHeight',
  'floorHoleSize',
  'floorWebWidth',
];
const WEAVE_NUMBERS: WeaveNumberKey[] = [
  'materialHeight',
  'materialThickness',
  'stakeSpacing',
  'stakeDiameter',
  'rowGap',
  'rim',
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
  const p: BasketParams = {
    ...input,
    dividersX: [...(input.dividersX ?? [])],
    dividersY: [...(input.dividersY ?? [])],
    weave: { ...input.weave },
  };
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
  p.braid = { ...input.braid };
  for (const k of ['bandWidth', 'bandThickness', 'bandGap'] as const)
    p.braid[k] = fit(`braid.${k}`, p.braid[k], LIMITS[k], DEFAULTS.braid[k]);
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
    (p.wallStyle === 'voronoi' ||
      p.wallStyle === 'expanded' ||
      p.wallStyle === 'hex' ||
      p.wallStyle === 'braid') &&
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
    // The top rim leaves at least half the woven wall for the rows.
    const maxRim = Math.max(LIMITS.rim.min, round((p.height - patternBase(p)) / 2));
    if (w.rim > maxRim) {
      w.rim = maxRim;
      rule('weave.rim', maxRim);
    }
  }

  // Stacking: every foot must fit into every opening of the same footprint.
  if (p.stackable) {
    // The corner radius is part of the footprint: one minimum for all styles,
    // so the same input gives the same outline whatever the wall style.
    if (p.cornerRadius < STACK_MIN_RADIUS) {
      p.cornerRadius = Math.min(STACK_MIN_RADIUS, maxRadius);
      rule('cornerRadius', p.cornerRadius);
    }
    if (p.wallStyle === 'expanded' && p.wall + 2 * p.expanded.twist > STACK_INSET) {
      p.expanded.twist = Math.max(0, round((STACK_INSET - p.wall) / 2));
      rule('expanded.twist', p.expanded.twist);
    }
    if (p.wallStyle === 'weave' && wallIntrusion(p) > STACK_INSET) {
      const w = p.weave;
      // span = 2·max(r, r − 0.325 + t/2) ≤ STACK_INSET
      const rMax = Math.min(STACK_INSET / 2, STACK_INSET / 2 + 0.325 - w.materialThickness / 2);
      w.stakeDiameter = Math.max(LIMITS.stakeDiameter.min, round(2 * rMax - 0.001));
      rule('weave.stakeDiameter', w.stakeDiameter);
      if (wallIntrusion(p) > STACK_INSET) {
        w.materialThickness = round(2 * (STACK_INSET / 2 + 0.325 - w.stakeDiameter / 2) - 0.001);
        rule('weave.materialThickness', w.materialThickness);
      }
    }
    if (p.wall > STACK_INSET) {
      p.wall = STACK_INSET;
      rule('wall', STACK_INSET);
    }
  }

  // Weave stake spacing, after the stacking rules may have made stakes or
  // bands thinner: at least room for a stake and two bands, at most the
  // longest bridge (the bridge limit wins).
  if (isWeave) {
    const w = p.weave;
    const minSpacing = round(w.stakeDiameter + 2 * w.materialThickness);
    if (w.stakeSpacing < minSpacing) {
      w.stakeSpacing = Math.min(minSpacing, LIMITS.stakeSpacing.max);
      rule('weave.stakeSpacing', w.stakeSpacing);
    }
    // Bands bridge between stakes/crossings → spacing ≤ MAX_OPEN_SPACING.
    if (w.stakeSpacing > MAX_OPEN_SPACING) {
      w.stakeSpacing = MAX_OPEN_SPACING;
      rule('weave.stakeSpacing', MAX_OPEN_SPACING);
    }
  }

  // Handles: framed, inside the straight part of the end walls, and
  // above the socket / bottom zone.
  if (p.handles !== 'none' && p.handleType === 'slot') {
    const end = Math.min(p.width, p.depth) - 2 * p.cornerRadius;
    const maxWidth = round(end - 2 * (HANDLE_FRAME + HANDLE_MARGIN));
    // bar + hole + frame below must stay above the socket / bottom zone
    const room = round(p.height - patternBase(p) - HANDLE_FRAME - HANDLE_MARGIN);
    if (maxWidth < LIMITS.slotWidth.min || room < LIMITS.slotBar.min + LIMITS.slotHeight.min) {
      p.handles = 'none';
      rule('handles', 'none');
    } else {
      if (p.slotWidth > maxWidth) {
        p.slotWidth = maxWidth;
        rule('slotWidth', maxWidth);
      }
      // compare against the rounded limits, or a second pass would clamp again
      const maxBar = round(room - LIMITS.slotHeight.min);
      if (p.slotBar > maxBar) {
        p.slotBar = maxBar;
        rule('slotBar', maxBar);
      }
      const maxHeight = round(room - p.slotBar);
      if (p.slotHeight > maxHeight) {
        p.slotHeight = maxHeight;
        rule('slotHeight', maxHeight);
      }
    }
  } else if (p.handles !== 'none') {
    const end = Math.min(p.width, p.depth) - 2 * p.cornerRadius;
    const maxWidth = round(end - 2 * (HANDLE_FRAME + HANDLE_MARGIN));
    const maxDepth = round(p.height - patternBase(p) - HANDLE_FRAME - HANDLE_MARGIN);
    if (maxWidth < LIMITS.handleWidth.min || maxDepth < LIMITS.handleDepth.min) {
      p.handles = 'none';
      rule('handles', 'none');
    } else {
      if (p.handleWidth > maxWidth) {
        p.handleWidth = maxWidth;
        rule('handleWidth', maxWidth);
      }
      if (p.handleDepth > maxDepth) {
        p.handleDepth = maxDepth;
        rule('handleDepth', maxDepth);
      }
    }
  }

  // Label field: on the straight part of its wall, between the border bands
  // (below a handle on the same wall); room for the tape recess.
  if (p.labelPosition !== 'none') {
    const zone = labelZone(p);
    const maxWidth = round(zone.length - 2 * LABEL_MARGIN);
    const maxHeight = round(zone.top - zone.bottom - 2 * LABEL_MARGIN);
    if (maxWidth < LIMITS.labelWidth.min || maxHeight < LIMITS.labelHeight.min) {
      p.labelPosition = 'none';
      rule('labelPosition', 'none');
    } else {
      if (p.labelWidth > maxWidth) {
        p.labelWidth = maxWidth;
        rule('labelWidth', maxWidth);
      }
      if (p.labelTape !== 'none') {
        const need = (tape: LabelTape) => Number(tape) + TAPE_CLEARANCE + 2 * TAPE_RIM;
        if (p.labelHeight < need(p.labelTape)) {
          const fits = LABEL_TAPES.filter(
            (t) => t !== 'none' && need(t) <= Math.min(maxHeight, LIMITS.labelHeight.max),
          );
          if (fits.length === 0 || need(fits.at(-1)!) < need(p.labelTape)) {
            // the field cannot grow enough: the widest tape that fits
            p.labelTape = fits.at(-1) ?? 'none';
            rule('labelTape', p.labelTape);
          }
          if (p.labelTape !== 'none' && p.labelHeight < need(p.labelTape)) {
            p.labelHeight = round(need(p.labelTape));
            rule('labelHeight', p.labelHeight);
          }
        }
        // the recess needs some wall behind it
        if (p.wallStyle === 'solid' || p.wallStyle === 'hex' || p.wallStyle === 'voronoi') {
          if (p.wall < 2 * TAPE_DEPTH) {
            p.wall = 2 * TAPE_DEPTH;
            rule('wall', p.wall);
          }
        }
      }
      if (p.labelHeight > maxHeight) {
        p.labelHeight = maxHeight;
        rule('labelHeight', maxHeight);
      }
      const maxRadius = round(Math.min(p.labelWidth, p.labelHeight) / 2);
      if (p.labelRadius > maxRadius) {
        p.labelRadius = maxRadius;
        rule('labelRadius', maxRadius);
      }
    }
  }

  // Dividers: in order, every compartment wide enough, below a stacked basket.
  const t = wallIntrusion(p);
  for (const [key, size] of [
    ['dividersX', p.width],
    ['dividersY', p.depth],
  ] as const) {
    const fit = fitDividers(p[key], size, t);
    if (fit.changed) {
      p[key] = fit.positions;
      rule(key, fit.positions.length);
    }
  }
  if (p.dividerHeight > 0) {
    const max = round(dividerTop(p));
    const min = round(p.floor + MIN_DIVIDER_HEIGHT);
    if (p.dividerHeight > max) {
      p.dividerHeight = max;
      rule('dividerHeight', max);
    } else if (p.dividerHeight < min) {
      p.dividerHeight = min;
      rule('dividerHeight', min);
    }
  }

  return { params: p, notices };
}

/** Depth of the tape recess below the outer face (mm): tape ~0.15 mm sits sunk in. */
export const TAPE_DEPTH = 0.4;

/**
 * Where a label field may go: the straight length of its wall and the height
 * range between the bottom zone and the top border (or a handle on that wall).
 * With one handle the label goes on the other end wall.
 */
export function labelZone(p: BasketParams): { length: number; bottom: number; top: number } {
  const walls = straightWallLengths(p);
  const length = p.labelPosition === 'side' ? walls.sides : walls.ends;
  const bottom = holesBottom(p);
  let top = p.height - (p.wallStyle === 'weave' ? p.weave.rim : p.borderBand);
  if (p.labelPosition === 'end' && p.handles === 'ends') {
    const opening =
      p.handleType === 'slot' ? p.height - p.slotBar - p.slotHeight : p.height - p.handleDepth;
    top = Math.min(top, opening - HANDLE_FRAME);
  }
  return { length, bottom, top };
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
