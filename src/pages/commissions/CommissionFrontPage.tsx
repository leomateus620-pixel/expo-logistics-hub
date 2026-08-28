import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CalendarDays, FileText, ListChecks, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/useCurrentOrg';
import { useCommissionPeople } from '@/hooks/useCommissionPeople';
import CommissionPeopleStack, {
  CommissionPersonAvatar,
} from '@/components/commissions/CommissionPeopleStack';
import { statusClasses, statusLabels, type CommissionModule } from '@/modules/commissions/commissionRegistry';
import type { OfficialUnitEntry } from '@/modules/commissions/officialCommissionCatalog';
import { cn } from '@/lib/utils';
import '@/styles/portal-commission-groups.css';

interface CommissionFrontPageProps {
  module: CommissionModule;
  entry: OfficialUnitEntry;
}

interface FrontEventRow {
  id: string;
  title: string;
  start_date: string | null;
  status: string | null;
  location: string | null;
}

function formatDate(value: string | null) {
  if (!value) return 'Data a definir';
  const [year, month, day] = value.split('-');
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function EmptyState({ icon: Icon, title, detail }: { icon: typeof FileText; title: string; detail: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-secondary/40 px-4 py-8 text-center">
      <Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
      <p className="text-sm font-bold text-foreground">{title}</p>
      <p className="max-w-md text-xs leading-5 text-muted-foreground">{detail}</p>
    </div>
  );
}

export default function CommissionFrontPage({ module, entry }: CommissionFrontPageProps) {
  const { orgId } = useCurrentOrg();
  const { byUnit } = useCommissionPeople();
  const people = byUnit.get(entry.id);
  const responsible = people?.responsible ?? {
    id: `${entry.id}-fallback`,
    name: entry.responsible,
    role: entry.responsibleRole ?? 'Responsável',
  };
  const members = people?.members ?? [];
  const ModuleIcon = module.icon;

  const slugCandidates = useMemo(
    () => Array.from(new Set([entry.id, entry.moduleSlug].filter(Boolean) as string[])),
    [entry.id, entry.moduleSlug],
  );

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['commission-front-events', orgId, entry.id],
    enabled: Boolean(orgId),
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<FrontEventRow[]> => {
      if (!orgId) return [];
      const { data: links, error: linkError } = await (supabase as any)
        .from('cronograma_evento_comissoes')
        .select('event_id')
        .eq('org_id', orgId)
        .in('commission_slug', slugCandidates)
        .limit(500);
      if (linkError) throw linkError;

      const ids = Array.from(new Set((links ?? []).map((row: any) => row.event_id as string)));

      const direct = await (supabase as any)
        .from('cronograma_eventos')
        .select('id, title, start_date, status, location')
        .eq('org_id', orgId)
        .in('commission_slug', slugCandidates)
        .limit(200);
      if (direct.error) throw direct.error;

      let linked: FrontEventRow[] = [];
      if (ids.length > 0) {
        const { data, error } = await (supabase as any)
          .from('cronograma_eventos')
          .select('id, title, start_date, status, location')
          .eq('org_id', orgId)
          .in('id', ids)
          .limit(200);
        if (error) throw error;
        linked = (data ?? []) as FrontEventRow[];
      }

      const merged = new Map<string, FrontEventRow>();
      for (const row of [...((direct.data ?? []) as FrontEventRow[]), ...linked]) merged.set(row.id, row);
      return Array.from(merged.values()).sort((a, b) => (a.start_date ?? '').localeCompare(b.start_date ?? ''));
    },
  });

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)] md:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <span className={cn('inline-flex rounded-md border px-2 py-1 text-xs font-bold', statusClasses[module.status])}>
            {statusLabels[module.status]}
          </span>
          <span className="rounded-md border border-border px-2 py-1 text-xs font-bold text-muted-foreground">
            {entry.type === 'assessoria' ? 'Assessoria' : 'Comissão'}
          </span>
        </div>

        <div className="mt-5 flex items-center gap-4">
          <div className={cn('flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-border bg-secondary text-primary', module.visual.iconBackground)}>
            <ModuleIcon className="h-6 w-6" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-black tracking-tight text-foreground md:text-3xl">{module.name}</h1>
            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{module.description}</p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-4 rounded-lg border border-border bg-secondary/50 p-4">
          <CommissionPersonAvatar person={responsible} variant="lead" />
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-foreground">{responsible.name}</p>
            <p className="text-xs text-muted-foreground">{responsible.role ?? 'Responsável'}</p>
          </div>
          {members.length > 0 && (
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Equipe</span>
              <CommissionPeopleStack people={members} max={6} />
            </div>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
        <header className="mb-4 flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-primary" aria-hidden="true" />
          <h2 className="text-base font-bold text-foreground">Eventos vinculados</h2>
        </header>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando eventos da frente…</p>
        ) : events.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="Nenhum evento vinculado ainda"
            detail="Assim que esta frente for vinculada a um evento na Agenda Fenasoja, ele aparecerá aqui automaticamente."
          />
        ) : (
          <ul className="divide-y divide-border">
            {events.map((event) => (
              <li key={event.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">{event.title}</span>
                <span className="text-xs text-muted-foreground">{formatDate(event.start_date)}</span>
                {event.location && <span className="text-xs text-muted-foreground">· {event.location}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
          <header className="mb-4 flex items-center gap-2">
            <ListChecks className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold text-foreground">Tarefas da frente</h2>
          </header>
          <EmptyState
            icon={ListChecks}
            title="Área preparada"
            detail="O acompanhamento de tarefas específicas desta frente será habilitado após a validação do escopo operacional."
          />
        </section>
        <section className="rounded-xl border border-border bg-card p-5 shadow-[var(--shadow-xs)]">
          <header className="mb-4 flex items-center gap-2">
            <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
            <h2 className="text-base font-bold text-foreground">Documentos</h2>
          </header>
          <EmptyState
            icon={Users}
            title="Nenhum documento publicado"
            detail="Documentos, anexos e materiais oficiais desta frente poderão ser publicados nesta área."
          />
        </section>
      </div>
    </div>
  );
}
