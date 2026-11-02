import { expect, test } from '@playwright/test';

test('editing a dimension on the model changes the basket and the link', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  const stage = page.getByTestId('stage');
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

  // the three labels show the defaults
  await expect(stage.getByRole('button', { name: 'Breite 150 mm' })).toBeVisible();
  await expect(stage.getByRole('button', { name: 'Tiefe 100 mm' })).toBeVisible();
  await expect(stage.getByRole('button', { name: 'Höhe 80 mm' })).toBeVisible();

  // click → type → Enter
  await stage.getByRole('button', { name: 'Breite 150 mm' }).click();
  const input = stage.getByRole('textbox', { name: 'Breite' });
  await expect(input).toBeFocused();
  await input.fill('120');
  await input.press('Enter');
  await expect(page).toHaveURL(/width=120/);
  await expect(stage.getByRole('button', { name: 'Breite 120 mm' })).toBeVisible();
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

  // Esc cancels
  await stage.getByRole('button', { name: 'Höhe 80 mm' }).click();
  await stage.getByRole('textbox', { name: 'Höhe' }).fill('60');
  await stage.getByRole('textbox', { name: 'Höhe' }).press('Escape');
  await expect(stage.getByRole('button', { name: 'Höhe 80 mm' })).toBeVisible();
  await expect(page).not.toHaveURL(/height=/);

  // the side panel follows
  await expect(page.getByRole('textbox', { name: 'Breite', exact: true })).toHaveValue('120');

  expect(errors).toEqual([]);
});

test('dragging the slider in a label editor keeps the view still', async ({ page }) => {
  await page.goto('/');
  const stage = page.getByTestId('stage');
  await expect(stage).toHaveAttribute('data-status', 'ready', { timeout: 15000 });

  await stage.getByRole('button', { name: 'Höhe 80 mm' }).click();
  const editor = stage.locator('.dim-editor');
  const slider = stage.getByRole('slider', { name: 'Höhe' });
  const before = (await editor.boundingBox())!;
  const track = (await slider.boundingBox())!;
  const y = track.y + track.height / 2;
  await page.mouse.move(track.x + track.width * 0.25, y);
  await page.mouse.down();
  const positions: number[] = [];
  for (let i = 1; i <= 10; i++) {
    await page.mouse.move(track.x + track.width * (0.25 + i * 0.03), y);
    await page.waitForTimeout(80);
    const box = (await editor.boundingBox())!;
    positions.push(Math.hypot(box.x - before.x, box.y - before.y));
  }
  await page.mouse.up();
  await expect(page).toHaveURL(/height=/);
  // the editor (and with it the slider under the mouse) does not move
  expect(Math.max(...positions)).toBeLessThan(1);
});
