import { useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  Clock3,
  DatabaseZap,
  Flag,
  History,
  RefreshCw,
  Sparkles,
  UserRoundX,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { CronogramaEvent } from '../types';
import { getTodayKey } from '@/lib/cronograma-timeline';
import EventVolumePanel from './EventVolumePanel';
import type {
  ActivityDetail,
  CronogramaDashboardModel,
  DashboardDrilldown,
  DashboardKpi,
  DashboardLogStatus,
} from '@/lib/cronograma-dashboard-selectors';
import '@/styles/cronograma-dashboard.css';

interface CronogramaDashboardBoardProps {
  model: CronogramaDashboardModel;
  logStatus: DashboardLogStatus;
  isFallback: boolean;
  onOpenEvent: (event: CronogramaEvent) => void;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
  onRetryActivity?: () => void;
}

const kpiIcons = [BarChart3, AlertTriangle, CalendarDays, UserRoundX, CalendarClock];

const priorityLabels: Record<CronogramaEvent['priority'], string> = {
  low: 'Baixa',
  medium: 'Média',
  high: 'Alta',
  critical: 'Crítica',
};

const statusLabels: Record<CronogramaEvent['status'], string> = {
  planned: 'Planejado',
  confirmed: 'Confirmado',
  in_definition: 'Em definição',
  in_progress: 'Em andamento',
  blocked: 'Bloqueado',
  completed: 'Concluído',
  overdue: 'Atrasado',
  cancelled: 'Cancelado',
  rescheduled: 'Reprogramado',
  undated: 'Sem data',
};

function formatDate(date: string | null | undefined) {
  if (!date) return 'A definir';
  const [year, month, day] = date.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

function formatDateTime(date: string | null | undefined) {
  if (!date) return 'Sem registro';
  const value = new Date(date);
  if (Number.isNaN(value.getTime())) return 'Sem registro';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(value);
}

function daysLabel(days: number | null) {
  if (days === null) return 'Prazo indisponível';
  if (days === 0) return 'Prazo hoje';
  if (days < 0) return `${Math.abs(days)}d em atraso`;
  return `${days}d restantes`;
}

function DashboardSectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="cronograma-dashboard-section-header">
      <div className="min-w-0">
        <p className="cronograma-dashboard-eyebrow">{eyebrow}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}

function EmptyDashboardPanel({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="cronograma-dashboard-empty" role="status">
      <CircleHelp aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}

function ExecutiveKpis({
  model,
  onDrilldown,
}: {
  model: CronogramaDashboardModel;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}) {
  const kpis: DashboardKpi[] = [
    model.kpis.progress,
    model.kpis.overdue,
    model.kpis.next30Days,
    model.kpis.missingResponsible,
    model.kpis.undated,
  ];

  return (
    <section className="cronograma-kpi-strip" aria-label="Indicadores executivos">
      {kpis.map((kpi, index) => {
        const Icon = kpiIcons[index];
        return (
          <button
            key={kpi.label}
            type="button"
            className="cronograma-kpi"
            data-tone={kpi.tone}
            onClick={() => kpi.drilldown && onDrilldown(kpi.drilldown)}
            disabled={!kpi.drilldown}
            aria-label={`${kpi.label}: ${kpi.value === null ? 'indisponível' : `${kpi.value}${kpi.suffix ?? ''}`}. ${kpi.context}. Abrir eventos representados.`}
          >
            <span className="cronograma-kpi-icon"><Icon aria-hidden="true" /></span>
            <span className="cronograma-kpi-value">
              {kpi.value === null ? '—' : kpi.value.toLocaleString('pt-BR')}
              {kpi.value !== null && kpi.suffix}
            </span>
            <span className="cronograma-kpi-label">{kpi.label}</span>
            <span className="cronograma-kpi-context">{kpi.context}</span>
            <ChevronRight className="cronograma-kpi-arrow" aria-hidden="true" />
          </button>
        );
      })}
    </section>
  );
}




function MajorEventProgress({
  model,
  onOpenEvent,
}: {
  model: CronogramaDashboardModel;
  onOpenEvent: (event: CronogramaEvent) => void;
}) {
  return (
    <section className="cronograma-dashboard-panel cronograma-major-events">
      <DashboardSectionHeader
        eyebrow="Entregas institucionais"
        title="Progresso dos grandes eventos"
        description="Avanço dos subeventos operacionais, sem itens cancelados no denominador."
      />
      {model.majorEvents.length === 0 ? (
        <EmptyDashboardPanel
          title="Sem eventos principais no recorte"
          description="Os eventos com subeventos ou prioridade elevada aparecerão aqui."
        />
      ) : (
        <div className="cronograma-major-list">
          {model.majorEvents.slice(0, 7).map((item) => (
            <button key={item.event.id} type="button" onClick={() => onOpenEvent(item.event)}>
              <header>
                <div>
                  <strong>{item.event.title}</strong>
                  <span>{item.event.commission || 'Sem comissão'} · {formatDate(item.deadline)}</span>
                </div>
                <b data-risk={item.risk}>
                  {item.progressPercentage === null ? '—' : `${item.progressPercentage}%`}
                </b>
              </header>
              <div
                className="cronograma-major-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={item.progressPercentage ?? undefined}
                aria-label={`${item.event.title}: ${item.completedSubevents} de ${item.totalSubevents} subeventos concluídos`}
              >
                <span style={{ width: `${item.progressPercentage ?? 0}%` }} />
              </div>
              <footer>
                <span>{item.completedSubevents}/{item.totalSubevents} subeventos</span>
                <span>{item.overdueSubevents} atrasados</span>
                <span>Responsável: {item.event.owner || 'não definido'}</span>
              </footer>
              {item.nextSubevent && <small>Próximo: {item.nextSubevent}</small>}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function AttentionEvents({
  model,
  onOpenEvent,
  onDrilldown,
}: {
  model: CronogramaDashboardModel;
  onOpenEvent: (event: CronogramaEvent) => void;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}) {
  const items = model.attentionEvents.slice(0, 8);
  const allDrilldown: DashboardDrilldown = {
    view: 'timeline',
    label: 'Eventos que exigem atenção',
    eventIds: model.attentionEvents.map(({ event }) => event.id),
  };

  return (
    <section className="cronograma-dashboard-panel cronograma-attention-panel">
      <DashboardSectionHeader
        eyebrow="Controle de exceções"
        title="Eventos que exigem atenção"
        description="Atrasos, bloqueios e riscos críticos priorizados por urgência."
        action={model.attentionEvents.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onDrilldown(allDrilldown)}>
            Ver todos <ArrowRight aria-hidden="true" />
          </Button>
        ) : undefined}
      />
      {items.length === 0 ? (
        <EmptyDashboardPanel
          title="Nenhuma exceção crítica"
          description="O recorte atual não contém eventos atrasados, bloqueados ou críticos."
        />
      ) : (
        <>
          <div className="cronograma-attention-table-wrap">
            <table className="cronograma-attention-table">
              <thead>
                <tr>
                  <th>Evento</th>
                  <th>Prazo</th>
                  <th>Urgência</th>
                  <th>Prioridade</th>
                  <th>Responsável</th>
                  <th>Comissão</th>
                  <th>Status</th>
                  <th><span className="sr-only">Ação</span></th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr key={item.event.id}>
                    <td><strong>{item.event.title}</strong><small>{item.reasons.join(' · ')}</small></td>
                    <td>{formatDate(item.deadline)}</td>
                    <td><span data-severity={item.severity}>{daysLabel(item.days)}</span></td>
                    <td>{priorityLabels[item.event.priority]}</td>
                    <td>{item.event.owner || 'Não definido'}</td>
                    <td>{item.event.commission || 'Não definida'}</td>
                    <td>{statusLabels[item.event.status]}</td>
                    <td>
                      <Button type="button" variant="ghost" size="sm" onClick={() => onOpenEvent(item.event)}>
                        Abrir
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="cronograma-attention-cards">
            {items.map((item) => (
              <button key={item.event.id} type="button" onClick={() => onOpenEvent(item.event)}>
                <header>
                  <strong>{item.event.title}</strong>
                  <span data-severity={item.severity}>{daysLabel(item.days)}</span>
                </header>
                <p>{formatDate(item.deadline)} · {statusLabels[item.event.status]}</p>
                <p>{item.event.owner || 'Sem responsável'} · {item.event.commission || 'Sem comissão'}</p>
                <small>{item.reasons.join(' · ')}</small>
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function readChartLabel(value: unknown) {
  if (!value || typeof value !== 'object') return null;
  const label = (value as { activeLabel?: unknown }).activeLabel;
  return typeof label === 'string' ? label : null;
}

function ActivityAndReprogramming({
  model,
  logStatus,
  onOpenEvent,
  onRetryActivity,
}: {
  model: CronogramaDashboardModel;
  logStatus: DashboardLogStatus;
  onOpenEvent: (event: CronogramaEvent) => void;
  onRetryActivity?: () => void;
}) {
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const detail = selectedMonth
    ? model.activity.byMonth[selectedMonth] ?? model.activity.overall
    : model.activity.overall;
  const isAvailable = ['ready', 'partial', 'empty'].includes(logStatus);

  return (
    <section className="cronograma-dashboard-panel cronograma-activity-panel">
      <DashboardSectionHeader
        eyebrow="Governança de execução"
        title="Alterações e reprogramações"
        description="Traduz o histórico de auditoria em sinais gerenciais legíveis."
      />
      {!isAvailable ? (
        <ActivityUnavailableState status={logStatus} onRetry={onRetryActivity} />
      ) : model.activity.series.length === 0 ? (
        <EmptyDashboardPanel
          title="Sem alterações no histórico"
          description="Nenhuma edição elegível foi registrada para os eventos deste recorte."
        />
      ) : (
        <>
          {logStatus === 'partial' && (
            <div className="cronograma-dashboard-inline-alert">
              <AlertTriangle aria-hidden="true" />
              O histórico atingiu o limite seguro de leitura. Os rankings abaixo são parciais.
            </div>
          )}
          <div className="cronograma-activity-layout">
            <div>
              <p className="sr-only">
                Atividade mensal com edições, mudanças de data, responsável, status e comissão.
              </p>
              <div
                className="cronograma-activity-chart"
                role="img"
                aria-label="Gráfico mensal de alterações no cronograma"
              >
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={model.activity.series}
                    margin={{ top: 10, right: 8, left: -24, bottom: 0 }}
                    onClick={(state) => {
                      const label = readChartLabel(state);
                      const point = model.activity.series.find((item) => item.label === label);
                      if (point) setSelectedMonth(point.month);
                    }}
                  >
                    <CartesianGrid
                      strokeDasharray="4 5"
                      stroke="oklch(var(--border) / 0.5)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 10, fill: 'oklch(var(--muted-foreground))' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip
                      contentStyle={{
                        background: 'oklch(var(--card))',
                        border: '1px solid oklch(var(--border))',
                        borderRadius: 12,
                        fontSize: 11,
                      }}
                    />
                    <Bar dataKey="dateChanges" name="Datas" stackId="activity" fill="oklch(var(--gold))" isAnimationActive={false} />
                    <Bar dataKey="responsibleChanges" name="Responsáveis" stackId="activity" fill="oklch(var(--primary))" isAnimationActive={false} />
                    <Bar dataKey="statusChanges" name="Status" stackId="activity" fill="oklch(var(--success))" isAnimationActive={false} />
                    <Bar dataKey="commissionChanges" name="Comissões" stackId="activity" fill="oklch(var(--brand-indigo-500))" isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="cronograma-activity-months" aria-label="Filtrar ranking por mês">
                <button
                  type="button"
                  data-active={!selectedMonth || undefined}
                  onClick={() => setSelectedMonth(null)}
                >
                  Todo período
                </button>
                {model.activity.series.map((month) => (
                  <button
                    key={month.month}
                    type="button"
                    data-active={selectedMonth === month.month || undefined}
                    onClick={() => setSelectedMonth(month.month)}
                  >
                    {month.label}
                  </button>
                ))}
              </div>
            </div>
            <ActivityRankings detail={detail} onOpenEvent={onOpenEvent} />
          </div>
          {model.activity.limitations.length > 0 && (
            <footer className="cronograma-dashboard-footnote">
              <DatabaseZap aria-hidden="true" />
              {model.activity.limitations.join(' ')}
            </footer>
          )}
        </>
      )}
    </section>
  );
}

function ActivityUnavailableState({
  status,
  onRetry,
}: {
  status: DashboardLogStatus;
  onRetry?: () => void;
}) {
  const copy: Record<DashboardLogStatus, [string, string]> = {
    idle: ['Atividade não solicitada', 'Abra o Dashboard para consultar o histórico.'],
    loading: ['Carregando histórico', 'Os indicadores baseados nos eventos permanecem válidos.'],
    ready: ['', ''],
    partial: ['', ''],
    empty: ['', ''],
    restricted: ['Acesso gerencial necessário', 'Os logs são protegidos para administradores e gestores.'],
    offline: ['Histórico indisponível offline', 'Reconecte para consultar alterações e reprogramações reais.'],
    unavailable: ['Histórico sem vínculo persistente', 'Não há IDs remotos suficientes para consultar os logs.'],
    error: ['Falha ao consultar o histórico', 'Nenhum zero foi inferido. Os demais indicadores permanecem válidos.'],
  };
  const [title, description] = copy[status];
  return (
    <div className="cronograma-activity-unavailable" role={status === 'error' ? 'alert' : 'status'}>
      {status === 'loading' ? <RefreshCw className="animate-spin" aria-hidden="true" /> : <DatabaseZap aria-hidden="true" />}
      <div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
      {(status === 'error' || status === 'offline') && onRetry && (
        <Button type="button" variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw aria-hidden="true" /> Tentar novamente
        </Button>
      )}
    </div>
  );
}

function ActivityRankings({
  detail,
  onOpenEvent,
}: {
  detail: ActivityDetail;
  onOpenEvent: (event: CronogramaEvent) => void;
}) {
  return (
    <div className="cronograma-activity-rankings">
      <RankingList
        title="Mais alterados"
        items={detail.topChanged}
        value={(item) => `${item.changes} alterações`}
        onOpenEvent={onOpenEvent}
      />
      <RankingList
        title="Mais reprogramados"
        items={detail.topReprogrammed}
        value={(item) => `${item.reprogramments} reprogramações`}
        onOpenEvent={onOpenEvent}
        showDates
      />
    </div>
  );
}

function RankingList({
  title,
  items,
  value,
  onOpenEvent,
  showDates = false,
}: {
  title: string;
  items: ActivityDetail['topChanged'];
  value: (item: ActivityDetail['topChanged'][number]) => string;
  onOpenEvent: (event: CronogramaEvent) => void;
  showDates?: boolean;
}) {
  return (
    <div className="cronograma-ranking">
      <h3>{title}</h3>
      {items.length === 0 ? (
        <p>Sem registros neste período.</p>
      ) : items.slice(0, 5).map((item, index) => (
        <button key={item.event.id} type="button" onClick={() => onOpenEvent(item.event)}>
          <span>{index + 1}</span>
          <div>
            <strong>{item.event.title}</strong>
            {showDates && (
              <small>{formatDate(item.originalDate)} → {formatDate(item.currentDate)}</small>
            )}
            <small>{formatDateTime(item.latestChangeAt)} · {item.latestUser}</small>
          </div>
          <b>{value(item)}</b>
        </button>
      ))}
    </div>
  );
}

function DataQuality({
  model,
  onOpenEvent,
  onDrilldown,
}: {
  model: CronogramaDashboardModel;
  onOpenEvent: (event: CronogramaEvent) => void;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}) {
  const quality = model.dataQuality;
  const incompleteDrilldown: DashboardDrilldown = {
    view: 'timeline',
    label: 'Registros incompletos',
    eventIds: quality.incompleteEventIds,
  };
  return (
    <section className="cronograma-dashboard-panel cronograma-quality-panel">
      <DashboardSectionHeader
        eyebrow="Confiabilidade da decisão"
        title="Qualidade dos registros"
        description="Completude dos campos operacionais usados pelo Dashboard."
        action={quality.incompleteEventIds.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onDrilldown(incompleteDrilldown)}>
            Corrigir registros <ArrowRight aria-hidden="true" />
          </Button>
        ) : undefined}
      />
      <div className="cronograma-quality-score">
        <span>{quality.percentage === null ? '—' : `${quality.percentage}%`}</span>
        <div>
          <strong>Completude geral</strong>
          <p>{quality.completedFields} de {quality.totalFields} campos elegíveis preenchidos</p>
        </div>
      </div>
      <div
        className="cronograma-quality-meter"
        role="progressbar"
        aria-label="Completude geral dos registros"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={quality.percentage ?? undefined}
      >
        <span style={{ width: `${quality.percentage ?? 0}%` }} />
      </div>
      <div className="cronograma-quality-grid">
        <div>
          <h3>Campos ausentes</h3>
          {quality.breakdown.filter(({ missing }) => missing > 0).slice(0, 7).map((item) => (
            <button
              type="button"
              key={item.key}
              onClick={() => onDrilldown({
                view: item.key === 'date' ? 'undated' : 'timeline',
                label: `${item.label} ausente`,
                eventIds: item.eventIds,
              })}
            >
              <span>{item.label}</span>
              <b>{item.missing}</b>
              <small>{item.percentage}%</small>
            </button>
          ))}
          {!quality.breakdown.some(({ missing }) => missing > 0) && <p>Nenhum campo obrigatório ausente.</p>}
        </div>
        <div>
          <h3>Comissões mais afetadas</h3>
          {quality.affectedCommissions.slice(0, 5).map((item) => (
            <div key={item.commission}>
              <span>{item.commission}</span>
              <b>{item.affectedEvents} eventos</b>
              <small>{item.missingFields} lacunas</small>
            </div>
          ))}
          {quality.affectedCommissions.length === 0 && <p>Sem lacunas por comissão.</p>}
        </div>
      </div>
      <div className="cronograma-stale-list">
        <header>
          <Clock3 aria-hidden="true" />
          <strong>Sem atualização há mais de 30 dias</strong>
          <span>{quality.staleEvents.length}</span>
        </header>
        {quality.staleEvents.slice(0, 4).map((event) => (
          <button key={event.id} type="button" onClick={() => onOpenEvent(event)}>
            <span>{event.title}</span>
            <small>{event.owner || 'Sem responsável'}</small>
          </button>
        ))}
        {quality.missingUpdateTimestamp.length > 0 && (
          <p>{quality.missingUpdateTimestamp.length} eventos não possuem timestamp confiável de atualização.</p>
        )}
      </div>
    </section>
  );
}

function ExecutiveInsights({
  model,
  onDrilldown,
}: {
  model: CronogramaDashboardModel;
  onDrilldown: (drilldown: DashboardDrilldown) => void;
}) {
  if (model.insights.length === 0) return null;
  return (
    <section className="cronograma-insights" aria-labelledby="cronograma-insights-title">
      <header>
        <span><Sparkles aria-hidden="true" /></span>
        <div>
          <p className="cronograma-dashboard-eyebrow">Leitura executiva</p>
          <h2 id="cronograma-insights-title">Insights do recorte atual</h2>
        </div>
      </header>
      <div>
        {model.insights.map((insight) => (
          <button
            key={insight.id}
            type="button"
            data-tone={insight.tone}
            onClick={() => onDrilldown(insight.drilldown)}
          >
            <span>{insight.text}</span>
            <ChevronRight aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

export default function CronogramaDashboardBoard({
  model,
  logStatus,
  isFallback,
  onOpenEvent,
  onDrilldown,
  onRetryActivity,
}: CronogramaDashboardBoardProps) {
  if (model.eligibleEvents.length === 0) {
    return (
      <section className="cronograma-dashboard-empty-page" role="status">
        <Flag aria-hidden="true" />
        <h1>Nenhum evento elegível neste recorte</h1>
        <p>Ajuste ou limpe os filtros para recompor os indicadores executivos.</p>
      </section>
    );
  }

  return (
    <div className="cronograma-dashboard">
      {isFallback && (
        <div className="cronograma-dashboard-source-warning" role="alert">
          <DatabaseZap aria-hidden="true" />
          <div>
            <strong>Indicadores calculados sobre a base oficial consolidada local</strong>
            <p>A fonte remota não respondeu. Estes valores não confirmam o estado atual do Supabase.</p>
          </div>
        </div>
      )}

      <ExecutiveKpis model={model} onDrilldown={onDrilldown} />

      <EventVolumePanel
        events={model.eligibleEvents}
        todayKey={getTodayKey()}
        onDrilldown={onDrilldown}
      />

      <UpcomingMilestones model={model} onOpenEvent={onOpenEvent} />

      <div className="cronograma-dashboard-operations">
        <MajorEventProgress model={model} onOpenEvent={onOpenEvent} />
        <AttentionEvents
          model={model}
          onOpenEvent={onOpenEvent}
          onDrilldown={onDrilldown}
        />
      </div>

      <ActivityAndReprogramming
        model={model}
        logStatus={logStatus}
        onOpenEvent={onOpenEvent}
        onRetryActivity={onRetryActivity}
      />

      <div className="cronograma-dashboard-management">
        <DataQuality
          model={model}
          onOpenEvent={onOpenEvent}
          onDrilldown={onDrilldown}
        />
        <ExecutiveInsights model={model} onDrilldown={onDrilldown} />
      </div>
    </div>
  );
}
