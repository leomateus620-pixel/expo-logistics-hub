import { z } from 'zod';
import { date, timestamp, uuid, limit } from '../../schema.ts';
import { tool, input } from '../definition.ts';

export const arenaTools = [
  tool('list_venue_events','arena','Eventos da Arena e Restaurante','Consulta datas, estado e público de eventos; omite notas internas, contatos e pagamentos.',input({ from_datetime: timestamp().optional(), to_datetime: timestamp().optional(), limit: limit() }),'venue','/eventos-restaurante-arena',['venue_events']),
  tool('venue_availability','arena','Disponibilidade de espaços','Consulta conflitos em espaços persistidos; não reserva nem altera ocupações.',input({ space_ids: z.array(uuid()).min(1).max(10), setup_start_at: timestamp(), teardown_end_at: timestamp() }),'venue','/eventos-restaurante-arena',['venue_spaces','venue_check_availability']),
  tool('venue_occupancy','arena','Ocupação','Consulta períodos de ocupações ativas.',input({ limit: limit() }),'venue','/eventos-restaurante-arena',['venue_occupancies']),
  tool('venue_counterparts','arena','Saldos de contrapartida','Consulta somente quantidades agregadas autorizadas.',input({ limit: limit() }),'venue_reports','/eventos-restaurante-arena',['venue_counterpart_balances']),
  tool('restaurant_alert','arena','Conflitos Restaurante × Agenda','Consulta alerta de conflito no intervalo. Não altera agenda nem reservas.',input({ from_date: date(), to_date: date() }),'venue','/cronograma-eventos',['cronograma_restaurant_alert']),
];
