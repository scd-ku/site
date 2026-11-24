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

  // New applications must be visible as Library cards in both the GitHub
  // deployment and the university ZIP, with separate app/repository targets.
  const loom=page.locator('main#top .app-card[data-slug="hataori"]');
  assert(await loom.count()===1,'The new 3D織機 (hataori) card is missing or duplicated.');
  const loomLinks=await loom.evaluate(card=>({
    title:card.querySelector('.card-title')?.textContent?.trim(),
    app:card.querySelector('.app-open')?.getAttribute('href'),
    repo:card.querySelector('.repo-link')?.getAttribute('href'),
    tags:JSON.parse(card.getAttribute('data-tags')||'[]')
  }));
  assert(loomLinks.title==='3D織機'
    &&loomLinks.app==='https://scd-ku.github.io/hataori/'
    &&loomLinks.repo==='https://github.com/scd-ku/hataori'
    &&loomLinks.tags.includes('3D'),
    '3D織機 card metadata or links are incorrect: '+JSON.stringify(loomLinks));
  console.log('PASS: Library includes the 3D織機 app and GitHub repository links.');


  // Color Intensity starts at 70. Face pixels intentionally have 70%
  // alpha; the wireframe is drawn separately at full opacity.
  await page.waitForFunction(()=>{
    const canvas=document.querySelector('main#top canvas[data-solid="cube"]');
    if(!canvas) return false;
    const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    for(let i=0;i<data.length;i+=4){
      if(data[i+3]>0&&Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>24) return true;
    }
    return false;
  },{timeout:5000});
  const colorRender=await page.evaluate(()=>{
    const slider=document.querySelector('main#top [data-detail-saturation]');
    const output=document.querySelector('main#top [data-detail-saturation-value]');
    const canvas=document.querySelector('main#top canvas[data-solid="cube"]');
    const solid=canvas?.closest('.science-object.object-solid');
    const data=canvas?.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    let visibleColorPixels=0;
    if(data) for(let i=0;i<data.length;i+=4){
      if(data[i+3]>0&&Math.max(data[i],data[i+1],data[i+2])-Math.min(data[i],data[i+1],data[i+2])>24) visibleColorPixels++;
    }
    return {
      slider:slider?.value,
      output:output?.textContent?.trim(),
      colorLevel:getComputedStyle(document.documentElement).getPropertyValue('--color-level').trim(),
      blend:solid?getComputedStyle(solid).mixBlendMode:'',
      opacity:solid?getComputedStyle(solid).opacity:'',
      filter:canvas?getComputedStyle(canvas).filter:'',
      visibleColorPixels
    };
  });
  assert(colorRender.slider==='70'&&colorRender.output==='70%'&&colorRender.colorLevel==='70',
    'Color Intensity default is not 70: '+JSON.stringify(colorRender));
  assert(colorRender.blend==='screen'&&colorRender.opacity==='1'&&colorRender.filter==='none'&&colorRender.visibleColorPixels>100,
    'Hero face colors must remain visible at the 70% face-opacity setting, with screen blending: '+JSON.stringify(colorRender));
  console.log('PASS: Color Intensity defaults to 70; hero solids use independently controlled face opacity and screen blending.');

  // Screen blend opacity is a live Display setting with a 70% default.
  await page.locator('main#top .display-settings-button').click();
  const blendSlider=page.locator('main#top [data-hero-blend-opacity]');
  const blendOutput=page.locator('main#top [data-hero-blend-opacity-value]');
  assert(await blendSlider.inputValue()==='70','Hero face opacity default is not 70%.');
  assert((await blendOutput.textContent())?.trim()==='70%','Hero face opacity output does not show 70%.');
  const faceDefault=await page.evaluate(()=>getComputedStyle(document.documentElement).getPropertyValue('--hero-face-opacity').trim());
  const wireDefault=await page.locator('main#top .science-field .science-object.object-solid').first().evaluate(el=>getComputedStyle(el).opacity);
  assert(faceDefault==='0.7'&&wireDefault==='1','Hero face/wireframe opacity defaults are not independent: '+faceDefault+'/'+wireDefault);
  await blendSlider.evaluate(node=>{
    node.value='0';
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
  const readFaceZero=()=>page.evaluate(()=>{
    const root=getComputedStyle(document.documentElement).getPropertyValue('--hero-face-opacity').trim();
    const canvases=[...document.querySelectorAll('main#top canvas[data-solid]')];
    let whiteLinePixels=0, coloredFacePixels=0;
    for(const canvas of canvases){
      const data=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
      for(let i=0;i<data.length;i+=4){
        if(data[i+3]>0){
          const max=Math.max(data[i],data[i+1],data[i+2]), min=Math.min(data[i],data[i+1],data[i+2]);
          if(max-min<24&&max>180) whiteLinePixels++;
          if(max-min>24) coloredFacePixels++;
        }
      }
    }
    return {root,whiteLinePixels,coloredFacePixels};
  });
  // Canvas updates on animation frames, not synchronously with the slider event.
  let faceZero=await readFaceZero();
  for(let attempt=0;attempt<50 && (faceZero.root!=='0'||faceZero.whiteLinePixels===0||faceZero.coloredFacePixels!==0);attempt++){
    await page.waitForTimeout(100);
    faceZero=await readFaceZero();
  }
  assert(faceZero.root==='0'&&faceZero.whiteLinePixels>0&&faceZero.coloredFacePixels===0,
    'At zero face opacity, colored fills should disappear while white wireframes remain: '+JSON.stringify(faceZero));
  assert((await blendOutput.textContent())?.trim()==='0%','Hero face opacity output did not update to zero.');
  await blendSlider.evaluate(node=>{
    node.value='70';
    node.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.locator('main#top .display-settings-button').click();
  console.log('PASS: Hero face opacity defaults to 70%; at 0%, only white wireframes remain.');




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

  // The Contact map is a cross-origin Google Maps iframe. Its internal
  // pointer events cannot reach the parent document; the native map cursor
  // must be visible while the custom cursor resumes immediately on exit.
  const mapFrame=page.locator('main#top .contact-map iframe');
  assert(await mapFrame.count()===1,'Contact map iframe is missing.');
  await mapFrame.scrollIntoViewIfNeeded();
  const mapRect=await mapFrame.boundingBox();
  assert(!!mapRect&&mapRect.width>200&&mapRect.height>180,
    'Contact map iframe has no usable hit area: '+JSON.stringify(mapRect));
  await page.mouse.move(mapRect.x+mapRect.width*.5,mapRect.y+mapRect.height*.5);
  await page.waitForTimeout(120);
  const mapState=await page.evaluate(()=>({
    active:document.body.classList.contains('cursor-over-embedded-map'),
    iframeCursor:getComputedStyle(document.querySelector('main#top .contact-map iframe')).cursor,
    cursorDot:getComputedStyle(document.querySelector('.cursor-dot')).display,
    lens:getComputedStyle(document.querySelector('.cursor-magnifier-lens')).display,
    pointerEvents:getComputedStyle(document.querySelector('main#top .contact-map iframe')).pointerEvents
  }));
  assert(mapState.active,'Entering the map did not trigger native cursor handoff: '+JSON.stringify(mapState));
  assert(mapState.iframeCursor==='auto'&&mapState.cursorDot==='none'&&mapState.lens==='none'&&mapState.pointerEvents!=='none',
    'Map cursor handoff or map interaction is not configured correctly: '+JSON.stringify(mapState));
  await page.mouse.move(mapRect.x-20,mapRect.y-20);
  await page.waitForTimeout(80);
  const restored=await page.evaluate(()=>({
    active:document.body.classList.contains('cursor-over-embedded-map'),
    cursorDot:getComputedStyle(document.querySelector('.cursor-dot')).display
  }));
  assert(!restored.active&&restored.cursorDot!=='none',
    'Custom cursor did not resume after leaving the map: '+JSON.stringify(restored));
  console.log('PASS: Native pointer is visible and interactive inside Contact map; custom cursor resumes on exit.');

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
