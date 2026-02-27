const { test, expect } = require('@playwright/test');

// NOTE: NDYRA-first entry
// Root (/) should send QA to the Social Shell (For You) quickly.

test('root entry routes to Social Shell (For You)', async ({ page }) => {
  await page.goto('/');
  await page.waitForURL('**/app/fyp/**');

  await expect(page.locator('[data-ndyra-nav="fyp"]')).toBeVisible();
  await expect(page.locator('h1')).toContainText('For You');
});

test('build label matches build.json', async ({ page, request }) => {
  const res = await request.get('/assets/build.json');
  expect(res.ok()).toBeTruthy();
  const build = await res.json();

  await page.goto('/app/fyp/');
  const pill = page.locator('[data-build-label]').first();
  await expect(pill).toContainText(build.label);
});
