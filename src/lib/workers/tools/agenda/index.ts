import { uuid, limit, listEventsInput, getEventInput } from '../../schema.ts';
import { tool, input, commission } from '../definition.ts';

export const agendaTools = [
  tool('list_events','agenda','Agenda Fenasoja','Consulta eventos visíveis no período. Descrições privadas e contatos são omitidos.',listEventsInput,'member','/cronograma-eventos',['cronograma_eventos_full']),
  tool('get_event','agenda','Detalhe do evento','Consulta dados operacionais seguros de um evento visível.',getEventInput,'member','/cronograma-eventos',['cronograma_eventos_full']),
  tool('list_subevents','agenda','Subeventos','Consulta subeventos visíveis do evento informado.',input({ event_id: uuid(), limit: limit() }),'member','/cronograma-eventos',['cronograma_eventos_full','cronograma_subeventos']),
  tool('commission_agenda','agenda','Agenda por comissão','Consulta agenda da comissão persistida, sob RLS.',input(commission()),'member','/cronograma-eventos',['commissions','cronograma_unit_agenda']),
  tool('commission_metrics','agenda','Métricas por comissão','Retorna métricas calculadas da comissão, sob RLS.',input({ commission_id: uuid() }),'member','/cronograma-eventos',['commissions','cronograma_unit_metrics']),
];
