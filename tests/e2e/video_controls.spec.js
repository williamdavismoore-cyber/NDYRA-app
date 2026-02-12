const { test, expect } = require('@playwright/test');

test('video controls reveal on hover (desktop)', async ({ page }) => {
  await page.goto('/workouts/category.html?c=hiit');

  const shell = page.locator('.video-shell').first();
  await expect(shell).toBeVisible();

  const controls = shell.locator('.video-controls');
  await expect(controls).toHaveCount(1);

  const opacityBefore = await controls.evaluate(el => getComputedStyle(el).opacity);
  // should start hidden on pointer fine devices
  expect(Number(opacityBefore)).toBeLessThan(0.5);

  await shell.hover();
  const opacityAfter = await controls.evaluate(el => getComputedStyle(el).opacity);
  expect(Number(opacityAfter)).toBeGreaterThan(0.9);
});
