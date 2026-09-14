import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlvoradaDiagnostics } from '@/features/alvorada/AlvoradaDiagnostics';
import { collectAlvoradaDiagnostic } from '@/features/alvorada/diagnostics';
import { createAlvoradaIntroTelemetry } from '@/features/alvorada/introTelemetry';
import { versionAlvoradaAsset } from '@/features/alvorada/assetVersion';

const setUrl = (search = '') => history.replaceState({}, '', `/${search}`);
afterEach(() => { cleanup(); setUrl(); vi.restoreAllMocks(); delete window.__alvoradaIntroTelemetry; });

describe('production diagnostics: explicit, bounded and local', () => {
  it('never shows the panel for absent, empty or disabled flags', () => {
    for (const query of ['', '?alvorada-debug', '?alvorada-debug=0']) {
      setUrl(query); const view = render(<AlvoradaDiagnostics />);
      expect(screen.queryByRole('button', { name: 'Copiar diagnóstico' })).toBeNull();
      view.unmount();
    }
  });
  it('copies a local report, outside the decorative aria-hidden scene', async () => {
    setUrl('?alvorada-debug=1&private-token=must-not-be-copied');
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const clipboard = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboard } });
    const sent = vi.spyOn(globalThis, 'fetch');
    render(<div aria-hidden="true"><AlvoradaDiagnostics /></div>);
    const button = screen.getByRole('button', { name: 'Copiar diagnóstico' });
    expect(button.closest('[aria-hidden="true"]')).toBeNull();
    fireEvent.click(button);
    await waitFor(() => expect(clipboard).toHaveBeenCalledOnce());
    const report = String(clipboard.mock.calls[0][0]);
    expect(report).not.toContain('private-token');
    expect(report).not.toContain('must-not-be-copied');
    expect(report).toContain('alvoradaRuntimeVersion');
    expect(sent).not.toHaveBeenCalled();
  });
  it('retains reasons and the initial lifecycle while bounding repeated events', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const t = createAlvoradaIntroTelemetry();
    t.mark('intro-mounted');
    for (let i = 0; i < 800; i++) t.mark('asset-progress', { receivedBytes: i });
    t.setEnvironment({ staticReason: 'context-lost' });
    t.mark('context-lost');
    expect(t.record.events.length).toBeLessThanOrEqual(512);
    expect(t.record.events[0].name).toBe('intro-mounted');
    const report = await collectAlvoradaDiagnostic();
    expect(report.fallbackReason).toBe('context-lost');
    expect(report.contextLossCount).toBe(1);
    expect(report.droppedEvents).toBeGreaterThan(0);
  });
  it('versions each public asset exactly once without changing non-Alvorada URLs', () => {
    const url = versionAlvoradaAsset('/alvorada/earth-surface-2048.webp');
    expect(versionAlvoradaAsset(url)).toBe(url);
    expect(new URL(url, 'https://test.invalid').searchParams.getAll('build')).toHaveLength(1);
    expect(versionAlvoradaAsset('/other.webp')).toBe('/other.webp');
  });
});
