import type { CrossSection, Manifold } from 'manifold-3d';
import { Scope } from './manifold';

/** Longest bridge a basket may rely on (SPEC: Druckbarkeit). */
export const MAX_BRIDGE = 15;
/**
 * Every anchor of a bridge must overlap the layer below by at least this area
 * (mm²): the bridge has to run into its support, not just touch it.
 */
export const MIN_ANCHOR_AREA = 0.08;
/**
 * Inside a thin wall, extrusion lines run along the wall. A one-sided piece
 * that stays inside the wall and reaches at most this far (mm) beyond the
 * layer below just extends those lines lengthwise – that prints fine.
 */
export const MAX_LINE_EXTENSION = 2;

export interface OverhangReport {
  /** Largest unsupported, non-bridge area in a single layer (mm²). */
  maxArea: number;
  /** Height of that layer (mm). */
  worstZ: number;
  /** Longest bridge found (mm, chord between its ends). */
  maxBridge: number;
  /** Height of that bridge (mm). */
  bridgeZ: number;
}

export interface OverhangOptions {
  layer?: number;
  tolerance?: number;
  /** One-sided specks narrower than this are ignored (half a 0.4 mm line). */
  minFeature?: number;
  /**
   * The same body without its holes (e.g. the plain tub of a perforated
   * wall). One-sided pieces that lie inside it are in-plane line extensions.
   */
  envelope?: Manifold;
}

/**
 * Slices the body layer by layer. Every part of a layer must either lie
 * within 45° of the layer below (lateral reach = layer height) or be a
 * bridge: a region anchored on the layer below at two or more separate
 * places, each anchor overlapping by at least MIN_ANCHOR_AREA (a single
 * extrusion line may bridge if it runs into its supports). Bridges are
 * measured. Floating regions always count as unsupported; one-sided
 * overhangs count unless thinner than `minFeature` or – with an `envelope` –
 * short line extensions within the wall plane.
 */
export function overhangReport(m: Manifold, options: OverhangOptions = {}): OverhangReport {
  const layer = options.layer ?? 0.2;
  const tolerance = options.tolerance ?? 0.02;
  const minFeature = options.minFeature ?? 0.2;
  const reach = layer + tolerance;

  const box = m.boundingBox();
  const report: OverhangReport = { maxArea: 0, worstZ: 0, maxBridge: 0, bridgeZ: 0 };
  let prevScope = new Scope();
  let prev = prevScope.keep(m.slice(box.min[2] + layer / 2));

  for (let z = box.min[2] + layer * 1.5; z < box.max[2]; z += layer) {
    const scope = new Scope();
    const cur = scope.keep(m.slice(z));
    const supported = scope.keep(prev.offset(reach, 'Round'));
    const unsupported = scope.keep(cur.subtract(supported));
    const wall = options.envelope ? scope.keep(options.envelope.slice(z)) : undefined;

    let area = 0;
    for (const part of unsupported.decompose()) {
      scope.keep(part);
      const a = part.area();
      if (a < 1e-4) continue;
      const contact = scope.keep(
        scope.keep(part.offset(reach + minFeature, 'Round')).intersect(prev),
      );
      const anchors = anchorCount(contact, 0.01);
      if (anchors === 0) {
        area += a; // floating in mid-air: always a failure, however thin
      } else if (anchors === 1) {
        if (wall && inPlaneExtension(scope, part, contact, wall)) continue;
        // Cantilever: specks thinner than minFeature cannot droop measurably.
        const opened = scope.keep(
          scope.keep(part.offset(-minFeature / 2, 'Round')).offset(minFeature / 2, 'Round'),
        );
        area += opened.area();
      } else if (anchorCount(contact, MIN_ANCHOR_AREA) < 2) {
        area += a; // only grazes its supports: not a reliable bridge
      } else {
        const length = bridgeLength(scope, part, contact);
        if (length > report.maxBridge) {
          report.maxBridge = length;
          report.bridgeZ = z;
        }
      }
    }
    if (area > report.maxArea) {
      report.maxArea = area;
      report.worstZ = z;
    }

    prevScope.dispose();
    prevScope = scope;
    prev = cur;
  }
  prevScope.dispose();
  return report;
}

/**
 * A one-sided piece inside the wall whose every point lies within
 * MAX_LINE_EXTENSION of its anchor: the wall lines are just extended.
 */
function inPlaneExtension(
  scope: Scope,
  part: CrossSection,
  contact: CrossSection,
  wall: CrossSection,
): boolean {
  const outside = scope.keep(part.subtract(scope.keep(wall.offset(0.01, 'Round')))).area();
  if (outside >= 0.01) return false;
  const reach = scope.keep(contact.offset(MAX_LINE_EXTENSION, 'Round'));
  return scope.keep(part.subtract(reach)).area() < 0.01;
}

/** Number of separate places where a part overlaps the layer below by >= minArea. */
function anchorCount(contact: CrossSection, minArea: number): number {
  let count = 0;
  for (const piece of contact.decompose()) {
    if (piece.area() >= minArea) count++;
    piece.delete();
  }
  return count;
}

/**
 * Bridge length = twice the largest distance from any point of the bridge to
 * its nearest anchor. The bounding-box chord is an upper bound and is used
 * when it is short enough; otherwise the distance is found by bisection.
 */
function chord(part: CrossSection): number {
  const b = part.bounds();
  return Math.hypot(b.max[0] - b.min[0], b.max[1] - b.min[1]);
}

function bridgeLength(scope: Scope, part: CrossSection, contact: CrossSection): number {
  const length = chord(part);
  if (length <= MAX_BRIDGE) return length;
  const uncovered = (r: number) =>
    scope.keep(part.subtract(scope.keep(contact.offset(r, 'Round')))).area() > 0.01;
  let lo = 0;
  let hi = length;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    if (uncovered(mid)) lo = mid;
    else hi = mid;
  }
  return 2 * hi;
}
