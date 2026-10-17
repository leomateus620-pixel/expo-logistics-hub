import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import WorkerRichContent, { richContentToText } from '../components/WorkerRichContent';
import { WorkerKnowledgeSource, WorkerSourceIcon } from '../components/WorkerKnowledgeSource';
import { safeWorkerSourceUrl } from '../api';
import { encodeWorkerResponse, type WorkerResponse } from '../../../../supabase/functions/_shared/workers/response-contract';

afterEach(cleanup);
const longLabel = 'Embrapa · Sistemas de produção e manejo de ovinos: referência técnica histórica, com condições e limitações descritas na publicação';
const source = { label: longLabel, url: 'https://www.embrapa.br/busca-de-publicacoes', source: 'kb' as const, date: '2026-10-17' };
const response: WorkerResponse = { version: 1, worker: 'radar', intent: 'knowledge_base', summary: 'Consulte as condições de manejo descritas nesta referência.',
  metadata: { organizationId: '10000000-0000-4000-8000-000000000001', timezone: 'America/Sao_Paulo', scope: 'Base de conhecimento pública · Agropecuária', updatedAt: '2026-10-17T15:00:00Z', completeness: 'partial', edition: 'Fenasoja 2026', notes: ['Dado de referência: 2015.', 'Informação parcial: a fonte sustenta a resposta só em parte. Confira a fonte antes de usar como dado oficial.'] },
  blocks: [{ type: 'sources', items: [source] }] };

describe('Fonte KB no chat existente', () => {
  it('compacta a fonte em ícone e mantém rótulo/data na dica, período e ressalvas visíveis', async () => {
    const user = userEvent.setup();
    const content = encodeWorkerResponse(response);
    render(<WorkerRichContent content={content} />);
    const link = screen.getByRole('link', { name: `Base de conhecimento · ${longLabel} · Acesso declarado em 17/10/2026` });
    expect(link.textContent).toBe('');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.hover(link);
    const tip = await screen.findByRole('tooltip');
    expect(tip).toHaveTextContent('Base de conhecimento');
    expect(tip).toHaveTextContent(longLabel);
    expect(tip).toHaveTextContent('Acesso declarado em 17/10/2026');
    expect(screen.getByText('Dado de referência: 2015.')).toBeVisible();
    expect(screen.getByText(response.metadata.notes[1])).toBeVisible();
    expect(screen.getByText('Fenasoja 2026')).toBeVisible();
    expect(screen.queryByText(/Atualizado em/)).not.toBeInTheDocument();
    expect(screen.queryByText(/registros exibidos não representam um total/)).not.toBeInTheDocument();
    const copied = richContentToText(content);
    expect(copied).toContain('Acesso declarado em 17/10/2026');
    expect(copied).toContain('Dado de referência: 2015.');
    expect(copied).toContain('Fenasoja 2026');
    expect(copied).toContain(longLabel);
  });
  it('expõe link externo seguro com nome identificável e foco de teclado', async () => {
    const user = userEvent.setup();
    render(<WorkerKnowledgeSource {...source} />);
    const link = screen.getByRole('link', { name: /Base de conhecimento · Embrapa/ });
    expect(link).toHaveAttribute('href', source.url);
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await user.tab();
    expect(link).toHaveFocus();
    expect(within(await screen.findByRole('tooltip')).getByText('Acesso declarado em 17/10/2026')).toHaveAttribute('datetime', '2026-10-17');
    await user.keyboard('{Escape}'); expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
  it('mantém web e app como ícones com nome acessível e comportamento de abertura próprio', () => {
    render(<><WorkerSourceIcon source="web" label="Fenasoja" url="https://fenasoja.com.br/" date="2026-10-17" /><WorkerSourceIcon source="app" label="Agenda" url="/cronograma-eventos" /></>);
    const web = screen.getByRole('link', { name: 'Fonte na web · Fenasoja · Data da fonte: 17/10/2026' });
    expect(web).toHaveAttribute('target', '_blank'); expect(web).toHaveAttribute('rel', 'noopener noreferrer'); expect(web.textContent).toBe('');
    const app = screen.getByRole('link', { name: 'Dados do aplicativo · Agenda' });
    expect(app).toHaveAttribute('href', '/cronograma-eventos'); expect(app).not.toHaveAttribute('target'); expect(app.textContent).toBe('');
  });
  it('preserva fontes legadas sem kind e infere o destino externo pelo endereço', () => {
    render(<WorkerSourceIcon label="Fonte legada" url="https://fenasoja.com.br/" />);
    expect(screen.getByRole('link', { name: 'Fonte na web · Fonte legada' })).toHaveAttribute('href', 'https://fenasoja.com.br/');
  });
  it('não apresenta chips, data inválida ou rótulos de atualização em informação sem confirmação', () => {
    render(<WorkerRichContent content={encodeWorkerResponse({ ...response, summary: 'Não há confirmação deste dado nas fontes consultadas.', metadata: { ...response.metadata, completeness: 'unavailable', notes: [] }, blocks: [{ type: 'empty', message: 'Esta informação não está confirmada nas fontes oficiais consultadas.' }] })} />);
    expect(screen.getByText('Esta informação não está confirmada nas fontes oficiais consultadas.')).toBeVisible();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
    expect(screen.queryByText('Base de conhecimento')).not.toBeInTheDocument();
    expect(screen.queryByText(/Invalid Date|null|undefined/)).not.toBeInTheDocument();
  });
  it('aplica o mesmo validador público no transporte e no chip', () => {
    const { container } = render(<WorkerKnowledgeSource {...source} date="2026-02-30" />);
    expect(container).toBeEmptyDOMElement();
    expect(safeWorkerSourceUrl('https://www.emater.tche.br/', 'kb')).toBe('https://www.emater.tche.br/');
    for (const url of ['https://www.embrapa.br/areas/token', 'https://10.0.0.1/', 'https://www.embrapa.br/?cpf=123']) expect(safeWorkerSourceUrl(url, 'kb')).toBeNull();
  });
});
