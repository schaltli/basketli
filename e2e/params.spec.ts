import { expect, test } from '@playwright/test';

test('a shared link restores the basket and edits update the link', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/?v=1&wallStyle=hex&width=120&holeSize=8');
  const stage = page.getByTestId('stage');
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

  // restored from the link
  await expect(page.getByLabel('Wandstil')).toHaveValue('hex');
  const width = page.locator('input[type=text]').first();
  await expect(width).toHaveValue('120');
  await expect(page.getByLabel('Lochgröße', { exact: true }).first()).toHaveValue('8');

  // edit the height → the link follows
  const height = page.getByRole('textbox', { name: 'Höhe' });
  await height.fill('65');
  await height.press('Enter');
  await expect(page).toHaveURL(/height=65/);
  await expect(page).toHaveURL(/wallStyle=hex/);

  // switch the style
  await page.getByLabel('Wandstil').selectOption('weave-open');
  await expect(page).toHaveURL(/wallStyle=weave/);
  await expect(page).toHaveURL(/weave\.rowGap=4/);
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

  expect(errors).toEqual([]);
});
