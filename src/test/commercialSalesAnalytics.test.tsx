import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommercialDashboard } from "@/features/commercial-map/dashboard/CommercialDashboard";
import {
  CommercialCashflowPreview,
  shuffledMonths,
  SignatureLatencyInline,
} from "@/features/commercial-map/dashboard/CommercialSalesAnalyticsCards";
import { CommercialSalesAnalyticsProvider } from "@/features/commercial-map/dashboard/salesOrders/useCommercialSalesAnalytics";
import {
  exactCents,
  parseSalesAnalytics,
  signatureDuration,
  totalsFor,
  type SalesAnalytics,
} from "@/features/commercial-map/dashboard/salesOrders/commercialSalesAnalytics";
import { useSalesOrdersUiStore } from "@/features/commercial-map/dashboard/salesOrders/useSalesOrdersUiStore";
import report from "../../docs/commercial-analytics/database-report.json";
const api = vi.hoisted(() => ({ rpc: vi.fn(), aborted: 0 }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: api.rpc },
}));
const sample = report.baseline as unknown as SalesAnalytics;
let client: QueryClient;
const clone = () => JSON.parse(JSON.stringify(sample)) as SalesAnalytics;
beforeEach(() => {
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  api.rpc.mockReset();
  useSalesOrdersUiStore.setState({
    area: "overview",
    analyticsScopeId: null,
    scopeProjectId: null,
  });
  api.rpc.mockImplementation((name: string, args: Record<string, unknown>) => ({
    abortSignal: () =>
      Promise.resolve({
        error: null,
        data:
          name === "commercial_sales_analytics_summary"
            ? clone()
            : { total: 0, rows: [], generation: sample.generation },
      }),
  }));
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  client.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const wrap = (child: React.ReactNode) => (
  <QueryClientProvider client={client}>
    <CommercialSalesAnalyticsProvider
      projectId={sample.projectId}
      orgId="test-org"
      revision={1}
    >
      {child}
    </CommercialSalesAnalyticsProvider>
  </QueryClientProvider>
);

describe("commercial exact persisted analytics contract", () => {
  it("accepts the actual isolated SQL summary and reconciles all 17 default months plus the outside month", () => {
    const parsed = parseSalesAnalytics(clone());
    const totals = totalsFor(parsed.months, "principal");
    expect(totals.scheduledCents).toBe(parsed.reconciliation.coveredCents);
    expect(totals.scheduledCents).toBe(
      totals.paidCents + totals.outstandingCents,
    );
    expect(parsed.months.some((m) => m.month === "2028-06-01")).toBe(true);
  });
  it("rejects missing, unsafe, negative, duplicated and unreconciled monetary data", () => {
    for (const n of ["", null, undefined, -1, "1.2", "9007199254740992"])
      expect(() => exactCents(n)).toThrow();
    const raw = clone();
    raw.months[0].principal.paidCents = "1" as unknown as number;
    expect(() => parseSalesAnalytics(raw)).toThrow("Cronograma não conciliado");
    const duplicate = clone();
    duplicate.months.push(duplicate.months[0]);
    expect(() => parseSalesAnalytics(duplicate)).toThrow(
      "Competência duplicada",
    );
  });
  it("distinguishes a proven zero duration from absence and calculates display only after aggregation", () => {
    expect(signatureDuration(null)).toBe("—");
    expect(signatureDuration(0)).toBe("0 min");
    expect(signatureDuration(48 * 3600)).toBe("2 dias");
    expect(signatureDuration((2 * 24 + 7) * 3600)).toBe("2 dias e 7 h");
    expect(signatureDuration(3660)).toBe("1 h e 1 min");
  });
  it("keeps a deterministic non-repeating month permutation for the same seed", () => {
    const keys = sample.months.map((m) => m.month);
    expect(shuffledMonths(keys, "scope")).toEqual(
      shuffledMonths(keys, "scope"),
    );
    expect(new Set(shuffledMonths(keys, "scope")).size).toBe(keys.length);
  });
});

describe("commercial analytics navigation and confidentiality", () => {
  it("opens cashflow from confirmed card and returns focus without changing the map or renegotiating totals", async () => {
    const onViewLot = vi.fn();
    render(
      <QueryClientProvider client={client}>
        <CommercialDashboard
          data={{ lots: [], entities: [] }}
          projectId={sample.projectId}
          orgId="test-org"
          dataUpdatedAt={1}
          isFetching={false}
          canManageSales
          onClose={vi.fn()}
          onViewLot={onViewLot}
        />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(api.rpc).toHaveBeenCalled());
    fireEvent.click(screen.getByRole("button", { name: "Ver fluxo de caixa" }));
    expect(
      await screen.findByRole("heading", { name: "Fluxo de caixa comercial" }),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cobrança com taxas" }));
    expect(
      screen.getByRole("button", { name: "Cobrança com taxas" }),
    ).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(
      screen.getByRole("button", { name: "Voltar à visão geral" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Ver fluxo de caixa" }),
      ).toHaveFocus(),
    );
    expect(onViewLot).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ver fluxo de caixa" }));
    expect(
      screen.getByRole("button", { name: "Cobrança com taxas" }),
    ).toHaveAttribute("aria-pressed", "true");
  });
  it("does not request or retain protected summaries after access revocation", async () => {
    const props = {
      data: { lots: [], entities: [] },
      projectId: sample.projectId,
      orgId: "test-org",
      dataUpdatedAt: 1,
      isFetching: false,
      onClose: vi.fn(),
      onViewLot: vi.fn(),
      onViewSale: vi.fn(),
    };
    const { rerender } = render(
      <QueryClientProvider client={client}>
        <CommercialDashboard {...props} canManageSales />
      </QueryClientProvider>,
    );
    await screen.findByRole('button', { name: 'Ver detalhamento de assinatura' });
    fireEvent.click(screen.getByRole('button', { name: 'Como é calculado o tempo médio de assinatura' }));
    expect(screen.getByText(`Calculado com ${sample.signature.count} vendas`)).toBeInTheDocument();
    rerender(
      <QueryClientProvider client={client}>
        <CommercialDashboard {...props} canManageSales={false} />
      </QueryClientProvider>,
    );
    expect(
      screen.queryByText(`Calculado com ${sample.signature.count} vendas`),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Ver fluxo de caixa" }),
    ).not.toBeInTheDocument();
    expect(
      client.getQueryCache().findAll({
        queryKey: ["commercial-sale-orders", sample.projectId, "analytics"],
      }),
    ).toHaveLength(0);
  });
  it("rotates presentation every 10 seconds without refetch and pauses during focus", async () => {
    vi.useFakeTimers();
    const open = vi.fn();
    const { container } = render(
      wrap(<CommercialCashflowPreview scope="scope" onOpen={open} />),
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(
      screen.getByRole("button", { name: /Ver fluxo de / }),
    ).toBeInTheDocument();
    const before = container.textContent,
      calls = api.rpc.mock.calls.length;
    act(() => {
      vi.advanceTimersByTime(10_001);
    });
    expect(container.textContent).not.toBe(before);
    expect(api.rpc.mock.calls.length).toBe(calls);
    const next = container.textContent;
    fireEvent.focus(screen.getByRole("button", { name: /Ver fluxo de / }));
    act(() => {
      vi.advanceTimersByTime(20_000);
    });
    expect(container.textContent).toBe(next);
    fireEvent.click(screen.getByRole("button", { name: /Ver fluxo de / }));
    expect(open).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("status")).toHaveTextContent(""); // automatic changes are silent
  });
  it("does not interpret a failed RPC as an observed zero", async () => {
    api.rpc.mockReturnValue({
      abortSignal: () =>
        Promise.resolve({
          data: null,
          error: { message: "MAP_PERMISSION_DENIED", code: "42501" },
        }),
    });
    render(wrap(<CommercialCashflowPreview scope="scope" onOpen={vi.fn()} />));
    await waitFor(() =>
      expect(
        client.getQueryData([
          "commercial-sale-orders",
          sample.projectId,
          "analytics",
          "test-org",
        ]),
      ).toEqual({ data: null, restricted: true }),
    );
    expect(screen.queryByText("R$ 0,00")).not.toBeInTheDocument();
  });
  it("changes the complete month/value pair locally, announces manual changes and keeps pause on unmount", async () => {
    vi.useFakeTimers();
    const { container, unmount } = render(wrap(<CommercialCashflowPreview scope="compact" onOpen={vi.fn()} />));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    const pair = () => container.querySelector(".commercial-dashboard-cashflow-preview__transition")?.textContent;
    const previous = pair(), calls = api.rpc.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: "Próximo mês da prévia" }));
    expect(pair()).not.toBe(previous);
    expect(screen.getByRole("status")).toHaveTextContent(/R\$/);
    fireEvent.click(screen.getByRole("button", { name: "Pausar prévia mensal" }));
    const paused = pair();
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(pair()).toBe(paused);
    expect(api.rpc.mock.calls.length).toBe(calls);
    unmount();
    act(() => { vi.advanceTimersByTime(20_000); });
    expect(api.rpc.mock.calls.length).toBe(calls);
  });
  it("shows signature only inside sales summary, exposes its own sample in info and restores focus and scroll", async () => {
    const scroll = document.createElement('div');
    render(<QueryClientProvider client={client}><CommercialDashboard
      data={{ lots: [], entities: [] }} projectId={sample.projectId} orgId="test-org" dataUpdatedAt={1}
      isFetching={false} canManageSales onClose={vi.fn()} onViewLot={vi.fn()} onViewSale={vi.fn()}
      scrollContainer={() => scroll} /></QueryClientProvider>);
    const entry = await screen.findByRole('button', { name: 'Ver detalhamento de assinatura' });
    const summary = screen.getByRole('region', { name: 'Vendas e contratos' });
    expect(summary).toContainElement(entry);
    expect(screen.getAllByText('Tempo médio de assinatura')).toHaveLength(1);
    for (const label of ['Registros de venda', 'Aguardando assinatura', 'Assinatura confirmada']) expect(within(summary).getByText(label)).toBeVisible();
    fireEvent.click(within(summary).getByRole('button', { name: 'Como é calculado o tempo médio de assinatura' }));
    expect(screen.getByText(`Calculado com ${sample.signature.count} vendas`)).toBeVisible();
    fireEvent.keyDown(within(summary).getByRole('button', { name: 'Como é calculado o tempo médio de assinatura' }), { key: 'Escape' });
    scroll.scrollTop = 360;
    fireEvent.click(entry);
    expect(await screen.findByRole('heading', { name: 'Tempo médio de assinatura' })).toBeInTheDocument();
    expect(scroll.scrollTop).toBe(0);
    fireEvent.click(screen.getByRole('button', { name: 'Voltar à visão geral' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Ver detalhamento de assinatura' })).toHaveFocus());
    expect(scroll.scrollTop).toBe(360);
  });
  it("keeps restricted and insufficient signature history explicit without granting details", async () => {
    const { unmount } = render(<SignatureLatencyInline onOpen={vi.fn()} />);
    expect(screen.getByText('Acesso restrito à gestão de vendas')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Ver detalhamento de assinatura' })).toBeNull();
    unmount();
    const noHistory = clone(); noHistory.signature = { count: 0, averageSeconds: null, exclusions: {} };
    api.rpc.mockReturnValue({ abortSignal: () => Promise.resolve({ data: noHistory, error: null }) });
    render(wrap(<SignatureLatencyInline onOpen={vi.fn()} />));
    expect(await screen.findByText('Sem histórico suficiente')).toBeVisible();
    expect(screen.getByText('—')).toBeVisible();
    expect(screen.queryByText('0 min')).toBeNull();
  });
});
