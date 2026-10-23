// Capture only presentation sources from the two review refs; generated copies
// are ignored, and never enter App or a production build.
import fs from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const files = ['CommercialDashboard.tsx', 'CommercialSalesAnalyticsCards.tsx', 'CommercialDashboardSalesSummary.tsx', 'commercial-dashboard-overview.css'];
for (const [name, ref] of [['before', '151d829d5610acbc355a581d6cca79e7e9401d87'], ['historical', '08734eb8ce0f087ddc220af1c919c4c141a15b6c']]) {
  const directory = new URL(`./compact-baselines.local/${name}/`, import.meta.url);
  await fs.mkdir(directory, { recursive: true });
  for (const file of files) {
    let source;
    try { source = execFileSync('git', ['show', `${ref}:src/features/commercial-map/dashboard/${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (error) { if (file === 'CommercialSalesAnalyticsCards.tsx' && name === 'historical') continue; throw error; }
    if (file.endsWith('.tsx')) {
      source = source.replace(/import '\.\/commercial-dashboard-overview.css';/, '')
        .replace(/(from |import )(['"])\.\.\/(.*?)\2/g, '$1$2@/features/commercial-map/$3$2')
        .replace(/(from |import )(['"])\.\/(.*?)\2/g, (match, prefix, quote, target) => files.includes(target + (target.endsWith('.css') ? '' : '.tsx')) ? match : `${prefix}${quote}@/features/commercial-map/dashboard/${target}${quote}`);
    }
    await fs.writeFile(new URL(file, directory), source);
  }
}
console.log('Before and historical presentation fixtures prepared.');

await fs.writeFile(new URL('./compact-baselines.local/region-before.css', import.meta.url), execFileSync('git', ['show', '9e8e35b4:src/features/commercial-map/dashboard/commercial-dashboard-overview.css']));
