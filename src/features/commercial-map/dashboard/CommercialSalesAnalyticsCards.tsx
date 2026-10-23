import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";
import { OverviewInfo } from "./CommercialDashboardOverviewInfo";
import {
  CashflowGlyph,
  SignatureClockGlyph,
  PauseGlyph,
  PlayGlyph,
} from "./CommercialDashboardOverviewIcons";
import { useCommercialSalesAnalytics } from "./salesOrders/useCommercialSalesAnalytics";
import {
  moneyCents,
  monthLabel,
  signatureDuration,
} from "./salesOrders/commercialSalesAnalytics";

/** A stable permutation depends only on scope + month keys, never on parent renders. */
export function shuffledMonths(keys: string[], seed: string): string[] {
  let hash = 2166136261;
  for (const char of seed)
    hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0;
  const shuffled = [...keys];
  for (let i = shuffled.length - 1; i > 0; i--) {
    hash ^= hash << 13;
    hash ^= hash >>> 17;
    hash ^= hash << 5;
    const j = (hash >>> 0) % (i + 1);
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}
export function CommercialCashflowPreview({
  scope,
  onOpen,
}: {
  scope: string;
  onOpen: (month: string) => void;
}) {
  const { data, state } = useCommercialSalesAnalytics();
  const [seed] = useState(() => `${scope}:${Math.random()}`);
  const keys =
    data?.months
      .filter((m) => m.installments > 0)
      .map((m) => m.month)
      .join("|") ?? "";
  const order = useMemo(
    () => shuffledMonths(keys ? keys.split("|") : [], seed),
    [keys, seed],
  );
  const [index, setIndex] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const [paused, setPaused] = useState(false),
    [interacting, setInteracting] = useState(false);
  const [visible, setVisible] = useState(
    () => document.visibilityState !== "hidden",
  );
  const root = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(true);
  useEffect(() => {
    const onVisibility = () =>
      setVisible(document.visibilityState !== "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    const observer =
      typeof IntersectionObserver === "undefined"
        ? null
        : new IntersectionObserver((entries) =>
            setInView(entries[0]?.isIntersecting ?? false),
          );
    if (root.current) observer?.observe(root.current);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      observer?.disconnect();
    };
  }, []);
  // The compact footer changes as a single local pair: no measured flight
  // between distant DOM anchors or overlay across the primary financial value.
  const advance = useCallback(
    (manual = false) => {
      if (order.length < 2) return;
      const target = (index + 1) % order.length;
      setIndex(target);
      if (manual) {
        const month = data?.months.find((m) => m.month === order[target]);
        if (month) setAnnouncement(`${monthLabel(month.month)}: ${moneyCents(month.principal.outstandingCents)}`);
      }
    },
    [index, order, data],
  );
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    // Automatic changes stay silent; CSS disables the local transition for reduced motion.
    if (order.length < 2 || paused || interacting || !visible || !inView)
      return;
    const timer = window.setInterval(() => advanceRef.current(), 10_000);
    return () => window.clearInterval(timer);
  }, [order, paused, interacting, visible, inView]);
  const month = data?.months.find(
    (m) => m.month === order[index % Math.max(order.length, 1)],
  );
  if (state === "restricted") return null;
  return (
      <div
        className="commercial-dashboard-cashflow-preview"
        ref={root}
        onMouseEnter={() => setInteracting(true)}
        onMouseLeave={() => setInteracting(false)}
        onFocusCapture={() => setInteracting(true)}
        onBlurCapture={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget)) setInteracting(false);
        }}
      >
        {month ? (
          <>
            <button
              type="button"
              className="commercial-dashboard-cashflow-preview__month"
              onClick={() => onOpen(month.month)}
              aria-label={`Ver fluxo de ${monthLabel(month.month)}`}
            >
              <span
                key={month.month}
                className="commercial-dashboard-cashflow-preview__transition"
              >
                <span><time dateTime={month.month} title={monthLabel(month.month)}>{compactMonthLabel(month.month)}</time> · a receber</span>
                <strong>{moneyCents(month.principal.outstandingCents)}</strong>
              </span>
            </button>
            <div className="commercial-dashboard-cashflow-preview__controls">
              <button
                type="button"
                onClick={() => setPaused((p) => !p)}
                aria-label={
                  paused ? "Continuar prévia mensal" : "Pausar prévia mensal"
                }
                aria-pressed={paused}
              >
                {paused ? <PlayGlyph /> : <PauseGlyph />}
              </button>
              <button
                type="button"
                onClick={() => advance(true)}
                aria-label="Próximo mês da prévia"
              >
                →
              </button>
            </div>
          </>
        ) : (
          <span>
            {state === "loading"
              ? "Carregando previsão mensal…"
              : state === "error"
                ? "Previsão mensal indisponível"
                : "Sem cronograma verificável"}
          </span>
        )}
        <span className="sr-only" role="status">
          {announcement}
        </span>
        {state === "stale" && (
          <span className="commercial-dashboard-cashflow-preview__notice">
            Atualização pendente
          </span>
        )}
      </div>
  );
}

function compactMonthLabel(month: string): string {
  const [year, number] = month.split("-");
  const label = new Intl.DateTimeFormat("pt-BR", { month: "short", timeZone: "America/Sao_Paulo" })
    .format(new Date(Number(year), Number(number) - 1, 15, 12)).replace(/\.$/, "");
  return `${label}/${year}`;
}

/** Secondary presentation only; uses the Dashboard's existing analytics scope. */
export function SignatureLatencyInline({ entryRef, onOpen }: {
  entryRef?: Ref<HTMLButtonElement>;
  onOpen?: () => void;
}) {
  const { data, state } = useCommercialSalesAnalytics();
  const sample = state === "restricted" ? null : data?.signature;
  const status = state === "restricted" ? "Acesso restrito à gestão de vendas"
    : state === "loading" ? "Consultando histórico…"
      : state === "error" ? "Histórico indisponível"
        : !sample?.count ? "Sem histórico suficiente"
          : state === "stale" ? "Atualização pendente" : null;
  return <div className="commercial-dashboard-signature-inline" aria-label="Tempo médio de assinatura" data-state={state}>
    <span className="commercial-dashboard-signature-inline__icon" aria-hidden="true"><SignatureClockGlyph /></span>
    <span className="commercial-dashboard-signature-inline__label">Tempo médio de assinatura</span>
    <strong className="commercial-dashboard-signature-inline__duration">{signatureDuration(sample?.averageSeconds ?? null)}</strong>
    <div className="commercial-dashboard-signature-inline__actions">
      <OverviewInfo label="Como é calculado o tempo médio de assinatura" title="Tempo médio de assinatura"
        lead="Cadastro → confirmação. Do registro da venda à confirmação da assinatura no sistema. Soma das durações em segundos ÷ quantidade de vendas válidas, uma amostra por pedido."
        facts={[
          ['Amostra válida', sample?.count ? `Calculado com ${sample.count} vendas` : 'Sem histórico suficiente'],
          ...Object.entries(sample?.exclusions ?? {}).map(([reason, count]) => [signatureExclusionLabel(reason), `${count} vendas`] as const),
        ]}
        note="Pendentes, parciais, canceladas, legado e conclusões sem data comprovada ficam fora da média. Revisões não criam novas assinaturas." />
      {data && state !== "restricted" && onOpen && <button type="button" ref={entryRef} data-signature-detail onClick={onOpen}
        className="commercial-dashboard-signature-inline__detail" aria-label="Ver detalhamento de assinatura">Detalhes <span aria-hidden="true">↗</span></button>}
    </div>
    {status && <span className="commercial-dashboard-signature-inline__status" role="status">{status}</span>}
  </div>;
}
export function signatureExclusionLabel(reason: string): string {
  return (
    (
      {
        CANCELLED: "Canceladas",
        NO_ITEMS: "Sem itens",
        LEGACY_UNVERIFIED: "Legado sem comprovação",
        PENDING_OR_PARTIAL: "Pendentes ou parcialmente assinadas",
        CANCELLED_OR_INCONSISTENT: "Canceladas ou inconsistentes",
        UNPROVEN_COMPLETION: "Conclusão sem comprovação",
        INVALID_TIMESTAMP: "Datas inválidas",
      } as Record<string, string>
    )[reason] ?? reason
  );
}
export { CashflowGlyph };
