/** Deno server-runtime smoke; input is the isolated synthetic fixture only. */
import { parseCommercialReportSnapshot } from '../../supabase/functions/_shared/workers/commercial-report.ts';
import { createCommercialReportPdf } from '../../supabase/functions/_shared/workers/generated/report-pdf.js';
import { reportLogoDataUrl } from '../../supabase/functions/_shared/workers/generated/report-logo.ts';
const snapshot=parseCommercialReportSnapshot(JSON.parse(await Deno.readTextFile('/tmp/fenasoja-reports/snapshot.json')));
snapshot.spec.sections=['summary','sales','charts','plan_2d'];
if(Deno.args.includes('--stress')){
 const row=snapshot.rows[0],lot=snapshot.inventory[0];
 const id=(n:number)=>'70000000-0000-4000-8000-'+String(n).padStart(12,'0');
 snapshot.rows=Array.from({length:706},(_,i)=>({...row,id:id(i+1),lotId:id(i+2001),reference:'SINTÉTICO '+i,displayName:'Empresa São José - Comércio e Serviços Agrícolas de Santa Rosa e Região Ltda.'}));
 snapshot.inventory=Array.from({length:1652},(_,i)=>({...lot,lotId:id(i+2001),entityId:id(i+4001),lotNumber:String(i+1),lotLabel:'Lote de teste '+(i+1),block:String(Math.floor(i/104)),pavilionName:null,pavilionId:null,associations:[],labelAnchor:null,
 geometry:{type:'Polygon' as const,coordinates:[[[i%50*12,Math.floor(i/50)*12],[i%50*12+10,Math.floor(i/50)*12],[i%50*12+10,Math.floor(i/50)*12+10],[i%50*12,Math.floor(i/50)*12+10],[i%50*12,Math.floor(i/50)*12]]]}}));
 snapshot.planOutlines=[];snapshot.totals.inventoryLots=1652;snapshot.notes.unshift('CARGA SINTÉTICA, sem dados de produção.');
}
const started=performance.now();
const result=createCommercialReportPdf(snapshot,{logoDataUrl:reportLogoDataUrl});
if(result.bytes.byteLength<1000||result.pageCount<2)throw Error('Invalid portable renderer output');
await Deno.writeFile('/tmp/fenasoja-reports/deno-runtime-synthetic.pdf',result.bytes);
console.log(JSON.stringify({runtime:'Deno',pageCount:result.pageCount,bytes:result.bytes.byteLength,synthetic:true,elapsedMs:Math.round(performance.now()-started),rows:snapshot.rows.length,lots:snapshot.inventory.length}));
