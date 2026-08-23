import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrganizationalGraph, OrgNode } from '../types';
import { OrganizationalEcosystem } from './OrganizationalEcosystem';

function createNode(partial: Partial<OrgNode> & Pick<OrgNode, 'id' | 'type' | 'authorityLevel' | 'title'>): OrgNode {
  return {
    subtitle: null,
    personIds: [],
    parentIds: [],
    childIds: [],
    commissionId: null,
    advisoryId: null,
    sortOrder: 0,
    isRenderable: true,
    responsibilities: [],
    metadata: {},
    ...partial,
  };
}

function createGraph(): OrganizationalGraph {
  const nodes: OrgNode[] = [
    createNode({
      id: 'root',
      type: 'ccp',
      authorityLevel: 1,
      title: 'CCPF',
      subtitle: 'CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA',
      childIds: ['president'],
    }),
    createNode({
      id: 'president',
      type: 'executive',
      authorityLevel: 2,
      title: 'Presidência',
      subtitle: 'Presidente',
      personIds: ['person-ana'],
      parentIds: ['root'],
      childIds: ['central'],
      responsibilities: [{
        id: 'responsibility-ana',
        personId: 'person-ana',
        displayName: 'Ana Silva',
        responsibleType: 'pessoa',
        relationshipRole: 'Presidente',
        isPrimary: true,
      }],
    }),
    createNode({
      id: 'central',
      type: 'central-commission',
      authorityLevel: 3,
      title: 'Comissão Central',
      parentIds: ['president'],
      childIds: ['logistics'],
    }),
    createNode({
      id: 'logistics',
      type: 'commission',
      authorityLevel: 4,
      title: 'Comissão de Logística',
      personIds: ['person-bruno', 'person-carla'],
      parentIds: ['central'],
      childIds: ['future'],
      commissionId: 'logistics',
      responsibilities: [{
        id: 'responsibility-bruno',
        personId: 'person-bruno',
        displayName: 'Bruno Souza',
        responsibleType: 'pessoa',
        relationshipRole: 'corresponsavel',
        isPrimary: true,
      }, {
        id: 'responsibility-carla',
        personId: 'person-carla',
        displayName: 'Carla Ribeiro',
        responsibleType: 'pessoa',
        relationshipRole: 'copresidente',
        isPrimary: false,
      }, {
        id: 'responsibility-logistics-team',
        personId: null,
        displayName: 'Equipe Operacional',
        responsibleType: 'equipe',
        relationshipRole: 'equipe_apoio',
        isPrimary: false,
      }],
    }),
    createNode({
      id: 'press-advisory',
      type: 'advisory',
      authorityLevel: 4,
      title: 'Assessoria de Imprensa',
      personIds: ['person-daniela'],
      parentIds: ['central'],
      advisoryId: 'press-advisory',
      sortOrder: 2,
      responsibilities: [{
        id: 'responsibility-daniela',
        personId: 'person-daniela',
        displayName: 'Daniela Souza',
        responsibleType: 'pessoa',
        relationshipRole: 'Assessora',
        isPrimary: true,
      }],
    }),
    createNode({
      id: 'excluded-visible-node',
      type: 'commission',
      authorityLevel: 4,
      title: 'Comissão fora da edição',
      personIds: ['person-excluded'],
      parentIds: ['central'],
      isRenderable: true,
      responsibilities: [{
        id: 'responsibility-excluded',
        personId: 'person-excluded',
        displayName: 'Pessoa Oculta',
        responsibleType: 'pessoa',
        relationshipRole: 'Responsável legado',
        isPrimary: true,
      }],
    }),
    createNode({
      id: 'future',
      type: 'volunteer',
      authorityLevel: 5,
      title: 'Voluntário futuro',
      parentIds: ['logistics'],
      isRenderable: false,
    }),
  ];

  return {
    people: {
      'person-ana': {
        id: 'person-ana',
        userId: 'user-ana',
        fullName: 'Ana Silva',
        avatarUrl: null,
        roles: ['Presidente'],
        highestAuthorityLevel: 2,
        sourceIds: ['member-ana'],
      },
      'person-bruno': {
        id: 'person-bruno',
        userId: 'user-bruno',
        fullName: 'Bruno Souza',
        avatarUrl: null,
        roles: ['Comissão de Logística'],
        highestAuthorityLevel: 4,
        sourceIds: ['member-bruno'],
      },
      'person-carla': {
        id: 'person-carla',
        userId: 'user-carla',
        fullName: 'Carla Ribeiro',
        avatarUrl: null,
        roles: ['Corresponsável de Logística'],
        highestAuthorityLevel: 4,
        sourceIds: ['member-carla'],
      },
      'person-daniela': {
        id: 'person-daniela',
        userId: 'user-daniela',
        fullName: 'Daniela Souza',
        avatarUrl: null,
        roles: ['Assessora de Imprensa'],
        highestAuthorityLevel: 4,
        sourceIds: ['member-daniela'],
      },
      'person-excluded': {
        id: 'person-excluded',
        userId: 'user-excluded',
        fullName: 'Pessoa Oculta',
        avatarUrl: null,
        roles: ['Responsável legado'],
        highestAuthorityLevel: 4,
        sourceIds: ['member-excluded'],
      },
    },
    nodes,
    edges: [
      { id: 'root-president', sourceId: 'root', targetId: 'president', authorityLevel: 2 },
      { id: 'president-central', sourceId: 'president', targetId: 'central', authorityLevel: 3 },
      { id: 'central-logistics', sourceId: 'central', targetId: 'logistics', authorityLevel: 4 },
      { id: 'central-press', sourceId: 'central', targetId: 'press-advisory', authorityLevel: 4 },
      { id: 'central-excluded', sourceId: 'central', targetId: 'excluded-visible-node', authorityLevel: 4 },
    ],
    anomalies: [],
    rootNodeId: 'root',
    renderableNodeIds: ['root', 'president', 'central', 'logistics', 'press-advisory'],
  };
}

function createDenseGraph(): OrganizationalGraph {
  const graph = createGraph();
  const centralNode = graph.nodes.find((node) => node.id === 'central');
  if (!centralNode) throw new Error('Central fixture missing');

  Array.from({ length: 33 }, (_, index) => {
    const id = `dense-operation-${index + 1}`;
    graph.nodes.push(createNode({
      id,
      type: index % 6 === 0 ? 'advisory' : 'commission',
      authorityLevel: 4,
      title: `ESTRUTURA OPERACIONAL ${index + 1}`,
      parentIds: ['central'],
      sortOrder: index + 10,
    }));
    graph.renderableNodeIds.push(id);
    centralNode.childIds.push(id);
    graph.edges.push({
      id: `central-${id}`,
      sourceId: 'central',
      targetId: id,
      authorityLevel: 4,
    });
  });

  return graph;
}

describe('OrganizationalEcosystem', () => {
  let resizeObserverCallback: ResizeObserverCallback;

  beforeEach(() => {
    class PointerEventMock extends MouseEvent {
      readonly pointerId: number;
      readonly pointerType: string;

      constructor(type: string, init: PointerEventInit = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 0;
        this.pointerType = init.pointerType ?? '';
      }
    }

    class ResizeObserverMock {
      private readonly callback: ResizeObserverCallback;

      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
        resizeObserverCallback = callback;
      }

      observe() {
        this.callback([{
          contentRect: { width: 1200, height: 800 },
        } as ResizeObserverEntry], this as unknown as ResizeObserver);
      }

      disconnect() {}
      unobserve() {}
    }

    vi.stubGlobal('PointerEvent', PointerEventMock);
    vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('selects a real node, exposes context and consumes Escape to close detail', () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    fireEvent.click(screen.getByRole('button', { name: /Ana Silva/i }));
    const panel = screen.getByLabelText(/Detalhes de Ana Silva/i);
    expect(within(panel).getByText('PRESIDENTE', { selector: 'small' })).toBeInTheDocument();

    fireEvent.keyDown(within(panel).getByRole('button', { name: /Fechar detalhes/i }), {
      key: 'Escape',
    });
    expect(screen.queryByLabelText(/Detalhes de Ana Silva/i)).not.toBeInTheDocument();
  });

  it('returns focus to the originating node when the detail close button is used', async () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    const node = screen.getByRole('button', { name: /Ana Silva/i });
    fireEvent.click(node);
    const close = within(screen.getByLabelText(/Detalhes de Ana Silva/i))
      .getByRole('button', { name: /Fechar detalhes/i });
    close.focus();
    fireEvent.click(close);

    await waitFor(() => expect(node).toHaveFocus());
  });

  it('searches registered people, focuses the result and keeps Level 5 inactive', () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    fireEvent.change(screen.getByRole('combobox', { name: /Buscar pessoa/i }), {
      target: { value: 'Bruno' },
    });
    fireEvent.click(screen.getByRole('option', { name: /Bruno Souza/i }));

    expect(screen.getByLabelText(/Detalhes de Comissão de Logística/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Voluntário futuro/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Voluntário futuro')).not.toBeInTheDocument();
  });

  it('labels a result with the person actually matched, including a second responsible', () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    fireEvent.change(screen.getByRole('combobox', { name: /Buscar pessoa/i }), {
      target: { value: 'Carla' },
    });

    expect(screen.getByRole('option', { name: /Carla Ribeiro/i })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /Bruno Souza/i })).not.toBeInTheDocument();
  });

  it('uses the executive subtitle as search context when the node title is the person name', () => {
    const graph = createGraph();
    const executive = graph.nodes.find((node) => node.id === 'president');
    if (!executive) throw new Error('Executive fixture missing');
    executive.title = 'Ana Silva';
    executive.subtitle = 'Presidente';

    render(<OrganizationalEcosystem graph={graph} active />);
    fireEvent.change(screen.getByRole('combobox', { name: /Buscar pessoa/i }), {
      target: { value: 'Ana' },
    });

    expect(screen.getByRole('option', { name: /Ana Silva.*Presidente/i })).toBeInTheDocument();
  });

  it('announces every mixed responsibility once and translates raw relationship roles', () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    const logisticsNode = screen.getByRole('button', { name: /Bruno Souza/i });
    const accessibleName = logisticsNode.getAttribute('aria-label') ?? '';
    expect(accessibleName.match(/BRUNO SOUZA/g)).toHaveLength(1);
    expect(accessibleName.match(/CARLA RIBEIRO/g)).toHaveLength(1);
    expect(accessibleName.match(/EQUIPE OPERACIONAL/g)).toHaveLength(1);

    fireEvent.click(logisticsNode);
    const panel = screen.getByLabelText(/Detalhes de Comissão de Logística/i);
    expect(within(panel).getByText('CORRESPONSÁVEL')).toBeInTheDocument();
    expect(within(panel).getByText('COPRESIDÊNCIA')).toBeInTheDocument();
    expect(within(panel).getByText('EQUIPE DE APOIO')).toBeInTheDocument();
  });

  it('uses the Fenasoja masthead and CCPF presentation without legacy labels or counters', () => {
    const { container } = render(<OrganizationalEcosystem graph={createGraph()} active />);
    const masthead = container.querySelector('.org-ecosystem__masthead');
    if (!(masthead instanceof HTMLElement)) throw new Error('Masthead missing');

    expect(within(masthead).getByRole('img', { name: 'Fenasoja 2028' })).toHaveClass(
      'fenasoja-brand',
      'org-ecosystem__brand',
    );
    expect(within(masthead).getByRole('heading', {
      name: 'ECOSSISTEMA ORGANIZACIONAL',
    })).toBeInTheDocument();
    expect(masthead.querySelector('.org-ecosystem__title > p')).toBeNull();
    expect(screen.getByRole('button', {
      name: /^CCPF\. CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA$/,
    })).toBeInTheDocument();
    expect(screen.getByText('01 CCPF')).toBeInTheDocument();
    expect(screen.getByLabelText(
      '01 CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA',
    )).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /BRUNO SOUZA/ }));
    const presentationSurface = [
      container.textContent ?? '',
      ...Array.from(container.querySelectorAll('[aria-label]'), (element) => (
        element.getAttribute('aria-label') ?? ''
      )),
    ].join(' ');
    expect(presentationSurface).not.toMatch(/\b(?:AUTORIDADE|FLUXO|RESPONDE|CONECTA)\b/i);
    expect(masthead.textContent).not.toMatch(/\d+\s+(?:ESTRUTURAS|CENTRAIS?|OPERACIONAIS)/i);
  });

  it('staggers nodes and connectors by hierarchy and stable order', () => {
    const { container } = render(<OrganizationalEcosystem graph={createGraph()} active />);
    const nodeDelays = (authorityLevel: number) => Array.from(
      container.querySelectorAll<HTMLElement>(`.org-node[data-authority="${authorityLevel}"]`),
      (element) => Number.parseInt(element.style.getPropertyValue('--org-node-delay'), 10),
    );
    const edgeDelays = (authorityLevel: number) => Array.from(
      container.querySelectorAll<SVGGElement>(
        `.org-relationship[data-target-authority="${authorityLevel}"]`,
      ),
      (element) => Number.parseInt(element.style.getPropertyValue('--org-edge-delay'), 10),
    );

    expect(nodeDelays(1)).toEqual([140]);
    expect(nodeDelays(2)).toEqual([480]);
    expect(nodeDelays(3)).toEqual([920]);
    expect(nodeDelays(4).sort((left, right) => left - right)).toEqual([1120, 1142]);
    expect(edgeDelays(2)).toEqual([360]);
    expect(edgeDelays(3)).toEqual([760]);
    expect(edgeDelays(4).sort((left, right) => left - right)).toEqual([980, 1002]);
    expect(container.querySelectorAll('.org-relationship__reveal-glow')).toHaveLength(4);
  });

  it('performs the final fit after the complete cascade and keeps a dense graph above 45% at 1366x768', () => {
    vi.useFakeTimers();
    const view = render(
      <OrganizationalEcosystem graph={createDenseGraph()} active />,
    );

    try {
      act(() => {
        resizeObserverCallback([{
          contentRect: { width: 1366, height: 768 },
        } as ResizeObserverEntry], {} as ResizeObserver);
        vi.advanceTimersByTime(16);
      });
      const ready = view.container.querySelector('.org-ecosystem__ready');
      if (!(ready instanceof HTMLElement)) throw new Error('Ready graph missing');
      const narrativeScale = Number(ready.dataset.viewportScale);

      expect(ready).toHaveAttribute('data-layout-width', '2192');
      expect(ready).toHaveAttribute('data-layout-height', '1210');
      expect(narrativeScale).toBeCloseTo(0.56, 3);
      const denseEdgeDelays = Array.from(
        view.container.querySelectorAll<SVGGElement>(
          '.org-relationship[data-target-authority="4"]',
        ),
        (element) => Number.parseInt(element.style.getPropertyValue('--org-edge-delay'), 10),
      );
      expect(denseEdgeDelays).toHaveLength(35);
      expect(Math.max(...denseEdgeDelays) + 760).toBeLessThan(2600);

      act(() => vi.advanceTimersByTime(2583));
      expect(Number(ready.dataset.viewportScale)).toBe(narrativeScale);

      act(() => vi.advanceTimersByTime(1));
      const finalScale = Number(ready.dataset.viewportScale);
      expect(finalScale).toBeGreaterThan(0.45);
      expect(finalScale).toBeLessThan(narrativeScale);
      expect(ready).toHaveAttribute('data-camera-animating', 'true');
    } finally {
      act(() => {
        view.unmount();
        vi.clearAllTimers();
      });
      vi.useRealTimers();
    }
  });

  it('cancels the pending final fit when focus enters the graph before 2600ms', () => {
    vi.useFakeTimers();
    const view = render(
      <OrganizationalEcosystem graph={createDenseGraph()} active />,
    );

    try {
      act(() => {
        resizeObserverCallback([{
          contentRect: { width: 1366, height: 768 },
        } as ResizeObserverEntry], {} as ResizeObserver);
        vi.advanceTimersByTime(16);
      });
      const ready = view.container.querySelector('.org-ecosystem__ready');
      if (!(ready instanceof HTMLElement)) throw new Error('Ready graph missing');
      const narrativeScale = Number(ready.dataset.viewportScale);

      act(() => screen.getByRole('combobox', { name: /BUSCAR PESSOA/i }).focus());
      act(() => vi.advanceTimersByTime(3000));

      expect(Number(ready.dataset.viewportScale)).toBe(narrativeScale);
      expect(ready).not.toHaveAttribute('data-camera-animating');
    } finally {
      view.unmount();
    }
  });

  it('continues zoom from the rendered camera when a transition is interrupted', () => {
    vi.useFakeTimers();
    const view = render(
      <OrganizationalEcosystem graph={createDenseGraph()} active />,
    );

    try {
      act(() => {
        resizeObserverCallback([{
          contentRect: { width: 1366, height: 768 },
        } as ResizeObserverEntry], {} as ResizeObserver);
        vi.advanceTimersByTime(16);
        vi.advanceTimersByTime(2584);
      });
      const ready = view.container.querySelector('.org-ecosystem__ready');
      const world = view.container.querySelector('.org-viewport__world');
      if (!(ready instanceof HTMLElement) || !(world instanceof HTMLElement)) {
        throw new Error('Viewport fixture missing');
      }
      const originalGetComputedStyle = window.getComputedStyle;
      const styleSpy = vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
        const style = originalGetComputedStyle(element);
        if (element !== world) return style;
        return new Proxy(style, {
          get(target, property, receiver) {
            if (property === 'transform') return 'matrix(0.5, 0, 0, 0.5, 100, 120)';
            return Reflect.get(target, property, receiver);
          },
        });
      });

      try {
        fireEvent.click(screen.getByRole('button', { name: /Aumentar zoom/i }));
        expect(Number(ready.dataset.viewportScale)).toBeCloseTo(0.6, 3);
      } finally {
        styleSpy.mockRestore();
      }
    } finally {
      view.unmount();
    }
  });

  it('cancels the pending final fit when the user changes zoom before 2600ms', () => {
    vi.useFakeTimers();
    const view = render(
      <OrganizationalEcosystem graph={createDenseGraph()} active />,
    );

    try {
      act(() => {
        resizeObserverCallback([{
          contentRect: { width: 1366, height: 768 },
        } as ResizeObserverEntry], {} as ResizeObserver);
        vi.advanceTimersByTime(16);
      });
      const ready = view.container.querySelector('.org-ecosystem__ready');
      if (!(ready instanceof HTMLElement)) throw new Error('Ready graph missing');
      const narrativeScale = Number(ready.dataset.viewportScale);

      fireEvent.click(screen.getByRole('button', { name: /Aumentar zoom/i }));
      const interactedScale = Number(ready.dataset.viewportScale);
      expect(interactedScale).toBeGreaterThan(narrativeScale);

      act(() => vi.advanceTimersByTime(3000));
      expect(Number(ready.dataset.viewportScale)).toBe(interactedScale);
      expect(ready).not.toHaveAttribute('data-camera-animating');
    } finally {
      act(() => {
        view.unmount();
        vi.clearAllTimers();
      });
      vi.useRealTimers();
    }
  });

  it('clears selection and keyboard eligibility when a filter hides the active node', () => {
    const onSelectedNodeChange = vi.fn();
    const { container } = render(
      <OrganizationalEcosystem
        graph={createGraph()}
        active
        onSelectedNodeChange={onSelectedNodeChange}
      />,
    );

    const logisticsNode = screen.getByRole('button', { name: /Bruno Souza/i });
    fireEvent.click(logisticsNode);
    expect(screen.getByLabelText(/Detalhes de Comissão de Logística/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', {
      name: /^CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA$/i,
    }));

    expect(screen.queryByLabelText(/Detalhes de Comissão de Logística/i)).not.toBeInTheDocument();
    expect(logisticsNode).toBeDisabled();
    expect(logisticsNode).toHaveAttribute('tabindex', '-1');
    expect(logisticsNode.closest('.org-node')).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('.org-node[data-authority="1"] [data-org-node]'))
      .toHaveAttribute('tabindex', '0');
    expect(onSelectedNodeChange).toHaveBeenLastCalledWith(null);

    fireEvent.change(screen.getByRole('combobox', { name: /Buscar pessoa/i }), {
      target: { value: 'Bruno' },
    });
    expect(screen.queryByRole('option', { name: /Bruno Souza/i })).not.toBeInTheDocument();
  });

  it('pans from a touch that starts over a node without converting the gesture into selection', () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    const viewport = screen.getByRole('group', { name: /Mapa interativo/i });
    const logisticsNode = screen.getByRole('button', { name: /Bruno Souza/i });
    fireEvent.pointerDown(logisticsNode, {
      button: 0,
      clientX: 120,
      clientY: 220,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(viewport, {
      clientX: 154,
      clientY: 244,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(viewport, {
      clientX: 154,
      clientY: 244,
      pointerId: 1,
      pointerType: 'touch',
    });

    expect(viewport).toHaveAttribute('data-org-gesture-moved', 'true');
    fireEvent.click(logisticsNode);
    expect(screen.queryByLabelText(/Detalhes de Comissão de Logística/i)).not.toBeInTheDocument();
  });

  it('pinches when the first touch starts over a node and suppresses its synthetic click', async () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    const viewport = screen.getByRole('group', { name: /Mapa interativo/i });
    const logisticsNode = screen.getByRole('button', { name: /Bruno Souza/i });
    const zoomOutput = screen.getByLabelText(/Zoom em/i);
    const initialZoom = zoomOutput.textContent;

    fireEvent.pointerDown(logisticsNode, {
      button: 0,
      clientX: 100,
      clientY: 180,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.pointerDown(viewport, {
      button: 0,
      clientX: 200,
      clientY: 180,
      pointerId: 2,
      pointerType: 'touch',
    });
    fireEvent.pointerMove(viewport, {
      clientX: 270,
      clientY: 180,
      pointerId: 2,
      pointerType: 'touch',
    });

    await waitFor(() => expect(zoomOutput.textContent).not.toBe(initialZoom));

    fireEvent.pointerUp(viewport, {
      clientX: 270,
      clientY: 180,
      pointerId: 2,
      pointerType: 'touch',
    });
    fireEvent.pointerUp(viewport, {
      clientX: 100,
      clientY: 180,
      pointerId: 1,
      pointerType: 'touch',
    });
    fireEvent.click(logisticsNode);

    expect(screen.queryByLabelText(/Detalhes de Comissão de Logística/i)).not.toBeInTheDocument();
  });

  it('preserves the current zoom when the viewport is resized', async () => {
    render(<OrganizationalEcosystem graph={createGraph()} active />);

    const zoomOutput = screen.getByLabelText(/Zoom em/i);
    const initialZoom = zoomOutput.textContent;
    fireEvent.click(screen.getByRole('button', { name: /Aumentar zoom/i }));
    await waitFor(() => expect(zoomOutput.textContent).not.toBe(initialZoom));
    const zoomAfterInteraction = zoomOutput.textContent;

    act(() => {
      resizeObserverCallback([{
        contentRect: { width: 900, height: 700 },
      } as ResizeObserverEntry], {} as ResizeObserver);
    });

    await waitFor(() => expect(zoomOutput.textContent).toBe(zoomAfterInteraction));
  });

  it('excludes allow-list omissions from search and initial selection', () => {
    const graph = createGraph();
    render(
      <OrganizationalEcosystem
        graph={graph}
        active
        initialSelectedNodeId="excluded-visible-node"
      />,
    );

    expect(screen.queryByLabelText(/Detalhes de Comissão fora da edição/i)).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox', { name: /Buscar pessoa/i }), {
      target: { value: 'Pessoa Oculta' },
    });
    expect(screen.queryByRole('option', { name: /Pessoa Oculta/i })).not.toBeInTheDocument();
  });

  it('shows the intentional empty state for a structural root without real links', () => {
    const graph = createGraph();
    graph.nodes = [createNode({
      id: 'root',
      type: 'ccp',
      authorityLevel: 1,
      title: 'CCPF',
      subtitle: 'CCPF — CONSELHO CONSULTIVO PERMANENTE FENASOJA',
    })];
    graph.edges = [];
    graph.renderableNodeIds = ['root'];

    render(<OrganizationalEcosystem graph={graph} active />);
    expect(screen.getByText('Estrutura em preparação')).toBeInTheDocument();
  });
});
