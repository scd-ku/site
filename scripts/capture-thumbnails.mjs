import fs from 'node:fs/promises';
import path from 'node:path';
import { chromium } from 'playwright';

const apps = JSON.parse(await fs.readFile(path.resolve('src/data/apps.generated.json'), 'utf8'));
const externalSourcePath = path.resolve('src/data/external-projects.source.json');
const externalGeneratedPath = path.resolve('src/data/external-projects.generated.json');
let externalProjects = [];
try { externalProjects = JSON.parse(await fs.readFile(externalSourcePath, 'utf8')); } catch {}
const projects = [...apps, ...externalProjects];
const outDir = path.resolve('public/screenshots');
await fs.mkdir(outDir, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1040, height: 780 },
  reducedMotion: 'reduce'
});

for (const app of projects) {
  const page = await context.newPage();
  try {
    await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(app.kind === 'tinkercad' ? 5000 : 1200);
    if (app.kind === 'tinkercad') {
      try {
        const rawTitle = await page.title();
        const cleaned = rawTitle
          .replace(/\s*[|–—-]\s*Tinkercad.*$/i, '')
          .replace(/^Tinkercad\s*[|–—-]\s*/i, '')
          .trim();
        if (cleaned && !/^Tinkercad$/i.test(cleaned)) app.title = cleaned;
      } catch {}
    }
    await page.evaluate(() => {
      document.documentElement.style.zoom = '1.10';
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(220);
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

if (externalProjects.length) {
  await fs.writeFile(externalGeneratedPath, `${JSON.stringify(externalProjects, null, 2)}\n`, 'utf8');
}
