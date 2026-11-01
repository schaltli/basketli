import type { CrossSection, Manifold } from 'manifold-3d';
import { Scope } from './manifold';

/** Longest bridge a basket may rely on (SPEC: Druckbarkeit). */
export const MAX_BRIDGE = 15;
/** Narrowest bridge that prints reliably: two 0.4 mm extrusion lines. */
export const MIN_BRIDGE_WIDTH = 0.8;
/** Thinner bridges are fine only over gaps up to this length. */
export const MAX_THIN_BRIDGE = 1;

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
}

/**
 * Slices the body layer by layer. Every part of a layer must either lie
 * within 45° of the layer below (lateral reach = layer height) or be a
 * bridge: a region anchored on the layer below at two or more separate
 * places. Bridges are measured. Floating regions (no anchor) always count as
 * unsupported; one-sided overhangs count unless thinner than `minFeature`.
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

    let area = 0;
    for (const part of unsupported.decompose()) {
      scope.keep(part);
      const a = part.area();
      if (a < 1e-4) continue;
      const contact = scope.keep(
        scope.keep(part.offset(reach + minFeature, 'Round')).intersect(prev),
      );
      const anchors = anchorCount(contact);
      if (anchors === 0) {
        area += a; // floating in mid-air: always a failure, however thin
      } else if (anchors === 1) {
        // Cantilever: specks thinner than minFeature cannot droop measurably.
        const opened = scope.keep(
          scope.keep(part.offset(-minFeature / 2, 'Round')).offset(minFeature / 2, 'Round'),
        );
        area += opened.area();
      } else if (
        scope.keep(part.offset(-MIN_BRIDGE_WIDTH / 2, 'Round')).isEmpty() &&
        chord(part) > MAX_THIN_BRIDGE
      ) {
        area += a; // a long single thin line cannot bridge (SPEC: min. 2 extrusion lines)
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

/** Number of separate places where a part touches the layer below. */
function anchorCount(contact: CrossSection): number {
  let count = 0;
  for (const piece of contact.decompose()) {
    if (piece.area() > 0.01) count++;
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
