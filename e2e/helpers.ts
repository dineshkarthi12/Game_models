import { expect, type Page } from '@playwright/test';
export const PASSWORD = 'Sculpt3d2026';
export const uniqueEmail = () => `e2e_${Date.now()}_${Math.floor(Math.random() * 1e6)}@example.com`;
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource.*40[134]/.test(m.text())) errors.push(m.text()); });
  return errors;
}
export async function register(page: Page, name = 'E2E User') {
  const email = uniqueEmail();
  await page.goto('/register');
  await page.fill('#name', name); await page.fill('#email', email); await page.fill('#password', PASSWORD);
  await page.click('button[type=submit]');
  await expect(page).toHaveURL(/\/app$/);
  return email;
}
