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
 * band (mm). The in/out wave is gentle (sagitta < 0.01 mm at 2 mm); the
 * steps are set by the corner arcs.
 */
const ROW_STEP = { preview: 2, export: 1 } as const;
const COL_STEP = { preview: 2, export: 0.8 } as const;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
/** Bands reach this far into the border bands. */
const ANCHOR = 0.6;
/**
 * The gaps close this far (mm) before the border bands: the bands meet in
 * full, and no gap corner touches a border band in a single point.
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
  /** Reference height: a row of gaps is centered here. */
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

  // Gaps are squares standing on a corner (half diagonal hg). A row of gaps
  // closes just below the top border band, so the band rests on the bands
  // all the way round: no bridges under it.
  const hg = gap / Math.SQRT2;
  const top = p.height - p.borderBand;
  const zRef = top - TIP_CLEAR - hg;
  const floor = holesBottom(p);
  let y0 = floor;
  if (gap >= 0.5) {
    // bottom border band up to just below the lowest full row of gaps
    const n = Math.floor(((zRef - hg - TIP_CLEAR - floor) * 2) / pitch);
    if (n >= 1) y0 = zRef - (n * pitch) / 2 - hg - TIP_CLEAR;
  }
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

/**
 * Appends one band (closed mesh) to vert/tri: a grid of horizontal rows
 * (z from `z0` to `z1`) and columns across the band, outer and inner face.
 */
function bandMesh(
  l: BraidLayout,
  dir: 1 | -1,
  k: number,
  z0: number,
  z1: number,
  drawnWidth: number,
  thickness: number,
  quality: Quality,
  vert: number[],
  tri: number[],
) {
  const rows = Math.max(2, Math.ceil((z1 - z0) / Math.min(ROW_STEP[quality], l.pitch / 8)));
  const hx = drawnWidth / Math.SQRT2; // horizontal half-width of a 45° band
  const cols = Math.max(2, Math.ceil((2 * hx) / Math.min(COL_STEP[quality], l.pitch / 8)));
  const half = thickness / 2;
  const base = vert.length / 3;
  const stride = (cols + 1) * 2;
  for (let i = 0; i <= rows; i++) {
    const z = z0 + ((z1 - z0) * i) / rows;
    const c = k * l.pitch + dir * (z - l.zRef);
    for (let j = 0; j <= cols; j++) {
      const s = c - hx + (2 * hx * j) / cols;
      const d = bandOffset(l, dir, k, s, z);
      const { p: at, n } = l.path.at(s);
      for (const u of [d - half, d + half]) vert.push(at[0] + n[0] * u, at[1] + n[1] * u, z);
    }
  }
  // inner (0) and outer (1) vertex of row i, column j
  const I = (i: number, j: number) => base + i * stride + j * 2;
  const O = (i: number, j: number) => I(i, j) + 1;
  const quad = (a: number, b: number, c: number, d: number) => tri.push(a, b, c, a, c, d);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      quad(O(i, j), O(i, j + 1), O(i + 1, j + 1), O(i + 1, j)); // outer face
      quad(I(i, j + 1), I(i, j), I(i + 1, j), I(i + 1, j + 1)); // inner face
    }
    quad(I(i, 0), O(i, 0), O(i + 1, 0), I(i + 1, 0)); // left edge
    quad(O(i, cols), I(i, cols), I(i + 1, cols), O(i + 1, cols)); // right edge
  }
  for (let j = 0; j < cols; j++) {
    quad(I(0, j), I(0, j + 1), O(0, j + 1), O(0, j)); // bottom cap
    quad(O(rows, j), O(rows, j + 1), I(rows, j + 1), I(rows, j)); // top cap
  }
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
  const out: Manifold[] = [];
  for (const dir of [1, -1] as const)
    for (const parity of [0, 1]) {
      const vert: number[] = [];
      const tri: number[] = [];
      for (let k = parity; k < l.count; k += 2)
        bandMesh(
          l,
          dir,
          k,
          l.y0 - ANCHOR,
          l.y1 + ANCHOR,
          drawn,
          p.braid.bandThickness,
          quality,
          vert,
          tri,
        );
      out.push(
        new wasm.Manifold(
          new wasm.Mesh({
            numProp: 3,
            vertProperties: Float32Array.from(vert),
            triVerts: Uint32Array.from(tri),
          }),
        ),
      );
    }
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
