const { test, expect } = require('@playwright/test');

test('home loads and nav renders', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/HIIT56/i);

  // Basic nav presence
  await expect(page.locator('header')).toBeVisible();
  await expect(page.locator('a[href="/workouts/"]')).toBeVisible();
});

test('build label is current', async ({ page }) => {
  await page.goto('/');
  const footer = page.locator('.footer');
  await expect(footer).toContainText(/CP26/);
});
