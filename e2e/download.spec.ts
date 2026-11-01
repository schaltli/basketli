import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';

test('downloads a valid binary STL', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('stage')).toHaveAttribute('data-status', 'ready', {
    timeout: 15000,
  });

  const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
  await page.getByRole('button', { name: 'STL herunterladen' }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe('basketli_150x100x80.stl');
  const bytes = await readFile((await download.path())!);
  const triangles = bytes.readUInt32LE(80);
  expect(triangles).toBeGreaterThan(100);
  expect(bytes.byteLength).toBe(84 + 50 * triangles);
});
