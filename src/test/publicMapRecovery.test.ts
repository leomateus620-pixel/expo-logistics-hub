import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchPublicInventory, PublicMapAccessError } from '@/features/commercial-map/public/publicMapService';
import { readPublicNavigation, savePublicNavigation, takePublicNavigation } from '@/features/commercial-map/public/publicNavigation';
import { servedEntryAssets } from '@/features/commercial-map/public/useAppBuildFreshness';
const fake = vi.hoisted(() => ({ response: { data:null, error:null } as { data:unknown; error:{message:string}|null }, signal:undefined as AbortSignal|undefined }));
vi.mock('@/integrations/supabase/client', () => ({ supabase:{ rpc: () => ({ abortSignal: (signal:AbortSignal) => {
  fake.signal=signal;
  return signal.aborted ? Promise.resolve({ data:null, error:{message:'aborted'} }) : Promise.resolve(fake.response);
} }) } }));
beforeEach(() => { fake.response={data:null,error:null}; sessionStorage.clear(); });
afterEach(() => vi.useRealTimers());
describe('public network recovery boundaries', () => {
  it('recognizes only backend authorization failures as invalid links', async () => {
    fake.response.error={message:'PUBLIC_MAP_LINK_INVALID'};
    await expect(fetchPublicInventory('scope','token')).rejects.toBeInstanceOf(PublicMapAccessError);
    fake.response.error={message:'Failed to fetch'};
    await expect(fetchPublicInventory('scope','token')).rejects.not.toBeInstanceOf(PublicMapAccessError);
  });
  it('treats an empty/malformed response as unavailable, allowing retry', async () => {
    await expect(fetchPublicInventory('scope','token')).rejects.toThrow('PUBLIC_MAP_UNAVAILABLE');
  });
  it('forwards cancellation to the actual public RPC', async () => {
    const controller=new AbortController();controller.abort();
    await expect(fetchPublicInventory('scope','token',controller.signal)).rejects.toThrow('aborted');
    expect(fake.signal?.aborted).toBe(true);
  });
});
describe('public navigation across automatic code refresh', () => {
  it('does not interpret modulepreload or inline asset strings as a new build', () => {
    expect(servedEntryAssets('<script src="/assets/index-abcdefgh.js"></script><link rel="modulepreload" href="/assets/vendor-12345678.js"><script>const diagnostic="/assets/qa-abcdefgh.js";</script>')).toEqual(['/assets/index-abcdefgh.js']);
    expect(servedEntryAssets('<script src="/assets/index-newbuild123.js"></script>')).toEqual(['/assets/index-newbuild123.js']);
  });
  it('merges camera and page state and consumes the snapshot once', () => {
    savePublicNavigation({position:[4,5,6],target:[1,0,2],zoom:1.3});
    savePublicNavigation({viewMode:'list',selectedLotId:'lot-1'});
    expect(takePublicNavigation()).toMatchObject({position:[4,5,6],target:[1,0,2],zoom:1.3,viewMode:'list',selectedLotId:'lot-1'});
    expect(takePublicNavigation()).toBeNull();
  });
  it('rejects invalid and expired camera snapshots', () => {
    savePublicNavigation({position:[NaN,4,5]});expect(readPublicNavigation()).toBeNull();
    savePublicNavigation({position:[1,4,5]});
    vi.useFakeTimers();vi.setSystemTime(Date.now()+11*60_000);expect(readPublicNavigation()).toBeNull();
  });
});
