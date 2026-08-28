import { memo } from 'react';
import { getPersonPhoto } from '@/components/cronograma-eventos/personPhotos';

export interface CommissionPerson {
  id: string;
  name: string;
  userId?: string | null;
  role?: string | null;
}

function initialsOf(name: string) {
  const parts = name
    .replace(/\(.*?\)/g, '')
    .split(/\s+/)
    .filter((part) => part.length > 2);
  const first = parts[0]?.[0] ?? name[0] ?? '?';
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return `${first}${last}`.toLocaleUpperCase('pt-BR');
}

interface AvatarProps {
  person: CommissionPerson;
  variant?: 'lead' | 'stack';
}

export function CommissionPersonAvatar({ person, variant = 'stack' }: AvatarProps) {
  const photo = getPersonPhoto(person.name, person.userId);
  const label = person.role ? `${person.name} — ${person.role}` : person.name;

  return (
    <span className="commission-person-avatar" data-variant={variant} title={label} aria-label={label} role="img">
      {photo ? (
        <img src={photo} alt="" aria-hidden="true" loading="lazy" decoding="async" draggable={false} />
      ) : (
        <span className="commission-person-avatar__initials" aria-hidden="true">
          {initialsOf(person.name)}
        </span>
      )}
    </span>
  );
}

interface CommissionPeopleStackProps {
  people: CommissionPerson[];
  max?: number;
}

function CommissionPeopleStack({ people, max = 4 }: CommissionPeopleStackProps) {
  if (people.length === 0) return null;
  const visible = people.slice(0, max);
  const overflow = people.length - visible.length;

  return (
    <span className="commission-people-stack" aria-label={`Integrantes: ${people.map((p) => p.name).join(', ')}`}>
      {visible.map((person) => (
        <CommissionPersonAvatar key={person.id} person={person} />
      ))}
      {overflow > 0 && (
        <span className="commission-people-stack__more" aria-hidden="true">
          +{overflow}
        </span>
      )}
    </span>
  );
}

export default memo(CommissionPeopleStack);
