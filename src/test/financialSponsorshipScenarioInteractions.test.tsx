import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SponsorshipDeltaSignal } from '@/features/financial-management/components/SponsorshipIntelligenceCharts';
import { SponsorshipIntelligenceView } from '@/features/financial-management/components/SponsorshipIntelligenceView';
import { getCommissionModule } from '@/modules/commissions/commissionRegistry';

function renderSponsorshipExperience() {
  const module = getCommissionModule('financeiro-gerencial');
  if (!module) throw new Error('Módulo Financeiro Gerencial não registrado.');

  return render(
    <MemoryRouter>
      <SponsorshipIntelligenceView module={module} />
    </MemoryRouter>,
  );
}

async function renderScenarioExperience() {
  const module = getCommissionModule('financeiro-gerencial');
  if (!module) throw new Error('Módulo Financeiro Gerencial não registrado.');
  const scenarioExperience = await import(
    '@/features/financial-management/components/ScenarioIntelligenceView'
  );
  const ScenarioIntelligenceView = scenarioExperience.ScenarioIntelligenceView
    ?? scenarioExperience.default;

  return render(
    <MemoryRouter>
      <ScenarioIntelligenceView module={module} />
    </MemoryRouter>,
  );
}

describe('interações da inteligência de patrocínios', () => {
  beforeEach(() => {
    let frameTime = performance.now();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameTime += 1_000;
      callback(frameTime);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('sincroniza categoria entre ranking e carteira sem substituir o contexto global', () => {
    const { container } = renderSponsorshipExperience();
    const globalKpis = screen.getByLabelText('Posição global da carteira de patrocínios');
    expect(within(globalKpis).getByText('Patrocínio projetado: R$ 5.899.659,00')).toBeInTheDocument();
    expect(within(globalKpis).getByText('A receber informado: R$ 493.666,66')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Receitas projetadas/i }))
      .toHaveAttribute('href', '/comissoes/financeiro-gerencial/receitas-projetadas');
    expect(screen.getByRole('link', { name: /Receitas confirmadas/i }))
      .toHaveAttribute('href', '/comissoes/financeiro-gerencial/receitas-confirmadas');

    const ouroButton = Array.from(
      container.querySelectorAll<HTMLButtonElement>('.fsi-tier-row'),
    ).find((button) => button.querySelector('.fsi-tier-row__identity b')?.textContent === 'Ouro');
    expect(ouroButton).toBeDefined();
    expect(ouroButton).toHaveAccessibleName(/^Ouro\. 8 registros, 5 com valor\./i);
    expect(ouroButton).not.toHaveAttribute('aria-describedby');
    expect(ouroButton?.getAttribute('aria-label')?.match(/Ouro/g)).toHaveLength(1);

    const firstOuroRow = Array.from(
      container.querySelectorAll<HTMLTableRowElement>('.fsi-pareto tbody tr'),
    ).find((row) => row.children[2]?.textContent === 'Ouro');
    const firstOuroSponsor = firstOuroRow?.querySelector('th[scope="row"]')?.textContent?.trim();
    if (!firstOuroSponsor) throw new Error('Primeiro patrocinador Ouro do Pareto não identificado.');
    const firstOuroPosition = Array.from(firstOuroRow!.parentElement!.children).indexOf(firstOuroRow!) + 1;

    fireEvent.click(ouroButton!);

    expect(ouroButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Categoria')).toHaveValue('Ouro');
    const selectionSummary = container.querySelector('.fsi-selection-summary');
    expect(selectionSummary).toHaveTextContent('Recorte ativo');
    expect(selectionSummary).toHaveTextContent('Ouro');
    expect(within(globalKpis).getByText('Patrocínio projetado: R$ 5.899.659,00')).toBeInTheDocument();
    const pareto = screen.getByRole('slider', {
      name: 'Percorrer patrocinadores por concentração',
    });
    expect(pareto).toHaveAttribute('aria-valuenow', String(firstOuroPosition));
    expect(pareto.getAttribute('aria-valuetext')).toContain(firstOuroSponsor);
    expect(screen.getByRole('button', { name: /Patrocinador em foco.*Ver composição/i }))
      .toHaveTextContent(firstOuroSponsor);
    expect(screen.getAllByRole('button', { name: 'Limpar seleção' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Limpar seleção' }));

    expect(ouroButton).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByLabelText('Categoria')).toHaveValue('all');
    expect(container.querySelector('.fsi-selection-summary')).not.toBeInTheDocument();
  });

  it('aplica filtros sobre os 100 registros, ordena a tabela e recupera o estado sem resultados', () => {
    const { container } = renderSponsorshipExperience();
    const resultCount = container.querySelector('.fsi-result-count');
    expect(resultCount).toHaveTextContent('100 de 100');

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'unreported' } });
    expect(resultCount).not.toHaveTextContent('100 de 100');

    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    fireEvent.change(screen.getByLabelText('Ordenar'), { target: { value: 'name' } });

    const ledger = screen.getByRole('region', { name: 'Carteira completa de patrocínios' });
    const renderedNames = Array.from(
      ledger.querySelectorAll<HTMLTableCellElement>('tbody th[scope="row"]'),
      (cell) => cell.textContent?.trim() ?? '',
    );
    const expectedNames = [...renderedNames].sort((left, right) => left.localeCompare(right, 'pt-BR'));
    expect(renderedNames).toEqual(expectedNames);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na carteira' }), {
      target: { value: 'patrocinador que não existe na planilha' },
    });

    const emptyHeading = screen.getByRole('heading', { name: 'Nenhum resultado encontrado' });
    const emptyState = emptyHeading.closest<HTMLElement>('[role="status"]');
    expect(emptyState).toBeInTheDocument();
    fireEvent.click(within(emptyState!).getByRole('button', { name: 'Limpar filtros' }));
    expect(resultCount).toHaveTextContent('100 de 100');
    expect(screen.queryByText('Nenhum resultado encontrado')).not.toBeInTheDocument();
  });

  it('abre o mesmo drawer controlado pelo Pareto e pela carteira', () => {
    renderSponsorshipExperience();
    const paretoAction = screen.getByRole('button', {
      name: /Patrocinador em foco.*Ver composição/i,
    });
    const activeSponsorName = paretoAction.querySelector('strong')?.textContent?.trim();
    if (!activeSponsorName) throw new Error('Patrocinador ativo do Pareto não identificado.');

    fireEvent.click(paretoAction);
    let drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: activeSponsorName })).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar painel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: `Ver detalhes de ${activeSponsorName}` }));
    drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: activeSponsorName })).toBeInTheDocument();

    fireEvent.click(within(drawer).getByRole('button', { name: 'Fechar painel' }));
    const mobileSponsorHeading = screen.getByRole('heading', { name: 'KETTEN BEBIDAS' });
    const mobileSponsorCard = mobileSponsorHeading.closest<HTMLElement>('.financial-sponsor-card');
    expect(mobileSponsorCard).toBeInTheDocument();
    fireEvent.click(within(mobileSponsorCard!).getByRole('button', { name: 'Ver composição' }));
    drawer = screen.getByRole('dialog');
    expect(within(drawer).getByRole('heading', { name: 'KETTEN BEBIDAS' })).toBeInTheDocument();
  });

  it('mantém 20 itens no recorte móvel inicial e expande em blocos sem truncar a busca', () => {
    const { container } = renderSponsorshipExperience();

    expect(container.querySelectorAll('.financial-sponsor-card')).toHaveLength(20);
    fireEvent.click(screen.getByRole('button', { name: /Mostrar mais 20/i }));
    expect(container.querySelectorAll('.financial-sponsor-card')).toHaveLength(40);

    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar na carteira' }), {
      target: { value: 'UNIJUI' },
    });
    expect(container.querySelectorAll('.financial-sponsor-card')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /Mostrar mais 20/i })).not.toBeInTheDocument();
  });

  it('oferece foco, toque, teclado e equivalente tabular no Pareto completo', () => {
    const { container } = renderSponsorshipExperience();
    const pareto = screen.getByRole('slider', {
      name: 'Percorrer patrocinadores por concentração',
    });

    expect(pareto).toHaveAttribute('aria-valuemin', '1');
    expect(pareto).toHaveAttribute('aria-valuemax', '100');
    expect(pareto).toHaveAccessibleDescription(/Use as setas para percorrer os patrocinadores/i);
    expect(screen.getByRole('table', { name: 'Patrocinadores ordenados por valor projetado' }))
      .toBeInTheDocument();

    fireEvent.focus(pareto);
    fireEvent.keyDown(pareto, { key: 'ArrowRight' });
    expect(pareto).toHaveAttribute('aria-valuenow', '2');
    vi.spyOn(pareto, 'getBoundingClientRect').mockReturnValue({
      bottom: 100,
      height: 100,
      left: 0,
      right: 100,
      top: 0,
      width: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    });
    const dispatchPointer = (
      type: 'pointerdown' | 'pointermove' | 'pointerup',
      { clientX, clientY, pointerId = 7 }: { clientX: number; clientY: number; pointerId?: number },
    ) => {
      const event = new MouseEvent(type, { bubbles: true, clientX, clientY });
      Object.defineProperties(event, {
        pointerId: { value: pointerId },
        pointerType: { value: 'touch' },
      });
      fireEvent(pareto, event);
    };

    fireEvent.keyDown(pareto, { key: 'Home' });
    dispatchPointer('pointerdown', { clientX: 0, clientY: 50 });
    dispatchPointer('pointermove', { clientX: 100, clientY: 52 });
    dispatchPointer('pointerup', { clientX: 100, clientY: 52 });
    expect(pareto).toHaveAttribute('aria-valuenow', '100');

    fireEvent.keyDown(pareto, { key: 'Home' });
    dispatchPointer('pointerdown', { clientX: 0, clientY: 0, pointerId: 8 });
    dispatchPointer('pointermove', { clientX: 10, clientY: 90, pointerId: 8 });
    expect(pareto).toHaveAttribute('aria-valuenow', '1');
    dispatchPointer('pointerup', { clientX: 10, clientY: 90, pointerId: 8 });

    const tooltipId = pareto.getAttribute('aria-describedby')?.split(' ').at(-1);
    expect(tooltipId).toBeTruthy();
    expect(document.getElementById(tooltipId!)).toHaveAttribute('role', 'tooltip');
  });

  it('representa delta nulo como ausência de diferença', () => {
    const { container } = render(
      <SponsorshipDeltaSignal projected={500_000} consolidated={500_000} />,
    );

    const signal = container.querySelector('.fsi-delta');
    expect(signal).toHaveAttribute('data-neutral', 'true');
    expect(signal).toHaveTextContent('Sem diferença');
    expect(signal).not.toHaveTextContent(/Acima|Lacuna/i);
  });
});

describe('interações da inteligência de cenários', () => {
  beforeEach(() => {
    let frameTime = performance.now();
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frameTime += 1_000;
      callback(frameTime);
      return 1;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('mantém os três cenários visíveis e selecionáveis por mouse e teclado no radiogroup', async () => {
    await renderScenarioExperience();
    const selector = screen.getByRole('radiogroup', { name: 'Selecionar cenário financeiro' });
    const realistic = within(selector).getByRole('radio', { name: /Realista/i });
    const pessimistic = within(selector).getByRole('radio', { name: /Pessimista/i });
    const optimistic = within(selector).getByRole('radio', { name: /Otimista/i });

    expect(within(selector).getAllByRole('radio')).toHaveLength(3);
    expect(screen.getAllByRole('link')).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Investigar Patrocínios' }))
      .toHaveAttribute('href', '/comissoes/financeiro-gerencial/patrocinios');
    expect(realistic).toHaveAttribute('aria-checked', 'true');
    expect(realistic).toHaveAttribute('tabindex', '0');
    expect(pessimistic).toHaveAttribute('tabindex', '-1');

    fireEvent.keyDown(realistic, { key: 'ArrowRight' });
    expect(pessimistic).toHaveAttribute('aria-checked', 'true');
    expect(pessimistic).toHaveAttribute('tabindex', '0');
    expect(pessimistic).toHaveFocus();
    expect(screen.getByText(/Cenário Pessimista selecionado.*Déficit R\$ 436\.533,40/i))
      .toBeInTheDocument();

    fireEvent.click(optimistic);
    expect(optimistic).toHaveAttribute('aria-checked', 'true');
    expect(realistic).toHaveAttribute('aria-checked', 'false');
  });

  it('sincroniza seletor, KPIs, comparação, waterfall, contribuições e anúncio ao alternar cenário', async () => {
    const { container } = await renderScenarioExperience();
    const scenarioRoot = container.querySelector('.scenario-intelligence');
    expect(scenarioRoot).toHaveAttribute('data-selected-scenario', 'realistic');
    expect(screen.getByText('Receita total: R$ 9.205.583,26')).toBeInTheDocument();

    const realisticComparison = screen.getByRole('button', {
      name: /^Realista\. Receita total/i,
    });
    expect(realisticComparison).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('figure', { name: /Ponte financeira literal do cenário Realista/i }))
      .toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /Fontes positivas e compromissos do cenário Realista/i }))
      .toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /^Pessimista\. Receita total/i }));

    expect(scenarioRoot).toHaveAttribute('data-selected-scenario', 'pessimistic');
    expect(screen.getByRole('radio', { name: /Pessimista/i })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByLabelText('Indicadores executivos do cenário Pessimista')).toBeInTheDocument();
    expect(screen.getByText('Receita total: R$ 6.973.466,60')).toBeInTheDocument();
    expect(screen.getByText('Déficit projetado: R$ 436.533,40')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /^Pessimista\. Receita total/i }))
      .toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('figure', { name: /Ponte financeira literal do cenário Pessimista/i }))
      .toBeInTheDocument();
    expect(screen.getByRole('figure', { name: /Fontes positivas e compromissos do cenário Pessimista/i }))
      .toBeInTheDocument();
    expect(screen.getByText(/Cenário Pessimista selecionado.*Déficit R\$ 436\.533,40/i))
      .toBeInTheDocument();
  });

  it('preserva nós e altura estrutural ao atravessar capacidade e déficit', async () => {
    const { container } = await renderScenarioExperience();
    const rootBefore = container.querySelector('.scenario-intelligence');
    const workspaceBefore = container.querySelector('.scenario-intelligence__workspace');
    const kpisBefore = container.querySelector('.scenario-intelligence__kpis');
    const resultCardBefore = container.querySelector('.scenario-intelligence__kpi--result');

    expect(rootBefore).toHaveAttribute('data-scenario-motion', 'always');
    expect(kpisBefore?.querySelectorAll('article')).toHaveLength(5);
    expect(resultCardBefore).toHaveAttribute('data-financial-tone', 'consolidated');

    fireEvent.click(screen.getByRole('radio', { name: /Pessimista/i }));

    expect(container.querySelector('.scenario-intelligence')).toBe(rootBefore);
    expect(container.querySelector('.scenario-intelligence__workspace')).toBe(workspaceBefore);
    expect(container.querySelector('.scenario-intelligence__kpis')).toBe(kpisBefore);
    expect(container.querySelector('.scenario-intelligence__kpi--result')).toBe(resultCardBefore);
    expect(kpisBefore?.querySelectorAll('article')).toHaveLength(5);
    expect(resultCardBefore).toHaveAttribute('data-financial-tone', 'over-budget');
    expect(resultCardBefore).toHaveTextContent('Déficit projetado');
  });

  it('preserva a ponte completa e as reconciliações literais de centavos', async () => {
    const { container } = await renderScenarioExperience();
    const waterfall = screen.getByRole('figure', {
      name: /Ponte financeira literal do cenário Realista/i,
    });
    const expectedSteps = [
      'Receita Comercial',
      'Patrocínio Livre',
      'Patrocínio Rouanet',
      'Receita Total',
      'Execução operacional',
      'Obrigações históricas',
      'Reserva',
      'Diferença literal da fonte',
      'Capacidade de investimento',
    ];
    for (const step of expectedSteps) {
      expect(within(waterfall).getByRole('button', { name: new RegExp(`^${step}\\.`) }))
        .toBeInTheDocument();
    }

    let reconciliation = container.querySelector('.scenario-waterfall__reconciliation');
    expect(reconciliation).toHaveAttribute('data-has-difference', 'true');
    expect(reconciliation).toHaveTextContent('−R$ 0,06');

    fireEvent.click(screen.getByRole('radio', { name: /Pessimista/i }));
    reconciliation = container.querySelector('.scenario-waterfall__reconciliation');
    expect(reconciliation).toHaveAttribute('data-has-difference', 'false');
    expect(reconciliation).toHaveTextContent('R$ 0,00');

    fireEvent.click(screen.getByRole('radio', { name: /Otimista/i }));
    reconciliation = container.querySelector('.scenario-waterfall__reconciliation');
    expect(reconciliation).toHaveAttribute('data-has-difference', 'true');
    expect(reconciliation).toHaveTextContent('+R$ 0,04');
  });

  it('ativa tooltips em foco e toque mantendo o valor integral no nome acessível', async () => {
    await renderScenarioExperience();
    const comparisonTarget = screen.getByRole('button', {
      name: /^Otimista\. Receita total R\$\s10\.315\.483,26/i,
    });
    expect(comparisonTarget).not.toHaveAttribute('aria-describedby');

    fireEvent.focus(comparisonTarget);
    let tooltip = screen.getByRole('tooltip');
    expect(comparisonTarget).toHaveAttribute('aria-describedby', tooltip.id);
    expect(tooltip).toHaveTextContent('R$ 10.315.483,26');
    expect(comparisonTarget).toHaveAccessibleName(/Capacidade R\$\s2\.405\.483,30/i);

    fireEvent.blur(comparisonTarget);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    const commercialStep = screen.getByRole('button', { name: /^Receita Comercial\./i });
    fireEvent.pointerDown(commercialStep, { pointerId: 1 });
    tooltip = screen.getByRole('tooltip');
    expect(commercialStep).toHaveAttribute('aria-describedby', tooltip.id);
    expect(tooltip).toHaveTextContent('Movimento');
    expect(commercialStep).toHaveAccessibleName(/Saldo R\$\s5\.205\.583,26/i);
  });
});
