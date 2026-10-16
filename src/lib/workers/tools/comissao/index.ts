import { uuid, limit } from '../../schema.ts';
import { tool, input, commission } from '../definition.ts';

export const comissaoTools = [
  tool('my_commissions','comissao','Minhas comissões','Consulta comissões do vínculo persistido. Somente admin consulta a visão central.',input({ limit: limit() }),'commission','/portal',['commissions','commission_responsibles']),
  tool('commission_responsibles','comissao','Responsáveis da comissão','Consulta nomes e papéis da comissão autorizada, sem contatos.',input(commission()),'commission','/portal',['commissions','commission_responsibles']),
  tool('meeting_sessions','comissao','Reuniões autorizadas','Lista sessões visíveis com consentimento confirmado para consultar ações; sem áudio, transcrição ou anexos.',input({ commission_id: uuid(), event_id: uuid(), limit: limit() }),'commission','/cronograma-eventos',['commissions','cronograma_eventos_full','cronograma_evento_comissoes','agenda_meeting_sessions']),
  tool('meeting_actions','comissao','Ações de reunião','Consulta ações de sessão autorizada com consentimento confirmado. Não acessa transcrição nem anexos.',input({ commission_id: uuid(), event_id: uuid(), session_id: uuid(), limit: limit() }),'commission','/cronograma-eventos',['commissions','cronograma_eventos_full','cronograma_evento_comissoes','agenda_meeting_sessions','agenda_meeting_action_items']),
];
