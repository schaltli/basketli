import type { Manifold } from 'manifold-3d';
import type { Quality } from '../basket';
import type { Scope, Wasm } from '../manifold';
import type { BasketParams } from '../params';
import { roundedRect } from '../shapes';
import { weaveLayout, type WeaveLayout } from './layout';
import { reliefField } from './relief';
import { reliefShell } from './shell';
import { windowCutters } from './windows';

const CORNER_SEGMENTS = { preview: 8, export: 24 } as const;

/**
 * Woven basket as a printable relief wall: height-field shell (rows, stake
 * ribs, foot band, rim) + solid floor, minus pointed windows for open weave.
 */
export function buildWeave(
  wasm: Wasm,
  scope: Scope,
  p: BasketParams,
  quality: Quality,
): { body: Manifold; layout: WeaveLayout } {
  const { Manifold, CrossSection } = wasm;
  const layout = weaveLayout(p);

  const shell = scope.keep(reliefShell(wasm, reliefField(p, layout, quality), layout.path));
  const outline = scope.keep(
    CrossSection.ofPolygons([
      roundedRect(p.width, p.depth, p.cornerRadius, CORNER_SEGMENTS[quality]),
    ]),
  );
  const floor = scope.keep(outline.extrude(p.floor));
  let body = scope.keep(Manifold.union([shell, floor]));

  const windows = windowCutters(wasm, scope, p, layout);
  if (windows.length > 0) {
    body = scope.keep(body.subtract(scope.keep(Manifold.union(windows))));
  }
  return { body, layout };
}
