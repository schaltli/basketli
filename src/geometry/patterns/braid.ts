import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { roundedRect } from '../shapes';
import { BRAID_FUSE, holesBottom } from '../stacking';
import { RoundedRectPath } from '../weave/outline';
import { jointStrips, ringBand } from './expanded';

/**
 * Longest step between two band cross-sections, up the wall and across a
 * band (mm), on the straight sides. The in/out wave is gentle (sagitta
 * < 0.01 mm at 2 mm), so only the corner arcs need a finer grid.
 */
const ROW_STEP = { preview: 2, export: 1 } as const;
const COL_STEP = { preview: 2, export: 0.8 } as const;
/** Largest angle (rad) a grid step may turn through on a corner arc. */
const ARC_ANGLE = { preview: (5 * Math.PI) / 180, export: (2.5 * Math.PI) / 180 } as const;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
/** Bands reach this far into the border bands. */
const ANCHOR = 0.6;
/**
 * Least distance (mm) between a gap corner and a border band edge: a corner
 * touching the edge in a single point would leave degenerate slivers.
 */
const TIP_CLEAR = 0.3;
/** Below this gap the bands of a family are drawn overlapping (no touching faces). */
const MIN_GAP = 0.1;

/**
 * Layout of the 45° braid, unrolled along the wall's center line (s along
 * the path, z up, z' = z − zRef):
 * - "/" band k runs along s − z' = k·pitch, "\" band m along s + z' = m·pitch
 * - they cross at s = (k + m)·pitch/2, z' = (m − k)·pitch/2
 * - plain weave: at crossing (k, m) the "/" band lies outside if k + m is
 *   even, the "\" band if it is odd.
 */
export interface BraidLayout {
  path: RoundedRectPath;
  /** Horizontal distance between two parallel bands (fits the perimeter). */
  pitch: number;
  /** Band width and gap, both across the bands (scaled with the pitch). */
  width: number;
  gap: number;
  /** Bands per family; even, so the over/under closes round the basket. */
  count: number;
  /** Sideways displacement of a band at a crossing (± along the normal). */
  amplitude: number;
  /** Radial half-extent of the woven wall. */
  halfSpan: number;
  /** Reference height: the highest row of gaps is centered here. */
  zRef: number;
  /** Band zone between the border bands. */
  y0: number;
  y1: number;
}

/** Even count (≥ 4) whose spacing is closest to `target`. */
function evenCount(length: number, target: number): number {
  const lower = Math.max(4, Math.floor(length / target / 2) * 2);
  const upper = lower + 2;
  const err = (n: number) => Math.abs(length / n - target);
  return err(upper) < err(lower) ? upper : lower;
}

export function braidLayout(p: BasketParams): BraidLayout {
  const b = p.braid;
  const t = b.bandThickness;
  const amplitude = (t - BRAID_FUSE) / 2;
  const halfSpan = amplitude + t / 2;
  const path = new RoundedRectPath(
    p.width - 2 * halfSpan,
    p.depth - 2 * halfSpan,
    p.cornerRadius - halfSpan,
  );
  // At 45° the horizontal distance of two parallel bands is √2 · (width + gap).
  const target = Math.SQRT2 * (b.bandWidth + b.bandGap);
  const count = evenCount(path.length, target);
  const pitch = path.length / count;
  const f = pitch / target; // keep the width : gap ratio
  const width = b.bandWidth * f;
  const gap = b.bandGap * f;

  // Gaps are squares standing on a corner (half diagonal hg), in rows
  // pitch/2 apart (the crossings lie on the same rows, in between). The
  // border bands end halfway between two rows: there the weave is closed
  // when the bands are at least as wide as the gaps, and otherwise the gaps
  // are as narrow as anywhere – (gap − width)/√2, the shortest bridge.
  // Gap corners that would touch an edge in a point are moved TIP_CLEAR away.
  const hg = gap / Math.SQRT2;
  const e = hg - pitch / 4; // how far the gaps reach past the halfway line
  const shift = Math.abs(e) < TIP_CLEAR ? TIP_CLEAR + Math.abs(e) : 0;
  const top = p.height - p.borderBand;
  const zRef = top - shift - pitch / 4; // center of the highest row of gaps
  const floor = holesBottom(p);
  // bottom border band up to halfway below the lowest row of gaps
  const n = Math.floor(((zRef - pitch / 4 - shift - floor) * 2) / pitch + 1e-9);
  let y0 = zRef - (n * pitch) / 2 - pitch / 4 - shift;
  if (y0 < floor) y0 = floor;
  return { path, pitch, width, gap, count, amplitude, halfSpan, zRef, y0, y1: top };
}

/**
 * Offset along the outward normal of band `k` of family `dir` (+1 "/",
 * −1 "\") at (s, z). It depends only on the position along the band, so
 * every band stays flat across its width; it alternates between +a and −a
 * from crossing to crossing.
 */
export function bandOffset(l: BraidLayout, dir: 1 | -1, k: number, s: number, z: number): number {
  const zp = z - l.zRef;
  return dir === 1
    ? l.amplitude * Math.cos(Math.PI * (k + (s + zp) / l.pitch))
    : -l.amplitude * Math.cos(Math.PI * (k + (s - zp) / l.pitch));
}

/** Steepest in/out slope of band `k` at (s, z): |∇bandOffset| over the wall. */
function bandSlope(l: BraidLayout, dir: 1 | -1, k: number, s: number, z: number): number {
  const zp = z - l.zRef;
  const u = dir === 1 ? s + zp : s - zp;
  // the offset depends on s ± z only, so its gradient is √2 · d/du
  return (
    Math.SQRT2 *
    ((l.amplitude * Math.PI) / l.pitch) *
    Math.abs(Math.sin(Math.PI * (k + u / l.pitch)))
  );
}

/**
 * Appends one band (closed mesh) to vert/tri, on a grid of its own: rows
 * are lines straight across the band (ℓ along the band constant – the
 * in/out offset is constant on them, so the faces are exact), columns run
 * along it (q across constant). Rows and columns are finer where the band
 * runs round a corner arc. The ends stand square to the band and reach
 * past [zA, zB] at every point; the caller cuts them off level.
 */
function bandMesh(
  l: BraidLayout,
  dir: 1 | -1,
  k: number,
  zA: number,
  zB: number,
  drawnWidth: number,
  thickness: number,
  quality: Quality,
  vert: number[],
  tri: number[],
) {
  const w = drawnWidth;
  // Band coordinates → wall (s, z): the center line climbs 45° (to the
  // right for "/", to the left for ""); q runs square to it, towards +s.
  const sOf = (ell: number, q: number) => k * l.pitch + (dir * ell + q) / Math.SQRT2;
  const zOf = (ell: number, q: number) => l.zRef + (ell - dir * q) / Math.SQRT2;
  const coarseRow = Math.min(ROW_STEP[quality], l.pitch / 8);
  const coarseCol = Math.min(COL_STEP[quality], l.pitch / 8);
  const fine = Math.max(0.1, l.path.radius * ARC_ANGLE[quality]);

  // Rows from below zA to above zB at every point across the band; fine
  // while the row (plus one coarse step) touches a corner arc.
  const ell0 = Math.SQRT2 * (zA - l.zRef) - w / 2;
  const ell1 = Math.SQRT2 * (zB - l.zRef) + w / 2;
  const reach = w / (2 * Math.SQRT2) + coarseRow; // half the row's extent along s, plus a step
  const ells: number[] = [ell0];
  for (let e = ell0; e < ell1 - 1e-9;) {
    const c = sOf(e, 0);
    const step = l.path.isStraight(c - reach, c + reach) ? coarseRow : Math.min(coarseRow, fine);
    e = Math.min(ell1, e + step);
    if (ell1 - e < 0.25 * step) e = ell1; // no sliver row at the end
    ells.push(e);
  }
  const rows = ells.length - 1;

  // Columns per row, placed by density: `fine` apart (along the wall) on
  // corner arcs, `coarseCol` on the straight sides. Rows with different
  // counts are zipped together, so the mesh stays closed.
  const sub = Math.max(16, Math.ceil(w / (fine / 2)));
  const dq = w / sub;
  const across = ells.map((e) => {
    const cum = [0];
    for (let m = 0; m < sub; m++) {
      const onArc = l.path.onArc(sOf(e, -w / 2 + (m + 0.5) * dq));
      cum.push(cum[m]! + dq / (onArc ? Math.min(fine, coarseCol) : coarseCol));
    }
    const n = Math.max(2, Math.ceil(cum[sub]! - 1e-9));
    // offsets from the band's left edge (0 … w)
    const u = [0];
    let m = 0;
    for (let j = 1; j < n; j++) {
      const target = (cum[sub]! * j) / n;
      while (m < sub - 1 && cum[m + 1]! < target) m++;
      u.push((m + (target - cum[m]!) / (cum[m + 1]! - cum[m]!)) * dq);
    }
    u.push(w);
    return u;
  });

  const half = thickness / 2;
  // first vertex of every row; per column an inner and an outer vertex
  const start: number[] = [];
  for (let i = 0; i <= rows; i++) {
    start.push(vert.length / 3);
    const e = ells[i]!;
    for (const u of across[i]!) {
      const s = sOf(e, u - w / 2);
      const z = zOf(e, u - w / 2);
      const d = bandOffset(l, dir, k, s, z);
      // Between crossings the band runs in or out; widen along the normal
      // by sqrt(1 + slope²) so it stays `thickness` thick square to itself.
      const slope = bandSlope(l, dir, k, s, z);
      const h = half * Math.sqrt(1 + slope * slope);
      const { p: at, n } = l.path.at(s);
      for (const r of [d - h, d + h]) vert.push(at[0] + n[0] * r, at[1] + n[1] * r, z);
    }
  }
  const I = (i: number, j: number) => start[i]! + j * 2;
  const O = (i: number, j: number) => I(i, j) + 1;
  const last = (i: number) => across[i]!.length - 1;
  const quad = (a: number, b: number, c: number, d: number) => tri.push(a, b, c, a, c, d);
  for (let i = 0; i < rows; i++) {
    // zip row i and i + 1 across the band, always advancing the column
    // that comes first; outer face as is, inner face reversed
    const A = across[i]!;
    const B = across[i + 1]!;
    let a = 0;
    let b = 0;
    while (a < A.length - 1 || b < B.length - 1) {
      const upA = b === B.length - 1 || (a < A.length - 1 && A[a + 1]! <= B[b + 1]!);
      if (upA) {
        tri.push(O(i, a), O(i, a + 1), O(i + 1, b));
        tri.push(I(i, a + 1), I(i, a), I(i + 1, b));
        a++;
      } else {
        tri.push(O(i, a), O(i + 1, b + 1), O(i + 1, b));
        tri.push(I(i, a), I(i + 1, b), I(i + 1, b + 1));
        b++;
      }
    }
    quad(I(i, 0), O(i, 0), O(i + 1, 0), I(i + 1, 0)); // left edge
    quad(O(i, last(i)), I(i, last(i)), I(i + 1, last(i + 1)), O(i + 1, last(i + 1))); // right edge
  }
  for (let j = 0; j < last(0); j++) quad(I(0, j), I(0, j + 1), O(0, j + 1), O(0, j)); // lower end
  for (let j = 0; j < last(rows); j++) quad(O(rows, j), O(rows, j + 1), I(rows, j + 1), I(rows, j)); // upper end
}

/**
 * The bands, one manifold per family and parity: bands two apart never
 * touch, neighbours overlap where the weave is tight (the caller unions).
 */
export function braidBands(
  wasm: Wasm,
  p: BasketParams,
  l: BraidLayout,
  quality: Quality,
): Manifold[] {
  // tight weave: neighbouring bands of a family overlap a little
  const drawn = l.gap < MIN_GAP ? l.width + l.gap + MIN_GAP : l.width;
  const zA = l.y0 - ANCHOR;
  // up to where the top border band has grown to the full span: below that
  // the border alone is thinner than MIN_WALL
  const zB = l.y1 + Math.max(ANCHOR, l.halfSpan - BRAID_FUSE / 2);
  const slab = wasm.Manifold.cube([p.width + 2, p.depth + 2, zB - zA], true).translate([
    0,
    0,
    (zA + zB) / 2,
  ]);
  const out: Manifold[] = [];
  for (const dir of [1, -1] as const)
    for (const parity of [0, 1]) {
      const vert: number[] = [];
      const tri: number[] = [];
      for (let k = parity; k < l.count; k += 2)
        bandMesh(l, dir, k, zA, zB, drawn, p.braid.bandThickness, quality, vert, tri);
      const bands = new wasm.Manifold(
        new wasm.Mesh({
          numProp: 3,
          vertProperties: Float32Array.from(vert),
          triVerts: Uint32Array.from(tri),
        }),
      );
      // cut the square ends off level, ANCHOR inside the border bands
      out.push(bands.intersect(slab));
      bands.delete();
    }
  slab.delete();
  return out;
}

/** Rounded-rect contour `inset` in from the outer outline at height z. */
function contourAt(p: BasketParams, inset: number, z: number, quality: Quality) {
  return roundedRect(
    p.width - 2 * inset,
    p.depth - 2 * inset,
    Math.max(0, p.cornerRadius - inset),
    CORNER_SEGMENTS[quality],
  ).map(([x, y]): [number, number, number] => [x, y, z]);
}

/**
 * Top border band. It starts from the core every band covers whatever its
 * in/out position (BRAID_FUSE wide, on the center line) and grows 45° to the
 * full span, so it never overhangs a band lying inside or outside.
 */
function topBand(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  l: BraidLayout,
  quality: Quality,
): Manifold {
  const { Manifold } = wasm;
  const grow = l.halfSpan - BRAID_FUSE / 2;
  const z0 = l.y1;
  const z1 = Math.min(p.height, z0 + grow);
  const outer = scope.keep(
    Manifold.hull([
      ...contourAt(p, grow, z0, quality),
      ...contourAt(p, 0, z1, quality),
      ...contourAt(p, 0, p.height, quality),
    ]),
  );
  const inner = 2 * l.halfSpan;
  const cavity = scope.keep(
    Manifold.hull([
      ...contourAt(p, inner - grow, z0 - 1, quality),
      ...contourAt(p, inner - grow, z0, quality),
      ...contourAt(p, inner, z1, quality),
      ...contourAt(p, inner, p.height + 1, quality),
    ]),
  );
  return scope.keep(outer.subtract(cavity));
}

/**
 * 45° braid wall: floor plate, bottom and top border band and two families
 * of flat bands at ±45° in plain weave. Every band edge and every gap edge
 * runs at 45°, the in/out change along a band is gentle: nothing needs a
 * bridge. With `envelope`, the band zone is filled solid instead (reference
 * body for the printability check).
 */
export function buildBraid(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  envelope = false,
): Manifold {
  const { Manifold, CrossSection } = wasm;
  const l = braidLayout(p);
  const outline = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(p.width, p.depth, p.cornerRadius, CORNER_SEGMENTS[quality]),
    ]),
  );
  const h = l.halfSpan;
  const parts: Manifold[] = [scope.keep(outline.extrude(p.floor))];
  parts.push(ringBand(wasm, scope, p, h, quality, 0, l.y0));
  parts.push(topBand(wasm, scope, p, l, quality));
  if (envelope) parts.push(ringBand(wasm, scope, p, h, quality, l.y0, l.y1));
  else {
    for (const m of braidBands(wasm, p, l, quality)) parts.push(scope.keep(m));
    parts.push(...jointStrips(wasm, scope, p, h, quality));
  }
  return scope.keep(Manifold.union(parts));
}
