import { z } from 'zod';
import { isPrimaryWebUrl, isSafeAppUrl, WORKER_IDS } from './contracts.ts';

// This is a data format, not a component/chart configuration language.
const text = z.string().trim().min(1).max(1200).refine(value => !/[<>`]/.test(value), 'Plain text required');
const label = text.refine(value => value.length <= 180, 'Label too long');
const finite = z.number().finite();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const source = z.object({ label, url: z.string().max(1200), source: z.enum(['app', 'web']), date: date.optional() }).strict()
  .refine(value => value.source === 'app' ? isSafeAppUrl(value.url) : isPrimaryWebUrl(value.url) && Boolean(value.date), 'Invalid source');
const table = z.object({ type: z.literal('table'), title: label.optional(), columns: z.array(label).min(1).max(8), rows: z.array(z.array(z.string().max(400).refine(value => !/[<>`]/.test(value)))).max(30) }).strict();
const indicators = z.object({ type: z.literal('indicators'), items: z.array(z.object({ label, value: finite, unit: z.enum(['count', 'BRL', 'percent', 'minutes']), description: text.optional() }).strict()).min(1).max(8) }).strict();
const barChart = z.object({ type: z.literal('bar_chart'), title: label, unit: z.enum(['count', 'BRL', 'percent', 'minutes']), data: z.array(z.object({ label, value: finite }).strict()).min(1).max(20), population: z.number().int().nonnegative(), complete: z.literal(true) }).strict();
const pieChart = barChart.extend({ type: z.literal('pie_chart') });
const comparison = z.object({ type: z.literal('comparison'), title: label, currentLabel: label.optional(), previousLabel: label.optional(), unit: z.enum(['count', 'BRL', 'percent', 'minutes']), items: z.array(z.object({ label, current: finite, previous: finite }).strict()).min(1).max(8) }).strict();
const entityRanking = z.object({ type: z.literal('entity_ranking'), title: label,
  entityKind: z.enum(['person', 'commission']), population: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  items: z.array(z.object({ id: z.string().uuid(), name: label, label: label.optional(),
    visualKey: z.string().regex(/^[a-z][a-z0-9-]{0,100}$/).optional(),
    events: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), position: z.number().int().positive() }).strict()).min(1).max(30),
}).strict();
export const workerQueryFiltersSchema = z.object({
  group_by: z.enum(['status','block','location','category','weekday','day']).optional(),
  relationship: z.enum(['all','linked','created','responsible']).optional(), status: z.string().max(60).optional(),
  search: z.string().max(120).optional(), location: z.string().max(120).optional(), category: z.string().max(120).optional(),
  priority: z.string().max(30).optional(), weekday: z.number().int().min(0).max(6).optional(), commission_id: z.string().uuid().optional(),
  block: z.string().max(120).optional(), min_area: z.number().finite().nonnegative().optional(), max_area: z.number().finite().nonnegative().optional(),
  covered: z.boolean().optional(), electricity: z.boolean().optional(), water: z.boolean().optional(), internet: z.boolean().optional(),
  missing_number:z.boolean().optional(),missing_area:z.boolean().optional(),missing_time:z.boolean().optional(),missing_location:z.boolean().optional(),missing_category:z.boolean().optional(),cross_midnight:z.boolean().optional(),cross_period:z.boolean().optional(),start_in_period:z.boolean().optional(),
}).strict();
export type WorkerQueryFilters = z.infer<typeof workerQueryFiltersSchema>;
const profile = z.object({ type: z.literal('profile'), name: label, role: label, edition: label, verifiedOn: date, publishedOn: date.optional(), photoUrl: z.string().refine(isPrimaryWebUrl).optional(), details: z.array(z.object({ label, value: text }).strict()).max(6) }).strict();
export const workerResponseBlockSchema = z.union([
  z.object({ type: z.literal('summary'), text }).strict(), indicators, barChart, pieChart, table, comparison, profile, entityRanking,
  z.object({ type: z.literal('sources'), items: z.array(source).min(1).max(8) }).strict(),
  z.object({ type: z.literal('empty'), message: text }).strict(),
  z.object({ type: z.literal('clarification'), question: text, options: z.array(label).max(8).optional(),
    choices: z.array(z.object({ id: z.string().uuid(), name: label }).strict()).min(1).max(8).optional() }).strict(),
]);
export const workerResponseSchema = z.object({
  version: z.literal(1), worker: z.enum(WORKER_IDS), intent: label, summary: text,
  metadata: z.object({ organizationId: z.string().uuid(), edition: label.optional(), projectId: z.string().uuid().optional(),
    period: z.object({ from: date, to: date, label }).strict().optional(), timezone: z.literal('America/Sao_Paulo'),
    scope: label, updatedAt: z.string().datetime({ offset: true }), completeness: z.enum(['complete', 'partial', 'unavailable']),
    filters: z.object({ relationship: z.enum(['linked', 'created', 'responsible', 'attendance']).optional(), commissionId: z.string().uuid().optional(), personId: z.string().uuid().optional(), query: workerQueryFiltersSchema.optional() }).strict().optional(),
    notes: z.array(text).max(8),
  }).strict(), blocks: z.array(workerResponseBlockSchema).max(12),
}).strict().superRefine((response, ctx) => {
  for (const [index, block] of response.blocks.entries()) {
    if (block.type === 'clarification' && block.choices && (new Set(block.choices.map(choice => choice.id)).size !== block.choices.length
      || block.options && block.options.length !== block.choices.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index], message: 'Invalid identity choices' });
    if (block.type === 'entity_ranking') {
      if (block.population < block.items.length || new Set(block.items.map(item => item.id)).size !== block.items.length
        || block.items.some((item, position) => item.position !== position + 1 || (position > 0 && item.events > block.items[position - 1].events))
        || (block.entityKind === 'person' && block.items.some(item => item.visualKey !== undefined))) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index], message: 'Invalid identity ranking' });
      }
    }
    if (block.type === 'table' && block.rows.some(row => row.length !== block.columns.length)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index], message: 'Invalid row width' });
    if (block.type === 'bar_chart' || block.type === 'pie_chart') {
      if (response.metadata.completeness !== 'complete' || block.population < block.data.length || block.data.some(item => item.value < 0)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index], message: 'Incomplete chart evidence' });
      if (new Set(block.data.map(item => item.label)).size !== block.data.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index], message: 'Ambiguous chart labels' });
      if (block.type === 'pie_chart' && block.population !== block.data.length) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['blocks', index], message: 'Incomplete pie partition' });
    }
  }
});
export type WorkerResponse = z.infer<typeof workerResponseSchema>;
export type WorkerResponseBlock = z.infer<typeof workerResponseBlockSchema>;
export function encodeWorkerResponse(value: WorkerResponse): string {
  return '```fenasoja-response\n' + JSON.stringify(workerResponseSchema.parse(value)) + '\n```';
}
export function decodeWorkerResponse(content: string): WorkerResponse | null {
  const match = /^```fenasoja-response\n([\s\S]*?)\n```$/.exec(content.trim());
  if (!match) return null;
  try { const parsed = workerResponseSchema.safeParse(JSON.parse(match[1])); return parsed.success ? parsed.data : null; } catch { return null; }
}
