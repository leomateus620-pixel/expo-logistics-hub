import { defineConfig, type Plugin } from 'vite';
import applicationConfig from '../../vite.config';

// Validate the application's exact frontend build settings while excluding the
// unrelated MCP generator, which writes a Supabase function during config/build.
export default defineConfig(async (env) => {
  const config = typeof applicationConfig === 'function' ? await applicationConfig(env) : await applicationConfig;
  return { ...config, plugins: config.plugins?.filter((plugin) => (plugin as Plugin)?.name !== '@lovable.dev/mcp-js/supabase') };
});
