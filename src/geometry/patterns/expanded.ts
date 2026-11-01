import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { roundedRect, type Vec2 } from '../shapes';
import { holesBottom } from '../stacking';
import { RoundedRectPath } from '../weave/outline';

/** Longest step along the wall between two strand cross-sections (mm). */
const STRAND_STEP = { preview: 0.8, export: 0.4 } as const;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
/** Strands reach this far into the border bands. */
const ANCHOR = 0.6;

/**
 * Lattice of standing diamonds (rhombi with diagonals width × height) whose
 * parallel edges are exactly `strand` apart: the material between them forms
 * continuous diagonal strands. Returns horizontal and vertical pitch.
 */
export function diamondPitch(width: number, height: number, strand: number) {
  const f = (strand * Math.hypot(width, height)) / (width * height);
  return { ps: width * (1 + f), pz: height * (1 + f) };
}

/**
 * Largest twist (mm, edge shift outwards/inwards) that keeps the strands'
 * outer face at ≤ 45° overhang. Going up at a fixed point, the position
 * across a strand changes by w / √(w² + h²) per mm, the offset by
 * 2·twist / strand per mm across.
 */
export function maxTwist(width: number, height: number, strand: number): number {
  return (strand * Math.hypot(width, height)) / (2 * width);
}

export interface ExpandedLayout {
  /** Centerline of the sheet. */
  path: RoundedRectPath;
  /** Real horizontal pitch (fits the perimeter a whole number of times). */
  ps: number;
  pz: number;
  /** Strand zone (between the border bands). */
  y0: number;
  y1: number;
  /** Height of the first knot row. */
  knot0: number;
  /** Number of strands per family (= diamonds per row). */
  count: number;
  /** Radial half-extent of the tilted strands. */
  halfSpan: number;
}

export function expandedLayout(p: BasketParams): ExpandedLayout {
  const e = p.expanded;
  const halfSpan = p.wall / 2 + e.twist;
  const path = new RoundedRectPath(
    p.width - 2 * halfSpan,
    p.depth - 2 * halfSpan,
    p.cornerRadius - halfSpan,
  );
  const pitch = diamondPitch(e.diamondWidth, e.diamondHeight, e.strand);
  const count = Math.max(2, Math.floor(path.length / pitch.ps));
  const ps = path.length / count;
  const pz = (pitch.pz * ps) / pitch.ps; // keep the diamond's aspect ratio
  const y0 = holesBottom(p);
  const y1 = p.height - p.borderBand;
  // Knot rows every pz / 2; centre the pattern vertically.
  const rows = Math.max(1, Math.floor((y1 - y0) / (pz / 2)));
  const knot0 = y0 + (y1 - y0 - (rows - 1) * (pz / 2)) / 2;
  return { path, ps, pz, y0, y1, knot0, count, halfSpan };
}

/**
 * Appends one continuous strand (closed mesh) to vert/tri. `dir` = +1 for
 * "/" strands (rising to the right), −1 for "\" strands; `c` is the arc
 * position where its center line crosses the first knot row. The strand is
 * tilted about its own axis: upper edge `twist` outwards, lower edge inwards.
 */
function strandMesh(
  p: BasketParams,
  layout: ExpandedLayout,
  dir: 1 | -1,
  c: number,
  quality: Quality,
  vert: number[],
  tri: number[],
) {
  const half = p.wall / 2;
  const slope = layout.ps / layout.pz; // ds per dz along a strand
  const dx = (p.expanded.strand / 2) * Math.hypot(slope, 1); // horizontal half-width
  const z0 = layout.y0 - ANCHOR;
  const z1 = layout.y1 + ANCHOR;
  const steps = Math.max(2, Math.ceil(((z1 - z0) * slope) / STRAND_STEP[quality]));
  const tw = p.expanded.twist;
  const upperSide = -dir; // "/" strands: upper edge at smaller s; "\": at larger s

  const base = vert.length / 3;
  for (let i = 0; i <= steps; i++) {
    const z = z0 + ((z1 - z0) * i) / steps;
    const sc = c + dir * slope * (z - layout.knot0);
    for (const side of [-1, 1] as const) {
      const shift = side === upperSide ? tw : -tw;
      const { p: at, n } = layout.path.at(sc + side * dx);
      for (const u of [shift - half, shift + half])
        vert.push(at[0] + n[0] * u, at[1] + n[1] * u, z);
    }
  }
  // Per level: 0 = left-in, 1 = left-out, 2 = right-in, 3 = right-out.
  const v = (i: number, k: number) => base + i * 4 + k;
  const quad = (a: number, b: number, c2: number, d: number) => tri.push(a, b, c2, a, c2, d);
  for (let i = 0; i < steps; i++) {
    quad(v(i, 1), v(i, 3), v(i + 1, 3), v(i + 1, 1)); // outer face
    quad(v(i, 2), v(i, 0), v(i + 1, 0), v(i + 1, 2)); // inner face
    quad(v(i, 0), v(i, 1), v(i + 1, 1), v(i + 1, 0)); // left edge
    quad(v(i, 3), v(i, 2), v(i + 1, 2), v(i + 1, 3)); // right edge
  }
  quad(v(0, 0), v(0, 2), v(0, 3), v(0, 1)); // bottom cap
  quad(v(steps, 1), v(steps, 3), v(steps, 2), v(steps, 0)); // top cap
}

/** Both strand families, one manifold each (strands of a family never touch). */
export function strandSolids(
  wasm: Wasm,
  p: BasketParams,
  layout: ExpandedLayout,
  quality: Quality,
): Manifold[] {
  return ([1, -1] as const).map((dir) => {
    const vert: number[] = [];
    const tri: number[] = [];
    for (let k = 0; k < layout.count; k++)
      strandMesh(p, layout, dir, (k + 0.5) * layout.ps, quality, vert, tri);
    const mesh = new wasm.Mesh({
      numProp: 3,
      vertProperties: Float32Array.from(vert),
      triVerts: Uint32Array.from(tri),
    });
    return new wasm.Manifold(mesh);
  });
}

/** Ring band over the full radial span of the strands, from z0 to z1. */
function band(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  layout: ExpandedLayout,
  quality: Quality,
  z0: number,
  z1: number,
): Manifold {
  const { CrossSection } = wasm;
  const seg = CORNER_SEGMENTS[quality];
  const span = 2 * layout.halfSpan;
  const outer = scope.keep(
    CrossSection.ofPolygons([roundedRect(p.width, p.depth, p.cornerRadius, seg)]),
  );
  const inner = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(p.width - 2 * span, p.depth - 2 * span, Math.max(0, p.cornerRadius - span), seg),
    ]),
  );
  const ring = scope.keep(outer.subtract(inner));
  return scope.keep(scope.keep(ring.extrude(z1 - z0)).translate(0, 0, z0));
}

/**
 * Expanded metal wall: floor plate, bottom and top border band, and two
 * families of continuous, individually twisted diagonal strands. The diamond
 * holes are what is left between them. With `envelope`, the strand zone is
 * filled solid instead (reference body for the printability check).
 */
export function buildExpanded(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
  envelope = false,
): Manifold {
  const { Manifold, CrossSection } = wasm;
  const layout = expandedLayout(p);
  const outline = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(p.width, p.depth, p.cornerRadius, CORNER_SEGMENTS[quality]),
    ]),
  );
  const parts: Manifold[] = [scope.keep(outline.extrude(p.floor))];
  parts.push(band(wasm, scope, p, layout, quality, 0, layout.y0));
  parts.push(band(wasm, scope, p, layout, quality, layout.y1, p.height));
  if (envelope) parts.push(band(wasm, scope, p, layout, quality, layout.y0, layout.y1));
  else for (const s of strandSolids(wasm, p, layout, quality)) parts.push(scope.keep(s));
  return scope.keep(Manifold.union(parts));
}

/** Standing diamond centered at 0 (counter-clockwise), for tests and docs. */
export function diamondPolygon(width: number, height: number): Vec2[] {
  return [
    [0, -height / 2],
    [width / 2, 0],
    [0, height / 2],
    [-width / 2, 0],
  ];
}
