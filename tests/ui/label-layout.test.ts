import { describe, expect, it } from 'vitest';
import { LABEL_BOX, visibleLabels } from '../../src/ui/viewer/labelLayout';

describe('visibleLabels', () => {
  it('shows labels that are apart', () => {
    expect(
      visibleLabels([
        { x: 0, y: 0, alignment: 0.2 },
        { x: 300, y: 0, alignment: 0.5 },
        { x: 0, y: 200, alignment: 0 },
      ]),
    ).toEqual([true, true, true]);
  });

  it('of two overlapping labels hides the one seen more end-on', () => {
    expect(
      visibleLabels([
        { x: 100, y: 100, alignment: 0.8 },
        { x: 120, y: 110, alignment: 0.1 },
      ]),
    ).toEqual([false, true]);
  });

  it('hides edges seen end-on even without overlap', () => {
    expect(visibleLabels([{ x: 0, y: 0, alignment: 0.99 }])).toEqual([false]);
  });

  it('a hidden label does not push others away', () => {
    expect(
      visibleLabels([
        { x: 0, y: 0, alignment: 0.1 },
        { x: LABEL_BOX.width - 10, y: 0, alignment: 0.5 },
        { x: 2 * LABEL_BOX.width - 20, y: 0, alignment: 0.6 },
      ]),
    ).toEqual([true, false, true]);
  });
});
