import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import path from 'node:path';
import os from 'node:os';

// Measurement-only transforms, applied identically to the immutable baseline
// and candidate. No application routes, permissions or bundles are changed.
const root = path.resolve(process.env.DASHBOARD_QA_ROOT || process.cwd());
const scripts = path.resolve(__dirname);
export default defineConfig({
  root,
  cacheDir: path.join(os.tmpdir(), `dashboard-perf-${path.basename(root)}`),
  plugins: [{
    name: 'dashboard-measurement', enforce: 'pre',
    transform(source, id) {
      const file = id.replaceAll('\\', '/');
      let code = source;
      if (file.endsWith('/CommercialMapPage.tsx')) {
        code = code.replace('permissions.canViewMapAnalytics && !isPreview', '(isPreview || permissions.canViewMapAnalytics)');
      }
      if (file.endsWith('/dashboard/CommercialDashboard.tsx')) code = code.replace("'./CommercialSalesProgress'", "'./CommercialSalesProgress.tsx'");
      for (const name of ['CommercialDashboard', 'CommercialDashboardSpaces', 'CommercialMiniMap', 'CommercialSalesOrdersSection', 'SaleOrderDetail']) {
        if (!file.endsWith(`/${name}.tsx`)) continue;
        if (code.includes(`export function ${name}(`)) code = code.replace(`export function ${name}(`, `function DashboardMeasured${name}(`);
        else if (code.includes(`export const ${name} = memo(`)) code = code.replace(`export const ${name} = memo(`, `const DashboardMeasured${name} = memo(`);
        else continue;
        code = `import { Profiler as DashboardMeasurementProfiler } from 'react';\n` + code;
        code += `\nexport function ${name}(props: Parameters<typeof DashboardMeasured${name}>[0]) { return <DashboardMeasurementProfiler id="${name}" onRender={(...sample) => (window as any).__dashPerf?.renders.push(sample)}><DashboardMeasured${name} {...props} /></DashboardMeasurementProfiler>; }`;
      }
      for (const name of ['buildDashboardExternalBoundaries', 'buildCommercialMiniMapGeometry']) {
        if (!code.includes(`export function ${name}(`)) continue;
        code = code.replace(`export function ${name}(`, `function dashboardMeasured${name}(`);
        code += `\nexport function ${name}(...args: Parameters<typeof dashboardMeasured${name}>) { const start=performance.now(); try { return dashboardMeasured${name}(...args); } finally { (window as any).__dashPerf?.geometry.push({name:'${name}',start,duration:performance.now()-start}); } }`;
      }
      return code === source ? null : code;
    },
  }, react()],
  resolve: { alias: { '@': path.join(root, 'src') } },
  server: { host: '127.0.0.1', hmr: false, fs: { allow: [root, scripts] } },
  // Prebundle the dependencies discovered by both warmed journeys. Otherwise
  // a fresh QA server can reload mid-measurement when a lazy panel first opens.
  optimizeDeps: {
    entries: [path.join(root, 'scripts/dashboard/performance-qa.tsx'), path.join(root, 'src/App.tsx')],
    include: [
      '@radix-ui/react-alert-dialog', '@radix-ui/react-checkbox', '@radix-ui/react-dialog',
      '@radix-ui/react-dropdown-menu', '@radix-ui/react-label', '@radix-ui/react-popover',
      '@radix-ui/react-scroll-area', '@radix-ui/react-slider', '@radix-ui/react-slot',
      '@radix-ui/react-switch', '@radix-ui/react-tabs', '@radix-ui/react-toast', '@radix-ui/react-tooltip',
      '@react-three/drei', '@react-three/fiber', '@react-three/rapier', '@supabase/supabase-js',
      '@tanstack/query-sync-storage-persister', '@tanstack/react-query', '@tanstack/react-query-persist-client',
      'class-variance-authority', 'clsx', 'date-fns', 'date-fns/locale', 'firebase/app', 'firebase/messaging',
      'gsap', 'lucide-react', 'next-themes', 'polygon-clipping', 'postprocessing', 'react', 'react-dom',
      'react-dom/client', 'react-router-dom', 'react/jsx-dev-runtime', 'recharts', 'sonner', 'tailwind-merge',
      'three', 'three-mesh-bvh', 'three-stdlib', 'three/examples/jsm/geometries/RoundedBoxGeometry.js',
      'three/examples/jsm/loaders/FontLoader.js', 'three/examples/jsm/objects/Sky.js',
      'three/examples/jsm/utils/BufferGeometryUtils.js', 'vaul', 'zustand', 'zustand/react/shallow',
    ],
  },
});
