import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CommercialDashboard } from "@/features/commercial-map/dashboard/CommercialDashboard";
import { OFFICIAL_REFERENCE_DATA } from "@/features/commercial-map/data/officialReference2026";
import type { CommercialLot, MapEntity } from "@/features/commercial-map/types";
import "@/index.css";
import { CommercialDashboard as BaselineDashboard } from "./.baseline";
const client = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});
const Dashboard = new URLSearchParams(window.location.search).has("baseline")
  ? BaselineDashboard
  : CommercialDashboard;
function Review() {
  const [viewport, setViewport] = useState("");
  useEffect(() => {
    const update = () =>
      setViewport(
        `layout ${window.innerWidth} · viewport ${Math.round(window.visualViewport?.width ?? 0)} · zoom ${window.visualViewport?.scale ?? 1} · documento ${document.documentElement.scrollWidth}`,
      );
    const timer = window.setInterval(update, 1000);
    update();
    return () => window.clearInterval(timer);
  }, []);
  const container = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<Awaited<
    ReturnType<typeof inventory>
  > | null>(null);
  const [updatedAt, setUpdatedAt] = useState(0);
  async function inventory() {
    const raw = await fetch("/isolated/inventory").then((r) => r.json());
    const base = OFFICIAL_REFERENCE_DATA;
    const lots: CommercialLot[] = raw.lots.map(
      (r: Record<string, unknown>, i: number) => ({
        ...base.lots[i],
        id: r.id,
        entityId: base.lots[i].entityId,
        projectId: raw.projectId,
        publicIdentifier: r.public_identifier,
        status: r.status,
        officialAreaSqm: Number(r.official_area_sqm),
        sales: [
          {
            id: r.sale_id,
            lotId: r.id,
            status: r.sale_status,
            negotiatedValue: Number(r.negotiated_value),
          },
        ],
      }),
    );
    const entities: MapEntity[] = base.entities.map((e) => ({
      ...e,
      projectId: raw.projectId,
    }));
    return { ...raw, data: { lots, entities } };
  }
  useEffect(() => {
    void inventory().then((d) => {
      setData(d);
      setUpdatedAt(Date.now());
    });
  }, []);
  return (
    <div
      ref={container}
      style={{ height: "100dvh", overflow: "auto", background: "#f4f7f2" }}
    >
      <div
        style={{
          padding: "5px 18px",
          overflowWrap: "anywhere",
          fontSize: 11,
          color: "#5b6b62",
        }}
      >
        Ambiente local · dados fictícios persistidos em PostgreSQL isolado
        <br />
        {viewport}
      </div>
      {data && (
        <Dashboard
          data={data.data}
          projectId={data.projectId}
          orgId={data.orgId}
          dataUpdatedAt={updatedAt}
          inventoryRevision={data.revision}
          isFetching={false}
          canManageSales
          canManageContracts={false}
          onClose={() => {}}
          onViewLot={() => {}}
          onViewSale={() => {}}
          scrollContainer={() => container.current}
        />
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={client}>
    <Review />
  </QueryClientProvider>,
);
