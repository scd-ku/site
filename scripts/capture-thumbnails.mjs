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
    if (app.kind === 'tinkercad') {
      // Read the public gallery page first so title/metadata come from the work,
      // then switch to the embed viewer only for the thumbnail.
      await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(2600);
      if (!app.titleLocked) {
        try {
          const rawTitle = await page.evaluate(() => {
            const meta = (selector) => document.querySelector(selector)?.getAttribute('content')?.trim() || '';
            const og = meta('meta[property="og:title"]');
            const tw = meta('meta[name="twitter:title"]');
            const h1 = [...document.querySelectorAll('h1')]
              .map((el) => ({ text:(el.textContent || '').trim(), rect:el.getBoundingClientRect() }))
              .filter((x) => x.text && x.rect.width > 0 && x.rect.height > 0)
              .map((x) => x.text)[0] || '';
            let ld = '';
            for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
              try {
                const data = JSON.parse(node.textContent || '{}');
                const list = Array.isArray(data) ? data : [data];
                const named = list.find((item) => item && typeof item === 'object' && typeof item.name === 'string');
                if (named?.name) { ld = named.name.trim(); break; }
              } catch {}
            }
            return og || tw || h1 || ld || document.title || '';
          });

          const cleaned = String(rawTitle || '')
            .replace(/\s*[|–—-]\s*Tinkercad.*$/i, '')
            .replace(/^Tinkercad\s*[|–—-]\s*/i, '')
            .trim();

          if (
            cleaned &&
            !/^Tinkercad$/i.test(cleaned) &&
            !/Welcome back/i.test(cleaned) &&
            !/How do you use Tinkercad/i.test(cleaned)
          ) {
            app.title = cleaned;
          }
        } catch {}
      }
      if (app.descriptionAuto && app.title && app.title !== 'Tinkercad 3Dモデル') {
        app.description = `${app.title}を題材に制作した3Dモデルです。Tinkercad上で立体を回転・拡大しながら確認し、共有データからモデルを閲覧・編集できます。`;
      }
      await page.goto(app.captureUrl || app.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(7000);
    } else {
      await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForTimeout(1200);
    }
    await page.evaluate(() => {
      document.documentElement.style.zoom = '1.10';
      document.documentElement.style.scrollBehavior = 'auto';
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(220);

    if (app.kind === 'tinkercad') {
      const viewers = page.locator('canvas, iframe');
      const count = await viewers.count();
      let bestIndex = -1;
      let bestArea = 0;
      for (let i = 0; i < count; i += 1) {
        const box = await viewers.nth(i).boundingBox().catch(() => null);
        if (!box) continue;
        const area = box.width * box.height;
        if (box.width > 280 && box.height > 220 && area > bestArea) {
          bestArea = area;
          bestIndex = i;
        }
      }
      if (bestIndex >= 0) {
        await viewers.nth(bestIndex).screenshot({
          path: path.join(outDir, `${app.slug}.jpg`),
          type: 'jpeg',
          quality: 88
        });
      } else {
        await page.screenshot({
          path: path.join(outDir, `${app.slug}.jpg`),
          type: 'jpeg',
          quality: 88,
          fullPage: false
        });
      }
    } else {
      await page.screenshot({
        path: path.join(outDir, `${app.slug}.jpg`),
        type: 'jpeg',
        quality: 84,
        fullPage: false
      });
    }
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
