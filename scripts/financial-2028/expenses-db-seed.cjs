/* Labeled browser fixture created through real financial RPCs in a local-only test database. */
const { spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const assert = require('node:assert/strict');
const args=process.argv.slice(2), option=name=>args[args.indexOf(name)+1];
const psql=option('--psql'), port=option('--port');
assert(path.isAbsolute(psql)&&/^\d+$/.test(port),'Explicit local runtime required.');
const org='a0000000-0000-0000-0000-000000000001';
const lit=value=>value==null?'NULL':`'${String(value).replaceAll("'","''")}'`;
const json=value=>`${lit(JSON.stringify(value))}::jsonb`;
function run(text){
  const result=spawnSync(psql,['-X','-q','-A','-t','-h','127.0.0.1','-p',port,'-U','postgres','-d','financial_expenses_qa',
    '-v','ON_ERROR_STOP=1','-f','-'],{input:`BEGIN; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub='10000000-0000-0000-0000-000000000001';\n${text};\nCOMMIT;`,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr); return JSON.parse(result.stdout.trim());
}
const edition=run(`SELECT json_build_object('id',id) FROM financial_editions WHERE org_id='${org}' AND code=2028`).id;
const categories=['Infraestrutura e Obras','Eventos e Produção','Marketing e Comunicação','Segurança','Categoria personalizada'];
const cat=categories.map(name=>run(`SELECT financial_save_category('${org}',${json({domain:'despesa',name})},NULL,'${randomUUID()}')`));
const save=payload=>run(`SELECT financial_save_expense('${org}',${json({edition_id:edition,...payload})},NULL,'${randomUUID()}')`);
const fixtures=[
  {title:'QA local · Estrutura principal e montagem',category_id:cat[0].id,commission_id:'c0000000-0000-0000-0000-000000000001',
    status:'realizada',planned_cents:14500000,committed_cents:15825000,planned_on:'2028-05-01',committed_on:'2028-05-05',due_date:'2026-10-01'},
  {title:'QA local · Programação cultural',category_id:cat[1].id,commission_id:'c0000000-0000-0000-0000-000000000003',
    status:'realizada',planned_cents:6500000,committed_cents:6500000,planned_on:'2028-05-02',committed_on:'2028-05-06',due_date:'2028-06-01'},
  {title:'QA local · Campanha de comunicação',category_id:cat[2].id,commission_id:'c0000000-0000-0000-0000-000000000002',
    planned_cents:7800000,planned_on:'2028-05-03'},
  {title:'QA local · Reforço de segurança sem previsão',category_id:cat[3].id,commission_id:'c0000000-0000-0000-0000-000000000001',
    status:'realizada',committed_cents:2750000,committed_on:'2028-05-07',due_date:'2026-10-02'},
  {title:'QA local · Assessoria especializada',category_id:cat[4].id,commission_id:'c0000000-0000-0000-0000-000000000002',
    status:'realizada',planned_cents:3000000,committed_cents:2500000,planned_on:'2028-05-04',committed_on:'2028-05-08',due_date:'2028-06-02'},
  {title:'QA local · Serviços ainda sem classificação',planned_cents:1800000,planned_on:'2028-05-05'},
];
const records=fixtures.map(save);
run(`SELECT financial_record_movement('${org}',${json({edition_id:edition,kind:'pagamento',direction:'saida',amount_cents:4500000,occurred_on:'2028-05-09'})},
  ${json([{obligation_id:records[0].obligation_id,amount_cents:4500000}])},'${randomUUID()}')`);
run(`SELECT financial_save_category('${org}',${json({id:cat[4].id,active:false})},${cat[4].version},'${randomUUID()}')`);
// Extra persisted forecast rows exercise a second page; aggregates still come from the server.
for(let i=1;i<=24;i++) save({title:`QA local · Planejamento complementar ${String(i).padStart(2,'0')}`,
  category_id:cat[i%4].id,commission_id:`c0000000-0000-0000-0000-00000000000${i%3+1}`,
  planned_cents:125000+i*1001,planned_on:'2028-05-10'});
console.log('30 labeled local expense records seeded through financial RPCs.');
