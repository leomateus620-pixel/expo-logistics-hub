import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { allocateCommercialFees, commercialReportSpecSchema, parseCommercialReportSnapshot, parseCommercialReportSpec, type CommercialReportSnapshot } from '../commercial-report.ts';
import { publicWorkerToolResult } from '../registry.ts';
import { sanitizeWorkerData } from '../privacy.ts';
const projectId='10000000-0000-4000-8000-000000000001';
function sample(): CommercialReportSnapshot {
  return {schemaVersion:1,snapshotId:projectId,generatedAt:'2026-10-23T12:00:00Z',generation:'a'.repeat(32),
    spec:commercialReportSpecSchema.parse({projectId}),scope:{projectId,projectName:'FENASOJA teste',editionYear:null,timezone:'America/Sao_Paulo'},
    totals:{orders:0,signedLots:0,pendingLots:0,legacyLots:0,cancelledItems:0,partialOrders:0,exhibitors:0,documents:null,soldMapLots:0,availableLots:0,inventoryLots:0,
      principalCents:null,signedPrincipalCents:null,pendingPrincipalCents:null,legacyPrincipalCents:null,feesCents:null,totalCents:null,historicalArea:null,currentArea:null},
    coverage:{complete:true,excludedRows:0,issues:[]},capabilities:{companyNames:true,monetaryValues:false,contractReferences:false},rows:[],inventory:[],contracts:[],groups:[],planOutlines:[],calibration:null,notes:[]};
}
describe('authorized commercial report contract',()=>{
  it('rejects unknown SQL, credentials, free scopes and unsupported period bases',()=>{
    for(const value of [{projectId,sql:'select *'},{projectId,orgId:projectId},{projectId,scopes:[{kind:'pavilion',id:'B12'}]},
      {projectId,period:{from:'2026-10-01',to:'2026-10-31',basis:'paid'}}]) expect(commercialReportSpecSchema.safeParse(value).success).toBe(false);
    expect(()=>parseCommercialReportSpec({projectId,period:{from:'2026-02-30',to:'2026-10-01',basis:'created'}})).toThrow();
    expect(()=>parseCommercialReportSpec({projectId,minArea:30,maxArea:20})).toThrow();
  });
  it('keeps historical values unknown rather than replacing them with current area or zero',()=>{
    expect(parseCommercialReportSnapshot(sample()).totals).toMatchObject({historicalArea:null,principalCents:null,documents:null});
  });
  it('defends totals and references as well as individual rows when capabilities disappear',()=>{
    const snapshot=sample();snapshot.totals.principalCents=100;
    expect(()=>parseCommercialReportSnapshot(snapshot)).toThrow(/não autorizados/);
    const documents=sample();documents.totals.documents=0;
    expect(()=>parseCommercialReportSnapshot(documents)).toThrow(/não autorizado/);
    expect(()=>parseCommercialReportSnapshot({...sample(),scope:{...sample().scope,projectId:'10000000-0000-4000-8000-000000000002'}})).toThrow(/divergente/);
  });
  it('keeps full immutable evidence out of external MCP tool results while preserving the bounded preview',()=>{
    const preview={snapshotId:projectId,shownRows:25,totalRows:1000};
    const full={...sample(),rows:Array.from({length:1000},()=>({privateEvidence:'server-only'}))} as unknown as CommercialReportSnapshot;
    const internal={summary:'Consulta verificada',records:[preview],citations:[],total:1000,truncated:true,commercialSnapshot:full};
    expect(publicWorkerToolResult(internal)).toEqual({summary:internal.summary,records:[preview],citations:[],total:1000,truncated:true});
    expect(JSON.stringify(publicWorkerToolResult(internal))).not.toContain('privateEvidence');
    expect(internal.commercialSnapshot).toBe(full); // Server capture retains immutable evidence.
    expect(readFileSync('src/lib/workers/registry.ts','utf8')).toContain('return publicWorkerToolResult(await executeWorkerTool(name,input,ctx))');
  });
  it('does not weaken the global buyer sanitizer to enable report display names',()=>{
    expect(sanitizeWorkerData({buyer_name:'Pessoa',buyer_trade_name:'Empresa',phone:'99999'})).toEqual({});
  });
  it('keeps server and canonical schemas and privacy implementation identical',()=>{
    for(const name of ['commercial-report.ts','privacy.ts']) expect(readFileSync(`supabase/functions/_shared/workers/${name}`,'utf8')).toBe(readFileSync(`src/lib/workers/${name}`,'utf8'));
  });
});
describe('fee allocation before analytical scope filters',()=>{
  it('conserves the exact order amount with a deterministic stable-ID residue',()=>{
    const shares=allocateCommercialFees([{id:'b',principalCents:100},{id:'a',principalCents:100},{id:'c',principalCents:100}],100);
    expect([...shares]).toEqual([['a',34],['b',33],['c',33]]);
    expect([...shares.values()].reduce((a,b)=>a+b,0)).toBe(100);
    expect(shares.get('b')).toBe(33); // A pavilion/signature subset receives only its own quota.
  });
  it('uses integer arithmetic even when multiplication exceeds safe floating point precision',()=>{
    const shares=allocateCommercialFees([{id:'a',principalCents:8_000_000_000_000},{id:'b',principalCents:7_000_000_000_000}],8_000_000_000_001);
    expect([...shares.values()].reduce((a,b)=>a+b,0)).toBe(8_000_000_000_001);
  });
  it('fails closed for missing/invalid margins and duplicate identities',()=>{
    expect(()=>allocateCommercialFees([{id:'a',principalCents:0}],1)).toThrow();
    expect(()=>allocateCommercialFees([{id:'a',principalCents:1},{id:'a',principalCents:1}],1)).toThrow();
    expect(()=>allocateCommercialFees([{id:'a',principalCents:-1}],1)).toThrow();
    expect(()=>allocateCommercialFees([{id:'a',principalCents:1}],Number.MAX_SAFE_INTEGER+1)).toThrow();
  });
});
