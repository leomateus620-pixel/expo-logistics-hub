const fs = require('node:fs');
const path = require('node:path');

const directory = path.resolve(__dirname, '../../docs/validation/restaurant-gate-trees');
const profiles = [
  ['desktop', 'Desktop · 1440 × 900'],
  ['mobile-emulated', 'Celular emulado · 390 × 844'],
];
const views = [
  ['01-restaurant-aerial', 'Restaurante C2/C3 e B1 · vista aérea'],
  ['02-restaurant-oblique', 'Restaurante C2/C3 e B1 · vista oblíqua'],
  ['03-restaurant-ground', 'Restaurante · fachada ao nível do solo'],
  ['04-arvoredo', 'Calçada do Arvoredo · troncos, canteiros e circulação'],
  ['05-gate2-front', 'Portão 2 · silhueta frontal voltada à avenida'],
  ['06-gate2-side', 'Portão 2 · profundidade e passagem lateral'],
  ['07-internal-trees', 'Árvores internas · vista geral'],
  ['08-grove-ground', 'Bosque interno · vista baixa'],
];
const optionalViews = [
  ['night', 'Cena no modo noturno'],
  ['visit', 'Modo Visita · enquadramento do roteiro'],
];
const smokeViews = [
  ['restaurant', 'Restaurante · inspeção complementar dia/noite'],
  ['gate2', 'Portão 2 · inspeção complementar dia/noite'],
  ['gate2-visit', 'Portão 2 no Modo Visita · inspeção complementar dia/noite'],
];
const escapeHtml = value => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const exists = relative => fs.existsSync(path.join(directory, relative));
const missing = [];
let pairedViews = 0;
let supplementalPairs = 0;

function figure(relative, label, title) {
  const image = exists(relative)
    ? `<a href="${relative}"><img loading="lazy" decoding="async" src="${relative}" alt="${escapeHtml(title + ' — ' + label)}"></a>`
    : `<div class="pending" role="note">Captura ainda não disponível nesta geração da galeria.<br><code>${escapeHtml(relative)}</code></div>`;
  if (!exists(relative)) missing.push(relative);
  return `<figure><figcaption>${escapeHtml(label)}</figcaption>${image}</figure>`;
}

function comparison(profile, name, title) {
  const before = `before/${profile}-${name}.png`;
  const after = `after/${profile}-${name}.png`;
  if (exists(before) && exists(after)) pairedViews++;
  return `<section class="view"><h3>${escapeHtml(title)}</h3><div class="pair">${figure(before, 'Antes · 9ddda43f', title)}${figure(after, 'Depois · build do worktree da PR', title)}</div></section>`;
}

const sections = profiles.map(([profile, label]) => {
  const fixed = views.map(([name, title]) => comparison(profile, name, title)).join('\n');
  const optional = optionalViews.filter(([name]) => (
    exists(`before/${profile}-${name}.png`) && exists(`after/${profile}-${name}.png`)
  )).map(([name, title]) => comparison(profile, name, title)).join('\n');
  const portrait = profile === 'mobile-emulated' ? [
    ['09-restaurant-mobile-overview', 'Enquadramento amplo de C2 e B1 no retrato'],
    ['10-gate2-mobile-overview', 'Fachada completa de A2 no retrato'],
  ].filter(([name]) => exists(`before/${profile}-${name}.png`) && exists(`after/${profile}-${name}.png`))
    .map(([name, title]) => comparison(profile, name, title)).join('\n') : '';
  return `<article id="${profile}"><h2>${escapeHtml(label)}</h2>${fixed}\n${optional}\n${portrait}</article>`;
}).join('\n');

const supplemental = profiles.flatMap(([profile, label]) => (
  ['before', 'after'].flatMap(phase => smokeViews.flatMap(([name, title]) => {
    const day = `${phase}/${profile}-smoke-${name}-day.png`;
    const night = `${phase}/${profile}-smoke-${name}-night.png`;
    if (!exists(day) || !exists(night)) return [];
    supplementalPairs++;
    const build = phase === 'before' ? '9ddda43f' : 'worktree da PR';
    return [`<section class="view"><h3>${escapeHtml(label + ' · ' + title)}</h3><p>Build: ${escapeHtml(build)}. Este par compara iluminação; não substitui o antes/depois acima.</p><div class="pair">${figure(day, 'Dia', title)}${figure(night, 'Noite', title)}</div></section>`];
  }))
)).join('\n');

const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Restaurante, Portão 2 e árvores internas — comparação</title>
<style>
:root{color-scheme:light;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#1f3028;background:#f3f4f1}
*{box-sizing:border-box}body{margin:0;padding:24px}main{max-width:1660px;margin:auto}
h1{font-size:clamp(1.6rem,3vw,2.2rem);line-height:1.15;max-width:1050px}h2{font-size:1.5rem;border-bottom:2px solid #bdc9bf;padding:30px 0 14px}
h3{font-size:1.1rem;margin:0 0 12px}p{line-height:1.55;max-width:1100px;color:#435449}
a{color:#205c3c;text-underline-offset:3px}nav{display:flex;flex-wrap:wrap;gap:10px 24px;margin:22px 0}
nav a{font-weight:650}.note{border-left:4px solid #7d917c;padding:10px 16px;background:#e8ede5}
.view{margin:28px 0 40px}.pair{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:14px;align-items:start}
figure{margin:0;overflow:hidden;border:1px solid #c3ccc2;background:#e0e6dd;border-radius:5px}
figcaption{padding:10px 12px;background:#eaf0e7;font-weight:650}figure a{display:block}
img{display:block;width:100%;height:auto;max-height:1050px;object-fit:contain;background:#202b24}
.pending{min-height:200px;display:grid;align-content:center;padding:20px;line-height:1.6;color:#5b6359}
code{font-size:.85em;overflow-wrap:anywhere}footer{border-top:1px solid #bdc9bf;padding-top:15px;margin-top:40px}
@media(max-width:740px){body{padding:12px}.pair{grid-template-columns:1fr;gap:12px}.view{margin-bottom:34px}figcaption{font-size:.95rem}}
</style>
</head>
<body><main>
<h1>Restaurante C2/C3, Portão 2 e árvores internas</h1>
<p>Comparação das capturas feitas nos mesmos oito enquadramentos do roteiro. A referência <strong>9ddda43f</strong> já contém as correções de Benvenuto; os arquivos posteriores vêm do build do worktree da PR #173. Clique numa imagem para abrir sua resolução original.</p>
<p class="note">Esta galeria organiza evidências e não declara aprovação visual ou desempenho. Os arquivos em <code>after/</code> são substituídos após cada revisão. Consulte o <a href="README.md">relatório de validação</a> para o estado final, revisões e limitações. Alturas arquitetônicas e folhagem são estimativas de apresentação; os footprints vêm do cadastro.</p>
<nav aria-label="Vistas da comparação"><a href="#desktop">Desktop</a><a href="#mobile-emulated">Celular emulado</a>${supplemental ? '<a href="#supplemental">Dia/noite complementar</a>' : ''}<a href="README.md">Relatório</a></nav>
${sections}
${supplemental ? `<article id="supplemental"><h2>Inspeções complementares de iluminação e navegação</h2><p>Somente pares com os dois PNGs disponíveis são incluídos. Estas capturas complementam os enquadramentos controlados; sua presença não comprova aprovação dos testes de interação.</p>${supplemental}</article>` : ''}
<footer><p>Celular significa emulação no Chrome, não ensaio em aparelho físico. Contagens de recursos e estimativas de bytes do roteiro não equivalem a VRAM medida no driver. Resultados de desempenho devem ser consultados no relatório e nos JSONs, sob as mesmas condições de medição.</p><p>Galeria local, sem dependências de rede. Regenerar: <code>node scripts/commercial-map-performance/restaurant-gate-gallery.cjs</code>.</p></footer>
</main></body>
</html>
`;

fs.writeFileSync(path.join(directory, 'comparison.html'), html);
console.log(JSON.stringify({ file: path.join(directory, 'comparison.html'), pairedViews, supplementalPairs, missing }, null, 2));
