/**
 * Browser smoke checks for the most regression-prone homepage interactions.
 * Runs against the freshly built Astro dist using an ephemeral preview server.
 * Does not contact Firebase APIs or modify any production data.
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';

const port=4329;
const base=(process.env.BASE_PATH||'/').replace(/\/?$/,'/');
const root='http://127.0.0.1:'+port+base;
const server=spawn('npm',['run','preview','--','--host','127.0.0.1','--port',String(port)],{
  env:process.env,
  stdio:['ignore','pipe','pipe'],
  detached:true
});
let serverLog='';
for(const stream of [server.stdout,server.stderr]){
  stream.on('data',chunk=>{serverLog+=String(chunk);});
}
let browser;
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
try{
  let ready=false;
  for(let i=0;i<45;i++){
    try{
      const response=await fetch(root,{signal:AbortSignal.timeout(2000)});
      if(response.ok){ready=true;break;}
    }catch{}
    await new Promise(resolve=>setTimeout(resolve,350));
  }
  assert(ready,'Preview did not start: '+serverLog.slice(-1500));

  browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  page.on('pageerror',err=>{console.warn('Browser JS warning: '+err.message);});
  await page.goto(root,{waitUntil:'domcontentloaded',timeout:30000});
  // Scope to the REAL document: the Lens contains a second, intentionally
  // noninteractive clone of this same button, and it is hidden by default.
  await page.waitForSelector('main#top button[data-qr-open]',{timeout:10000});

  // The QR dialog must OPEN in the browser, not merely exist in the DOM.
  await page.locator('main#top button[data-qr-open]').click();
  await page.waitForFunction(()=>document.querySelector('dialog[data-qr-dialog]')?.open,{timeout:5000});
  const modalInBody=await page.locator('body > dialog[data-qr-dialog][open]').count();
  assert(modalInBody===1,'QR modal did not open in the top-level body.');
  await page.locator('dialog[data-qr-dialog] [data-qr-close]').click();
  await page.waitForFunction(()=>!document.querySelector('dialog[data-qr-dialog]')?.open,{timeout:5000});
  console.log('PASS: QR code opens and closes as a modal.');

  // Ensure the old SC / D 2026 hero mark is absent (even on old HTML).
  const oldHeroMark=await page.locator('.hero-index:visible').count();
  assert(oldHeroMark===0,'Retired hero mark is still visible.');
  console.log('PASS: Retired hero mark hidden.');

  // Pre-render five slots per species; show only the user-selected maximum.
  const slots=await page.evaluate(()=>({
    pieris:document.querySelectorAll('[data-scd-butterfly-layer] [data-scd-butterfly="pieris"]').length,
    papilio:document.querySelectorAll('[data-scd-butterfly-layer] [data-scd-butterfly="papilio"]').length,
    photoBodies:document.querySelectorAll('[data-scd-butterfly-photo-layer] [data-butterfly-photo] .scd-butterfly-body').length
  }));
  assert(slots.pieris===5&&slots.papilio===5,'Expected five reusable butterfly slots per species.');
  assert(slots.photoBodies===0,'Photographic overlay must not duplicate the butterfly thorax.');
  console.log('PASS: 5+5 slots and single thorax rendering.');

  // Change limits to zero and five, as a visitor would in the settings panel.
  await page.locator('main#top .display-settings-button').click();
  const slider=page.locator('main#top [data-butterfly-count="pieris"]');
  await slider.evaluate(node=>{
    node.value='0';
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert((await page.locator('main#top [data-butterfly-count-value="pieris"]').textContent())?.trim()==='0','Zero count was not reflected in settings.');
  const stillActive=await page.evaluate(()=>[...document.querySelectorAll('[data-scd-butterfly-layer] [data-scd-butterfly="pieris"]')].filter(e=>e.style.display==='block').length);
  assert(stillActive===0,'Some Pieris remain active when the maximum is zero.');

  await slider.evaluate(node=>{
    node.value='5';
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
  assert((await page.locator('main#top [data-butterfly-count-value="pieris"]').textContent())?.trim()==='5','Five count was not reflected in settings.');
  await page.waitForTimeout(2100);
  const resumed=await page.evaluate(()=>[...document.querySelectorAll('[data-scd-butterfly-layer] [data-scd-butterfly="pieris"]')].filter(e=>e.style.display==='block').length);
  assert(resumed===5,'Five Pieris agents did not resume when max set to five; saw '+resumed);
  console.log('PASS: Butterfly maximum 0–5 dynamically changes active agents.');

  // Regression: fixed butterfly paint must not grow document scrollHeight.
  // Test after butterflies have appeared AND after scrolling to the footer.
  const getPageExtent=()=>page.evaluate(()=>{
    const footer=document.querySelector('main#top > footer');
    const footerEnd=footer?.getBoundingClientRect().bottom+window.scrollY||0;
    return {
      footerEnd,
      scrollHeight:document.scrollingElement?.scrollHeight||0,
      active:document.querySelectorAll('[data-scd-butterfly-layer] [data-scd-butterfly][style*="display: block"]').length
    };
  });
  let extent=await getPageExtent();
  assert(extent.scrollHeight-Math.max(extent.footerEnd,900)<10,
    'Unexpected blank space below footer at top: '+JSON.stringify(extent));
  await page.evaluate(()=>window.scrollTo(0,document.documentElement.scrollHeight));
  await page.waitForTimeout(750);
  extent=await getPageExtent();
  assert(extent.scrollHeight-Math.max(extent.footerEnd,900)<10,
    'Butterfly layer extended document below copyright: '+JSON.stringify(extent));
  console.log('PASS: Page ends at copyright even after moving butterflies and scrolling.');

  // Verify both new page-coordinate fauna visitors without introducing new
  // document height. The hen's feet stand precisely over the footer line.
  const fauna=await page.evaluate(()=>({
    chicken:document.querySelectorAll('[data-scd-fauna-layer] [data-fauna="chicken"]').length,
    frog:document.querySelectorAll('[data-scd-fauna-layer] [data-fauna="frog"]').length,
    photographs:document.querySelectorAll('[data-scd-fauna-photo-layer] [data-fauna-photo]').length,
    layerPosition:getComputedStyle(document.querySelector('[data-scd-fauna-layer]')).position,
    layerHeight:document.querySelector('[data-scd-fauna-layer]').getBoundingClientRect().height
  }));
  assert(fauna.chicken===1&&fauna.frog===1&&fauna.photographs===2,
    'Hen/frog or photo layers missing: '+JSON.stringify(fauna));
  assert(fauna.layerPosition==='fixed'&&fauna.layerHeight===0,
    'Fauna layer may extend the page: '+JSON.stringify(fauna));
  const chickenInfo=await page.evaluate(()=>{
    const hen=document.querySelector('[data-scd-fauna-layer] [data-fauna="chicken"]');
    const footer=document.querySelector('main#top > footer');
    return {feet:hen.getBoundingClientRect().bottom, ground:footer.getBoundingClientRect().top};
  });
  assert(Math.abs(chickenInfo.feet-chickenInfo.ground)<18,
    'Chicken does not walk along footer: '+JSON.stringify(chickenInfo));
  await page.mouse.move(700,600);
  await page.waitForTimeout(90);
  const nextExtent=await getPageExtent();
  assert(nextExtent.scrollHeight-Math.max(nextExtent.footerEnd,900)<10,
    'Fauna extended page after copyright: '+JSON.stringify(nextExtent));
  console.log('PASS: One hen walks at footer, one frog climbs page, photo layers exist, and no extra page height.');

  // Cursor-only color/photo reveal must actually be visible over the hen.
  // Photos may fall back to a bundled illustrated texture if the Commons CDN
  // rate limits the download, but the opaque black shape must change under Lens.
  const hen=page.locator('[data-scd-fauna-layer] [data-fauna="chicken"]');
  const henRect=await hen.boundingBox();
  assert(!!henRect,'Cannot find hen at the end of the document.');
  await page.mouse.move(henRect.x+henRect.width*.5,henRect.y+henRect.height*.5);
  await page.waitForTimeout(200);
  const painted=await page.evaluate(()=>({
    visible:document.querySelector('[data-scd-fauna-photo-layer]')?.style.visibility,
    photoPattern:!!document.querySelector('[data-scd-fauna-photo-layer] [data-fauna-photo="chicken"] pattern image'),
    colorFallback:!!document.querySelector('[data-scd-fauna-photo-layer] [data-fauna-photo="chicken"] pattern rect')
  }));
  assert(painted.visible==='visible'&&painted.photoPattern&&painted.colorFallback,
    'The hen texture did not appear inside the pointer: '+JSON.stringify(painted));
  console.log('PASS: Lens pointer reveals a photo/color texture inside the hen silhouette.');
  await page.close();
}finally{
  await browser?.close();
  // 'npm run preview' starts Astro as a subprocess. Kill the whole process
  // group so the test runner exits rather than hanging after tests pass.
  try{process.kill(-server.pid,'SIGTERM');}
  catch{server.kill('SIGTERM');}
  server.stdout?.destroy();
  server.stderr?.destroy();
}
