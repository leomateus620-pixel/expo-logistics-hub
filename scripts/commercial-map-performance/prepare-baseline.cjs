// Apply measurement-only probes to a detached worktree at 6b825283.
// Does not copy renderer, loading, lighting, persistence or chunking fixes.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(process.argv[2]);
const source = path.resolve(__dirname, '../..');
const { execFileSync } = require('node:child_process');
if (execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim() !== '6b8252839cb843b96e78ef81f0bd60ef0f4d3439') {
  throw new Error('Use a detached baseline worktree at 6b8252839cb843b96e78ef81f0bd60ef0f4d3439');
}
if (fs.readFileSync(path.join(root, 'src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx'), 'utf8').includes('LightingPerformanceProbe')) {
  throw new Error('Baseline instrumentation is already present; use a fresh worktree');
}
const flag = "(import.meta.env.DEV || import.meta.env.VITE_COMMERCIAL_MAP_DIAGNOSTICS === 'true')";
const files = [
  'src/App.tsx', 'src/features/commercial-map/CommercialMapPage.tsx',
  ...['CommercialMapCanvas', 'CommercialMapEnvironment', 'CommercialMapRuntimeFrameDiagnostics',
    'CommercialMapSceneShaderWarmup', 'CommercialMapInteriorShaderWarmup'].map(n => `src/features/commercial-map/components/canvas/${n}.tsx`),
  ...['runtimeDiagnostics', 'renderingTiming'].map(n => `src/features/commercial-map/utils/${n}.ts`),
];
for (const file of files) {
  const target = path.join(root, file);
  let content = fs.readFileSync(target, 'utf8').replaceAll('import.meta.env.DEV', flag);
  if (file.endsWith('/CommercialMapCanvas.tsx')) {
    content = "import { LightingPerformanceProbe } from '../../diagnostics/LightingPerformanceProbe';\n" + content;
    content = content.replace('<RuntimeFrameDiagnostics />', `<RuntimeFrameDiagnostics />\n{${flag} && <LightingPerformanceProbe />}`);
  }
  fs.writeFileSync(target, content);
}
for (const file of ['utils/performanceDiagnostics.ts', 'diagnostics/LightingBenchmark.tsx', 'diagnostics/LightingPerformanceProbe.tsx', 'diagnostics/CommercialMapRenderingDiagnosticsPage.tsx']) {
  const relative = `src/features/commercial-map/${file}`;
  fs.copyFileSync(path.join(source, relative), path.join(root, relative));
}
fs.copyFileSync(path.join(source, 'package-lock.json'), path.join(root, 'package-lock.json'));
console.log('Measurement-only baseline prepared at', root);
