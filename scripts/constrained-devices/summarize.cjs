// Read-only reduction of the sequential boot harness outputs. No browser,
// network, build, GPU queries, compression, percentile extrapolation or writes
// outside the selected summary and its adjacent Markdown. Commercial payloads
// are never read.
const fs = require('node:fs');
const path = require('node:path');
const input = path.resolve(process.env.MAP_BOOT_SUMMARY_INPUT || process.argv[2] || '/tmp/fenasoja-map-benchmarks');
const output = path.resolve(process.env.MAP_BOOT_SUMMARY_OUTPUT || process.argv[3] || 'docs/validation/constrained-devices/boot-summary.json');
const provenancePath = path.resolve(process.env.MAP_BOOT_PROVENANCE || 'docs/validation/constrained-devices/functional/functional-summary.json');
const provenance = fs.existsSync(provenancePath) ? JSON.parse(fs.readFileSync(provenancePath, 'utf8')) : null;
const policyPath = path.resolve(process.env.MAP_BOOT_SUMMARY_POLICY || 'docs/validation/constrained-devices/boot-input-policy.json');
const inputPolicy = fs.existsSync(policyPath) ? JSON.parse(fs.readFileSync(policyPath, 'utf8')) : {};
const baseSha = process.env.MAP_BOOT_BASE_SHA || provenance?.baseSha || 'unknown';
const candidateSha = process.env.MAP_BOOT_CANDIDATE_SHA || provenance?.candidateSourceSha || 'unknown';
const finite = value => typeof value === 'number' && Number.isFinite(value);
const round = value => finite(value) ? Math.round(value * 10) / 10 : null;
const stats = values => {
  const sorted = values.filter(finite).sort((a, b) => a - b), n = sorted.length;
  return { n, median: n ? round(n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2) : null,
    min: n ? round(sorted[0]) : null, max: n ? round(sorted[n - 1]) : null };
};
const redact = value => String(value).replace(/https?:\/\/[^\s"'<>]+/g, '[url-redacted]')
  .replace(/(?:bearer|token|apikey|password|credential)[=: ]+[^\s,;]+/gi, '[credential-redacted]');
function eventDetail(events, name) {
  const values = events.filter(e => e.name === name);
  return { count: values.length, durationMs: values.some(e => finite(e.duration)) ? round(values.reduce((s, e) => s + (finite(e.duration) ? e.duration : 0), 0)) : null,
    maximumDurationMs: values.some(e => finite(e.duration)) ? round(Math.max(...values.filter(e => finite(e.duration)).map(e => e.duration))) : null };
}
function shaders(events) {
  const submission = eventDetail(events, 'program-submission');
  const compileJs = eventDetail(events, 'compile-direct-js');
  const introspection = events.filter(e => e.name === 'program-introspection');
  const links = events.filter(e => e.name === 'program-links-ready');
  return { directCompileJs: compileJs, submittedSync: submission,
    linkReadiness: { observedJobs: links.length,
      elapsedIncludingSchedulingMs: links.length ? round(links.reduce((s, e) => s + (e.detail?.elapsedMs || 0), 0)) : null,
      maxJobElapsedMs: links.length ? round(Math.max(...links.map(e => e.detail?.elapsedMs || 0))) : null },
    reflection: { observedJobs: introspection.length,
      synchronousDurationMs: introspection.length ? round(introspection.reduce((s, e) => s + (e.duration || 0), 0)) : null,
      elapsedIncludingSchedulingMs: introspection.length ? round(introspection.reduce((s, e) => s + (e.detail?.elapsedMs || 0), 0)) : null,
      maximumBatchMs: introspection.length ? round(Math.max(...introspection.map(e => e.detail?.maximumBatchMs || 0))) : null,
      totalBatches: introspection.length ? introspection.reduce((s, e) => s + (e.detail?.batches || 0), 0) : null,
      initializedProgramsByJob: introspection.map(e => e.detail?.initializedPrograms ?? null),
      outcomes: [...new Set(introspection.map(e => e.detail?.outcome || 'unknown'))] },
    note: 'QA-only bounded events. Submission is synchronous JS, readiness/reflection elapsed include scheduling/polling and overlap; none is pure GPU time. program-submission was added in candidate; baseline absence is unknown, not zero.' };
}
function transfer(resources) {
  const rows = Array.isArray(resources) ? resources : [];
  const add = key => rows.some(e => finite(e[key])) ? rows.reduce((sum, e) => sum + (finite(e[key]) ? e[key] : 0), 0) : null;
  const byKind = {};
  for (const e of rows) {
    const extension = path.extname(e.path || '') || 'untyped';
    const group = byKind[extension] ||= { count: 0, encodedBodyBytes: 0, transferBytes: 0 };
    group.count++; group.encodedBodyBytes += e.encodedBodySize || 0; group.transferBytes += e.transferSize || 0;
  }
  return { resourceCount: rows.length, encodedBodyBytes: add('encodedBodySize'), transferBytes: add('transferSize'), decodedBodyBytes: null,
    zeroTransferEntries: rows.filter(e => e.transferSize === 0).length, byKind,
    note: 'Recorded main-document Resource Timing body/transfer totals, not a network waterfall sum or full worker resource inventory. Server has no compression. decodedBodySize was not captured and remains unknown; zero transfer can mean browser cache or blocked/unobservable entry. Transfer includes overhead and is not JS-only.' };
}
function capture(source) {
  if (!source) return null;
  const summary = source.boot?.summary || {}, events = source.boot?.events || [];
  const renderer = source.renderer;
  const bootStart = summary.routeStartedAt, bootEnd = summary.documentToInteractiveMs;
  const fromRoute = stage => {
    const event = events.find(e => e.name === stage);
    return event && finite(bootStart) ? round(event.at - bootStart) : null;
  };
  const tasks = (source.boot?.longTasks || []).filter(e => (!finite(bootStart) || e.at >= bootStart) && (!finite(bootEnd) || e.at <= bootEnd));
  return { readiness: source.readiness || null, ready: source.ready || null, essentialReady: source.essentialReady || null,
    health: source.health || null, quality: source.quality || null, identity: source.identity || null,
    buffer: source.buffer || null, viewport: source.viewport || null, visible: source.visible || 'unknown', focused: source.focused ?? 'unknown',
    extensions: source.extensions || 'unknown', workerStatus: source.workerStatus || 'unknown',
    renderer: renderer ? { calls: renderer.calls, triangles: renderer.triangles, geometries: renderer.geometries,
      textures: renderer.textures, programs: renderer.programs, dpr: renderer.dpr, width: renderer.width, height: renderer.height,
      heapBytes: renderer.heapBytes ?? null, qualityTier: renderer.qualityTier } : null,
    stagesMs: Object.fromEntries(Object.entries(summary).filter(([k, v]) => k.endsWith('Ms') && !k.includes('Started')).map(([k, v]) => [k, finite(v) ? round(v) : null])),
    timelineFromRouteMs: { essentialPrepared: fromRoute('essential-scene:prepared'), controlsInstalled: fromRoute('controls-created'),
      firstDraw: fromRoute('first-draw'), firstReady: summary.interactiveMs ?? null,
      secondaryHydrationComplete: fromRoute('secondary-hydration-complete') },
    cpuStagesMs: summary.cpuStagesMs || {}, shaderPreparation: shaders(events),
    bootLongTasks: { count: tasks.length, totalMs: round(tasks.reduce((sum, e) => sum + e.duration, 0)),
      maximumMs: tasks.length ? round(Math.max(...tasks.map(e => e.duration))) : null },
    detailedEventCount: events.length,
    failuresInBoundedEvents: events.filter(e => e.failed).map(e => ({ stage: e.name, durationMs: round(e.duration) })),
    transport: transfer(source.resources) };
}
const scenarios = [];
const exclusions = [];
let originalRawOpenings = 0;
for (const name of ['desktop', 'cpu4', 'mobile', 'network']) {
  const file = path.join(input, `boot-${name}.json`);
  if (!fs.existsSync(file)) throw Error(`Missing completed boot output: ${file}`);
  const source = JSON.parse(fs.readFileSync(file, 'utf8'));
  originalRawOpenings += source.rows.length;
  let inputRows = source.rows;
  const policy = inputPolicy[name];
  if (policy) {
    const excluded = source.rows.filter(row => policy.excludedOriginalRounds.includes(row.round));
    inputRows = source.rows.filter(row => !policy.excludedOriginalRounds.includes(row.round));
    let replacements = [];
    const replacementFile = process.env.MAP_BOOT_CPU4_REPLACEMENT || policy.replacementFile;
    if (fs.existsSync(replacementFile)) {
      const replacement = JSON.parse(fs.readFileSync(replacementFile, 'utf8'));
      const expectedKeys = new Set(excluded.map(row => `${row.label}:${row.round}:${row.cache}`));
      const actualKeys = new Set(replacement.rows.map(row => `${row.label}:${row.round}:${row.cache}`));
      if (replacement.rows.length === policy.expectedReplacementRows && expectedKeys.size === actualKeys.size
        && [...actualKeys].every(key => expectedKeys.has(key)) && !replacement.rows.some(row => row.failure || row.errors?.length)) replacements = replacement.rows;
    }
    exclusions.push({ scenario: name, originalRawPath: file, excludedRounds: policy.excludedOriginalRounds,
      excludedRowCount: excluded.length, reason: policy.reason, replacementFile,
      replacementRowCount: replacements.length, status: replacements.length === excluded.length ? 'replaced-clean' : 'pending-clean-replacement' });
    inputRows = [...inputRows, ...replacements].sort((a, b) => a.round - b.round || a.label.localeCompare(b.label) || a.cache.localeCompare(b.cache));
  }
  const rows = inputRows.map((row, index) => {
    const firstReady = capture(row), hydrated = capture(row.hydrated);
    const started = row.boot?.summary?.routeStartedAt;
    return { index, label: row.label, round: row.round, cache: row.cache, failure: row.failure ? redact(row.failure) : null,
      errors: (row.errors || []).map(redact), blockedRequestCount: row.blocked?.length ?? null,
      firstReady, hydrated,
      controlGesture: { moved: row.controlsMoved ?? false, starts: row.gesture?.starts ?? null, changes: row.gesture?.changes ?? null,
        observationFromRouteMs: finite(row.interactionObservedAtMs) && finite(started) ? round(row.interactionObservedAtMs - started) : null,
        nextRafResponseMs: hydrated?.stagesMs.controlsResponseMs ?? null,
        note: 'Native pointer gesture accepted and camera moved; observation is harness completion time, next RAF is event-loop opportunity, neither measures physical input-to-photon.' },
      gpu: row.hydrated?.gpu || row.gpu || 'unknown', userAgent: row.userAgent || 'unknown' };
  });
  const groups = [];
  for (const label of ['baseline', 'candidate']) for (const cache of ['cold', 'warm']) {
    const selected = rows.filter(row => row.label === label && row.cache === cache);
    const stageKeys = [...new Set(selected.flatMap(row => Object.keys(row.hydrated?.stagesMs || row.firstReady?.stagesMs || {})))];
    groups.push({ label, cache, openings: selected.length, failures: selected.filter(row => row.failure || row.errors.length).length,
      validFirstPresentation: selected.filter(row => row.firstReady?.ready === 'true' && row.firstReady?.readiness?.controlsInstalled
        && row.firstReady?.readiness?.presentedFrames >= 3 && row.firstReady?.health?.status === 'ready').length,
      nativeControlGesturesMoved: selected.filter(row => row.controlGesture.moved && row.controlGesture.starts > 0 && row.controlGesture.changes > 0).length,
      stagesMs: Object.fromEntries(stageKeys.map(key => [key, stats(selected.map(row => (row.hydrated || row.firstReady)?.stagesMs[key]))])),
      interactionObservedFromRouteMs: stats(selected.map(row => row.controlGesture.observationFromRouteMs)),
      nextRafResponseMs: stats(selected.map(row => row.controlGesture.nextRafResponseMs)),
      hydratedHeapBytes: stats(selected.map(row => row.hydrated?.renderer?.heapBytes)),
      encodedBodyBytesAtHydration: stats(selected.map(row => row.hydrated?.transport?.encodedBodyBytes)),
      transferBytesAtHydration: stats(selected.map(row => row.hydrated?.transport?.transferBytes)),
      bootLongTaskTotalMs: stats(selected.map(row => row.firstReady?.bootLongTasks.totalMs)),
      bootLongTaskMaximumMs: stats(selected.map(row => row.firstReady?.bootLongTasks.maximumMs)),
      dprsAtHydration: [...new Set(selected.map(row => row.hydrated?.renderer?.dpr ?? null))],
      buffersAtHydration: [...new Set(selected.map(row => JSON.stringify(row.hydrated?.buffer)))].map(v => v ? JSON.parse(v) : null),
      qualityAtHydration: [...new Set(selected.map(row => JSON.stringify(row.hydrated?.quality)))].map(v => v ? JSON.parse(v) : null) });
  }
  scenarios.push({ scenario: source.scenario, profile: source.profile, rawReportLocalPath: file,
    cacheDefinition: source.cacheDefinition, openingCount: rows.length, groups, rows });
}
const result = { schemaVersion: 1, baseSha, candidateSourceSha: candidateSha,
  shaProvenance: 'Served QA manifests verified by the functional harness and executor; source code SHA from compact functional provenance. Raw boot reports do not embed a SHA per opening. Evidence commit may differ.',
  reproduction: 'MAP_BOOT_SUMMARY_INPUT=<raw directory> MAP_BOOT_SUMMARY_OUTPUT=<summary path> node scripts/constrained-devices/summarize.cjs. Reads boot-input-policy.json by default; optional MAP_BOOT_SUMMARY_POLICY, MAP_BOOT_CPU4_REPLACEMENT, MAP_BOOT_PROVENANCE, MAP_BOOT_BASE_SHA, MAP_BOOT_CANDIDATE_SHA.',
  originalRawOpenings, exclusions,
  completedCleanMatrix: exclusions.every(exclusion => exclusion.status === 'replaced-clean'),
  totalOpenings: scenarios.reduce((sum, s) => sum + s.openingCount, 0),
  totalFailures: scenarios.reduce((sum, s) => sum + s.rows.filter(r => r.failure || r.errors.length).length, 0),
  fixedQuality: 'HIGH', fixtureDataMs: null,
  interpretation: { statistics: 'Per scenario/label/cache median/min/max only; counts are explicit per group. Target n=10 desktop, n=3 CPU/mobile, n=2 network. Pending excluded rounds reduce n until a complete clean replacement exists. No population p95 or attribution of physical-device performance.',
    data: 'Official read-only rendering fixture, no authentication, remote session, essential data network, retries, RLS or public/commission token request. dataMs/routeDataWaitMs null are unmeasured, not zero.',
    timing: 'Boot spans overlap; do not add CPU, upload, shader readiness/reflection or secondary hydration as if serial. Texture-upload marker includes work/scheduling, not isolated pure GPU upload.',
    moduleWorker: 'moduleMs includes download/import/evaluation boundary; worker span includes request/worker startup/CPU/transfer and is not split into pure execution phases. RendererModuleMs may be null on rendering fixture importing Canvas statically.',
    cache: 'Cold: fresh browser context plus Network.clearBrowserCache; warm: same-context reload retains browser/HTTP/CacheStorage; shader driver/OS cache uncontrolled. Server assets use public,max-age=3600, other paths no-cache. Warm transfer totals around 3370 bytes confirm asset response reuse in the healthy groups; body totals include cached resources. Browser routing was not used because it disables cache.',
    network: 'Static loopback server has no compression; network scenario emulates 150 ms latency and 200000/100000 bytes per second download/upload. Transport is fixture asset timing, not production CDN/backend.',
    environment: 'Chrome155 / ANGLE Metal AppleM5 healthy host. CPU4 and mobile viewport/touch are emulation on same GPU/driver, not old desktop, Android or Safari. Battery/power/temperature/clocks/background applications uncontrolled.',
    memoryGpu: 'Heap is raw JS heap when available, not normalized GC or VRAM. Renderer geometries/textures/programs are counters, not bytes. Active GPU timing, disjoint timer, render target allocation/upload/residence remain unmeasured.',
    instruments: 'QA-only diagnostic route and bounded events; unknown extensions retained as unknown. No diagnostics route is published by the normal production build. Detailed event arrays cap 500, so older per-stage events may be absent while summary spans remain recorded.' },
  scenarios };
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, JSON.stringify(result, null, 2) + '\n');
const format = value => value?.n ? `${value.median} [${value.min}; ${value.max}]` : 'não medido';
const markdown = [
  '# Abertura: base e candidato nas mesmas condições locais', '',
  `Base \`${baseSha}\`; candidato de código \`${candidateSha}\`. Manifests servidos verificados; os relatórios brutos não embutem SHA em cada abertura. Commit documental posterior não muda o código medido.`, '',
  `${result.totalOpenings} aberturas válidas, ${result.totalFailures} falhas. ${result.completedCleanMatrix
    ? 'Matriz limpa concluída, após substituir a rodada CPU4 excluída.'
    : 'Resultado provisório: a rodada CPU4 excluída aguarda substituição limpa; não contar suas quatro aberturas como válidas.'}`, '',
  'Apple M5/ANGLE Metal, Chrome 155, HIGH fixo. Execução sequencial AB/BA em contextos isolados, sem dois contextos WebGL vivos. As condições aceitas excluem a rodada que coincidiu com um syntax check breve; os dados originais e a razão são preservados pela política de entrada. Alimentação/bateria, temperatura/clocks e outras aplicações não controlados. CPU4 e viewport/toque móvel são emulação na mesma GPU/driver.', '',
  'Valores em ms: **mediana [mínimo; máximo]**, por versão/cache/condição. n explícito; não há p95 populacional. Prontidão usa a barreira real de três apresentações novas, estrutura preparada e controles. Hidratação mede a duração posterior até o trabalho secundário terminar; spans se sobrepõem e não são somados como decomposição serial.', '',
  '| Condição/cache | n base/candidato | Prontidão base | Candidato | Montagem essencial base | Candidato | Hidratação base | Candidato |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
];
for (const scenario of scenarios) for (const cache of ['cold', 'warm']) {
  const before = scenario.groups.find(g => g.label === 'baseline' && g.cache === cache);
  const after = scenario.groups.find(g => g.label === 'candidate' && g.cache === cache);
  markdown.push(`| ${scenario.scenario} / ${cache} | ${before.openings}/${after.openings} | ` + [
    before.stagesMs.interactiveMs, after.stagesMs.interactiveMs, before.stagesMs.sceneMs, after.stagesMs.sceneMs,
    before.stagesMs.hydrationMs, after.stagesMs.hydrationMs,
  ].map(format).join(' | ') + ' |');
}
markdown.push('',
  'A montagem/prontidão mostram redução nas condições observadas; isso não certifica aparelhos afetados ou ganho universal. Hidratação secundária não melhora uniformemente e suas diferenças/caudas permanecem na tabela. Cada abertura aceita teve barreira válida e gesto nativo que moveu a câmera; isso não comprova fluidez sustentada nem latência física.', '',
  '`cold`: contexto novo + cache HTTP explicitamente limpo pelo CDP. `warm`: reload no mesmo contexto preservando HTTP/CacheStorage. Cache de shaders/OS não controlado. Assets do servidor usam public,max-age=3600 e sem compressão; transferências aquecidas próximas de 3.370 bytes comprovam reutilização das respostas nesse cenário. Body inclui recursos cacheados e não equivale a bytes transferidos. decodedBodySize não foi capturado e permanece desconhecido. Resource Timing do documento não inventaria todos os fetches dos workers.', '',
  'Rede emulada: 150 ms, download 200.000 B/s e upload 100.000 B/s. São assets do servidor loopback, não CDN ou dados remotos. Inventário oficial 2026/persistedStage não é o projeto autorizado atual; sessão/retries/paginação/RLS/tokens público/comissão não foram medidos. dataMs e routeDataWaitMs null representam medição ausente, não tempo zero.', '',
  'O próximo RAF após input é oportunidade do event-loop, não input-to-photon físico. Tempo do gesto inclui a conclusão do harness. Submissão de programas mede JS; link/reflexão elapsed inclui scheduling/polling e overlap. program-submission existe somente no candidato; ausência na base é desconhecida. Eventos têm limite 500 e podem perder etapas antigas. Upload marker não mede GPU puro. Heap bruto não tem GC normalizado; contadores de texturas/geometrias/programas não são VRAM. GPU timer/targets/residência e temperatura em 15–30 min permanecem não medidos.', '',
  '[boot-summary.json](boot-summary.json) conserva cada abertura e seus marcos/readiness/saúde/contexto/qualidade/DPR/buffer/identidade, heap/counters, preparação QA e bytes. [boot-input-policy.json](boot-input-policy.json) preserva a exclusão/substituição da CPU4. Originais completos (~14MB) continuam em `/tmp/fenasoja-map-benchmarks` e o repeat em `/tmp/fenasoja-map-benchmarks-cpu4-repeat`; não são duplicados na PR.', '',
  'Reproduzir: `MAP_BOOT_SUMMARY_INPUT=/tmp/fenasoja-map-benchmarks node scripts/constrained-devices/summarize.cjs`. O script aplica a política de exclusões por padrão; aceita output/provenance/SHA/policy/replacement nas variáveis descritas no código. Navegação e validação funcional são medidas separadamente.');
fs.writeFileSync(path.join(path.dirname(output), 'boot-results.md'), markdown.join('\n') + '\n');

function summarizeNavigation(directories) {
  const datasets = [], pending = [];
  const distribution = values => {
    const sorted = values.filter(value => finite(value) && value > 0).sort((a, b) => a - b);
    const percentile = ratio => sorted.length ? Math.round(sorted[Math.ceil(sorted.length * ratio) - 1] * 1000) / 1000 : null;
    return { samples: sorted.length, p50Ms: percentile(.5), p95Ms: percentile(.95), p99Ms: percentile(.99),
      maximumMs: sorted.length ? sorted.at(-1) : null, stallsOver50Ms: sorted.filter(value => value > 50).length,
      stallsOver100Ms: sorted.filter(value => value > 100).length, stallsOver250Ms: sorted.filter(value => value > 250).length };
  };
  for (const directory of directories) {
    const sourcePath = path.join(directory, 'compare-HIGH-dpr1-summary.json');
    if (!fs.existsSync(sourcePath)) { pending.push({ directory, reason: 'No completed comparison report' }); continue; }
    const report = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));
    if (report.trials.length !== 6 || report.trials.some(trial => !trial.completedAt) || report.runs.length !== 20) {
      pending.push({ directory, reason: 'Comparison still incomplete; no partial timings accepted', runsObserved: report.runs.length,
        completedTrials: report.trials.filter(trial => trial.completedAt).length }); continue;
    }
    const runs = [];
    for (const run of report.runs) {
      const rawPath = path.join(directory, `${run.name}-raw.json`);
      const raw = JSON.parse(fs.readFileSync(rawPath, 'utf8'));
      const windows = [];
      let start = raw.before.cameraNavigating ? raw.before.at : null;
      for (const event of raw.events.filter(event => event.type === 'camera-navigation')) {
        if (event.value && start === null) start = event.at;
        else if (!event.value && start !== null) { windows.push({ start, end: event.at }); start = null; }
      }
      if (start !== null) windows.push({ start, end: raw.after.at });
      // The existing runtime omits the first delta following actual idle. Keep
      // every subsequent interval in the actual active/damping windows: no cap.
      const frames = windows.flatMap(window => raw.frames.filter(frame => frame.at >= window.start && frame.at <= window.end));
      const frameStats = distribution(frames.map(frame => Number(frame.duration)));
      const longTasks = (raw.longTasks || []).filter(task => windows.some(window => task.at <= window.end && task.at + task.duration >= window.start));
      const environment = report.environments[run.trial];
      const executedSha = environment?.executedBuildManifest?.sha || 'unknown';
      const expectedSha = run.label === 'baseline' ? baseSha : candidateSha;
      const verification = { shaMatches: expectedSha !== 'unknown' && executedSha === expectedSha,
        frameCountMatchesExistingHarness: frameStats.samples === run.frames.samples,
        p50MatchesExistingHarness: frameStats.p50Ms === run.frames.medianMs,
        p95MatchesExistingHarness: frameStats.p95Ms === run.frames.p95Ms,
        stallsMatchExistingHarness: frameStats.stallsOver50Ms === run.frames.stallsOver50Ms };
      runs.push({ name: run.name, label: run.label, view: run.view, scenario: run.scenario, repeat: run.repeat,
        trial: run.trial, sourceSha: executedSha, rawReportLocalPath: rawPath, activeWindows: windows,
        activeWindowDurationMs: round(windows.reduce((sum, window) => sum + window.end - window.start, 0)),
        frames: frameStats, originalRecordedFrameCount: raw.frames.length, verification,
        longTasks: { count: longTasks.length, fullTaskDurationMs: round(longTasks.reduce((sum, task) => sum + task.duration, 0)),
          maximumDurationMs: longTasks.length ? Math.max(...longTasks.map(task => task.duration)) : null,
          recordedRunCount: raw.longTasks?.length || 0, note: 'Recorded runtime tasks intersecting active windows; do not add duplicate boot-observer entries. Durations are full tasks, not clipped CPU/GPU attribution.' },
        invalidFocus: run.invalidFocus, dprValues: run.dprValues, physicalSizes: run.physicalSizes,
        effectiveResizes: run.effectiveResizes, setSizeCalls: run.setSizeCalls, setPixelRatioCalls: run.setPixelRatioCalls,
        resourcesBefore: run.resourcesBefore, resourcesAfter: run.resourcesAfter, healthBefore: raw.before.health, health: run.health,
        qualityBefore: raw.before.quality, qualityAfter: raw.after.quality,
        identityBefore: run.identityBefore, identityAfter: run.identityAfter,
        cameraBefore: run.cameraBefore, cameraAfter: run.cameraAfter, targetBefore: run.targetBefore, targetAfter: run.targetAfter,
        selectionBefore: run.selectionBefore, selectionAfter: run.selectionAfter, invariants: run.invariants,
        pathValues: run.pathValues, effectBudget: run.effectBudget, qualityChanges: run.qualityChanges,
        targets: run.targets.map(target => ({ owner: target.name, width: target.width, height: target.height,
          samples: target.samples, format: 'unknown', type: 'unknown', residentGpuBytes: null })),
        gpuTiming: { requested: report.renderTimingRequested, supportedExtension: environment?.gpuTimerExtension || 'unknown',
          measuredElapsed: run.renderTiming || null },
        errors: (report.errors[run.trial] || []).map(redact) });
    }
    const ranges = [];
    for (const label of ['baseline', 'candidate']) for (const view of ['overview', 'close']) for (const scenario of ['continuous', 'short', 'zoom-pan']) {
      const selected = runs.filter(run => run.label === label && run.view === view && run.scenario === scenario);
      const range = key => { const values = selected.map(run => run.frames[key]).filter(finite); return {
        minimumAcrossRuns: values.length ? Math.min(...values) : null, maximumAcrossRuns: values.length ? Math.max(...values) : null }; };
      ranges.push({ label, view, scenario, runs: selected.length,
        p50RangeMs: range('p50Ms'), p95RangeMs: range('p95Ms'), p99RangeMs: range('p99Ms'),
        worstFrameMs: selected.length ? Math.max(...selected.map(run => run.frames.maximumMs || 0)) : null,
        totalStallsOver50Ms: selected.reduce((sum, run) => sum + run.frames.stallsOver50Ms, 0),
        note: 'Range of the individual-run percentiles, not a merged/population percentile or median of percentiles.' });
    }
    const environments = Object.fromEntries(Object.entries(report.environments).map(([trial, environment]) => [trial, {
      sourceSha: environment.executedBuildManifest?.sha || 'unknown', userAgent: environment.userAgent,
      gpuRenderer: environment.renderer?.gpuRenderer || 'unknown', gpuVendor: environment.renderer?.gpuVendor || 'unknown',
      viewport: environment.viewport, devicePixelRatio: environment.devicePixelRatio, visualViewportScale: environment.visualViewportScale,
      hardwareConcurrency: environment.hardwareConcurrency ?? 'unknown', memoryHintGiB: environment.memoryHintGiB ?? 'unknown',
      contextAttributes: environment.attributes, gpuTimerExtension: environment.gpuTimerExtension || 'unknown',
      gpuTimerRequested: report.renderTimingRequested, multiDrawExtension: environment.multiDrawExtension || 'unknown',
      labelTiming: environment.labelTiming, drawTiming: environment.drawTiming,
    }]));
    datasets.push({ sourceDirectory: directory, browser: report.browser, simulatedCpuRate: report.simulatedCpuRate, environments,
      requestedViewport: report.requestedViewport, fixedQuality: report.policy, cache: report.cache,
      concurrency: report.concurrency, budget: report.budget, trajectories: report.trajectories,
      trialOrder: report.trialOrder, runCount: runs.length, ranges, runs,
      allVerified: runs.every(run => Object.values(run.verification).every(Boolean)),
      allInvariants: runs.every(run => Object.values(run.invariants).every(Boolean)),
      allForeground: runs.every(run => !run.invalidFocus),
      allNoResize: runs.every(run => !run.effectiveResizes && !run.setSizeCalls && !run.setPixelRatioCalls),
      zeroErrors: runs.every(run => !run.errors.length) });
  }
  const nav = { baseSha, candidateSourceSha: candidateSha, completeDatasets: datasets.length, pending,
    method: 'Nearest-rank p50/p95/p99 recomputed from raw frame intervals in the existing actual camera active+damping windows. Stalls retained. No timers/GPU queries/browser actions added by this reducer.',
    limitations: ['Healthy Apple M5/ANGLE Metal; CPU4 is simulation on this same GPU, not old GPU or a phone.',
      'Continuous rotation has three runs per pose/label; short and zoom/pan one each. Individual-window percentiles are not population statistics.',
      'No GPU elapsed timing in clean comparisons; available extension does not imply measurement. Dedicated QA GPU probe is separate.',
      'Native temporal pointer/QA wheel trajectories are reproducible harness inputs, not touch/thermal/OS interruption evidence.',
      'Render-target dimensions/owners preserved, format/allocation/resident VRAM unknown. Resource counts are not bytes.',
      'No authentication/current commercial project/RLS/checkout/public-token path is validated by rendering fixture navigation.'],
    datasets };
  const navOutput = path.join(path.dirname(output), 'navigation-summary.json');
  fs.writeFileSync(navOutput, JSON.stringify(nav, null, 2) + '\n');
  const notes = ['# Navegação com qualidade equivalente', '',
    `Base \`${baseSha}\`; candidato de código \`${candidateSha}\`. SHA de cada trial confirmado pelo manifest servido e incluído nas verificações.`, '',
    `${datasets.reduce((sum, dataset) => sum + dataset.runCount, 0)} percursos aceitos. ${pending.length ? 'Uma comparação adicional ainda está incompleta e foi omitida dos resultados.' : 'Comparações solicitadas concluídas.'}`, '',
    'HIGH fixo, buffer 1280 × 720, DPR 1. Cena completa, bloom/SMAA/sharpen e sombras canônicos, sem ablação. Uma cena residente por vez. A rotação contínua tem três repetições por pose/versão; gestos curtos e zoom/pan, uma. Intervalos ativos reais incluem damping; todos os stalls são conservados. O resumo usa nearest-rank p50/p95/p99 por run. A tabela mostra faixas entre runs, nunca p95 populacional ou mediana de percentis.', '',
    '| CPU simulada | Pose/cenário | Versão | runs | p50 faixa(ms) | p95 faixa(ms) | p99 faixa(ms) | máximo(ms) | stalls>50ms |',
    '|---|---|---|---:|---:|---:|---:|---:|---:|'];
  const rangeFormat = value => `${value.minimumAcrossRuns}–${value.maximumAcrossRuns}`;
  for (const dataset of datasets) for (const range of dataset.ranges) notes.push(`| ${dataset.simulatedCpuRate}× | ${range.view}/${range.scenario} | ${range.label} | ${range.runs} | ${rangeFormat(range.p50RangeMs)} | ${rangeFormat(range.p95RangeMs)} | ${rangeFormat(range.p99RangeMs)} | ${range.worstFrameMs} | ${range.totalStallsOver50Ms} |`);
  notes.push('', 'A cadência saudável pode ser igual na mediana e ainda variar nas caudas; os runs individuais preservam essa diferença. Sem timer GPU/submissão separados, não atribuir variação a GPU/CPU ou declarar ganho físico. CPU4 é emulação no Apple M5, não certifica desktop integrado antigo/Android. Energia/térmica/clocks/driver shader cache não controlados.', '',
    '[navigation-summary.json](navigation-summary.json) conserva cada run, p99 recalculado, janelas, long tasks, invariantes, qualidade/targets, câmeras, seleção, contadores e SHA. Raw frames/capturas completas ficam nos paths locais descritos e não são duplicados na PR. O resumo confirma que suas contagens/p50/p95/stalls reproduzem o harness existente.', '',
    'Reprodução: definir `MAP_NAV_SUMMARY_INPUTS=/tmp/fenasoja-map-navigation-desktop,/tmp/fenasoja-map-navigation-cpu4` ao executar `scripts/constrained-devices/summarize.cjs`. Datasets incompletos não entram no resultado. Validação visual/funcional e preparação terminal são evidências separadas.');
  fs.writeFileSync(path.join(path.dirname(output), 'navigation-results.md'), notes.join('\n') + '\n');
  return { navigationOutput: navOutput, completeDatasets: datasets.length, pendingDatasets: pending.length,
    verified: datasets.every(dataset => dataset.allVerified) };
}
const navigationInputs = (process.env.MAP_NAV_SUMMARY_INPUTS || '/tmp/fenasoja-map-navigation-desktop,/tmp/fenasoja-map-navigation-cpu4').split(',').filter(Boolean).map(value => path.resolve(value));
const navigation = navigationInputs.some(directory => fs.existsSync(directory)) ? summarizeNavigation(navigationInputs) : null;
console.log(JSON.stringify({ output, openings: result.totalOpenings, failures: result.totalFailures, completedCleanMatrix: result.completedCleanMatrix, navigation }));
