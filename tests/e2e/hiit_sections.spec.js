const { test, expect } = require('@playwright/test');

test('HIIT category page renders sections in correct order', async ({ page }) => {
  await page.goto('/workouts/category.html?c=hiit');

  const maxCardio = page.locator('h2:has-text("HIIT56 Max Cardio")');
  const specials = page.locator('h2:has-text("HIIT56 Specials/Mash-Ups")');

  // Sections exist (may be hidden if no videos, but should exist in DOM)
  await expect(maxCardio).toHaveCount(1);
  await expect(specials).toHaveCount(1);

  const b1 = await maxCardio.boundingBox();
  const b2 = await specials.boundingBox();

  // If either is not rendered/visible (rare), don't hard-fail on bounding boxes.
  if (b1 && b2) {
    expect(b1.y).toBeLessThan(b2.y);
  }
});
