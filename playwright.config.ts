import { defineConfig, devices } from '@playwright/test';
import { resolve } from 'node:path';

const STORAGE_STATE = resolve(__dirname, 'e2e/.auth/user.json');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  // Autentica una vez y guarda storageState para los projects que lo usan.
  // Si faltan E2E_USER_EMAIL / E2E_USER_PASSWORD, este setup lanza un
  // error claro y la suite no arranca. Ver docs/qa/e2e-camera-qa.md.
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    // Específico para tests que ejercitan el flujo unauthenticated
    // (redirect a /auth, render del form). NO usa storageState.
    {
      name: 'chromium-auth',
      testMatch: /auth\.spec\.ts$/,
      use: { ...devices['Desktop Chrome'] },
    },
    // Resto de la suite (camera-qa, preferences-runtime, futuros specs).
    // Reutiliza la sesión autenticada producida por global-setup.
    {
      name: 'chromium-app',
      testIgnore: /auth\.spec\.ts$/,
      use: {
        ...devices['Desktop Chrome'],
        storageState: STORAGE_STATE,
      },
    },
  ],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
  },
});
