import { z } from 'zod';
import { uuid, limit } from '../../schema.ts';
import { tool, input, project } from '../definition.ts';

export const mapaTools = [
  tool('map_projects','mapa','Projetos comerciais','Lista projetos ativos visíveis.',input({ limit: limit() }),'map','/mapa-comercial',['map_projects']),
  tool('map_segments','mapa','Segmentos do mapa','Consulta segmentos ativos do projeto autorizado.',input(project()),'map','/mapa-comercial',['map_projects','map_segments']),
  tool('map_entities','mapa','Identificação de pavilhões','Consulta entidades persistidas para relacionar lote, pavilhão e segmento. Não retorna geometria.',input({ ...project(), segment_id: uuid().optional() }),'map','/mapa-comercial',['map_projects','map_entities']),
  tool('map_inventory','mapa','Inventário comercial','Lista lotes ativos com identidade persistida; distingue SALE_OPEN de SOLD. Total refere-se ao filtro e registros podem ser parciais.',input({ ...project(), status: z.enum(['AVAILABLE','BLOCKED','RESERVED','IN_NEGOTIATION','SALE_OPEN','SOLD']).optional() }),'map','/mapa-comercial',['map_projects','commercial_lots']),
  tool('map_prices','mapa','Preços autorizados','Consulta preços oficiais sob RLS; nunca altera valores.',input({ ...project(), pavilion: z.string().max(80).optional() }),'map','/mapa-comercial',['map_projects','commercial_lot_pricing_2028']),
  tool('map_segment_inventory','mapa','Completude do segmento','Retorna contagens estruturais, sem inferir inventário comercial.',input({ project_id: uuid(), segment_id: uuid() }),'map','/mapa-comercial',['map_projects','map_segments','get_commission_map_segment_inventory']),
  tool('list_sale_orders','mapa','Vendas em aberto e confirmadas','Consulta estados e quantidade de itens; omite comprador, contatos, valores e pagamentos.',input({ ...project(), status: z.enum(['PENDING','SIGNED','PARTIAL','CANCELLED_PARTIAL','LEGACY']).optional(), has_document: z.boolean().optional() }),'map_sales','/mapa-comercial',['map_projects','list_commercial_sale_orders']),
  tool('sale_order_detail','mapa','Itens de uma venda','Consulta itens e estado de assinatura. Não confirma, cancela ou revisa venda; não retorna dados pessoais nem parcelas.',input({ project_id: uuid(), order_id: uuid() }),'map_sales','/mapa-comercial',['map_projects','lot_sale_orders','get_commercial_sale_order_detail']),
  tool('sale_order_contract_summary','mapa','Abrangência dos contratos','Consulta somente quantidade e lotes abrangidos pelos contratos autorizados de uma venda; sem arquivos, contatos ou pagamentos.',input({ project_id: uuid(), order_id: uuid() }),'map_contracts','/mapa-comercial',['map_projects','lot_sale_orders','get_commercial_sale_order_detail']),
];
