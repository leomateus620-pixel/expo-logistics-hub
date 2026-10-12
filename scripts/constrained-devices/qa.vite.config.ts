import { defineConfig, type ConfigEnv, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import applicationConfig from '../../vite.config';

// Production compilation of the existing application/fixtures. This config is
// never used by npm run build and never includes the MCP/tagger build plugins.
const root = realpathSync(process.env.MAP_QA_ROOT || process.cwd());
export default defineConfig(async (env: ConfigEnv) => {
  const application = await applicationConfig(env) as UserConfig;
  const sha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  return {
    ...application,
    root,
    envDir: path.join(root, 'scripts/constrained-devices/no-env-files'),
    plugins: [{
      name: 'constrained-device-fixture-analytics',
      enforce: 'pre',
      transform(source, id) {
        if (!id.replaceAll('\\', '/').endsWith('/features/commercial-map/CommercialMapPage.tsx')) return null;
        const original = 'permissions.canViewMapAnalytics && !isPreview';
        if (!source.includes(original)) throw new Error('QA analytics transform no longer matches the workspace');
        // Same synthetic, read-only data on both builds. This makes the actual
        // dashboard cover reachable; it does not validate account capabilities.
        return source.replace(original, '(isPreview || permissions.canViewMapAnalytics)');
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: 'qa-build-manifest.json', source: JSON.stringify({
          sha, mode: 'production', diagnostics: true, fixtureBackend: 'qa.invalid',
          analytics: 'preview fixture only',
        }, null, 2) });
      },
    }, react()],
    define: {
      ...application.define,
      'import.meta.env.VITE_GIT_COMMIT': JSON.stringify(sha),
      'import.meta.env.VITE_COMMERCIAL_MAP_DIAGNOSTICS': JSON.stringify('true'),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://qa.invalid'),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('qa-fixture-no-backend'),
    },
    resolve: { alias: { '@': path.join(root, 'src') } },
    build: { ...application.build, outDir: process.env.MAP_QA_OUT || 'dist-qa/constrained-devices', manifest: true },
  };
});
