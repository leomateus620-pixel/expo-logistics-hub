import { beforeEach, describe, expect, it } from 'vitest';
import { readUnlock, writeUnlock, WORKERS_UNLOCK_MS } from '../WorkersAccessGate';
import { chronological } from '../useWorkersChat';
import { parseRichContent } from '../components/WorkerRichContent';
import { renderToolEvidence, humanValue } from '../../../../supabase/functions/_shared/workers/engine';

describe('Equipe Fenasoja: senha', () => {
  beforeEach(() => sessionStorage.clear());
  it('sem senha confirmada não libera', () => expect(readUnlock('u1')).toBe(false));
  it('libera por 30 minutos apenas para o mesmo usuário', () => {
    writeUnlock('u1', 1000);
    expect(readUnlock('u1', 1000 + WORKERS_UNLOCK_MS - 1)).toBe(true);
    expect(readUnlock('u1', 1000 + WORKERS_UNLOCK_MS + 1)).toBe(false);
    expect(readUnlock('u2', 1001)).toBe(false);
  });
});

describe('Equipe Fenasoja: ordem da conversa', () => {
  it('pergunta vem antes da resposta mesmo com o mesmo horário', () => {
    const at = '2026-10-16T13:51:00Z';
    const rows = chronological([{ created_at: at, role: 'assistant', request_id: 'r' }, { created_at: at, role: 'user', request_id: 'r' }]);
    expect(rows.map(r => r.role)).toEqual(['user', 'assistant']);
  });
});

describe('Equipe Fenasoja: formato da resposta', () => {
  const result = { summary: '20 registro(s) autorizado(s) retornado(s). Resultado parcial; consulte a tela.', total: 113, citations: [{ label: 'Agenda', url: '/cronograma-eventos', source: 'app' }],
    records: [
      { id: 'a', title: 'Almoço de Ideias', status: 'confirmado', start_at: '2025-03-26T14:00:00+00:00', setup_start_at: '2025-03-26T12:00:00+00:00', approval_status: 'nao_solicitado' },
      { id: 'b', title: 'Almoço', status: 'pendente', start_at: '2025-04-03T14:00:00+00:00', setup_start_at: '2025-04-03T12:00:00+00:00', approval_status: 'nao_solicitado' },
    ] };
  it('resposta curta sem campos técnicos nem datas ISO', () => {
    const { content } = renderToolEvidence([result as never]);
    expect(content).toContain('113 registros no escopo solicitado');
    expect(content).not.toMatch(/setup|approval|nao_solicitado|2025-03-26T/);
    const segments = parseRichContent(content);
    expect(segments.some(s => s.kind === 'table')).toBe(true);
    expect(segments.some(s => s.kind === 'chart')).toBe(false);
    expect(content).toContain('Não foram calculados totais, percentuais ou gráficos a partir dessa amostra');
  });
  it('datas em formato brasileiro (horário de Brasília)', () => expect(humanValue('2025-03-26T14:00:00+00:00')).toBe('26/03/2025 11h00'));
});
