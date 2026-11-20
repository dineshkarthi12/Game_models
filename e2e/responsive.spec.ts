import { test, expect } from '@playwright/test';
import { register } from './helpers';

const PUBLIC = ['/', '/features', '/how-it-works', '/pricing', '/docs', '/login', '/register'];
const APP = ['/app', '/app/create', '/app/projects', '/app/library', '/app/history', '/app/precision', '/app/exports', '/app/team', '/app/notifications', '/app/profile', '/app/settings'];

for (const width of [375, 768]) {
  test(`no horizontal overflow at ${width}px`, async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await ctx.newPage();
    const overflow: string[] = [];
    const check = async (url: string) => {
      await page.goto(url, { waitUntil: 'networkidle' });
      const w = await page.evaluate(() => document.documentElement.scrollWidth);
      if (w > width) overflow.push(`${url}: ${w}px`);
    };
    for (const u of PUBLIC) await check(u);
    await register(page);
    for (const u of APP) await check(u);
    expect(overflow).toEqual([]);
    // Mobile navigation drawer opens and navigates.
    if (width < 1024) {
      await page.goto('/app');
      await page.getByLabel('Open navigation').click();
      await page.getByRole('dialog', { name: 'Navigation' }).getByRole('link', { name: 'Asset Library' }).click();
      await expect(page).toHaveURL(/\/app\/library/);
    }
    await ctx.close();
  });
}
