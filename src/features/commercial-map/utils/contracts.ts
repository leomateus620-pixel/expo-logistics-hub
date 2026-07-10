export const CONTRACT_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
] as const;

export const CONTRACT_MAX_BYTES = 15 * 1024 * 1024;

export function validateContractFile(file: Pick<File, 'type' | 'size'>): string | null {
  if (!CONTRACT_MIME_TYPES.includes(file.type as (typeof CONTRACT_MIME_TYPES)[number])) return 'Envie um arquivo PDF ou DOCX.';
  if (file.size > CONTRACT_MAX_BYTES) return 'O contrato deve ter no máximo 15 MB.';
  if (file.size === 0) return 'O arquivo selecionado está vazio.';
  return null;
}
