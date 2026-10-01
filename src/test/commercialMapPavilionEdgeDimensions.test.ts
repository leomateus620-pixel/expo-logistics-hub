import {describe,it,expect} from 'vitest';
import {COMMERCIAL_PAVILION_MODULE_PLANS as plans} from '@/features/commercial-map/utils/commercialPavilionModules';
import {resolvePavilionDimensions,layoutDimensionOnScreen,dimensionRectsOverlap} from '@/features/commercial-map/utils/pavilionDimensions';
import {pavilionCirculationInfill} from '@/features/commercial-map/utils/pavilionCirculationInfill';
import {layoutPavilionAccess} from '@/features/commercial-map/utils/pavilionAccessVisibility';
import {createCommercialPavilionReferenceProjectionFrame,projectCommercialPavilionReferencePoint} from '@/features/commercial-map/data/commercialPavilionReference';

describe('bordas documentadas, sem modificar lotes',()=>{
  it.each([['B1',141,['4,50','4,50','3,00','1,50','1,50','3,00']],['B6',36,['3,00','2,00','3,00','3,00','6,00','5,00']],['B4',90,['5,50','3,00','1,50','2,00','4,00','5,00']]] as const)('%s ancora cada medida no polígono do lote %i',(id,number,values)=>{
    const plan=plans[id],before=JSON.stringify(plan),footprint={width:30,depth:55};
    const frame=createCommercialPavilionReferenceProjectionFrame(plan.projection,footprint);
    const cell=plan.cells.find(c=>c.number===number)!;
    const dimensions=resolvePavilionDimensions(plan,footprint).filter(d=>d.ownerNumber===number);
    expect(dimensions.map(d=>d.value)).toEqual(values);
    dimensions.forEach((dimension,i)=>{
      expect(dimension.startPoint).toEqual(projectCommercialPavilionReferencePoint(cell.shape!.footprint[i],frame));
      expect(dimension.endPoint).toEqual(projectCommercialPavilionReferencePoint(cell.shape!.footprint[(i+1)%6],frame));
    });
    expect(JSON.stringify(plan)).toBe(before);
  });
  it('P13 só publica comprimentos documentados, sem inventar a medida da diagonal ou área',()=>{
    const plan=plans.B5,before=JSON.stringify(plan),dimensions=resolvePavilionDimensions(plan,{width:20,depth:40});
    expect(plan.cells).toHaveLength(104);
    expect(dimensions.filter(d=>[79,80,26,25].includes(d.ownerNumber??0)).map(d=>d.value).sort()).toEqual(['3,00','3,00','3,00','3,00','6,00','6,00','6,00'].sort());
    expect(dimensions.every(d=>d.unit==='m'&&!('areaM2' in d))).toBe(true);
    expect(JSON.stringify(plan)).toBe(before);
  });
  it('cobre todas as divisões de 1 m apontadas nos anexos',()=>{
    for(const [id,numbers] of [['B1',[121,84,32,64,65]],['B6',[202,152,135,88,71,25]],['B4',[31,96,23]],['B5',[82,20]]] as const){
      const dimensions=resolvePavilionDimensions(plans[id],{width:30,depth:50});
      for(const number of numbers)expect(dimensions.some(d=>d.anchor.kind==='lot-edge'&&d.anchor.number===number&&d.value==='1,00')).toBe(true);
    }
  });
  it('preenche somente o vazio do 141, sem interseção com módulos ou alterações de plano',()=>{
    const plan=plans.B1,before=JSON.stringify(plan),rects=pavilionCirculationInfill(plan);
    expect(rects).toHaveLength(1);
    const bounds=(r:{centerX:number;centerZ:number;width:number;depth:number})=>({left:r.centerX-r.width/2,right:r.centerX+r.width/2,top:r.centerZ-r.depth/2,bottom:r.centerZ+r.depth/2});
    for(const cell of plan.cells)for(const part of cell.shape?.renderParts??[cell])expect(dimensionRectsOverlap(bounds(rects[0]),bounds(part),-1e-9)).toBe(false);
    expect(JSON.stringify(plan)).toBe(before);
    expect(pavilionCirculationInfill(plans.B6)).toEqual([]);
  });
  it('mostra a largura de 1 m em zoom legível, sem invadir a fileira',()=>{
    const result=layoutDimensionOnScreen({dimension:{type:'linear',priority:3,label:'1,00 m',minModulePixels:9},start:[100,100],end:[100,114],sidePoint:[140,107],modulePixels:14,width:500,height:500,obstacles:[]});
    expect(result?.cx).toBe(113);expect(result?.cy).toBe(107);
  });
  it('mantém a cota curta paralela ao recorte quando ainda há espaço livre antes do lote vizinho',()=>{
    const result=layoutDimensionOnScreen({dimension:{type:'linear',priority:3,label:'1,50 m',minModulePixels:9},
      start:[100,100],end:[100,148],sidePoint:[140,124],modulePixels:24,width:500,height:500,
      obstacles:[{left:0,right:500,top:146,bottom:500}]});
    expect(result?.textRotation).toBe(0);
    expect(result!.textBounds.bottom).toBeLessThan(146);
  });
});

describe('ícones legíveis e clique preservado',()=>{
  it('usa a normal externa e um conector em vez de apagar o acesso junto ao lote',()=>{
    const lot={left:100,right:200,top:150,bottom:250};
    const result=layoutPavilionAccess([150,140],[0,-1],{width:500,height:500},[lot]);
    expect(result).not.toBeNull();expect(result!.dx).toBe(0);expect(result!.dy).toBeLessThan(0);
    expect(dimensionRectsOverlap(result!.rect,lot)).toBe(false);
  });
  it('não prende um acesso fora da planta na borda da tela nem invade painéis',()=>{
    expect(layoutPavilionAccess([-60,140],[-1,0],{width:500,height:500},[])).toBeNull();
    expect(layoutPavilionAccess([150,140],[0,-1],{width:500,height:500},[{left:0,right:500,top:0,bottom:500}])).toBeNull();
  });
});
