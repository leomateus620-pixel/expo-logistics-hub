import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PortalModuleEmblem } from '@/components/portal/emblems/PortalModuleEmblem';
import { PORTAL_MODULE_SYMBOLS } from '@/components/portal/emblems/portalModuleSymbols';
import { portalPrimaryEntries } from '@/modules/portal/portalRegistry';

const emblemStyles = readFileSync(resolve('src/styles/portal-module-emblems.css'), 'utf8');
const symbolsSource = readFileSync(resolve('src/components/portal/emblems/portalModuleSymbols.tsx'), 'utf8');

describe('emblemas dos módulos do portal', () => {
  it('desenha um símbolo exclusivo para cada um dos seis módulos', () => {
    const ids = portalPrimaryEntries.map((entry) => entry.id);
    expect(Object.keys(PORTAL_MODULE_SYMBOLS).sort()).toEqual([...ids].sort());

    const markup = ids.map((id) => {
      const { container } = render(<PortalModuleEmblem module={id} />);
      const emblem = container.querySelector('.portal-emblem');
      expect(emblem).toHaveAttribute('aria-hidden', 'true');
      expect(emblem?.querySelector('svg')).toHaveAttribute('viewBox', '0 0 32 32');
      return emblem?.querySelector('svg')?.innerHTML;
    });
    expect(new Set(markup).size).toBe(ids.length);
  });

  it('expõe nome acessível apenas quando solicitado e reflete estados', () => {
    const { container, getByRole } = render(
      <PortalModuleEmblem module="financeiro" label="Financeiro" active muted />,
    );
    expect(getByRole('img', { name: 'Financeiro' })).toBeInTheDocument();
    const emblem = container.querySelector('.portal-emblem');
    expect(emblem).toHaveAttribute('data-active', 'true');
    expect(emblem).toHaveAttribute('data-muted', 'true');
  });

  it('usa somente tokens de emblema, sem hexadecimais locais nem animação contínua', () => {
    expect(symbolsSource).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(emblemStyles).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(emblemStyles).toContain('var(--emblem-plate-depth)');
    expect(emblemStyles).not.toMatch(/animation:/);
    expect(emblemStyles).not.toContain('transition: all');
    expect(emblemStyles).not.toMatch(/filter:/);
    expect(emblemStyles).toContain('@media (hover: hover) and (pointer: fine)');
    expect(emblemStyles).toContain('@media (prefers-reduced-motion: reduce)');
    expect(emblemStyles).toContain('@media (forced-colors: active)');
  });
});
