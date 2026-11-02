// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULTS } from '../../src/geometry/params';
import { DownloadButton } from '../../src/ui/controls/DownloadButton';

const mesh = {
  positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1]),
  indices: new Uint32Array([0, 2, 1, 0, 1, 3, 0, 3, 2, 1, 2, 3]),
};
const build = vi.fn(async () => ({ mesh, ms: 1 }));
const saveFile = vi.fn();

vi.mock('../../src/ui/viewer/useBasketMesh', () => ({ geometryClient: () => ({ build }) }));
vi.mock('../../src/export/download', async (orig) => ({
  ...(await orig<typeof import('../../src/export/download')>()),
  saveFile: (...a: unknown[]) => saveFile(...a),
}));

afterEach(() => {
  cleanup();
  build.mockClear();
  saveFile.mockClear();
});

const open = () => {
  render(<DownloadButton params={DEFAULTS} />);
  const button = screen.getByRole('button', { name: 'Herunterladen' });
  fireEvent.click(button);
  return button;
};

describe('download menu', () => {
  it('opens a menu with STL and 3MF, first item focused', () => {
    const button = open();
    expect(button.getAttribute('aria-expanded')).toBe('true');
    const items = screen.getAllByRole('menuitem');
    expect(items.map((i) => i.textContent)).toEqual([
      expect.stringContaining('STL'),
      expect.stringContaining('3MF'),
    ]);
    expect(document.activeElement).toBe(items[0]);
  });

  it('arrow keys move, Escape closes and returns focus', () => {
    const button = open();
    const items = screen.getAllByRole('menuitem');
    fireEvent.keyDown(items[0]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[1]);
    fireEvent.keyDown(items[1]!, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(items[0]);
    fireEvent.keyDown(items[0]!, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(document.activeElement).toBe(button);
  });

  it('a click outside closes the menu', () => {
    open();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it.each([
    ['STL', 'basketli_150x100x80.stl', 'model/stl'],
    ['3MF', 'basketli_150x100x80.3mf', 'model/3mf'],
  ])('%s builds in export quality and saves the file', async (label, name, mime) => {
    open();
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(label) }));
    await waitFor(() => expect(saveFile).toHaveBeenCalled());
    expect(build).toHaveBeenCalledWith(DEFAULTS, 'export');
    const [data, fileName, type] = saveFile.mock.calls[0]!;
    expect(fileName).toBe(name);
    expect(type).toBe(mime);
    expect((data as Uint8Array).byteLength).toBeGreaterThan(0);
    expect(screen.queryByRole('menu')).toBeNull();
  });
});
