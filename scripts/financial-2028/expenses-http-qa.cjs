/* Actual signed JWT requests against local PostgREST; no browser automation or external credentials. */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const { randomUUID }=require('node:crypto');
const args=process.argv.slice(2);
const output=path.resolve(args.includes('--output')?args[args.indexOf('--output')+1]:'docs/validation/financial-expenses-comparison');
const origin='http://127.0.0.1:5580';
const report={boundary:'Signed local fixture JWTs → actual PostgREST → migrated PostgreSQL RPCs/RLS; no production access.',
  checks:[],limitation:'Local fixture session endpoint replaces Supabase Auth. Real JWT signatures, role claims and financial permissions are verified; remote Supabase login is not tested.'};
const check=(name,condition)=>{report.checks.push({name,passed:Boolean(condition)});assert(condition,name);console.log(JSON.stringify(report.checks.at(-1)));};
const profiles={};
async function rpc(name,args,profile='admin'){
  const response=await fetch(`${origin}/rest/v1/rpc/${name}`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${profiles[profile].accessToken}`},body:JSON.stringify(args),signal:AbortSignal.timeout(15000)});
  return {status:response.status,data:await response.json()};
}
const success=async promise=>{const result=await promise;assert.equal(result.status,200,JSON.stringify(result.data));return result.data;};
(async()=>{
  for(const profile of ['admin','reader','editor','confirmer','denied']){
    const response=await fetch(`${origin}/qa/session?profile=${profile}`);assert.equal(response.status,200);profiles[profile]=await response.json();
  }
  const org=profiles.admin.orgId;
  const editionResponse=await fetch(`${origin}/rest/v1/financial_editions?org_id=eq.${org}&code=eq.2028`,{headers:{Authorization:`Bearer ${profiles.admin.accessToken}`}});
  assert.equal(editionResponse.status,200);const edition=(await editionResponse.json())[0].id;
  check('Signed JWT reads operational edition through PostgREST RLS',Boolean(edition));
  const can=profile=>rpc('financial_can',{_org_id:org,_capability:'financial_edit'},profile);
  check('Reader JWT is denied financial editing',(await success(can('reader')))===false);
  check('Editor JWT is allowed editing',(await success(can('editor')))===true);
  check('Logistics operator JWT is denied finance access',(await success(rpc('financial_can',{_org_id:org,_capability:'financial_access'},'denied')))===false);
  const invalid=await fetch(`${origin}/rest/v1/rpc/financial_can`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${profiles.admin.accessToken.slice(0,-5)}wrong`},body:JSON.stringify({_org_id:org,_capability:'financial_access'})});
  check('Tampered JWT signature is rejected by PostgREST',invalid.status===401);
  const listArgs={_org_id:org,_edition_id:edition,_filters:{},_limit:25,_offset:0};
  const initial=await success(rpc('financial_list_expenses',listArgs));
  const denied=await rpc('financial_list_expenses',listArgs,'denied');
  check('Without-finance JWT is denied expense RPC',denied.status===403&&denied.data.message.includes('FINANCIAL_FORBIDDEN'));
  const seedTitle=`QA local · HTTP autenticado ${randomUUID().slice(0,8)}`;
  let category=await success(rpc('financial_save_category',{_org_id:org,_payload:{domain:'despesa',name:seedTitle},_expected_version:null,_request_id:randomUUID()}));
  check('Admin JWT creates category via real RPC',Boolean(category.id));
  category=await success(rpc('financial_save_category',{_org_id:org,_payload:{domain:'despesa',id:category.id,name:`${seedTitle} renomeada`},_expected_version:category.version,_request_id:randomUUID()}));
  check('Admin JWT renames category with version increment',category.version===2);
  const saveArgs={_org_id:org,_payload:{edition_id:edition,title:seedTitle,category_id:category.id,planned_cents:10001,planned_on:'2028-05-01'},_expected_version:null,_request_id:randomUUID(),_reason:null};
  let expense=await success(rpc('financial_save_expense',saveArgs,'editor'));
  const replay=await success(rpc('financial_save_expense',saveArgs,'editor'));
  check('Editor JWT creates one forecast across retry',expense.id===replay.id&&expense.planned_cents===10001);
  const readerWrite=await rpc('financial_save_expense',{...saveArgs,_request_id:randomUUID()},'reader');
  check('Read-only JWT cannot create expenses',readerWrite.status===403);
  const forbiddenRealize=await rpc('financial_transition_expense',{_org_id:org,_expense_id:expense.id,_to:'realizada',_expected_version:expense.version,
    _payload:{committed_cents:12001,committed_on:'2028-05-02'},_reason:null,_request_id:randomUUID()},'editor');
  check('Editor JWT cannot realize without confirmation capability',forbiddenRealize.status===403&&forbiddenRealize.data.message.includes('financial_confirm'));
  expense=await success(rpc('financial_transition_expense',{_org_id:org,_expense_id:expense.id,_to:'realizada',_expected_version:expense.version,
    _payload:{committed_cents:12001,committed_on:'2028-05-02',due_date:'2028-06-01'},_reason:null,_request_id:randomUUID()},'confirmer'));
  check('Confirmer JWT realizes expense and preserves forecast',expense.status==='realizada'&&expense.planned_cents===10001&&expense.committed_cents===12001&&Boolean(expense.obligation_id));
  const movement=await success(rpc('financial_record_movement',{_org_id:org,_payload:{edition_id:edition,kind:'pagamento',direction:'saida',amount_cents:3001,occurred_on:'2028-05-03'},
    _allocations:[{obligation_id:expense.obligation_id,amount_cents:3001}],_request_id:randomUUID()}));
  const paid=await success(rpc('financial_expense_detail',{_org_id:org,_expense_id:expense.id},'reader'));
  check('Reader JWT sees committed, net paid and balance from server',paid.expense.committed_cents===12001&&paid.expense.paid_cents===3001&&paid.expense.open_cents===9000);
  const prohibitedCancel=await rpc('financial_transition_expense',{_org_id:org,_expense_id:expense.id,_to:'cancelada',_expected_version:expense.version,_payload:{},_reason:'QA HTTP cancelamento',_request_id:randomUUID()});
  check('Authenticated cancellation rejects settled expense',prohibitedCancel.status===400&&prohibitedCancel.data.message.includes('FINANCIAL_HAS_SETTLEMENT'));
  await success(rpc('financial_reverse_movement',{_org_id:org,_movement_id:movement.id,_reason:'QA HTTP estorno',_occurred_on:'2028-05-04',_request_id:randomUUID()}));
  expense=await success(rpc('financial_transition_expense',{_org_id:org,_expense_id:expense.id,_to:'prevista',_expected_version:expense.version,_payload:{},_reason:'QA HTTP reversão após estorno',_request_id:randomUUID()},'confirmer'));
  check('Authenticated reversal returns to forecast after payment reversal',expense.status==='prevista'&&expense.planned_cents===10001&&expense.paid_cents===0);
  const concurrent=await Promise.all(['admin','confirmer'].map((profile,index)=>rpc('financial_save_expense',{_org_id:org,_payload:{id:expense.id,title:`${seedTitle} sessão ${index+1}`},
    _expected_version:expense.version,_request_id:randomUUID(),_reason:null},profile)));
  check('Two distinct authorized JWT sessions accept one version and reject stale edit',concurrent.filter(result=>result.status===200).length===1
    &&concurrent.filter(result=>result.status>=400&&result.data.message.includes('FINANCIAL_CONFLICT')&&result.data.code==='40001').length===1);
  expense=concurrent.find(result=>result.status===200).data;
  expense=await success(rpc('financial_transition_expense',{_org_id:org,_expense_id:expense.id,_to:'cancelada',_expected_version:expense.version,_payload:{},_reason:'QA HTTP encerramento de teste',_request_id:randomUUID()}));
  check('Authenticated cancellation preserves record and history',expense.status==='cancelada');
  category=await success(rpc('financial_save_category',{_org_id:org,_payload:{domain:'despesa',id:category.id,active:false},_expected_version:category.version,_request_id:randomUUID()}));
  const detail=await success(rpc('financial_expense_detail',{_org_id:org,_expense_id:expense.id}));
  check('Archived category retains existing expense link and audit',category.active===false&&detail.expense.category_id===category.id&&detail.history.length>=4);
  const filtered=await success(rpc('financial_list_expenses',{...listArgs,_filters:{q:seedTitle},_limit:1}));
  const cmp=await success(rpc('financial_expense_comparison',{_org_id:org,_edition_id:edition,_filters:{q:seedTitle}}));
  check('Filtered list and server aggregation agree across pagination',filtered.total===1&&filtered.items.length===1&&cmp.totals.count===1&&cmp.totals.planned_cents===0&&cmp.totals.committed_cents===0);
  report.summary={passed:report.checks.filter(row=>row.passed).length,total:report.checks.length,initialExpenseCount:initial.total,
    testExpenseId:expense.id,testCategoryId:category.id};
})().catch(error=>{report.error=error.message;process.exitCode=1;console.error(error.message);}).finally(()=>{
  fs.mkdirSync(output,{recursive:true});
  fs.writeFileSync(path.join(output,'authenticated-http-report.json'),JSON.stringify(report,null,2));
});
