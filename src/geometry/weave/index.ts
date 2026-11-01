import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { roundedRect } from '../shapes';
import { bandSolids } from './bands';
import { weaveLayout, type WeaveLayout } from './layout';
import { footField, rimField } from './rope';
import { reliefShell } from './shell';

const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
export const STAKE_SEGMENTS = { preview: 12, export: 24 } as const;

/**
 * Woven basket: floor plate, rope foot, round stakes, flat vertical bands
 * weaving round the stakes, rope rim. Returns one solid body.
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
  parts.push(scope.keep(reliefShell(wasm, footField(p, layout, quality), layout.path)));
  parts.push(scope.keep(reliefShell(wasm, rimField(p, layout, quality), layout.path)));

  const r = p.weave.stakeDiameter / 2;
  const stakeTop = p.height - layout.rimHeight / 2;
  const stake = scope.keep(Manifold.cylinder(stakeTop, r, r, STAKE_SEGMENTS[quality]));
  for (const s of layout.stakes) {
    const { p: at } = layout.path.at(s);
    parts.push(scope.keep(stake.translate(at[0], at[1], 0)));
  }

  parts.push(...bandSolids(wasm, scope, p, layout, quality));
  return { body: scope.keep(Manifold.union(parts)), layout };
}
