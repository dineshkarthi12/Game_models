import { test, expect } from '@playwright/test';
import path from 'node:path';
import { register, trackErrors } from './helpers';

test('create project → upload views → generate (demo) → inspect → export', async ({ page }) => {
  test.setTimeout(420_000);
  const errors = trackErrors(page);
  await register(page);
  await page.goto('/app/create');
  await page.fill('#c-name', 'E2E Sculpture');
  await page.click('button:has-text("Continue to upload")');
  await expect(page).toHaveURL(/\/studio/);

  const fx = (n: string) => path.resolve('e2e/.fixtures', `${n}.jpg`);
  await page.setInputFiles('input[aria-label="Browse image files"]', ['front', 'right', 'back', 'left'].map(fx));
  await expect(page.getByText('4 image(s) ready')).toBeVisible({ timeout: 60_000 });
  for (const [n, a] of [['front', 'front'], ['right', 'right'], ['back', 'back'], ['left', 'left']] as const) {
    await page.selectOption(`select[aria-label="Angle for ${n}.jpg"] >> nth=0`, a);
  }
  await expect(page.getByText('4/10 key views')).toBeVisible();

  await page.click('button:has-text("Continue")');
  await expect(page.getByText('Summary')).toBeVisible();
  await page.getByRole('button', { name: /Demo \(procedural/ }).click();
  await expect(page.getByText('0 credits', { exact: true })).toBeVisible();
  await page.click('button:has-text("Generate model")');
  await expect(page).toHaveURL(/\/app\/jobs\//);
  await expect(page.getByRole('link', { name: 'Open model workspace' })).toBeVisible({ timeout: 180_000 });
  await page.getByRole('link', { name: 'Open model workspace' }).click();

  await expect(page.getByText('Demo output', { exact: true })).toBeVisible();
  await expect(page.locator('canvas').first()).toBeVisible();
  await expect(page.getByText('Model Statistics')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText('Triangles', { exact: true }).first()).toBeVisible();

  await page.click('button:has-text("Export Model")');
  await page.getByRole('radio', { name: /Godot/ }).click();
  await page.getByLabel('GLTF').uncheck();
  await page.click('button:has-text("Export & package")');
  await expect(page).toHaveURL(/\/app\/exports/);
  const item = page.locator('li.ring-2');
  await expect(item.getByRole('button', { name: /Download/ })).toBeVisible({ timeout: 180_000 });
  await expect(item.getByText(/Re-imported with Blender importer/)).toBeVisible();
  const [download] = await Promise.all([page.waitForEvent('download'), item.getByRole('button', { name: /Download/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/_godot_v1\.zip$/);
  expect(errors).toEqual([]);
});
