import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import WorkersLauncher from '@/components/WorkersLauncher';
import { WorkersLauncherSlot } from '@/components/WorkersLauncherSlot';
const access = vi.hoisted(() => ({ eligible: true }));
vi.mock('@/hooks/useAuth', () => ({ useAuth: () => ({ user: { id: 'test-user' } }) }));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'test-org' }) }));
vi.mock('@/features/workers/WorkersSessionRunner', () => ({ default: () => null }));
vi.mock('@/features/workers/WorkersAccessGate', () => ({ readUnlock: () => false, writeUnlock: vi.fn(), useWorkersEligibility: () => access,
  PasswordPrompt: () => <p>Confirme sua senha</p> }));
afterEach(() => { cleanup(); access.eligible = true; });
describe('Bot FENASOJA placement', () => {
  it.each([['/portal', 'portal'], ['/mapa-comercial', 'map'], ['/cronograma-eventos', 'agenda']] as const)('mounts exactly once inside the %s header slot', async (route, surface) => {
    render(<MemoryRouter initialEntries={[route]}><WorkersLauncherSlot surface={surface} /><WorkersLauncher /></MemoryRouter>);
    const trigger = screen.getByRole('button', { name: 'Abrir BOT FENASOJA' });
    expect(trigger.closest('[data-workers-launcher-slot]')).toHaveAttribute('data-workers-launcher-slot', surface);
    expect(document.querySelectorAll('[data-workers-launcher]')).toHaveLength(1);
    expect(trigger).not.toHaveClass('workers-launcher-button--floating');
    fireEvent.click(trigger);
    expect(await screen.findByRole('dialog')).toHaveTextContent('Confirme sua senha');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
  });
  it('keeps the password gate when opened by keyboard and removes the trigger when access is denied', async () => {
    const view = render(<MemoryRouter initialEntries={['/portal']}><WorkersLauncherSlot surface="portal" /><WorkersLauncher /></MemoryRouter>);
    act(() => fireEvent.keyDown(window, { key: 'k', ctrlKey: true }));
    expect(await screen.findByRole('dialog')).toHaveTextContent('Confirme sua senha');
    access.eligible = false;
    view.rerender(<MemoryRouter initialEntries={['/portal']}><WorkersLauncherSlot surface="portal" /><WorkersLauncher /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Abrir BOT FENASOJA' })).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('does not replace a missing header slot with an overlapping floating button', () => {
    render(<MemoryRouter initialEntries={['/mapa-comercial']}><WorkersLauncher /></MemoryRouter>);
    expect(screen.queryByRole('button', { name: 'Abrir BOT FENASOJA' })).not.toBeInTheDocument();
  });
});
