import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

type Table = { columns: string[]; rows: string[][] };
type Chart = { title: string; data: Array<{ label: string; value: number }> };
export type RichSegment = { kind: 'text'; text: string } | { kind: 'table'; table: Table } | { kind: 'chart'; chart: Chart };

const blockPattern = /```fenasoja-(table|chart)\n([\s\S]*?)\n```/g;

export function parseRichContent(content: string, streaming = false): RichSegment[] {
  const segments: RichSegment[] = [];
  let last = 0;
  for (const match of content.matchAll(blockPattern)) {
    const before = content.slice(last, match.index).trim();
    if (before) segments.push({ kind: 'text', text: before });
    last = (match.index ?? 0) + match[0].length;
    try {
      const value = JSON.parse(match[2]);
      if (match[1] === 'table' && Array.isArray(value?.columns) && Array.isArray(value?.rows)) segments.push({ kind: 'table', table: value });
      if (match[1] === 'chart' && Array.isArray(value?.data)) segments.push({ kind: 'chart', chart: value });
    } catch { /* malformed block is skipped, never shown raw */ }
  }
  let rest = content.slice(last);
  if (streaming) rest = rest.replace(/```[\s\S]*$/, '');
  if (rest.trim()) segments.push({ kind: 'text', text: rest.trim() });
  return segments;
}

/** Plain text for copying: visual blocks become readable rows. */
export function richContentToText(content: string): string {
  return parseRichContent(content).map(segment => segment.kind === 'text' ? segment.text.replace(/\*\*/g, '')
    : segment.kind === 'table' ? [segment.table.columns.join(' | '), ...segment.table.rows.map(row => row.join(' | '))].join('\n')
      : `${segment.chart.title}: ${segment.chart.data.map(item => `${item.label} ${item.value}`).join(', ')}`).join('\n\n');
}

function Text({ text }: { text: string }) {
  return <p className="worker-rich-text">{text.split(/(\*\*[^*]+\*\*)/g).map((part, index) => part.startsWith('**') && part.endsWith('**')
    ? <strong key={index}>{part.slice(2, -2)}</strong> : <span key={index}>{part}</span>)}</p>;
}

export default function WorkerRichContent({ content, streaming }: { content: string; streaming?: boolean }) {
  return <div className="worker-rich">
    {parseRichContent(content, streaming).map((segment, index) => {
      if (segment.kind === 'text') return <Text key={index} text={segment.text} />;
      if (segment.kind === 'table') return <div key={index} className="worker-rich-block worker-rich-table" style={{ animationDelay: `${index * 80}ms` }}>
        <table><thead><tr>{segment.table.columns.map(column => <th key={column}>{column}</th>)}</tr></thead>
          <tbody>{segment.table.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table>
      </div>;
      const data = segment.chart.data.slice(0, 10);
      return <figure key={index} className="worker-rich-block worker-rich-chart" style={{ animationDelay: `${index * 80}ms` }}>
        <figcaption>{segment.chart.title}</figcaption>
        <ResponsiveContainer width="100%" height={Math.max(120, data.length * 34)}>
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'hsl(var(--muted) / 0.4)' }} formatter={(value: number) => [value.toLocaleString('pt-BR'), '']} />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} animationDuration={700}>
              {data.map((_, cellIndex) => <Cell key={cellIndex} fill={cellIndex % 2 ? 'hsl(var(--accent))' : 'hsl(var(--primary))'} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </figure>;
    })}
  </div>;
}
