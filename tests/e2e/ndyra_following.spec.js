const { test, expect } = require('@playwright/test');

test('Following requires auth (redirect to login when logged out)', async ({ page }) => {
  await page.goto('/app/following/');

  await expect(page).toHaveURL(/\/auth\/login\.html/);
  await expect(page.locator('body[data-page="auth-login"]')).toHaveCount(1);
});
