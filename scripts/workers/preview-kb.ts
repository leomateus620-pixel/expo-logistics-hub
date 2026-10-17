/** Loopback preview only: read reviewed rows on the Vite server, never bundle the acervo. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { composeKbResponse, interpretKbQuery, type KbHit, type KbSelection } from '../../supabase/functions/_shared/workers/knowledge-base';
import type { WorkerRequest } from '../../supabase/functions/_shared/workers/contracts';

const fixtures: Record<string, string> = {
  'Quem foi o presidente da Fenasoja 2024?': 'ED24-PRES',
  'Qual foi o volume de negócios da Fenasoja 2018?': 'ED22-NEG',
  'Qual foi o público da Fenasoja 1966?': 'ED01-PUB',
  'Qual o preço da soja hoje?': 'MERC-DYN-001',
  'Prévia KB com fonte longa · teste local': 'SUST-ILPF-0105',
};
export function kbResponseFixture(request: WorkerRequest) {
  const id = fixtures[request.message];
  if (!id) return null;
  const filename = id.startsWith('ED') ? 'fenasoja-kb.json' : 'kb-expandida.json';
  const data = JSON.parse(readFileSync(path.resolve('data/kb', filename), 'utf8')) as { entries: Array<KbHit & { id: string }> };
  const entry = data.entries.find(item => item.id === id);
  if (!entry) throw new Error('Missing reviewed KB preview fixture');
  const now = new Date('2026-10-17T12:00:00-03:00');
  const query = interpretKbQuery(entry.canonical_question, now);
  const outcome = entry.status === 'confirmado' ? 'answered' : entry.status === 'sem_fonte' ? 'not_confirmed' : entry.status === 'dinamico' ? 'redirected_live' : 'answered_with_caveat';
  const selection: KbSelection = { type: 'answer', hit: { ...entry, entry_id: id, score: 1, matched_question: entry.canonical_question }, query, notes: query.notes, outcome };
  const worker = request.worker ?? 'radar';
  return { ...composeKbResponse(request, selection, now, worker), worker };
}
