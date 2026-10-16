/** Only the live human message can enable proposal tools. History, memory, web and attachments cannot. */
export type ProposalIntent = 'arena_note' | 'commercial_reserve' | 'commercial_negotiate' | 'routine';
export function proposalIntent(message: string): ProposalIntent | null {
  const text = message.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (/\b(apag\w*|exclu\w*|delet\w*|remov\w*|publique|publicar|rotacion\w*|pague|pagamento|pix|reembol\w*|financial_\w*|geometria|precific\w*|capabilit\w*|whatsapp|e-mail|email|sms|pacientes?)\b/.test(text)
    || /\b(confirm\w*|cancel\w*|revis\w*)\b.{0,35}\b(venda|pedido|sale_order)\b/.test(text)
    || /\b(envie?|mand[ae]|dispare?)\b.{0,50}\b(terceiros?|comprador\w*|expositor\w*|responsave\w*|push)\b/.test(text)) return null;
  if (/\b(rotina|briefing|todo dia|todos os dias|dias? uteis|diariamente|toda (segunda|terca|quarta|quinta|sexta|semana))\b/.test(text)
    && /\b(cri\w*|quer\w*|agend\w*|manda|mande|envie|mostr\w*|resum\w*|eventos?|conflitos?|vendas?|clima|briefing)\b/.test(text)) return 'routine';
  if (/\b(adicion\w*|salv\w*|cri\w*|inclu\w*)\b/.test(text) && /\bnota\b/.test(text) && /\b(arena|restaurante|evento)\b/.test(text)) return 'arena_note';
  if (/\b(reserv[ae]|reservar)\b/.test(text) && /\b(lote|espaco)\b/.test(text)) return 'commercial_reserve';
  if (/\b(inici\w*|abr[ae]|comec\w*)\b/.test(text) && /\bnegociac\w*\b/.test(text) && /\b(lote|espaco)\b/.test(text)) return 'commercial_negotiate';
  return null;
}
