import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityDetailsPanel } from '@/features/commercial-map/components/panels/MapPanels';
import type { CommercialLot, MapEntity, MapPermissions } from '@/features/commercial-map/types';
import type { HistoryEntry } from '@/features/commercial-map/history/types';
import type { HistoryImage } from '@/features/commercial-map/history/mediaTypes';

const mocks = vi.hoisted(() => ({
  activity: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  contracts: vi.fn(() => ({ data: [], isLoading: false, isError: false })),
  mutate: vi.fn(), mutateAsync: vi.fn(),
  entries: [] as HistoryEntry[], images: [] as HistoryImage[], getHistory: vi.fn(),
  store: { setSelectedEntityId: vi.fn(), focusSelection: vi.fn(), enterInterior: vi.fn(), setWorkspaceMode: vi.fn() },
}));

vi.mock('@/features/commercial-map/hooks/useCommercialMap', () => ({
  useLotActivity: mocks.activity, useLotContractVersions: mocks.contracts,
  useMapMutations: () => {
    const mutation = { isPending: false, mutate: mocks.mutate, mutateAsync: mocks.mutateAsync };
    return { lotUpdate: mutation, reservation: mutation, negotiation: mutation, sale: mutation, contract: mutation, split: mutation, merge: mutation, verification: mutation, layerLock: mutation };
  },
}));
vi.mock('@/features/commercial-map/state/useCommercialMapStore', () => ({
  useCommercialMapStore: (selector: (state: typeof mocks.store) => unknown) => selector(mocks.store),
}));
vi.mock('@/hooks/useCurrentOrg', () => ({ useCurrentOrg: () => ({ orgId: 'test-org' }) }));
vi.mock('@/features/commercial-map/history/catalog', () => ({
  getPublishedHistory: (id: string) => { mocks.getHistory(id); return mocks.entries.find((entry) => entry.id === id) ?? null; },
  HISTORY_SOURCES: [{ id: 'test-source', title: 'Documento verificado de teste', publisher: 'Acervo de teste', url: 'https://example.invalid/documento', reviewedAt: '2026-09-06' }],
}));
vi.mock('@/features/commercial-map/history/media', () => ({ HISTORY_IMAGES: mocks.images }));

const permissions: MapPermissions = { canView: true, canEdit: true, canEditGeometry: true, canManageLots: true, canManageSales: true, canManageContracts: true, canManageLayers: true, isMapAdmin: true };

function fixture(id = 'uuid-pavilhao-7', identifier = 'B10') {
  const entity: MapEntity = {
    id, projectId: 'project', layerId: 'lots', parentEntityId: null, publicIdentifier: identifier,
    name: 'Estrutura selecionada', description: null, classification: 'SELLABLE_LOT', verificationStatus: 'NEEDS_REVIEW',
    isSellable: true, isArchived: false, metadata: {},
    geometry: { id: `${id}-geometry`, type: 'Polygon', coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]], elevation: 0, extrusionHeight: 0.1, rotation: 0, geometryVersion: 1, calibrationVersion: 1 },
  };
  const lot: CommercialLot = {
    id: `${id}-lot`, entityId: id, publicIdentifier: identifier, displayName: entity.name, description: 'Informação comercial preservada', block: 'A', lotNumber: '1', levelLabel: null,
    status: 'AVAILABLE', officialAreaSqm: 100, calculatedAreaSqm: 100, areaValidationStatus: 'VALIDATED', frontageMeters: 10, depthMeters: 10,
    pricingMode: 'FIXED_TOTAL', basePrice: 1000, pricePerSqm: null, askingPrice: 1200, minimumPrice: 900, infrastructure: [], hasElectricity: true, hasWater: false,
    hasInternet: false, isCorner: false, isCovered: false, accessibilityNotes: null, commercialNotes: null, internalNotes: null,
    currentBuyer: null, reservationExpiresAt: null, saleDate: null, salespersonName: null, activeContractNumber: null, archivedAt: null,
    createdBy: null, updatedBy: null, createdAt: null, updatedAt: null,
  };
  return { entity, lot };
}

function image(id: string, overrides: Partial<HistoryImage> = {}): HistoryImage {
  return {
    id, historyIds: ['P07'], src: `/history/test/${id}.webp`, width: 1200, height: 800, variants: [],
    thumbnailSrc: `/history/test/${id}-thumb.webp`, fullSrc: `/history/test/${id}-full.webp`,
    alt: `Registro ${id}`, caption: `Legenda documental ${id}`, role: 'recent', captureDate: null,
    publicationDate: { value: '2026-05-03', precision: 'day' }, credit: 'Fotógrafo de teste', collection: 'Acervo de teste',
    sourcePageUrl: 'https://example.invalid/fonte', originalImageUrl: 'https://example.invalid/original.jpg',
    bindingStatus: 'verified', verificationStatus: 'verified',
    permission: { status: 'authorized', label: 'Autorização apenas da fixture de teste', sourceUrl: 'https://example.invalid/autorizacao', authorizationOrigin: 'Fixture automatizada' },
    ...overrides,
  };
}

function configureImages(images: HistoryImage[]) {
  mocks.images.splice(0, mocks.images.length, ...images);
  mocks.entries[0].imageIds = images.map((item) => item.id);
}

function panel(selection = fixture(), customPermissions = permissions, mapGesture = vi.fn()) {
  return <div className="commercial-map-viewport" data-testid="map-viewport"
    onPointerDown={mapGesture} onPointerMove={mapGesture} onPointerUp={mapGesture}
    onWheel={mapGesture} onTouchStart={mapGesture} onTouchMove={mapGesture} onTouchEnd={mapGesture} onKeyDown={mapGesture}>
    <EntityDetailsPanel {...selection} entities={[selection.entity]} lots={[selection.lot]} permissions={customPermissions} />
  </div>;
}

async function openHistory() {
  fireEvent.click(screen.getByRole('button', { name: 'Conhecer a história' }));
  return screen.findByRole('heading', { name: 'Pavilhão 7 — história de teste' });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.images.splice(0);
  mocks.entries.splice(0, mocks.entries.length, {
    id: 'P07', entityIds: ['reference:2026:b10'], publicIdentifiers: ['B10'], title: 'Pavilhão 7 — história de teste', aliases: [], category: 'agricultura',
    summary: 'Resumo documental verificado e independente da disponibilidade de fotografia.',
    milestones: [{ date: { value: '1987', precision: 'year' }, eventType: 'construcao', text: 'Construção documentada.', sourceIds: ['test-source'] }],
    sourceIds: ['test-source'], imageIds: [], editorialStatus: 'verified', publicationStatus: 'published', bindingStatus: 'verified', reviewedAt: '2026-09-06',
  });
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

afterEach(() => {
  cleanup();
  expect(mocks.mutate).not.toHaveBeenCalled();
  expect(mocks.mutateAsync).not.toHaveBeenCalled();
  expect(mocks.store.setSelectedEntityId).not.toHaveBeenCalled();
  expect(mocks.store.focusSelection).not.toHaveBeenCalled();
  expect(mocks.store.enterInterior).not.toHaveBeenCalled();
  expect(mocks.store.setWorkspaceMode).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('história integrada ao painel comercial persistente', () => {
  it('carrega o conteúdo apenas ao abrir e restaura informações, ações, seleção e foco ao fechar', async () => {
    configureImages([image('primeira')]);
    render(panel());
    const aside = screen.getByRole('complementary');
    const trigger = screen.getByRole('button', { name: 'Conhecer a história' });
    expect(aside.querySelector('img')).toBeNull();
    expect(mocks.getHistory).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Editar lote' })).toBeVisible();
    await openHistory();
    expect(screen.getByRole('complementary')).toBe(aside);
    expect(screen.getByAltText('Registro primeira')).toHaveAttribute('src', '/history/test/primeira.webp');
    expect(screen.queryByRole('button', { name: 'Editar lote' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Voltar às informações' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.getByRole('complementary')).toBe(aside);
    expect(screen.getByRole('button', { name: 'Editar lote' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Reservar' })).toBeVisible();
    expect(screen.getByText(/R\$\s*1\.200,00/)).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Dados comerciais' })).toBeVisible();
    expect(aside.querySelector('img')).toBeNull();
    expect(mocks.activity).toHaveBeenLastCalledWith('uuid-pavilhao-7-lot');
  });

  it('mantém conteúdo comprovado sem foto e não inventa imagem ou data de captura', async () => {
    render(panel());
    await openHistory();
    expect(screen.getByText(mocks.entries[0].summary)).toBeVisible();
    expect(screen.getByText('Construção documentada.')).toBeVisible();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Galeria de fotografias')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Documento verificado de teste', hidden: true })).toHaveAttribute('href', 'https://example.invalid/documento');
  });

  it('mostra uma foto sem controles de galeria e separa publicação de data fotográfica não confirmada', async () => {
    configureImages([image('unica')]);
    render(panel());
    await openHistory();
    expect(screen.getByText(/Data da fotografia não confirmada/)).toHaveTextContent('Publicada em 3 de maio de 2026');
    expect(screen.getByText('Registro recente')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Próxima fotografia' })).not.toBeInTheDocument();
    expect(document.querySelector('img[src$="-full.webp"]')).toBeNull();
  });

  it('exclui imagens sem correspondência, verificação ou autorização mesmo quando citadas no catálogo', async () => {
    configureImages([
      image('aprovada'), image('outro-lugar', { historyIds: ['outro'] }), image('pendente', { verificationStatus: 'pending' }),
      image('sem-permissao', { permission: { status: 'pending', label: 'Pendente', sourceUrl: null, authorizationOrigin: null } }),
    ]);
    render(panel());
    await openHistory();
    expect(screen.getByAltText('Registro aprovada')).toBeVisible();
    expect(screen.queryByLabelText('Galeria de fotografias')).not.toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('img'), (node) => node.getAttribute('src'))).toEqual(['/history/test/aprovada.webp']);
  });

  it('navega por botões, teclado e swipe sem propagar gestos ao mapa, carregando só a foto ativa e miniaturas próximas', async () => {
    configureImages([image('um'), image('dois'), image('tres')]);
    const mapGesture = vi.fn();
    render(panel(fixture(), permissions, mapGesture));
    await openHistory();
    const figure = screen.getByAltText('Registro um').closest('figure')!;
    expect(screen.getByText('Fotografia 1 de 3')).toBeVisible();
    expect(document.querySelector('img[src="/history/test/dois.webp"]')).toBeNull();
    expect(document.querySelector('img[src="/history/test/tres-thumb.webp"]')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima fotografia' }));
    expect(screen.getByAltText('Registro dois')).toBeVisible();
    fireEvent.keyDown(figure, { key: 'ArrowRight' });
    expect(screen.getByAltText('Registro tres')).toBeVisible();
    fireEvent.touchStart(figure, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(figure, { touches: [{ clientX: 120, clientY: 101 }] });
    fireEvent.touchEnd(figure, { changedTouches: [{ clientX: 100, clientY: 101 }] });
    expect(screen.getByAltText('Registro um')).toBeVisible();
    fireEvent.wheel(figure, { deltaY: 100 });
    fireEvent.pointerDown(figure, { pointerId: 1 });
    fireEvent.pointerMove(figure, { pointerId: 1 });
    fireEvent.pointerUp(figure, { pointerId: 1 });
    expect(mapGesture).not.toHaveBeenCalled();
  });

  it('respeita economia de dados, mantém só a miniatura ativa e permite escolher outra imagem', async () => {
    configureImages([image('um'), image('dois'), image('tres')]);
    Object.defineProperty(navigator, 'connection', { configurable: true, value: { saveData: true } });
    try {
      render(panel());
      await openHistory();
      expect(document.querySelectorAll('.fenasoja-history-thumbnails img')).toHaveLength(1);
      fireEvent.click(screen.getByRole('button', { name: 'Ver fotografia 3: Registro tres' }));
      expect(screen.getByAltText('Registro tres')).toBeVisible();
      expect(document.querySelectorAll('.fenasoja-history-thumbnails img')).toHaveLength(1);
    } finally { Reflect.deleteProperty(navigator, 'connection'); }
  });

  it('abre a foto completa sob demanda e Escape fecha primeiro a ampliação, depois a história com foco recuperado', async () => {
    configureImages([image('unica')]);
    render(panel());
    const trigger = screen.getByRole('button', { name: 'Conhecer a história' });
    await openHistory();
    const photoTrigger = screen.getByRole('button', { name: 'Ampliar fotografia: Registro unica' });
    fireEvent.click(photoTrigger);
    const dialog = await screen.findByRole('dialog', { name: 'Fotografia completa' });
    expect(within(dialog).getByAltText('Registro unica')).toHaveAttribute('src', '/history/test/unica-full.webp');
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('heading', { name: 'Pavilhão 7 — história de teste' })).toBeVisible();
    await waitFor(() => expect(photoTrigger).toHaveFocus());
    fireEvent.keyDown(photoTrigger, { key: 'Escape' });
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(screen.queryByRole('region', { name: 'Histórias da Fenasoja' })).not.toBeInTheDocument();
  });

  it('recupera falha fotográfica sem perder texto, fontes ou navegação para outra foto', async () => {
    configureImages([image('falha'), image('boa')]);
    render(panel());
    await openHistory();
    fireEvent.error(screen.getByAltText('Registro falha'));
    expect(screen.getByText(/Fotografia indisponível no momento/)).toBeVisible();
    expect(screen.getByText(mocks.entries[0].summary)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Próxima fotografia' }));
    expect(screen.getByAltText('Registro boa')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar fotografia: Registro boa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Fotografia completa' });
    fireEvent.error(within(dialog).getByAltText('Registro boa'));
    expect(within(dialog).getByText('Não foi possível carregar a fotografia ampliada.')).toBeVisible();
  });

  it('mantém a foto e seu acervo na ampliação mesmo se a miniatura falhar', async () => {
    configureImages([image('boa', { collection: 'Acervo documental' }), image('vizinha')]);
    render(panel());
    await openHistory();
    fireEvent.error(document.querySelector('.fenasoja-history-thumbnails img')!);
    expect(screen.getByAltText('Registro boa')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Ampliar fotografia: Registro boa' }));
    const dialog = await screen.findByRole('dialog', { name: 'Fotografia completa' });
    expect(dialog).toHaveTextContent('Acervo: Acervo documental');
  });

  it('preserva o atalho global de busca dentro da história', async () => {
    const shortcut = vi.fn();
    window.addEventListener('keydown', shortcut);
    try {
      render(panel());
      await openHistory();
      fireEvent.keyDown(screen.getByRole('button', { name: 'Voltar às informações' }), { key: 'k', ctrlKey: true });
      expect(shortcut).toHaveBeenCalledOnce();
    } finally { window.removeEventListener('keydown', shortcut); }
  });

  it('troca A→B durante a abertura lazy sem exibir história antiga ou substituir o painel', async () => {
    const first = fixture();
    const second = fixture('uuid-outra-estrutura', 'SEM-HISTORIA');
    const view = render(panel(first));
    const aside = screen.getByRole('complementary');
    fireEvent.click(screen.getByRole('button', { name: 'Conhecer a história' }));
    view.rerender(panel(second));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole('complementary')).toBe(aside);
    expect(screen.queryByRole('region', { name: 'Histórias da Fenasoja' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Conhecer a história' })).not.toBeInTheDocument();
    expect(mocks.activity).toHaveBeenLastCalledWith(second.lot.id);
    view.rerender(panel(first));
    expect(screen.queryByRole('region', { name: 'Histórias da Fenasoja' })).not.toBeInTheDocument();
  });

  it('preserva permissões de leitura e o estado expansível do painel inferior ao entrar e voltar', async () => {
    const readOnly = Object.fromEntries(Object.keys(permissions).map((key) => [key, key === 'canView'])) as unknown as MapPermissions;
    render(panel(fixture(), readOnly));
    const aside = screen.getByRole('complementary');
    fireEvent.click(screen.getByRole('button', { name: 'Expandir detalhes do lote' }));
    expect(aside).toHaveAttribute('data-sheet-state', 'expanded');
    await openHistory();
    expect(aside).toHaveAttribute('data-sheet-state', 'expanded');
    fireEvent.click(screen.getByRole('button', { name: 'Fechar história' }));
    expect(aside).toHaveAttribute('data-sheet-state', 'expanded');
    expect(screen.queryByRole('button', { name: 'Editar lote' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reservar' })).not.toBeInTheDocument();
  });
});
