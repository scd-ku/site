import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const apps = JSON.parse(await fs.readFile(path.resolve('src/data/apps.generated.json'), 'utf8'));
const outDir = path.resolve('public/screenshots');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'reduce'
});

for (const app of apps) {
  const page = await context.newPage();
  try {
    await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(1200);
    await page.screenshot({
      path: path.join(outDir, `${app.slug}.jpg`),
      type: 'jpeg',
      quality: 84,
      fullPage: false
    });
    console.log(`Captured ${app.slug}`);
  } catch (error) {
    console.warn(`Could not capture ${app.slug}: ${error.message}`);
  } finally {
    await page.close();
  }
}

await browser.close();
