import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { roundedRect } from '../shapes';
import { bandSolids, rimProfile, rimSolid } from './bands';
import { weaveLayout, type WeaveLayout } from './layout';

const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
export const STAKE_SEGMENTS = { preview: 16, export: 32 } as const;

/**
 * Woven basket: floor plate, round stakes, flat bands weaving round the
 * stakes and a flat rim closing the top edge. Returns one solid body.
 */
export function buildWeave(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): { body: Manifold; layout: WeaveLayout } {
  const { Manifold, CrossSection } = wasm;
  const layout = weaveLayout(p);
  const parts: Manifold[] = [];

  const outline = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(p.width, p.depth, p.cornerRadius, CORNER_SEGMENTS[quality]),
    ]),
  );
  parts.push(scope.keep(outline.extrude(p.floor)));

  // Stakes end inside the rim, where it has reached the full wall span and
  // below its chamfer, so they never poke out of it.
  const rim = rimProfile(layout.span, p.weave.materialThickness, layout.rim.z1 - layout.rim.z0);
  const stakeTop = layout.rim.z0 + Math.min(rim.z[2]!, rim.z[3]!);
  const r = p.weave.stakeDiameter / 2;
  const stake = scope.keep(Manifold.cylinder(stakeTop, r, r, STAKE_SEGMENTS[quality]));
  for (const s of layout.stakes) {
    const { p: at } = layout.path.at(s);
    parts.push(scope.keep(stake.translate(at[0], at[1], 0)));
  }

  parts.push(...bandSolids(wasm, scope, p, layout, quality));
  parts.push(scope.keep(rimSolid(wasm, p, layout, quality)));
  return { body: scope.keep(Manifold.union(parts)), layout };
}
