import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'postcss';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(resolve(path), 'utf8');

function declarations(styles: string, selector: string, property: string) {
  const matches: { value: string; conditions: string[] }[] = [];
  parse(styles).walkRules((rule) => {
    if (!rule.selectors.includes(selector)) return;
    rule.walkDecls(property, (declaration) => {
      const conditions: string[] = [];
      let ancestor = rule.parent;
      while (ancestor && ancestor.type !== 'root') {
        if (ancestor.type === 'atrule') conditions.unshift(`@${ancestor.name} ${ancestor.params}`);
        ancestor = ancestor.parent;
      }
      matches.push({ value: declaration.value, conditions });
    });
  });
  return matches;
}

const compactControlConditions = [
  ['@container commercial-map (max-width: 720px)'],
  ['@media (max-width: 950px) and (max-height: 520px)'],
];

describe('arquitetura mobile-first do Mapa Comercial', () => {
  it('oculta a barra superior somente quando a barra compacta está visível', () => {
    const topbar = read('src/features/commercial-map/components/controls/commercial-map-topbar.css');
    const mobile = read('src/features/commercial-map/commercial-map-mobile.css');

    expect(declarations(topbar, '.commercial-map-topbar', 'display')).toEqual([
      { value: 'flex', conditions: [] },
      ...compactControlConditions.map((conditions) => ({ value: 'none', conditions })),
    ]);
    expect(declarations(mobile, '.commercial-map-toolbar-mobile', 'display')).toEqual([
      { value: 'none', conditions: [] },
      ...compactControlConditions.map((conditions) => ({ value: 'flex', conditions })),
    ]);
  });

  it('libera o espaço do dock para os controles compactos, inclusive em paisagem', () => {
    const dock = read('src/features/commercial-map/components/dock/commercial-map-dock.css');
    const layout = read('src/features/commercial-map/commercial-map.css');

    expect(declarations(dock, '.commercial-map-dock', 'display')).toEqual([
      { value: 'flex', conditions: [] },
      ...compactControlConditions.map((conditions) => ({ value: 'none', conditions })),
    ]);
    expect(declarations(layout, '.commercial-map-body', 'display')).toContainEqual({ value: 'flex', conditions: [] });
    expect(declarations(layout, '.commercial-map-viewport', 'flex')).toContainEqual({ value: '1', conditions: [] });
  });

  it('mostra Filtros flutuante exatamente quando o dock é substituído pelos controles compactos', () => {
    const layout = read('src/features/commercial-map/commercial-map.css');
    const mobile = read('src/features/commercial-map/commercial-map-mobile.css');

    expect(declarations(layout, '.commercial-map-actions', 'display')).toEqual([
      { value: 'none', conditions: [] },
    ]);
    expect(declarations(mobile, '.commercial-map-shell .commercial-map-actions', 'display')).toEqual(
      compactControlConditions.map((conditions) => ({ value: 'flex', conditions })),
    );
  });

  it('mantém o total do resumo dentro do rail sem herdar a rolagem horizontal flutuante', () => {
    const dock = read('src/features/commercial-map/components/dock/commercial-map-dock.css');
    const summary = '.commercial-map-dock .commercial-map-summary.is-dock';
    const compact = '.commercial-map-dock.is-compact .commercial-map-summary.is-compact';
    const scroll = '.commercial-map-dock.is-compact .commercial-map-dock__scroll';
    const primary = '.commercial-map-dock .commercial-map-summary.is-compact .commercial-map-summary-primary';

    expect(declarations(dock, summary, 'overflow')).toEqual([{ value: 'visible', conditions: [] }]);
    expect(declarations(dock, summary, 'height')).toEqual([{ value: 'auto', conditions: [] }]);
    expect(declarations(dock, scroll, 'scrollbar-gutter')).toEqual([{ value: 'auto', conditions: [] }]);
    expect(declarations(dock, compact, 'width')).toEqual([{ value: '100%', conditions: [] }]);
    expect(declarations(dock, compact, 'max-width')).toEqual([{ value: '46px', conditions: [] }]);
    expect(declarations(dock, primary, 'padding-inline')).toEqual([{ value: '0', conditions: [] }]);
  });

  it('integra a busca no cabeçalho e mantém o mesmo estado comercial', () => {
    const shell = read('src/features/commercial-map/components/shell/CommercialMapShell.tsx');
    const toolbar = read('src/features/commercial-map/components/controls/MapToolbar.tsx');

    expect(shell).toContain("useCommercialMapStore((state) => state.search)");
    expect(shell).toContain('data-commercial-map-search');
    expect(shell).toContain('data-commercial-map-shell-search-trigger');
    expect(shell).toContain('searchTriggerRef.current?.focus()');
    expect(shell).toContain('ID, nome, quadra, lote, rua ou empresa');
    expect(toolbar).toContain('commercial-map-toolbar--desktop');
    expect(toolbar).toContain('commercial-map-toolbar-mobile');
    expect(toolbar).toContain('data-commercial-map-commission-search-trigger');
    expect(toolbar).toContain('isCommissionScope');
  });

  it('substitui os cards permanentes por seletor móvel sem escalar o canvas', () => {
    const segments = read('src/features/commercial-map/components/segments/SegmentLegend.tsx');
    const styles = read('src/features/commercial-map/commercial-map-mobile.css');

    expect(segments).toContain('commercial-map-segment-mobile-trigger');
    expect(segments).toContain('shouldScaleBackground={false}');
    expect(segments).toContain('commercialMapSegmentInventory(entities, lots)');
    expect(styles).toMatch(/@container commercial-map \(max-width: 720px\)[\s\S]*?\.commercial-map-segment-legend \{ display: none; \}/);
  });

  it('usa split real em meia tela e só expande por ação explícita', () => {
    const page = read('src/features/commercial-map/CommercialMapPage.tsx');
    const panel = read('src/features/commercial-map/components/panels/MapPanels.tsx');
    const styles = read('src/features/commercial-map/commercial-map-mobile.css');

    expect(page).toContain('data-canvas-lifecycle="persistent"');
    expect(panel).toContain("useState<CommercialMapDetailSheetState>('half')");
    expect(panel).toContain('data-sheet-state={sheetState}');
    expect(styles).toContain('data-sheet-state="half"');
    expect(styles).toContain('bottom: 50%');
    expect(styles).toContain('data-sheet-state="collapsed"');
    expect(styles).toContain('data-sheet-state="expanded"');
  });

  it('mantém antialias, gestos GIS completos e DPR adaptativo no canvas compartilhado', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const styles = read('src/features/commercial-map/commercial-map-mobile.css');

    expect(canvas).toContain('resolveCommercialMapPixelRatio');
    expect(canvas).toContain('dpr={initialPixelRatio}');
    expect(canvas).toContain('Adaptive DPR stays imperative inside the R3F root');
    expect(canvas).not.toContain('AdaptiveDpr');
    expect(canvas).not.toMatch(/<OrbitControls[\s\S]*?\bregress\b/);
    expect(canvas).toContain('touches={{ ONE: THREE.TOUCH.PAN, TWO: THREE.TOUCH.DOLLY_ROTATE }}');
    expect(canvas).toMatch(/<OrbitControls[\s\S]*?enablePan[\s\S]*?enableRotate[\s\S]*?enableZoom/);
    expect(canvas).not.toContain('enablePan={!miranteSelected}');
    expect(canvas).toContain('screenSpacePanning={Boolean(interiorEntity)}');
    expect(canvas).toContain('cameraNavigating,');
    expect(canvas).toContain('COMMERCIAL_MAP_RESIZE_REFIT_DEBOUNCE_MS');
    expect(canvas).toContain('COMMERCIAL_MAP_MANUAL_NAVIGATION_REFIT_SUPPRESSION_MS');
    expect(canvas).toContain('if (navigation.current.active) return;');
    expect(canvas).toContain('if (pendingResizeRefit.current && !wasNavigating) scheduleResizeRefit();');
    expect(canvas).toContain('pendingResizeRefit.current = false;');
    expect(canvas).toContain('if (preserveManualView.current) return;');
    expect(canvas).toMatch(/selectionChanged && !selectedEntity[\s\S]*?preserveManualView.current = true;[\s\S]*?cancelScheduledResizeRefit\(\);/);
    expect(canvas).toContain('antialias: true');
    expect(canvas).toContain('gl={initialRenderConfig.current.renderer}');
    expect(styles).toContain('touch-action: none !important;');
    expect(styles).toMatch(/@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.commercial-map-stage \{ transition-duration: 340ms !important; \}/);
  });

  it('mantém a referência raster textual fora do carregamento inicial', () => {
    const canvas = read('src/features/commercial-map/components/canvas/CommercialMapCanvas.tsx');
    const store = read('src/features/commercial-map/state/useCommercialMapStore.ts');
    const wrapper = canvas.slice(
      canvas.indexOf('function ReferenceUnderlay({'),
      canvas.indexOf('function createEntityShape'),
    );

    expect(store).toContain('referenceVisible: false');
    expect(canvas).toMatch(/function ReferenceUnderlaySurface[\s\S]*?useTexture\(imageUrl\)/);
    expect(wrapper).toContain('if (!referenceVisible) return null;');
    expect(wrapper).not.toContain('useTexture(');
    expect(wrapper).toMatch(/<Suspense fallback=\{null\}>[\s\S]*?<ReferenceUnderlaySurface[\s\S]*?<\/Suspense>/);
  });

  it('remove apenas o chrome persistente do fluxo móvel principal', () => {
    const styles = read('src/features/commercial-map/commercial-map-mobile.css');

    expect(styles).toContain('.commercial-map-source-notice.is-database { display: none; }');
    expect(styles).toContain('.commercial-map-command-header');
    expect(styles).toContain('.commercial-map-command-header > .commercial-map-view-selector');
    expect(styles).toContain('.commercial-map-management');
  });

  it('preserva busca e ações em smartphones estreitos sem sobrepor a toolbar', () => {
    const toolbar = read('src/features/commercial-map/components/controls/MapToolbar.tsx');
    const styles = read('src/features/commercial-map/commercial-map-mobile.css');

    expect(toolbar).toContain('commercial-map-toolbar-focus-selection');
    expect(toolbar).toContain('commercial-map-toolbar-menu-focus-selection');
    // The rail carries six actions (map, top, water, night, focus, more): on
    // the narrowest phones the focus action moves into the overflow menu.
    expect(toolbar).toContain('commercial-map-night-toggle');
    expect(styles).toMatch(/@media \(max-width: 364px\)[\s\S]*?\.commercial-map-toolbar-mobile > \.commercial-map-toolbar-focus-selection \{ display: none; \}/);
    expect(styles).toContain('.commercial-map-toolbar-menu .commercial-map-toolbar-menu-focus-selection { display: flex; }');
  });
});
