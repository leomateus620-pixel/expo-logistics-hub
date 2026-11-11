import path from 'node:path';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import postgres from 'postgres';

const db = postgres({
  host: '127.0.0.1', port: 55438, database: 'gastronomy_qa', user: 'postgres', max: 6,
});
const seller = '00000000-0000-4000-a000-000000000010';
const organization = '00000000-0000-4000-a000-000000000001';

// The review serves synthetic park data. Commercial reads and writes use
// the actual migration and RPCs in disposable PostgreSQL.
const postgresFixture: Plugin = {
  name: 'gastronomy-qa-postgres',
  configureServer(server) {
    server.middlewares.use('/__gastronomy', async (req, res) => {
      try {
        const result = await db.begin(async (tx) => {
          await tx`SELECT set_config('request.jwt.claim.sub',${seller},true)`;
          if (!(await tx`SELECT 1 FROM map_projects WHERE org_id=${organization}`).length) throw new Error('QA database required');
          if (req.url === '/inventory') {
            const [lots, entities, segments, pricing, eligibility, items, orders, exhibitors] = await Promise.all([
              tx`SELECT l.*, (SELECT jsonb_agg(to_jsonb(s)) FROM lot_sales s WHERE s.lot_id=l.id) lot_sales,
                (SELECT jsonb_agg(to_jsonb(p)) FROM lot_prices p WHERE p.lot_id=l.id) lot_prices
                FROM commercial_lots l WHERE l.archived_at IS NULL ORDER BY l.id`,
              tx`SELECT * FROM map_entities WHERE NOT is_archived ORDER BY id`,
              tx`SELECT * FROM map_segments WHERE is_active ORDER BY id`,
              tx`SELECT * FROM commercial_lot_pricing_2028 ORDER BY lot_id`,
              tx`SELECT * FROM commercial_sale_eligibility ORDER BY lot_id`,
              tx`SELECT * FROM lot_sale_order_items ORDER BY public_identifier`,
              tx`SELECT * FROM lot_sale_orders ORDER BY created_at`,
              tx`SELECT * FROM commercial_exhibitors ORDER BY name`,
            ]);
            return { lots, entities, segments, pricing, eligibility, items, orders, exhibitors };
          }
          const chunks: Buffer[] = [];
          for await (const chunk of req) chunks.push(chunk);
          const { name, args } = JSON.parse(Buffer.concat(chunks).toString());
          if (name === 'upsert_commercial_exhibitor') {
            const document = String(args.p_document ?? '').replace(/\D/g, '');
            const [old] = await tx`SELECT id FROM commercial_exhibitors WHERE org_id=${organization} AND document_normalized=${document}`;
            if (old) return old.id;
            const [row] = await tx`INSERT INTO commercial_exhibitors(org_id,name,document_number,document_normalized,trade_name,phone,email)
              VALUES (${organization},${args.p_name},${args.p_document},${document},${args.p_trade_name ?? null},${args.p_phone ?? null},${args.p_email ?? null})
              RETURNING id`;
            return row.id;
          }
          const supported = new Set([
            'commercial_map_revision', 'commercial_map_lot_buyers', 'register_commercial_sale_order',
            'get_commercial_sale_order_detail', 'list_commercial_sale_orders', 'confirm_sale_order_items',
            'cancel_sale_order_items', 'export_commercial_sale_orders',
          ]);
          if (!supported.has(name)) return null;
          const parameters = Object.entries(args as Record<string, unknown>);
          const values = parameters.map(([key, value]) => Array.isArray(value)
            ? key === 'p_installments' ? tx.json(value) : tx.array(value)
            : value);
          const namedArguments = parameters.map(([key], i) => {
            if (!/^_?p?[a-z_]+$/.test(key)) throw new Error('Invalid QA argument');
            return `${key} => $${i + 1}${key === 'p_lot_ids' || key === 'p_item_ids' ? '::uuid[]' : ''}`;
          }).join(',');
          if (name === 'commercial_map_lot_buyers') {
            return tx.unsafe(`SELECT * FROM public.commercial_map_lot_buyers(${namedArguments})`, values);
          }
          const rows = await tx.unsafe(`SELECT public.${name}(${namedArguments}) AS result`, values);
          return rows[0]?.result;
        });
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: result, error: null }));
      } catch (error) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ data: null, error: { message: (error as Error).message } }));
      }
    });
  },
};

export default defineConfig({
  plugins: [react(), postgresFixture],
  optimizeDeps: { entries: ['scripts/gastronomy/review.html'] },
  resolve: { alias: [
    { find: '@/integrations/supabase/client', replacement: path.resolve('scripts/gastronomy/review-client.ts') },
    { find: '@', replacement: path.resolve('src') },
  ] },
  server: {
    host: '127.0.0.1', port: 5196, strictPort: true,
    headers: { 'Content-Security-Policy': "connect-src 'self' ws://127.0.0.1:5196; form-action 'none'" },
  },
});
