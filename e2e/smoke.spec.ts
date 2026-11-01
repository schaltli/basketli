import { expect, test } from '@playwright/test';

test('app loads, builds the default basket and shows it', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'basketli' })).toBeVisible();

  const stage = page.getByTestId('stage');
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 10000 });
  const triangles = Number(await stage.getAttribute('data-triangles'));
  expect(triangles).toBeGreaterThan(100);
  await expect(stage.locator('canvas')).toBeVisible();

  expect(errors).toEqual([]);
});
