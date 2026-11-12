import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { CatalogPage } from "./CatalogPage";
import { DirectoryPage } from "./DirectoryPage";
import { ImportStagingPage } from "./ImportStagingPage";
import { ProductDetailPage } from "./ProductDetailPage";
import { PurchaseDetailPage } from "./PurchaseDetailPage";
import { PurchasesPage } from "./PurchasesPage";
import { StockPage } from "./StockPage";
import "../soja-store.css";

export default function SojaStorePage({ section, commissionId, detailId, access }: {
  section: "produtos" | "fornecedores" | "configuracoes" | "estoque" | "compras" | "importacoes";
  commissionId: string;
  detailId?: string;
  access: SojaStoreAccess;
}) {
  const { orgId } = useCurrentOrg();
  const { user } = useAuth();
  if (!orgId || !user) return null;

  const scope = { _org_id: orgId, _commission_id: commissionId };
  const capabilityKey = [...access.capabilities].sort().join(",");
  const queryKey = ["soja-store", user.id, orgId, commissionId, capabilityKey] as const;
  const canManage = access.capabilities.includes("catalog.manage");
  const canManagePurchases = access.capabilities.includes("purchases.manage");

  return (
    <div className="ss-page grid gap-4" key={queryKey.join(":")}>
      {section === "produtos" ? detailId ? (
        <ProductDetailPage scope={scope} queryKey={queryKey} canManage={canManage} id={detailId} access={access} />
      ) : (
        <CatalogPage scope={scope} queryKey={queryKey} canManage={canManage} />
      ) : section === "estoque" ? (
        <StockPage scope={scope} queryKey={queryKey} access={access} />
      ) : section === "compras" ? detailId ? (
        <PurchaseDetailPage
          scope={scope}
          queryKey={queryKey}
          id={detailId}
          canManage={canManagePurchases}
          canReceive={canManagePurchases || access.capabilities.includes("purchases.receive")}
          canViewStock={access.capabilities.includes("stock.view")}
        />
      ) : (
        <PurchasesPage scope={scope} queryKey={queryKey} canManage={canManagePurchases} />
      ) : section === "fornecedores" ? (
        <DirectoryPage kind="suppliers" scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("suppliers.manage")} />
      ) : section === "configuracoes" ? (
        <DirectoryPage kind="locations" scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("settings.manage")} />
      ) : <ImportStagingPage scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("imports.manage")} />}
    </div>
  );
}
