import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getPersonPhoto } from './personPhotos';
import '@/styles/cronograma-registration-interactions.css';

interface PersonAvatarProps {
  name?: string | null;
  /** Rendered when the person has no portrait or the image fails to load. */
  fallback: ReactNode;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

/**
 * Circular portrait for the members that have an official photo, with a safe
 * fallback to the module's existing initials/icon treatment.
 */
export function PersonAvatar({ name, fallback, size = 'md', className }: PersonAvatarProps) {
  const [failed, setFailed] = useState(false);
  const photo = getPersonPhoto(name);

  if (!photo || failed) return <>{fallback}</>;

  return (
    <img
      src={photo}
      alt=""
      aria-hidden="true"
      loading="lazy"
      decoding="async"
      draggable={false}
      onError={() => setFailed(true)}
      data-size={size}
      className={cn('cronograma-person-avatar', className)}
    />
  );
}

export { getPersonPhoto };

interface EventPeopleAvatarsProps {
  /** Responsible first, guests after — only people with a portrait render. */
  people: Array<{ key: string; label: string; isPrimary?: boolean }>;
  className?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
}

/**
 * Compact portrait strip shown under the event title on the main timeline.
 * Renders nothing when none of the linked people has an official photo.
 */
export function EventPeopleAvatars({ people, className, size = 'sm' }: EventPeopleAvatarsProps) {
  const withPhoto = people.filter((person) => getPersonPhoto(person.label));
  if (withPhoto.length === 0) return null;

  return (
    <span className={cn('cronograma-person-avatar-row', className)}>
      {withPhoto.map((person, index) => (
        <PersonAvatar
          key={person.key}
          name={person.label}
          size={size}
          className={index === 0 && person.isPrimary ? 'is-primary' : undefined}
          fallback={null}
        />
      ))}
    </span>
  );
}
