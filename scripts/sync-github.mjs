import fs from 'node:fs/promises';
import path from 'node:path';
import overrides from '../src/data/overrides.mjs';

const OWNER = process.env.SCD_GITHUB_OWNER || 'scd-ku';
const SITE_REPO = process.env.SCD_SITE_REPO || 'site';
const OUT = path.resolve('src/data/apps.generated.json');
const token = process.env.GITHUB_TOKEN || '';

const headers = {
  Accept: 'application/vnd.github+json',
  'User-Agent': 'scd-ku-astro-site'
};
if (token) headers.Authorization = `Bearer ${token}`;

const strip = (s = '') => s
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&#39;/g, "'")
  .replace(/&quot;/gi, '"')
  .replace(/\s+/g, ' ')
  .trim();

function matchOne(html, regex) {
  const m = html.match(regex);
  return m ? strip(m[1]) : '';
}

function inferTags(text) {
  const rules = [
    ['3D', /three\.js|\bTHREE\b|webgl|3d|3D|立体/i],
    ['AI', /openai|gemini|ollama|生成AI|人工知能|\bAI\b/i],
    ['OCR', /ocr|tesseract|文字認識/i],
    ['Astronomy', /星座|星図|天体|astronomy|constellation/i],
    ['Camera', /getUserMedia|MediaRecorder|camera|カメラ/i],
    ['Computer Vision', /yolo|facemesh|object detection|computer vision|画像認識/i],
    ['Weather', /気象|天気|weather/i],
    ['IoT', /micro:bit|microbit|m5stack|esp32|sensor|センサ/i],
    ['Fabrication', /3d printer|3dプリンタ|g-code|gcode|bambu|stl/i],
    ['CAD', /\bcad\b|solid|hole|stl|svg|寸法|モデリング/i],
    ['Collaboration', /firebase|firestore|共同|協働|付箋|ふせん|sticky/i],
    ['Presentation', /slide|presentation|スライド|弾幕|コメント投稿/i],
    ['Simulation', /simulation|simulator|シミュレーション|個体数|食物連鎖|ecosystem/i],
    ['Craft', /手まり|手毬|temari|かがり|craft/i],
    ['Language', /ことば|言葉|語彙|要約|language/i],
    ['Education', /教材|学習|授業|education|learning|理科/i],
    ['Science', /science|科学|理科|実験/i],
    ['Visualization', /visualization|可視化|表示|viewer|animation|アニメーション/i]
  ];
  return rules.filter(([, rx]) => rx.test(text)).map(([tag]) => tag).slice(0, 4);
}

function fallbackDescription(repo, title, tags) {
  if (repo.description) return repo.description;
  const label = title || repo.name;
  if (tags.includes('Astronomy')) return `${label}をインタラクティブに観察・操作できるWebアプリ。`;
  if (tags.includes('Camera')) return `${label}を使って映像や画像を観察・記録できるWebアプリ。`;
  if (tags.includes('AI')) return `${label}で生成AIを活用したインタラクティブな学習・制作を試せるWebアプリ。`;
  if (tags.includes('3D')) return `${label}を3D表現で観察・操作できるインタラクティブWebアプリ。`;
  return `${label} — Science Communication Design Laboratory が公開しているWebアプリ。`;
}

async function githubJson(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${url}`);
  return res.json();
}

async function getAllRepos() {
  const all = [];
  for (let page = 1; page < 20; page += 1) {
    const items = await githubJson(`https://api.github.com/users/${OWNER}/repos?per_page=100&type=owner&sort=updated&page=${page}`);
    all.push(...items);
    if (items.length < 100) break;
  }
  return all;
}

async function inspectRepo(repo, index) {
  const branch = repo.default_branch || 'main';
  let html = '';
  try {
    const raw = `https://raw.githubusercontent.com/${OWNER}/${repo.name}/${branch}/index.html`;
    const res = await fetch(raw, { headers });
    if (res.ok) html = await res.text();
  } catch {}

  const pageUrl = repo.homepage && /^https?:\/\//i.test(repo.homepage)
    ? repo.homepage
    : `https://${OWNER}.github.io/${repo.name}/`;

  const autoTitle = matchOne(html, /<title[^>]*>([\s\S]*?)<\/title>/i)
    || matchOne(html, /<h1[^>]*>([\s\S]*?)<\/h1>/i)
    || repo.name;
  const metaDescription = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i) || [])[1]
    || (html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i) || [])[1]
    || '';
  const searchText = `${repo.name} ${repo.description || ''} ${autoTitle} ${strip(metaDescription)} ${strip(html.slice(0, 180000))}`;
  const detected = inferTags(searchText);
  const preset = overrides[repo.name] || {};
  const tags = preset.tags || detected.length ? (preset.tags || detected) : ['Web'];
  const title = preset.title || autoTitle;
  const description = preset.description || strip(metaDescription) || fallbackDescription(repo, title, tags);
  const sizes = ['large', 'normal', 'wide', 'tall', 'normal', 'wide'];

  return {
    slug: repo.name,
    repo: repo.full_name,
    title,
    description,
    url: pageUrl,
    repoUrl: repo.html_url,
    tags,
    size: preset.size || sizes[index % sizes.length],
    year: preset.year ?? 2026,
    updatedAt: repo.pushed_at || repo.updated_at || null
  };
}

try {
  const repos = await getAllRepos();
  const apps = repos
    .filter((repo) => !repo.fork && !repo.archived)
    .filter((repo) => repo.name !== SITE_REPO)
    .filter((repo) => repo.has_pages || (repo.homepage && /^https?:\/\//i.test(repo.homepage)));

  const inspected = [];
  for (let i = 0; i < apps.length; i += 1) {
    inspected.push(await inspectRepo(apps[i], i));
  }

  inspected.sort((a, b) => {
    const bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
    const at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
    return bt - at;
  });

  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, `${JSON.stringify(inspected, null, 2)}\n`, 'utf8');
  console.log(`Synced ${inspected.length} public app repositories from ${OWNER}.`);
} catch (error) {
  console.warn(`GitHub sync failed; keeping the bundled snapshot. ${error.message}`);
  try {
    await fs.access(OUT);
  } catch {
    throw error;
  }
}
