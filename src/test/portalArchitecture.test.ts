import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  financePortalModule,
  getPortalCommissionModules,
  portalAgendaDestinations,
  portalPrimaryEntries,
} from '@/modules/portal/portalRegistry';

describe('arquitetura de acesso do portal', () => {
  it('centraliza a hierarquia e preserva os destinos existentes', () => {
    expect(portalPrimaryEntries.map((entry) => entry.id)).toEqual([
      'agenda',
      'mapa-comercial',
      'comissoes',
      'financeiro',
    ]);
    expect(portalAgendaDestinations.map((destination) => destination.route)).toEqual([
      '/cronograma-eventos',
      '/eventos-restaurante-arena',
    ]);
    expect(financePortalModule.basePath).toBe('/comissoes/financeiro-gerencial');
  });

  it('mantém Financeiro no registry e fora da lista visual de Comissões', () => {
    const modules = getPortalCommissionModules();
    expect(modules.map((module) => module.slug)).toEqual([
      'logistica',
      'gastronomia',
      'infraestrutura',
      'servicos',
      'arte-cultura',
      'novas-geracoes',
      'seguranca',
      'limpeza',
      'exporural',
      'industria-comercio-servicos',
    ]);
    expect(modules).not.toContain(financePortalModule);
  });

  it('preserva o destino e o guard do Mapa Comercial fora da apresentação de Logística', () => {
    const sidebar = readFileSync(resolve('src/components/Sidebar.tsx'), 'utf8');
    const logisticsLayout = readFileSync(resolve('src/components/Layout.tsx'), 'utf8');
    const app = readFileSync(resolve('src/App.tsx'), 'utf8');
    const login = readFileSync(resolve('src/pages/LoginPage.tsx'), 'utf8');

    expect(sidebar).not.toContain("to: '/mapa-comercial'");
    expect(logisticsLayout).not.toContain("['/mapa-comercial', 'Mapa Comercial']");
    expect(sidebar).toContain("to: '/transports'");
    expect(sidebar).toContain("to: '/expenses'");
    expect(app).toContain('path="/mapa-comercial"');
    expect(app).toContain('capability="map.view"');
    expect(login).toContain("return '/mapa-comercial'");
  });
});
