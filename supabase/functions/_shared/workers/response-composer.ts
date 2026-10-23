import { isObject, redactWorkerText, validateCitations, type ReadResult, type WorkerCitation, WorkerError, type WorkerRequest } from './contracts.ts';
import { encodeWorkerResponse, type WorkerResponse, type WorkerResponseBlock, workerResponseSchema, workerQueryFiltersSchema } from './response-contract.ts';
import { type WorkerIntent } from './intent.ts';
import { composeCommercialReportResponse } from './commercial-report-response.ts';

export interface ToolEvidence { tool: string; input: Record<string, unknown>; result: ReadResult }
export function validateToolEvidence(result: ReadResult): WorkerCitation[] {
  if (typeof result.summary !== 'string' || result.summary.length > 4000 || !Array.isArray(result.records) || result.records.length > 100) throw new WorkerError('invalid_tool_result', 502);
  if (result.total !== undefined && (!Number.isSafeInteger(result.total) || result.total < 0)) throw new WorkerError('invalid_tool_result', 502);
  const citations = validateCitations(result.citations);
  if (!citations.length && (result.records.length > 0 || Number(result.total ?? 0) > 0)) throw new WorkerError('missing_evidence', 502);
  return citations;
}
const clean = (value: unknown): string => redactWorkerText(String(value ?? '')).replace(/[<>`]/g, '').trim();
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new WorkerError('invalid_tool_result', 502);
  return value;
};
const numeric = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) throw new WorkerError('invalid_tool_result', 502);
  return value;
};
const money = (value: unknown) => integer(value) / 100;
const domainStatus: Record<string, string> = {
  SALE_OPEN: 'Venda em andamento', SOLD: 'Vendido', AVAILABLE: 'Disponível', BLOCKED: 'Bloqueado', RESERVED: 'Reservado',
  IN_NEGOTIATION: 'Em negociação', aguardando_definicao: 'Aguardando definição', aguardando_responsavel: 'Aguardando responsável',
  CONFIRMED: 'Venda confirmada', OPEN: 'Venda em andamento', PARTIALLY_CONFIRMED: 'Venda parcialmente confirmada', PARTIALLY_CANCELLED: 'Venda parcialmente cancelada', CANCELLED: 'Cancelado',
  SIGNED: 'Assinatura confirmada', PENDING_SIGNATURE: 'Aguardando assinatura', LEGACY_UNVERIFIED: 'Histórico sem confirmação verificada',
  planejado: 'Planejado', confirmado: 'Confirmado', pendente: 'Pendente', cancelado: 'Cancelado', cancelada: 'Cancelada', realizada: 'Realizada',
  scheduled: 'Agendado', confirmed: 'Confirmado', cancelled: 'Cancelado', completed: 'Concluído', active: 'Ativo', inactive: 'Inativo',
  disponivel: 'Disponível', em_uso: 'Em uso', manutencao: 'Em manutenção', rascunho: 'Rascunho', em_andamento: 'Em andamento', concluido: 'Concluído',
  primary: 'Responsável principal', president: 'Presidente', vice_president: 'Vice-presidente', member: 'Membro', coordinator: 'Coordenador',
  ORDER: 'Pedido de venda', LEGACY: 'Registro histórico', LOT: 'Espaço comercial', ORDER_ITEMS: 'Itens do pedido',
};
export function humanValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('pt-BR') : '—';
  if (typeof value !== 'string') return '';
  const text = clean(value);
  if (Object.prototype.hasOwnProperty.call(domainStatus, text)) return domainStatus[text];
  if (/^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/.test(text)) {
    const date = new Date(text.length === 10 ? `${text}T12:00:00-03:00` : text);
    if (!Number.isNaN(date.getTime())) {
      const day = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(date);
      if (text.length === 10) return day;
      return `${day} ${new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(date).replace(':', 'h')}`;
    }
  }
  // Unknown machine states are never presented as a guessed translation.
  if (/^[A-Z][A-Z0-9_]{2,}$/.test(text) || /^[a-z]+(?:_[a-z]+)+$/.test(text)) return 'Situação não detalhada';
  return text.slice(0, 180);
}

const discovery = new Set(['map_projects', 'list_projects', 'financial_editions', 'map_segments', 'map_entities']);
const columns: Record<string, string> = {
  title: 'Evento', titulo: 'Transporte', name: 'Nome', nome: 'Nome', displayName: 'Área', display_name: 'Nome',
  status: 'Situação', start_at: 'Início', end_at: 'Término', start_date: 'Data inicial', end_date: 'Data final', start_time: 'Início', end_time: 'Término',
  inicio_em: 'Início', fim_em: 'Término', data_inicio: 'Data inicial', data_fim: 'Data final', location: 'Local', location_name: 'Local',
  block: 'Quadra', lot_number: 'Número do espaço', official_area_sqm: 'Área (m²)', visits: 'Visitas', sessions: 'Sessões', lotSelections: 'Seleções de espaços', detailViews: 'Detalhes consultados',
  relationship_role: 'Papel', is_primary: 'Responsável principal', granted_quantity: 'Concedido', reserved_quantity: 'Reservado', consumed_quantity: 'Consumido', remaining_quantity: 'Disponível',
  marca: 'Marca', modelo: 'Modelo', categoria: 'Categoria', km_atual: 'Quilometragem (km)', city_name: 'Cidade', temperature_c: 'Temperatura (°C)', current_condition_label: 'Condição do tempo', fetched_at: 'Atualizado em', valid_until: 'Válido até',
  due_date: 'Prazo', reference: 'Pedido', item_count: 'Espaços no pedido', displayName_: 'Nome', publicIdentifier: 'Espaço', lotNumber: 'Número do espaço', areaSnapshot: 'Área (m²)', contractState: 'Assinatura', lotStatus: 'Situação',
  starts_at: 'Início', ends_at: 'Término', setup_start_at: 'Início da ocupação', teardown_end_at: 'Fim da ocupação', event_date: 'Data inicial', event_end_date: 'Data final',
};
const preferred = ['title', 'titulo', 'name', 'nome', 'displayName', 'display_name', 'publicIdentifier', 'reference', 'start_at', 'start_date', 'inicio_em', 'status', 'location', 'visits', 'remaining_quantity'];
const domainNames = { agenda: 'Agenda', arena: 'Arena e Restaurante', mapa: 'Mapa Comercial', interesse: 'Interesse por áreas', comissao: 'Comissões', logistica: 'Logística', caixa: 'Financeiro', radar: 'Pesquisa institucional' };
function asTable(evidence: ToolEvidence): WorkerResponseBlock | null {
  const records = evidence.result.records.filter(isObject).slice(0, 12);
  const found = [...new Set(records.flatMap(record => Object.keys(record)))].filter(key => columns[key] && records.some(record => typeof record[key] !== 'object'));
  const keys = [...preferred.filter(key => found.includes(key)), ...found.filter(key => !preferred.includes(key))].slice(0, 5);
  return records.length && keys.length ? { type: 'table', columns: keys.map(key => columns[key]), rows: records.map(record => keys.map(key => humanValue(record[key]))) } : null;
}
const unavailable = 'Não obtive dados verificáveis para esse pedido. Informe o período ou o registro que deseja consultar.';

export function composeWorkerResponse(request: WorkerRequest, intent: WorkerIntent, evidence: ToolEvidence[], now: Date): { content: string; citations: WorkerCitation[] } {
  if(intent.kind==='domain_query'){
    const specialized=[...evidence].reverse().find(item=>['map_commercial_report_query','map_inventory_summary','agenda_query','agenda_personal_summary','agenda_people_ranking'].includes(item.tool));
    const kind= specialized ? ({map_commercial_report_query:'map_report',map_inventory_summary:'map_inventory',agenda_query:'agenda_query',agenda_personal_summary:'agenda_personal',agenda_people_ranking:'agenda_ranking'} as const)[specialized.tool] : undefined;
    if(kind)return composeWorkerResponse(request,{...intent,kind,worker:kind.startsWith('map_')?'mapa':'agenda'},evidence,now);
  }
  const sources = evidence.flatMap(item => validateToolEvidence(item.result));
  const citations = [...new Map(sources.map(source => [source.url, source])).values()].slice(0, 8);
  const response: WorkerResponse = { version: 1, worker: intent.worker, intent: intent.kind, summary: unavailable,
    metadata: { organizationId: request.orgId, timezone: 'America/Sao_Paulo', scope: 'Dados autorizados para seu usuário', updatedAt: now.toISOString(), completeness: 'unavailable', notes: [], ...(intent.kind === 'agenda_personal' ? { filters: { relationship: intent.relationship } } : {}), ...(intent.period ? { period: intent.period } : {}), ...(intent.editionYear ? { edition: `Fenasoja ${intent.editionYear}` } : {}) }, blocks: [] };
  const expected = { map_report:'map_commercial_report_query',map_sales: 'map_sales_overview', map_contracts:'map_sales_records_summary', map_documents:'sale_order_contract_summary', map_receipts:'', map_inventory: 'map_inventory_summary', agenda_query: 'agenda_query', agenda_personal: 'agenda_personal_summary', agenda_ranking: 'agenda_people_ranking', agenda_commission_ranking:'agenda_commission_ranking', agenda_person:'agenda_person_events', agenda_commission:'agenda_query', institutional_president: 'workers_institutional_president', domain_query: '' }[intent.kind];
  const candidates = evidence.filter(item => item.tool === expected);
  const main = [...candidates].reverse().find(item => {
    if(!intent.previousPeriod)return true;
    const scope = item.result.records.find(isObject)?.scope;
    return isObject(scope)&&isObject(scope.period)&&scope.period.from===intent.period?.from&&scope.period.to===intent.period?.to;
  });
  const record = main?.result.records.find(isObject);
  const financialEvidence = [...evidence].reverse().find(item => ['financial_edition_summary', 'financial_budget_execution', 'financial_expense_comparison'].includes(item.tool));
  const financialRecord = financialEvidence?.result.records.find(isObject);
  const financialEdition = isObject(financialRecord?.edition) ? financialRecord.edition : undefined;
  const financialYears = [...new Set(`${financialEdition?.code ?? ''} ${financialEdition?.label ?? ''}`.match(/20\d{2}/g) ?? [])];
  if (financialEdition?.label) response.metadata.edition = clean(financialEdition.label);
  if (intent.commercialClarification) {
    response.summary=intent.commercialClarification==='contract_unit'?'Você quer consultar documentos anexados ou vendas com assinatura confirmada?':intent.commercialClarification==='company_identity'?'Qual empresa ou expositor deseja consultar? Informe o nome empresarial para localizar a identidade correta.':intent.commercialClarification==='contract_identity'?'Qual documento deseja verificar? Informe a referência contratual exata para conferir a abrangência do pedido.':intent.commercialClarification==='comparison_periods'?'Quais dois períodos deseja comparar? Informe as datas e se a comparação considera cadastro ou assinatura.':'A posição em uma data passada exige histórico reconstruível. Posso consultar a situação atual ou filtrar cadastros e assinaturas por período.';
    response.blocks.push({type:'clarification',question:response.summary,...(intent.commercialClarification==='contract_unit'?{options:['Documentos anexados','Vendas com assinatura confirmada']}:intent.commercialClarification==='historical_position'?{options:['Situação atual','Cadastradas no período','Assinadas no período']}:{})});
  } else if (intent.kind==='map_report'&&record&&!record.needs_clarification&&!record.needsClarification) {
    return composeCommercialReportResponse(request,intent,record,citations);
  } else if (financialEvidence && intent.editionYear && (financialYears.length !== 1 || Number(financialYears[0]) !== intent.editionYear)) {
    response.summary = `Não consegui confirmar a edição financeira ${intent.editionYear} nesta consulta. Qual edição você deseja consultar?`;
    response.blocks.push({ type: 'clarification', question: response.summary });
  } else if (financialEvidence && intent.period) {
    delete response.metadata.period;
    response.summary = 'Este resumo financeiro abrange a edição inteira. O recorte de datas solicitado precisa ser consultado no Financeiro.';
    response.blocks.push({ type: 'empty', message: 'Abra o Financeiro para conferir o intervalo. Os totais da edição não foram apresentados como valores do período.' });
  } else if (record?.needs_clarification === true || record?.needsClarification === true) {
    response.summary = clean(record.question) || 'Qual edição ou projeto você deseja consultar?';
    response.blocks.push({ type: 'clarification', question: response.summary, options: Array.isArray(record.options) ? record.options.map(clean).filter(Boolean).slice(0, 8) : [],
      ...(Array.isArray(record.choices)?{choices:record.choices.filter(isObject).slice(0,8).map(choice=>({id:String(choice.id),name:clean(choice.name)}))}:{}) });
  } else if (record && intent.kind === 'institutional_president' && record.evidence_kind === 'official_content') {
    response.metadata.completeness = 'complete'; response.metadata.edition = clean(record.edition);
    response.summary = `${clean(record.name)} é o presidente da ${clean(record.edition)}, conforme a publicação oficial consultada.`;
    response.blocks.push({ type: 'profile', name: clean(record.name), role: clean(record.role), edition: clean(record.edition), verifiedOn: clean(record.verified_on), publishedOn: clean(record.published_on), details: [] });
    response.metadata.notes.push('Informação vinculada à edição e à publicação indicada. A fonte não comprova nascimento, ocupação profissional ou duração do mandato.');
  } else if(intent.kind==='map_documents'&&main&&main.result.truncated!==true&&main.result.total!==undefined){
    const documents=main.result.records.filter(isObject);
    const versions=intent.commercialMetric==='document_versions';
    const count=versions?documents.reduce((sum,row)=>sum+integer(row.version_count),0):integer(main.result.total);
    response.metadata.completeness='complete';
    response.summary=`${count.toLocaleString('pt-BR')} ${versions?count===1?'versão de documento':'versões de documentos':count===1?'documento anexado':'documentos anexados'} ${versions?'no':'ao'} pedido consultado.`;
    response.blocks.push({type:'indicators',items:[{label:versions?'Versões de documentos':'Documentos anexados',value:count,unit:'count'}]});
    if(documents.length)response.blocks.push({type:'table',columns:['Documento','Lotes abrangidos','Versão ativa','Versões'],rows:documents.slice(0,20).map((row,index)=>[
      `Documento ${index+1}`,Array.isArray(row.lotIds)?new Set(row.lotIds).size.toLocaleString('pt-BR'):'Não informado',humanValue(row.activeVersion),humanValue(row.version_count),
    ])});
    response.metadata.notes.push('Documentos anexados e suas versões não comprovam assinatura do agrupamento nem pagamento recebido. A abrangência permanece vinculada aos lotes explícitos do documento.');
  } else if (record && intent.kind !== 'domain_query') {
    const scope = isObject(record.scope) ? record.scope : {};
    const metrics = isObject(record.metrics) ? record.metrics : record;
    if (scope.complete !== true) throw new WorkerError('incomplete_aggregate', 502);
    if (intent.editionYear && intent.kind.startsWith('map_') && scope.edition_year !== intent.editionYear) throw new WorkerError('scope_mismatch', 502);
    if (intent.period && (!isObject(scope.period) || scope.period.from !== intent.period.from || scope.period.to !== intent.period.to)) throw new WorkerError('scope_mismatch', 502);
    response.metadata.completeness = 'complete';
    if (typeof scope.edition_year === 'number') response.metadata.edition = `Fenasoja ${integer(scope.edition_year)}`;
    if (typeof scope.edition_label === 'string') response.metadata.edition = clean(scope.edition_label);
    if (typeof scope.project_id === 'string') response.metadata.projectId = scope.project_id;
    if (typeof scope.as_of === 'string') response.metadata.updatedAt = scope.as_of;
    if (intent.kind === 'map_inventory' || intent.kind === 'agenda_query' || intent.kind==='agenda_commission') {
      const total=integer(metrics.total), filters=isObject(scope.filters)?scope.filters:{};
      const parsedFilters=workerQueryFiltersSchema.safeParse({...filters,group_by:scope.group_by});
      if(!parsedFilters.success)throw new WorkerError('invalid_tool_result',502);
      response.metadata.filters={...response.metadata.filters,query:parsedFilters.data};
      if(intent.kind==='map_inventory')delete response.metadata.period; // Current inventory has no historical-position semantics.
      const rows=Array.isArray(record.rows)?record.rows.filter(isObject):[];
      const groups=Array.isArray(record.groups)?record.groups.filter(isObject).map(group=>({label:clean(group.label),value:integer(group.count)})):[];
      if(groups.reduce((sum,group)=>sum+group.value,0)!==total||new Set(groups.map(group=>group.label)).size!==groups.length)throw new WorkerError('invalid_tool_result',502);
      const isMap=intent.kind==='map_inventory';
      const question=request.message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const unitName=isMap?'espaços comerciais':'eventos';
      const singular=isMap?'espaço comercial':'evento';
      const context=[isMap?clean(scope.project_name):intent.period?.label,filters.status?humanValue(filters.status):'',filters.location?clean(filters.location):'',filters.block?`quadra ${clean(filters.block)}`:''].filter(Boolean).join(' · ');
      response.summary=`${total.toLocaleString('pt-BR')} ${total===1?singular:unitName} no recorte consultado${context?` — ${context}`:''}.`;
      if(intent.kind==='agenda_commission'){
        response.summary=`${intent.entityName??'A comissão consultada'} tem ${total.toLocaleString('pt-BR')} ${total===1?'evento vinculado':'eventos vinculados'} em ${intent.period?.label??'seu período de consulta'}.`;
        response.metadata.filters={...response.metadata.filters,commissionId:intent.entityId};
      }
      if(!total){response.blocks.push({type:'empty',message:'Nenhum registro atende aos filtros informados no seu acesso atual. Tente outro período ou ajuste o recorte.'});}
      else if(intent.presentation==='comparison'){
        const previous=candidates.find(item=>{
          if(item===main)return false;
          const other=item.result.records.find(isObject)?.scope;
          if(!isObject(other)||other.complete!==true)return false;
          if(intent.previousPeriod)return isObject(other.period)&&other.period.from===intent.previousPeriod.from&&other.period.to===intent.previousPeriod.to&&JSON.stringify(other.filters)===JSON.stringify(scope.filters);
          return isMap&&other.project_id===scope.project_id&&other.edition_year===scope.edition_year;
        });
        const priorRecord=previous?.result.records.find(isObject),priorMetrics=isObject(priorRecord?.metrics)?priorRecord.metrics:undefined,priorScope=isObject(priorRecord?.scope)?priorRecord.scope:undefined;
        if(priorMetrics&&priorScope){
          const previousFilters=isObject(priorScope.filters)?priorScope.filters:{};
          response.summary=`Comparação de ${unitName} nos dois recortes solicitados.`;
          response.blocks.push({type:'comparison',title:isMap?'Disponibilidade em comparação':'Agenda em comparação',unit:'count',currentLabel:intent.period?.label??(filters.block?`Quadra ${clean(filters.block)}`:'Primeiro recorte'),previousLabel:intent.previousPeriod?.label??(previousFilters.block?`Quadra ${clean(previousFilters.block)}`:'Segundo recorte'),items:[{label:isMap?'Espaços comerciais':'Eventos distintos',current:total,previous:integer(priorMetrics.total)}]});
        }else{
          response.summary='Quais dois recortes você deseja comparar?';response.blocks.push({type:'clarification',question:'Informe os dois períodos ou as duas áreas para comparar com os mesmos critérios.'});
        }
      } else if(intent.presentation==='pie_chart'||intent.presentation==='bar_chart'||/distribui|por (?:situacao|categoria|local|quadra|dia)/.test(question)){
        const title=`${isMap?'Espaços':'Eventos'} por ${{status:'situação',block:'quadra',location:'local',category:'categoria',weekday:'dia da semana',day:'dia'}[String(scope.group_by)]??'grupo'}`;
        const type=intent.presentation==='pie_chart'||intent.presentation==='direct'&&groups.length<=6&&['status','category'].includes(String(scope.group_by))?'pie_chart':'bar_chart';
        response.blocks.push({type,title,unit:'count',data:groups,population:groups.length,complete:true});
      }else if(intent.presentation==='table'||/\bquais\b|\bliste\b|\blistar\b|\bmostre\b|\bprogramacao\b/.test(question)){
        response.blocks.push({type:'table',columns:isMap?['Espaço','Quadra','Situação','Área (m²)']:['Evento','Data','Horário','Local','Situação'],rows:rows.map(row=>isMap?[clean(row.name),humanValue(row.block),humanValue(row.status),humanValue(row.area_sqm)]:[clean(row.title),humanValue(row.start_date),[row.start_time,row.end_time].filter(Boolean).map(clean).join(' – ')||'Não informado',humanValue(row.location),humanValue(row.status)])});
        if(total>rows.length)response.metadata.notes.push(`Os indicadores consideram todos os ${total.toLocaleString('pt-BR')} ${unitName}; a tabela mostra os primeiros ${rows.length} em ordem de consulta.`);
      }else{
        const items:Array<{label:string;value:number;unit:'count'|'minutes'}>=[{label:isMap?'Espaços no recorte':'Eventos distintos',value:total,unit:'count'}];
        if(isMap&&/area|metros|metragem/.test(question)&&integer(metrics.missing_area)<total)items.push({label:'Área oficial conhecida (m²)',value:numeric(metrics.area_sqm),unit:'count'});
        if(isMap&&integer(metrics.missing_area)===total&&/area|metros|metragem/.test(question))response.blocks.push({type:'summary',text:'Os espaços deste recorte ainda não têm área oficial informada.'});
        if(!isMap&&/horarios validos|horario valido/.test(question)){
          items[0]={label:'Eventos com horários válidos',value:integer(metrics.valid_duration_events),unit:'count'};
          response.summary=`${integer(metrics.valid_duration_events)} de ${total} eventos possuem horários válidos para calcular a duração prevista.`;
        }else if(!isMap&&/duracao|media|horas/.test(question)&&metrics.average_duration_minutes!==null)items.push({label:'Duração média prevista',value:numeric(metrics.average_duration_minutes),unit:'minutes'});
        response.blocks.push({type:'indicators',items});
      }
      if(isMap){
        if(metrics.missing_area)response.metadata.notes.push(`${integer(metrics.missing_area)} espaços não têm área oficial informada; a área conhecida não inclui esses registros.`);
        response.metadata.notes.push('Situação atual dos espaços ativos. Disponibilidade e infraestrutura vêm do cadastro; não comprovam reserva, venda, assinatura ou recebimento.');
      }else{
        response.metadata.notes.push('Eventos distintos que se sobrepõem ao período. Distribuições usam a data de início. Cancelados são excluídos, exceto quando pedidos explicitamente.');
        response.metadata.notes.push('Vínculo não comprova presença e data passada não comprova realização. A duração é a prevista no intervalo completo do evento.');
        const valid=integer(metrics.valid_duration_events);
        if(valid<total&&/duracao|media|horas/.test(question))response.metadata.notes.push(`Duração disponível em ${valid} de ${total} eventos; os demais não têm horários válidos.`);
      }
    } else if(intent.kind==='map_contracts'){
      const total=integer(metrics.total_records),pending=integer(metrics.pending_records),signed=integer(metrics.signed_records);
      const metric=intent.commercialMetric??'signed_records';
      const value=metric==='pending_records'?pending:metric==='total_records'?total:signed;
      const label=metric==='pending_records'?'Contratos aguardando assinatura':metric==='total_records'?'Registros comerciais':'Contratos com assinatura confirmada';
      response.summary=`${value.toLocaleString('pt-BR')} ${label.toLocaleLowerCase('pt-BR')}${intent.period?` em ${intent.period.label}`:''}.`;
      response.blocks.push({type:'indicators',items:[{label,value,unit:'count'}]});
      response.blocks.push({type:'table',title:'Contexto da Dashboard',columns:['Classificação','Registros'],rows:[['Assinatura confirmada',signed.toLocaleString('pt-BR')],['Aguardando assinatura',pending.toLocaleString('pt-BR')],['Total de registros',total.toLocaleString('pt-BR')]]});
      response.metadata.notes.push('Cada contrato nesta resposta é um agrupamento comercial. Os totais usam as mesmas classificações da Dashboard: pendentes incluem agrupamentos parciais. Outros estados podem impedir que os subtotais somem o total.');
      response.metadata.notes.push('Lotes abrangidos, documentos anexados e versões são unidades distintas. Assinatura confirmada não significa pagamento recebido.');
      if(intent.period)response.metadata.notes.push('O período usa a data de criação do registro comercial, exatamente como o filtro da Dashboard; não representa a data da assinatura.');
    } else if (intent.kind === 'map_sales') {
      response.summary = `Na ${response.metadata.edition ?? 'edição consultada'}${intent.period ? `, em ${intent.period.label}` : ''}, o mapa comercial apresenta:`;
      const missingValues = metrics.missing_value_lots === undefined ? 0 : integer(metrics.missing_value_lots);
      response.blocks.push({ type: 'indicators', items: [
        { label: missingValues ? 'Valor conhecido das vendas realizadas' : 'Vendas realizadas', value: money(metrics.confirmed_value_cents), unit: 'BRL', description: 'Assinatura e confirmação registradas.' },
        { label: missingValues ? 'Valor conhecido das vendas em andamento' : 'Vendas em andamento', value: money(metrics.open_value_cents), unit: 'BRL', description: 'Aguardando confirmação da venda.' },
      ] });
      if(!missingValues&&(intent.presentation==='bar_chart'||intent.presentation==='pie_chart')){
        response.blocks=[{type:intent.presentation,title:'Valores das vendas',unit:'BRL',data:[{label:'Vendas realizadas',value:money(metrics.confirmed_value_cents)},{label:'Em andamento',value:money(metrics.open_value_cents)}],population:2,complete:true}];
      }else if(!missingValues&&intent.presentation==='comparison'){
        const previous=candidates.find(item=>{
          if(item===main)return false;
          const other=item.result.records.find(isObject)?.scope;
          return isObject(other)&&other.complete===true&&other.project_id===scope.project_id&&other.edition_year===scope.edition_year&&isObject(other.period)&&other.period.from===intent.previousPeriod?.from&&other.period.to===intent.previousPeriod?.to;
        });
        const previousRecord=previous?.result.records.find(isObject),priorMetrics=isObject(previousRecord?.metrics)?previousRecord.metrics:undefined;
        if(intent.previousPeriod&&!priorMetrics){response.blocks=[{type:'clarification',question:'Não foi possível verificar os dois períodos com os mesmos critérios. Qual período deseja comparar?'}];}
        else response.blocks=[{type:'comparison',title:intent.previousPeriod?'Vendas por período':'Vendas em comparação',unit:'BRL',currentLabel:intent.period?.label??'Vendas realizadas',previousLabel:intent.previousPeriod?.label??'Em andamento',items:intent.previousPeriod?[{label:'Vendas realizadas',current:money(metrics.confirmed_value_cents),previous:money(priorMetrics!.confirmed_value_cents)},{label:'Vendas em andamento',current:money(metrics.open_value_cents),previous:money(priorMetrics!.open_value_cents)}]:[{label:'Valor das vendas',current:money(metrics.confirmed_value_cents),previous:money(metrics.open_value_cents)}]}];
      }
      const salesQuestion=request.message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      if(/quantos|quantidade/.test(salesQuestion)&&!/valor|como estao/.test(salesQuestion)){
        const pending=/abert|andamento|aguard|pendente/.test(salesQuestion);
        const label=/cancelad/.test(salesQuestion)?'Itens cancelados':/historic/.test(salesQuestion)?'Espaços históricos':/pedidos/.test(salesQuestion)?pending?'Pedidos com itens em andamento':'Pedidos com itens confirmados':pending?'Espaços em andamento':'Espaços com venda confirmada';
        const value=/cancelad/.test(salesQuestion)?integer(metrics.cancelled_lots):/historic/.test(salesQuestion)?integer(metrics.legacy_lots):/pedidos/.test(salesQuestion)?integer(pending?metrics.open_orders:metrics.confirmed_orders):integer(pending?metrics.open_lots:metrics.confirmed_lots);
        response.summary=`${label}: ${value.toLocaleString('pt-BR')}.`;
        response.blocks=[{type:'indicators',items:[{label,value,unit:'count'}]}];
      }
      if (/pedidos.*lotes|pedidos.*espacos|detalh|tabela/i.test(salesQuestion)) response.blocks.push({ type: 'table', columns: ['Situação', 'Pedidos', 'Espaços comerciais'], rows: [
        ['Com itens confirmados', integer(metrics.confirmed_orders).toLocaleString('pt-BR'), integer(metrics.confirmed_lots).toLocaleString('pt-BR')],
        ['Com itens em andamento', integer(metrics.open_orders).toLocaleString('pt-BR'), integer(metrics.open_lots).toLocaleString('pt-BR')],
      ] });
      response.metadata.notes.push('Um pedido pode ter vários espaços e aparecer nas duas situações quando estiver parcial. Itens cancelados são excluídos dos valores. Venda confirmada não significa pagamento recebido.');
      response.metadata.notes.push('Os valores somam os itens e não incluem taxas gerais do pedido.');
      const legacy = integer(metrics.legacy_lots);
      if (legacy) response.metadata.notes.push(`${legacy.toLocaleString('pt-BR')} espaços históricos permanecem identificados separadamente, sem presumir confirmação ou recebimento.`);
      if (metrics.unverified_lots) response.metadata.notes.push(`${integer(metrics.unverified_lots).toLocaleString('pt-BR')} itens históricos ou com confirmação não verificada permanecem fora dos valores confirmados.`);
      if (metrics.unallocated_lots) response.metadata.notes.push(`${integer(metrics.unallocated_lots).toLocaleString('pt-BR')} registros sem edição comercial comprovada estão separados dos totais da edição.`);
      if (missingValues) response.metadata.notes.push(`${missingValues.toLocaleString('pt-BR')} itens não possuem valor verificável. Os valores apresentados abrangem apenas os itens com preço registrado.`);
      if (intent.period) response.metadata.notes.push('O período considera a data de confirmação dos itens vendidos e a data de criação dos itens que continuam em andamento. Representa a situação atual desses itens.');
      if (metrics.unknown_period_lots) response.metadata.notes.push(`${integer(metrics.unknown_period_lots).toLocaleString('pt-BR')} itens sem data verificável foram excluídos do período.`);
    } else if (intent.kind === 'agenda_personal') {
      const count = integer(metrics.events);
      const verb = intent.relationship === 'created' ? 'Você criou' : intent.relationship === 'responsible' ? 'Você tem responsabilidade sobre' : 'Você esteve vinculado a';
      response.summary = `${verb} ${count.toLocaleString('pt-BR')} ${count === 1 ? 'evento' : 'eventos'} em ${intent.period?.label ?? 'seu período de consulta'}.`;
      response.blocks.push({ type: 'indicators', items: [
        { label: 'Eventos distintos', value: count, unit: 'count' },
        { label: 'Com data passada', value: integer(metrics.past_events), unit: 'count' },
        { label: 'Agendados', value: integer(metrics.scheduled_events), unit: 'count' },
      ] });
      const valid = integer(metrics.valid_duration_events);
      if (valid && metrics.average_duration_minutes !== null) {
        response.blocks.push({ type: 'indicators', items: [{ label: 'Duração média prevista', value: numeric(metrics.average_duration_minutes), unit: 'minutes' }] });
        if (valid < count) response.metadata.notes.push(`Duração calculada em ${valid.toLocaleString('pt-BR')} de ${count.toLocaleString('pt-BR')} eventos com horários válidos.`);
      }
      response.metadata.notes.push('Vínculo e data passada não comprovam presença ou realização. Eventos cancelados e subeventos não ampliam a contagem; cada evento é contado uma vez.');
      if (valid) response.metadata.notes.push('A duração considera o intervalo completo previsto de cada evento, inclusive quando atravessa o mês.');
      const weekdays = Array.isArray(metrics.weekday_counts) ? metrics.weekday_counts.filter(isObject).map(day => ({ weekday: integer(day.weekday), events: integer(day.events) })) : [];
      if (weekdays.some(day => day.weekday > 6)) throw new WorkerError('invalid_tool_result', 502);
      const most = Math.max(0, ...weekdays.map(day => day.events));
      const labels = ['domingos', 'segundas-feiras', 'terças-feiras', 'quartas-feiras', 'quintas-feiras', 'sextas-feiras', 'sábados'];
      if (most) response.metadata.notes.push(`Maior concentração por início do evento: ${weekdays.filter(day => day.events === most).map(day => labels[day.weekday]).join(' e ')}.`);
    } else if(intent.kind==='agenda_person'){
      const person=isObject(record.person)?record.person:{};
      if(typeof person.id!=='string'||person.id!==intent.entityId&&intent.entityId)throw new WorkerError('scope_mismatch',502);
      const count=integer(metrics.events),name=clean(person.name);
      response.metadata.filters={personId:String(person.id),relationship:'linked'};
      response.summary=`${name} tem ${count.toLocaleString('pt-BR')} ${count===1?'evento vinculado':'eventos vinculados'} em ${intent.period?.label??'seu período de consulta'}.`;
      response.blocks.push({type:'entity_ranking',title:'Eventos vinculados',entityKind:'person',population:1,items:[{id:String(person.id),name,events:count,position:1}]});
      response.metadata.notes.push('Eventos principais distintos vinculados à identidade consultada. Vínculo não comprova presença; múltiplos vínculos e subeventos não duplicam a contagem.');
    } else if (intent.kind === 'agenda_ranking'||intent.kind==='agenda_commission_ranking') {
      const commission=intent.kind==='agenda_commission_ranking';
      const entities = commission ? Array.isArray(record.commissions)?record.commissions:[] : Array.isArray(record.people) ? record.people : Array.isArray(metrics.people) ? metrics.people : [];
      const population = integer(commission?metrics.commission_count:record.people_count ?? metrics.people_count);
      const items=entities.filter(isObject).slice(0,30).map(entity=>({id:String(entity[commission?'commission_id':'person_id']),name:clean(entity.name),events:integer(entity.events),position:integer(entity.position),
        ...(commission&&typeof entity.slug==='string'&&/^[a-z][a-z0-9-]{0,100}$/.test(entity.slug)?{visualKey:entity.slug}:{})}));
      const displayItems=items.map(entity=>{
        const sameName=items.filter(other=>other.name===entity.name).sort((a,b)=>a.id.localeCompare(b.id));
        return {...entity,...(sameName.length>1?{label:`${entity.name.slice(0,155)} · identidade ${sameName.findIndex(other=>other.id===entity.id)+1}`}:{})};
      });
      const data=displayItems.slice(0,20).map(entity=>({label:entity.label??entity.name,value:entity.events}));
      const leaders=displayItems.filter(entity=>entity.events===displayItems[0]?.events);
      response.summary = leaders.length===1 ? `${leaders[0].name} foi ${commission?'a comissão':'a pessoa'} com mais eventos vinculados em ${intent.period?.label??'seu período de consulta'}: ${leaders[0].events.toLocaleString('pt-BR')}.`
        : leaders.length>1?`Empate na liderança em ${intent.period?.label??'seu período de consulta'}: ${leaders.map(entity=>entity.label??entity.name).join(', ')}, com ${leaders[0].events.toLocaleString('pt-BR')} eventos vinculados cada.`
          : `Nenhum vínculo de ${commission?'comissão':'pessoa'} encontrado no período autorizado.`;
      if(/quantas pessoas|quantidade de pessoas/i.test(request.message)){
        response.summary=`${population.toLocaleString('pt-BR')} pessoas estão vinculadas aos eventos do período autorizado.`;
        response.blocks.push({type:'indicators',items:[{label:'Pessoas distintas',value:population,unit:'count'}]});
      }else if (data.length) {
        response.blocks.push({type:'entity_ranking',title:commission?'Eventos por comissão':'Eventos por pessoa',entityKind:commission?'commission':'person',population,items:displayItems});
        if(intent.presentation==='table')response.blocks.push({type:'table',columns:[commission?'Comissão':'Pessoa','Eventos distintos'],rows:data.map(item=>[item.label,item.value.toLocaleString('pt-BR')])});
        else if(intent.presentation==='bar_chart'||intent.presentation==='pie_chart')response.blocks.push({ type:'bar_chart', title: `Eventos por ${commission?'comissão':'pessoa'} · ${intent.period?.label ?? 'período consultado'}`, unit: 'count', data, population, complete: true });
      } else response.blocks.push({ type: 'empty', message: `Nenhuma ${commission?'comissão':'pessoa'} vinculada a eventos no período autorizado.` });
      response.metadata.notes.push(`Ranking calculado sobre todo o conjunto autorizado, com ${population.toLocaleString('pt-BR')} ${commission?'comissões':'pessoas'}. Empates compartilham a quantidade; a ordem visual usa nome e identidade persistida. Vínculo não comprova presença.`);
      if(population>displayItems.length)response.metadata.notes.push(`A lista mostra as primeiras ${displayItems.length} identidades. Podem existir outros empates fora do limite visual.`);
      if(commission)response.metadata.notes.push('Um evento pode pertencer a mais de uma comissão. As quantidades por comissão não compõem uma partição do total de eventos.');
    }
  } else if (intent.kind === 'institutional_president') {
    response.summary = 'Não encontrei evidência institucional suficiente para confirmar a presidência da edição solicitada.';
    response.blocks.push({ type: 'empty', message: 'Consulte a publicação oficial da edição ou informe a edição que deseja verificar.' });
  } else if(intent.kind==='map_documents'){
    response.summary='De qual registro comercial deseja consultar os documentos anexados?';
    response.blocks.push({type:'clarification',question:'Informe o pedido para consultar documentos e lotes abrangidos com a permissão de contratos.'});
  } else if(intent.kind==='map_receipts'){
    response.summary='Recebimentos precisam ser consultados no Financeiro para preservar a classificação de pagamento recebido.';
    response.blocks.push({type:'empty',message:'A confirmação de assinatura e o valor de venda não comprovam recebimento. Abra o Financeiro para conferir os pagamentos registrados.'});
  } else if (intent.kind !== 'domain_query') {
    response.summary = 'Não foi possível calcular esse indicador sobre todo o conjunto autorizado.';
    response.blocks.push({ type: 'empty', message: 'Abra o módulo para conferir os dados ou informe o período e a edição. Uma listagem parcial não foi usada como total.' });
  } else {
    const asked=request.message.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    const relevant = evidence.filter(item => !discovery.has(item.tool)
      ||item.tool==='map_entities'&&/estruturas|pavilh|areas.*segment/.test(asked)
      ||item.tool==='map_segments'&&/quais.*segment|liste.*segment/.test(asked)
      ||item.tool==='map_projects'&&/qual.*projeto|quais.*projetos/.test(asked));
    const financial = [...relevant].reverse().find(item => item.tool === 'financial_edition_summary');
    if (financial) {
      const data = financial.result.records.find(isObject) ?? {};
      const expenses = isObject(data.expenses) ? data.expenses : {}, revenues = isObject(data.revenues) ? data.revenues : {}, movements = isObject(data.movements) ? data.movements : {};
      const items: Array<{ label: string; value: number; unit: 'BRL' }> = [];
      for (const [label, object, key] of [['Despesas projetadas', expenses, 'planned_cents'], ['Despesas comprometidas', expenses, 'committed_cents'], ['Despesas pagas', expenses, 'paid_cents'], ['Receitas projetadas', revenues, 'projected_cents'], ['Receitas confirmadas', revenues, 'confirmed_cents'], ['Recebido', revenues, 'received_cents']] as const) if (object[key] !== undefined) items.push({ label, value: money(object[key]), unit: 'BRL' });
      if (items.length) {
        response.summary = 'Estes são os valores da edição financeira consultada.'; response.metadata.completeness = 'complete'; response.blocks.push({ type: 'indicators', items });
        if (movements.inflow_cents !== undefined && movements.outflow_cents !== undefined) response.blocks.push({ type: 'indicators', items: [{ label: 'Saldo dos movimentos registrados', value: money(movements.inflow_cents) - money(movements.outflow_cents), unit: 'BRL' }] });
        response.metadata.notes.push('Projetado é previsão; comprometido e confirmado refletem obrigações assumidas; pago e recebido refletem liquidação. O saldo considera apenas movimentos registrados.');
      }
    } else if (relevant.length) {
      const selected = relevant[relevant.length - 1]; const total = selected.result.total;
      response.metadata.completeness = selected.result.truncated || total !== undefined && total > selected.result.records.length ? 'partial' : 'complete';
      const table = asTable(selected);
      response.summary = selected.result.records.length ? `${domainNames[intent.worker]}: ${total === undefined ? 'estes são os registros consultados' : `${total.toLocaleString('pt-BR')} ${total === 1 ? 'registro no escopo solicitado' : 'registros no escopo solicitado'}`}.` : 'Não encontrei registros no período e no escopo autorizado.';
      if (selected.tool === 'venue_availability') response.summary = selected.result.records.length ? 'Há conflitos de ocupação no intervalo solicitado. Confira os períodos abaixo.' : 'Não há conflitos registrados para os espaços e o intervalo consultados. A consulta não faz uma reserva.';
      if (selected.tool === 'restaurant_alert') response.summary = selected.result.records.length ? 'Há eventos da Agenda com conflito no Restaurante neste intervalo.' : 'Não há conflitos registrados entre a Agenda e o Restaurante no intervalo consultado.';
      if (selected.tool === 'venue_counterparts') response.summary = 'Estas são as quantidades concedidas, reservadas, consumidas e disponíveis das contrapartidas autorizadas.';
      if (selected.tool === 'commission_metrics') {
        const metrics = selected.result.records.find(isObject) ?? {};
        const items = [['Eventos', 'total'], ['Realizados', 'completed'], ['Neste mês', 'in_month'], ['Próximos eventos', 'upcoming'], ['Documentos', 'documents']]
          .filter(([, key]) => metrics[key] !== undefined).map(([label, key]) => ({ label, value: integer(metrics[key]), unit: 'count' as const }));
        if (items.length) { response.summary = 'Estes são os indicadores registrados para a comissão consultada.'; response.blocks.push({ type: 'indicators', items }); }
      } else if(selected.tool==='map_prices'){
        if(intent.editionYear&&intent.editionYear!==2028){
          response.metadata.completeness='unavailable';response.summary='A tabela de preços consultada pertence à edição 2028. Qual edição deseja consultar?';response.blocks.push({type:'clarification',question:response.summary});
        }else{
          const records=selected.result.records.filter(isObject).slice(0,20);
          response.metadata.edition='Fenasoja 2028';response.summary='Preços cadastrados para os espaços consultados. Valores de oferta não representam vendas ou recebimentos.';
          const price=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'}):'Não informado';
          response.blocks.push({type:'table',columns:['Espaço','Pavilhão','Renovação','Segunda etapa'],rows:records.map(row=>[humanValue(row.public_identifier),humanValue(row.pavilion),price(row.renovacao_total),price(row.segunda_total)])});
        }
      } else if(selected.tool==='map_segment_inventory'){
        const inventory=selected.result.records.find(isObject)??{};
        const items=[['Estruturas cadastradas','expected_entity_count'],['Espaços cadastrados','expected_lot_count']].filter(([,key])=>inventory[key]!==undefined).map(([label,key])=>({label,value:integer(inventory[key]),unit:'count' as const}));
        response.summary='Inventário estrutural do segmento consultado.';
        if(items.length)response.blocks.push({type:'indicators',items});
        response.metadata.notes.push('Estas quantidades descrevem a estrutura cadastrada do segmento. Não indicam disponibilidade ou vendas.');
      } else if (selected.tool === 'workers_web_search') {
        response.summary = 'Encontrei fontes primárias para a pesquisa. Os trechos de busca, isoladamente, não comprovam detalhes institucionais.';
        response.metadata.completeness = 'partial';
        response.blocks.push({ type: 'summary', text: 'Abra as fontes para conferir o conteúdo e a data da publicação. Para a presidência da Fenasoja, pergunte pela edição que deseja verificar.' });
      } else if (selected.tool === 'interest_summary') {
        response.summary = 'Estas são as métricas de interesse por área no período consultado. Visitas, sessões e seleções de espaços são medidas diferentes.';
        const metric = /sessoes|sessões/.test(request.message.toLowerCase()) ? 'sessions' : /sele/.test(request.message.toLowerCase()) ? 'lotSelections' : /detalhe/.test(request.message.toLowerCase()) ? 'detailViews' : 'visits';
        const records = selected.result.records.filter(isObject);
        if (intent.presentation === 'bar_chart' && response.metadata.completeness === 'complete' && records.length && records.every(row => typeof row.displayName === 'string' && typeof row[metric] === 'number')) {
          const data = records.map(row => ({ label: clean(row.displayName), value: integer(row[metric]) })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, 'pt-BR')).slice(0, 10);
          response.blocks.push({ type: 'bar_chart', title: `${columns[metric]} por área`, unit: 'count', data, population: records.length, complete: true });
        } else if (table) response.blocks.push(table);
      } else if (selected.tool === 'financial_expense_comparison' || selected.tool === 'financial_budget_execution') {
        const aggregate = selected.result.records.find(isObject) ?? {};
        const amounts: Record<string, string> = { expense_planned_cents: 'Despesas projetadas', planned_cents: 'Projetado', committed_cents: 'Comprometido', paid_cents: 'Pago', open_cents: 'Em aberto' };
        const totals = isObject(aggregate.totals) ? aggregate.totals : {};
        const items = Object.entries(amounts).filter(([key]) => totals[key] !== undefined).map(([key, label]) => ({ label, value: money(totals[key]), unit: 'BRL' as const }));
        response.summary = selected.tool === 'financial_expense_comparison' ? 'Esta é a comparação das despesas da edição financeira consultada.' : 'Esta é a execução dos orçamentos da edição financeira consultada.';
        if (items.length) response.blocks.push({ type: 'indicators', items });
        const rows = [aggregate.by_category, aggregate.by_commission, aggregate.budgets, aggregate.lines].find(value => Array.isArray(value) && value.length) as unknown[] | undefined;
        if (rows) {
          const records = rows.filter(isObject).slice(0, 20), keys = Object.keys(amounts).filter(key => records.some(row => row[key] !== undefined));
          if (keys.length) response.blocks.push({ type: 'table', columns: ['Grupo', ...keys.map(key => `${amounts[key]} (R$)`)], rows: records.map((row, index) => [clean(row.name) || `Grupo ${index + 1}`, ...keys.map(key => row[key] === undefined ? '—' : money(row[key]).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }))]) });
        }
        if (!response.blocks.length) response.blocks.push({ type: 'empty', message: 'Não há valores verificáveis para exibir neste resumo. Abra o Financeiro para conferir os grupos autorizados.' });
      } else if (table) response.blocks.push(table);
      else response.blocks.push({ type: 'empty', message: selected.result.records.length ? 'Esta consulta não contém campos que possam ser apresentados com segurança. Abra o módulo para ver o detalhe autorizado.' : 'Tente outro período ou detalhe o registro desejado.' });
      if (response.metadata.completeness === 'partial') response.metadata.notes.push('A tabela mostra parte dos registros. Não foram calculados totais, percentuais ou gráficos a partir dessa amostra.');
    } else if (evidence.length) {
      response.summary = 'Qual edição ou registro você deseja consultar?'; response.blocks.push({ type: 'clarification', question: response.summary });
    }
  }
  // Sources are separate controls in the chat and are also retained by the versioned contract.
  if (citations.length) response.blocks.push({ type: 'sources', items: citations });
  const parsed = workerResponseSchema.safeParse(response);
  if (!parsed.success) throw new WorkerError('invalid_response_contract', 502);
  const content = encodeWorkerResponse(parsed.data);
  if (content.length > 22000) throw new WorkerError('result_too_large', 502);
  return { content, citations };
}
