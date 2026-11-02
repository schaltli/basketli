// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DimensionLabel } from '../../src/ui/viewer/DimensionLabel';

afterEach(cleanup);

const setup = (value = 150) => {
  const onChange = vi.fn();
  render(
    <DimensionLabel label="Breite" value={value} min={30} max={400} step={1} onChange={onChange} />,
  );
  return onChange;
};

describe('DimensionLabel', () => {
  it('shows the value and opens an editor on click', () => {
    setup();
    const button = screen.getByRole('button', { name: 'Breite 150 mm' });
    expect(button.textContent).toContain('150');
    fireEvent.click(button);
    const input = screen.getByRole('textbox', { name: 'Breite' });
    expect((input as HTMLInputElement).value).toBe('150');
    expect(document.activeElement).toBe(input);
    expect(screen.getByRole('slider', { name: 'Breite' })).toBeTruthy();
  });

  it('applies a typed value on Enter and closes', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: /Breite/ }));
    const input = screen.getByRole('textbox', { name: 'Breite' });
    fireEvent.change(input, { target: { value: '120,5' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith(120.5);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('Escape cancels: typed text is dropped, slider changes are undone', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: /Breite/ }));
    fireEvent.change(screen.getByRole('slider', { name: 'Breite' }), { target: { value: '200' } });
    expect(onChange).toHaveBeenLastCalledWith(200);
    const input = screen.getByRole('textbox', { name: 'Breite' });
    fireEvent.change(input, { target: { value: '99' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onChange).toHaveBeenLastCalledWith(150);
    expect(onChange).not.toHaveBeenCalledWith(99);
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('ignores empty or invalid input', () => {
    const onChange = setup();
    fireEvent.click(screen.getByRole('button', { name: /Breite/ }));
    const input = screen.getByRole('textbox', { name: 'Breite' });
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange).not.toHaveBeenCalled();
  });
});
