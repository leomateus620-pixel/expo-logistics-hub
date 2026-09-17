import type { ReactNode } from 'react';

/** Structural content participates in the initial React commit and the global
 * shader barrier. A suspending child reaches the Canvas boundary; it cannot
 * reveal a late, independently hydrated fragment of the park. */
export function EssentialSceneLayer({ id, children }: { id: string; children: ReactNode }) {
  return <group name={`essential-${id}`}>{children}</group>;
}
