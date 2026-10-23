/** Controlled synthetic artifacts; never queries the connected project. */
import { readFile,writeFile } from 'node:fs/promises';
import { createCommercialReportPdf } from '../../src/lib/workers/report-pdf';
import { parseCommercialReportSnapshot } from '../../src/lib/workers/commercial-report';
const raw=JSON.parse(await readFile('/tmp/fenasoja-reports/snapshot.json','utf8'));
const base=parseCommercialReportSnapshot(raw);
base.scope.projectName='DADOS SINTÉTICOS - validação de relatório';
base.spec.scopeSearch=['DADOS SINTÉTICOS - todas as áreas'];
base.spec.sections=['summary','sales','exhibitors','contracts','charts','plan_2d'];
base.spec.presentation='detailed';
// The isolated SQL fixture intentionally reuses a square. Give renderer QA a visible
// synthetic grid; never copy coordinates into a commercial record or live database.
for(const [i,lot]of base.inventory.entries()){
 const x=(i%8)*14,z=Math.floor(i/8)*16;
 lot.geometry={type:'Polygon',coordinates:[[[x,z],[x+12,z],[x+12,z+13],[x,z+13],[x,z]]]};
 lot.labelAnchor=[x+6,z+6.5];
 for(const a of lot.associations)a.displayName='Empresa São José - Comércio e Serviços Agrícolas de Santa Rosa Ltda. (SINTÉTICO)';
}
base.planOutlines=[];
base.notes.unshift('DADOS SINTÉTICOS CONTROLADOS. As empresas, valores e plantas deste exemplo não representam informações comerciais reais.');
const logoDataUrl='data:image/png;base64,'+(await readFile('public/alvorada/fenasoja-symbol-official.png')).toString('base64');
for(const [filename,data]of [['detalhado-sintetico.pdf',base],['executivo-sintetico.pdf',{...base,spec:{...base.spec,presentation:'executive',sections:['summary']}}]] as const){
 const pdf=createCommercialReportPdf(data,{logoDataUrl});await writeFile('docs/workers/commercial-reports/examples/'+filename,pdf.bytes);console.log(JSON.stringify({filename,pages:pdf.pageCount,bytes:pdf.bytes.length}));
}
