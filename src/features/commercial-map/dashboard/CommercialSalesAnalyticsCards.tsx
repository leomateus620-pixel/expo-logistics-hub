import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const [flight, setFlight] = useState<{
    id: number;
    path: string;
    width: number;
    height: number;
    x: number;
    y: number;
    landed: boolean;
  } | null>(null);
  const flightId = useRef(0);
  const pending = useRef<{ land: number; end: number; target: number } | null>(
    null,
  );
  const cancelFlight = useCallback(() => {
    if (pending.current) {
      window.clearTimeout(pending.current.land);
      window.clearTimeout(pending.current.end);
      pending.current = null;
    }
  }, []);
  useEffect(() => cancelFlight, [cancelFlight]);
  const advance = useCallback(
    (manual = false) => {
      if (order.length < 2 || pending.current) return;
      const target = (index + 1) % order.length;
      const column = root.current?.parentElement;
      const entry = column?.querySelector(
        ".commercial-dashboard-cashflow-entry",
      );
      const destination = root.current?.querySelector("strong");
      let geometry: Omit<NonNullable<typeof flight>, "id" | "landed"> | null =
        null;
      if (column && entry && destination) {
        const bounds = column.getBoundingClientRect(),
          from = entry.getBoundingClientRect(),
          to = destination.getBoundingClientRect();
        const x0 = from.left - bounds.left + 16,
          y0 = from.top - bounds.top + from.height / 2;
        const x = to.left - bounds.left + Math.min(to.width * 0.5, 70),
          y = to.top - bounds.top + to.height / 2;
        geometry = {
          width: bounds.width,
          height: bounds.height,
          x,
          y,
          path: `M ${x0} ${y0} C ${x0 + 65} ${y0 - 18}, ${x + 40} ${y - 32}, ${x} ${y}`,
        };
      }
      if (geometry)
        setFlight({ ...geometry, id: ++flightId.current, landed: false });
      const land = window.setTimeout(
        () => {
          setIndex(target);
          setFlight((f) => (f ? { ...f, landed: true } : null));
          if (manual) {
            const m = data?.months.find((m) => m.month === order[target]);
            if (m)
              setAnnouncement(
                `${monthLabel(m.month)}: ${moneyCents(m.principal.outstandingCents)}`,
              );
          }
        },
        geometry ? 480 : 0,
      );
      const end = window.setTimeout(
        () => {
          pending.current = null;
          setFlight(null);
        },
        geometry ? 850 : 1,
      );
      pending.current = { land, end, target };
    },
    [index, order, data],
  );
  const advanceRef = useRef(advance);
  advanceRef.current = advance;
  useEffect(() => {
    // This locally requested motion is intentionally independent of reduced-motion.
    // Pausing, interaction, page visibility and leaving the viewport still stop the cycle.
    if (order.length < 2 || paused || interacting || !visible || !inView)
      return;
    const timer = window.setInterval(() => advanceRef.current(), 10_000);
    return () => window.clearInterval(timer);
  }, [order, paused, interacting, visible, inView]);
  useEffect(() => {
    if ((!visible || !inView) && pending.current) {
      setIndex(pending.current.target);
      cancelFlight();
      setFlight(null);
    }
  }, [visible, inView, cancelFlight]);
  const month = data?.months.find(
    (m) => m.month === order[index % Math.max(order.length, 1)],
  );
  if (state === "restricted") return null;
  return (
    <>
      <div
        className="commercial-dashboard-cashflow-preview"
        ref={root}
        data-arriving={flight?.landed ? "true" : "false"}
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
                <span>{monthLabel(month.month)} · A receber · lotes</span>
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
          <span className="commercial-dashboard-analytics-notice">
            Atualização pendente
          </span>
        )}
      </div>
      {flight && (
        <svg
          key={flight.id}
          className="commercial-dashboard-cashflow-transfer"
          width={flight.width}
          height={flight.height}
          viewBox={`0 0 ${flight.width} ${flight.height}`}
          aria-hidden="true"
          focusable="false"
          data-landed={flight.landed ? "true" : "false"}
        >
          <path
            className="commercial-dashboard-cashflow-transfer__trail"
            d={flight.path}
            pathLength="1"
          />
          <g className="commercial-dashboard-cashflow-transfer__note">
            <animateMotion
              dur="720ms"
              fill="freeze"
              path={flight.path}
              keyPoints="0;1;1"
              keyTimes="0;.67;1"
              calcMode="spline"
              keySplines=".22 .7 .3 1;0 0 1 1"
            />
            <g transform="rotate(-12)">
              <rect
                x="-17"
                y="-10"
                width="34"
                height="20"
                rx="4"
                fill="#d4f0df"
                stroke="#27835d"
                strokeWidth="1.4"
              />
              <path
                d="M-11-6h22v12h-22z"
                fill="none"
                stroke="#75b695"
                strokeWidth=".9"
              />
              <ellipse rx="6" ry="7" fill="#a6d6bc" />
              <path
                d="M-1-4v8m3-6c-4-3-6 1-2 2s2 4-2 2"
                fill="none"
                stroke="#216749"
                strokeWidth="1.1"
                strokeLinecap="round"
              />
              <path d="M-14 0h2m14 0h2" stroke="#388764" strokeWidth="1.5" />
            </g>
          </g>
          <ellipse
            className="commercial-dashboard-cashflow-transfer__arrival"
            cx={flight.x}
            cy={flight.y}
            rx="35"
            ry="14"
          />
        </svg>
      )}
    </>
  );
}
export function SignatureLatencyCard({ onOpen }: { onOpen: () => void }) {
  const { data, state } = useCommercialSalesAnalytics();
  const sample = data?.signature;
  return (
    <article
      className="commercial-dashboard-signature-card"
      aria-label="Tempo médio de assinatura"
    >
      <header>
        <span className="commercial-dashboard-signature-card__icon">
          <SignatureClockGlyph />
        </span>
        <h2>Tempo médio de assinatura</h2>
        <OverviewInfo
          label="Como é calculado o tempo médio de assinatura"
          title="Tempo médio de assinatura"
          lead="Do registro da venda à confirmação da assinatura no sistema. Soma das durações em segundos ÷ quantidade de vendas válidas, uma amostra por pedido."
          facts={Object.entries(sample?.exclusions ?? {}).map(
            ([reason, count]) =>
              [signatureExclusionLabel(reason), `${count} vendas`] as const,
          )}
          note="Pendentes, parciais, canceladas, legado e conclusões sem data comprovada ficam fora da média. Revisões não criam novas assinaturas."
        />
      </header>
      <strong className="commercial-dashboard-signature-card__duration">
        {signatureDuration(sample?.averageSeconds ?? null)}
      </strong>
      <p>Cadastro → confirmação</p>
      <span>
        {state === "restricted"
          ? "Acesso restrito à gestão de vendas"
          : state === "loading"
            ? "Consultando histórico…"
            : state === "error"
              ? "Histórico indisponível"
              : sample?.count
                ? `Calculado com ${sample.count} vendas`
                : "Sem histórico suficiente"}
      </span>
      {state === "stale" && <span>Atualização pendente</span>}
      {data && (
        <button type="button" data-signature-detail onClick={onOpen}>
          Ver detalhamento <span aria-hidden="true">↗</span>
        </button>
      )}
    </article>
  );
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
