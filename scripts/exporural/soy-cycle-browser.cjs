process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY='1';
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const fs=require('node:fs'),path=require('node:path');
const out=process.env.SOY_OUTPUT||'/tmp/exporural-soy-evidence';fs.mkdirSync(out,{recursive:true});
const base=process.env.SOY_BASE||'http://127.0.0.1:5199';
const save=(name,data)=>fs.writeFileSync(path.join(out,name+'.json'),JSON.stringify(data,null,2));
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
 const result={errors:[],requests:[],shots:[],browser:browser.version()};
 page.on('pageerror',error=>{result.errors.push(error.message);console.log('error',error.message)});
 page.on('request',r=>result.requests.push(r.url()));
 const capture=()=>page.evaluate(()=>window.__soyQA.capture());
 const shot=async name=>{await page.screenshot({path:path.join(out,name+'.png'),timeout:5000});result.shots.push({name,state:await capture()});save('cycle-progress',result);console.log(name);};
 const pose=async(p,t)=>{await page.evaluate(([p,t])=>window.__soyQA.pose(p,t),[p,t]);await page.waitForTimeout(1000)};
 const stateModule='/src/features/commercial-map/harvest/useSoyHarvestStore.ts';
 try{
  await page.goto(base+'/scripts/exporural/soy-review.html?scope=full',{waitUntil:'domcontentloaded',timeout:120000});
  await page.waitForFunction(()=>document.querySelector('canvas')?.dataset.commercialMapReady==='true',null,{timeout:45000});
  await page.waitForTimeout(2000);
  await page.evaluate(async()=>{const m=(await import('/src/features/commercial-map/state/useCommercialMapStore.ts')).useCommercialMapStore;m.setState({sunrisePhase:'complete',nightModeActive:false,rainModeActive:false});});
  result.initial=await capture(); result.requestedBeforeStart=result.requests.filter(url=>/SoyHarvestExperience|SoyHarvestScene|soyMachines/.test(url));
  await pose([10,8,-18],[10,.1,-18]);await shot('tree-top');
  await pose([11,5,-13],[8.8,.6,-18.8]);await shot('tree-oblique');
  await pose([31.7,2.1,-17.6],[30.88,.9,-21.05]);await shot('transformer-close');
  await pose([33,15,-22],[33,.1,-22]);await shot('transformer-context');
  await pose([52,12,-38],[52,.1,-54.5]);await shot('field-initial');
  result.before=await capture();
  await page.evaluate(async module=>{
    const {useSoyHarvestStore}=await import(module);
    window.__soyVideo={chunks:[]};
    const unsubscribe=useSoyHarvestStore.subscribe(s=>{
      if(s.status!=='running'||window.__soyVideo.recorder)return;
      const stream=document.querySelector('canvas').captureStream(30);
      const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:5500000});
      window.__soyVideo.recorder=recorder;window.__soyVideo.stream=stream;
      recorder.ondataavailable=e=>{if(e.data.size)window.__soyVideo.chunks.push(e.data)};recorder.start(1000);unsubscribe();
    });
    window.__soyQA.probe(true);
  },stateModule);
  await page.getByRole('button',{name:'Ver ciclo da soja',exact:true}).filter({visible:true}).first().click();
  await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='running',null,{timeout:30000});
  result.playbackStart=Date.now();
  // Record in real time without blocking frames with screenshots/font waits.
  result.liveSamples=[];
  for(let second=0;second<49;second++){
    await page.waitForTimeout(1000);const sample=await capture();
    result.liveSamples.push({wallMs:Date.now()-result.playbackStart,...sample});
    console.log('playback',second,sample.cycle.status,sample.cycle.elapsed);
    if(sample.cycle.status==='completed')break;
    if(sample.cycle.status!=='running')throw new Error('Playback interrupted: '+sample.cycle.status);
  }
  await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.status==='completed',null,{timeout:15000});
  result.playbackElapsedMs=Date.now()-result.playbackStart;result.animationFrames=await page.evaluate(()=>window.__soyQA.probe(false));
  await page.waitForTimeout(700);await shot('cycle-final');
  const bytes=await page.evaluate(()=>new Promise(resolve=>{const v=window.__soyVideo;v.recorder.onstop=async()=>{v.stream.getTracks().forEach(track=>track.stop());const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob(v.chunks,{type:'video/webm'}));};v.recorder.stop();}));
  fs.writeFileSync(path.join(out,'soy-cycle-48s.webm'),Buffer.from(bytes,'base64'));
  await page.getByRole('button',{name:'Voltar ao mapa',exact:true}).click();await page.waitForTimeout(1100);result.returned=await capture();
  await page.getByRole('button',{name:'Restaurar lavoura',exact:true}).click();await page.waitForTimeout(500);result.restored=await capture();
  await page.getByRole('button',{name:'Ver ciclo da soja',exact:true}).filter({visible:true}).first().click();
  await page.waitForFunction(()=>window.__soyQA.capture()?.cycle.elapsed>1);
  await page.getByRole('button',{name:'Pausar ciclo da soja',exact:true}).click();const paused=await capture();await page.waitForTimeout(1200);result.pause={before:paused,after:await capture()};
  await page.getByRole('button',{name:'Continuar ciclo da soja',exact:true}).click();await page.waitForTimeout(500);await page.keyboard.press('Escape');await page.waitForTimeout(1100);result.cancelled=await capture();
  save('cycle-result',result);
 }catch(error){result.errors.push(String(error));result.body=await page.locator('body').innerText();result.canvas=await page.locator('canvas').evaluate(c=>({shader:c.dataset.commercialMapShaderError,preparation:c.dataset.commercialMapPreparationError})).catch(()=>null);save('cycle-result',result);console.error(error);process.exitCode=1;}
 finally{await browser.close();}
})();
