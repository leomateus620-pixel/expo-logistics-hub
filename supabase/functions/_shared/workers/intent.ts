import { routeWorker, type WorkerId, type WorkerRequest } from './contracts.ts';
import { decodeWorkerResponse, type WorkerQueryFilters } from './response-contract.ts';
import { interpretKbQuery } from './knowledge-base.ts';
import { commercialReportSpecSchema, type CommercialReportSpec } from './commercial-report.ts';

export type CommercialIntentSpec = Omit<CommercialReportSpec, 'projectId'>;

export interface WorkerIntent {
  kind: 'map_report' | 'map_sales' | 'map_inventory' | 'map_contracts' | 'map_documents' | 'map_receipts' | 'agenda_query' | 'agenda_personal' | 'agenda_ranking' | 'agenda_commission_ranking' | 'agenda_person' | 'agenda_commission' | 'institutional_president' | 'domain_query';
  worker: WorkerId;
  editionYear?: number;
  projectId?: string;
  resolveProject: boolean;
  period?: { from: string; to: string; label: string };
  presentation: 'direct' | 'table' | 'bar_chart' | 'pie_chart' | 'comparison';
  queryFilters?: WorkerQueryFilters;
  entitySearch?: string;
  entityId?: string;
  entityName?: string;
  commercialMetric?: 'signed_records' | 'pending_records' | 'total_records' | 'sold_lots' | 'sales_value' | 'documents' | 'document_versions' | 'receipts';
  previousPeriod?: { from: string; to: string; label: string };
  relationship: 'linked' | 'created' | 'responsible' | 'attendance';
  continuation: boolean;
  commercialSpec?: CommercialIntentSpec;
  generatePdf?: boolean;
  commercialClarification?: 'contract_unit' | 'historical_position' | 'company_identity' | 'comparison_periods' | 'contract_identity';
}
const normalize = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const months = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function monthPeriod(year: number, month: number): NonNullable<WorkerIntent['period']> {
  const day = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return { from: `${year}-${String(month + 1).padStart(2, '0')}-01`, to: `${year}-${String(month + 1).padStart(2, '0')}-${day}`,
    label: `${months[month]} de ${year}` };
}

/** Civil dates in São Paulo; prior validated response carries the actual resolved period. */
export function interpretWorkerIntent(request: WorkerRequest, now: Date, history: Array<{ role: string; content: string }> = []): WorkerIntent {
  const text = normalize(request.message);
  const prior = [...history].reverse().filter(item => item.role === 'assistant').map(item => decodeWorkerResponse(item.content)).find(Boolean);
  const previousIndex = history.map(item => item.role).lastIndexOf('user');
  const previousQuestion = previousIndex >= 0 ? history[previousIndex].content : '';
  // Failed turns still contain an explicit user period. Reconstruct it from the
  // question instead of requiring a successful assistant response.
  const previousIntent = previousQuestion && history.length <= 40
    ? interpretWorkerIntent({ ...request, message: previousQuestion }, now, history.slice(0, previousIndex)) : undefined;
  const answeringClarification = Boolean(prior?.blocks.some(block => block.type === 'clarification'));
  const priorCommercial = prior?.metadata.filters?.commercial;
  const commercialFollowup = Boolean(priorCommercial || previousIntent?.commercialSpec || prior?.worker==='mapa' && /\bpdf\b/.test(text)) && /^(?:mostre|inclua|tire|retire|mantenha|gere|faca|atualiz|somente|so\b|essa?\b|dess[ae]s?\b|troque)/.test(text);
  const continuation = answeringClarification || commercialFollowup || /^(?:e\b|tambem\b|agora\b|no mes anterior|mes anterior|e quanto)/.test(text);
  const subject = text;
  const publicContext = interpretKbQuery(request.message, now);
  const routedWorker = routeWorker(request);
  const explicitAgenda = /eventos?|agenda|programacao|compromissos/.test(text);
  const mapContext = !explicitAgenda && (routedWorker === 'mapa' || /\bmapa\b|comercial|lotes|espacos|vendas?|contrat|assinatura|documentos anexados|exporural|expo rural|pavilh|expositor|empresas?|automovel/.test(subject) || commercialFollowup);
  const mapDetail = /contrat|assinatura|documento|precos?|renovacao|pavilh|segment|estrutura|recebid|pagament/.test(subject);
  const inventory = /\bdisponive(?:l|is)\b|\blivres?\b|\breservad[oa]s?\b|\bbloquead[oa]s?\b|\bnegociacao\b|\barea\b|\bareas\b|metragem|quadras?|cobert|eletric|energia|agua|internet|inventario|situacao dos (?:lotes|espacos)|distribuicao dos (?:lotes|espacos)/.test(subject);
  let kind: WorkerIntent['kind'] = 'domain_query';
  const ranking = /ranking|mais vinculos|quem.*mais|mais eventos|maior quantidade de eventos/.test(text);
  const commissionMention = /comiss(?:ao|oes)|assessorias?/.test(text);
  const nominal = /\beventos?\s+(?:(?:do|da|de)\s+)?(.+?)(?:\s+(?:teve|tem|possui|tiveram|em|no mes|neste|nesse|durante)\b|[?!.]|$)/i.exec(request.message)?.[1]?.trim();
  const nominalPerson = nominal && !/^(?:eu|meus?|minhas?|existem|ha|foram|estao|acontecem|vinculados?|criados?|sob|concluidos?|cancelados?|planejados?|de |da |do |neste|nesse|no |na |com |em |por |sem |para |deste|dessa|dessa|desta|que |se )/i.test(nominal)
    && !commissionMention && !ranking && !/local|categoria|prioridade|duracao|horario|distribuicao/i.test(text) && /\p{L}+(?:\s+\p{L}+)+/u.test(nominal) ? nominal : undefined;
  const commissionName = /(?:comiss[aã]o|assessoria)\s+(.+?)(?:\s+(?:teve|tem|possui|em|no mes|neste|durante)\b|[?!.]|$)/i.exec(request.message)?.[1]?.trim();
  let entitySearch = nominalPerson ?? (commissionName && !/^(?:teve|tem|com mais|mais|selecionada|identificada|teve mais)/i.test(commissionName) ? commissionName : undefined);
  let commercialMetric: WorkerIntent['commercialMetric'];
  if (publicContext.fenasoja && publicContext.role) kind = 'institutional_president';
  else if (commissionMention && ranking) kind = 'agenda_commission_ranking';
  else if ((explicitAgenda || routedWorker === 'agenda' || /pessoas?|quem/.test(text)) && ranking && !commissionMention) kind = 'agenda_ranking';
  else if (explicitAgenda && commissionMention && entitySearch) kind = 'agenda_commission';
  else if (explicitAgenda && nominalPerson) kind = 'agenda_person';
  else if (mapContext && /recebid|recebiment|pagamentos? recebidos/.test(text)) { kind = 'map_receipts'; commercialMetric = 'receipts'; }
  else if (mapContext && /documentos?|anexos?|versoes/.test(text) && /quant[oa]s|quantidade|total/.test(text) && !/quantos.*contratos.*(?:firmad|assinad|confirmad)/.test(text)) { kind = 'map_documents'; commercialMetric = /versoes/.test(text)?'document_versions':'documents'; }
  else if (mapContext && /contrat|assinatura|registros? (?:comerciais|de venda)|agrupamentos?/.test(text) && /quantos|quantidade|total|firmad|assinad|confirmad/.test(text) && !/\bquais\b|situacao|desse pedido|deste pedido|\bvalor\b|\bquanto\b|\blotes?\b|\bespacos?\b/.test(text)) {
    kind = 'map_contracts'; commercialMetric = /aguard|penden|abert/.test(text) ? 'pending_records' : /total|registros?|agrupamentos?/.test(text) && !/firmad|assinad|confirmad/.test(text) ? 'total_records' : 'signed_records';
  }
  else if (mapContext && inventory && !mapDetail) kind = 'map_inventory';
  else if (mapContext && /venda|vendemos|vendidos|confirmados/.test(subject) && !mapDetail) kind = 'map_sales';
  else if (/event/.test(subject) && /\beu\b|\bmeus\b|\bminha\b|\bmim\b|criei|criados por mim|\bfiz\b/.test(subject)
    && /quantos|quantidade|duracao|media|\bfiz\b/.test(subject) && !/situacao|concluid|cancelad|local|categoria|prioridade|hoje|amanha|semana|compare|versus/.test(subject)) kind = 'agenda_personal';
  else if (continuation && !explicitAgenda && !mapDetail && !/subevento|detalhe|presenca/.test(text) && (previousIntent || prior)) kind = previousIntent?.kind ?? prior!.intent as WorkerIntent['kind'];
  else if ((routedWorker === 'agenda' || /eventos?|agenda|programacao|compromissos/.test(subject)) && !mapContext && !/subevento|detalhe/.test(subject)) kind = 'agenda_query';
  const commercialReport = mapContext && kind !== 'map_receipts' && (
    /\bpdf\b|relator?io|planta|expo\s*r{1,2}ural|pavilh?|automov|\bics\b|industria.*comercio|area externa|empresas?|expositores?|parcialmente|parciais|principal|taxas|sem (?:contrato|documento)|com (?:contrato|documento)|por (?:pavilhao|empresa|area)|quadra\b|associaco|versoes anteriores|documentos ativos|ultimas vendas|metragem ausente|sem metragem/.test(text)
    || continuation && Boolean(priorCommercial || previousIntent?.commercialSpec)
    || /(?:assinad|assinaturas? confirmad|cadastrad|registrad).*(?:mes|outubro|setembro|periodo|\d{2}\/)/.test(text)
    || /quant[ao]s.*vendas|^quant[ao]s (?:estao|ficaram|temos|ha|existem).*(?:em aberto|confirmad)|pedidos.*(?:assinad|aberto|confirmad|documento)|maior valor.*andamento|contratos?.*(?:mais de um lote|versoes|cobre todos)|(?:quais|liste|mostre).*(?:vendas|pedidos).*assinatura/.test(text)
  );
  if (commercialReport) kind = 'map_report';
  const worker: WorkerId = kind.startsWith('map_') ? 'mapa' : kind === 'institutional_president' ? 'radar'
    : kind.startsWith('agenda_') ? 'agenda' : continuation && prior ? prior.worker : routeWorker(request);
  const explicitYear = /\b((?:19|20)\d{2}|2100)\b/.exec(text)?.[1];
  if (continuation && previousIntent && !entitySearch && !explicitAgenda) entitySearch = previousIntent.entitySearch;
  const entityId = continuation && !nominalPerson && !commissionName
    ? kind==='agenda_person'?prior?.metadata.filters?.personId:kind==='agenda_commission'?prior?.metadata.filters?.commissionId:undefined
    : undefined;
  commercialMetric ??= kind === 'map_sales' ? /quantos|quantidade/.test(text) && !/valor/.test(text) ? 'sold_lots' : 'sales_value'
    : continuation ? previousIntent?.commercialMetric : undefined;
  if(kind==='map_contracts'&&continuation){
    if(/aguard|penden|abert/.test(text))commercialMetric='pending_records';
    else if(/total|registros?/.test(text))commercialMetric='total_records';
    else if(/firmad|assinad|confirmad/.test(text))commercialMetric='signed_records';
  }
  const priorYear = prior?.metadata.edition?.match(/20\d{2}/)?.[0] ?? previousIntent?.editionYear?.toString();
  const editionYear = kind === 'institutional_president' ? publicContext.editionYear : /projeto inteiro|todas as edicoes/.test(text) ? undefined : explicitYear && (kind === 'map_report' ? /fenasoja|edicao/.test(text) : !kind.startsWith('agenda_') || /fenasoja|edicao/.test(text)) ? Number(explicitYear) : continuation && priorYear ? Number(priorYear) : undefined;
  const projectId = continuation && prior?.metadata.projectId && (!explicitYear || !priorYear || explicitYear === priorYear) ? prior.metadata.projectId : undefined;
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now).map(item => [item.type, item.value]));
  let year = Number(parts.year), month = Number(parts.month) - 1;
  let period: WorkerIntent['period'];
  const namedMonth = months.findIndex(name => new RegExp(`\\b${name}\\b`).test(text));
  const iso = (date: Date) => date.toISOString().slice(0,10);
  const civil = new Date(Date.UTC(year, month, Number(parts.day), 12));
  const explicitDates = text.match(/\b20\d{2}-\d{2}-\d{2}\b/g);
  const brDates=[...text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/g)].map(match=>`${match[3]}-${match[2].padStart(2,'0')}-${match[1].padStart(2,'0')}`);
  const monthRange=/\b(?:entre|de)\s+(\d{1,2})\s*(?:e|a|ate)\s*(\d{1,2})\s+de\s+([a-z]+)(?:\s+de\s+(20\d{2}))?\b/.exec(text);
  const displayDate=(value:string)=>value.split('-').reverse().join('/');
  if (brDates.length>=1) period={from:brDates[0],to:brDates[1]??brDates[0],label:brDates.length>1?`${displayDate(brDates[0])} a ${displayDate(brDates[1])}`:displayDate(brDates[0])};
  else if(monthRange&&months.includes(monthRange[3])){
    const prefix=`${monthRange[4]??year}-${String(months.indexOf(monthRange[3])+1).padStart(2,'0')}-`;
    const from=prefix+monthRange[1].padStart(2,'0'),to=prefix+monthRange[2].padStart(2,'0');
    period={from,to,label:`${displayDate(from)} a ${displayDate(to)}`};
  }else if (explicitDates?.length === 2 && explicitDates[0] <= explicitDates[1]) period = { from: explicitDates[0], to: explicitDates[1], label: `${displayDate(explicitDates[0])} a ${displayDate(explicitDates[1])}` };
  else if (/\bhoje\b|\bamanha\b|\bontem\b/.test(text)) {
    civil.setUTCDate(civil.getUTCDate() + (/amanha/.test(text) ? 1 : /ontem/.test(text) ? -1 : 0));
    period = { from: iso(civil), to: iso(civil), label: civil.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) };
  } else if (/\bsemana\b/.test(text)) {
    const shift = /anterior|passada/.test(text)&&!/compar.*(?:nesta|desta|esta|atual).*semana/.test(text) ? -7 : /proxima/.test(text) ? 7 : 0;
    civil.setUTCDate(civil.getUTCDate() - (civil.getUTCDay() + 6) % 7 + shift);
    const from = iso(civil); civil.setUTCDate(civil.getUTCDate() + 6);
    period = { from, to: iso(civil), label: `semana de ${from.split('-').reverse().join('/')} a ${iso(civil).split('-').reverse().join('/')}` };
  } else if (namedMonth >= 0) { month = namedMonth; year = explicitYear ? Number(explicitYear) : year; period = monthPeriod(year, month); }
  else if(kind.startsWith('agenda_')&&/\bano\b/.test(text)){
    year=explicitYear?Number(explicitYear):year;period={from:`${year}-01-01`,to:`${year}-12-31`,label:`ano de ${year}`};
  }
  else if (/mes anterior|mes passado/.test(text) && !/compar.*(?:neste|deste|este|atual).*mes/.test(text)) {
    const previous = continuation ? previousIntent?.period?.from ?? prior?.metadata.period?.from ?? `${year}-${String(month + 1).padStart(2, '0')}-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const date = new Date(`${previous}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1);
    period = monthPeriod(date.getUTCFullYear(), date.getUTCMonth());
  } else if (/proximo mes|mes seguinte/.test(text)) {
    civil.setUTCMonth(civil.getUTCMonth()+1,1); period = monthPeriod(civil.getUTCFullYear(),civil.getUTCMonth());
  } else if (/neste mes|nesse mes|este mes|mes atual/.test(text) || kind.startsWith('agenda_') && !continuation) {
    period = monthPeriod(explicitYear ? Number(explicitYear) : year, month);
  } else if (continuation) period = previousIntent?.period ?? prior?.metadata.period as WorkerIntent['period'];
  if (!period && kind.startsWith('agenda_')) period = monthPeriod(year, month);
  const relationship: WorkerIntent['relationship'] = /presenca|presente|compareci|participei efetivamente|horas.*(?:efetiv|trabalh)/.test(subject) ? 'attendance'
    : /criei|criados por mim|eu criei|meus eventos criados/.test(subject) ? 'created' : /responsab/.test(subject) ? 'responsible'
      : continuation ? previousIntent?.relationship ?? prior?.metadata.filters?.relationship ?? 'linked' : 'linked';
  const presentation = /pizza|rosca/.test(text) ? 'pie_chart' : /compar|versus|\bvs\b/.test(text) ? 'comparison' : /tabela/.test(text) ? 'table' : /grafico|barras/.test(text) ? 'bar_chart' : 'direct';
  let previousPeriod: WorkerIntent['previousPeriod'];
  if (presentation === 'comparison' && period && /anterior|passad/.test(text)) {
    const previous = new Date(`${period.from}T12:00:00Z`);
    if (period.from.endsWith('-01') && period.to === monthPeriod(previous.getUTCFullYear(),previous.getUTCMonth()).to) {
      previous.setUTCMonth(previous.getUTCMonth()-1); previousPeriod = monthPeriod(previous.getUTCFullYear(),previous.getUTCMonth());
    } else {
      const days = Math.round((Date.parse(period.to)-Date.parse(period.from))/86400000)+1;
      previous.setUTCDate(previous.getUTCDate()-1); const to = iso(previous); previous.setUTCDate(previous.getUTCDate()-days+1);
      previousPeriod = { from: iso(previous), to, label: `${iso(previous).split('-').reverse().join('/')} a ${to.split('-').reverse().join('/')}` };
    }
  }
  let commercialSpec: CommercialIntentSpec | undefined;
  if (kind === 'map_report') {
    const previous = continuation ? priorCommercial ?? previousIntent?.commercialSpec : undefined;
    const { projectId: _ignored, ...previousFilters } = previous && 'projectId' in previous ? previous : { ...previous, projectId: undefined };
    commercialSpec = commercialReportSpecSchema.omit({projectId:true}).parse(previousFilters);
    const scopes: string[] = [];
    for (const match of text.matchAll(/pavilh?(?:ao|oes)\s*(\d{1,2})(?:\s*(?:e|,)\s*(\d{1,2}))?/g)) {
      scopes.push(`Pavilhão ${Number(match[1])}`); if (match[2]) scopes.push(`Pavilhão ${Number(match[2])}`);
    }
    if (/expo\s*r{1,2}ural/.test(text)) scopes.push('ExpoRural');
    if (/espaco do automovel|automoveis|automovel/.test(text)) scopes.push('Espaço do Automóvel');
    if (/\bics\b|industria.*comercio/.test(text)) scopes.push('Indústria, Comércio e Serviços');
    const block = /quadra\s+([a-z0-9-]{1,20})\b/.exec(text)?.[1];
    if (block) scopes.push(`Quadra ${block.toUpperCase()}`);
    if (/todas as (?:tres|3) areas externas|tres areas externas|3 areas externas/.test(text)) scopes.push('Indústria, Comércio e Serviços','ExpoRural','Espaço do Automóvel');
    if (scopes.length) { commercialSpec.scopeSearch = [...new Set(scopes)]; commercialSpec.scopes = []; }
    if (/todos os pavilhoes/.test(text)) { commercialSpec.scopes=[]; commercialSpec.scopeSearch=[]; commercialSpec.geography='internal'; }
    if (/area externa|areas externas|externa ics|ics externa/.test(text)) commercialSpec.geography='external';
    else if (/interior|internos|pavilhoes ics/.test(text)) commercialSpec.geography='internal';
    if (/pavilh(?:ao|oes)|interior|internos/.test(text) && /area externa|areas externas/.test(text)) commercialSpec.geography='all';
    if (/aguard|penden.*assinatura|contratos? pendentes|em aberto|em andamento/.test(text)) commercialSpec.saleStates=['pending'];
    else if (/parcialmente assinad|parciais/.test(text)) commercialSpec.saleStates=['partial'];
    else if (/legado|sem comprovacao/.test(text)) commercialSpec.saleStates=['legacy'];
    else if (/cancelad/.test(text)) commercialSpec.saleStates=['cancelled'];
    else if (/assinatura(?:s)? confirmada|assinad[oa]s?|vendas.*confirmadas|vendas.*confirmados|foi vendido|quanto.*(?:vendido|vendeu)|valor vendido/.test(text) && !/contratos pendentes|vendidos no mapa/.test(text)) commercialSpec.saleStates=['signed'];
    if (/todos os estados|todas as situacoes|sem filtro de assinatura/.test(text)) commercialSpec.saleStates=[];
    if (/sem (?:contrato|documento)|nao tem documento|nao tem contrato/.test(text)) commercialSpec.contractFilter='without_document';
    else if (/com (?:contrato|documento)|documentos vinculados/.test(text)) commercialSpec.contractFilter='with_document';
    if (/sem filtro de (?:documento|contrato)|com e sem documento/.test(text)) commercialSpec.contractFilter='any';
    if (/inclua.*taxas|com taxas|principal e taxas|principal mais taxas/.test(text)) commercialSpec.monetaryBasis='principal_and_fees';
    if (/sem taxas|somente (?:o )?principal|so (?:o )?principal/.test(text)) commercialSpec.monetaryBasis='principal';
    if (editionYear) commercialSpec.editionYear=editionYear;
    else if (/projeto inteiro|todas as edicoes/.test(text)) delete commercialSpec.editionYear;
    if (period) commercialSpec.period={from:period.from,to:period.to,basis:/assinad|assinatura.*(?:mes|periodo)/.test(text)?'signed':/cadastrad|criadas?|registrad/.test(text)?'created':commercialSpec.period?.basis??'created'};
    if (presentation==='comparison'||answeringClarification&&previousIntent?.commercialClarification==='comparison_periods') {
      const basis=commercialSpec.period?.basis??'created';
      const mentionedMonths=[...text.matchAll(new RegExp(`\\b(${months.join('|')})\\b`,'g'))].map(match=>months.indexOf(match[1]));
      if(mentionedMonths.length===2){
        const earlier=monthPeriod(explicitYear?Number(explicitYear):year,mentionedMonths[0]),later=monthPeriod(explicitYear?Number(explicitYear):year,mentionedMonths[1]);
        commercialSpec.comparisonPeriod={from:earlier.from,to:earlier.to,basis};commercialSpec.period={from:later.from,to:later.to,basis};
      }else if(brDates.length===4||explicitDates?.length===4){
        const dates=brDates.length===4?brDates:explicitDates!;
        commercialSpec.comparisonPeriod={from:dates[0],to:dates[1],basis};commercialSpec.period={from:dates[2],to:dates[3],basis};
      }else if(previousPeriod&&commercialSpec.period)commercialSpec.comparisonPeriod={from:previousPeriod.from,to:previousPeriod.to,basis};
    }
    if (/sem periodo|todo o periodo/.test(text)) delete commercialSpec.period;
    if (/detalhad/.test(text)) commercialSpec.presentation='detailed';
    if (/executiv/.test(text)) commercialSpec.presentation='executive';
    const sections = new Set(commercialSpec.sections);
    if (/empresa|expositor/.test(text)) sections.add('exhibitors');
    if (/contrato|documento/.test(text)) sections.add('contracts');
    if (/planta|\b2d\b/.test(text)) sections.add('plan_2d');
    if (/tire.*grafic|retire.*grafic|sem grafic/.test(text)) sections.delete('charts');
    else if (/grafico/.test(text)) sections.add('charts');
    commercialSpec.sections=[...sections];
    if (/quais documentos|liste (?:os )?documentos|documentos ativos|documentos.*versoes|versoes anteriores|quais contratos|contratos.*mais de um lote|contratos por empresa|abrangencia|cobre todos/.test(text) && !/aguard|penden.*assinatura/.test(text)) commercialSpec.reportFocus='contracts';
    else if (/quais empresas|quais expositores|mais de um pavilhao|expositores.*mais espacos|quem.*maior area|ranking.*(?:empresas|expositores)|empresas da area externa/.test(text)) commercialSpec.reportFocus='exhibitors';
    else if (/ocupacao|disponibilidade|vendidos no mapa|lotes.*(?:metragem ausente|sem metragem)|associacoes.*revisao/.test(text)) commercialSpec.reportFocus='inventory';
    else if (/vendas|venda|pedidos|assinatura|empresa,\s*lote|empresa.*lotes.*situacao/.test(text)) commercialSpec.reportFocus='sales';
    if (/mais de um lote|multiplos lotes|varios lotes/.test(text)&&commercialSpec.reportFocus==='contracts') commercialSpec.documentFilter='multi_lot';
    else if (/versoes anteriores|mais de uma versao|possuem versoes/.test(text)&&commercialSpec.reportFocus==='contracts') commercialSpec.documentFilter='with_prior_versions';
    else if (/todos os documentos|todos os contratos/.test(text)) commercialSpec.documentFilter='any';
    if(/documentos? ativos/.test(text))commercialSpec.documentStates='active';
    else if(/documentos? inativos/.test(text))commercialSpec.documentStates='inactive';
    else if(/ativos e inativos|todos os documentos/.test(text))commercialSpec.documentStates='all';
    if (/por empresa|por expositor/.test(text)) commercialSpec.groupBy='exhibitor';
    else if (/por situacao|por assinatura/.test(text)) commercialSpec.groupBy='status';
    else if (/por area|por pavilhao|compare/.test(text)) commercialSpec.groupBy='scope';
    if(commercialSpec.reportFocus==='exhibitors')commercialSpec.groupBy='exhibitor';
    if(answeringClarification&&previousIntent?.commercialClarification==='contract_unit'&&/documento/.test(text)){
      commercialSpec.reportFocus='contracts';if(!commercialSpec.sections.includes('contracts'))commercialSpec.sections.push('contracts');
    }
    if (/maior area|mais area|por metragem/.test(text)) {commercialSpec.sortBy='area';commercialSpec.sortDirection='desc';}
    else if (/maior valor|mais vendeu|maior venda/.test(text)) {commercialSpec.sortBy='value';commercialSpec.sortDirection='desc';}
    else if (/ultimas vendas|ultimos pedidos/.test(text)) {commercialSpec.sortBy='created';commercialSpec.sortDirection='desc';}
    else if (/mais espacos|mais lotes/.test(text)) {commercialSpec.sortBy='lots';commercialSpec.sortDirection='desc';}
    if (/metragem ausente|sem metragem|sem area/.test(text)) {commercialSpec.missingArea=true;commercialSpec.groupBy='none';}
    if (/sem identificacao empresarial|sem empresa|sem expositor/.test(text)) commercialSpec.missingCompany=true;
    if (/vendidos.*sem identificacao empresarial/.test(text)) {commercialSpec.reportFocus='sales';commercialSpec.inventoryStates=['SOLD'];}
    if(/associacoes.*(?:revisao|revisar)|inconsistencias|vinculos ambiguos/.test(text)){commercialSpec.issuesOnly=true;commercialSpec.reportFocus='sales';}
    if(/sem filtro de inconsistencias|inclua todas as associacoes/.test(text))commercialSpec.issuesOnly=false;
    // Quoted business names are search data; the server resolves stable IDs and
    // explicitly asks about homonyms. Never fabricate an exhibitor identity.
    const quotedCompany = /(?:empresa|expositor)\s+["“]([^"”]{1,180})["”]/i.exec(request.message)?.[1];
    const namedCompany = /(?:empresa|expositor)\s+(?:chamad[ao]\s+)?([^,;?!]{1,180}?)(?=\s+(?:ocupa|possui|aparece|tem\b|no pavilh|na expo|nos pavilh|com situacao)|[,;?!]|$)/i.exec(request.message)?.[1]?.trim();
    const company = quotedCompany ?? (namedCompany&&!/^(?:e |ou |com |os |as |no |na |nos |nas |do |da |dos |das |tem |ocupa|possui|em |por |uma |determinada |lote|pavilh|area|situacao|assinatura|aparece)/i.test(namedCompany)?namedCompany:undefined);
    if (company) {commercialSpec.companySearch=company;commercialSpec.exhibitorIds=[];}
    else if(answeringClarification&&previousIntent?.commercialClarification==='company_identity'&&request.message.trim().length<=180&&!/vendas|periodo|pavilh|assinatura|pdf/.test(text)){
      commercialSpec.companySearch=request.message.trim();commercialSpec.exhibitorIds=[];
    }
    const quotedContract=/(?:contrato|documento)\s+["“]([^"”]{1,160})["”]/i.exec(request.message)?.[1];
    const quotedOrder=/(?:pedido|venda)\s+["“]([^"”]{1,160})["”]/i.exec(request.message)?.[1];
    if(quotedContract){commercialSpec.contractSearch=quotedContract;commercialSpec.contractIds=[];commercialSpec.reportFocus='contracts';}
    if(quotedOrder){commercialSpec.orderSearch=quotedOrder;commercialSpec.orderIds=[];}
    if(answeringClarification&&previousIntent?.commercialClarification==='contract_identity'&&request.message.trim().length<=160&&!/vendas|periodo|pavilh|assinatura|pdf/.test(text)){
      commercialSpec.contractSearch=request.message.trim();commercialSpec.contractIds=[];
    }
    const minArea=/(?:area|metragem)\s*(?:maior que|acima de|a partir de|minima de)\s*([\d.,]+)/.exec(text)?.[1];
    const maxArea=/(?:area|metragem)\s*(?:menor que|abaixo de|ate|maxima de)\s*([\d.,]+)/.exec(text)?.[1];
    const decimal=(value:string)=>Number(value.replace(/[.,]+$/,'').replace(/\.(?=\d{3}(?:\D|$))/g,'').replace(',','.'));
    if(minArea)commercialSpec.minArea=decimal(minArea);if(maxArea)commercialSpec.maxArea=decimal(maxArea);
    const minValue=/(?:valor|principal)\s*(?:maior que|acima de|a partir de|minimo de)\s*(?:r\$\s*)?([\d.,]+)/.exec(text)?.[1];
    const maxValue=/(?:valor|principal)\s*(?:menor que|abaixo de|ate|maximo de)\s*(?:r\$\s*)?([\d.,]+)/.exec(text)?.[1];
    if(minValue)commercialSpec.minValueCents=Math.round(decimal(minValue)*100);if(maxValue)commercialSpec.maxValueCents=Math.round(decimal(maxValue)*100);
    const inventoryStates:Array<[RegExp,CommercialReportSpec['inventoryStates'][number]]>=[[/disponiveis|disponivel|livres/,'AVAILABLE'],[/bloquead/,'BLOCKED'],[/reservad/,'RESERVED'],[/em negociacao/,'IN_NEGOTIATION'],[/vendidos no mapa/,'SOLD']];
    if(commercialSpec.reportFocus==='inventory')for(const [pattern,state] of inventoryStates)if(pattern.test(text))commercialSpec.inventoryStates=[state];
  }
  const commercialClarification: WorkerIntent['commercialClarification'] = kind === 'map_report' && /como estava|situacao em \d|posicao em \d/.test(text) ? 'historical_position'
    :kind==='map_report'&&/essa? empresa|determinada empresa|empresa selecionada/.test(text)&&!commercialSpec?.companySearch&&!commercialSpec?.exhibitorIds.length?'company_identity'
    :kind==='map_report'&&/compar.*(?:dois periodos|periodos|datas)/.test(text)&&!commercialSpec?.comparisonPeriod?'comparison_periods'
    :kind==='map_report'&&/esse contrato|este contrato|esse documento|este documento/.test(text)&&!commercialSpec?.contractSearch&&!commercialSpec?.contractIds.length?'contract_identity'
    : kind === 'map_report' && /\bcontratos\b/.test(text) && !/assin|document|anex|arquivo|penden|abrang|vers|relatorio|\bpdf\b/.test(text) ? 'contract_unit' : undefined;
  return { kind, worker, resolveProject: kind.startsWith('map_') && (answeringClarification || /projeto|parque/.test(text)), ...(projectId ? { projectId } : {}), ...(editionYear ? { editionYear } : {}), ...(period ? { period } : {}), ...(previousPeriod ? { previousPeriod } : {}),
    ...(entitySearch ? { entitySearch } : {}), ...(entityId ? { entityId } : {}), ...(commercialMetric ? { commercialMetric } : {}),
    ...(continuation && prior?.metadata.filters?.query ? { queryFilters: prior.metadata.filters.query } : {}),
    ...(commercialSpec ? { commercialSpec, generatePdf: /\bpdf\b|ger(?:e|ar).*relatorio|faca.*relatorio|atualiz.*relatorio|ger(?:e|ar).*versao (?:detalhad|executiv)/.test(text) } : {}), ...(commercialClarification ? { commercialClarification } : {}),
    presentation, relationship, continuation };
}
