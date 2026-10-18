import type { ComponentType, ReactNode } from 'react';
import { cn } from '@/lib/utils';
import '@/styles/cronograma-event-meta.css';

type MetaRole = 'owner' | 'commission' | 'guests' | 'location';

interface MetaPerson {
  key: string;
  label: string;
}

interface CronogramaEventMetaProps {
  owner?: string | null;
  commission?: string | null;
  guests: MetaPerson[];
  location?: string | null;
  layout?: 'stacked' | 'inline';
  className?: string;
}

function OwnerGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="8" r="4" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="2" />
      <path d="M4.5 20.5c0-3.9 3.36-6.5 7.5-6.5s7.5 2.6 7.5 6.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CommissionGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3.5 8.5 4.25L12 12 3.5 7.75 12 3.5Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m3.5 12.5 8.5 4.25 8.5-4.25M3.5 16.75 12 21l8.5-4.25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GuestsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="9" cy="8.5" r="3.5" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="2" />
      <path d="M2.75 20c0-3.45 2.8-5.75 6.25-5.75s6.25 2.3 6.25 5.75" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="M15.5 5.25a3.25 3.25 0 0 1 0 6.5M18 14.6c2 .75 3.25 2.6 3.25 5.4" stroke="currentColor" strokeOpacity="0.55" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function LocationGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 21s-7-5.75-7-11.25a7 7 0 0 1 14 0C19 15.25 12 21 12 21Z" fill="currentColor" fillOpacity="0.16" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <circle cx="12" cy="9.75" r="2.5" fill="currentColor" />
    </svg>
  );
}

const glyphs: Record<MetaRole, ComponentType> = {
  owner: OwnerGlyph,
  commission: CommissionGlyph,
  guests: GuestsGlyph,
  location: LocationGlyph,
};

const eyebrows: Record<MetaRole, string> = {
  owner: 'Responsável',
  commission: 'Comissão',
  guests: 'Convidados',
  location: 'Local',
};

function MetaItem({
  role,
  value,
  title,
  trailing,
}: {
  role: MetaRole;
  value: ReactNode;
  title?: string;
  trailing?: ReactNode;
}) {
  const Glyph = glyphs[role];
  return (
    <span className="cronograma-event-meta__item" data-role={role} title={title}>
      <span className="cronograma-event-meta__glyph">
        <Glyph />
      </span>
      <span className="cronograma-event-meta__text">
        <span className="sr-only">{eyebrows[role]}: </span>
        {value}
      </span>
      {trailing}
    </span>
  );
}

function firstName(label: string) {
  return label.trim().split(/\s+/)[0] ?? label;
}

export function formatGuestPreview(guests: MetaPerson[]) {
  if (guests.length === 1) return guests[0].label;
  const names = guests.map((guest) => firstName(guest.label));
  if (names.length <= 3) return `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
  return `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
}

export function CronogramaEventMeta({
  owner,
  commission,
  guests,
  location,
  layout = 'stacked',
  className,
}: CronogramaEventMetaProps) {
  const ownerLabel = owner?.trim() || null;
  const commissionLabel = !ownerLabel ? commission?.trim() || null : null;
  const locationLabel = location?.trim() || null;
  if (!ownerLabel && !commissionLabel && guests.length === 0 && !locationLabel) return null;

  return (
    <span className={cn('cronograma-event-meta', className)} data-layout={layout}>
      {ownerLabel && <MetaItem role="owner" value={ownerLabel} title={`Responsável: ${ownerLabel}`} />}
      {commissionLabel && <MetaItem role="commission" value={commissionLabel} title={`Comissão: ${commissionLabel}`} />}
      {guests.length > 0 && (
        <MetaItem
          role="guests"
          value={formatGuestPreview(guests)}
          title={`Convidados: ${guests.map((guest) => guest.label).join(' · ')}`}
          trailing={
            guests.length > 1 ? (
              <span className="cronograma-event-meta__count" aria-label={`${guests.length} convidados`}>
                {guests.length}
              </span>
            ) : undefined
          }
        />
      )}
      {locationLabel && <MetaItem role="location" value={locationLabel} title={`Local: ${locationLabel}`} />}
    </span>
  );
}
