/**
 * Workaround local do carregamento de configs: preserva os arquivos de produção.
 * Uso: node docs/validation/financial-revenue-comparison/run-verification.mjs test [filtros]
 *      node docs/validation/financial-revenue-comparison/run-verification.mjs build
 */
import { readFile, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { transform } from 'esbuild';

const rootUrl = new URL('../../../', import.meta.url);
const root = fileURLToPath(rootUrl);
const mode = process.argv[2] ?? 'test';
if (mode !== 'test' && mode !== 'build') throw new Error('Use test ou build.');
process.chdir(root);
const configName = mode === 'test' ? 'vitest.config.ts' : 'vite.config.ts';
const temporaryConfig = new URL(`.financial-verification-${mode}.config.mjs`, rootUrl);

try {
  const source = await readFile(new URL(configName, rootUrl), 'utf8');
  const { code } = await transform(source, { loader: 'ts', format: 'esm', target: 'node24' });
  await writeFile(temporaryConfig, `const __dirname = ${JSON.stringify(root)};\n${code}`);
  const definition = (await import(temporaryConfig.href)).default;
  if (mode === 'test') {
    const { startVitest } = await import('vitest/node');
    await startVitest('test', process.argv.slice(3), { run: true, config: false }, { ...definition, configFile: false });
  } else {
    const { build, mergeConfig } = await import('vite');
    const config = typeof definition === 'function'
      ? await definition({ command: 'build', mode: 'production', isSsrBuild: false, isPreview: false })
      : await definition;
    // O gerador de função Supabase também trava no esbuild local e fica fora desta verificação de frontend.
    config.plugins = config.plugins.filter((plugin) => plugin?.name !== '@lovable.dev/mcp-js/supabase');
    await build(mergeConfig(config, { configFile: false, mode: 'production' }));
  }
} finally {
  await unlink(temporaryConfig).catch(() => undefined);
}
