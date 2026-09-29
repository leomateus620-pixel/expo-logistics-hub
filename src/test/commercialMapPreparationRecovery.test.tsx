import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercialMapSceneShaderWarmup } from '@/features/commercial-map/components/canvas/CommercialMapSceneShaderWarmup';
import { RetiredSceneProgramError } from '@/features/commercial-map/utils/sceneShaderWarmup';
import { COMMERCIAL_MAP_RENDER_RETRY_EVENT } from '@/features/commercial-map/utils/renderingHealth';
const mock=vi.hoisted(()=>({prepare:vi.fn(),state:{} as Record<string,unknown>}));
vi.mock('@react-three/fiber',()=>({useThree:(selector:(state:unknown)=>unknown)=>selector(mock.state)}));
vi.mock('@/features/commercial-map/components/canvas/DeferredSceneLayer',()=>({scheduleCommercialMapSceneTask:vi.fn()}));
vi.mock('@/features/commercial-map/utils/sceneShaderWarmup',async original=>({...await original<typeof import('@/features/commercial-map/utils/sceneShaderWarmup')>(),prepareCommercialScene:mock.prepare}));
let canvas:HTMLCanvasElement;
beforeEach(()=>{vi.useFakeTimers();mock.prepare.mockReset();canvas=document.createElement('canvas');mock.state={gl:{domElement:canvas,extensions:{has:()=>true},getContext:()=>({isContextLost:()=>false})},scene:{},camera:{},invalidate:vi.fn()};});
afterEach(()=>{cleanup();vi.useRealTimers();});
describe('bounded preparation recovery on the existing renderer',()=>{
  it('collects a fresh scene once after program retirement, with no remount or data request',async()=>{
    mock.prepare.mockRejectedValueOnce(new RetiredSceneProgramError()).mockResolvedValueOnce(undefined);
    render(<CommercialMapSceneShaderWarmup preparePost={false}/>);
    await act(async()=>{await vi.runAllTimersAsync();});
    expect(mock.prepare).toHaveBeenCalledTimes(2);
    expect(mock.prepare.mock.calls[0][0]).toBe(mock.prepare.mock.calls[1][0]);
    expect(canvas.dataset.commercialMapEssentialReady).toBe('true');
    expect(canvas.dataset.commercialMapPreparationError).toBeUndefined();
  });
  it('stops after a second failure and only restarts on an explicit retry',async()=>{
    mock.prepare.mockRejectedValue(new RetiredSceneProgramError());
    render(<CommercialMapSceneShaderWarmup preparePost={false}/>);
    await act(async()=>{await vi.runAllTimersAsync();});
    expect(mock.prepare).toHaveBeenCalledTimes(2);expect(vi.getTimerCount()).toBe(0);
    expect(canvas.dataset.commercialMapEssentialReady).toBe('false');expect(canvas.dataset.commercialMapPreparationError).toBe('SCENE_PROGRAM_RETIRED');
    mock.prepare.mockResolvedValue(undefined);
    await act(async()=>{canvas.dispatchEvent(new Event(COMMERCIAL_MAP_RENDER_RETRY_EVENT));});
    expect(mock.prepare).toHaveBeenCalledTimes(3);expect(canvas.dataset.commercialMapEssentialReady).toBe('true');
  });
});
