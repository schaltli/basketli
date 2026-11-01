import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { roundedRect } from '../shapes';
import { weaveLayout, type WeaveLayout } from './layout';
import { strandPath } from './path';
import { strandProfile } from './profile';
import { sweepClosed } from './sweep';

export const STAKE_SEGMENTS = { preview: 12, export: 24 } as const;
const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

/**
 * Woven basket: solid floor + foot band, vertical stakes, horizontal strand
 * rings (plain weave) and a rounded top rim. Returns one solid body.
 */
export function buildWeave(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): { body: Manifold; layout: WeaveLayout } {
  const { Manifold, CrossSection } = wasm;
  const layout = weaveLayout(p);
  const w = p.weave;
  const seg = CORNER_SEGMENTS[quality];
  const parts: Manifold[] = [];

  // Floor and foot band (solid ring, as thick as the woven wall).
  const outer = scope.keep(
    CrossSection.ofPolygons([roundedRect(p.width, p.depth, p.cornerRadius, seg)]),
  );
  const inner = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(
        p.width - 2 * layout.span,
        p.depth - 2 * layout.span,
        p.cornerRadius - layout.span,
        seg,
      ),
    ]),
  );
  const ring = scope.keep(outer.subtract(inner));
  parts.push(scope.keep(ring.extrude(layout.footHeight)));
  parts.push(scope.keep(outer.extrude(p.floor)));

  // Stakes: from the floor into the rim.
  const stakeTop = p.height - layout.rimHeight / 2;
  const stake = scope.keep(
    Manifold.cylinder(stakeTop, w.stakeDiameter / 2, w.stakeDiameter / 2, STAKE_SEGMENTS[quality]),
  );
  for (const s of layout.stakes) {
    const { p: at } = layout.path.at(s);
    parts.push(scope.keep(stake.translate(at[0], at[1], 0)));
  }

  // Strand rings.
  const profile = strandProfile(w.material, w.materialHeight, w.materialThickness, quality);
  layout.rows.forEach((_row, i) => {
    const path = strandPath(layout, i, quality);
    parts.push(scope.keep(sweepClosed(wasm, path.points, (path.z0 + path.z1) / 2, profile)));
  });

  // Rim: rounded on top, 45° point below so it prints without support.
  const rimProfile = strandProfile('band', layout.rimHeight, layout.span, quality);
  const rimPath = roundedRect(
    p.width - layout.span,
    p.depth - layout.span,
    p.cornerRadius - layout.span / 2,
    seg,
  );
  parts.push(scope.keep(sweepClosed(wasm, rimPath, p.height - layout.rimHeight / 2, rimProfile)));

  return { body: scope.keep(Manifold.union(parts)), layout };
}
