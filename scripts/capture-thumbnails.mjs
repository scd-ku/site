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

const ochanomizuModelRules = [
  { names: ['偏光虫眼鏡'], year: 2025 },
  { names: ['風力発電'], year: 2023 },
  { names: ['滑車'], year: 2024 },
  { names: ['マクロレンズ'], year: 2025 },
  { names: ['マイクロバネばかり', 'マイクロばねばかり'], year: 2024 },
  { names: ['マイクロマイクロますコース', 'マイクロますコース', 'マイクロマイクロマウスコース', '魔イクロマイクロマウスコース'], year: 2025 },
  { names: ['ハンディフォグマシン'], year: 2018 },
  { names: ['細胞模型'], year: 2025 },
  { names: ['イーゼル'], year: 2025 },
  { names: ['ガルトンボード', 'Galton Board', 'Galton board'], year: 2025 },
  { names: ['電熱線による水のあたため', '電熱線による水の温め'], year: 2025 },
  { names: ['ガチャガチャ'], year: 2025 },
  { names: ['天秤キット', 'てんびんキット'], year: 2024 },
  { names: ['力学台車'], year: 2024 },
  { names: ['水源地'], year: 2024 }
];

const applyExternalMetadataRules = (app) => {
  if (app.kind !== 'tinkercad') return;
  const title = String(app.title || '').replace(/\s+/g, '');
  const rule = ochanomizuModelRules.find((item) =>
    item.names.some((name) => title.includes(name.replace(/\s+/g, '')))
  );
  if (!rule) return;
  app.year = rule.year;
  app.originNote = 'ochanomizu';
};
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
      // Use the saved title/description from the catalog and open the 3D
      // embed directly. Visiting the gallery page first and waiting for
      // several seconds per item made university builds needlessly slow.
      applyExternalMetadataRules(app);
      await page.goto(app.captureUrl || app.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(4000);
    } else {
      await page.goto(app.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForTimeout(900);
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
