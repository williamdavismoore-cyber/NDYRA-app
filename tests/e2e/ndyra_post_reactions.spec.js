const { test, expect } = require('@playwright/test');

test('Post detail requires auth when logged out', async ({ page }) => {
  await page.goto('/app/post/');

  // Missing id view might render a message, but auth gate should redirect first.
  await expect(page).toHaveURL(/\/auth\/login\.html/);
});
