import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import type { IncomingMessage } from 'node:http';
import { tmpdir } from 'node:os';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import postgres from 'postgres';

const db = postgres({
  host: '127.0.0.1', port: 55438, database: 'gastronomy_qa', user: 'postgres', max: 6,
});
const seller = '00000000-0000-4000-a000-000000000010';
const limitedSeller = '00000000-0000-4000-a000-000000000014';
const organization = '00000000-0000-4000-a000-000000000001';
const documentDirectory = path.join(tmpdir(), `gastronomy-qa-contracts-${process.pid}`);
const documentFile = (name: string) => path.join(documentDirectory, createHash('sha256').update(name).digest('hex'));
const temporaryLinks = new Map<string, { name: string; expires: number; download?: string }>();

async function requestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 15 * 1024 * 1024) throw new Error('INVALID_CONTRACT_FILE');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function reviewUser(req: IncomingMessage) {
  return req.headers['x-gastronomy-qa-user'] === 'sem-contratos' ? limitedSeller : seller;
}

// The review serves synthetic park data. Commercial reads and writes use
// the actual migration and RPCs in disposable PostgreSQL.
const postgresFixture: Plugin = {
  name: 'gastronomy-qa-postgres',
  configureServer(server) {
    server.middlewares.use('/__gastronomy', async (req, res) => {
      try {
        const identity = reviewUser(req);
        if (req.url?.startsWith('/document/') && req.method === 'GET') {
          const token = req.url.slice('/document/'.length);
          const link = temporaryLinks.get(token);
          const content = link && link.expires > Date.now() ? await readFile(documentFile(link.name)).catch(() => null) : null;
          if (!link || !content) { res.statusCode = 404; res.end(); return; }
          res.setHeader('content-type', link.name.endsWith('.pdf') ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
          res.setHeader('cache-control', 'private, no-store');
          if (link.download) res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(link.download)}`);
          res.end(content);
          return;
        }
        const result = await db.begin(async (tx) => {
          await tx`SELECT set_config('request.jwt.claim.sub',${identity},true)`;
          if (!(await tx`SELECT 1 FROM map_projects WHERE org_id=${organization}`).length) throw new Error('QA database required');
          if (req.url === '/inventory') {
            const [permission] = await tx`SELECT map_has_explicit_capability(${organization},'map.manage_contracts') AS allowed`;
            const [lots, entities, segments, pricing, eligibility, items, orders, exhibitors, installments, activity, contracts] = await Promise.all([
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
              tx`SELECT * FROM lot_sale_installments ORDER BY installment_number`,
              tx`SELECT * FROM map_activity_logs WHERE lot_id IS NOT NULL
                AND (${permission.allowed} OR NOT commercial_contract_audit_action(action)) ORDER BY created_at DESC`,
              permission.allowed ? tx`SELECT c.*, (SELECT jsonb_agg(to_jsonb(v)) FROM lot_contract_versions v WHERE v.contract_id=c.id) lot_contract_versions
                FROM lot_contracts c WHERE c.scope='LOT'` : [],
            ]);
            return { lots, entities, segments, pricing, eligibility, items, orders, exhibitors, installments, activity, contracts };
          }
          if (req.url?.startsWith('/storage/') && req.method === 'POST') {
            const [capability] = await tx`SELECT map_has_explicit_capability(${organization},'map.manage_contracts') AS allowed`;
            if (!capability.allowed) throw new Error('MAP_PERMISSION_DENIED');
            await tx.unsafe('SET LOCAL ROLE authenticated');
            if (req.url === '/storage/upload') {
              const objectName = String(req.headers['x-gastronomy-qa-path']);
              const content = await requestBody(req);
              if (!objectName.startsWith(`${organization}/`) || !content.length) throw new Error('INVALID_CONTRACT_FILE');
              await tx`INSERT INTO storage.objects(bucket_id,name,owner_id) VALUES ('map-contracts',${objectName},${identity})`;
              await mkdir(documentDirectory, { recursive: true, mode: 0o700 });
              await writeFile(documentFile(objectName), content, { mode: 0o600 });
              return { path: objectName };
            }
            const { name, download } = JSON.parse((await requestBody(req)).toString());
            if (req.url === '/storage/remove') {
              const removed = await tx`DELETE FROM storage.objects WHERE bucket_id='map-contracts' AND storage.objects.name=${name} RETURNING name`;
              if (removed.length) await rm(documentFile(name), { force: true });
              return null;
            }
            if (req.url === '/storage/sign') {
              const readable = await tx`SELECT 1 FROM storage.objects WHERE bucket_id='map-contracts' AND storage.objects.name=${name}`;
              if (!readable.length) throw new Error('CONTRACT_OBJECT_NOT_FOUND');
              const now = Date.now();
              for (const [token, link] of temporaryLinks) {
                if (link.expires <= now) temporaryLinks.delete(token);
              }
              const token = randomUUID();
              temporaryLinks.set(token, { name, expires: now + 300_000, download });
              return { signedUrl: `/__gastronomy/document/${token}` };
            }
          }
          const { name, args } = JSON.parse((await requestBody(req)).toString());
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
            'cancel_sale_order_items', 'export_commercial_sale_orders', 'get_sale_order_revisions',
            'attach_order_contract', 'register_lot_contract_version', 'replace_lot_order_contract',
            'get_lot_contract_history', 'update_commercial_contract_metadata', 'revise_sale_order_items',
          ]);
          if (!supported.has(name)) return null;
          await tx.unsafe('SET LOCAL ROLE authenticated');
          const parameters = Object.entries(args as Record<string, unknown>);
          const values = parameters.map(([key, value]) => Array.isArray(value)
            ? key === 'p_installments' ? tx.json(value) : tx.array(value)
            : value);
          const namedArguments = parameters.map(([key], i) => {
            if (!/^_?p?[a-z_]+$/.test(key)) throw new Error('Invalid QA argument');
            return `${key} => $${i + 1}${['p_lot_ids','p_item_ids','p_add_lot_ids','p_remove_item_ids'].includes(key) ? '::uuid[]' : ''}`;
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
        const failure = error as Error & { code?: string };
        res.end(JSON.stringify({ data: null, error: { message: failure.message, code: failure.code } }));
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
