import { Fragment, memo, useEffect, useId, useMemo, useState } from 'react';
import { ChevronDown, Pencil, Search, SlidersHorizontal, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatBRL } from '../utils/financialFormatters';
import { FUNDING_TYPE_LABELS, REVENUE_STATUS_LABELS, type FinancialRevenue } from './financialOperationalApi';
import { Financial2028State } from './Financial2028Presentation';
import { FinancialComparisonHelp } from './FinancialComparisonPrimitives';

type RevenueSelection = 'active' | 'all' | FinancialRevenue['status'];
const STATUS_OPTIONS: Record<RevenueSelection, string> = { active: 'Ativas', all: 'Todas as situações', ...REVENUE_STATUS_LABELS };
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

function DateValue({ value }: { value: string | null }) {
  if (!value) return <>Não informado</>;
  const [year, month, day] = value.slice(0, 10).split('-');
  return <time dateTime={value}>{`${day}/${month}/${year}`}</time>;
}

function Money({ value }: { value: number | null }) {
  return value == null ? <span className="f28-revenue-records__unavailable">Não informado</span> : <span data-negative={value < 0 || undefined}>{formatBRL(value / 100)}</span>;
}

/** Local filters affect these loaded manual records, never the edition summary or composition. */
export const FinancialRevenueRecords = memo(function FinancialRevenueRecords({ data, focus, canEdit, canConfirm, onEdit }: {
  data: readonly FinancialRevenue[]; focus: 'projetada' | 'confirmada'; canEdit: boolean; canConfirm: boolean; onEdit: (row: FinancialRevenue) => void;
}) {
  const [search, setSearch] = useState('');
  const [funding, setFunding] = useState('all');
  const [status, setStatus] = useState<RevenueSelection>(focus === 'confirmada' ? 'confirmada' : 'active');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const id = useId();
  useEffect(() => { setStatus(focus === 'confirmada' ? 'confirmada' : 'active'); }, [focus]);
  const visible = useMemo(() => data.filter((row) =>
    (funding === 'all' || row.funding_type === funding)
    && (status === 'all' || (status === 'active' ? row.status !== 'cancelada' : row.status === status))
    && normalize([row.description, row.counterparty, row.responsible_name].filter(Boolean).join(' ')).includes(normalize(search.trim()))
  ), [data, funding, status, search]);
  const clear = () => { setSearch(''); setFunding('all'); setStatus(focus === 'confirmada' ? 'confirmada' : 'active'); };
  const toggle = (rowId: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(rowId)) next.delete(rowId); else next.add(rowId);
    return next;
  });
  const filterCount = Number(funding !== 'all') + Number(status !== 'all');
  const searchChanged = Boolean(search.trim()) || funding !== 'all' || status !== (focus === 'confirmada' ? 'confirmada' : 'active');

  return <div className="f28-revenue-records">
    <div className="f28-revenue-records__filter-heading"><h3>Consultar registros</h3><FinancialComparisonHelp label="Ajuda sobre os filtros das receitas manuais"><strong>Filtros da lista</strong><p>Os filtros alteram somente as receitas manuais carregadas. O resumo da edição, o ranking por origem e Rouanet permanecem independentes da busca e destes filtros.</p></FinancialComparisonHelp></div>
    <div className="f28-revenue-records__filters" aria-label="Filtros das receitas manuais carregadas">
      <label className="f28-revenue-records__search" htmlFor={`${id}-search`}><span>Pesquisar receitas</span><div><Search aria-hidden="true" /><input id={`${id}-search`} type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Descrição, contraparte ou responsável" /></div></label>
      <Button type="button" variant="outline" className="f28-revenue-records__filter-toggle" aria-expanded={filtersOpen} aria-controls={`${id}-filters`} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal aria-hidden="true" />Filtros{filterCount > 0 ? <span>{filterCount}</span> : null}</Button>
      <div id={`${id}-filters`} className="f28-revenue-records__selects" data-expanded={filtersOpen || undefined}>
        <label htmlFor={`${id}-funding`}><span>Origem do recurso</span><select id={`${id}-funding`} value={funding} onChange={(event) => setFunding(event.target.value)}><option value="all">Todas as origens</option>{Object.entries(FUNDING_TYPE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label htmlFor={`${id}-status`}><span>Situação</span><select id={`${id}-status`} value={status} onChange={(event) => setStatus(event.target.value as RevenueSelection)}>{Object.entries(STATUS_OPTIONS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      </div>
    </div>
    <div className="f28-revenue-records__filter-summary">
      <p role="status"><strong>{visible.length}</strong> de {data.length} receita{data.length === 1 ? '' : 's'} carregada{data.length === 1 ? '' : 's'}</p>
      <div className="f28-revenue-records__chips" aria-label="Filtros ativos">
        {search.trim() ? <button type="button" onClick={() => setSearch('')} aria-label={`Remover busca ${search}`}><span>Busca: {search}</span><X aria-hidden="true" /></button> : null}
        {funding !== 'all' ? <button type="button" onClick={() => setFunding('all')} aria-label="Remover filtro de origem"><span>{FUNDING_TYPE_LABELS[funding as FinancialRevenue['funding_type']]}</span><X aria-hidden="true" /></button> : null}
        {status !== 'all' ? <button type="button" onClick={() => setStatus('all')} aria-label="Remover filtro de situação"><span>{STATUS_OPTIONS[status]}</span><X aria-hidden="true" /></button> : null}
        {searchChanged ? <Button type="button" variant="ghost" onClick={clear}>Limpar filtros</Button> : null}
      </div>
    </div>
    {!canEdit && !canConfirm ? <p className="f28-revenue-records__read-only">Consulta financeira · seu acesso permite visualizar os registros.</p> : null}
    {data.length === 0 ? <Financial2028State tone="info" title="Primeiras receitas de 2028">Cadastre a descrição, origem e valores para iniciar o acompanhamento.</Financial2028State> : visible.length === 0 ? <Financial2028State tone="info" title={status === 'confirmada' && !search && funding === 'all' ? 'Nenhuma receita confirmada nesta visão' : 'Nenhuma receita corresponde aos filtros'}>Ajuste os filtros para consultar os registros carregados.</Financial2028State> : <div className="f28-revenue-records__table-shell" role="region" aria-label="Lista de receitas manuais" tabIndex={0}>
      <table className="f28-revenue-records__table"><caption className="sr-only">Receitas manuais carregadas de 2028. Confirmação e recebimento são etapas independentes.</caption>
        <thead><tr><th scope="col">Receita / contraparte</th><th scope="col">Origem do recurso</th><th scope="col">Situação</th><th scope="col" className="f28-revenue-records__money">Projetado</th><th scope="col" className="f28-revenue-records__money">Confirmado</th><th scope="col">Ações</th></tr></thead>
        <tbody>{visible.map((row) => <Fragment key={row.id}>
          <tr className="f28-revenue-records__row">
            <th scope="row"><strong>{row.description}</strong><small>{row.counterparty || 'Contraparte não informada'}</small></th>
            <td className="f28-revenue-records__origin">{FUNDING_TYPE_LABELS[row.funding_type]}</td>
            <td className="f28-revenue-records__status-cell"><span className="f28-revenue-records__status" data-status={row.status}>{REVENUE_STATUS_LABELS[row.status]}</span></td>
            <td className="f28-revenue-records__money" data-priority={focus === 'projetada' || undefined}><span className="f28-revenue-records__mobile-label">Projetado</span><Money value={row.projected_cents} /></td>
            <td className="f28-revenue-records__money" data-priority={focus === 'confirmada' || undefined}><span className="f28-revenue-records__mobile-label">Confirmado</span><Money value={row.confirmed_cents} /></td>
            <td className="f28-revenue-records__actions"><Button type="button" variant="ghost" aria-expanded={expanded.has(row.id)} aria-controls={`${id}-details-${row.id}`} aria-label={`${expanded.has(row.id) ? 'Recolher' : 'Ver'} detalhes de ${row.description}`} onClick={() => toggle(row.id)}>Detalhes<ChevronDown aria-hidden="true" className={expanded.has(row.id) ? 'is-open' : ''} /></Button>{(row.status === 'confirmada' ? canConfirm : canEdit) ? <Button type="button" variant="outline" aria-label={`Editar ${row.description}`} onClick={() => onEdit(row)}><Pencil aria-hidden="true" /><span>Editar</span></Button> : null}</td>
          </tr>
          {expanded.has(row.id) ? <tr className="f28-revenue-records__expanded"><td colSpan={6}><div id={`${id}-details-${row.id}`} className="f28-revenue-records__details"><dl><div><dt>Responsável</dt><dd>{row.responsible_name || 'Não informado'}</dd></div><div><dt>Competência</dt><dd><DateValue value={row.competence_date} /></dd></div><div><dt>Vencimento</dt><dd><DateValue value={row.due_date} /></dd></div></dl>{row.notes ? <p><strong>Observações</strong> {row.notes}</p> : null}<p>Confirmado indica compromisso comercial. Recebimento e saldo por registro não são fornecidos nesta consulta.</p></div></td></tr> : null}
        </Fragment>)}</tbody>
      </table>
    </div>}
  </div>;
});
