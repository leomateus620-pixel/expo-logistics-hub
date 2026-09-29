const fs = require('node:fs');
const path = require('node:path');

// Run only after both capture pairs and their summary scripts have completed.
// Read all inputs before writing, so an unfinished suite cannot publish half a report.
const suites = [
  ['benvenuto', 'Benvenuto e entorno dos pavilhões'],
  ['restaurant-gate-trees', 'Restaurante, Portão 2 e árvores internas'],
];
const number = (value, digits = 3) => Number.isFinite(value)
  ? value.toLocaleString('pt-BR', { maximumFractionDigits: digits }) : 'não registrado';
const flag = value => value === true ? 'sim' : value === false ? 'não' : 'não registrado';
const literal = value => value === undefined || value === null ? 'não registrado' : String(value);
const cell = value => literal(value).replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
const resources = value => value
  ? [value.geometries, value.textures, value.programs].map(cell).join(' / ') : 'não registrado';
const identity = value => value
  ? `${cell(value.canvases)} / ${cell(value.renderers)} / ${cell(value.controls)}; ativos ${cell(value.activeCanvases)} / ${cell(value.activeControls)}`
  : 'não registrado';
const list = (values, format = literal) => values?.length ? values.map(format).join(' → ') : 'não registrado';
const mib = bytes => Number.isFinite(bytes) ? number(bytes / 1024 ** 2) : 'não registrado';
const row = (label, before, after) => `| ${label} | ${cell(before)} | ${cell(after)} |`;
const resourceStability = cycles => cycles?.length
  ? flag(cycles.every(value => resources(value) === resources(cycles[0]))) : 'não registrado';

function validatePair(pair, label) {
  if (!pair?.before || !pair?.after || !Array.isArray(pair.cameraDeltas)) {
    throw Error(`Incomplete summary: ${label}`);
  }
  for (const phase of ['before', 'after']) {
    const value = pair[phase];
    if (!value.entrySeconds || !value.navigation || value.runs?.length !== 3) {
      throw Error(`Missing entry/navigation/three runs: ${label}/${phase}`);
    }
  }
}

function interactionRows(before, after) {
  const rows = [];
  const metric = (label, get) => rows.push(row(label, get(before), get(after)));
  metric('Erros de página registrados', value => value.errors?.length ?? 'não registrado');
  metric('Overflow em retrato', value => flag(value.overflow));
  metric('Saúde da cena / caminho', value => `${literal(value.health?.status)} / ${literal(value.health?.path)}`);
  metric('Perdas de contexto antes do smoke', value => literal(value.health?.contextLosses));
  metric('Canvas / renderer / controles; Canvas / controles ativos', value => identity(value.identity));
  metric('Deslocamento na visita do roteiro (m)', value => number(value.visitTravelMetres));
  if (before.smoke || after.smoke) {
    metric('Smoke de recuperação executado', value => flag(Boolean(value.smoke)));
    metric('Seleção coincide com interior aberto', value => value.smoke?.selectedInterior
      ? flag(value.smoke.selectedInterior.selected === value.smoke.selectedInterior.interior) : 'não registrado');
    metric('Recuperação WebGL: saúde / caminho', value => value.smoke
      ? `${literal(value.smoke.recoveredHealth?.status)} / ${literal(value.smoke.recoveredHealth?.path)}` : 'não registrado');
    metric('Deriva na recuperação (unidade do mapa)', value => number(value.smoke?.recoveryDrift));
    metric('Movimento após recuperação (m)', value => number(value.smoke?.travelAfterRecoveryMetres));
    metric('Identidade após recuperação', value => identity(value.smoke?.identity));
    metric('Toque cancelado: personagem parado', value => flag(value.smoke?.touchStopped));
    metric('Toque cancelado: deriva (unidade do mapa)', value => number(value.smoke?.touchDrift));
    metric('Overflow em paisagem', value => flag(value.smoke?.landscapeOverflow));
  }
  if (before.accessSmoke || after.accessSmoke) {
    metric('Smoke C2/A2: resultado declarado pelo roteiro', value => flag(value.accessSmoke?.passed));
    metric('Seleção C2/A2', value => value.accessSmoke?.selections?.map(selection =>
      `${selection.identifier}: ${flag(selection.passed)}`).join('; ') || 'não registrado');
    metric('Câmeras de seleção iguais dia/noite', value => value.accessSmoke?.selections?.map(selection =>
      `${selection.identifier}: ${flag(selection.sameCameraDayNight)}`).join('; ') || 'não registrado');
    metric('Chegada A2 pelo lado da avenida', value => flag(value.accessSmoke?.gateArrival?.onAvenueSide));
    metric('Chegada alinhada com passagem direita', value => flag(value.accessSmoke?.gateArrival?.alignedWithRightPassage));
    metric('Chegada voltada ao interior do parque', value => flag(value.accessSmoke?.gateArrival?.facesIntoPark));
    metric('Percurso atravessa a passagem coberta', value => flag(value.accessSmoke?.throughCoveredPassage));
    metric('Posição de visita igual dia/noite', value => flag(value.accessSmoke?.sameVisitPositionDayNight));
    metric('Caminhada frontal / lateral (m)', value => value.accessSmoke?.movementMetres
      ? `${number(value.accessSmoke.movementMetres.forward)} / ${number(value.accessSmoke.movementMetres.right)}` : 'não registrado');
    metric('Retomada do movimento (m)', value => number(value.accessSmoke?.resumedMetres));
    metric('Cancelamento de toque aprovado pelo roteiro', value => flag(value.accessSmoke?.touchCancellationPassed));
    metric('Deriva após cancelamento (m)', value => number(value.accessSmoke?.touchDriftMetres));
    metric('Identidade preservada no retorno C2/A2', value => flag(value.accessSmoke?.identityPreserved));
  }
  return rows;
}

function render(title, summary) {
  const lines = [
    `# ${title} — resultados da captura atual`,
    '',
    'Gerado por `scripts/commercial-map-performance/benvenuto-reports.cjs` a partir de [summary.json](summary.json). Os números abaixo correspondem aos arquivos atuais de `before/` e `after/`; o relatório não representa aprovação automática da revisão visual, dos testes ou da PR.',
    '',
    `Base comparada: \`${cell(summary.base)}\`. Navegador: ${cell(summary.browser)}.`,
    '',
    'Desktop: 1440 × 900. Mobile **emulado**: 390 × 844 no mesmo computador Windows com Intel UHD; não é resultado de celular físico, Safari/iOS nem validação de uma variedade de GPUs. A resolução efetiva segue o DPR adaptativo registrado em cada rodada.',
    '',
    `Condições do coletor: ${cell(summary.conditions)}`,
    '',
    'Cada perfil usa um contexto novo, sem build/teste concorrente e sem limitação artificial de rede. São três trechos determinísticos de navegação de oito segundos; o diagnóstico guarda até 240 amostras recentes por janela. Tempos de entrada são observações de uma execução por fase. Cache do driver, temperatura e carga do sistema não são totalmente controlados; diferenças pequenas não comprovam ganho de desempenho generalizável.',
    '',
    'Draw calls abaixo são os valores registrados durante cada uma das três rodadas de navegação, na ordem do roteiro. Não são médias por segundo. A fotografia estática pode conservar um quadro com passes ocasionais de sombra; seu contador não é usado como comparação de desempenho.',
    '',
    'Bytes de geometria são buffers encontrados na cena. Texturas são estimativas RGBA com mipmaps automáticos, **não VRAM física medida**; mipmaps manuais, render targets e alocações internas do driver não estão contabilizados. Contagens de geometrias/texturas/programas indicam recursos conhecidos pelo renderer e não equivalem a bytes de memória gráfica.',
    '',
  ];
  for (const [device, pair] of Object.entries(summary.devices)) {
    validatePair(pair, device);
    const before = pair.before, after = pair.after;
    const metric = (label, get) => lines.push(row(label, get(before), get(after)));
    lines.push(`## ${device === 'desktop' ? 'Desktop' : 'Mobile emulado'}`, '', '| Métrica | Antes | Depois |', '| --- | --- | --- |');
    metric('Entrada: Canvas (s)', value => number(value.entrySeconds.canvas));
    metric('Entrada: mapa pronto (s)', value => number(value.entrySeconds.ready));
    metric('Entrada: hidratação completa (s)', value => number(value.entrySeconds.hydrated));
    metric('FPS das amostras de navegação', value => number(value.navigation.fps));
    metric('Tempo de quadro P95 (ms)', value => number(value.navigation.p95ms));
    metric('Amostras de navegação', value => number(value.navigation.samples, 0));
    metric('FPS por rodada 1 / 2 / 3', value => list(value.runs, run => number(run.fps)));
    metric('P95 por rodada 1 / 2 / 3 (ms)', value => list(value.runs, run => number(run.p95ms)));
    metric('Draw calls em navegação: rodada 1 / 2 / 3', value => list(value.runs, run => number(run.calls, 0)));
    metric('DPR em navegação: rodada 1 / 2 / 3', value => list(value.runs, run => number(run.dpr)));
    metric('Qualidade em navegação: rodada 1 / 2 / 3', value => list(value.runs, run => run.tier));
    metric('Buffers de geometria (bytes)', value => number(value.geometryBufferBytes, 0));
    metric('Buffers de geometria (MiB)', value => mib(value.geometryBufferBytes));
    metric('Texturas estimadas (bytes)', value => number(value.textureBytesEstimate, 0));
    metric('Texturas estimadas (MiB)', value => mib(value.textureBytesEstimate));
    metric('Recursos na vista inicial: geometrias / texturas / programas', value => resources(value.aerial));
    metric('Recursos aquecidos: sequência geometrias / texturas / programas', value => list(value.warmedResources, resources));
    metric('Contagens aquecidas iguais em todas as amostras', value => resourceStability(value.warmedResources));
    const cameraMax = key => pair.cameraDeltas.length
      ? Math.max(...pair.cameraDeltas.map(view => view[key])) : undefined;
    lines.push('', `Enquadramentos comparados: ${pair.cameraDeltas.length}. Diferença máxima de posição da câmera: **${number(cameraMax('position'), 9)}**; diferença máxima do alvo: **${number(cameraMax('target'), 9)}** (unidades do mapa).`);
    const mismatches = pair.cameraDeltas.filter(view => view.position !== 0 || view.target !== 0);
    if (mismatches.length) lines.push('', `Enquadramentos com diferença: ${mismatches.map(view => `\`${view.view}\``).join(', ')}. Conferir antes de atribuir variações à implementação.`);
    lines.push('', '### Interação e integridade', '', '| Verificação | Antes | Depois |', '| --- | --- | --- |', ...interactionRows(before, after));
    for (const [phase, value] of [['Antes', before], ['Depois', after]]) {
      if (value.errors?.length) lines.push('', `${phase}: erros registrados:`, '', '```json', JSON.stringify(value.errors, null, 2), '```');
    }
    lines.push('');
  }
  lines.push('## Leitura dos resultados', '',
    'A ausência de erros neste roteiro não substitui teste em hardware físico. Flags ausentes significam “não registrado”, e não aprovação. O smoke complementar é executado depois das medições e seus tempos não entram no FPS ou na entrada. Um resultado negativo na base histórica pode documentar justamente o defeito corrigido; cada flag deve ser lida com sua fase.', '',
    'A galeria [comparison.html](comparison.html) e os JSON brutos preservam as capturas e os detalhes. Build, testes dirigidos, estado dos checks remotos e limitações da revisão visual são documentados separadamente no [README](README.md).', '');
  return lines.join('\n');
}

const reports = suites.map(([folder, title]) => {
  const directory = path.resolve('docs/validation', folder);
  const summary = JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8'));
  if (!summary.devices?.desktop || !summary.devices?.['mobile-emulated']) {
    throw Error(`Missing desktop/mobile summary: ${folder}`);
  }
  return { destination: path.join(directory, 'RESULTS.md'), markdown: render(title, summary) };
});
for (const report of reports) {
  fs.writeFileSync(report.destination, report.markdown);
  console.log(report.destination);
}
