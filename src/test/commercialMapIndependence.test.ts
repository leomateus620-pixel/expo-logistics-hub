import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

describe('arquitetura independente do Mapa Comercial', () => {
  it('preserva os três guards e remove o Layout da árvore exclusiva da rota', () => {
    const app = read('src/App.tsx');
    const route = app.match(/function CommercialMapRoute\(\)[\s\S]*?function LogisticaModuleRoutes/)?.[0];

    expect(route).toBeDefined();
    expect(route).toContain('<AuthGuard>');
    expect(route).toContain('<OrgGuard>');
    expect(route).toContain('<CapabilityGuard capability="map.view">');
    expect(route).not.toContain('<Layout>');
    expect(route).not.toContain('<Sidebar');

    const logisticsRoute = app.match(/function LogisticaModuleRoutes\(\)[\s\S]*?function CommissionModuleRoutes/)?.[0];
    expect(logisticsRoute).toContain('<Layout>');
  });

  it('compõe o workspace no shell próprio sem hooks, banners ou navegação da Logística', () => {
    const routePage = read('src/pages/CommercialMapPage.tsx');
    const shell = read('src/features/commercial-map/components/shell/CommercialMapShell.tsx');
    const logisticsLayout = read('src/components/Layout.tsx');

    expect(routePage).toContain('<CommercialMapShell>');
    expect(routePage).toContain('<CommercialMapWorkspace />');
    expect(shell).toContain('Mapa Comercial');
    expect(shell).toContain('to="/portal"');
    expect(shell).toContain("navigate('/portal', { replace: true })");
    expect(shell).not.toContain('Sidebar');
    expect(shell).not.toContain('OfflineBanner');
    expect(shell).not.toContain('DriverGpsBanner');
    expect(shell).not.toContain('useDriverAutoArm');
    expect(shell).not.toContain('Comissão de Logística');
    expect(logisticsLayout).not.toContain("['/mapa-comercial', 'Mapa Comercial']");
  });

  it('usa toda a área do shell e recalcula o enquadramento a partir do canvas real', () => {
    const styles = read('src/features/commercial-map/commercial-map.css');
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');

    expect(styles).toMatch(/\.commercial-map-shell\s*\{[\s\S]*?height:\s*100%;/);
    expect(styles).not.toContain('height: calc(100dvh - 40px)');
    expect(styles).not.toContain('height: calc(100dvh - 100px)');
    expect(canvas).toContain('previousViewportSize');
    expect(canvas).toContain('size.width');
    expect(canvas).toContain('size.height');
    expect(canvas).toContain('queuePreset(preset)');
  });

  it('leva a Gestão ao cabeçalho preservando gates de permissão e modos ativos', () => {
    const page = read('src/features/commercial-map/CommercialMapPage.tsx');
    const toolbar = read('src/features/commercial-map/components/controls/MapToolbar.tsx');
    const header = read('src/features/commercial-map/components/shell/CommercialMapHeaderTools.tsx');
    const shell = read('src/features/commercial-map/components/shell/CommercialMapShell.tsx');
    const dock = read('src/features/commercial-map/components/dock/CommercialMapDock.tsx');

    expect(page).toContain('<CommercialMapHeaderTools managementActions={managementActions} />');
    expect(page).toContain('const managementActions = hasManagementActions ? (');
    expect(page).toMatch(/const hasManagementActions = permissions\.isMapAdmin\s*\|\| permissions\.canManageLots\s*\|\| permissions\.canEditGeometry/);
    expect(page).toMatch(/permissions\.canEditGeometry && \([\s\S]*?Editar geometria/);
    expect(page).toMatch(/permissions\.isMapAdmin && \([\s\S]*?Calibrar/);
    expect(page).toMatch(/data\.source === 'database' && permissions\.canManageLots && \([\s\S]*?Cadastrar lote/);
    expect(page).toMatch(/data\.source === 'official-reference' && permissions\.isMapAdmin && \([\s\S]*?Implantar base 2026/);
    expect(header).toContain('{managementActions && <Popover');
    expect(header).toContain('aria-pressed={managing}');
    expect(header).toContain("aria-pressed={mode === 'list'}");
    expect(header.indexOf('aria-label="Gestão"')).toBeLessThan(header.indexOf('aria-label="Lista e tabela"'));
    expect(shell.indexOf('ref={setToolsHost}')).toBeLessThan(shell.indexOf('FENASOJA 2028'));
    expect(page).toContain('Editar geometria');
    expect(page).toContain('Calibrar');
    expect(page).toContain('Implantar base 2026');
    expect(toolbar).toContain('Filtros');
    expect(toolbar).not.toContain('Editar geometria');
    expect(dock).toContain('<ContextualMapLegend');
    expect(dock).not.toContain('managementActions');
  });

  it('monta uma única camada de árvores instanciada nos dois contextos compartilhados', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const treeLayer = read('src/features/commercial-map/components/canvas/CommercialTreeLayer.tsx');
    const commissionPage = read('src/pages/commissions/CommissionCommercialMapPage.tsx');

    expect(canvas.match(/<CommercialTreeLayer/g)).toHaveLength(1);
    expect(treeLayer.match(/<instancedMesh/g)).toHaveLength(5);
    expect(treeLayer.match(/raycast=\{NO_RAYCAST\}/g)).toHaveLength(5);
    expect(treeLayer).toContain('name="contato-solo-arvores-comerciais"');
    expect(treeLayer).toContain('computeBoundingSphere()');
    expect(treeLayer).toContain('gl.shadowMap.needsUpdate = true');
    expect(commissionPage).toContain('<CommercialMapWorkspace scope={scope} />');
    expect(commissionPage).not.toContain('CommercialTreeLayer');
  });
});
