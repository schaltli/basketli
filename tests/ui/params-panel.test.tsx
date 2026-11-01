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
