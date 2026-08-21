import { defineConfig, devices } from 'playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: true,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] },
    },
  ],
  webServer: [
    {
      command: 'node scripts/e2e-web-server.mjs public',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/e2e-web-server.mjs admin',
      url: 'http://127.0.0.1:4174',
      reuseExistingServer: false,
      env: {
        VITE_SUPABASE_URL: 'https://supabase.test',
        VITE_SUPABASE_ANON_KEY: 'public-e2e-anon-key',
      },
    },
  ],
})
