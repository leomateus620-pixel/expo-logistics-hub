/** Build the reviewed canonical registry into the deployable Edge function tree. */
import { createHash } from 'node:crypto';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptFile = fileURLToPath(import.meta.url);
const repositoryRoot = path.resolve(path.dirname(scriptFile), '../..');
export const generatedFile = path.join(repositoryRoot, 'supabase/functions/_shared/workers/generated/read-tools.js');
const sourceFile = 'workers-edge-entry.ts';
const entry = 'export { executeWorkerTool, listWorkerTools, resolveWorkerAccess } from "./src/lib/workers/index.ts";';
const exportsExpected = ['executeWorkerTool', 'listWorkerTools', 'resolveWorkerAccess'];
const sha256 = value => createHash('sha256').update(value).digest('hex');

// Vite already declares esbuild. Resolve through Vite instead of adding a package.
const require = createRequire(import.meta.url);
const viteRequire = createRequire(require.resolve('vite/package.json'));
const esbuild = viteRequire('esbuild');
const ts = require('typescript');

async function declarations() {
  const printer = ts.createPrinter({ newLine: ts.NewLineKind.LineFeed });
  const typesText = await readFile(path.join(repositoryRoot, 'src/lib/workers/types.ts'), 'utf8');
  const types = ts.createSourceFile('types.ts', typesText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const chunks = types.statements.filter(statement => ts.isImportDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isInterfaceDeclaration(statement))
    .map(statement => printer.printNode(ts.EmitHint.Unspecified, statement, types));
  const found = [];
  for (const filename of ['access.ts', 'registry.ts']) {
    const source = ts.createSourceFile(filename, await readFile(path.join(repositoryRoot, 'src/lib/workers', filename), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
    for (const statement of source.statements) {
      if (!ts.isFunctionDeclaration(statement) || !exportsExpected.includes(statement.name?.text)) continue;
      if (!statement.type) throw new Error('Canonical Edge export must declare its return type.');
      const signature = ts.factory.updateFunctionDeclaration(statement,
        [ts.factory.createModifier(ts.SyntaxKind.ExportKeyword), ts.factory.createModifier(ts.SyntaxKind.DeclareKeyword)],
        statement.asteriskToken, statement.name, statement.typeParameters, statement.parameters, statement.type, undefined);
      chunks.push(printer.printNode(ts.EmitHint.Unspecified, signature, source));
      found.push(statement.name.text);
    }
  }
  if (JSON.stringify(found.sort()) !== JSON.stringify(exportsExpected)) throw new Error('Missing canonical Edge declaration.');
  return chunks.join('\n\n') + '\n';
}

export async function renderEdgeRegistry() {
  const options = {
    bundle: true, format: 'esm', platform: 'neutral', target: 'es2022',
    external: ['zod'], treeShaking: true, minify: false, charset: 'utf8', legalComments: 'none',
  };
  const result = await esbuild.build({
    ...options, absWorkingDir: repositoryRoot, write: false, metafile: true, logLevel: 'silent',
    stdin: { contents: entry, resolveDir: repositoryRoot, sourcefile: sourceFile, loader: 'ts' },
  });
  const [output] = Object.values(result.metafile.outputs);
  if (result.outputFiles.length !== 1 || !output || JSON.stringify([...output.exports].sort()) !== JSON.stringify(exportsExpected)) {
    throw new Error('Edge registry must export exactly the three reviewed read/auth functions.');
  }
  if (output.imports.some(item => !item.external || item.path !== 'zod')) {
    throw new Error('Edge registry has an unexpected runtime import; only external zod is allowed.');
  }
  const inputs = [];
  for (const filename of Object.keys(result.metafile.inputs).sort()) {
    if (filename === sourceFile) continue;
    if (!filename.startsWith('src/lib/workers/') || filename.includes('..')) {
      throw new Error(`Unexpected registry source: ${filename}`);
    }
    inputs.push({ path: filename, sha256: sha256(await readFile(path.join(repositoryRoot, filename))) });
  }
  if (!inputs.some(input => input.path === 'src/lib/workers/index.ts')) throw new Error('Canonical registry entry is missing.');
  const sourceHash = sha256(JSON.stringify({
    generator: 'scripts/workers/build-edge-registry.mjs',
    generatorSha256: sha256(await readFile(scriptFile)), esbuildVersion: esbuild.version, typescriptVersion: ts.version,
    entry, options, inputs,
  }));
  const content = [
    '// @ts-self-types="./read-tools.d.ts"',
    '// AUTO-GENERATED. Do not edit; canonical source: src/lib/workers/index.ts.',
    '// Regenerate: node scripts/workers/build-edge-registry.mjs',
    '// Verify without writing: node scripts/workers/build-edge-registry.mjs --check',
    `// Source inputs + generator SHA256: ${sourceHash}`,
    `// esbuild: ${esbuild.version}; ESM JavaScript; external runtime dependency: zod.`,
    ...inputs.map(input => `// Input ${input.path} SHA256 ${input.sha256}`),
    '', result.outputFiles[0].text,
  ].join('\n');
  const declarationContent = `// AUTO-GENERATED from canonical TypeScript declarations. Do not edit.\n// Source inputs + generator SHA256: ${sourceHash}\n${await declarations()}`;
  return { content, declarationContent, sourceHash, inputs };
}

export async function synchronizeEdgeRegistry({ check = false, outputFile = generatedFile } = {}) {
  const artifact = await renderEdgeRegistry();
  const outputs = [{ file: outputFile, content: artifact.content }, { file: outputFile.replace(/\.js$/, '.d.ts'), content: artifact.declarationContent }];
  let changed = false;
  for (const output of outputs) {
    try { output.current = await readFile(output.file, 'utf8'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    if (output.current !== output.content) changed = true;
  }
  if (check) {
    if (changed) {
      throw new Error('Generated Edge registry is missing or stale. Run: node scripts/workers/build-edge-registry.mjs');
    }
    return { ...artifact, changed: false };
  }
  if (changed) {
    await mkdir(path.dirname(outputFile), { recursive: true });
    for (const output of outputs) if (output.current !== output.content) await writeFile(output.file, output.content, 'utf8');
  }
  return { ...artifact, changed };
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptFile) {
  try {
    if (process.argv.slice(2).some(argument => argument !== '--check') || process.argv.slice(2).length > 1) {
      throw new Error('Usage: node scripts/workers/build-edge-registry.mjs [--check]');
    }
    const checked = process.argv.includes('--check');
    const result = await synchronizeEdgeRegistry({ check: checked });
    console.log(`Edge registry ${checked ? 'is synchronized' : result.changed ? 'generated' : 'unchanged'}; SHA256 ${result.sourceHash}`);
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
