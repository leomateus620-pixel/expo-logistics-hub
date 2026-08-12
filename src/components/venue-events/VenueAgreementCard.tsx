import type { CSSProperties } from "react";
import { FileKey2, MapPin } from "lucide-react";
import {
  formatQuantity,
  type VenueAgreement,
  type VenueCounterpartBalanceRow,
} from "@/lib/venue-operations";
import {
  COUNTERPART_BALANCE_STATE_LABELS,
  buildCounterpartProgress,
  counterpartBalanceValues,
  getCounterpartBalanceState,
  presentAgreementStatus,
  presentContractReference,
  presentCounterpartBenefit,
  presentCounterpartUnit,
  presentSponsorName,
} from "@/lib/venue-counterparts";

type SegmentStyle = CSSProperties & { "--segment-size": string };

function segmentStyle(value: number): SegmentStyle {
  return { "--segment-size": `${Math.max(0, Math.min(100, value))}%` };
}

function formatContractDate(value: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? "Data não informada"
    : date.toLocaleDateString("pt-BR");
}

export function VenueAgreementCard({
  agreement,
  balance,
  sponsorName,
  spaceName,
  committedEvents,
  canEdit,
  selected,
  onEdit,
}: {
  agreement: VenueAgreement;
  balance?: VenueCounterpartBalanceRow;
  sponsorName: string;
  spaceName: string;
  committedEvents: number;
  canEdit: boolean;
  selected: boolean;
  onEdit: () => void;
}) {
  const values = counterpartBalanceValues(agreement, balance);
  const progress = buildCounterpartProgress(values);
  const balanceState = getCounterpartBalanceState(values);
  const balanceLabel = COUNTERPART_BALANCE_STATE_LABELS[balanceState];
  const sponsor = presentSponsorName(sponsorName);
  const contractReference = presentContractReference(
    agreement.contract_reference,
  );
  const benefit = presentCounterpartBenefit(agreement.benefit_type);
  const sponsorLabelId = `venue-agreement-sponsor-${agreement.id}`;
  const highlightedBalance =
    values.confirmedExcess || values.projectedExcess || values.remaining;
  const highlightedUnitLabel = presentCounterpartUnit(
    agreement.unit_type,
    highlightedBalance,
  );
  const progressUnitLabel = presentCounterpartUnit(
    agreement.unit_type,
    progress.granted,
  );
  const progressValue = Number(progress.committedPercent.toFixed(2));
  const progressDescription = `${formatQuantity(progress.committed)} de ${formatQuantity(progress.granted)} ${progressUnitLabel} comprometidos: ${formatQuantity(progress.consumed)} consumidos, ${formatQuantity(progress.reserved)} reservados e ${formatQuantity(progress.remaining)} disponíveis.`;
  const content = (
    <>
      <span className="venue-agreement-card__identity">
        <span className="venue-agreement-card__icon" aria-hidden="true">
          <FileKey2 />
        </span>
        <span className="venue-agreement-card__sponsor">
          <small>Patrocinador</small>
          <strong id={sponsorLabelId} title={sponsor}>
            {sponsor}
          </strong>
        </span>
        <span
          className="venue-agreement-card__status"
          data-status={agreement.status}
        >
          <i aria-hidden="true" />
          {presentAgreementStatus(agreement.status)}
        </span>
      </span>

      <span className="venue-agreement-card__contract-row">
        <span className="venue-agreement-card__contract">
          <small>Referência contratual</small>
          <strong title={contractReference}>{contractReference}</strong>
        </span>
        <span className="venue-agreement-card__balance" data-state={balanceState}>
          <small>{balanceLabel}</small>
          <strong>
            {formatQuantity(highlightedBalance)}
            <span>{highlightedUnitLabel}</span>
          </strong>
        </span>
      </span>

      <span className="venue-agreement-card__benefit">
        <small>Benefício</small>
        <strong>{benefit}</strong>
        <span>
          <MapPin aria-hidden="true" />
          {spaceName}
        </span>
      </span>

      <span className="venue-agreement-progress">
        <span
          className="venue-agreement-progress__track"
          role="progressbar"
          aria-label="Uso do benefício contratual"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressValue}
          aria-valuetext={progressDescription}
          data-state={balanceState}
        >
          <span
            key={`${agreement.id}-${progress.consumed}-${progress.reserved}-${progress.remaining}`}
            className="venue-agreement-progress__segments"
          >
            <span
              data-segment="consumed"
              style={segmentStyle(progress.consumedPercent)}
            />
            <span
              data-segment="reserved"
              style={segmentStyle(progress.reservedPercent)}
            />
            <span
              data-segment="available"
              style={segmentStyle(progress.availablePercent)}
            />
          </span>
        </span>
      </span>

      <span className="venue-agreement-metrics">
        <span data-metric="granted">
          <small>Concedido</small>
          <strong>{formatQuantity(values.granted)}</strong>
        </span>
        <span data-metric="consumed">
          <small>Consumido</small>
          <strong>{formatQuantity(values.consumed)}</strong>
        </span>
        <span data-metric="reserved">
          <small>Reservado</small>
          <strong>{formatQuantity(values.reserved)}</strong>
        </span>
        <span data-metric="available" data-state={balanceState}>
          <small>Saldo disponível</small>
          <strong>{formatQuantity(values.remaining)}</strong>
        </span>
      </span>

      <span className="venue-agreement-card__footer">
        <span>
          {committedEvents}{" "}
          {committedEvents === 1
            ? "evento comprometido"
            : "eventos comprometidos"}
        </span>
        <span>Vigência até {formatContractDate(agreement.valid_until)}</span>
      </span>
      {canEdit && (
        <span className="venue-agreement-card__edit-hint" aria-hidden="true">
          {selected ? "Em edição" : "Selecionar para editar"}
        </span>
      )}
    </>
  );

  return (
    <article
      className="venue-agreement-card venue-agreement-card--premium"
      data-state={balanceState}
      data-readonly={canEdit ? "false" : "true"}
      data-selected={canEdit && selected ? "true" : "false"}
      aria-labelledby={sponsorLabelId}
    >
      {content}
      {canEdit && (
        <button
          type="button"
          className="venue-agreement-card__action"
          aria-label={`Editar contrapartida de ${sponsor}`}
          aria-haspopup="dialog"
          aria-expanded={selected}
          title={`${sponsor} — ${contractReference}`}
          onClick={onEdit}
        />
      )}
    </article>
  );
}
