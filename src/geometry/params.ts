/** All lengths in mm. */
import { dividerTop, fitDividers } from './dividers';
import { holesBottom, patternBase, STACK_INSET, STACK_MIN_RADIUS, wallIntrusion } from './stacking';

/** 'solid' is the plain tub (internal base and reference body, not offered in the UI). */
export const WALL_STYLES = ['solid', 'hex', 'voronoi', 'expanded', 'weave', 'braid'] as const;
export type WallStyle = (typeof WALL_STYLES)[number];
/** The four walls, seen from the front (−y). */
export const SIDES = ['front', 'back', 'left', 'right'] as const;
export type Side = (typeof SIDES)[number];
/** A choice of walls (handles, label fields). */
export type Sides = Record<Side, boolean>;
export const NO_SIDES: Sides = { front: false, back: false, left: false, right: false };
/** A choice of the given walls, e.g. sides('left', 'right'). */
export const sides = (...on: Side[]): Sides => ({
  front: on.includes('front'),
  back: on.includes('back'),
  left: on.includes('left'),
  right: on.includes('right'),
});
/** The chosen walls, in SIDES order. */
export const sidesOf = (s: Sides): Side[] => SIDES.filter((k) => s[k]);
/** Handle kind: cut-out from the top edge, or a closed slot below the rim. */
export const HANDLE_TYPES = ['notch', 'slot'] as const;
export type HandleType = (typeof HANDLE_TYPES)[number];
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
  /** Height; with an irregular top the highest of the corner heights. */
  height: number;
  /**
   * Irregular top (e.g. under a sloping ceiling): the height measured at each
   * corner of the footprint (front/back = −y/+y, left/right = −x/+x). The
   * top runs straight along every wall from corner to corner. Not stackable.
   */
  irregular: boolean;
  heightFL: number;
  heightFR: number;
  heightBL: number;
  heightBR: number;
  wall: number;
  floor: number;
  cornerRadius: number;
  stackable: boolean;
  stackClearance: number;
  wallStyle: WallStyle;
  holeSize: number;
  webWidth: number;
  borderBand: number;
  /** Walls with a handle (cut-out or slot, see handleType). */
  handleSides: Sides;
  /** Width and depth of the cut-out from the top edge (mm). */
  handleWidth: number;
  handleDepth: number;
  handleType: HandleType;
  /** Closed slot: width, height of the hole and of the solid bar above it (mm). */
  slotWidth: number;
  slotHeight: number;
  slotBar: number;
  /** Solid label field in the wall: on which walls, size, corner radius, tape recess. */
  labelSides: Sides;
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
  heightFL: { min: 20, max: 300 },
  heightFR: { min: 20, max: 300 },
  heightBL: { min: 20, max: 300 },
  heightBR: { min: 20, max: 300 },
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
  irregular: false,
  heightFL: 80,
  heightFR: 80,
  heightBL: 80,
  heightBR: 80,
  wall: 1.6,
  floor: 1.2,
  cornerRadius: 10,
  stackable: true,
  stackClearance: 0.3,
  wallStyle: 'expanded',
  holeSize: 10,
  webWidth: 2.5,
  borderBand: 4,
  handleSides: { ...NO_SIDES },
  handleWidth: 60,
  handleDepth: 20,
  handleType: 'notch',
  slotWidth: 80,
  slotHeight: 25,
  slotBar: 15,
  labelSides: { ...NO_SIDES },
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
  'heightFL',
  'heightFR',
  'heightBL',
  'heightBR',
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

/** A wall: outward normal, counter-clockwise tangent, middle on the outer outline. */
export interface WallSite {
  side: Side;
  n: [number, number];
  t: [number, number];
  c: [number, number];
  /** Its two top corners. */
  corners: [CornerKey, CornerKey];
  /** Straight length between the corner arcs. */
  length: number;
  /** Arc position of the middle on a rounded-rectangle path of length L (s = 0: middle of the front). */
  s: (L: number) => number;
}

export function wallSite(p: BasketParams, side: Side): WallSite {
  const W = p.width / 2;
  const D = p.depth / 2;
  const across = p.width - 2 * p.cornerRadius;
  const deep = p.depth - 2 * p.cornerRadius;
  switch (side) {
    case 'front':
      return {
        side,
        n: [0, -1],
        t: [1, 0],
        c: [0, -D],
        corners: ['heightFL', 'heightFR'],
        length: across,
        s: () => 0,
      };
    case 'right':
      return {
        side,
        n: [1, 0],
        t: [0, 1],
        c: [W, 0],
        corners: ['heightFR', 'heightBR'],
        length: deep,
        s: (L) => L / 4,
      };
    case 'back':
      return {
        side,
        n: [0, 1],
        t: [-1, 0],
        c: [0, D],
        corners: ['heightBL', 'heightBR'],
        length: across,
        s: (L) => L / 2,
      };
    case 'left':
      return {
        side,
        n: [-1, 0],
        t: [0, -1],
        c: [-W, 0],
        corners: ['heightFL', 'heightBL'],
        length: deep,
        s: (L) => (3 * L) / 4,
      };
  }
}

/** Height of a wall's top in its middle. */
export const wallMidTop = (p: BasketParams, side: Side) => {
  const [a, b] = wallSite(p, side).corners;
  return (cornerHeight(p, a) + cornerHeight(p, b)) / 2;
};

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
    handleSides: { ...NO_SIDES, ...input.handleSides },
    labelSides: { ...NO_SIDES, ...input.labelSides },
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

  // Irregular top: no stacking (the rim is not level); every wall's top
  // rises at most 45°; the height is the highest corner.
  if (p.irregular) {
    if (p.stackable) {
      p.stackable = false;
      rule('stackable', 'false');
    }
    const edges: [CornerKey, CornerKey, number][] = [
      ['heightFL', 'heightFR', p.width],
      ['heightBL', 'heightBR', p.width],
      ['heightFL', 'heightBL', p.depth],
      ['heightFR', 'heightBR', p.depth],
    ];
    const raised = new Set<CornerKey>();
    for (let pass = 0; pass < 4; pass++)
      for (const [a, b, len] of edges)
        for (const [lo, hi] of [
          [a, b],
          [b, a],
        ] as const)
          if (p[hi] - p[lo] > len + 1e-9) {
            // rounded up, so the rise stays within 45° (idempotent)
            p[lo] = Math.ceil((p[hi] - len) * 1000 - 1e-6) / 1000;
            raised.add(lo);
          }
    raised.forEach((k) => rule(k, p[k]));
    p.height = Math.max(...CORNER_KEYS.map((k) => p[k]));
  }
  /** Lowest point of the top edge. */
  const low = lowestTop(p);

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
    p.cornerRadius < Math.min(MIN_VORONOI_CORNER_RADIUS, maxRadius)
  ) {
    // Holes run round the corners; tighter corners squeeze the inner webs.
    p.cornerRadius = Math.min(MIN_VORONOI_CORNER_RADIUS, maxRadius);
    rule('cornerRadius', p.cornerRadius);
  }
  if (isWeave) {
    // Strands must not self-intersect where they bend round the corners.
    const span = p.weave.stakeDiameter + 2 * p.weave.materialThickness;
    const minRadius = Math.max(MIN_WEAVE_CORNER_RADIUS, round(span + 1));
    // (a footprint too small for it keeps the largest radius it has)
    if (p.cornerRadius < Math.min(minRadius, maxRadius)) {
      p.cornerRadius = Math.min(minRadius, maxRadius);
      rule('cornerRadius', p.cornerRadius);
    }
  }

  // Border bands must leave a usable wall zone.
  const maxBand = Math.max(LIMITS.borderBand.min, round(low / 2 - 2));
  if (p.borderBand > maxBand) {
    p.borderBand = maxBand;
    rule('borderBand', maxBand);
  }

  if (isWeave) {
    const w = p.weave;
    const maxMaterial = Math.max(LIMITS.materialHeight.min, round(low - 2 * p.borderBand));
    if (w.materialHeight > maxMaterial) {
      w.materialHeight = maxMaterial;
      rule('weave.materialHeight', maxMaterial);
    }
    // The top rim leaves at least half the woven wall for the rows.
    const maxRim = Math.max(LIMITS.rim.min, round((low - patternBase(p)) / 2));
    if (w.rim > maxRim) {
      w.rim = maxRim;
      rule('weave.rim', maxRim);
    }
  }

  // Stacking: every foot must fit into every opening of the same footprint.
  if (p.stackable) {
    // The corner radius is part of the footprint: one minimum for all styles,
    // so the same input gives the same outline whatever the wall style.
    if (p.cornerRadius < Math.min(STACK_MIN_RADIUS, maxRadius)) {
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
    // a stake and two bands must fit into the longest spacing: thinner bands
    if (w.stakeDiameter + 2 * w.materialThickness > MAX_OPEN_SPACING) {
      w.materialThickness = Math.floor(((MAX_OPEN_SPACING - w.stakeDiameter) / 2) * 1000) / 1000;
      rule('weave.materialThickness', w.materialThickness);
    }
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

  // Handles: framed, inside the straight part of their walls, and above
  // the socket / bottom zone. A wall with no room for one loses it.
  if (sidesOf(p.handleSides).length > 0) {
    const slot = p.handleType === 'slot';
    const minWidth = slot ? LIMITS.slotWidth.min : LIMITS.handleWidth.min;
    const minRoom = slot ? LIMITS.slotBar.min + LIMITS.slotHeight.min : LIMITS.handleDepth.min;
    const widthOn = (side: Side) =>
      round(wallSite(p, side).length - 2 * (HANDLE_FRAME + HANDLE_MARGIN));
    // bar + hole (or cut-out) + frame below must stay above the socket / bottom zone
    const roomOn = (side: Side) =>
      round(wallMidTop(p, side) - patternBase(p) - HANDLE_FRAME - HANDLE_MARGIN);
    for (const side of sidesOf(p.handleSides))
      if (widthOn(side) < minWidth || roomOn(side) < minRoom) {
        p.handleSides[side] = false;
        rule(`handleSides.${side}`, 'false');
      }
    const on = sidesOf(p.handleSides);
    if (on.length > 0) {
      const maxWidth = Math.min(...on.map(widthOn));
      const room = Math.min(...on.map(roomOn));
      if (slot) {
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
      } else {
        if (p.handleWidth > maxWidth) {
          p.handleWidth = maxWidth;
          rule('handleWidth', maxWidth);
        }
        if (p.handleDepth > room) {
          p.handleDepth = room;
          rule('handleDepth', room);
        }
      }
    }
  }

  // Label field: on the straight part of its wall, between the border bands
  // (below a handle on the same wall); room for the tape recess. A wall
  // with no room for one loses it; one size fits all chosen walls.
  const labelWidthOn = (side: Side) => round(labelZone(p, side).length - 2 * LABEL_MARGIN);
  const labelHeightOn = (side: Side) => {
    const zone = labelZone(p, side);
    return round(zone.top - zone.bottom - 2 * LABEL_MARGIN);
  };
  for (const side of sidesOf(p.labelSides))
    if (
      labelWidthOn(side) < LIMITS.labelWidth.min ||
      labelHeightOn(side) < LIMITS.labelHeight.min
    ) {
      p.labelSides[side] = false;
      rule(`labelSides.${side}`, 'false');
    }
  const labelOn = sidesOf(p.labelSides);
  if (labelOn.length > 0) {
    const maxWidth = Math.min(...labelOn.map(labelWidthOn));
    const maxHeight = Math.min(...labelOn.map(labelHeightOn));
    {
      if (p.labelWidth > maxWidth) {
        p.labelWidth = maxWidth;
        rule('labelWidth', maxWidth);
      }
      // the height first: the tape recess must fit the field as it ends up
      if (p.labelHeight > maxHeight) {
        p.labelHeight = maxHeight;
        rule('labelHeight', maxHeight);
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
 * Where a label field may go on a wall: its straight length and the height
 * range between the bottom zone and the top border (or a handle on that wall).
 */
export function labelZone(
  p: BasketParams,
  side: Side,
): { length: number; bottom: number; top: number } {
  const wall = wallSite(p, side);
  const bottom = holesBottom(p);
  let top = Math.min(...wall.corners.map((k) => cornerHeight(p, k))) - topBand(p);
  if (p.handleSides[side]) {
    // the handle on the same wall, at that wall's height in its middle
    const hc = wallMidTop(p, side);
    const opening = p.handleType === 'slot' ? hc - p.slotBar - p.slotHeight : hc - p.handleDepth;
    top = Math.min(top, opening - HANDLE_FRAME);
  }
  return { length: wall.length, bottom, top };
}

export const CORNER_KEYS = ['heightFL', 'heightFR', 'heightBL', 'heightBR'] as const;
export type CornerKey = (typeof CORNER_KEYS)[number];

/** Height of the top at a corner (the plain height unless the top is irregular). */
export const cornerHeight = (p: BasketParams, k: CornerKey) => (p.irregular ? p[k] : p.height);

/** Lowest point of the top edge. */
export const lowestTop = (p: BasketParams) =>
  Math.min(...CORNER_KEYS.map((k) => cornerHeight(p, k)));

/**
 * Height of the top over (x, y) (model coordinates, origin in the middle of
 * the footprint): bilinear between the corner heights, so it runs straight
 * along every wall and every divider.
 */
export function topAt(p: BasketParams, x: number, y: number): number {
  if (!p.irregular) return p.height;
  const u = Math.min(1, Math.max(0, x / p.width + 0.5));
  const v = Math.min(1, Math.max(0, y / p.depth + 0.5));
  return (
    (1 - v) * ((1 - u) * p.heightFL + u * p.heightFR) + v * ((1 - u) * p.heightBL + u * p.heightBR)
  );
}

/** Height of the solid band along the top edge (weave: its rim). */
export const topBand = (p: BasketParams) => (p.wallStyle === 'weave' ? p.weave.rim : p.borderBand);

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
