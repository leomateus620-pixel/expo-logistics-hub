import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Clock3,
  Info,
  CalendarClock,
  AlertTriangle,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { money, progress, percentageText } from "../financialScenariosMath";

export function ScenarioInfo({
  label,
  children,
  hover = false,
}: {
  label: string;
  children: ReactNode;
  hover?: boolean;
}) {
  const [open, setOpen] = useState(false),
    timer = useRef<ReturnType<typeof setTimeout>>();
  const enter = () => {
    clearTimeout(timer.current);
    setOpen(true);
  };
  const leave = () => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(false), 180);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="fsc-info"
          aria-label={label}
          onPointerEnter={(e) => {
            if (hover && e.pointerType === "mouse") enter();
          }}
          onPointerLeave={(e) => {
            if (hover && e.pointerType === "mouse") leave();
          }}
        >
          <Info size={16} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="fsc-popover"
        sideOffset={8}
        onPointerEnter={() => hover && enter()}
        onPointerLeave={() => hover && leave()}
      >
        <div>{children}</div>
      </PopoverContent>
    </Popover>
  );
}
export function ScenarioProgress({
  label,
  current,
  target,
  tone = "neutral",
}: {
  label: string;
  current: bigint;
  target: bigint;
  tone?: string;
}) {
  const p = progress(current, target);
  return (
    <div
      className="fsc-progress"
      data-tone={tone}
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.max(0, Math.min(100, p.percentage ?? 0))}
      aria-valuetext={`${money(current)} de ${money(target)}${p.percentage == null ? "" : `, ${p.percentage.toLocaleString("pt-BR")}%`}`}
    >
      <span style={{ width: `${p.width}%` }} />
    </div>
  );
}
export function ScenarioMetricRow({
  label,
  current,
  target,
  currentLabel,
  status,
  onDetails,
  info,
  budget = false,
  Icon: CategoryIcon,
}: {
  label: string;
  current: bigint;
  target: bigint;
  currentLabel: string;
  status?: "ready" | "empty" | "future" | "incomplete";
  onDetails?: () => void;
  info: ReactNode;
  budget?: boolean;
  Icon?: LucideIcon;
}) {
  const p = progress(current, target),
    ready = status == null || status === "ready";
  const state =
    status === "future"
      ? "Operação futura"
      : status === "empty"
        ? "Aguardando dados"
        : budget
          ? current > target
            ? "Acima do orçamento"
            : current * 10n >= target * 9n
              ? "Próximo do limite"
              : "Dentro do orçamento"
          : target === 0n
            ? "Meta: preservar equilíbrio"
            : p.achieved
              ? "Atingido"
              : status === "incomplete"
                ? "Dados incompletos"
                : "Pendente";
  const tone =
    status === "future" || status === "empty"
      ? "muted"
      : budget
        ? current > target
          ? "danger"
          : current * 10n >= target * 9n
            ? "attention"
            : "neutral"
        : p.achieved
          ? "success"
          : "neutral";
  const Icon =
    status === "future"
      ? CalendarClock
      : tone === "danger" || status === "incomplete"
        ? AlertTriangle
        : p.achieved && !budget
          ? CheckCircle2
          : Clock3;
  return (
    <section className="fsc-metric" data-tone={tone}>
      <div className="fsc-metric__title">
        {CategoryIcon && (
          <span className="fsc-category-icon">
            <CategoryIcon size={18} aria-hidden="true" />
          </span>
        )}
        {onDetails ? (
          <button type="button" onClick={onDetails}>
            {label}
          </button>
        ) : (
          <strong>{label}</strong>
        )}
        <ScenarioInfo label={`Como é calculado: ${label}`}>{info}</ScenarioInfo>
      </div>
      <div className="fsc-metric__target">
        <span>{budget ? "Orçamento oficial" : "Meta do cenário"}</span>
        <b>{money(target)}</b>
      </div>
      <div className="fsc-metric__current">
        <span>{currentLabel}</span>
        <strong>{money(current)}</strong>
      </div>
      <ScenarioProgress
        label={label}
        current={current}
        target={target}
        tone={tone}
      />
      <div className="fsc-metric__status">
        <span>
          <Icon size={14} aria-hidden="true" />
          {state}
        </span>
        <b>{p.percentage == null ? "—" : percentageText(p.percentage)}</b>
      </div>
      <small>
        {budget
          ? `${current > target ? "Estouro" : "Saldo orçamentário"}: ${money(current > target ? current - target : target - current)}`
          : p.excess > 0n
            ? `+${money(p.excess)} acima da meta`
            : target === 0n
              ? "Sem percentual para meta zero"
              : `Faltam ${money(p.missing)}`}
        {status === "incomplete" ? " · Cobertura parcial" : ""}
      </small>
    </section>
  );
}
