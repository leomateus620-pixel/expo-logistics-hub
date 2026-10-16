import { limit, listTransportsInput } from '../../schema.ts';
import { tool, input } from '../definition.ts';

export const logisticaTools = [
  tool('list_transports','logistica','Transportes','Consulta estados e horários dos transportes; omite contatos, passageiros individuais e observações privadas.',listTransportsInput,'logistics','/transports',['transports']),
  tool('vehicle_summary','logistica','Frota','Consulta disponibilidade e KM; omite placas, documentos e responsáveis individuais.',input({ limit: limit() }),'logistics','/vehicles',['vehicles']),
  tool('cart_reservations','logistica','Carrinhos','Consulta períodos e estados de reservas, sem contatos.',input({ limit: limit() }),'logistics','/electric-carts',['cart_reservations']),
  tool('scooter_reservations','logistica','Patinetes','Consulta períodos e estados de reservas, sem contatos.',input({ limit: limit() }),'logistics','/scooters',['scooter_reservations']),
  tool('logistics_schedules','logistica','Escalas','Consulta períodos das escalas, sem contatos pessoais.',input({ limit: limit() }),'logistics','/ver-escala',['schedules']),
  tool('transport_weather','logistica','Clima nos transportes','Consulta snapshots existentes visíveis por JWT; informa validade, sem atualizar dados nem chamar funções com service role.',input({ limit: limit() }),'logistics','/transports',['transport_weather_snapshots']),
];
