const { test, expect } = require('@playwright/test');

const SESSION_ID = '11111111-1111-1111-1111-111111111111';

test('Booking fork: past_due member can book with tokens (demo)', async ({ page }) => {
  await page.goto(`/app/book/class/${SESSION_ID}?demo_membership=past_due&demo_tokens=3&demo_required_tokens=1&demo_waiver=1&demo_sor=ndyra&demo_visibility=public`);

  await expect(page).toHaveTitle(/Book Class/i);

  const btnTokens = page.locator('[data-action="book-tokens"]');
  const btnMembership = page.locator('[data-action="book-membership"]');
  const aUpdatePayment = page.locator('[data-action="update-payment"]');

  await expect(aUpdatePayment).toBeVisible();
  await expect(btnMembership).toBeDisabled();
  await expect(btnTokens).toBeEnabled();

  // Clicking tokens should produce a JSON result
  await btnTokens.click();
  const out = page.locator('[data-booking-result]');
  await expect(out).toContainText('booking_id');
  await expect(out).toContainText('remaining_balance');
});

test('Booking fork: active member does NOT see token path (demo)', async ({ page }) => {
  await page.goto(`/app/book/class/${SESSION_ID}?demo_membership=active&demo_tokens=3&demo_required_tokens=1&demo_waiver=1&demo_sor=ndyra&demo_visibility=public`);

  const btnTokens = page.locator('[data-action="book-tokens"]');
  const btnMembership = page.locator('[data-action="book-membership"]');
  const aUpdatePayment = page.locator('[data-action="update-payment"]');

  await expect(aUpdatePayment).toBeHidden();
  await expect(btnMembership).toBeEnabled();
  await expect(btnTokens).toBeDisabled();
});

test('Booking fork: missing waiver blocks booking and shows sign waiver link (demo)', async ({ page }) => {
  await page.goto(`/app/book/class/${SESSION_ID}?demo_membership=past_due&demo_tokens=3&demo_required_tokens=1&demo_waiver=0&demo_sor=ndyra&demo_visibility=public`);

  const btnTokens = page.locator('[data-action="book-tokens"]');
  const aSignWaiver = page.locator('[data-action="sign-waiver"]');

  await expect(aSignWaiver).toBeVisible();
  await expect(btnTokens).toBeDisabled();
});

test('Booking fork: external system_of_record blocks booking (demo)', async ({ page }) => {
  await page.goto(`/app/book/class/${SESSION_ID}?demo_membership=past_due&demo_tokens=3&demo_required_tokens=1&demo_waiver=1&demo_sor=external&demo_visibility=public`);

  const btnTokens = page.locator('[data-action="book-tokens"]');
  const banner = page.locator('[data-booking-banner]');

  await expect(btnTokens).toBeDisabled();
  await expect(banner).toContainText(/not authoritative/i);
});
