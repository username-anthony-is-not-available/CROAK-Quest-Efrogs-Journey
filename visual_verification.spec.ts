import { test, expect } from '@playwright/test';

test('capture game screenshots', async ({ page }) => {
    await page.goto('http://localhost:5173');
    // Wait for the game to load
    await page.waitForTimeout(5000);
    await page.screenshot({ path: 'main_menu.png' });

    // Click to start the game (assuming clicking anywhere on canvas starts it)
    await page.click('canvas');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'gameplay.png' });
});
