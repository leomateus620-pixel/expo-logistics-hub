import { memo } from 'react';
import { ChevronDown, ExternalLink } from 'lucide-react';
import { z } from 'zod';
import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { decodeWorkerResponse, type WorkerResponse, type WorkerResponseBlock } from '../../../../supabase/functions/_shared/workers/response-contract';
import { safeSourceUrl } from '../ui-utils';

const legacyLabel = z.string().min(1).max(180);
const legacyTableSchema = z.object({ columns: z.array(legacyLabel).min(1).max(8), rows: z.array(z.array(z.string().max(400))).max(100) }).strict().refine(value => value.rows.every(row => row.length === value.columns.length));
const legacyChartSchema = z.object({ title: legacyLabel, data: z.array(z.object({ label: legacyLabel, value: z.number().finite().nonnegative() }).strict()).min(1).max(100) }).strict();
type Table = z.infer<typeof legacyTableSchema>;
type Chart = z.infer<typeof legacyChartSchema>;
type ChartUnit = 'count' | 'BRL' | 'percent' | 'minutes';
type Comparison = { title: string; unit: ChartUnit; currentLabel?: string; previousLabel?: string; items: Array<{ label: string; current: number; previous: number }> };
export type RichSegment = { kind: 'text'; text: string } | { kind: 'table'; table: Table } | { kind: 'chart'; chart: Chart } | { kind: 'response'; response: WorkerResponse };
const blockPattern = /```fenasoja-(table|chart|response)\r?\n([\s\S]*?)\r?\n```/g;
const legacyColumns: Record<string, string> = { Kind: 'Tipo de registro', kind: 'Tipo de registro', Reference: 'Pedido', reference: 'Pedido', 'Item count': 'Espaços no pedido', item_count: 'Espaços no pedido', 'Is archived': 'Arquivado', is_archived: 'Arquivado', status: 'Situação', name: 'Nome', lot_number: 'Número do lote', block_code: 'Quadra' };
const legacyValues: Record<string, string> = { SALE_OPEN: 'Venda em andamento', CONFIRMED: 'Venda confirmada', SOLD: 'Vendido', AVAILABLE: 'Disponível', BLOCKED: 'Bloqueado', CANCELLED: 'Cancelado', CANCELED: 'Cancelado', PENDING_SIGNATURE: 'Aguardando assinatura', LEGACY_UNVERIFIED: 'Registro histórico sem confirmação', PARTIAL: 'Parcialmente confirmada', ORDER: 'Pedido de venda', LOT: 'Lote', OPEN: 'Em aberto' };
const legacyColumn = (value: string) => legacyColumns[value] ?? (/[_]/.test(value) ? 'Informação' : value);
const legacyCell = (value: string) => legacyValues[value] ?? value;

/** Only complete, validated visual blocks cross the rendering boundary. */
export function parseRichContent(content: string, streaming = false): RichSegment[] {
  const segments: RichSegment[] = []; let last = 0;
  for (const match of content.matchAll(blockPattern)) {
    const before = content.slice(last, match.index).trim();
    if (before) segments.push({ kind: 'text', text: before });
    last = (match.index ?? 0) + match[0].length;
    try {
      if (match[1] === 'response') { const response = decodeWorkerResponse(match[0].replace(/\r\n/g, '\n')); if (response) segments.push({ kind: 'response', response }); else segments.push({ kind: 'text', text: 'Não foi possível apresentar esta resposta. Faça a consulta novamente.' }); continue; }
      const value: unknown = JSON.parse(match[2]);
      if (match[1] === 'table') { const parsed = legacyTableSchema.safeParse(value); if (parsed.success) segments.push({ kind: 'table', table: { columns: parsed.data.columns.map(legacyColumn), rows: parsed.data.rows.map(row => row.map(legacyCell)) } }); }
      if (match[1] === 'chart') { const parsed = legacyChartSchema.safeParse(value); if (parsed.success) segments.push({ kind: 'chart', chart: parsed.data }); }
    } catch { /* Stored invalid blocks never become raw JSON or executable markup. */ }
  }
  // Interrupted fences remain hidden even after a response has stopped.
  const rest = content.slice(last).replace(/```[\s\S]*$/, '').trim();
  if (rest) segments.push({ kind: 'text', text: rest });
  return segments;
}

export function formatResponseValue(value: number, unit: 'count' | 'BRL' | 'percent' | 'minutes' = 'count'): string {
  if (unit === 'BRL') return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  if (unit === 'percent') return `${value.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
  if (unit === 'minutes') { const minutes = Math.round(value); return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, '0')}`; }
  return value.toLocaleString('pt-BR', { maximumFractionDigits: 2 });
}
const dateLabel = (value: string) => new Date(`${value}T12:00:00Z`).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const tableText = (table: Table) => [table.columns.join(' | '), ...table.rows.map(row => row.join(' | '))].join('\n');
function blockText(block: WorkerResponseBlock): string {
  switch (block.type) {
    case 'summary': return block.text;
    case 'indicators': return block.items.map(item => `${item.label}: ${formatResponseValue(item.value, item.unit)}${item.description ? ` — ${item.description}` : ''}`).join('\n');
    case 'table': return tableText(block);
    case 'bar_chart':
    case 'pie_chart': return `${block.title}\n${block.data.map(item => `${item.label}: ${formatResponseValue(item.value, block.unit)}`).join('\n')}`;
    case 'comparison': return `${block.title}\n${block.items.map(item => `${item.label}: ${block.currentLabel ?? 'Período atual'} ${formatResponseValue(item.current, block.unit)}; ${block.previousLabel ?? 'Período anterior'} ${formatResponseValue(item.previous, block.unit)}`).join('\n')}`;
    case 'profile': return [block.name, block.role, block.edition, ...block.details.map(item => `${item.label}: ${item.value}`)].join('\n');
    case 'sources': return block.items.map(item => `${item.label}: ${item.url}`).join('\n');
    case 'empty': return block.message;
    case 'clarification': return block.question;
  }
}
/** Copying remains useful and includes every value visible in the visual answer. */
export function richContentToText(content: string): string {
  return parseRichContent(content).map(segment => segment.kind === 'text' ? segment.text.replace(/\*\*/g, '')
    : segment.kind === 'table' ? tableText(segment.table)
      : segment.kind === 'chart' ? `${segment.chart.title}: ${segment.chart.data.map(item => `${item.label} ${item.value}`).join(', ')}`
        : [segment.response.summary, ...segment.response.blocks.map(blockText), ...segment.response.metadata.notes].join('\n\n')).join('\n\n');
}
function Text({ text }: { text: string }) {
  return <p className="worker-rich-text">{text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>)}</p>;
}
function ResponseTable({ table, title }: { table: Table; title?: string }) {
  return <div className={`worker-rich-block worker-rich-table ${table.columns.length <= 3 ? 'worker-rich-table--simple' : ''}`} tabIndex={0} role="region" aria-label={title ?? 'Dados da resposta'}><table>{title && <caption>{title}</caption>}<thead><tr>{table.columns.map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead><tbody>{table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td data-label={table.columns[cellIndex]} key={cellIndex} className={/^(?:R\$\s*)?[\d.,%]+$/.test(cell) ? 'worker-number' : undefined}>{cell}</td>)}</tr>)}</tbody></table></div>;
}
function WrappedLabel({ x, y, payload }: { x?: number; y?: number; payload?: { value: string } }) {
  const words = (payload?.value ?? '').split(' '); const lines: string[] = [];
  for (const word of words) { const last = lines.length - 1; if (last < 0 || `${lines[last]} ${word}`.length > 21) lines.push(word); else lines[last] += ` ${word}`; }
  return <text x={(x ?? 0) - 8} y={(y ?? 0) - ((lines.length - 1) * 7)} textAnchor="end" fill="var(--worker-ink)" fontSize={12}>{lines.map((line, index) => <tspan x={(x ?? 0) - 8} dy={index ? 14 : 0} key={index}>{line}</tspan>)}</text>;
}
const ResponseChart = memo(function ResponseChart({ chart, unit = 'count', population, legacy = false }: { chart: Chart; unit?: 'count' | 'BRL' | 'percent' | 'minutes'; population?: number; legacy?: boolean }) {
  const data = chart.data.slice(0, 20);
  return <figure className="worker-rich-chart"><figcaption>{chart.title}</figcaption>{legacy && <p className="worker-rich-note">Visualização de uma conversa antiga. A abrangência da consulta não foi registrada.</p>}{population !== undefined && population > data.length && <p className="worker-rich-note">Exibindo {data.length} de {population.toLocaleString('pt-BR')} pessoas; cálculo sobre todos os eventos autorizados do período.</p>}<div aria-hidden="true" className="worker-chart-canvas"><ResponsiveContainer width="100%" height={Math.max(140, data.length * 64)}><BarChart data={data} layout="vertical" margin={{ left: 0, right: 50, top: 8, bottom: 8 }}><XAxis type="number" hide allowDecimals={unit !== 'count'} /><YAxis type="category" dataKey="label" width={150} tick={<WrappedLabel />} axisLine={false} tickLine={false} /><Tooltip cursor={{ fill: 'var(--worker-surface-soft)' }} formatter={(value: number) => [formatResponseValue(value, unit), '']} /><Bar dataKey="value" radius={[0, 5, 5, 0]} isAnimationActive={false}>{data.map((_, index) => <Cell key={index} fill="var(--worker-primary)" />)}<LabelList dataKey="value" position="right" formatter={(value: number) => formatResponseValue(value, unit)} fill="var(--worker-ink)" fontSize={12} /></Bar></BarChart></ResponsiveContainer></div><ResponseTable table={{ columns: ['Pessoa ou categoria', unit === 'BRL' ? 'Valor em reais' : unit === 'minutes' ? 'Duração' : unit === 'percent' ? 'Percentual' : 'Quantidade'], rows: data.map(item => [item.label, formatResponseValue(item.value, unit)]) }} title="Valores do gráfico" /></figure>;
});
const pieColors = ['var(--worker-primary)', 'var(--worker-attention)', 'oklch(var(--brand-green))', 'var(--worker-accent)', 'oklch(var(--brand-gold-500))', 'var(--worker-color)'];
const ResponsePieChart = memo(function ResponsePieChart({ chart, unit, population }: { chart: Chart; unit: ChartUnit; population: number }) {
  const completePartition = population === chart.data.length;
  const hasValue = chart.data.some(item => item.value > 0);
  const valueLabel = unit === 'BRL' ? 'Valor em reais' : unit === 'minutes' ? 'Duração' : unit === 'percent' ? 'Percentual' : 'Quantidade';
  return <figure className="worker-rich-chart worker-rich-pie"><figcaption>{chart.title}</figcaption>{!completePartition ? <p className="worker-rich-note">Esta consulta não contém todas as categorias. Os valores estão na tabela; a proporção em pizza não foi apresentada.</p> : !hasValue ? <p className="worker-rich-note">Todas as categorias têm valor zero no período consultado.</p> : <div className="worker-pie-layout"><div aria-hidden="true" className="worker-chart-canvas"><ResponsiveContainer width="100%" height={240}><PieChart><Pie data={chart.data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius="86%" isAnimationActive={false} stroke="var(--worker-paper)" strokeWidth={2}>{chart.data.map((_, index) => <Cell key={index} fill={pieColors[index % pieColors.length]} />)}</Pie><Tooltip formatter={(value: number) => [formatResponseValue(value, unit), valueLabel]} /></PieChart></ResponsiveContainer></div><ul className="worker-pie-legend" aria-label="Categorias do gráfico de pizza">{chart.data.map((item, index) => <li key={index}><span className="worker-pie-legend__color" aria-hidden="true" style={{ background: pieColors[index % pieColors.length] }} /><span>{item.label}</span><strong>{formatResponseValue(item.value, unit)}</strong></li>)}</ul></div>}<ResponseTable title="Valores do gráfico" table={{ columns: ['Categoria', valueLabel], rows: chart.data.map(item => [item.label, formatResponseValue(item.value, unit)]) }} /></figure>;
});
function ResponseComparison({ comparison }: { comparison: Comparison }) {
  const currentLabel = comparison.currentLabel ?? 'Período atual'; const previousLabel = comparison.previousLabel ?? 'Período anterior';
  return <section className="worker-response-comparison" aria-label={comparison.title}><h3>{comparison.title}</h3><div className="worker-comparison-items">{comparison.items.map((item, index) => <article key={index}><h4>{item.label}</h4><dl><div><dt>{currentLabel}</dt><dd>{formatResponseValue(item.current, comparison.unit)}</dd></div><span className="worker-comparison-versus" aria-hidden="true">vs.</span><div><dt>{previousLabel}</dt><dd>{formatResponseValue(item.previous, comparison.unit)}</dd></div></dl></article>)}</div><details className="worker-comparison-table"><summary>Ver valores em tabela <ChevronDown size={13} /></summary><ResponseTable title={comparison.title} table={{ columns: ['Indicador', currentLabel, previousLabel], rows: comparison.items.map(item => [item.label, formatResponseValue(item.current, comparison.unit), formatResponseValue(item.previous, comparison.unit)]) }} /></details></section>;
}
function ResponseBlock({ block }: { block: WorkerResponseBlock }) {
  switch (block.type) {
    case 'summary': return <Text text={block.text} />;
    case 'indicators': return <dl className="worker-response-indicators">{block.items.map((item, index) => <div key={index} data-unit={item.unit}><dt>{item.label}</dt><dd>{formatResponseValue(item.value, item.unit)}</dd>{item.description && <p>{item.description}</p>}</div>)}</dl>;
    case 'table': return <ResponseTable table={block} title={block.title} />;
    case 'bar_chart': return <ResponseChart chart={{ title: block.title, data: block.data }} unit={block.unit} population={block.population} />;
    case 'pie_chart': return <ResponsePieChart chart={{ title: block.title, data: block.data }} unit={block.unit} population={block.population} />;
    case 'comparison': return <ResponseComparison comparison={{ title: block.title, unit: block.unit, currentLabel: block.currentLabel, previousLabel: block.previousLabel, items: block.items.map(item => ({ label: item.label, current: item.current, previous: item.previous })) }} />;
    case 'profile': return <section className="worker-response-profile">{block.photoUrl && <img src={block.photoUrl} alt={`Fotografia oficial de ${block.name}`} loading="lazy" referrerPolicy="no-referrer" />}<div><h3>{block.name}</h3><p>{block.role} · {block.edition}</p><dl>{block.details.map((item, index) => <div key={index}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><small>Verificado em {dateLabel(block.verifiedOn)}{block.publishedOn ? ` · Publicado em ${dateLabel(block.publishedOn)}` : ''}</small></div></section>;
    case 'sources': return <div className="worker-response-sources" aria-label="Fontes verificadas">{block.items.map((item, index) => { const url = safeSourceUrl(item.url); return url ? <a key={index} href={url} target={item.source === 'web' ? '_blank' : undefined} rel={item.source === 'web' ? 'noopener noreferrer' : undefined}><ExternalLink size={12} />{item.label}{item.date ? ` · ${dateLabel(item.date)}` : ''}</a> : null; })}</div>;
    case 'empty': return <p className="worker-response-notice">{block.message}</p>;
    case 'clarification': return <div className="worker-response-notice"><Text text={block.question} />{block.options && <ul>{block.options.map(option => <li key={option}>{option}</li>)}</ul>}</div>;
  }
}
function StructuredResponse({ response }: { response: WorkerResponse }) {
  const { metadata } = response;
  return <div className="worker-response"><div className="worker-response-lead"><Text text={response.summary} /></div>{response.blocks.map((block, index) => <ResponseBlock key={index} block={block} />)}<footer className="worker-response-context">{metadata.completeness === 'partial' && <p className="worker-response-coverage">Consulta parcial. Os registros exibidos não representam um total.</p>}{response.intent === 'map_sales' && metadata.completeness === 'complete' && <p className="worker-response-essential">Valores das vendas. Pagamentos recebidos são apurados separadamente.</p>}<div className="worker-response-stamp"><span>{[metadata.edition, metadata.period?.label].filter(Boolean).join(' · ')}</span><small>Atualizado em {new Date(metadata.updatedAt).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</small></div>{metadata.notes.length > 0 && <details className="worker-response-details"><summary>Como interpretar estes dados <ChevronDown size={13} /></summary><div>{metadata.notes.map((note, index) => <p key={index}>{note}</p>)}<span>{metadata.scope} · Horário de Brasília</span></div></details>}</footer></div>;
}
export default function WorkerRichContent({ content, streaming }: { content: string; streaming?: boolean }) {
  return <div className="worker-rich">{parseRichContent(content, streaming).map((segment, index) => segment.kind === 'text' ? <Text key={index} text={segment.text} /> : segment.kind === 'table' ? <ResponseTable key={index} table={segment.table} /> : segment.kind === 'response' ? <StructuredResponse key={index} response={segment.response} /> : <ResponseChart key={index} chart={segment.chart} legacy />)}</div>;
}
