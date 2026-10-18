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
      <path d="M5 20.25c0-3.7 3.13-6.25 7-6.25s7 2.55 7 6.25" fill="currentColor" fillOpacity="0.18" />
      <circle cx="12" cy="8.25" r="3.75" fill="currentColor" fillOpacity="0.18" />
      <path d="M5 20.25c0-3.7 3.13-6.25 7-6.25s7 2.55 7 6.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="12" cy="8.25" r="3.75" stroke="currentColor" strokeWidth="1.7" />
      <path d="m10.4 16.4 1.6 1.9 1.6-1.9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CommissionGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="m12 3.5 8.5 4.25L12 12 3.5 7.75 12 3.5Z" fill="currentColor" fillOpacity="0.18" />
      <path d="m12 3.5 8.5 4.25L12 12 3.5 7.75 12 3.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <path d="m3.5 12 8.5 4.25L20.5 12M3.5 16.25 12 20.5l8.5-4.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GuestsGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="16.75" cy="7.5" r="2.6" fill="currentColor" fillOpacity="0.14" />
      <path d="M15.6 13.4c3 .2 5.15 2.2 5.15 5.1" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="16.75" cy="7.5" r="2.6" stroke="currentColor" strokeOpacity="0.6" strokeWidth="1.6" />
      <path d="M3.25 19.75c0-3.3 2.6-5.6 5.75-5.6s5.75 2.3 5.75 5.6" fill="currentColor" fillOpacity="0.2" />
      <circle cx="9" cy="8.5" r="3.25" fill="currentColor" fillOpacity="0.2" />
      <path d="M3.25 19.75c0-3.3 2.6-5.6 5.75-5.6s5.75 2.3 5.75 5.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <circle cx="9" cy="8.5" r="3.25" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function LocationGlyph() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <ellipse cx="12" cy="20.5" rx="4.5" ry="1.1" fill="currentColor" fillOpacity="0.22" />
      <path d="M12 19.25s-6.25-5.2-6.25-10.1a6.25 6.25 0 0 1 12.5 0c0 4.9-6.25 10.1-6.25 10.1Z" fill="currentColor" fillOpacity="0.18" />
      <path d="M12 19.25s-6.25-5.2-6.25-10.1a6.25 6.25 0 0 1 12.5 0c0 4.9-6.25 10.1-6.25 10.1Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
      <circle cx="12" cy="9.1" r="2.35" fill="currentColor" />
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
        <small>{eyebrows[role]}</small>
        <span>{value}</span>
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
