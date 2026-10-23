import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import type { CommercialReportSnapshot } from './commercial-report';
import { COMMERCIAL_METRICS } from './commercial-report';
import { commercialReportGroups, commercialReportContracts, commercialReportPreview } from './commercial-report-preview';
import { buildReportPlan, buildReportPlanGroups } from './report-plan';

const INK='#102d50', GOLD='#bd9449', MUTED='#53657a', LIGHT='#f3f6fa';
const STATES: Record<string,string>={pending:'Aguardando assinatura',signed:'Assinatura confirmada',legacy:'Legado sem comprovação',cancelled:'Cancelado',inconsistent:'Revisar vínculo'};
const COLORS: Record<string,string>={SOLD:'#98c1f3',SALE_OPEN:'#ffe18a',AVAILABLE:'#b9e5c7',BLOCKED:'#f2b0ad',RESERVED:'#dcc3ee',IN_NEGOTIATION:'#f3c5a5',UNAVAILABLE:'#d7dce1'};
const STATUS: Record<string,string>={SOLD:'Vendido',SALE_OPEN:'Em aberto',AVAILABLE:'Disponível',BLOCKED:'Bloqueado',RESERVED:'Reservado',IN_NEGOTIATION:'Em negociação',UNAVAILABLE:'Indisponível'};
const number=(value:number|null)=>value===null?'Não informado':new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(value);
const money=(value:number|null)=>value===null?'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(value/100);
const ISSUE_LABELS:Record<string,string>={CURRENT_AREA_MISSING:'Lotes sem metragem atual',HISTORICAL_AREA_MISSING:'Vendas sem metragem histórica',EXHIBITOR_IDENTITY_MISSING:'Identidade empresarial não comprovada',FEES_UNRECONCILED:'Taxas sem conciliação comprovada',LEGACY_UNVERIFIED:'Legado sem comprovação de assinatura',GEOMETRY_MISSING:'Lotes sem geometria válida',SIGNATURE_SALE_MISMATCH:'Divergência entre assinatura e venda',VALUE_MISSING_OR_INVALID:'Valor ausente ou inválido',HISTORICAL_LOT_ARCHIVED:'Lote histórico arquivado'};
const civil=(value:string)=>new Date(value).toLocaleString('pt-BR',{timeZone:'America/Sao_Paulo'});

/** Server-compatible vector report from one immutable authorized snapshot. */
export function createCommercialReportPdf(snapshot:CommercialReportSnapshot, options:{logoDataUrl?:string}={}) {
  if(snapshot.scope.projectId!==snapshot.spec.projectId || !snapshot.generation)throw Error('Snapshot inconsistente');
  const doc=new jsPDF({format:'a4',unit:'mm',compress:true});
  const title=`Relatório comercial${snapshot.scope.editionYear?' '+snapshot.scope.editionYear:''}`;
  const scope=snapshot.spec.scopeSearch.length?snapshot.spec.scopeSearch.join(' · '):snapshot.scope.projectName;
  const groups=commercialReportGroups(snapshot);
  const chart=commercialReportPreview(snapshot).chart;
  const planGroups=buildReportPlanGroups(snapshot.inventory);
  const planGroupByLot=new Map(planGroups.flatMap(group=>group.lots.map(lot=>[lot.lotId,group] as const)));
  const contractRows=commercialReportContracts(snapshot);
  const amount=(value:number|null)=>snapshot.capabilities.monetaryValues?money(value):'Informação restrita';
  let y=40;
  const pageHeader=()=>{
    const w=doc.internal.pageSize.getWidth();
    doc.setFillColor(INK);doc.rect(0,0,w,30,'F');doc.setFillColor(GOLD);doc.rect(0,30,w,1,'F');
    if(options.logoDataUrl)doc.addImage(options.logoDataUrl,'PNG',12,6,16,16);
    doc.setTextColor('#ffffff');doc.setFont('helvetica','bold');doc.setFontSize(14);doc.text('FENASOJA',options.logoDataUrl?32:12,12);
    doc.setFontSize(10);doc.text(title,options.logoDataUrl?32:12,19);
    doc.setFont('helvetica','normal');doc.setFontSize(8);doc.text(`Consulta: ${civil(snapshot.generatedAt)} (Brasília)`,w-12,12,{align:'right'});
    doc.text(snapshot.spec.presentation==='detailed'?'VISÃO DETALHADA':'VISÃO EXECUTIVA',w-12,19,{align:'right'});
  };
  const addPage=()=>{doc.addPage('a4','portrait');pageHeader();y=40;};
  const paragraph=(text:string,size=9)=>{
    doc.setFont('helvetica','normal');doc.setFontSize(size);doc.setTextColor(MUTED);
    const lines:string[]=doc.splitTextToSize(text,doc.internal.pageSize.getWidth()-24);
    for(const line of lines){if(y>doc.internal.pageSize.getHeight()-22)addPage();doc.text(line,12,y);y+=size*.48;}
    y+=3;
  };
  const heading=(text:string)=>{if(y>doc.internal.pageSize.getHeight()-40)addPage();doc.setTextColor(INK);doc.setFont('helvetica','bold');doc.setFontSize(12);const lines=doc.splitTextToSize(text,doc.internal.pageSize.getWidth()-24) as string[];doc.text(lines,12,y);y+=lines.length*5+2;};
  const table=(head:string[],body:(string|number)[][])=>{
    autoTable(doc,{startY:y,margin:{left:12,right:12,top:39,bottom:19},head:[head],body,
      styles:{font:'helvetica',fontSize:8,cellPadding:2.5,overflow:'linebreak',textColor:INK,lineColor:'#d9e1eb',lineWidth:.1},
      headStyles:{fillColor:INK,textColor:'#ffffff',fontStyle:'bold'},alternateRowStyles:{fillColor:LIGHT},
      rowPageBreak:'avoid',showHead:'everyPage',didDrawPage:pageHeader});
    y=(doc as jsPDF & {lastAutoTable:{finalY:number}}).lastAutoTable.finalY+10;
  };
  pageHeader();heading(scope);
  const filters=[snapshot.spec.saleStates.map(s=>STATES[s]??s).join(', '),snapshot.spec.period?`${snapshot.spec.period.basis==='signed'?'Assinaturas':'Cadastros'} de ${snapshot.spec.period.from.split('-').reverse().join('/')} a ${snapshot.spec.period.to.split('-').reverse().join('/')}`:'Situação vigente',snapshot.spec.monetaryBasis==='principal'?'Valores: principal, sem taxas':'Valores: principal + taxas rateadas'].filter(Boolean);
  paragraph(filters.join(' | '));
  if(snapshot.spec.sections.includes('summary')){
    const stats:[string,string][]=snapshot.spec.reportFocus==='inventory'
      ?[['Lotes no inventário',number(snapshot.totals.inventoryLots)],['Disponíveis',`${number(snapshot.totals.availableLots)} lotes`],['Vendidos no mapa',`${number(snapshot.totals.soldMapLots)} lotes`],['Área atual',`${number(snapshot.totals.currentArea)} m²`]]
      :snapshot.spec.reportFocus==='contracts'?(snapshot.capabilities.contractReferences
        ?[['Documentos ativos',number(snapshot.totals.documents)],['Documentos no recorte',number(snapshot.contracts.length)],['Documentos com versões anteriores',number(snapshot.contracts.filter(c=>c.versionCount>1).length)],['Lotes explicitamente vinculados',number(new Set(snapshot.contracts.flatMap(c=>c.lotIds)).size)]]
        :[['Documentos e abrangência','Informação restrita']])
      :[['Pedidos distintos',number(snapshot.totals.orders)],['Assinatura confirmada',`${number(snapshot.totals.signedLots)} lotes`],['Aguardando assinatura',`${number(snapshot.totals.pendingLots)} lotes`],['Legado sem comprovação',`${number(snapshot.totals.legacyLots)} lotes`],['Área negociada',`${number(snapshot.totals.historicalArea)} m²`],['Principal negociado',amount(snapshot.totals.principalCents)]];
    table(['Indicador','Resultado'],stats);
    if(snapshot.spec.monetaryBasis==='principal_and_fees')paragraph(`Taxas conciliadas${snapshot.coverage.issues.some(issue=>issue.code==='FEES_UNRECONCILED')?' conhecidas':''}: ${amount(snapshot.totals.feesCents)}. Principal + taxas: ${amount(snapshot.totals.totalCents)}.`);
    if(snapshot.totals.legacyLots>0&&snapshot.totals.legacyPrincipalCents!==null)paragraph(`Principal registrado no legado: ${amount(snapshot.totals.legacyPrincipalCents)}, exibido separadamente do principal acima. Não comprova assinatura.`);
  }
  if(snapshot.comparison){
    heading('Comparação entre períodos');
    const period=(p:{from?:string;to?:string;basis?:string})=>`${p.from?.split('-').reverse().join('/')??'Não informado'} a ${p.to?.split('-').reverse().join('/')??'Não informado'} (${p.basis==='created'?'cadastro':'assinatura'})`;
    table(['Métrica',period(snapshot.spec.period!),period(snapshot.comparison.period)],[
      ['Pedidos distintos',number(snapshot.totals.orders),number(snapshot.comparison.totals.orders)],
      ['Lotes com assinatura confirmada',number(snapshot.totals.signedLots),number(snapshot.comparison.totals.signedLots)],
      ['Lotes aguardando assinatura',number(snapshot.totals.pendingLots),number(snapshot.comparison.totals.pendingLots)],
      ['Principal negociado',amount(snapshot.totals.principalCents),amount(snapshot.comparison.totals.principalCents)],
      ['Taxas rateadas',amount(snapshot.totals.feesCents),amount(snapshot.comparison.totals.feesCents)],
      ['Área negociada (m²)',number(snapshot.totals.historicalArea),number(snapshot.comparison.totals.historicalArea)],
    ]);
    paragraph('Os dois períodos usam os mesmos filtros, base temporal e regras de contagem. São cadastros ou confirmações no período; não representam reconstrução da situação passada.');
  }
  if(snapshot.spec.sections.includes('charts')&&groups.length){
    heading(chart.unit==='BRL'?'Principal negociado por recorte':snapshot.spec.reportFocus==='contracts'?'Documentos por recorte':'Lotes por recorte');
    const max=Math.max(...chart.data.map(g=>g.value),1);
    for(const group of chart.data){if(y>265)addPage();doc.setFontSize(8);doc.setTextColor(INK);const name=doc.splitTextToSize(group.label,68) as string[];
      doc.text(name,12,y);doc.setFillColor('#e4eaf2');doc.rect(85,y-3,72,4,'F');doc.setFillColor(GOLD);doc.rect(85,y-3,72*group.value/max,4,'F');
      const value=chart.unit==='BRL'?amount(group.value*100):`${group.value} ${snapshot.spec.reportFocus==='contracts'?'docs.':'lotes'}`;
      doc.text(value,198,y,{align:'right'});y+=Math.max(8,name.length*4+2);}
    y+=4;
    if(snapshot.spec.reportFocus==='inventory')table(['Recorte','Espaços','Disponíveis','Vendidos','Em aberto','Bloqueados'],groups.map(g=>[g.label,g.lots,number(g.availableLots??null),number(g.soldMapLots??null),number(g.saleOpenLots??null),number(g.blockedLots??null)]));
    else if(snapshot.spec.reportFocus==='contracts')table(['Recorte','Documentos distintos','Lotes vinculados','Pedidos'],groups.map(g=>[g.label,number(g.documents??null),g.lots,g.orders]));
    else table(['Recorte','Lotes','Pedidos','Expositores','Principal'],groups.map(g=>[g.label,g.lots,g.orders,g.exhibitors,amount(g.principalCents)]));
    paragraph('Pedidos, expositores e documentos podem ocupar várias áreas. Seus subtotais não devem ser somados para obter identidades distintas globais.');
  }
  if(snapshot.spec.reportFocus==='inventory'){
    heading(`Inventário atual (${snapshot.inventory.length} lotes)`);
    table(['Lote / quadra','Pavilhão / área','Área atual (m²)','Situação comercial','Identificação comercial'],snapshot.inventory.map(lot=>[
      lot.lotLabel+(lot.block?'\nQuadra '+lot.block:''),lot.pavilionName??lot.segmentName??'Área não classificada',number(lot.currentArea),STATUS[lot.status]??'Situação em revisão',
      snapshot.capabilities.companyNames?[...new Set(lot.associations.map(a=>a.displayName??'Identidade não comprovada'))].join('\n')||'Sem ocupação vinculada':'Informação restrita']));
  }else if(snapshot.spec.reportFocus==='exhibitors'){
    const companies=new Map<string,typeof snapshot.rows>();
    for(const row of snapshot.rows){const key=row.exhibitorId??row.id;companies.set(key,[...(companies.get(key)??[]),row]);}
    let grouped=[...companies.values()];
    const areaOf=(rows:typeof snapshot.rows)=>rows.reduce((sum,r)=>sum+(r.historicalArea??0),0);
    const amountOf=(rows:typeof snapshot.rows)=>rows.reduce((sum,r)=>sum+(r.principalCents??0),0);
    const direction=snapshot.spec.sortDirection==='desc'?-1:1;
    grouped=grouped.sort((a,b)=>direction*(snapshot.spec.sortBy==='lots'?new Set(a.map(r=>r.lotId)).size-new Set(b.map(r=>r.lotId)).size:snapshot.spec.sortBy==='area'?areaOf(a)-areaOf(b):snapshot.spec.sortBy==='value'?amountOf(a)-amountOf(b):(a[0].displayName??'').localeCompare(b[0].displayName??'','pt-BR'))||a[0].id.localeCompare(b[0].id));
    heading(`Empresas e expositores (${snapshot.totals.exhibitors} identidades comprovadas)`);
    table(['Identificação comercial','Lotes atuais','Áreas / pavilhões','Área negociada (m²)','Principal'],grouped.map(rows=>[
      snapshot.capabilities.companyNames?rows[0].displayName??'Identidade não comprovada':'Informação restrita',
      [...new Set(rows.map(r=>r.lotLabel))].join('\n'),[...new Set(rows.map(r=>r.pavilionName??r.segmentName??'Área não classificada'))].join('\n'),
      rows.every(r=>r.historicalArea===null)?'Não informado':rows.some(r=>r.historicalArea===null)?`${number(areaOf(rows))} conhecidos; cobertura parcial`:number(areaOf(rows)),
      rows.some(r=>r.principalCents===null)?'Valor parcial / indisponível':amount(amountOf(rows))]));
    paragraph('Empresas homônimas com identidades diferentes permanecem separadas. Vínculos sem identidade comprovada não são fundidos pelo nome.');
  }else if(snapshot.spec.reportFocus!=='contracts'&&snapshot.spec.sections.some(s=>s==='sales'||s==='exhibitors')){
    heading(`Vendas e espaços (${snapshot.rows.length} linhas)`);
    table(['Empresa / referência','Lote / área','m² negociados / atuais','Situação','Principal / taxas','Documentos'],snapshot.rows.map(row=>[
      (snapshot.capabilities.companyNames?row.displayName??'Identidade não comprovada':'Identificação restrita')+'\n'+row.reference+(row.historicalDisplayName&&row.historicalDisplayName!==row.displayName?'\nNa venda: '+row.historicalDisplayName:'')
        +(snapshot.spec.presentation==='detailed'||snapshot.spec.period||['created','signed'].includes(snapshot.spec.sortBy)?'\nCadastro: '+civil(row.createdAt)+(row.signedAt?'\nAssinatura: '+civil(row.signedAt):''):''),
      row.lotLabel+'\n'+(row.pavilionName??row.segmentName??'Área não classificada')+(row.historicalLotLabel&&row.historicalLotLabel!==row.lotLabel?'\nNa venda: '+row.historicalLotLabel:''),
      number(row.historicalArea)+' / '+number(row.currentArea),
      (STATES[row.state]??row.state)+(row.partialOrder?'\nPedido parcialmente assinado':''),
      amount(row.principalCents)+'\nTaxas: '+amount(row.feesCents),row.documentCount===null?'Informação restrita':String(row.documentCount)]));
  }
  if(snapshot.spec.sections.includes('contracts')||snapshot.spec.reportFocus==='contracts'){
    heading('Documentos e abrangência');
    if(!snapshot.capabilities.contractReferences)paragraph('Informação restrita. A ausência de permissão não significa ausência de contrato.');
    else table(['Documento / empresa','Abrangência','Situação','Versões / pedido'],contractRows.map(c=>[
      (c.reference??'Sem referência comercial')+'\n'+(c.exhibitors.map(e=>e.displayName??'Identidade não comprovada').join('\n')||'Sem identidade empresarial vinculada'),c.lotIds.map(id=>snapshot.inventory.find(l=>l.lotId===id)?.lotLabel??snapshot.rows.find(r=>r.lotId===id)?.lotLabel??'Lote fora do recorte').join('\n'),c.active?'Ativo':'Inativo',`${c.versionCount} versões; ${c.active?'vigente: '+c.activeVersion:'sem versão ativa'}`+(c.orderCoverage?`\nPedido: ${c.orderCoverage.coveredLots} de ${c.orderCoverage.totalLots} lotes; ${c.orderCoverage.complete?'abrangência completa':'cobertura parcial'}`:'\nSem vínculo comprovado com pedido')]));
  }
  if(snapshot.spec.sections.includes('plan_2d')){
    const areas=new Map<string,{label:string;lots:typeof snapshot.inventory}>();
    for(const lot of snapshot.inventory){
      const key=lot.pavilionId?'pavilion:'+lot.pavilionId:'segment:'+(lot.segmentId??'unclassified')+':'+lot.category;
      const area=areas.get(key)??{label:lot.pavilionName??lot.segmentName??'Área não classificada',lots:[]};
      area.lots.push(lot);areas.set(key,area);
    }
    for(const {label:area,lots:allLots}of areas.values()){
      // Large external areas get sector pages, each preserving every individual cadastral cell.
      const sectors=allLots.length>150?new Map<string,typeof allLots>():new Map([[area,allLots]]);
      if(allLots.length>150)for(const lot of allLots){const key=`${area} · Quadra ${lot.block??'sem quadra'}`;sectors.set(key,[...(sectors.get(key)??[]),lot]);}
      for(const [sector,lots]of sectors){
        const selectedLots=new Set(lots.map(lot=>lot.lotId));
        const relevantOutlines=snapshot.planOutlines.filter(outline=>outline.lotIds?.some(id=>selectedLots.has(id))
          ||outline.kind==='pavilion'&&lots.some(l=>l.pavilionId===outline.id)||outline.kind==='segment'&&lots.some(l=>l.segmentId===outline.id));
        const {geometry,numberLabel}=buildReportPlan(lots,relevantOutlines);
        doc.addPage('a3','landscape');pageHeader();const w=420,h=297;
        doc.setTextColor(INK);doc.setFont('helvetica','bold');doc.setFontSize(13);doc.text(sector,12,41);
        const missing=lots.length-geometry.lots.length;
        doc.setFontSize(8);doc.setFont('helvetica','normal');doc.text(`${lots.length} lotes | ${missing} sem geometria válida | mesma fotografia da tabela`,12,48);
        const [vx,vy,vw,vh]=geometry.viewBox.split(' ').map(Number);const scale=Math.min((w-24)/vw,(h-89)/vh);
        const left=12+(w-24-vw*scale)/2,top=54+(h-89-vh*scale)/2;
        const pt=([x,z]:readonly number[])=>[left+(x-vx)*scale,top+(z-vy)*scale] as [number,number];
        const markers=new Map<string,number>();const markerRows: (string|number)[][]=[];
        for(const outline of geometry.outlines){doc.setDrawColor('#71849b');doc.setLineWidth(.3);doc.setFillColor('#f4f6f8');doc.path(outline.coordinates.flatMap(ring=>[...ring.map((p,i)=>({op:i?'l':'m',c:pt(geometry.project(p))})),{op:'h',c:[]}]));doc.fillStrokeEvenOdd();}
        for(const rendered of geometry.lots){
          const record=lots.find(l=>l.lotId===rendered.lot.id)!;
          doc.setDrawColor('#39516b');doc.setLineWidth(.15);doc.setFillColor(COLORS[record.status]??'#d7dce1');
          doc.path(rendered.entity.geometry.coordinates.flatMap(ring=>[...ring.map((p,i)=>({op:i?'l':'m',c:pt(geometry.project(p))})),{op:'h',c:[]}]));doc.fillStrokeEvenOdd();
          const fit=numberLabel(record.lotNumber??'S/N',rendered.labelWidth,rendered.labelHeight,scale*72/25.4,11);
          const [x,z]=pt(rendered.labelPoint);doc.setTextColor(INK);doc.setFont('helvetica','bold');doc.setFontSize(Math.max(5,fit.fontPixels));
          doc.text(record.lotNumber??'S/N',x,z,{align:'center',baseline:'middle',angle:fit.vertical?90:0});
          const lotMarkers:number[]=[];
          const group=planGroupByLot.get(record.lotId);
          if(group){
            lotMarkers.push(group.marker);
            if(!markers.has(group.key)){
              markers.set(group.key,group.marker);
              const linked=group.lots.filter(l=>selectedLots.has(l.lotId));
              markerRows.push([group.marker,group.name,linked.map(l=>l.lotLabel).join('\n'),[...new Set(linked.flatMap(l=>l.associations.map(a=>STATES[a.state]??a.state)))].join('\n')]);
            }
          }
          const code:Record<string,string>={SOLD:'V',SALE_OPEN:'A',AVAILABLE:'D',BLOCKED:'B',RESERVED:'R',IN_NEGOTIATION:'N',UNAVAILABLE:'I'};
          doc.setFontSize(7);doc.text((lotMarkers.length?'['+[...new Set(lotMarkers)].join(',')+'] · ':'')+(code[record.status]??'?'),x,z+3.5,{align:'center'});
        }
        const physicalReferences=geometry.outlines.filter(outline=>outline.kind==='support');
        physicalReferences.forEach((outline,index)=>{
          const [x,z]=pt(outline.labelPoint);doc.setFillColor('#ffffff');doc.setDrawColor(INK);doc.circle(x,z,2.7,'FD');
          doc.setTextColor(INK);doc.setFontSize(7);doc.text(`F${index+1}`,x,z,{align:'center',baseline:'middle'});
        });
        let lx=12;doc.setFont('helvetica','normal');doc.setFontSize(8);
        for(const key of ['SOLD','SALE_OPEN','AVAILABLE','BLOCKED']){doc.setFillColor(COLORS[key]);doc.rect(lx,h-28,3,3,'F');doc.setTextColor(INK);doc.text(({SOLD:'V',SALE_OPEN:'A',AVAILABLE:'D',BLOCKED:'B'}[key]??'')+' - '+STATUS[key],lx+5,h-25.5);lx+=56;}
        doc.text('Números entre colchetes: relação de expositores. Limites individuais preservados; vínculos ambíguos ficam sem marcador.',12,h-18);
        if(snapshot.calibration){const mmPerMeter=snapshot.calibration.mapUnitsPerMeter*geometry.scale*scale;const meters=[1,2,5,10,20,50,100].filter(m=>m*mmPerMeter<=55).at(-1)??1;const len=meters*mmPerMeter;doc.setDrawColor(INK);doc.line(w-75,h-28,w-75+len,h-28);doc.line(w-75,h-29,w-75,h-27);doc.line(w-75+len,h-29,w-75+len,h-27);doc.text(`${meters} m`,w-75,h-23);}
        doc.text(snapshot.calibration?'Escala gráfica conforme calibração validada. Norte não comprovado no cadastro.':'Escala métrica e norte não comprovados no cadastro; planta esquemática.',12,h-13);
        if(markerRows.length){addPage();heading(`Expositores na planta · ${sector}`);table(['Marcador','Identificação comercial','Lotes','Assinatura'],markerRows);}
        if(physicalReferences.length){
          if(doc.internal.pageSize.getWidth()>220)addPage();
          heading(`Referências físicas · ${sector}`);
          table(['Marcador na planta','Referência cadastrada'],physicalReferences.map((reference,index)=>[`F${index+1}`,reference.label]));
        }
      }
    }
  }
  if(doc.internal.pageSize.getWidth()>220)addPage();
  heading('Critérios e cobertura');
  paragraph(snapshot.coverage.complete?'Cobertura completa para o recorte autorizado.':'Cobertura parcial: ver ocorrências abaixo.');
  for(const issue of snapshot.coverage.issues)paragraph(`${ISSUE_LABELS[issue.code]??'Ocorrência cadastral em revisão'}: ${issue.count}.`);
  if(snapshot.spec.presentation==='detailed'){
    for(const note of snapshot.notes)paragraph(note);
    for(const metric of Object.values(COMMERCIAL_METRICS))paragraph(`${metric.label}: ${metric.definition}`,8);
  }else{
    for(const note of snapshot.notes.filter(n=>n.startsWith('DADOS SINTÉTICOS')))paragraph(note);
    paragraph('Pedidos e expositores são identidades distintas, sem somar duplicações entre áreas. Principal usa o snapshot negociado; taxas têm rateio em centavos. A metragem negociada é histórica; a planta usa o cadastro vigente. Legado vendido não comprova assinatura.');
  }
  paragraph('Documento anexado não comprova assinatura. Assinatura não comprova recebimento. Este relatório não é contrato nem comprovação de quitação. Arquivo e fotografia disponíveis por 30 dias após a consulta.');
  const pages=doc.getNumberOfPages();
  for(let i=1;i<=pages;i++){doc.setPage(i);const w=doc.internal.pageSize.getWidth(),h=doc.internal.pageSize.getHeight();doc.setTextColor(MUTED);doc.setFontSize(7);doc.setFont('helvetica','normal');doc.text(doc.splitTextToSize(scope,w-50)[0]??'',12,h-7);doc.text(`${i} / ${pages}`,w-12,h-7,{align:'right'});}
  doc.setProperties({title,subject:`Fotografia comercial de ${civil(snapshot.generatedAt)}`,author:'FENASOJA'});
  return {bytes:new Uint8Array(doc.output('arraybuffer')),pageCount:pages};
}
