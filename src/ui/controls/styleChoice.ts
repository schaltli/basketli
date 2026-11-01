import type { BasketParams } from '../../geometry/params';

/** The wall styles offered to the user (weave split into closed / open). */
export type StyleChoice = 'expanded' | 'hex' | 'voronoi' | 'weave-closed' | 'weave-open';
export const STYLE_CHOICES: StyleChoice[] = [
  'expanded',
  'hex',
  'voronoi',
  'weave-closed',
  'weave-open',
];
/** Row gap used when switching to the open weave. */
export const OPEN_WEAVE_GAP = 4;

export function choiceOf(p: BasketParams): StyleChoice {
  if (p.wallStyle === 'weave') return p.weave.rowGap > 0 ? 'weave-open' : 'weave-closed';
  return p.wallStyle === 'hex' || p.wallStyle === 'voronoi' ? p.wallStyle : 'expanded';
}

export function applyChoice(p: BasketParams, choice: StyleChoice): BasketParams {
  if (choice === 'weave-closed' || choice === 'weave-open') {
    // Open keeps a gap the user already set, otherwise uses the default gap.
    const open = p.weave.rowGap > 0 ? p.weave.rowGap : OPEN_WEAVE_GAP;
    const rowGap = choice === 'weave-open' ? open : 0;
    return { ...p, wallStyle: 'weave', weave: { ...p.weave, rowGap } };
  }
  return { ...p, wallStyle: choice };
}
