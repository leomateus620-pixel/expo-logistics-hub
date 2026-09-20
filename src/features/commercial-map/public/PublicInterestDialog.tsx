import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, ExternalLink, Link2, LineChart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/hooks/use-toast';
import { publicAreaUrl } from './publicAreaRegistry';
import {
  fetchPublicMapInterest,
  fetchPublicMapLinks,
  interactionRate,
  setPublicMapLinkActive,
} from './publicMapAdminService';
import './public-interest.css';

const SP_DATE = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' });
const PERCENT = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 });
const RANGE_DAYS = 30;

function rangeIso() {
  const to = new Date();
  const from = new Date(to.getTime() - RANGE_DAYS * 24 * 60 * 60 * 1000);
  return { fromIso: from.toISOString(), toIso: to.toISOString() };
}

/** Mapa Comercial → Gestão → Interesse por áreas e lotes. */
export function PublicInterestDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline"><LineChart />Interesse por áreas e lotes</Button>
      </DialogTrigger>
      <DialogContent className="public-interest-dialog">
        {open && <PublicInterestContent />}
      </DialogContent>
    </Dialog>
  );
}

/** As consultas só montam com o diálogo aberto — nada roda no mapa fechado. */
function PublicInterestContent() {
  const open = true;
  const queryClient = useQueryClient();
  const { fromIso, toIso } = useMemo(rangeIso, [open]);

  const links = useQuery({
    queryKey: ['public-map-admin', 'links'],
    queryFn: fetchPublicMapLinks,
    enabled: open,
  });
  const interest = useQuery({
    queryKey: ['public-map-admin', 'interest', fromIso, toIso],
    queryFn: () => fetchPublicMapInterest(fromIso, toIso),
    enabled: open,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['public-map-admin'] });

  const toggle = useMutation({
    mutationFn: ({ slug, active }: { slug: string; active: boolean }) => setPublicMapLinkActive(slug, active),
    onSuccess: () => void invalidate(),
    onError: (error: Error) => toast({ title: 'Não foi possível alterar o link', description: error.message, variant: 'destructive' }),
  });

  const copy = async (slug: string) => {
    const token = revealed[slug];
    if (!token) {
      toast({ title: 'Gere uma chave primeiro', description: 'Por segurança a chave só pode ser copiada no momento em que é criada.' });
      return;
    }
    await navigator.clipboard.writeText(publicAreaUrl(slug, token));
    toast({ title: 'Endereço copiado' });
  };

  const areas = interest.data?.areas ?? [];
  const lots = interest.data?.lots ?? [];
  const daily = interest.data?.daily ?? [];
  const maxDaily = Math.max(1, ...daily.map((day) => day.visits));

  return (
    <>
      <DialogHeader className="public-interest-header">
        <DialogTitle>Interesse por áreas e lotes</DialogTitle>
        <DialogDescription>
          Consultas públicas dos últimos {RANGE_DAYS} dias, no horário de Brasília. Mede interesse, não venda.
        </DialogDescription>
      </DialogHeader>

      <div className="public-interest-scroll">
        {(interest.isLoading || links.isLoading) && (
          <p className="public-interest-state"><Loader2 className="animate-spin" />Carregando…</p>
        )}

        {interest.data && (
          <section className="public-interest-section" aria-label="Série diária de visitas">
            <h3>Visitas por dia</h3>
            <div className="public-interest-spark">
              {daily.map((day) => (
                <span
                  key={day.day}
                  title={`${SP_DATE.format(new Date(day.day))}: ${day.visits} visitas`}
                  style={{ height: `${Math.max(6, (day.visits / maxDaily) * 100)}%` }}
                />
              ))}
              {!daily.length && <small>Nenhuma visita registrada no período.</small>}
            </div>
          </section>
        )}

        {interest.data && (
          <section className="public-interest-section" aria-label="Ranking de áreas">
            <h3>Áreas mais procuradas</h3>
            <ul className="public-interest-rank">
              {areas.map((area) => (
                <li key={area.slug}>
                  <strong>{area.displayName}</strong>
                  <span>{area.visits} visitas · {area.sessions} sessões</span>
                  <em>{PERCENT.format(interactionRate(area))} de interação</em>
                </li>
              ))}
              {!areas.length && <li className="is-empty">Sem dados no período.</li>}
            </ul>
          </section>
        )}

        {interest.data && (
          <section className="public-interest-section" aria-label="Ranking de lotes">
            <h3>Lotes mais consultados</h3>
            <ul className="public-interest-rank">
              {lots.slice(0, 15).map((lot) => (
                <li key={lot.lotId}>
                  <strong>{lot.publicIdentifier ?? lot.lotId}</strong>
                  <span>{lot.areaSlug}</span>
                  <em>{lot.detailViews} aberturas · {lot.sessions} sessões</em>
                </li>
              ))}
              {!lots.length && <li className="is-empty">Nenhum lote consultado ainda.</li>}
            </ul>
          </section>
        )}

        <section className="public-interest-section" aria-label="Links públicos">
          <h3><Link2 />Links de consulta</h3>
          <ul className="public-interest-links">
            {(links.data ?? []).map((link) => (
              <li key={link.id}>
                <div>
                  <strong>{link.displayName}</strong>
                  <small>
                    /areas/{link.slug}
                    {link.hasToken ? ` · chave v${link.tokenVersion}` : ' · sem chave'}
                  </small>
                </div>
                <div className="public-interest-links-actions">
                  <Switch
                    checked={link.isActive}
                    aria-label={`Ativar link ${link.displayName}`}
                    onCheckedChange={(active) => toggle.mutate({ slug: link.slug, active })}
                  />
                  <Button size="sm" variant="ghost" onClick={() => rotate.mutate(link.slug)} disabled={rotate.isPending}>
                    <KeyRound />Gerar chave
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => void copy(link.slug)} disabled={!revealed[link.slug]}>
                    <Copy />Copiar
                  </Button>
                </div>
                {revealed[link.slug] && (
                  <code className="public-interest-token">{publicAreaUrl(link.slug, revealed[link.slug])}</code>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
