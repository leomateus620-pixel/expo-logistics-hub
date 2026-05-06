import { useEffect, useMemo, useState } from 'react';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, X, ShieldCheck, Users, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

type Tab = 'autorizados' | 'internos';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  authorizations: any[];
  members: any[];
  /** Map de comissão -> carrinhos ativos (para mostrar aviso) */
  activeByCommission?: Map<string, Array<{ codigo: string; nome: string; retiradoPor: string }>>;
  /** Quais abas habilitar. Default: ambas. */
  tabs?: Tab[];
  /** Aba inicial. Default: autorizados (ou primeira disponível). */
  defaultTab?: Tab;
  onSelectAuth: (auth: any) => void;
  onSelectMember: (member: any) => void;
  title?: string;
}

const norm = (s: string) =>
  (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

export default function PersonPickerSheet({
  open,
  onOpenChange,
  authorizations,
  members,
  activeByCommission,
  tabs = ['autorizados', 'internos'],
  defaultTab,
  onSelectAuth,
  onSelectMember,
  title = 'Selecionar quem retira',
}: Props) {
  const isMobile = useIsMobile();
  const initial: Tab = defaultTab || tabs[0];
  const [tab, setTab] = useState<Tab>(initial);
  const [q, setQ] = useState('');

  useEffect(() => {
    if (open) {
      setQ('');
      setTab(initial);
    }
  }, [open, initial]);

  const filteredAuth = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return authorizations;
    return authorizations.filter(
      (a: any) => norm(a.member_name).includes(term) || norm(a.committee_name_snapshot).includes(term),
    );
  }, [authorizations, q]);

  const filteredMembers = useMemo(() => {
    const term = norm(q.trim());
    if (!term) return members;
    return members.filter(
      (m: any) => norm(m.nome_exibicao).includes(term) || norm(m.cargo).includes(term),
    );
  }, [members, q]);

  const showTabs = tabs.length > 1;
  const list = tab === 'autorizados' ? filteredAuth : filteredMembers;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className={cn(
          'p-0 flex flex-col bg-card/95 backdrop-blur-xl border-t border-white/10',
          'h-[92dvh] sm:h-[80dvh] sm:max-w-lg sm:mx-auto sm:rounded-t-2xl',
          'shadow-[0_-12px_40px_-12px_rgba(0,0,0,0.4)]',
        )}
      >
        {/* Drag handle */}
        <div className="pt-2 pb-1 flex justify-center sm:hidden">
          <div className="w-10 h-1.5 rounded-full bg-muted-foreground/30" />
        </div>

        {/* Header */}
        <div className="px-4 pt-2 pb-3 border-b border-border/40">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h2 className="text-base font-bold tracking-tight">{title}</h2>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-full"
              onClick={() => onOpenChange(false)}
              aria-label="Fechar"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              autoFocus={!isMobile}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome ou comissão..."
              className="h-11 pl-9 rounded-xl text-sm"
            />
          </div>
          {showTabs && (
            <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="mt-3">
              <TabsList className="grid w-full grid-cols-2 h-10">
                {tabs.includes('autorizados') && (
                  <TabsTrigger value="autorizados" className="text-xs gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" />
                    Autorizados
                    <span className="ml-1 text-[10px] opacity-70">({filteredAuth.length})</span>
                  </TabsTrigger>
                )}
                {tabs.includes('internos') && (
                  <TabsTrigger value="internos" className="text-xs gap-1.5">
                    <Users className="w-3.5 h-3.5" />
                    Internos
                    <span className="ml-1 text-[10px] opacity-70">({filteredMembers.length})</span>
                  </TabsTrigger>
                )}
              </TabsList>
            </Tabs>
          )}
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {list.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-muted-foreground">
              {q ? <>Nenhum resultado para "<strong>{q}</strong>"</> : 'Nenhuma pessoa disponível'}
            </div>
          ) : tab === 'autorizados' ? (
            <ul className="divide-y divide-border/40">
              {filteredAuth.map((a: any) => {
                const liberado = a.access_status === 'liberado';
                const comissaoAtiva =
                  activeByCommission?.get((a.committee_name_snapshot || '').trim())?.length || 0;
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelectAuth(a);
                        onOpenChange(false);
                      }}
                      className="w-full text-left px-4 py-3.5 min-h-[60px] flex items-center gap-3 active:bg-muted/60 hover:bg-muted/40 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-primary/25 to-primary/10 text-primary flex items-center justify-center shrink-0 font-bold text-sm border border-primary/20">
                        {(a.member_name || '?').trim().charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground leading-tight break-words">
                          {a.member_name}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5 break-words">
                          {a.committee_name_snapshot || 'Sem comissão'}
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          {!liberado && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30">
                              <AlertTriangle className="w-2.5 h-2.5" />
                              {a.access_status}
                            </span>
                          )}
                          {comissaoAtiva > 0 && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-info/15 text-info border border-info/30">
                              Comissão já com carrinho
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <ul className="divide-y divide-border/40">
              {filteredMembers.map((m: any) => (
                <li key={m.user_id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectMember(m);
                      onOpenChange(false);
                    }}
                    className="w-full text-left px-4 py-3.5 min-h-[60px] flex items-center gap-3 active:bg-muted/60 hover:bg-muted/40 transition-colors"
                  >
                    <div className="w-10 h-10 rounded-full bg-gradient-to-br from-accent/30 to-accent/10 text-accent-foreground dark:text-accent flex items-center justify-center shrink-0 font-bold text-sm border border-accent/30">
                      {(m.nome_exibicao || '?').trim().charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground leading-tight break-words">
                        {m.nome_exibicao}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5 break-words">
                        {m.cargo || 'Membro interno'}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-border/40 bg-card/60">
          <Button
            variant="outline"
            className="w-full h-11 rounded-xl"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
