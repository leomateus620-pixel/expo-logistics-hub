export const CRONOGRAMA_LOCATION_OPTIONS = [
  { code: 'sala_voluntarios', label: 'SALA DOS VOLUNTÁRIOS' },
  { code: 'casa_fenasoja', label: 'CASA FENASOJA' },
  { code: 'centro_eventos_fenasoja', label: 'CENTRO DE EVENTOS FENASOJA' },
  { code: 'auditorio_centro_administrativo', label: 'AUDITÓRIO-CENTRO ADMINISTRATIVO' },
] as const;

export function locationCodeForText(value: string | null | undefined): string | null {
  return CRONOGRAMA_LOCATION_OPTIONS.find(({ label }) => label === value?.trim())?.code ?? null;
}