import { expect, test } from '@playwright/test';

async function closeStartupModalIfOpen(page: import('@playwright/test').Page) {
  const closeButton = page.getByRole('button', { name: 'Close' });
  if ((await closeButton.count()) > 0) {
    await closeButton.first().click();
  }
}

test('home page renders expected shell', async ({ page }) => {
  await page.goto('/');
  await closeStartupModalIfOpen(page);

  await expect(page.locator('body')).toContainText('Tavern Born');
  await expect(page.locator('body')).toContainText('Home');
  await expect(page.locator('body')).toContainText('Settings');
});
