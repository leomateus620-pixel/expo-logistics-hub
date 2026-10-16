import { render, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { MapLotDeepLink } from '../features/commercial-map/components/MapLotDeepLink';
const id = '10000000-0000-4000-8000-000000000001';
afterEach(cleanup);
it('opens only a loaded authorized lot using its persisted entity', () => {
  const onOpen = vi.fn(); const onConsume = vi.fn();
  render(<MapLotDeepLink lotId={id} lots={[{ id, entityId: 'persisted-entity' }]} onOpen={onOpen} onConsume={onConsume} />);
  expect(onOpen).toHaveBeenCalledWith('persisted-entity'); expect(onConsume).toHaveBeenCalledTimes(1);
});
it.each(['not-a-uuid', '10000000-0000-4000-8000-000000000002'])('does not open an unknown or malformed target: %s', lotId => {
  const onOpen = vi.fn(); const onConsume = vi.fn();
  render(<MapLotDeepLink lotId={lotId} lots={[{ id, entityId: 'persisted-entity' }]} onOpen={onOpen} onConsume={onConsume} />);
  expect(onOpen).not.toHaveBeenCalled(); expect(onConsume).toHaveBeenCalledTimes(1);
});
