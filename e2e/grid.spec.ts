import { expect, test } from '@playwright/test';

test('grid mode: add, type, drag and remove dividers', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  const stage = page.getByTestId('stage');
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 20000 });

  await page.getByRole('button', { name: 'Raster', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Raster', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // add one across the width and one across the depth
  await stage.getByRole('button', { name: 'Trennwand quer zur Breite hinzufügen' }).click();
  await expect(page).toHaveURL(/dividersX=75/);
  await stage.getByRole('button', { name: 'Trennwand quer zur Tiefe hinzufügen' }).click();
  await expect(page).toHaveURL(/dividersY=50/);
  // four compartments with their clear sizes
  await expect(stage.locator('.grid-cell')).toHaveCount(4);

  // click the grip, type a position
  await stage.getByRole('button', { name: /Trennwand \(Breite\) 1: 75 mm/ }).click();
  const input = stage.getByRole('textbox', { name: 'Abstand von links' });
  await input.fill('50');
  await input.press('Enter');
  await expect(page).toHaveURL(/dividersX=50/);

  // drag the grip to the right
  const grip = stage.getByRole('button', { name: /Trennwand \(Breite\) 1: 50 mm/ });
  const box = (await grip.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2, { steps: 8 });
  await page.mouse.up();
  const moved = Number(new URL(page.url()).searchParams.get('dividersX'));
  expect(moved).toBeGreaterThan(55);

  // remove it again
  await stage.getByRole('button', { name: /Trennwand \(Breite\) 1:/ }).click();
  await stage.getByRole('button', { name: 'Entfernen', exact: true }).click();
  await expect(page).not.toHaveURL(/dividersX=/);
  await expect(stage.locator('.grid-cell')).toHaveCount(2);

  // done: back to the normal view
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page.getByRole('button', { name: 'Raster', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 20000 });
  expect(errors).toEqual([]);
});
