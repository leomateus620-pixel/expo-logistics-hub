import { routeWorker, type WorkerId, type WorkerRequest } from './contracts.ts';
import { decodeWorkerResponse, type WorkerQueryFilters } from './response-contract.ts';

export interface WorkerIntent {
  kind: 'map_sales' | 'map_inventory' | 'agenda_query' | 'agenda_personal' | 'agenda_ranking' | 'institutional_president' | 'domain_query';
  worker: WorkerId;
  editionYear?: number;
  projectId?: string;
  resolveProject: boolean;
  period?: { from: string; to: string; label: string };
  presentation: 'direct' | 'table' | 'bar_chart' | 'pie_chart' | 'comparison';
  queryFilters?: WorkerQueryFilters;
  previousPeriod?: { from: string; to: string; label: string };
  relationship: 'linked' | 'created' | 'responsible' | 'attendance';
  continuation: boolean;
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
  const previousQuestion = [...history].reverse().find(item => item.role === 'user' && item.content !== request.message)?.content ?? '';
  const answeringClarification = Boolean(prior?.blocks.some(block => block.type === 'clarification'));
  const continuation = answeringClarification || /^(?:e\b|tambem\b|agora\b|no mes anterior|mes anterior|e quanto)/.test(text);
  const inherited = continuation ? normalize(previousQuestion) : '';
  const subject = `${inherited} ${text}`;
  const routedWorker = routeWorker(request);
  const mapContext = routedWorker === 'mapa' || /\bmapa\b|comercial|lotes|espacos|vendas?/.test(subject);
  const mapDetail = /contrat|assinatura|documento|precos?|renovacao|pavilh|segment|estrutura|recebid|pagament/.test(subject);
  const inventory = /\bdisponive(?:l|is)\b|\blivres?\b|\breservad[oa]s?\b|\bbloquead[oa]s?\b|\bnegociacao\b|\barea\b|\bareas\b|metragem|quadras?|cobert|eletric|energia|agua|internet|inventario|situacao dos (?:lotes|espacos)|distribuicao dos (?:lotes|espacos)/.test(subject);
  let kind: WorkerIntent['kind'] = 'domain_query';
  if (/presidente/.test(subject) && /fenasoja/.test(subject)) kind = 'institutional_president';
  else if (mapContext && inventory && !mapDetail) kind = 'map_inventory';
  else if (mapContext && /venda|vendemos|vendidos|confirmados/.test(subject) && !mapDetail) kind = 'map_sales';
  else if ((/event/.test(subject) || routedWorker==='agenda') && /ranking|pessoas.*mais vinculos|quem.*mais|mais eventos/.test(subject)) kind = 'agenda_ranking';
  else if (/event/.test(subject) && /\beu\b|\bmeus\b|\bminha\b|vinculad|responsab|criei|criados por mim|\bfiz\b/.test(subject)
    && /quantos|quantidade|duracao|media|\bfiz\b/.test(subject) && !/situacao|concluid|cancelad|local|categoria|prioridade|hoje|amanha|semana|compare|versus/.test(subject)) kind = 'agenda_personal';
  else if (continuation && prior && !mapDetail && !/subevento|detalhe|presenca/.test(text) && ['map_sales', 'map_inventory', 'agenda_query', 'agenda_personal', 'agenda_ranking', 'institutional_president'].includes(prior.intent)) kind = prior.intent as WorkerIntent['kind'];
  else if ((routedWorker === 'agenda' || /eventos?|agenda|programacao|compromissos/.test(subject)) && !mapContext && !/subevento|detalhe/.test(subject)) kind = 'agenda_query';
  const worker: WorkerId = kind.startsWith('map_') ? 'mapa' : kind === 'institutional_president' ? 'radar'
    : kind.startsWith('agenda_') ? 'agenda' : continuation && prior ? prior.worker : routeWorker(request);
  const explicitYear = /\b(20\d{2})\b/.exec(text)?.[1];
  const priorYear = prior?.metadata.edition?.match(/20\d{2}/)?.[0];
  const editionYear = explicitYear && (!kind.startsWith('agenda_') || /fenasoja|edicao/.test(text)) ? Number(explicitYear) : continuation && priorYear ? Number(priorYear) : undefined;
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
    const previous = continuation && prior?.metadata.period ? prior.metadata.period.from : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const date = new Date(`${previous}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() - 1);
    period = monthPeriod(date.getUTCFullYear(), date.getUTCMonth());
  } else if (/proximo mes|mes seguinte/.test(text)) {
    civil.setUTCMonth(civil.getUTCMonth()+1,1); period = monthPeriod(civil.getUTCFullYear(),civil.getUTCMonth());
  } else if (/neste mes|nesse mes|este mes|mes atual/.test(text) || kind.startsWith('agenda_') && !continuation) {
    period = monthPeriod(explicitYear ? Number(explicitYear) : year, month);
  } else if (continuation && prior?.metadata.period) period = prior.metadata.period as NonNullable<WorkerIntent['period']>;
  if (!period && kind.startsWith('agenda_')) period = monthPeriod(year, month);
  const relationship: WorkerIntent['relationship'] = /presenca|presente|compareci|participei efetivamente|horas.*(?:efetiv|trabalh)/.test(subject) ? 'attendance'
    : /criei|criados por mim|eu criei|meus eventos criados/.test(subject) ? 'created' : /responsab/.test(subject) ? 'responsible'
      : continuation && prior?.metadata.filters?.relationship ? prior.metadata.filters.relationship : 'linked';
  const presentation = /pizza|rosca/.test(text) ? 'pie_chart' : /compar|versus|\bvs\b/.test(text) ? 'comparison' : /grafico|barras/.test(text) || kind === 'agenda_ranking' ? 'bar_chart' : /tabela/.test(text) ? 'table' : 'direct';
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
  return { kind, worker, resolveProject: kind.startsWith('map_') && (answeringClarification || /projeto|parque/.test(text)), ...(projectId ? { projectId } : {}), ...(editionYear ? { editionYear } : {}), ...(period ? { period } : {}), ...(previousPeriod ? { previousPeriod } : {}),
    ...(continuation && prior?.metadata.filters?.query ? { queryFilters: prior.metadata.filters.query } : {}),
    presentation, relationship, continuation };
}
