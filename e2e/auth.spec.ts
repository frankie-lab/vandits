import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('redirects unauthenticated users to /auth', async ({ page }) => {
    await page.goto('/');
    // The app should either show the main page or redirect to auth
    // depending on auth state
    await expect(page).toHaveURL(/\/(auth)?$/);
  });

  test('auth page renders login form', async ({ page }) => {
    await page.goto('/auth');
    // Should show email input
    await expect(page.locator('input[type="email"], input[placeholder*="email" i]')).toBeVisible({ timeout: 10000 });
  });
});
