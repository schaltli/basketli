// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULTS, LIMITS } from '../../src/geometry/params';
import { useBasket } from '../../src/state/store';
import { ParamsPanel } from '../../src/ui/controls/ParamsPanel';

beforeEach(() => useBasket.getState().load(DEFAULTS));
afterEach(cleanup);

const panel = () => render(<ParamsPanel onClose={() => {}} />);

describe('ParamsPanel', () => {
  it('shows the expanded-metal group by default and no weave fields', () => {
    panel();
    expect(screen.getByLabelText('Rautenbreite', { selector: 'input[type=text]' })).toBeTruthy();
    expect(screen.queryByLabelText('Stakenabstand', { selector: 'input[type=text]' })).toBeNull();
  });

  it('switches the style-specific group with the wall style', () => {
    panel();
    fireEvent.change(screen.getByLabelText('Wandstil'), { target: { value: 'weave-open' } });
    expect(useBasket.getState().params.wallStyle).toBe('weave');
    expect(useBasket.getState().params.weave.rowGap).toBeGreaterThan(0);
    expect(screen.getByLabelText('Stakenabstand', { selector: 'input[type=text]' })).toBeTruthy();
    expect(screen.getByLabelText('Reihenabstand', { selector: 'input[type=text]' })).toBeTruthy();
    expect(screen.queryByLabelText('Rautenbreite', { selector: 'input[type=text]' })).toBeNull();

    fireEvent.change(screen.getByLabelText('Wandstil'), { target: { value: 'weave-closed' } });
    expect(useBasket.getState().params.weave.rowGap).toBe(0);
    expect(screen.queryByLabelText('Reihenabstand', { selector: 'input[type=text]' })).toBeNull();
  });

  it('handle cut-out: off by default, width and depth appear when switched on', () => {
    panel();
    const select = screen.getByLabelText('Griffaussparung');
    expect((select as HTMLSelectElement).value).toBe('none');
    expect(screen.queryByLabelText('Tiefe', { selector: 'input[type=text]' })).toBeTruthy(); // basket depth
    fireEvent.change(select, { target: { value: 'one' } });
    expect(useBasket.getState().params.handles).toBe('one');
    expect(screen.getAllByLabelText('Breite', { selector: 'input[type=text]' })).toHaveLength(2);
    expect(screen.getAllByLabelText('Tiefe', { selector: 'input[type=text]' })).toHaveLength(2);
  });

  it('offers plain walls; only the wall thickness stays as a wall setting', () => {
    panel();
    fireEvent.change(screen.getByLabelText('Wandstil'), { target: { value: 'solid' } });
    expect(useBasket.getState().params.wallStyle).toBe('solid');
    expect(screen.getByLabelText('Wandstärke', { selector: 'input[type=text]' })).toBeTruthy();
    expect(screen.queryByLabelText('Rautenbreite', { selector: 'input[type=text]' })).toBeNull();
    expect(screen.queryByLabelText('Ausführung')).toBeNull(); // plain walls: plain dividers
  });

  it('divider look: woven for a weave basket, "mit Muster" otherwise', () => {
    panel();
    const look = screen.getByLabelText('Ausführung') as HTMLSelectElement;
    expect([...look.options].map((o) => o.text)).toEqual(['mit Muster', 'glatt']);
    fireEvent.change(look, { target: { value: 'pattern' } });
    expect(useBasket.getState().params.dividerStyle).toBe('pattern');
    fireEvent.change(screen.getByLabelText('Wandstil'), { target: { value: 'weave-closed' } });
    expect(
      [...(screen.getByLabelText('Ausführung') as HTMLSelectElement).options].map((o) => o.text),
    ).toEqual(['geflochten', 'glatt']);
  });

  it('applies a typed value on Enter', () => {
    panel();
    const width = screen.getByLabelText('Breite', { selector: 'input[type=text]' });
    fireEvent.change(width, { target: { value: '120' } });
    fireEvent.keyDown(width, { key: 'Enter' });
    expect(useBasket.getState().params.width).toBe(120);
  });

  it('clamps out-of-range input and explains it', () => {
    panel();
    const width = screen.getByLabelText('Breite', { selector: 'input[type=text]' });
    fireEvent.change(width, { target: { value: '999' } });
    fireEvent.blur(width);
    expect(useBasket.getState().params.width).toBe(LIMITS.width.max);
    expect(screen.getByText(/Breite: auf das Maximum gesetzt/)).toBeTruthy();
  });

  it('Escape in a field restores the value instead of applying it', () => {
    panel();
    const height = screen.getByLabelText('Höhe', { selector: 'input[type=text]' });
    fireEvent.change(height, { target: { value: '55' } });
    fireEvent.keyDown(height, { key: 'Escape' });
    fireEvent.blur(height);
    expect(useBasket.getState().params.height).toBe(DEFAULTS.height);
  });
});
