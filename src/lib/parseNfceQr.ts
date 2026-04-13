/**
 * Parser para QR Codes de NFC-e / NF-e brasileiras.
 * Extrai dados parciais do payload URL ou texto bruto.
 */

export interface NfceQrData {
  accessKey?: string;    // chNFe — 44 dígitos
  amount?: number;       // vNF ou vTP
  issuerCnpj?: string;   // CNPJ do emissor (14 dígitos extraídos da chave)
  issuerName?: string;
  issueDate?: string;    // ISO date
  qrUrl?: string;        // URL original
  qrRaw?: string;        // Payload bruto
  invoiceNumber?: string;
  invoiceSeries?: string;
}

/** Tenta extrair chave de acesso de 44 dígitos de qualquer string */
function extractAccessKey(text: string): string | undefined {
  // Chave pode estar em param chNFe= ou p= ou ser os primeiros 44 dígitos no path
  const patterns = [
    /chNFe=(\d{44})/i,
    /[?&]p=(\d{44})/i,
    /(\d{44})/,
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return undefined;
}

/** Extrai CNPJ (posições 6-19) da chave de acesso */
function cnpjFromKey(key: string): string | undefined {
  if (key.length !== 44) return undefined;
  return key.substring(6, 20);
}

/** Extrai número da nota (posições 25-33) e série (posições 22-24) da chave */
function invoiceFromKey(key: string): { number?: string; series?: string } {
  if (key.length !== 44) return {};
  return {
    series: key.substring(22, 25).replace(/^0+/, '') || '1',
    number: key.substring(25, 34).replace(/^0+/, '') || undefined,
  };
}

/** Extrai data de emissão (AAMM nas posições 2-5) da chave */
function dateFromKey(key: string): string | undefined {
  if (key.length !== 44) return undefined;
  const yy = key.substring(2, 4);
  const mm = key.substring(4, 6);
  const year = 2000 + parseInt(yy, 10);
  const month = parseInt(mm, 10);
  if (month < 1 || month > 12) return undefined;
  return `${year}-${String(month).padStart(2, '0')}-01`;
}

/** Extrai valor de parâmetros de URL */
function extractAmount(url: string): number | undefined {
  // Tenta vNF= ou vTP= (valor total)
  const patterns = [/vNF=([\d.]+)/i, /vTP=([\d.]+)/i, /valor=([\d.,]+)/i];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (!isNaN(val) && val > 0) return val;
    }
  }
  return undefined;
}

/**
 * Parse principal — aceita qualquer string (URL ou texto).
 * Retorna dados parciais, nunca lança exceção.
 */
export function parseNfceQr(raw: string): NfceQrData {
  const trimmed = raw.trim();
  const result: NfceQrData = { qrRaw: trimmed };

  // Se parece URL, guardar
  if (trimmed.startsWith('http')) {
    result.qrUrl = trimmed;
  }

  // Extrair chave de acesso
  const key = extractAccessKey(trimmed);
  if (key) {
    result.accessKey = key;
    result.issuerCnpj = cnpjFromKey(key);
    result.issueDate = dateFromKey(key);
    const inv = invoiceFromKey(key);
    result.invoiceNumber = inv.number;
    result.invoiceSeries = inv.series;
  }

  // Extrair valor
  result.amount = extractAmount(trimmed);

  return result;
}

/** Verifica se o resultado tem dados úteis mínimos */
export function hasUsefulData(data: NfceQrData): boolean {
  return !!(data.accessKey || data.amount);
}
