// Materialize the reviewed main presentation without importing it in production.
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const ref = '9e8e35b4ef235131059f3a6fd3c1caa0a5951b5c';
const directory = 'artifacts/ecosystem-fit.local/before';
const files = execFileSync('git', ['ls-tree', '-r', '--name-only', ref, 'src/features/alvorada'], { encoding: 'utf8' }).trim().split('\n');
for (const file of files.filter(file => /\.(ts|tsx|css|json)$/.test(file))) {
  const target = path.join(directory, file);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, execFileSync('git', ['show', `${ref}:${file}`]));
}
const fixture = (await fs.readFile('scripts/alvorada-qa.tsx', 'utf8'))
  .replaceAll("'../src/components/", "'@/components/")
  .replaceAll("'../src/styles/", "'@/styles/")
  .replace("'../src/index.css'", "'@/index.css'");
await fs.mkdir(path.join(directory, 'scripts'), { recursive: true });
await fs.writeFile(path.join(directory, 'scripts/alvorada-qa.tsx'), fixture);
console.log(`Prepared ecosystem baseline ${ref}; open /scripts/ecosystem-before.html?graph.`);
