import { describe, expect, it, vi } from 'vitest';
import { createSceneHydrationQueue, qualifiesInteractiveFrame } from '@/features/commercial-map/utils/progressiveSceneBoot';
import { prepareHydrologyCoordinates, unpackHydrologyCoordinates } from '@/features/commercial-map/utils/hydrologyPreparation';
import { HYDROLOGICAL_NODES, HYDROLOGICAL_PIPE_SEGMENTS } from '@/features/commercial-map/data/hydrologicalInfrastructure';
import { buildHydrologicalPipeSpans, resolveHydrologicalNodePlacements } from '@/features/commercial-map/utils/hydrologicalInfrastructure';
import { OFFICIAL_REFERENCE_DATA } from '@/features/commercial-map/data/officialReference2026';

describe('progressive boot ordering and readiness',()=>{
  it('requires actual draws, controls, unblocked intervals and finished critical preparation',()=>{
    const ready={presentedFrames:3,consecutiveResponsiveFrames:2,preparing:false,controlsInstalled:true,frameIntervalMs:20};
    expect(qualifiesInteractiveFrame(ready)).toBe(true);
    for(const override of [{presentedFrames:0},{controlsInstalled:false},{preparing:true},{frameIntervalMs:120},{consecutiveResponsiveFrames:0}]){
      expect(qualifiesInteractiveFrame({...ready,...override})).toBe(false);
    }
  });
  it('admits one ordered task, yields to gestures and cancels scheduled work on disposal',()=>{
    let callback=()=>{};let allowed=false;const cancel=vi.fn();const completed=vi.fn();const order:string[]=[];
    const queue=createSceneHydrationQueue({request:fn=>{callback=fn;return cancel;},canRun:()=>allowed,onComplete:completed});
    let release=()=>{};
    queue.add({id:'decor',priority:50,run:done=>{order.push('decor');done();}});
    queue.add({id:'hydro',priority:10,run:done=>{order.push('hydro');release=done;}});
    queue.start();callback();expect(order).toEqual([]);
    allowed=true;callback();expect(order).toEqual(['hydro']);release();callback();
    expect(order).toEqual(['hydro','decor']);expect(completed).toHaveBeenCalledOnce();queue.dispose();
    const late=vi.fn();queue.add({id:'late',priority:0,run:late});expect(late).not.toHaveBeenCalled();
  });
  it('transferable hydrology preparation exactly preserves existing coordinates, topology, IDs and elevations',()=>{
    const input={nodes:HYDROLOGICAL_NODES,segments:HYDROLOGICAL_PIPE_SEGMENTS,surfaces:OFFICIAL_REFERENCE_DATA.entities,reducedGraphics:false};
    const result=unpackHydrologyCoordinates(input,prepareHydrologyCoordinates(input));
    expect(result.pipeSpans).toEqual(buildHydrologicalPipeSpans(input.segments,input.surfaces,false));
    expect(result.placements).toEqual(resolveHydrologicalNodePlacements(input.nodes,input.surfaces));
  });
});
