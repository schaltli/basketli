import type { WallStyle } from '../../geometry/params';

export interface MaterialLook {
  color: string;
  roughness: number;
  metalness: number;
}

/** Preview colours only; they do not affect the export. */
export function materialFor(style: WallStyle): MaterialLook {
  return style === 'weave' || style === 'voronoi'
    ? { color: '#c9a46c', roughness: 0.55, metalness: 0.02 } // natural rattan
    : { color: '#d9cbb3', roughness: 0.65, metalness: 0 };
}
