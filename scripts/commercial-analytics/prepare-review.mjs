// Generate a before-view from the inspected baseline, without maintaining another Dashboard.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const source=execFileSync('git',['show','08734eb8ce0f087ddc220af1c919c4c141a15b6c:src/features/commercial-map/dashboard/CommercialDashboard.tsx'],{encoding:'utf8'});
const target=source.replace(/from '\.\/(.*?)'/g,"from '@/features/commercial-map/dashboard/$1'").replace(/from '\.\.\/(.*?)'/g,"from '@/features/commercial-map/$1'").replace(/import '\.\/(.*?)'/g,"import '@/features/commercial-map/dashboard/$1'");
await fs.writeFile(new URL('./.baseline.tsx',import.meta.url),target);
console.log('Baseline Dashboard generated from 08734eb8.');
