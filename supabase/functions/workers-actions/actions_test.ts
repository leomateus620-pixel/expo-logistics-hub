import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { handleWorkersActions } from './index.ts';
import { actionProposalTools, executeActionCommand, executeActionProposal, listActionProposalTools } from '../_shared/workers/action-tools.ts';
import { workspaceDatabaseError, workspaceError } from '../_shared/workers/workspace-http.ts';
import { WorkerError } from '../_shared/workers/contracts.ts';

const orgId='10000000-0000-4000-8000-000000000001';
const userId='00000000-0000-4000-8000-000000000001';
const conversationId='70000000-0000-4000-8000-000000000001';
const actionId='90000000-0000-4000-8000-000000000001';
const eventId='60000000-0000-4000-8000-000000000001';
const requestId='20000000-0000-4000-8000-000000000001';
const view = { id:actionId, orgId,conversationId,kind:'arena_note',workerId:'arena',version:1,status:'proposed',summary:'Adicionar nota',target:{recordId:eventId,label:'Evento fixture',href:'/eventos-restaurante-arena/arena/agenda?evento='+eventId+'&aba=historico'},diff:[],manualInputState:'notRequired',receipt:null,failure:null };
const request=(command:unknown,options:{signal?:AbortSignal;auth?:boolean;contentType?:string}={})=>new Request('http://localhost/workers-actions',{
  method:'POST',headers:{'Content-Type':options.contentType??'application/json',...(options.auth===false?{}:{Authorization:'Bearer synthetic.caller.jwt.for.tests'})},body:JSON.stringify(command),signal:options.signal,
});

async function httpFixture(fn:(requests:Array<{url:string;body:string}>)=>Promise<void>,options:{authFailure?:boolean;noMember?:boolean;ineligible?:boolean;rpcError?:{code:string;message:string};beforeAuthReturn?:()=>void;rpcValue?:unknown}={}) {
  const original=globalThis.fetch;
  const keys=['SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_ANON_KEY','SUPABASE_PUBLISHABLE_KEYS'] as const;
  const previous=keys.map(key=>Deno.env.get(key));
  Deno.env.set('SUPABASE_URL','https://fixture.invalid');Deno.env.set('SUPABASE_PUBLISHABLE_KEY','sb_publishable_synthetic_test_only');Deno.env.delete('SUPABASE_ANON_KEY');Deno.env.delete('SUPABASE_PUBLISHABLE_KEYS');
  const calls:Array<{url:string;body:string}>=[];
  globalThis.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
    calls.push({url,body:String(init?.body??'')});
    let result:unknown;let status=200;
    if(url.includes('/auth/v1/user')){options.beforeAuthReturn?.();if(options.authFailure){result={message:'synthetic denied'};status=401;}else result={id:userId,role:'authenticated',aud:'authenticated',app_metadata:{},user_metadata:{},created_at:new Date().toISOString()};}
    else if(url.includes('/rest/v1/org_members'))result=options.noMember?[]:[{role:'admin',org_id:orgId,user_id:userId}];
    else if(url.includes('/rest/v1/user_capabilities'))result=[];
    else if(url.includes('/rest/v1/rpc/ai_workers_can_access'))result=!options.ineligible;
    else if(url.includes('/rest/v1/rpc/')){if(options.rpcError){status=400;result=options.rpcError;}else result=options.rpcValue??view;}
    else throw new Error('Unexpected synthetic URL');
    return new Response(JSON.stringify(result),{status,headers:{'Content-Type':'application/json'}});
  };
  try{await fn(calls);}finally{globalThis.fetch=original;keys.forEach((key,index)=>{if(previous[index]===undefined)Deno.env.delete(key);else Deno.env.set(key,previous[index]!);});}
}

Deno.test('actions HTTP: OPTIONS and unauthenticated requests never reach storage',async()=>{
  await httpFixture(async calls=>{
    assert.equal((await handleWorkersActions(new Request('http://localhost',{method:'OPTIONS'}))).status,204);
    assert.equal((await handleWorkersActions(request({command:'list',orgId},{auth:false}))).status,401);assert.equal(calls.length,0);
  });
});

Deno.test('actions HTTP: strict commands reject forged receipt/caps, manual PII fields, checklist and arbitrary RPC',async()=>{
  await httpFixture(async calls=>{
    for(const body of [
      {command:'confirm',orgId,actionId,expectedVersion:1,receipt:{executed:true}},
      {command:'get',orgId,actionId,capabilities:['full_access']},
      {command:'propose',orgId,conversationId,requestId,input:{kind:'checklist',eventId}},
      {command:'manual',orgId,actionId,expectedVersion:1,requestId,manualInput:{kind:'commercial_negotiate',companyName:'Empresa',contactName:null,email:'sensitive@example.com'}},
      {command:'public.cancel_sale_order_items',orgId},
    ])assert.equal((await handleWorkersActions(request(body))).status,400);
    assert.equal(calls.length,0);
  });
});

Deno.test('actions HTTP: user JWT auth and active membership precede a fixed scoped RPC',async()=>{
  await httpFixture(async calls=>{
    const response=await handleWorkersActions(request({command:'get',orgId,actionId}));assert.equal(response.status,200);assert.deepEqual(await response.json(),view);
    const storage=calls.filter(call=>call.url.includes('/rpc/')&&!call.url.endsWith('/ai_workers_can_access'));assert.equal(storage.length,1);assert.ok(storage[0].url.endsWith('/rpc/ai_workers_get_action'));
    assert.deepEqual(JSON.parse(storage[0].body),{_org_id:orgId,_action_id:actionId});
    assert.ok(calls.some(call=>call.url.includes('/org_members')));
  });
});

Deno.test('actions HTTP: auth failure/inactive association cannot call action RPC',async()=>{
  for(const fixture of [{authFailure:true},{noMember:true},{ineligible:true}])await httpFixture(async calls=>{
    const response=await handleWorkersActions(request({command:'list',orgId}));assert.ok([401,403].includes(response.status));assert.equal(calls.filter(call=>call.url.includes('/rpc/')&&!call.url.endsWith('/ai_workers_can_access')).length,0);
  },fixture);
});

Deno.test('actions HTTP: interruption during auth prevents admission/execution',async()=>{
  const controller=new AbortController();
  await httpFixture(async calls=>{
    const response=await handleWorkersActions(request({command:'confirm',orgId,actionId,expectedVersion:1},{signal:controller.signal}));assert.equal(response.status,499);assert.equal(calls.filter(call=>call.url.includes('/rpc/')).length,0);
  },{beforeAuthReturn:()=>controller.abort()});
});

Deno.test('actions HTTP: storage failures and SQL secrets are sanitized',async()=>{
  await httpFixture(async()=>{
    const response=await handleWorkersActions(request({command:'confirm',orgId,actionId,expectedVersion:1}));assert.equal(response.status,503);
    const text=await response.text();assert.ok(!text.includes('private@example.com'));assert.ok(!text.includes('SQL'));assert.equal(JSON.parse(text).error.code,'storage_unavailable');
  },{rpcError:{code:'XX000',message:'SQL failed private@example.com secret-key'}});
});

Deno.test('actions HTTP: committed expired/failed ActionView is preserved for UI and audit',async()=>{
  for(const status of ['expired','failed'])await httpFixture(async()=>{
    const response=await handleWorkersActions(request({command:'confirm',orgId,actionId,expectedVersion:1}));assert.equal(response.status,200);assert.equal((await response.json()).status,status);
  },{rpcValue:{...view,status}});
});

Deno.test('actions HTTP: malformed JSON, content type, method and byte bound fail before RPC',async()=>{
  await httpFixture(async calls=>{
    assert.equal((await handleWorkersActions(new Request('http://localhost',{method:'GET'}))).status,405);
    assert.equal((await handleWorkersActions(request({command:'list',orgId},{contentType:'text/plain'}))).status,415);
    assert.equal((await handleWorkersActions(new Request('http://localhost',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer synthetic.caller.jwt.for.tests'},body:'{broken'}))).status,400);
    assert.equal((await handleWorkersActions(request({command:'propose',orgId,conversationId,requestId,input:{kind:'arena_note',eventId,body:'x'.repeat(17000)}}))).status,413);
    assert.equal(calls.length,0);
  });
});

Deno.test('actions tools: proposal-only closed registry never exposes confirmation/deletion/finance/checklist',async()=>{
  assert.equal(actionProposalTools.length,3);assert.equal(listActionProposalTools('arena').length,1);assert.equal(listActionProposalTools('mapa').length,2);assert.equal(listActionProposalTools('agenda').length,0);
  for(const tool of actionProposalTools){assert.equal(tool.proposalOnly,true);assert.equal(tool.requiresConfirmation,true);assert.equal(tool.inputJsonSchema.additionalProperties,false);}
  const client={rpc:()=>{throw new Error('must not call')}} as unknown as SupabaseClient;
  for(const name of ['confirm_action','venue_update_checklist_item','cancel_sale_order_items','delete_event'])await assert.rejects(()=>executeActionProposal(client,name,{kind:'arena_note',eventId,body:'Nota operacional'},{orgId,conversationId,requestId}),/invalid_request/);
});

Deno.test('actions dispatch: confirm carries ID/revision only; proposal cannot carry commercial manual data',async()=>{
  const calls:Array<{name:string;args:unknown}>=[];
  const client={rpc:async(name:string,args:unknown)=>{calls.push({name,args});return{data:view,error:null};}} as unknown as SupabaseClient;
  await executeActionCommand(client,{command:'confirm',orgId,actionId,expectedVersion:3});
  assert.deepEqual(calls,[{name:'ai_workers_confirm_action',args:{_org_id:orgId,_action_id:actionId,_expected_revision:3}}]);
  await assert.rejects(()=>executeActionProposal(client,'propose_commercial_reservation',{kind:'commercial_reserve',lotId:eventId,companyName:'forged'},{orgId,conversationId,requestId}),/invalid_request/);
  assert.equal(calls.length,1);
});

Deno.test('actions errors: authorization/CAS/expiry/rate/busy map to fixed lower_snake_case codes',async()=>{
  for(const [code,message,status,out]of [
    ['42501','arbitrary private exception',403,'forbidden'],['55000','WORKERS_VERSION_CONFLICT',409,'version_conflict'],
    ['40001','WORKERS_ACTION_STALE',409,'version_conflict'],['55P03','lock timeout',409,'resource_busy'],
    ['22023','WORKERS_ACTION_SENSITIVE_TEXT',400,'sensitive_text'],['54000','WORKERS_RATE_LIMITED',429,'rate_limited'],
  ]){const error=workspaceDatabaseError({code:String(code),message:String(message)});assert.equal(error.status,status);assert.equal(error.code,out);}
  assert.ok(!(await workspaceError(new Error('private payload')).text()).includes('private payload'));
  assert.equal(workspaceError(new WorkerError('request_too_large',413)).status,413);
});
