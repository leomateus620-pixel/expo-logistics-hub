import {
  type ChangeEvent,
  type ReactNode,
  useMemo,
  useState,
} from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CheckCircle2,
  ChevronDown,
  CircleDollarSign,
  Database,
  FileCheck2,
  Handshake,
  Landmark,
  Layers3,
  LineChart,
  Search,
  Sparkles,
  TrendingUp,
  UsersRound,
  WalletCards,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  getModuleRoute,
  type CommissionModule,
} from '@/modules/commissions/commissionRegistry';
import { sponsors } from '../data/financial2026Data';
import {
  selectSponsorshipIntelligence,
  type SponsorshipPortfolioItem,
} from '../selectors/financialSelectors';
import type { Sponsor, SponsorTier } from '../types';
import {
  formatBRL,
} from '../utils/financialFormatters';
import {
  FinancialKpiCard,
  FinancialKpiGrid,
  FinancialStatePanel,
} from './FinancialPrimitives';
import {
  SponsorDetailSheet,
  SponsorLedger,
} from './FinancialTables';
import {
  SponsorshipConcentrationBand,
  SponsorshipConsolidationRail,
  SponsorshipDeltaSignal,
  SponsorshipParetoChart,
  SponsorshipResourceComposition,
  SponsorshipTierRanking,
  type SponsorshipParetoDatum,
  type SponsorshipResourceDatum,
  type SponsorshipTierDatum,
} from './SponsorshipIntelligenceCharts';
import '@/styles/financial-sponsorship-intelligence.css';

const normalizeSearch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('pt-BR')
  .trim();

type SponsorFinancialFilter =
  | 'all'
  | 'with-value'
  | 'consolidated'
  | 'partial'
  | 'receivable'
  | 'unreported';

type SponsorResourceFilter = 'all' | 'free-resource' | 'rouanet' | 'unreported';
type SponsorSort = 'source' | 'name' | 'projected' | 'consolidated';

function sponsorMatchesFinancialFilter(
  portfolioItem: SponsorshipPortfolioItem,
  filter: SponsorFinancialFilter,
) {
  if (filter === 'all') return true;
  if (filter === 'with-value') return portfolioItem.flags.hasFinancialValue;
  if (filter === 'receivable') {
    return portfolioItem.flags.hasExplicitReceivable || portfolioItem.flags.hasReceivableNote;
  }
  if (filter === 'unreported') return !portfolioItem.flags.hasFinancialValue;
  if (filter === 'consolidated') {
    return portfolioItem.flags.hasProjectedValue
      && portfolioItem.consolidatedAmount >= portfolioItem.projectedAmount;
  }
  return portfolioItem.projectedAmount > 0
    && portfolioItem.consolidatedAmount > 0
    && portfolioItem.consolidatedAmount < portfolioItem.projectedAmount;
}

function sponsorMatchesResource(sponsor: Sponsor, filter: SponsorResourceFilter) {
  const hasFreeResource = sponsor.projectedFreeResource !== 0
    || sponsor.consolidatedFreeResource !== 0;
  const hasRouanet = sponsor.projectedRouanet !== 0
    || sponsor.consolidatedRouanet !== 0;
  if (filter === 'all') return true;
  if (filter === 'free-resource') return hasFreeResource;
  if (filter === 'rouanet') return hasRouanet;
  return !hasFreeResource && !hasRouanet;
}

function SponsorshipPanel({
  title,
  description,
  icon: Icon,
  action,
  children,
  className,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('fsi-panel', className)}>
      <header className="fsi-panel__header">
        <span className="fsi-panel__icon" aria-hidden="true"><Icon /></span>
        <div className="fsi-panel__copy">
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        {action && <div className="fsi-panel__action">{action}</div>}
      </header>
      <div className="fsi-panel__body">{children}</div>
    </section>
  );
}

function SelectControl({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="fsi-control fsi-control--select">
      <span>{label}</span>
      <span className="fsi-control__field">
        <select value={value} onChange={(event) => onChange(event.target.value)}>{children}</select>
        <ChevronDown aria-hidden="true" />
      </span>
    </label>
  );
}

function SearchControl({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="fsi-control fsi-control--search">
      <span>Buscar na carteira</span>
      <span className="fsi-control__field">
        <Search aria-hidden="true" />
        <input
          value={value}
          onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
          placeholder="Patrocinador, categoria ou contrapartida"
          type="search"
        />
      </span>
    </label>
  );
}

export function SponsorshipIntelligenceView({ module }: { module: CommissionModule }) {
  const intelligence = useMemo(() => selectSponsorshipIntelligence(sponsors), []);
  const [selectedTier, setSelectedTier] = useState<SponsorTier | null>(null);
  const [selectedSponsorId, setSelectedSponsorId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [financialFilter, setFinancialFilter] = useState<SponsorFinancialFilter>('all');
  const [resourceFilter, setResourceFilter] = useState<SponsorResourceFilter>('all');
  const [sort, setSort] = useState<SponsorSort>('source');
  const [mobileVisibleCount, setMobileVisibleCount] = useState(20);

  const portfolioBySponsor = useMemo(
    () => new Map(intelligence.portfolio.map((item) => [item.sponsor.id, item])),
    [intelligence.portfolio],
  );
  const selectedSponsor = selectedSponsorId
    ? sponsors.find((sponsor) => sponsor.id === selectedSponsorId) ?? null
    : null;
  const selectedTierSummary = selectedTier
    ? intelligence.tiers.find((tier) => tier.tier === selectedTier) ?? null
    : null;

  const tierData: SponsorshipTierDatum[] = useMemo(
    () => intelligence.tiers
      .map((tier) => ({
        tier: tier.tier,
        sponsorCount: tier.sponsorCount,
        financialSponsorCount: tier.financialSponsorCount,
        projectedAmount: tier.totalProjectedAmount,
        consolidatedAmount: tier.totalConsolidatedAmount,
        projectedSharePercentage: tier.projectedSharePercentage,
      }))
      .sort((left, right) => right.projectedAmount - left.projectedAmount),
    [intelligence.tiers],
  );

  const paretoData: SponsorshipParetoDatum[] = useMemo(
    () => intelligence.portfolio.map((item) => ({
      id: item.sponsor.id,
      name: item.sponsor.name,
      tier: item.sponsor.tier,
      sourceRow: item.sponsor.sourceRow,
      projectedAmount: item.projectedAmount,
      consolidatedAmount: item.consolidatedAmount,
      sharePercentage: item.sharePercentage,
      cumulativeSharePercentage: item.cumulativeSharePercentage,
    })),
    [intelligence.portfolio],
  );

  const resourceData: SponsorshipResourceDatum[] = useMemo(() => [
    intelligence.resourceComposition.freeResource,
    intelligence.resourceComposition.rouanet,
  ].map((resource) => ({
    id: resource.key,
    label: resource.label,
    projectedAmount: resource.projectedAmount,
    consolidatedAmount: resource.consolidatedAmount,
    consolidationRate: resource.consolidationRate,
  })), [intelligence.resourceComposition]);

  const filteredSponsors = useMemo(() => {
    const normalizedSearch = normalizeSearch(search);
    const matching = sponsors.filter((sponsor) => {
      const portfolioItem = portfolioBySponsor.get(sponsor.id);
      if (!portfolioItem) return false;
      if (selectedTier && sponsor.tier !== selectedTier) return false;
      if (!sponsorMatchesFinancialFilter(portfolioItem, financialFilter)) return false;
      if (!sponsorMatchesResource(sponsor, resourceFilter)) return false;
      if (!normalizedSearch) return true;

      return normalizeSearch([
        sponsor.name,
        sponsor.tier,
        sponsor.receivableNote,
        sponsor.inKindContribution,
        sponsor.sourceQualityFlag?.cell,
      ].filter((value) => value !== undefined).join(' ')).includes(normalizedSearch);
    });

    return [...matching].sort((left, right) => {
      const leftPortfolio = portfolioBySponsor.get(left.id);
      const rightPortfolio = portfolioBySponsor.get(right.id);
      if (sort === 'name') return left.name.localeCompare(right.name, 'pt-BR');
      if (sort === 'projected') {
        return (rightPortfolio?.projectedAmount ?? 0) - (leftPortfolio?.projectedAmount ?? 0)
          || left.sourceRow - right.sourceRow;
      }
      if (sort === 'consolidated') {
        return (rightPortfolio?.consolidatedAmount ?? 0) - (leftPortfolio?.consolidatedAmount ?? 0)
          || left.sourceRow - right.sourceRow;
      }
      return left.sourceRow - right.sourceRow;
    });
  }, [financialFilter, portfolioBySponsor, resourceFilter, search, selectedTier, sort]);

  const hasFilters = Boolean(
    search || selectedTier || financialFilter !== 'all' || resourceFilter !== 'all',
  );
  const clearFilters = () => {
    setSearch('');
    setSelectedTier(null);
    setFinancialFilter('all');
    setResourceFilter('all');
    setSort('source');
    setMobileVisibleCount(20);
  };
  const handleTierSelection = (tier: SponsorTier | null) => {
    setSelectedTier(tier);
    setMobileVisibleCount(20);
  };

  const totals = intelligence.totals;

  return (
    <div className="fsi financial-view-stack" data-financial-view="patrocinios">
      <FinancialKpiGrid
        columns={4}
        className="fsi-kpis financial-kpi-grid--decision"
        aria-label="Posição global da carteira de patrocínios"
      >
        <FinancialKpiCard
          label="Patrocínio projetado"
          value={totals.totalProjectedAmount}
          status="projected"
          showStatus={false}
          icon={TrendingUp}
          tone="projected"
          priority="primary"
          animateValue
          detail={`${totals.sponsorCount} registros · ${totals.financialSponsorCount} com valor`}
        />
        <FinancialKpiCard
          label="Patrocínio consolidado"
          value={totals.totalConsolidatedAmount}
          status="consolidated"
          showStatus={false}
          icon={CheckCircle2}
          tone="consolidated"
          priority="primary"
          animateValue
          detail={<SponsorshipDeltaSignal projected={totals.totalProjectedAmount} consolidated={totals.totalConsolidatedAmount} />}
        />
        <FinancialKpiCard
          label="A receber informado"
          value={totals.explicitReceivableAmount}
          status="receivable"
          showStatus={false}
          icon={CircleDollarSign}
          tone="receivable"
          priority="primary"
          animateValue
          detail="Campo explícito · não é a lacuna"
        />
        <FinancialKpiCard
          label="Taxa de consolidação"
          value={totals.consolidationRate}
          valueKind="percentage"
          icon={BadgeCheck}
          tone="neutral"
          priority="primary"
          animateValue
          detail={`${formatBRL(totals.consolidationGapAmount)} de lacuna`}
        />
      </FinancialKpiGrid>

      <div className="fsi-overview-grid">
        <SponsorshipPanel
          title="Consolidação da carteira"
          description="Projetado e consolidado comparados na mesma base financeira."
          icon={LineChart}
          className="fsi-panel--consolidation"
        >
          <SponsorshipConsolidationRail
            projectedAmount={totals.totalProjectedAmount}
            consolidatedAmount={totals.totalConsolidatedAmount}
            receivableAmount={totals.explicitReceivableAmount}
            consolidationGapAmount={totals.consolidationGapAmount}
            consolidationRate={totals.consolidationRate}
          />
        </SponsorshipPanel>
        <SponsorshipPanel
          title="Composição por recurso"
          description="Livre e Rouanet comparados na mesma escala, entre projetado e consolidado."
          icon={WalletCards}
          className="fsi-panel--resources"
        >
          <SponsorshipResourceComposition resources={resourceData} />
        </SponsorshipPanel>
      </div>

      <SponsorshipPanel
        title="Categorias e capital"
        description="Ranking dual por categoria explícita, sem inferências pelo nome ou credenciais."
        icon={Layers3}
        className="fsi-panel--tiers"
      >
        <SponsorshipTierRanking
          tiers={tierData}
          selectedTier={selectedTier}
          onSelectTier={handleTierSelection}
        />
        {selectedTierSummary && (
          <div className="fsi-selection-summary" role="status" aria-live="polite">
            <span className="fsi-selection-summary__icon" aria-hidden="true"><Sparkles /></span>
            <div>
              <small>Recorte ativo</small>
              <strong>{selectedTierSummary.tier}</strong>
            </div>
            <dl>
              <div><dt>Projetado</dt><dd>{formatBRL(selectedTierSummary.totalProjectedAmount)}</dd></div>
              <div><dt>Consolidado</dt><dd>{formatBRL(selectedTierSummary.totalConsolidatedAmount)}</dd></div>
              <div><dt>Registros</dt><dd>{selectedTierSummary.sponsorCount}</dd></div>
            </dl>
            <button type="button" className="fsi-text-action" onClick={() => handleTierSelection(null)}>
              Limpar seleção
            </button>
          </div>
        )}
      </SponsorshipPanel>

      <SponsorshipPanel
        title="Concentração dos 100 patrocinadores"
        description="Leitura Pareto completa, da maior projeção à cauda sem valor financeiro."
        icon={BarChart3}
        className="fsi-panel--pareto"
      >
        <SponsorshipParetoChart
          points={paretoData}
          selectedTier={selectedTier}
          onSelectSponsor={setSelectedSponsorId}
        />
        <SponsorshipConcentrationBand
          top5Share={intelligence.concentration.top5SharePercentage}
          top10Share={intelligence.concentration.top10SharePercentage}
          top20Share={intelligence.concentration.top20SharePercentage}
          sponsorCount={totals.sponsorCount}
        />
      </SponsorshipPanel>

      <section className="fsi-operations" aria-label="Indicadores operacionais da carteira">
        <div className="fsi-operations__heading">
          <span aria-hidden="true"><UsersRound /></span>
          <div><strong>Alcance operacional</strong><small>Credenciais e contrapartidas preservadas</small></div>
        </div>
        <dl>
          <div><dt>Credenciais de veículos</dt><dd>{totals.vehicleCredentials}</dd></div>
          <div><dt>Credenciais Soy Summit</dt><dd>{totals.soySummitCredentials}</dd></div>
          <div><dt>Contrapartidas registradas</dt><dd>{totals.inKindContributionCount}</dd></div>
          <div><dt>Patrocinadores com valor</dt><dd>{totals.financialSponsorCount}</dd></div>
        </dl>
        <nav className="fsi-operations__links" aria-label="Investigar patrocínios nas receitas">
          <Link to={getModuleRoute(module, 'receitas-projetadas')}>Receitas projetadas <ArrowRight aria-hidden="true" /></Link>
          <Link to={getModuleRoute(module, 'receitas-confirmadas')}>Receitas confirmadas <ArrowRight aria-hidden="true" /></Link>
        </nav>
      </section>

      <SponsorshipPanel
        title="Carteira de patrocínios"
        description="Base completa na ordem da planilha, com filtros sincronizados ao recorte de categoria."
        icon={Handshake}
        className="fsi-panel--ledger"
        action={(
          <span className="fsi-result-count" role="status" aria-live="polite">
            <strong>{filteredSponsors.length}</strong> de {sponsors.length}
          </span>
        )}
      >
        <div className="fsi-filter-bar" aria-label="Filtros da carteira de patrocínios">
          <SearchControl
            value={search}
            onChange={(value) => {
              setSearch(value);
              setMobileVisibleCount(20);
            }}
          />
          <SelectControl label="Categoria" value={selectedTier ?? 'all'} onChange={(value) => handleTierSelection(value === 'all' ? null : value as SponsorTier)}>
            <option value="all">Todas as categorias</option>
            {intelligence.tiers.map((tier) => <option key={tier.tier} value={tier.tier}>{tier.tier}</option>)}
          </SelectControl>
          <SelectControl label="Situação" value={financialFilter} onChange={(value) => {
            setFinancialFilter(value as SponsorFinancialFilter);
            setMobileVisibleCount(20);
          }}>
            <option value="all">Todas as situações</option>
            <option value="with-value">Com valor financeiro</option>
            <option value="consolidated">Consolidado na projeção</option>
            <option value="partial">Consolidação parcial</option>
            <option value="receivable">A receber / situação informada</option>
            <option value="unreported">Sem valor financeiro</option>
          </SelectControl>
          <SelectControl label="Recurso" value={resourceFilter} onChange={(value) => {
            setResourceFilter(value as SponsorResourceFilter);
            setMobileVisibleCount(20);
          }}>
            <option value="all">Todos os recursos</option>
            <option value="free-resource">Recurso Livre</option>
            <option value="rouanet">Lei Rouanet</option>
            <option value="unreported">Não informado</option>
          </SelectControl>
          <SelectControl label="Ordenar" value={sort} onChange={(value) => setSort(value as SponsorSort)}>
            <option value="source">Ordem da planilha</option>
            <option value="name">Nome A–Z</option>
            <option value="projected">Maior projetado</option>
            <option value="consolidated">Maior consolidado</option>
          </SelectControl>
          {hasFilters && filteredSponsors.length > 0 && (
            <button type="button" className="fsi-filter-bar__clear" onClick={clearFilters}>
              Limpar filtros
            </button>
          )}
        </div>

        {filteredSponsors.length > 0 ? (
          <>
            <SponsorLedger
              sponsors={filteredSponsors}
              selectedSponsorId={selectedSponsorId}
              onSelectSponsor={(sponsor) => setSelectedSponsorId(sponsor.id)}
              mobileVisibleCount={mobileVisibleCount}
              emptyFromSearch={hasFilters}
            />
            {filteredSponsors.length > mobileVisibleCount && (
              <button
                type="button"
                className="fsi-load-more financial-mobile-only"
                aria-label={`Mostrar mais 20 patrocinadores. ${mobileVisibleCount} de ${filteredSponsors.length} visíveis.`}
                onClick={() => setMobileVisibleCount((count) => Math.min(count + 20, filteredSponsors.length))}
              >
                Mostrar mais 20
                <span>{mobileVisibleCount} de {filteredSponsors.length} visíveis</span>
              </button>
            )}
          </>
        ) : (
          <FinancialStatePanel
            state="no-results"
            action={<button type="button" className="fsi-button" onClick={clearFilters}>Limpar filtros</button>}
          />
        )}
      </SponsorshipPanel>

      <details className="fsi-methodology">
        <summary>
          <span className="fsi-methodology__icon" aria-hidden="true"><Database /></span>
          <span><strong>Metodologia e qualidade da fonte</strong><small>Regras de leitura, preservação e anomalias</small></span>
          <ChevronDown aria-hidden="true" />
        </summary>
        <div className="fsi-methodology__body">
          <article>
            <FileCheck2 aria-hidden="true" />
            <div><strong>Base somente leitura</strong><p>Valores derivados da planilha oficial de referência; a consulta não altera a fonte.</p></div>
          </article>
          <article>
            <CircleDollarSign aria-hidden="true" />
            <div><strong>A Receber é independente</strong><p>{formatBRL(totals.explicitReceivableAmount)} é o campo informado. Não corresponde à lacuna de {formatBRL(totals.consolidationGapAmount)}.</p></div>
          </article>
          <article>
            <Layers3 aria-hidden="true" />
            <div><strong>Categorias explícitas</strong><p>Soy Summit só é categoria quando existe marcação própria; nomes e credenciais nunca reclassificam patrocinadores.</p></div>
          </article>
          <article>
            <Landmark aria-hidden="true" />
            <div><strong>Textos e anomalias preservados</strong><p>Marcações como “pago” permanecem texto. A ocorrência Q75 é exibida no detalhe e não contabilizada como contrapartida.</p></div>
          </article>
        </div>
      </details>

      <SponsorDetailSheet
        sponsor={selectedSponsor}
        onOpenChange={(open) => !open && setSelectedSponsorId(null)}
      />
    </div>
  );
}
