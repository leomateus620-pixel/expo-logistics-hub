const fs=require('node:fs');
(async()=>{const {createServer}=await import('vite');const s=await createServer({configFile:false,optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true},resolve:{alias:{'@':process.cwd()+'/src'}}});try{
const {OFFICIAL_REFERENCE_DATA:data}=await s.ssrLoadModule('/src/features/commercial-map/data/officialReference2026.ts');
const d=await s.ssrLoadModule('/src/features/commercial-map/data/electricalInfrastructure.ts');const u=await s.ssrLoadModule('/src/features/commercial-map/utils/electricalInfrastructure.ts');
const {buildElectricalPoleConstraints}=await s.ssrLoadModule('/src/features/commercial-map/utils/electricalPolePlacement.ts'); fs.writeFileSync(process.argv[2],JSON.stringify({data,constraints:buildElectricalPoleConstraints(data.entities,true),nodes:d.COMMERCIAL_ELECTRICAL_NODES,connections:d.COMMERCIAL_ELECTRICAL_CONNECTIONS,placements:u.resolveElectricalNodePlacements(d.COMMERCIAL_ELECTRICAL_NODES,data.entities,true)}));
}finally{await s.close()}})();
