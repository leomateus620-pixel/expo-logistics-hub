/**
 * Helpers to standardize free-text fields across the app.
 * Used in the Mobility module so member names, roles, responsible names
 * and CPFs are displayed (and saved) in a single canonical form.
 */

// Lowercase preposições/conectivos pt-BR
const LOWER_WORDS = new Set([
  'de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du', 'la', 'le', 'van', 'von', 'der', 'del',
]);

// Tokens that should remain fully uppercase (initials, common acronyms)
const KEEP_UPPER = new Set([
  'ti', 'rh', 'cpf', 'cnpj', 'rg', 'epi', 'ong',
]);

function capitalizeWord(word: string): string {
  if (!word) return word;
  // Hyphenated words: "maria-clara" -> "Maria-Clara"
  if (word.includes('-')) {
    return word.split('-').map(capitalizeWord).join('-');
  }
  // Apostrophe words: "dall'agnese" -> "Dall'Agnese", "d'avila" -> "D'Avila"
  if (word.includes("'")) {
    return word
      .split("'")
      .map((p, i) => (i === 0 ? capitalizeWord(p) : capitalizeWord(p)))
      .join("'");
  }
  // Words ending with a dot are initials: "g." -> "G."
  if (/^[a-zà-ú]\.$/.test(word)) {
    return word.charAt(0).toLocaleUpperCase('pt-BR') + '.';
  }
  return word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1);
}

/**
 * Title Case respeitando pt-BR.
 * - trim + colapsa espaços múltiplos
 * - converte aspas curvas em retas
 * - mantém preposições em minúsculo (exceto se for a primeira palavra)
 * - preserva siglas conhecidas em uppercase
 */
export function toTitleCase(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = String(raw)
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[\u2018\u2019\u02BC\u02B9]/g, "'");
  if (!cleaned) return '';

  const lower = cleaned.toLocaleLowerCase('pt-BR');
  const tokens = lower.split(' ');

  return tokens
    .map((token, idx) => {
      const bare = token.replace(/[^a-zà-ú]/gi, '');
      if (KEEP_UPPER.has(bare)) {
        return token.toLocaleUpperCase('pt-BR');
      }
      if (idx > 0 && LOWER_WORDS.has(bare)) {
        return token; // already lower
      }
      return capitalizeWord(token);
    })
    .join(' ');
}

/**
 * Normaliza um CPF para o formato 000.000.000-00.
 * - Aceita string com ou sem máscara
 * - Se não tiver exatamente 11 dígitos, devolve o valor original (apenas trim)
 *   para não destruir o dado bruto que o usuário cadastrou.
 */
export function formatCpf(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed) return '';
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length !== 11) {
    // Mantém o que o usuário digitou (CPF inválido / outro tipo de identificador)
    return trimmed;
  }
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
}

/**
 * Display-only uppercase for human-readable, user-entered text.
 * Keeps pt-BR accents (comunicação → COMUNICAÇÃO) and never touches
 * technical values: e-mails, URLs, tokens, ids and file paths are returned
 * untouched so we don't corrupt machine-readable content.
 */
const TECHNICAL_VALUE = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|www\.)|^[^\s@]+@[^\s@]+\.[^\s@]+$|^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function toDisplayUpper<T extends string | null | undefined>(raw: T): T {
  if (raw == null) return raw;
  const value = String(raw);
  if (!value.trim()) return raw;
  if (TECHNICAL_VALUE.test(value.trim())) return raw;
  return value.toLocaleUpperCase('pt-BR') as T;
}
