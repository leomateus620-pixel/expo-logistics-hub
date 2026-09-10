const fs = require("node:fs");
const path = require("node:path");
const out = path.resolve("docs/screenshots/vegetation-pilot");
const read = (name) =>
  JSON.parse(fs.readFileSync(path.join(out, name), "utf8"));
const labels = {
  "a-close": "Quadra A · próxima",
  "a-medium": "Quadra A · média",
  "a-ground": "Quadra A · sob as copas",
  "b-close": "Quadra B · próxima",
  "b-medium": "Quadra B · média",
  "b-ground": "Quadra B · sob as copas",
  "parking-close": "Estacionamento · próxima",
  "parking-medium": "Estacionamento · média",
  "parking-ground": "Estacionamento · solo",
  "pilot-high": "Piloto · vista superior",
  overview: "Parque · geral",
  "control-outside": "Área de controle",
};
const metrics = [];
for (const device of ["desktop", "portrait", "landscape"]) {
  const before = read(`before-${device}.json`),
    after = read(`after-${device}.json`);
  for (const [view, b] of Object.entries(before.measurements)) {
    const a = after.measurements[view];
    if (!a) continue;
    metrics.push({
      device,
      view,
      beforeMs: b.meanMs,
      afterMs: a.meanMs,
      beforeP95: b.p95Ms,
      afterP95: a.p95Ms,
      beforeTriangles: b.renderer.triangles,
      afterTriangles: a.renderer.triangles,
      beforeTier: b.renderer.qualityTier,
      afterTier: a.renderer.qualityTier,
      dpr: a.renderer.dpr,
      health: a.health,
    });
  }
}
fs.writeFileSync(
  path.join(out, "comparison.json"),
  JSON.stringify(metrics, null, 2),
);
const rows = metrics
  .map(
    (r) =>
      `| ${r.device} | ${labels[r.view]} | ${r.beforeMs.toFixed(1)} → ${r.afterMs.toFixed(1)} | ${r.beforeP95.toFixed(1)} → ${r.afterP95.toFixed(1)} | ${r.beforeTriangles.toLocaleString("en-US")} → ${r.afterTriangles.toLocaleString("en-US")} | ${r.beforeTier} → ${r.afterTier} |`,
  )
  .join("\n");
fs.writeFileSync(
  path.join(out, "measurements.md"),
  `| Viewport | Câmera | Média ms antes → depois | p95 ms antes → depois | Triângulos antes → depois | Qualidade adaptativa |\n|---|---|---:|---:|---:|---|\n${rows}\n\nChrome headless, Intel UHD / ANGLE D3D11, DPR de navegação 0.72. Cada amostra dura 6.8 s, descarta os 0.8 s iniciais e movimenta a câmera. Mede cadência dos quadros no navegador; não certifica aparelho móvel físico, Safari/iOS ou 60 FPS contínuos. A qualidade adaptativa original permanece ativa e está registrada em cada JSON.\n`,
);
const panels = [];
for (const device of ["desktop", "portrait", "landscape"])
  for (const [view, title] of Object.entries(labels)) {
    const preferred = `before-${device}-${view}.png`;
    const before = fs.existsSync(path.join(out, preferred))
        ? preferred
        : `before-ground-${device}-${view}.png`,
      after = `after-${device}-${view}.png`;
    if (
      !fs.existsSync(path.join(out, before)) ||
      !fs.existsSync(path.join(out, after))
    )
      continue;
    panels.push(
      `<article data-device="${device}"><header><h2>${title}</h2><span>${device}</span></header><div class="comparison"><img loading="lazy" src="${after}" alt="Depois: ${title}"><div class="before"><img loading="lazy" src="${before}" alt="Antes: ${title}"></div><i></i></div><div class="slider"><span>Antes</span><input aria-label="Comparar ${title}" type="range" value="50" min="0" max="100"><span>Depois</span></div></article>`,
    );
  }
fs.writeFileSync(
  path.join(out, "index.html"),
  `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Piloto de vegetação · Comparação</title><style>
*{box-sizing:border-box}body{margin:0;background:#101b18;color:#e8eee7;font:16px system-ui,sans-serif}main{max-width:1500px;margin:auto;padding:40px 24px}h1{font-size:clamp(28px,4vw,52px);letter-spacing:-.04em;margin:12px 0}p{max-width:850px;line-height:1.6;color:#b8c7bc}.eyebrow{color:#bdd59b;font-size:12px;letter-spacing:.15em;text-transform:uppercase}nav{display:flex;gap:8px;margin:24px 0;flex-wrap:wrap}button,a{background:#263a31;color:#eef4ea;border:1px solid #526958;padding:10px 16px;border-radius:7px;text-decoration:none;cursor:pointer}button.active{background:#bdd59b;color:#18251d}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}article{background:#1b2b23;border:1px solid #354b3b;border-radius:12px;overflow:hidden}article[hidden]{display:none}article header{display:flex;align-items:center;justify-content:space-between;padding:15px 18px}h2{font-size:18px;margin:0}header span{font-size:12px;color:#b3c9b7}.comparison{position:relative;--split:50%}.comparison>img{width:100%;display:block}.before{position:absolute;inset:0;clip-path:inset(0 calc(100% - var(--split)) 0 0)}.before img{width:100%;height:100%;object-fit:fill}.comparison i{position:absolute;top:0;bottom:0;left:var(--split);border-left:2px solid #fff}.slider{display:flex;gap:12px;align-items:center;padding:14px 18px;font-size:12px}input{flex:1;accent-color:#bdd59b}.note{border-left:3px solid #bdd59b;padding-left:16px;margin:26px 0}table{width:100%;border-collapse:collapse;font-size:13px}td,th{padding:10px;border-bottom:1px solid #354b3b;text-align:left}.table{overflow:auto;margin:32px 0}@media(max-width:850px){.grid{grid-template-columns:1fr}}
</style><main><div class="eyebrow">Commercial Map · estudo controlado</div><h1>Vegetação com escala e variação.</h1><p>Quadra A, Quadra B e Estacionamento de Expositores e Visitantes. As comparações usam posições de câmera idênticas. Arraste o controle para examinar copas, galhos, casca, solo e sombras.</p><div class="note"><b>74 registros preservados; 63 árvores renderizadas.</b><p>22 na Quadra A, 12 na Quadra B e 29 no estacionamento. As regras existentes de afastamento das vias excluem 11 dos 40 registros do estacionamento. Famílias procedurais compartilhadas, atlas de folhas 256², grama instanciada, detalhes por distância e materiais exclusivos do piloto.</p></div><nav><button class="active" data-filter="desktop">Desktop</button><button data-filter="portrait">Retrato móvel</button><button data-filter="landscape">Paisagem móvel</button><a href="measurements.md">Métricas completas</a><a href="comparison.json">JSON</a></nav><div class="grid">${panels.join("")}</div><div class="table"><h2>Tempo médio por quadro</h2><table><thead><tr><th>Viewport</th><th>Câmera</th><th>Antes</th><th>Depois</th><th>p95 depois</th></tr></thead><tbody>${metrics.map((r) => `<tr><td>${r.device}</td><td>${labels[r.view]}</td><td>${r.beforeMs.toFixed(1)} ms</td><td>${r.afterMs.toFixed(1)} ms</td><td>${r.afterP95.toFixed(1)} ms</td></tr>`).join("")}</tbody></table></div><p>Chrome headless com Intel UHD / ANGLE D3D11. Viewports móveis emulados; sem certificação em aparelho físico, Safari/iOS ou 60 FPS contínuos. A política adaptativa original permanece ativa. Consulte os JSONs para resolução, qualidade, recursos e estado do renderizador de cada amostra.</p></main><script>document.querySelectorAll('input').forEach(input=>input.oninput=()=>input.closest('article').querySelector('.comparison').style.setProperty('--split',input.value+'%'));function filter(device){document.querySelectorAll('article').forEach(a=>a.hidden=a.dataset.device!==device);document.querySelectorAll('button').forEach(b=>b.classList.toggle('active',b.dataset.filter===device))}document.querySelectorAll('button').forEach(b=>b.onclick=()=>filter(b.dataset.filter));filter('desktop')</script></html>`,
);
console.log("Wrote comparison report with", metrics.length, "samples");
