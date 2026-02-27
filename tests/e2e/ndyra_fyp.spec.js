const { test, expect } = require('@playwright/test');

test('FYP requires auth (redirect to login when logged out)', async ({ page }) => {
  await page.goto('/app/fyp/');

  // Should land on /auth/login.html in a fresh context
  await expect(page).toHaveURL(/\/auth\/login\.html/);

  await expect(page.locator('body[data-page="auth-login"]')).toHaveCount(1);
  await expect(page.locator('[data-auth-login]')).toBeVisible();
});
