// UI-only responses from the existing isolated SQL fixture. No external backend.
import report from '../../docs/commercial-analytics/database-report.json';
const mode = new URLSearchParams(location.search).get('state');
export const supabase = {
  rpc(name: string, args: Record<string, unknown>) {
    const result = () => {
      if (mode === 'loading') return new Promise(() => {});
      if (mode === 'restricted' || mode === 'error') return Promise.resolve({ data: null, error: { code: mode === 'restricted' ? '42501' : '500', message: mode === 'restricted' ? 'MAP_PERMISSION_DENIED' : 'Consulta indisponível' } });
      const data = structuredClone(report.baseline);
      if (mode === 'empty') data.signature = { count: 0, averageSeconds: null, exclusions: {} };
      return Promise.resolve({ error: null, data: name === 'commercial_sales_analytics_summary' ? data
        : name === 'list_commercial_sale_orders' ? { total: args.p_status === 'PENDING' ? 8 : args.p_status === 'SIGNED' ? 12 : 23, rows: [] }
          : { total: 0, rows: [], generation: data.generation } });
    };
    return { abortSignal: result, then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => result().then(resolve, reject) };
  },
  from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [], error: null }) }) }),
};
