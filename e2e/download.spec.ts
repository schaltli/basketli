import { expect, test } from '@playwright/test';
import { strFromU8, unzipSync } from 'fflate';
import { readFile } from 'node:fs/promises';

const ready = async (page: import('@playwright/test').Page) => {
  await page.goto('/');
  await expect(page.getByTestId('stage')).toHaveAttribute('data-status', 'ready', {
    timeout: 15000,
  });
};

const fetchFile = async (page: import('@playwright/test').Page, format: RegExp) => {
  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: 'Herunterladen' }).click();
  await page.getByRole('menuitem', { name: format }).click();
  const download = await downloadPromise;
  return { name: download.suggestedFilename(), bytes: await readFile((await download.path())!) };
};

test('downloads a valid binary STL', async ({ page }) => {
  await ready(page);
  const { name, bytes } = await fetchFile(page, /STL/);
  expect(name).toBe('basketli_150x100x80.stl');
  const triangles = bytes.readUInt32LE(80);
  expect(triangles).toBeGreaterThan(100);
  expect(bytes.byteLength).toBe(84 + 50 * triangles);
});

test('downloads a valid 3MF', async ({ page }) => {
  await ready(page);
  const { name, bytes } = await fetchFile(page, /3MF/);
  expect(name).toBe('basketli_150x100x80.3mf');
  const files = unzipSync(new Uint8Array(bytes));
  expect(Object.keys(files)).toContain('3D/3dmodel.model');
  const model = strFromU8(files['3D/3dmodel.model']!);
  expect(model).toContain('unit="millimeter"');
  expect(model.match(/<triangle /g)!.length).toBeGreaterThan(100);
});
