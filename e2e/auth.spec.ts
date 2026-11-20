import { test, expect } from '@playwright/test';
import { register, PASSWORD, trackErrors } from './helpers';

test('register, log out, log in and protected-route redirect', async ({ page }) => {
  const errors = trackErrors(page);
  const email = await register(page, 'Avery Stone');
  await expect(page.getByRole('heading', { name: /Welcome to Vistora 3D, Avery/ })).toBeVisible();
  await page.getByLabel('Account menu').click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto('/app/library');
  await expect(page).toHaveURL(/\/login\?next=%2Fapp%2Flibrary/);
  await page.fill('#email', email); await page.fill('#password', 'wrong-pass-1');
  await page.click('button[type=submit]');
  await expect(page.getByRole('alert')).toContainText('Incorrect email or password');
  await page.fill('#password', PASSWORD); await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/app\/library$/);
  expect(errors).toEqual([]);
});

test('forgot password never reveals whether an account exists', async ({ page }) => {
  await page.goto('/forgot-password');
  await page.fill('#email', 'nobody-here@example.com');
  await page.click('button[type=submit]');
  await expect(page.getByText(/If an account exists/)).toBeVisible();
});
