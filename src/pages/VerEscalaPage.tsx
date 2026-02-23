import { useEvents } from '@/hooks/useEvents';
import { useTransports } from '@/hooks/useTransports';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Clock, MapPin, User, Filter, Car } from 'lucide-react';
import { rawTime, rawWeekday, rawDay, rawMonthShort } from '@/lib/utils';
import { useState, useMemo } from 'react';

interface UnifiedItem {
  id: string;
  tipo: 'evento' | 'transporte';
  titulo: string;
  descricao?: string | null;
  inicio_em: string;
  fim_em?: string | null;
  local?: string | null;
  responsavel_user_id?: string | null;
  created_by_user_id?: string | null;
  tipo_tag?: string | null;
  origem?: string;
  destino?: string;
  status?: string;
}

export default function VerEscalaPage() {
  const { events, isLoading: eventsLoading } = useEvents();
  const { transports, isLoading: transportsLoading } = useTransports();
  const { members } = useOrgMembers();
  const [filterMember, setFilterMember] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  const unified = useMemo(() => {
    const evList: UnifiedItem[] = events.map((e: any) => ({
      id: e.id,
      tipo: 'evento' as const,
      titulo: e.titulo,
      descricao: e.descricao,
      inicio_em: e.inicio_em,
      fim_em: e.fim_em,
      local: e.local,
      responsavel_user_id: e.responsavel_user_id,
      created_by_user_id: e.created_by_user_id,
      tipo_tag: e.tipo_tag,
    }));
    const trList: UnifiedItem[] = transports.map((t: any) => ({
      id: t.id,
      tipo: 'transporte' as const,
      titulo: t.titulo || `${t.origem} → ${t.destino}`,
      descricao: t.observacoes,
      inicio_em: t.inicio_em,
      fim_em: t.fim_em,
      local: null,
      responsavel_user_id: t.motorista_user_id,
      created_by_user_id: null,
      origem: t.origem,
      destino: t.destino,
      status: t.status,
    }));
    let list = [...evList, ...trList];
    if (filterDate) {
      list = list.filter((i) => i.inicio_em?.startsWith(filterDate));
    }
    if (filterMember !== 'all') {
      list = list.filter((i) => i.responsavel_user_id === filterMember || i.created_by_user_id === filterMember);
    }
    return list.sort((a, b) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));
  }, [events, transports, filterDate, filterMember]);

  const isLoading = eventsLoading || transportsLoading;

  const getMemberName = (userId: string) => {
    const m = members.find((m: any) => m.user_id === userId);
    return m?.nome_exibicao || '—';
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Escala</h1>
        <p className="text-sm text-muted-foreground mt-1">Eventos e transportes por membro</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-xl border bg-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          <Filter className="w-4 h-4" />
          <span className="font-medium">Filtros</span>
        </div>
        <div className="flex-1">
          <Select value={filterMember} onValueChange={setFilterMember}>
            <SelectTrigger className="w-full"><SelectValue placeholder="Filtrar por pessoa" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos da equipe</SelectItem>
              {members.map((m: any) => <SelectItem key={m.user_id} value={m.user_id}>{m.nome_exibicao || 'Sem nome'}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Input type="date" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} className="w-full" />
        </div>
        {(filterMember !== 'all' || filterDate) && (
          <button onClick={() => { setFilterMember('all'); setFilterDate(''); }} className="text-xs text-primary hover:underline shrink-0 self-center">Limpar filtros</button>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-12">Carregando...</div>
      ) : unified.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12">Nenhum item encontrado.</div>
      ) : (
        <div className="space-y-3">
          {unified.map((item) => (
            <div key={`${item.tipo}-${item.id}`} className="rounded-xl border bg-card p-4 flex items-start gap-4">
              <div className="text-center w-14 shrink-0 pt-0.5">
                <p className="text-[10px] uppercase text-muted-foreground font-medium">{rawWeekday(item.inicio_em)}</p>
                <p className="text-lg font-bold leading-tight">{rawDay(item.inicio_em)}</p>
                <p className="text-[10px] text-muted-foreground">{rawMonthShort(item.inicio_em)}</p>
              </div>
              <div className="w-px h-12 bg-border self-center" />
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold truncate">{item.titulo}</p>
                  {item.tipo === 'transporte' && <Badge variant="outline" className="text-[10px] border-accent/30 text-accent shrink-0"><Car className="w-2.5 h-2.5 mr-0.5" />Transporte</Badge>}
                </div>
                {item.descricao && <p className="text-xs text-muted-foreground">{item.descricao}</p>}
                {item.tipo === 'transporte' && item.origem && (
                  <p className="text-xs text-muted-foreground"><MapPin className="w-3 h-3 inline mr-0.5" />{item.origem} → {item.destino}</p>
                )}
                <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{rawTime(item.inicio_em)}{item.fim_em ? ` – ${rawTime(item.fim_em)}` : ''}</span>
                  {item.local && <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{item.local}</span>}
                  {item.responsavel_user_id && <span className="flex items-center gap-1 text-primary font-medium"><User className="w-3 h-3" />{getMemberName(item.responsavel_user_id)}</span>}
                  {item.status && <Badge variant="secondary" className="text-[10px]">{item.status}</Badge>}
                </div>
                {item.tipo_tag && <Badge variant="outline" className="text-[10px]">{item.tipo_tag}</Badge>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
