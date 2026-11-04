/* Deterministic Creative Production exports. Tooling stays outside application dependencies. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'sharp');
const opentype = require(process.env.OPENTYPE_MODULE || 'opentype.js');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'public/soy-summit');
const masters = path.join(root, 'docs/soy-summit/masters');
const evidence = path.join(root, 'docs/soy-summit/evidence');
for (const folder of [out,masters,evidence]) fs.mkdirSync(folder,{recursive:true});
const font = name => { const b = fs.readFileSync(path.join(root, 'src/assets/fonts', name)); return opentype.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };
const archivo = font('archivo-black.ttf'), hind = font('hind-regular.ttf');
const symbol = fs.readFileSync(path.join(root, 'public/alvorada/fenasoja-symbol-official.png')).toString('base64');
const grain = fs.readFileSync(path.join(root, 'src/assets/fenasoja-golden-soybean.png')).toString('base64');
const source = fs.readFileSync(path.join(root, 'src/config/soy-summit.ts'), 'utf8');
const string = name => source.match(new RegExp(`${name}: '([^']+)'`))[1];
const green = string('green'), cream = string('cream'), curve = string('curve');
const start = new Date(string('startsAt'));
const date = new Intl.DateTimeFormat('pt-BR',{timeZone:string('timeZone'),day:'numeric',month:'long',year:'numeric'}).format(start);
const time = new Intl.DateTimeFormat('pt-BR',{timeZone:string('timeZone'),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(start).replace(':','h');
const text = (value,font,size,x,y,color=green) => { const p=font.getPath(value,x-font.getAdvanceWidth(value,size)/2,y,size);p.fill=color;return p.toSVG(2); };
const img = (data,x,y,w,h) => `<image href="data:image/png;base64,${data}" x="${x}" y="${y}" width="${w}" height="${h}"/>`;
const brand = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 145">${img(symbol,0,0,145,145)}${text('FENASOJA',archivo,65,380,98,'#082e42')}</svg>`;
function art(w,h,stage,grainSky) {
  const logoW=stage?450:470,logoY=stage?65:110;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" fill="${cream}"/>
    ${stage?`<defs>
      <radialGradient id="grain-focus" cx=".5" cy=".25" r=".7"><stop stop-color="#fffef9" stop-opacity=".72"/><stop offset=".45" stop-color="#fffef9" stop-opacity=".48"/><stop offset="1" stop-color="#fffef9" stop-opacity="0"/></radialGradient>
    </defs>
    <image href="data:image/jpeg;base64,${grainSky}" width="${w}" height="${h}" preserveAspectRatio="xMidYMax slice"/>
    <rect width="${w}" height="${h}" fill="url(#grain-focus)"/>`:''}
    <path d="M-300 ${h+400} C-180 160 320 -200 1000 -200 M-180 ${h+450} C-70 200 430 -140 1150 -190 M-100 ${h+600} C40 300 520 0 1300 -130" fill="none" stroke="${curve}" stroke-width="95" opacity="${stage?'0':'.63'}"/>
    <path d="M${w-430} ${h+300} Q${w-400} ${h-220} ${w+150} ${h-260}" fill="none" stroke="${curve}" stroke-width="110" opacity="${stage?'0':'.53'}"/>
    <g transform="translate(${(w-logoW)/2} ${logoY}) scale(${logoW/600})">${brand.replace(/^<svg[^>]*>|<\/svg>$/g,'')}</g>
    ${text(stage?string('title'):'SOY SUMMIT',archivo,stage?114:124,w/2,stage?328:432)}
    ${text(stage?`${date} • ${time}`:date,hind,stage?49:61,w/2,stage?416:576)}
    ${!stage?img(grain,80,820,240,240)+img(grain,w-260,760,190,190)+img(grain,380,940,120,120):''}
  </svg>`;
}
(async()=>{
  const grainSource=path.join(masters,'soy-grain-sky.png');
  // A decorative ImageGen master only. Exact typography, official symbol and live values stay separate.
  const grainSky=(await sharp(grainSource).jpeg({quality:95}).toBuffer()).toString('base64');
  await sharp(grainSource).resize({width:1400,withoutEnlargement:true}).webp({quality:87}).toFile(path.join(out,'grain-sky-portal.webp'));
  await sharp(grainSource).resize(720,720,{fit:'cover',position:'centre'}).webp({quality:85}).toFile(path.join(out,'grain-sky-mobile.webp'));
  fs.writeFileSync(path.join(masters,'brand.svg'),brand);
  await sharp(Buffer.from(brand)).resize(480).webp({quality:94}).toFile(path.join(out,'brand.webp'));
  for(const [name,svg,width] of [['stage-static',art(2000,900,true,grainSky),2000],['banner',art(1400,1200,false),1400]]) {
    fs.writeFileSync(path.join(masters,name+'.svg'),svg.split('\n').map(line=>line.trimEnd()).join('\n'));
    await sharp(Buffer.from(svg)).resize(width).webp({quality:92}).toFile(path.join(out,name+'.webp'));
    await sharp(Buffer.from(svg)).resize(width).png().toFile(path.join(evidence,name+'.png'));
  }
  await sharp(path.join(masters,'mural-reference-v2.png')).webp({quality:92}).toFile(path.join(out,'mural-reference-v2.webp'));
  for(const obsolete of ['brand.svg','stage-static.svg','banner.svg','mural-reconstruction.svg','mural-reconstruction.webp','grain-portal.webp','harvest-portal.webp','harvest-portal-mobile.webp']) {
    const target=path.join(out,obsolete);if(fs.existsSync(target))fs.unlinkSync(target);
  }
  const provenance={
    'brand.webp':'Official repository symbol unchanged; institutional wordmark composed with existing Archivo Black (substitute, not an original logo vector)',
    'grain-sky-portal.webp':'Native ImageGen decorative master: abundant natural golden soybeans and pale blue/white sky; resized 1400px, no generated text or logo',
    'grain-sky-mobile.webp':'Central square crop of the same ImageGen master, 720×720; clear sky and grains retain contrast behind mobile cards',
    'stage-static.webp':'Creative Production deterministic 20:9 composition: generated soybean/sky background, central ivory light, official symbol and exact title/date; dynamic values and physical cards remain separate',
    'banner.webp':'Creative Production deterministic 7:6 static event banner',
    'mural-reference-v2.webp':'ImageGen rectification/reconstruction of user facade crop, approximate artwork; no original mural file available',
    'exterior-preview.webp':'Screenshot of actual reconstructed scene; lightweight fallback only',
  };
  const manifest=[];
  for(const name of fs.readdirSync(out)) {
    if(!fs.statSync(path.join(out,name)).isFile()) continue;
    const file=path.join(out,name),m=await sharp(file).metadata();
    manifest.push({file:`public/soy-summit/${name}`,destination:name.includes('brand')||name.includes('grain-sky')?'portal and lightweight fallback':name.includes('stage')?'auditorium':name.includes('preview')?'lightweight fallback':'exterior',width:m.width,height:m.height,format:m.format,alpha:!!m.hasAlpha,bytes:fs.statSync(file).size,source:provenance[name]});
  }
  fs.writeFileSync(path.join(root,'docs/soy-summit/assets.json'),JSON.stringify(manifest,null,2));
  console.log(manifest.map(({file,bytes})=>({file,bytes})));
})().catch(e=>{console.error(e);process.exitCode=1;});
