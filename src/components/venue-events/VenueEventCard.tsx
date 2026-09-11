import type { ReactNode } from "react";
import {
  AlertTriangle,
  Building2,
  ChevronRight,
  Handshake,
  MapPin,
  UserRound,
} from "lucide-react";
import {
  EVENT_STATUS_LABELS,
  venueEventTypeLabel,
  type VenueEvent,
  type VenueEventStatus,
} from "@/lib/venue-operations";
import {
  formatVenueDuration,
  formatVenueHour,
  venueDateParts,
} from "@/lib/venue-agenda";
import { toDisplayUpper } from "@/lib/textNormalize";
import "@/styles/venue-event-cards.css";

/*
 * Primitivas compartilhadas dos cards de evento (Agenda + Registro mestre).
 * Uma única arquitetura de informação — data, horário, título, requerente,
 * local/tipo e status — com composição responsiva controlada pelo CSS
 * (venue-event-cards.css), sem duplicar JSX entre as duas visões.
 */

export function VenueEventStatusBadge({ status }: { status: VenueEventStatus }) {
  return (
    <span className="venue-status" data-status={status}>
      {EVENT_STATUS_LABELS[status]}
    </span>
  );
}

export function VenueEventDateBadge({
  startAt,
  showYear = true,
}: {
  startAt: string | null;
  showYear?: boolean;
}) {
  const parts = venueDateParts(startAt);
  return (
    <span className="venue-event-card__date" data-empty={!parts || undefined}>
      <b>{parts?.day ?? "—"}</b>
      <i>{parts?.month ?? "s/ data"}</i>
      {showYear && parts && <u>{parts.year}</u>}
    </span>
  );
}

export function VenueEventTimeRow({
  startAt,
  endAt,
}: {
  startAt: string | null;
  endAt: string | null;
}) {
  const startLabel = formatVenueHour(startAt);
  const endLabel = formatVenueHour(endAt);
  const durationLabel = formatVenueDuration(startAt, endAt);

  if (!startLabel) {
    return (
      <span className="venue-event-card__time" data-empty="true">
        <span className="venue-event-card__time-empty">Horário a definir</span>
      </span>
    );
  }

  return (
    <span className="venue-event-card__time">
      <time dateTime={startAt ?? undefined}>{startLabel}</time>
      {endLabel && (
        <span className="venue-event-card__time-end">
          <em>{endLabel}</em>
          {durationLabel && <i>{durationLabel}</i>}
        </span>
      )}
    </span>
  );
}

export function VenueEventRequester({ name }: { name: string | null }) {
  const label = toDisplayUpper(name?.trim() || "") || "Requerente não informado";
  return (
    <span className="venue-event-card__requester" title={label}>
      <UserRound aria-hidden="true" />
      <span>{label}</span>
    </span>
  );
}

export type VenueEventChipKind =
  | "space"
  | "type"
  | "sponsor"
  | "counterpart"
  | "responsible";

export function VenueEventChip({
  kind,
  icon,
  children,
  title,
}: {
  kind: VenueEventChipKind;
  icon?: ReactNode;
  children: ReactNode;
  title?: string;
}) {
  return (
    <span className="venue-event-card__chip" data-kind={kind} title={title}>
      {icon}
      <span>{children}</span>
    </span>
  );
}

export function VenueEventChips({ children }: { children: ReactNode }) {
  return <span className="venue-event-card__chips">{children}</span>;
}

interface VenueEventSectionHeaderProps {
  /** Cabeçalho de dia (Agenda) ou de mês (Registro mestre). */
  variant: "day" | "month";
  /** Chave/ISO do dia (variant="day") — usada em <time dateTime>. */
  date?: string;
  /** Rótulo pronto (variant="month"), ex.: "Janeiro de 2026". */
  label?: string;
  count?: number;
}

export function VenueEventSectionHeader({
  variant,
  date,
  label,
  count,
}: VenueEventSectionHeaderProps) {
  if (variant === "day") {
    const parts = venueDateParts(date ? `${date}T12:00:00-03:00` : null);
    return (
      <header className="venue-event-section__header" data-variant="day">
        <time dateTime={date}>
          <strong>{parts?.weekday ?? "Data a definir"}</strong>
          <b>{parts?.day ?? "—"}</b>
          <span>
            {parts ? `${parts.month} ${parts.year}` : ""}
          </span>
        </time>
        <i aria-hidden="true" />
      </header>
    );
  }

  const compactLabel = (label ?? "").replace(/ de (\d{4})$/i, " $1");
  return (
    <p className="venue-event-section__header venue-event-group__label" data-variant="month">
      <span className="venue-event-group__label-text">{compactLabel}</span>
      {typeof count === "number" && (
        <span className="venue-event-group__label-count">
          <b>{count}</b>
          <small>{count === 1 ? "evento" : "eventos"}</small>
        </span>
      )}
    </p>
  );
}

interface VenueEventCardProps {
  event: VenueEvent;
  /**
   * "agenda": o dia vem do cabeçalho da seção, o card lidera pelo horário.
   * "registry": o card carrega o selo de data (lista agrupada por mês).
   */
  variant: "agenda" | "registry";
  spaceLabel: string;
  sponsorLabel?: string | null;
  hasCounterpart?: boolean;
  showType?: boolean;
  documentCount?: number;
  onOpen: () => void;
  /** Atalho: abre o mesmo evento direto na aba Documentos. */
  onOpenDocuments?: () => void;
  /** Atalho: abre o mesmo evento direto na aba Histórico. */
  onOpenHistory?: () => void;
}

export function VenueEventCard({
  event,
  variant,
  spaceLabel,
  sponsorLabel,
  hasCounterpart = false,
  showType = false,
  documentCount,
  onOpen,
  onOpenDocuments,
  onOpenHistory,
}: VenueEventCardProps) {
  const title = toDisplayUpper(event.title);
  const startLabel = formatVenueHour(event.start_at);
  const endLabel = formatVenueHour(event.end_at);
  const parts = venueDateParts(event.start_at);
  const typeLabel = showType ? venueEventTypeLabel(event.event_type) : "";
  const sponsor =
    sponsorLabel && sponsorLabel !== "Sem vínculo" ? sponsorLabel : null;
  const hasConflict = event.conflict_status === "conflito";

  const ariaDate =
    variant === "registry" && parts
      ? ` — ${parts.day} ${parts.month} ${parts.year}`
      : "";
  const ariaTime = startLabel
    ? `${variant === "registry" ? "," : " —"} ${startLabel}${endLabel ? ` às ${endLabel}` : ""}`
    : variant === "agenda"
      ? " — sem horário"
      : "";

  const quickAction = (handler?: () => void) => (
    eventObject: React.MouseEvent | React.KeyboardEvent,
  ) => {
    eventObject.stopPropagation();
    handler?.();
  };

  return (
    // Contêiner clicável em <div> (e não <button>) para permitir os atalhos
    // Documentos/Histórico como botões reais aninhados, sem HTML inválido.
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          onOpen();
        }
      }}
      data-status={event.status}
      data-variant={variant}
      className="venue-event-card"
      aria-label={`${event.title}${ariaDate}${ariaTime}`}
    >
      {variant === "registry" && (
        <VenueEventDateBadge startAt={event.start_at} />
      )}

      <VenueEventTimeRow startAt={event.start_at} endAt={event.end_at} />

      <span className="venue-event-card__body">
        <strong className="venue-event-card__title">{title}</strong>
        <VenueEventRequester name={event.requester_name} />
        <VenueEventChips>
          <VenueEventChip
            kind="space"
            icon={<MapPin aria-hidden="true" />}
            title={spaceLabel || undefined}
          >
            {spaceLabel || "Área não definida"}
          </VenueEventChip>
          {typeLabel && <VenueEventChip kind="type">{typeLabel}</VenueEventChip>}
          {sponsor && (
            <VenueEventChip
              kind="sponsor"
              icon={<Building2 aria-hidden="true" />}
              title={sponsor}
            >
              {sponsor}
            </VenueEventChip>
          )}
          {hasCounterpart && (
            <VenueEventChip
              kind="counterpart"
              icon={<Handshake aria-hidden="true" />}
            >
              Contrapartida
            </VenueEventChip>
          )}
        </VenueEventChips>
      </span>

      <span className="venue-event-card__aside">
        {(onOpenDocuments || onOpenHistory) && (
          <span className="venue-event-card__quick">
            {onOpenDocuments && (
              <button
                type="button"
                className="venue-event-card__quick-action"
                onClick={quickAction(onOpenDocuments)}
                onKeyDown={(keyEvent) => keyEvent.stopPropagation()}
                aria-label="Abrir documentos do evento"
                title="Documentos"
              >
                <FileText aria-hidden="true" />
                {typeof documentCount === "number" && documentCount > 0 && (
                  <b>{documentCount}</b>
                )}
              </button>
            )}
            {onOpenHistory && (
              <button
                type="button"
                className="venue-event-card__quick-action"
                onClick={quickAction(onOpenHistory)}
                onKeyDown={(keyEvent) => keyEvent.stopPropagation()}
                aria-label="Abrir histórico do evento"
                title="Histórico"
              >
                <History aria-hidden="true" />
              </button>
            )}
          </span>
        )}
        {hasConflict && (
          <AlertTriangle
            className="venue-event-card__conflict"
            aria-label="Conflito pendente"
            role="img"
          />
        )}
        <VenueEventStatusBadge status={event.status} />
        <ChevronRight aria-hidden="true" />
      </span>
    </div>
  );
}
