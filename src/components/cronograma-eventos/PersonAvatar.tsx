import { useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { getPersonPhoto } from './personPhotos';

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
