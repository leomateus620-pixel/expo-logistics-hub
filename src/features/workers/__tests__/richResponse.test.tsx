import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WorkerRichContent, { formatResponseValue, parseRichContent, richContentToText } from '../components/WorkerRichContent';
import { encodeWorkerResponse, type WorkerResponse } from '../../../../supabase/functions/_shared/workers/response-contract';

vi.mock('recharts', async original => ({ ...await original<typeof import('recharts')>(), ResponsiveContainer: () => null }));
afterEach(cleanup);
const response = (blocks: WorkerResponse['blocks']): WorkerResponse => ({ version: 1, worker: 'agenda', intent: 'agenda_ranking', summary: 'Dados de teste verificados.', metadata: { organizationId: '10000000-0000-4000-8000-000000000001', timezone: 'America/Sao_Paulo', scope: 'Eventos autorizados', updatedAt: '2026-10-16T21:00:00Z', completeness: 'complete', period: { from: '2026-10-01', to: '2026-10-31', label: 'outubro de 2026' }, notes: [] }, blocks });

describe('BOT FENASOJA: resposta estruturada', () => {
  it('apresenta valores de indicadores com unidade e sem identificadores internos', () => {
    render(<WorkerRichContent content={encodeWorkerResponse(response([{ type: 'indicators', items: [{ label: 'Vendas realizadas', value: 1234567, unit: 'BRL' }, { label: 'Duração média', value: 150, unit: 'minutes' }] }]))} />);
    expect(screen.getByText(/1\.234\.567,00/)).toBeInTheDocument();
    expect(screen.getByText('2h30')).toBeInTheDocument();
    expect(screen.queryByText('10000000-0000-4000-8000-000000000001')).not.toBeInTheDocument();
    expect(screen.getByText(/outubro de 2026/)).toBeInTheDocument();
    expect(formatResponseValue(12.5, 'percent')).toBe('12,5%');
  });
  it('mostra a alternativa acessível com os mesmos valores e nomes completos do gráfico', () => {
    const content = encodeWorkerResponse(response([{ type: 'bar_chart', title: 'Eventos por pessoa · outubro de 2026', unit: 'count', complete: true, population: 125, data: [{ label: 'Ana Maria de Souza', value: 120 }, { label: 'Ana Maria de Souza Santos', value: 115 }] }]));
    render(<WorkerRichContent content={content} />);
    expect(screen.getByRole('table', { name: 'Valores do gráfico' })).toHaveTextContent('Ana Maria de Souza Santos115');
    expect(screen.getByRole('table', { name: 'Valores do gráfico' })).toHaveTextContent('Ana Maria de Souza120');
    expect(screen.getByText(/Exibindo 2 de 125 identidades/)).toBeInTheDocument();
    expect(richContentToText(content)).toContain('Ana Maria de Souza Santos: 115');
  });
  it('mantém os valores em destaque e as explicações disponíveis em uma seção recolhida', () => {
    const value = response([{ type: 'indicators', items: [{ label: 'Vendas realizadas', value: 1234567, unit: 'BRL' }, { label: 'Vendas em andamento', value: 345678, unit: 'BRL' }] }]);
    value.intent = 'map_sales'; value.metadata.notes = ['Um pedido pode ter vários espaços.'];
    const { container } = render(<WorkerRichContent content={encodeWorkerResponse(value)} />);
    expect(screen.getByText(/1\.234\.567,00/)).toBeVisible();
    expect(screen.getByText(/345\.678,00/)).toBeVisible();
    expect(container.querySelector('details')).not.toHaveAttribute('open');
    expect(screen.getByText('Um pedido pode ter vários espaços.')).not.toBeVisible();
    expect(screen.getByText(/Pagamentos recebidos são apurados separadamente/)).toBeVisible();
  });
  it('apresenta pizza com categorias completas, legenda e tabela com os mesmos valores', () => {
    const content = encodeWorkerResponse(response([{ type: 'pie_chart', title: 'Eventos por situação', unit: 'count', complete: true, population: 3, data: [{ label: 'Agendados', value: 12 }, { label: 'Concluídos', value: 8 }, { label: 'Cancelados', value: 0 }] }]));
    const { container } = render(<WorkerRichContent content={content} />);
    const legend = screen.getByRole('list', { name: 'Categorias do gráfico de pizza' });
    expect(legend).toHaveTextContent('Agendados12Concluídos8Cancelados0');
    expect(screen.getByRole('table', { name: 'Valores do gráfico' })).toHaveTextContent('Agendados12Concluídos8Cancelados0');
    expect(container.querySelector('.worker-rich-pie')).toBeInTheDocument();
    expect(richContentToText(content)).toContain('Cancelados: 0');
    expect(richContentToText(content)).not.toContain('%');
  });
  it('preserva categorias com zero sem desenhar uma proporção inexistente', () => {
    render(<WorkerRichContent content={encodeWorkerResponse(response([{ type: 'pie_chart', title: 'Eventos por situação', unit: 'count', complete: true, population: 2, data: [{ label: 'Agendados', value: 0 }, { label: 'Concluídos', value: 0 }] }]))} />);
    expect(screen.getByText('Todas as categorias têm valor zero no período consultado.')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Valores do gráfico' })).toHaveTextContent('Agendados0Concluídos0');
  });
  it('recusa pizza com alcance incompleto sem apresentar amostra como proporção', () => {
    const value = response([]);
    const content = '```fenasoja-response\n' + JSON.stringify({ ...value, blocks: [{ type: 'pie_chart', title: 'Eventos por situação', unit: 'count', complete: true, population: 4, data: [{ label: 'Agendados', value: 12 }] }] }) + '\n```';
    const { container } = render(<WorkerRichContent content={content} />);
    expect(container.querySelector('.worker-rich-pie .worker-pie-layout')).toBeNull();
    expect(screen.queryByRole('list', { name: 'Categorias do gráfico de pizza' })).not.toBeInTheDocument();
  });
  it('compara os valores dos períodos sem inventar diferença ou percentual', () => {
    const content = encodeWorkerResponse(response([{ type: 'comparison', title: 'Eventos: outubro vs. setembro', currentLabel: 'outubro de 2026', previousLabel: 'setembro de 2026', unit: 'count', items: [{ label: 'Eventos vinculados', current: 15, previous: 0 }] }]));
    const { container } = render(<WorkerRichContent content={content} />);
    expect(screen.getByRole('heading', { name: 'Eventos: outubro vs. setembro' })).toBeInTheDocument();
    expect(container.querySelector('.worker-comparison-items dl')).toHaveTextContent('outubro de 202615vs.setembro de 20260');
    expect(container.querySelector('.worker-comparison-table')).not.toHaveAttribute('open');
    expect(container.querySelector('.worker-comparison-table th:nth-child(2)')).toHaveTextContent('outubro de 2026');
    expect(container.querySelector('.worker-comparison-table th:nth-child(3)')).toHaveTextContent('setembro de 2026');
    expect(richContentToText(content)).toContain('Eventos vinculados: outubro de 2026 15; setembro de 2026 0');
    expect(richContentToText(content)).not.toContain('%');
  });
  it('mantém os rótulos de comparação em conversas sem labels de período', () => {
    const content = encodeWorkerResponse(response([{ type: 'comparison', title: 'Eventos por período', unit: 'count', items: [{ label: 'Eventos vinculados', current: 15, previous: 12 }] }]));
    const { container } = render(<WorkerRichContent content={content} />);
    expect(container.querySelector('.worker-comparison-items dl')).toHaveTextContent('Período atual15vs.Período anterior12');
    expect(richContentToText(content)).toContain('Período atual 15; Período anterior 12');
  });
  it('recusa contrato inválido, séries não finitas e linhas incompatíveis sem mostrar JSON', () => {
    const invalid = response([{ type: 'table', columns: ['Pessoa', 'Eventos'], rows: [['Ana']] }]);
    const content = '```fenasoja-response\n' + JSON.stringify(invalid) + '\n```';
    render(<WorkerRichContent content={content} />);
    expect(screen.getByText(/Não foi possível apresentar/)).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText(/organizationId/)).not.toBeInTheDocument();
    expect(parseRichContent('```fenasoja-chart\n{"title":"x","data":[{"label":"x","value":1e400}]}\n```')).toEqual([]);
  });
  it('oculta um bloco interrompido mesmo após parar a transmissão', () => {
    const content = 'Consultando.\n```fenasoja-response\n{"version":1';
    expect(parseRichContent(content, true)).toEqual([{ kind: 'text', text: 'Consultando.' }]);
    expect(parseRichContent(content, false)).toEqual([{ kind: 'text', text: 'Consultando.' }]);
  });
  it('adapta conversas antigas com situações comerciais e células legíveis', () => {
    const content = '```fenasoja-table\n{"columns":["Reference","Situação","Item count"],"rows":[["PV-42","SALE_OPEN","6"]]}\n```';
    const { container } = render(<WorkerRichContent content={content} />);
    expect(screen.getByRole('columnheader', { name: 'Espaços no pedido' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: 'Venda em andamento' })).toHaveAttribute('data-label', 'Situação');
    expect(container.querySelector('.worker-rich-table--simple')).toBeInTheDocument();
    expect(screen.queryByText('SALE_OPEN')).not.toBeInTheDocument();
  });
  it('identifica o alcance desconhecido de um gráfico antigo', () => {
    render(<WorkerRichContent content={'```fenasoja-chart\n{"title":"Eventos antigos","data":[{"label":"Ana","value":2}]}\n```'} />);
    expect(screen.getByText(/abrangência da consulta não foi registrada/)).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Valores do gráfico' })).toHaveTextContent('Ana2');
  });
});
