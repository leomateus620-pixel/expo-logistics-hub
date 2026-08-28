import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  financePortalModule,
  getPortalCommissionGroups,
  getPortalCommissionModules,
  agendaFenasojaDestination,
  agendaVenueDestination,
  portalPrimaryEntries,
} from '@/modules/portal/portalRegistry';

describe('arquitetura de acesso do portal', () => {
  it('centraliza a hierarquia e preserva os destinos existentes', () => {
    expect(portalPrimaryEntries.map((entry) => entry.id)).toEqual([
      'agenda-fenasoja',
      'agenda-restaurante-arena',
      'mapa-comercial',
      'comissoes',
      'financeiro',
    ]);
    expect([agendaFenasojaDestination.route, agendaVenueDestination.route]).toEqual([
      '/cronograma-eventos',
      '/eventos-restaurante-arena',
    ]);
    expect(financePortalModule.basePath).toBe('/comissoes/financeiro-gerencial');
  });

  it('mantém Financeiro fora da lista visual e cobre as frentes oficiais 2028', () => {
    const groups = getPortalCommissionGroups();
    const [comissoes, assessorias] = groups;

    expect(groups.map((group) => group.label)).toEqual(['Comissões', 'Assessorias']);
    expect(comissoes.items).toHaveLength(26);
    expect(assessorias.items).toHaveLength(6);

    const slugs = getPortalCommissionModules().map((module) => module.slug);
    expect(slugs).not.toContain('limpeza');
    expect(slugs).not.toContain('financeiro-gerencial');
    expect(slugs).toEqual(expect.arrayContaining([
      'logistica',
      'exporural',
      'industria-comercio-servicos',
      'gastronomia',
      'infraestrutura',
      'servicos',
      'arte-cultura',
      'novas-geracoes',
      'seguranca',
      'pecuaria',
      'bilheteria',
      'assessoria-juridica',
      'assessoria-de-marketing',
    ]));
    // Nenhuma Assessoria Financeira é criada.
    expect(slugs.some((slug) => slug.includes('financ'))).toBe(false);
    // Sem duplicidade por nome abreviado.
    expect(new Set(slugs).size).toBe(slugs.length);
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
