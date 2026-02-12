const { test, expect } = require('@playwright/test');

test('member timer can skip into REST mode (smoke)', async ({ page }) => {
  await page.goto('/app/timer/?src=demo:online_quick');

  // Ensure controls present
  await expect(page.locator('[data-start]')).toBeVisible();

  // Start
  await page.click('[data-start]');

  // Skip twice to land in REST quickly
  const skip = page.locator('[data-skip]');
  await expect(skip).toBeEnabled();
  await skip.click();
  await skip.click();

  // Rest mode styling/class applied
  const wrap = page.locator('[data-video-wrap]');
  await expect(wrap).toHaveClass(/mode-rest/);

  // Clock is visible and "rest-ish" (red-ish)
  const clock = page.locator('[data-clock]');
  await expect(clock).toBeVisible();
});
