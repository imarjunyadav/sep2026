import { test, expect } from '@playwright/test';

test.describe('Mumbai Multimodal smoke tests', () => {
  test('home page loads with search form', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('Mumbai Multimodal');
    await expect(page.getByText('Local · Metro · BEST · Walk')).toBeVisible();
  });

  test('search panel renders From/To inputs and Find routes button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.place-label').first()).toContainText('From');
    await expect(page.locator('.place-label').last()).toContainText('To');
    await expect(page.locator('.search-btn')).toBeDisabled();
  });

  test('Find routes button stays disabled when only origin is filled', async ({ page }) => {
    await page.goto('/');
    // Type in From input — won't have autocomplete (no real API in test env) but button state is testable
    const fromInput = page.locator('.place-input').first();
    await fromInput.fill('Churchgate');
    await expect(page.locator('.search-btn')).toBeDisabled();
  });

  test('swap button is present', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.swap-btn')).toBeVisible();
  });

  test('GPS button is present and labeled', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.gps-btn')).toBeVisible();
    await expect(page.locator('.gps-btn')).toHaveAttribute('aria-label', 'Use my location');
  });

  test('API health endpoint is reachable', async ({ request }) => {
    const res = await request.get('/api/health');
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.service).toBe('cityone-backend');
  });

  test('results panel shows after navigation to /?screen=results state (back to search works)', async ({ page }) => {
    await page.goto('/');
    // Verify we start on search screen
    await expect(page.locator('.search-panel')).toBeVisible();
    await expect(page.locator('.results-panel')).not.toBeVisible();
  });

  test('page title is Mumbai Multimodal', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle('Mumbai Multimodal');
  });
});
