import { OFFICIAL_REFERENCE_REVISION } from './officialReference2026';
import type { CommercialMapData } from '../types';

const STALE_EXPORURAL_MESSAGE = [
  'A revisão Exporural 2026.4 ainda não foi confirmada na base persistida.',
  'A visualização mantém exatamente as geometrias e áreas retornadas pelo banco até que um administrador execute a migração versionada.',
].join(' ');

function appendSourceMessage(current: string | null, message: string) {
  if (!current) return message;
  if (current.includes(message)) return current;
  return `${current} ${message}`;
}

/**
 * Database reads are authoritative. This guard deliberately never projects
 * reference geometry, official areas or metadata over persisted records.
 * Canonical changes become visible only after the versioned database migration
 * succeeds; until then the caller receives an explicit diagnostic.
 */
export function reconcileExporuralReference(data: CommercialMapData): CommercialMapData {
  if (
    data.source !== 'database'
    || data.project.referenceRevision === OFFICIAL_REFERENCE_REVISION
  ) {
    return data;
  }

  return {
    ...data,
    sourceMessage: appendSourceMessage(data.sourceMessage, STALE_EXPORURAL_MESSAGE),
  };
}
