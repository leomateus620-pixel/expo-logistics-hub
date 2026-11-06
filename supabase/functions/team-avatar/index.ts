import {createClient} from 'npm:@supabase/supabase-js@2.96.0';
import {MAX_UPLOAD_BYTES,processAvatar} from './image.ts';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,x-client-info,apikey,content-type','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
async function boundedForm(req:Request){
 const reader=req.body?.getReader();if(!reader)throw new Error('Arquivo ausente.');
 const chunks:ArrayBuffer[]=[];let size=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>MAX_UPLOAD_BYTES+64*1024){await reader.cancel();throw new Error('A foto deve ter até 8 MB.');}chunks.push(new Uint8Array(value).buffer);}}
 finally{reader.releaseLock();}
 return new Response(new Blob(chunks),{headers:{'Content-Type':req.headers.get('content-type')??''}}).formData();
}
Deno.serve(async req=>{
 if(req.method==='OPTIONS')return new Response('ok',{headers:cors});
 if(req.method!=='POST')return json({error:'Método não permitido.'},405);
 const authorization=req.headers.get('Authorization');if(!authorization)return json({error:'Entre novamente para continuar.'},401);
 const url=Deno.env.get('SUPABASE_URL')!,anon=Deno.env.get('SUPABASE_ANON_KEY')!;
 const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
 const {data:{user},error:authError}=await userClient.auth.getUser();
 if(authError||!user)return json({error:'Sessão inválida.'},401);
 const admin=createClient(url,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
 try{
  const form=await boundedForm(req);
  const commission=String(form.get('commission_id')??''),person=String(form.get('person_id')??''),requestId=String(form.get('request_id')??'');
  const version=Number(form.get('expected_version'));
  if(![commission,person,requestId].every(v=>uuid.test(v))||!Number.isInteger(version)||version<1) return json({error:'Cadastro inválido.'},400);
  const {data:prepared,error:denied}=await userClient.rpc('team_avatar_prepare',{_commission_id:commission,_person_id:person,_expected_version:version,_request_id:requestId});
  if(denied)return json({error:denied.message},denied.code==='42501'?403:409);
  if(prepared.already_committed)return json({version:prepared.version});
  const remove=form.get('remove')==='true';
  const path=remove?null:prepared.path;
  if(!remove){
   const file=form.get('file');if(!(file instanceof File))return json({error:'Selecione uma foto.'},400);
   const bytes=await processAvatar(new Uint8Array(await file.arrayBuffer()),JSON.parse(String(form.get('crop'))));
   const {error:uploadError}=await admin.storage.from('team-avatars').upload(path,bytes,{contentType:'image/webp',upsert:false,cacheControl:'3600'});
   // A retry may have uploaded this immutable path already; do not overwrite it.
   if(uploadError&&String(uploadError.statusCode)!=='409')return json({error:'O cadastro está salvo, mas o envio da foto falhou. Tente novamente.'},503);
  }
  const {data:committed,error:commitError}=await admin.rpc('team_avatar_commit',{_actor_id:user.id,_commission_id:commission,_person_id:person,_expected_version:version,_path:path,_request_id:requestId});
  if(commitError){
   // Do not delete on an ambiguous commit/network failure. The registered orphan is retried/collected later.
   return json({error:'Não foi possível confirmar a foto. Seu cadastro foi preservado; tente novamente.'},409);
  }
  try {
  if(committed.old_path&&committed.old_path!==path)await admin.storage.from('team-avatars').remove([committed.old_path]);
  // Bounded compensation on subsequent uploads. Never remove a current avatar.
  const {data:orphans}=await admin.rpc('team_avatar_orphans');
  if(orphans?.length){const {error}=await admin.storage.from('team-avatars').remove(orphans);if(!error)await admin.rpc('team_avatar_forget',{_paths:orphans});}
  } catch { /* Cleanup is retried later; a confirmed avatar remains a successful save. */ }
  return json({version:committed.version});
 }catch(error){
  // No personal data in logs or responses from decoder exceptions.
  const message=error instanceof Error?error.message:'';
  return json({error:/^(A foto|Formato|Dimensões|Enquadramento|Arquivo)/.test(message)?message:'Não foi possível processar a foto. Use outro arquivo JPEG, PNG ou WebP.'},400);
 }
});
