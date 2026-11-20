import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests. Starts (or reuses) the API, worker and web dev servers.
 * Requires PostgreSQL, Redis, Blender and the workers/.venv (see docs/DEPLOYMENT.md).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5173', trace: 'off', screenshot: 'only-on-failure', launchOptions: { args: ['--use-gl=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] } },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    { command: 'npm run dev:api', url: 'http://localhost:4000/api/health', reuseExistingServer: true, timeout: 120_000, env: { DEMO_MODE: 'true' } },
    { command: 'npm run dev:worker', port: 0 as never, reuseExistingServer: true, timeout: 5_000, env: { DEMO_MODE: 'true' } } as never,
    { command: 'npm run dev:web', url: 'http://localhost:5173', reuseExistingServer: true, timeout: 120_000 },
  ].filter((s) => (s as { url?: string }).url),
});
