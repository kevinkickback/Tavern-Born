import { expect, test } from '@playwright/test';

test('home page renders expected shell', async ({ page }) => {
  await page.goto('/');

  await expect(
    page.getByRole('banner').getByRole('heading', { name: 'Tavern Born' }),
  ).toBeVisible();
  await expect(page.getByRole('link', { name: 'Home' })).toBeVisible();
  await expect(page.locator('a[href="/settings"]')).toBeVisible();
});
