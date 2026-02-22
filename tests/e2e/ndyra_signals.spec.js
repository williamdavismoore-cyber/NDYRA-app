const { test, expect } = require('@playwright/test');

test('NDYRA Signals strip renders and is muted by default', async ({ page }) => {
  await page.goto('/app/fyp/?src=demo');

  const strip = page.locator('[data-signal-strip]');
  await expect(strip).toBeVisible();

  const cards = strip.locator('[data-signal-card]');
  expect(await cards.count()).toBeGreaterThan(0);

  const audioCard = strip.locator('[data-signal-type="audio"]').first();
  await expect(audioCard).toBeVisible();

  const audioEl = audioCard.locator('audio.signal-media');
  const muted = await audioEl.evaluate((el) => el.muted);
  expect(muted).toBeTruthy();

  await expect(audioCard.locator('.signal-tap')).toHaveText(/tap to hear/i);

  await audioCard.click();
  await page.waitForTimeout(150);

  const mutedAfter = await audioEl.evaluate((el) => el.muted);
  expect(mutedAfter).toBeFalsy();

  await expect(audioCard.locator('.signal-tap')).toHaveText(/tap to mute/i);
});

