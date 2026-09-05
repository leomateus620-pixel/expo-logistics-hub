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

    expect(screen.getByLabelText(/Detalhes de Bruno Souza/i)).toBeInTheDocument();
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

  it('searches a collective title without selecting the first member whose role repeats that title', () => {
    const graph = createGraph();
    graph.nodes.find((node) => node.id === 'central')!.personIds = ['person-carla'];
    graph.people['person-carla'].roles = ['Comissão Central'];
    const { container } = render(<OrganizationalEcosystem graph={graph} active />);
    fireEvent.change(screen.getByRole('combobox', { name: /Buscar pessoa/i }), { target: { value: 'Comissão Central' } });
    fireEvent.click(screen.getByRole('option', { name: /^Comissão Central/i }));
    expect(container.querySelector('[data-selection-person]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'COMISSÃO CENTRAL' })).toBeInTheDocument();
    const edgeIds = Array.from(container.querySelectorAll('[data-edge-id]'), (edge) => edge.getAttribute('data-edge-id')).sort();
    expect(edgeIds).toEqual(['central-logistics', 'central-press', 'president-central']);
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

    expect(nodeDelays(1)).toEqual([0]);
    expect(nodeDelays(2)).toEqual([100]);
    expect(nodeDelays(3)).toEqual([220]);
    expect(nodeDelays(4).sort((left, right) => left - right)).toEqual([300, 312]);
    expect(edgeDelays(2)).toEqual([80]);
    expect(edgeDelays(3)).toEqual([180]);
    expect(edgeDelays(4).sort((left, right) => left - right)).toEqual([260, 272]);
    expect(container.querySelectorAll('.org-relationship__reveal-glow')).toHaveLength(0);
    expect(container.querySelectorAll('.org-relationship__terminal')).toHaveLength(0);
    container.querySelectorAll('.org-relationship path').forEach((path) => {
      expect(path).toHaveAttribute('vector-effect', 'non-scaling-stroke');
    });
  });

  it('fits once above 53% and preserves the initial composition after the arrival cascade', () => {
    vi.useFakeTimers();
    const view = render(<OrganizationalEcosystem graph={createDenseGraph()} active />);
    act(() => {
      resizeObserverCallback([{ contentRect: { width: 1366, height: 768 } } as ResizeObserverEntry], {} as ResizeObserver);
      vi.advanceTimersByTime(32);
    });
    const ready = view.container.querySelector('.org-ecosystem__ready') as HTMLElement;
    const initialScale = Number(ready.dataset.viewportScale);
    expect(initialScale).toBeGreaterThan(0.53);
    expect(Number(ready.dataset.layoutHeight)).toBeLessThan(990);
    act(() => vi.advanceTimersByTime(4000));
    expect(Number(ready.dataset.viewportScale)).toBe(initialScale);
    expect(ready).not.toHaveAttribute('data-camera-animating');
    view.unmount();
  });

  it('preserves the fitted composition while search receives focus during the entrance', () => {
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
      fireEvent.click(screen.getByRole('button', { name: /Ana Silva/i }));
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

  it('preserves manual zoom after all entrance animations finish', () => {
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

  it('unmounts every unrelated edge and decoration through successive selections and clear', () => {
    const { container } = render(<OrganizationalEcosystem graph={createGraph()} active />);
    const edges = () => Array.from(container.querySelectorAll('[data-edge-id]'), (item) => item.getAttribute('data-edge-id')).sort();
    expect(edges()).toEqual(['central-logistics', 'central-press', 'president-central', 'root-president']);

    fireEvent.click(screen.getByRole('button', { name: /Bruno Souza/i }));
    expect(edges()).toEqual(['central-logistics']);
    expect(container.querySelector('[data-edge-id="root-president"]')).toBeNull();
    expect(container.querySelector('.org-relationship__reveal-glow')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /^Ana Silva/i }));
    expect(edges()).toEqual(['president-central', 'root-president']);
    fireEvent.mouseEnter(screen.getByRole('button', { name: /^Daniela Souza/i }));
    expect(edges()).toEqual(['president-central', 'root-president']);

    fireEvent.click(within(screen.getByRole('group', { name: /Mapa interativo/i })).getByRole('button', { name: /^Comissão Central/i }));
    expect(edges()).toEqual(['central-logistics', 'central-press', 'president-central']);
    expect(container.querySelector('[data-edge-id="root-president"]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Limpar seleção e restaurar/i }));
    expect(edges()).toHaveLength(4);
    expect(container.querySelector('[data-org-detail-panel]')).toBeNull();
  });

  it('selects the actual second person through search and panel without inheriting collective outgoing edges', () => {
    const graph = createGraph();
    const central = graph.nodes.find((node) => node.id === 'central')!;
    central.personIds = ['person-carla'];
    const { container } = render(<OrganizationalEcosystem graph={graph} active />);
    const edges = () => Array.from(container.querySelectorAll('[data-edge-id]'), (item) => item.getAttribute('data-edge-id')).sort();

    fireEvent.change(screen.getByRole('combobox', { name: /Buscar pessoa/i }), { target: { value: 'Carla' } });
    fireEvent.click(screen.getAllByRole('option', { name: /Carla Ribeiro/i })[0]);
    expect(screen.getByLabelText(/Detalhes de Carla Ribeiro/i)).toBeInTheDocument();
    expect(edges()).toEqual(['central-logistics', 'president-central']);
    expect(container.querySelector('[data-edge-id="central-press"]')).toBeNull();
    expect(container.querySelector('[data-selection-person="person-carla"]')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Limpar seleção/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Bruno Souza/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Selecionar Carla Ribeiro/i }));
    expect(screen.getByLabelText(/Detalhes de Carla Ribeiro/i)).toBeInTheDocument();
    expect(edges()).toEqual(['central-logistics', 'president-central']);
    const logistics = container.querySelector('.org-node[data-node-type="commission"][data-selected="true"]');
    expect(logistics?.querySelector('.org-node__name')).toHaveTextContent('CARLA RIBEIRO');
  });

  it('keeps exact manual pan and zoom when graph records refresh', () => {
    vi.useFakeTimers();
    const view = render(<OrganizationalEcosystem graph={createDenseGraph()} active />);
    act(() => vi.advanceTimersByTime(32));
    fireEvent.click(screen.getByRole('button', { name: /Aumentar zoom/i }));
    const viewport = screen.getByRole('group', { name: /Mapa interativo/i });
    fireEvent.pointerDown(viewport, { button: 0, clientX: 100, clientY: 250, pointerId: 1 });
    fireEvent.pointerMove(viewport, { clientX: 180, clientY: 300, pointerId: 1 });
    fireEvent.pointerUp(viewport, { clientX: 180, clientY: 300, pointerId: 1 });
    const transform = (view.container.querySelector('.org-viewport__world') as HTMLElement).style.transform;
    const nextGraph = createDenseGraph();
    nextGraph.nodes[1].title = 'Presidência atualizada';
    view.rerender(<OrganizationalEcosystem graph={nextGraph} active />);
    act(() => vi.advanceTimersByTime(4000));
    expect((view.container.querySelector('.org-viewport__world') as HTMLElement).style.transform).toBe(transform);
    view.unmount();
  });

  it('moves selection into the available desktop area without changing the manual scale', () => {
    vi.useFakeTimers();
    const view = render(<OrganizationalEcosystem graph={createDenseGraph()} active />);
    act(() => vi.advanceTimersByTime(32));
    fireEvent.click(screen.getByRole('button', { name: /Aumentar zoom/i }));
    const ready = view.container.querySelector('.org-ecosystem__ready') as HTMLElement;
    const scale = ready.dataset.viewportScale;
    fireEvent.click(screen.getByRole('button', { name: /^Ana Silva/i }));
    expect(ready.dataset.viewportScale).toBe(scale);
    const world = view.container.querySelector('.org-viewport__world') as HTMLElement;
    const transform = world.style.transform.match(/translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([-\d.]+)\)/)!;
    const selected = view.container.querySelector('.org-node[data-selected="true"]') as HTMLElement;
    const centerX = Number(transform[1]) + Number.parseFloat(selected.style.getPropertyValue('--org-node-x')) * Number(transform[3]);
    expect(centerX).toBeGreaterThan(24 + 100);
    expect(centerX).toBeLessThan(1200 - 388 - 100);
    view.unmount();
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
