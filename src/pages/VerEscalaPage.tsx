import { useEvents } from '@/hooks/useEvents';
import { useOrgMembers } from '@/hooks/useOrgMembers';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarDays, Clock, MapPin, User, Filter } from 'lucide-react';
import { rawTime, rawWeekday, rawDay, rawMonthShort } from '@/lib/utils';
import { useState, useMemo } from 'react';

export default function VerEscalaPage() {
  const { events, isLoading } = useEvents();
  const { members } = useOrgMembers();
  const [filterMember, setFilterMember] = useState('all');
  const [filterDate, setFilterDate] = useState('');

  const filtered = useMemo(() => {
    let list = [...events];
    if (filterDate) {
      list = list.filter((e: any) => e.inicio_em?.startsWith(filterDate));
    }
    if (filterMember !== 'all') {
      list = list.filter((e: any) => e.created_by_user_id === filterMember);
    }
    return list.sort((a: any, b: any) => (a.inicio_em || '').localeCompare(b.inicio_em || ''));
  }, [events, filterDate, filterMember]);

  const getMemberName = (userId: string) => {
    const m = members.find((m: any) => m.user_id === userId);
    return m?.nome_exibicao || '—';
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Ver Escala</h1>
        <p className="text-sm text-muted-foreground mt-1">Visualize todos os eventos agendados</p>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-3 p-3 rounded-xl border bg-card">
        <div className="flex items-center gap-2 text-sm text-muted-foreground shrink-0">
          <Filter className="w-4 h-4" />
          <span className="font-medium">Filtros</span>
        </div>
        <div className="flex-1">
          <Select value={filterMember} onValueChange={setFilterMember}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Filtrar por pessoa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos da equipe</SelectItem>
              {members.map((m: any) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.nome_exibicao || 'Sem nome'}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <Input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="w-full"
          />
        </div>
        {(filterMember !== 'all' || filterDate) && (
          <button
            onClick={() => { setFilterMember('all'); setFilterDate(''); }}
            className="text-xs text-primary hover:underline shrink-0 self-center"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Lista */}
      {isLoading ? (
        <div className="text-sm text-muted-foreground text-center py-12">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-sm text-muted-foreground text-center py-12">Nenhum evento encontrado.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map((e: any) => {
            return (
              <div key={e.id} className="rounded-xl border bg-card p-4 flex items-start gap-4">
                <div className="text-center w-14 shrink-0 pt-0.5">
                  <p className="text-[10px] uppercase text-muted-foreground font-medium">
                    {rawWeekday(e.inicio_em)}
                  </p>
                  <p className="text-lg font-bold leading-tight">
                    {rawDay(e.inicio_em)}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {rawMonthShort(e.inicio_em)}
                  </p>
                </div>
                <div className="w-px h-12 bg-border self-center" />
                <div className="flex-1 min-w-0 space-y-1">
                  <p className="text-sm font-semibold truncate">{e.titulo}</p>
                  {e.descricao && <p className="text-xs text-muted-foreground">{e.descricao}</p>}
                  <div className="flex flex-wrap items-center gap-3 text-[10px] text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {rawTime(e.inicio_em)}
                      {' – '}
                      {rawTime(e.fim_em)}
                    </span>
                    {e.local && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3 h-3" />{e.local}
                      </span>
                    )}
                    <span className="flex items-center gap-1">
                      <User className="w-3 h-3" />{getMemberName(e.created_by_user_id)}
                    </span>
                  </div>
                  {e.tipo_tag && <Badge variant="outline" className="text-[10px]">{e.tipo_tag}</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
