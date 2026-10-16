import { timestamp } from '../../schema.ts';
import { tool, input } from '../definition.ts';

export const interesseTools = [
  tool('interest_summary','interesse','Interesse por área','Consulta estatísticas agregadas dos links da organização; sem token ou identidade dos visitantes.',input({ from_datetime: timestamp().optional(), to_datetime: timestamp().optional() }),'analytics','/mapa-comercial',['workers_interest_summary']),
  tool('public_links_overview','interesse','Links por área','Consulta nomes e estado dos links da organização; nunca retorna URLs públicas ou tokens.',input(),'analytics','/mapa-comercial',['workers_public_links_overview']),
];
