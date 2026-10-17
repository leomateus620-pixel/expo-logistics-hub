import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import WorkerRichContent, { richContentToText } from '../components/WorkerRichContent';
import { encodeWorkerResponse, workerResponseSchema, type WorkerResponse } from '../../../../supabase/functions/_shared/workers/response-contract';

afterEach(cleanup);
const id = '00000000-0000-4000-8000-000000000001';
const document = (): WorkerResponse => ({ version: 1, worker: 'agenda', intent: 'agenda_ranking', summary: 'Duas pessoas lideram empatadas com 12 eventos vinculados.',
  metadata: { organizationId: '10000000-0000-4000-8000-000000000001', timezone: 'America/Sao_Paulo', scope: 'Agenda autorizada', updatedAt: '2026-10-17T12:00:00Z', completeness: 'complete', notes: [] },
  blocks: [{ type: 'entity_ranking', title: 'Pessoas vinculadas', entityKind: 'person', population: 3, items: [
    { id, name: 'Fabiano Souza', events: 12, position: 1 },
    { id: '00000000-0000-4000-8000-000000000002', name: 'Fabiano Souza', events: 12, position: 2 },
    { id: '00000000-0000-4000-8000-000000000003', name: 'Outra Pessoa', events: 0, position: 3 },
  ] }] });
describe('Identidades nos resultados do BOT', () => {
  it('reabre homônimos separados por UUID com ordem, zero e cópia textual completos', () => {
    const content = encodeWorkerResponse(document());
    const { container, unmount } = render(<WorkerRichContent content={content} />);
    expect(screen.getAllByText('Fabiano Souza')).toHaveLength(2);
    expect(container.querySelectorAll('.worker-entity-ranking li')).toHaveLength(3);
    expect(richContentToText(content)).toContain('3. Outra Pessoa: 0 eventos vinculados');
    expect(container.textContent).not.toContain(id);
    unmount();
    render(<WorkerRichContent content={content} />);
    expect(screen.getByText('Outra Pessoa')).toBeInTheDocument();
  });
  it('não atribui foto de outra pessoa por nome quando o UUID não tem foto', () => {
    const value = document();
    if (value.blocks[0].type !== 'entity_ranking') throw new Error('fixture');
    value.blocks[0].items[0].name = 'Fabiano Soltis';
    const { container } = render(<WorkerRichContent content={encodeWorkerResponse(value)} />);
    expect(container.querySelector('.worker-entity-ranking li img')).toBeNull();
    expect(container.querySelector('.worker-entity-ranking li .worker-entity-ranking__initials')).toHaveTextContent('FS');
  });
  it('reutiliza ícone oficial por slug controlado e mantém fallback para unidade nova', () => {
    const value = document();
    value.blocks = [{ type: 'entity_ranking', title: 'Comissões', entityKind: 'commission', population: 2, items: [
      { id, name: 'Segurança', visualKey: 'seguranca', events: 6, position: 1 },
      { id: '00000000-0000-4000-8000-000000000002', name: 'Unidade nova', visualKey: 'nova', events: 3, position: 2 },
    ] }];
    const { container } = render(<WorkerRichContent content={encodeWorkerResponse(value)} />);
    expect(container.querySelector('[data-identity="seguranca"]')).toBeInTheDocument();
    expect(container.querySelector('[data-identity="fallback"]')).toBeInTheDocument();
    expect(screen.getByText('Unidade nova')).toBeInTheDocument();
  });
  it('mostra escolhas objetivas e copia nomes sem expor UUIDs persistidos', () => {
    const value = document();value.blocks = [{ type:'clarification', question:'Qual pessoa deseja consultar?', options:['Fabiano Souza · identidade 1','Fabiano Souza · identidade 2'], choices:[
      {id,name:'Fabiano Souza'}, {id:'00000000-0000-4000-8000-000000000002',name:'Fabiano Souza'},
    ]}];
    const content=encodeWorkerResponse(value);const {container}=render(<WorkerRichContent content={content}/>);
    expect(screen.getByText('2. Fabiano Souza · identidade 2')).toBeInTheDocument();
    expect(container.textContent).not.toContain(id);expect(richContentToText(content)).not.toContain(id);
    expect(richContentToText(content)).toContain('1. Fabiano Souza · identidade 1');
  });
  it('recusa URLs e IDs repetidos no contrato de ranking, sem bloquear homônimos', () => {
    const value = document();
    expect(workerResponseSchema.safeParse(value).success).toBe(true);
    const block = value.blocks[0]; if (block.type !== 'entity_ranking') throw new Error('fixture');
    expect(workerResponseSchema.safeParse({ ...value, blocks: [{ ...block, items: [{ ...block.items[0], photoUrl: 'https://external.test/photo' }] }] }).success).toBe(false);
    block.items[1].id = id;
    expect(workerResponseSchema.safeParse(value).success).toBe(false);
  });
});
