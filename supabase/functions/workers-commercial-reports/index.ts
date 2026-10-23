import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { parseCommercialReportSnapshot } from '../_shared/workers/commercial-report.ts';
import { createCommercialReportPdf } from '../_shared/workers/generated/report-pdf.js';
import { reportLogoDataUrl } from '../_shared/workers/generated/report-logo.ts';
import { readBoundedJson } from '../_shared/workers/provider.ts';

const cors={ 'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-runtime, x-supabase-client-platform-version, x-supabase-client-runtime-version','Access-Control-Allow-Methods':'POST, OPTIONS' };
const requestSchema=z.object({operation:z.enum(['prepare','status','download','plan']),orgId:z.string().uuid(),snapshotId:z.string().uuid(),reportId:z.string().uuid().optional(),conversationId:z.string().uuid().optional(),idempotencyKey:z.string().uuid().optional()}).strict();
const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'}});
function publicKey(){
 const direct=Deno.env.get('SUPABASE_PUBLISHABLE_KEY')?.trim()||Deno.env.get('SUPABASE_ANON_KEY')?.trim();
 if(direct?.startsWith('sb_publishable_'))return direct;
 if(direct?.split('.').length===3){try{if(JSON.parse(atob(direct.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).role==='anon')return direct;}catch{/* fail closed */}}
 try{const keys:unknown=JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS')??'{}');if(keys&&typeof keys==='object'){const key=Object.values(keys).find(value=>typeof value==='string'&&value.startsWith('sb_publishable_'));if(typeof key==='string')return key;}}catch{/* fail closed */}
 throw Error('REPORT_UNAVAILABLE');
}
function client(bearer?:string){
 const url=Deno.env.get('SUPABASE_URL'), key=bearer?publicKey():Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if(!url||!key)throw Error('REPORT_UNAVAILABLE');
 return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false},...(bearer?{global:{headers:{Authorization:bearer}}}:{})});
}
async function rpc(db:SupabaseClient,name:string,args:Record<string,unknown>={}){
 const {data,error}=await db.rpc(name,args);if(error)throw Error(error.code==='42501'?'REPORT_FORBIDDEN':error.message.includes('REPORT_EXPIRED')?'REPORT_EXPIRED':'REPORT_UNAVAILABLE');return data;
}
/** Claim/lease/finish are durable RPCs. A killed HTTP request is recovered by cron. */
async function processJob(service:SupabaseClient,reportId?:string,token?:string){
 const job=await rpc(service,'workers_commercial_report_claim',{_report_id:reportId??null,_worker_token:token??null});
 if(!job)return;
 try{
  const snapshot=parseCommercialReportSnapshot(job.snapshot);
  const {bytes,pageCount}=createCommercialReportPdf(snapshot,{logoDataUrl:reportLogoDataUrl});
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const {error}=await service.storage.from('workers-commercial-reports').upload(job.objectPath,bytes,{contentType:'application/pdf',cacheControl:'0',upsert:false});
  if(error)throw Error('REPORT_STORAGE_UNAVAILABLE');
  await rpc(service,'workers_commercial_report_finish',{_report_id:job.id,_lease_token:job.leaseToken,_success:true,_file_size:bytes.length,_page_count:pageCount,_sha256:hash,_object_path:job.objectPath});
 }catch{
  // A stale lease owns a different path, so cleanup cannot remove a newer PDF.
  await service.storage.from('workers-commercial-reports').remove([job.objectPath]).catch(()=>undefined);
  await rpc(service,'workers_commercial_report_finish',{_report_id:job.id,_lease_token:job.leaseToken,_success:false}).catch(()=>undefined);
  // No company names, input data, paths or private file links are logged.
  console.error(JSON.stringify({code:'REPORT_RENDER_FAILED',reportId:job.id}));
 }
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
 if(req.method!=='POST')return json({error:{code:'method_not_allowed'}},405);
 try{
  const body=await readBoundedJson(req,4000);
  if(body&&typeof body==='object'&&'operation'in body&&body.operation==='process'){
   const token=req.headers.get('x-report-worker-token');if(!token||token.length>200)return json({error:{code:'forbidden'}},403);
   const service=client();await processJob(service,undefined,token);
   const expired=await rpc(service,'workers_commercial_report_expired_files');
   for(const row of expired??[]){if(row.object_path){const {error}=await service.storage.from('workers-commercial-reports').remove([row.object_path]);if(error)continue;}await rpc(service,'workers_commercial_report_purge',{_report_id:row.id,_object_path:row.object_path});}
   await rpc(service,'workers_commercial_report_purge',{_report_id:null});
   return json({processed:true});
  }
  const input=requestSchema.parse(body),bearer=req.headers.get('authorization');
  if(!bearer||!/^Bearer [A-Za-z0-9._-]{20,8192}$/i.test(bearer))return json({error:{code:'forbidden'}},401);
  const db=client(bearer),{data,error}=await db.auth.getUser();
  if(error||!data.user||data.user.role==='service_role')return json({error:{code:'forbidden'}},401);
  const snapshot=await rpc(db,'workers_commercial_report_snapshot',{_org_id:input.orgId,_snapshot_id:input.snapshotId});
  if((input.operation==='prepare'||input.operation==='plan')&&snapshot?.spec?.reportFocus==='inventory'&&(snapshot.spec.period||snapshot.spec.comparisonPeriod))throw Error('REPORT_INVENTORY_CURRENT_ONLY');
  if(input.operation==='plan')return json({snapshotId:snapshot.snapshotId,generation:snapshot.generation,inventory:snapshot.inventory,planOutlines:snapshot.planOutlines??[],calibration:snapshot.calibration});
  if(input.operation==='download'){
   if(!input.reportId)return json({error:{code:'invalid_request'}},400);
   const file=await rpc(db,'workers_commercial_report_download',{_org_id:input.orgId,_snapshot_id:input.snapshotId,_report_id:input.reportId});
   const {data:blob,error:storageError}=await client().storage.from('workers-commercial-reports').download(file.objectPath);
   if(storageError||!blob)throw Error('REPORT_UNAVAILABLE');
   return new Response(blob,{headers:{...cors,'Content-Type':'application/pdf','Content-Disposition':`attachment; filename="fenasoja-relatorio-${input.reportId.slice(0,8)}.pdf"`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
  }
  if(input.operation==='prepare'){
   const report=await rpc(db,'workers_commercial_report_prepare',{_org_id:input.orgId,_snapshot_id:input.snapshotId});
   // Small jobs finish in this request; all jobs also have a persisted cron consumer.
   if(snapshot.rows.length<=2000)await processJob(client(),report.id);
  }
  const report=await rpc(db,'workers_commercial_report_status',{_org_id:input.orgId,_snapshot_id:input.snapshotId,_report_id:input.reportId??null});
  return json({report});
 }catch(error){
  const code=error instanceof z.ZodError?'invalid_request':error instanceof Error&&error.message==='REPORT_FORBIDDEN'?'forbidden':error instanceof Error&&error.message==='REPORT_EXPIRED'?'expired':error instanceof Error&&error.message==='REPORT_INVENTORY_CURRENT_ONLY'?'inventory_current_only':'report_unavailable';
  return json({error:{code}},code==='forbidden'?403:code==='expired'?410:code==='invalid_request'?400:code==='inventory_current_only'?422:503);
 }
});
