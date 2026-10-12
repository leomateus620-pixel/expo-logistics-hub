import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, cleanup, render, screen } from '@testing-library/react';
import { parse } from 'postcss';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { CommercialMapControlRail } from '@/features/commercial-map/components/controls/CommercialMapControlRail';
import { CommercialMapTopBar } from '@/features/commercial-map/components/controls/CommercialMapTopBar';
import {
  FenasojaFoldedMapIcon,
  FenasojaHydrologyIcon,
  FenasojaLayeredViewIcon,
  FenasojaMoonIcon,
  FenasojaRainIcon,
} from '@/features/commercial-map/components/controls/FenasojaMapIcons';
import { MapToolbar } from '@/features/commercial-map/components/controls/MapToolbar';
import { useCommercialMapStore } from '@/features/commercial-map/state/useCommercialMapStore';
import type { MapPermissions } from '@/features/commercial-map/types';
import { COMMERCIAL_MAP_QUALITY_EVENT } from '@/features/commercial-map/utils/adaptiveQualityRuntime';

const permissions: MapPermissions = {
  canView: true,
  canEdit: false,
  canEditGeometry: false,
  canManageLots: false,
  canEditPricing: false,
  canManageSales: false,
  canManageContracts: false,
  canManageLayers: false,
  canViewMapAnalytics: false,
  isMapAdmin: false,
};

const ICONS = {
  map: FenasojaFoldedMapIcon,
  layers: FenasojaLayeredViewIcon,
  hydrology: FenasojaHydrologyIcon,
  moon: FenasojaMoonIcon,
  rain: FenasojaRainIcon,
};

afterEach(() => {
  cleanup();
  useCommercialMapStore.setState(useCommercialMapStore.getInitialState(), true);
  vi.restoreAllMocks();
});

describe('ícones próprios dos controles do Mapa Comercial', () => {
  it.each(Object.entries(ICONS))('%s: vetor 24×24 leve, sem filtros, imagens ou animação SMIL', (_name, Icon) => {
    const { container } = render(<Icon aria-hidden="true" />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 24 24');
    expect(svg).toHaveAttribute('aria-hidden', 'true');
    expect(svg).toHaveAttribute('focusable', 'false');
    expect(svg.querySelectorAll('filter, image, foreignObject, animate, animateTransform')).toHaveLength(0);
    expect(svg.querySelectorAll('*').length).toBeLessThan(40);
  });

  it('isola os gradientes por instância, inclusive com a cópia desktop oculta montada', () => {
    const { container } = render(<><FenasojaMoonIcon /><FenasojaMoonIcon /><FenasojaFoldedMapIcon /><FenasojaFoldedMapIcon /></>);
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll('svg')) {
      const local = new Set([...svg.querySelectorAll('[id]')].map((node) => node.id));
      for (const node of svg.querySelectorAll('[fill^="url(#"]')) {
        expect(local.has(node.getAttribute('fill')!.slice(5, -1))).toBe(true);
      }
    }
  });

  it('pinta os três planos do mapa com azul, amarelo e verde institucionais', () => {
    const { container } = render(<FenasojaFoldedMapIcon />);
    const planes = [...container.querySelectorAll('.fenasoja-map-icon__fill')];
    expect(planes).toHaveLength(3);
    const firstStops = planes.map((plane) => {
      const gradient = container.querySelector(plane.getAttribute('fill')!.slice(4, -1));
      return gradient?.querySelector('stop')?.getAttribute('stop-color');
    });
    expect(firstStops).toEqual(['#5fb4ec', '#f9de78', '#6fcf8b']);
  });

  it('usa os novos ícones na barra compacta e na barra desktop, preservando rótulos e estados', () => {
    const view = render(<TooltipProvider>
      <MapToolbar permissions={permissions} hasSelection={false} areaScope="park" />
      <CommercialMapTopBar permissions={permissions} hasSelection={false} areaScope="park" isCommissionScope={false} />
    </TooltipProvider>);
    for (const rail of view.container.querySelectorAll('.commercial-map-control-rail')) {
      const icon = (key: string) => rail.querySelector(`[data-commercial-map-control="${key}"] > svg`);
      expect(icon('overview')).toHaveClass('fenasoja-map-icon--map');
      expect(icon('top')).toHaveClass('fenasoja-map-icon--layers');
      expect(icon('hydrological-network')).toHaveClass('fenasoja-map-icon--hydrology');
      expect(icon('night-mode')).toHaveClass('fenasoja-map-icon--moon');
      expect(icon('rain-mode')).toHaveClass('fenasoja-map-icon--rain');
    }
    expect(screen.getAllByRole('button', { name: 'Ativar chuva' })).toHaveLength(2);
    act(() => useCommercialMapStore.getState().toggleRainMode());
    for (const button of screen.getAllByRole('button', { name: 'Desativar chuva' })) {
      expect(button).toHaveAttribute('aria-pressed', 'true');
      expect(button.querySelectorAll('.fenasoja-map-icon__drop')).toHaveLength(3);
    }
  });

  it('anima a chuva só ativa, com transform/opacity, e desliga o ciclo por preferência ou capacidade', () => {
    const css = parse(readFileSync(resolve('src/features/commercial-map/components/controls/fenasoja-map-icons.css'), 'utf8'));
    const animated: string[] = [];
    css.walkDecls('animation', (declaration) => {
      const rule = declaration.parent as { selector?: string; parent?: { type: string; params?: string } };
      if (declaration.value.includes('fenasoja-map-icon-rain')) animated.push(rule.selector ?? '');
    });
    expect(animated).toEqual([':is(.is-active, [aria-pressed="true"]) > .fenasoja-map-icon--rain .fenasoja-map-icon__drop']);
    css.walkAtRules('keyframes', (frames) => {
      frames.walkDecls((entry) => expect(['transform', 'opacity']).toContain(entry.prop));
    });
    const stopped: string[] = [];
    css.walkDecls('animation', (declaration) => {
      if (declaration.value !== 'none') return;
      const rule = declaration.parent as { selector: string; parent?: { type: string; params?: string } };
      stopped.push(rule.parent?.type === 'atrule' ? `@${rule.parent.params} ${rule.selector}` : rule.selector);
    });
    expect(stopped).toEqual([
      '[data-glass-capability="reduced"] .fenasoja-map-icon__drop',
      '@(prefers-reduced-motion: reduce) .fenasoja-map-icon__drop',
    ]);
    css.walkDecls((declaration) => expect(declaration.prop).not.toBe('filter'));
  });
});

describe('degradação progressiva da barra de vidro', () => {
  it('marca hardware modesto e orçamento LOW do mapa sem renderizar os controles novamente', () => {
    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(8);
    let renders = 0;
    function Control() {
      renders += 1;
      return <button type="button">Câmera</button>;
    }
    render(<CommercialMapControlRail className="test-rail" label="Controles" nightModeActive={false}><Control /></CommercialMapControlRail>);
    const rail = screen.getByRole('group', { name: 'Controles' });
    expect(rail).toHaveAttribute('data-glass-capability', 'full');

    const canvas = document.createElement('canvas');
    document.body.append(canvas);
    const publish = (effectTier: string) => {
      canvas.dataset.commercialMapQuality = JSON.stringify({ effectTier, sceneTier: effectTier });
      act(() => { canvas.dispatchEvent(new Event(COMMERCIAL_MAP_QUALITY_EVENT, { bubbles: true })); });
    };
    publish('LOW');
    expect(rail).toHaveAttribute('data-glass-capability', 'reduced');
    publish('HIGH');
    expect(rail).toHaveAttribute('data-glass-capability', 'full');
    canvas.remove();
    expect(renders).toBe(1);
    cleanup();

    vi.spyOn(navigator, 'hardwareConcurrency', 'get').mockReturnValue(2);
    render(<CommercialMapControlRail className="test-rail" label="Controles" nightModeActive={false}><Control /></CommercialMapControlRail>);
    expect(screen.getByRole('group', { name: 'Controles' })).toHaveAttribute('data-glass-capability', 'reduced');
  });

  it('remove o desfoque da cápsula em capacidade reduzida mantendo uma única superfície com blur', () => {
    const css = parse(readFileSync(resolve('src/features/commercial-map/components/controls/commercial-map-topbar.css'), 'utf8'));
    const blurred: string[] = [];
    css.walkDecls('backdrop-filter', (declaration) => {
      blurred.push(`${(declaration.parent as { selector: string }).selector}=${declaration.value}`);
    });
    expect(blurred).toEqual([
      '.commercial-map-control-rail[data-glass-capability="reduced"]=none',
      '.commercial-map-control-rail=blur(var(--glass-blur)) saturate(1.15)',
      '.commercial-map-control-rail,\n  .commercial-map-toolbar-menu.commercial-map-glass=none',
    ]);
  });
});
