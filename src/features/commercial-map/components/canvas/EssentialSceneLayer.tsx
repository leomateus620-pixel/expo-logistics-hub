import type { ReactNode } from 'react';
import { usePublicScenePolicy } from './PublicScenePolicyContext';
import { PublicContextGroup } from './PublicContextGroup';
import { DeferredSceneLayer } from './DeferredSceneLayer';

const PUBLIC_SECONDARY_CONTEXT = new Set(['territorial-context', 'residential-district', 'nations-context']);

/** Structural content participates in the initial React commit and the global
 * shader barrier. A suspending child reaches the Canvas boundary; it cannot
 * reveal a late, independently hydrated fragment of the park. */
export function EssentialSceneLayer({ id, children }: { id: string; children: ReactNode }) {
  const publicPolicy = usePublicScenePolicy();
  if (publicPolicy && (PUBLIC_SECONDARY_CONTEXT.has(id) || id.startsWith('landmark:'))) {
    return <DeferredSceneLayer id={id} priority={30}><PublicContextGroup>{children}</PublicContextGroup></DeferredSceneLayer>;
  }
  return <group name={`essential-${id}`}>{children}</group>;
}
