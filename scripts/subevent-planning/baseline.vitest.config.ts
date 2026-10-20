// Reproduce the baseline with the two edited components loaded from the original
// commit. No working files are replaced, including unrelated user changes.
import { mergeConfig } from 'vitest/config';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import config from '../../vitest.config';
const paths = [
  'src/components/cronograma-eventos/workspace/EventRelationshipWorkspace.tsx',
  'src/components/cronograma-eventos/workspace/SubeventPlanBuilder.tsx',
];
const baseline = new Map(
  paths.map((file) => [
    path.resolve(file),
    execFileSync('git', ['show', `3cd79ab9:${file}`], { encoding: 'utf8' }),
  ]),
);
export default mergeConfig(config, {
  plugins: [
    {
      name: 'subevent-original-components',
      enforce: 'pre',
      load(id) {
        return baseline.get(id.split('?')[0]);
      },
    },
  ],
  test: { exclude: ['src/test/cronogramaPlanEditor.test.tsx'] },
});
