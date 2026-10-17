/** Business text is untrusted data. This function never evaluates instructions. */
const PRIVATE_KEYS = /(?:token|secret|password|authorization|document(?:number|_number)?|cpf|cnpj|telefone|phone|email|e_mail|pix|renavam|storage.?path|raw_payload|internal.?notes|observa[cç][oõ]es|description|descricao|evidence|contact|buyer_?name|buyer_?trade_?name|responsible_?text)/i;

export function maskWorkerText(text: string): string {
  return text
    .replace(/\b(?:Bearer\s+)?eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/gi, '[token protegido]')
    .replace(/\b(?:sb_secret_|sb_publishable_|sk-)[A-Za-z0-9_-]+\b/g, '[chave protegida]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[e-mail protegido]')
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF protegido]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[documento protegido]')
    .replace(/(?:\+?55[\s.-]*)?\(?\b\d{2}\)?[\s.-]*9?\d{4}[\s.-]*\d{4}\b/g, '[telefone protegido]')
    .replace(/\b(?:PIX|chave\s+pix)\s*[:=]\s*[^\s,;]+/gi, 'PIX: [protegido]')
    .replace(/https?:\/\/[^\s]+/gi, '[link externo omitido]');
}

/** IDs remain available only under explicit identifier keys, for app citations/tool chaining. */
export function sanitizeWorkerData(value: unknown, depth = 0): unknown {
  if (depth > 8) return null;
  if (typeof value === 'string') return maskWorkerText(value).slice(0, 1200);
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => sanitizeWorkerData(item, depth + 1));
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value)) {
      // A document count is operational metadata, never a document number or
      // private file. Keep only the validated numerical field.
      if (key === 'document_count') { if (item === null || typeof item === 'number' && Number.isSafeInteger(item) && item >= 0) result[key] = item; continue; }
      if (PRIVATE_KEYS.test(key) || key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
      if (/^(?:id|.*_id|.*Id|lot_ids)$/.test(key) && (typeof item === 'string' || Array.isArray(item))) {
        const ids = Array.isArray(item) ? item : [item];
        result[key] = ids.every((id) => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) ? item : sanitizeWorkerData(item, depth + 1);
      } else result[key] = sanitizeWorkerData(item, depth + 1);
    }
    return result;
  }
  return null;
}

export function pickWorkerFields(value: unknown, fields: readonly string[]): Record<string, unknown> {
  const row = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  return sanitizeWorkerData(Object.fromEntries(fields.filter((field) => Object.prototype.hasOwnProperty.call(row, field)).map((field) => [field, row[field]]))) as Record<string, unknown>;
}

export const maskSensitiveText = maskWorkerText;
export const minimizeWorkerData = sanitizeWorkerData;
