import type { Manifold } from 'manifold-3d';
import type { Scope, Wasm } from './manifold';
import type { BasketParams } from './params';
import { roundedRect } from './shapes';

/** Segments per quarter circle for each quality level. */
export const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;
export type Quality = keyof typeof CORNER_SEGMENTS;

/**
 * Plain tub: rounded-rectangle shell with wall and floor thickness.
 * Centered on X/Y, bottom at z = 0.
 */
export function buildTub(wasm: Wasm, scope: Scope, p: BasketParams, quality: Quality): Manifold {
  const { CrossSection } = wasm;
  const seg = CORNER_SEGMENTS[quality];
  const outer = scope.keep(
    CrossSection.ofPolygons([roundedRect(p.width, p.depth, p.cornerRadius, seg)]),
  );
  const inner = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(
        p.width - 2 * p.wall,
        p.depth - 2 * p.wall,
        Math.max(0, p.cornerRadius - p.wall),
        seg,
      ),
    ]),
  );
  const shell = scope.keep(outer.extrude(p.height));
  const cavity = scope.keep(scope.keep(inner.extrude(p.height)).translate(0, 0, p.floor));
  return scope.keep(shell.subtract(cavity));
}
