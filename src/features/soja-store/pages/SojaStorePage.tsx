import { useAuth } from "@/hooks/useAuth";
import { useCurrentOrg } from "@/hooks/useCurrentOrg";
import type { SojaStoreAccess } from "../hooks/useSojaStoreAccess";
import { CatalogPage } from "./CatalogPage";
import { DirectoryPage } from "./DirectoryPage";
import { ProductDetailPage } from "./ProductDetailPage";
import { PurchaseDetailPage } from "./PurchaseDetailPage";
import { PurchasesPage } from "./PurchasesPage";
import { StockPage } from "./StockPage";
import { CustomersPage } from "./customers/CustomersPage";
import { CashPage } from "./pos/CashPage";
import { PosRulePanel } from "./pos/PosRulePanel";
import { FinancePage } from "./finance/FinancePage";
import { SalesPage } from "./sales/SalesPage";
import type { SojaStoreSection } from "../navigation";
import "../soja-store.css";

export default function SojaStorePage({ section, commissionId, detailId, access }: {
  section: SojaStoreSection;
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
  const creating = detailId === "novo";

  return (
    <div className="ss-page grid gap-3" key={queryKey.join(":")}>
      {section === "produtos" ? detailId && !creating ? (
        <ProductDetailPage scope={scope} queryKey={queryKey} canManage={canManage} id={detailId} access={access} />
      ) : (
        <CatalogPage scope={scope} queryKey={queryKey} canManage={canManage} initialCreate={creating} />
      ) : section === "estoque" ? (
        <StockPage scope={scope} queryKey={queryKey} access={access} />
      ) : section === "caixa" ? (
        <CashPage scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("cash.manage")}
          canViewSettings={access.capabilities.includes("settings.view")} />
      ) : section === "vendas" ? (
        <SalesPage scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("sales.manage")}
          reservationFlow={access.capabilities.includes("sales.fulfillment")} />
      ) : section === "compras" ? detailId && !creating ? (
        <PurchaseDetailPage
          scope={scope}
          queryKey={queryKey}
          id={detailId}
          canReceive={canManagePurchases || access.capabilities.includes("purchases.receive")}
          canViewStock={access.capabilities.includes("stock.view")}
        />
      ) : (
        <PurchasesPage scope={scope} queryKey={queryKey} canManage={canManagePurchases} initialCreate={creating}
          canViewCosts={canManagePurchases || access.capabilities.includes("purchases.costs")}
          canViewQuotes={access.capabilities.includes("purchases.costs")} />
      ) : section === "fornecedores" ? (
        <DirectoryPage kind="suppliers" scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("suppliers.manage")} />
      ) : section === "clientes" ? (
        <CustomersPage scope={scope} queryKey={queryKey} detailId={detailId} canManage={access.capabilities.includes("customers.manage")}
          canReadCatalog={access.capabilities.includes("catalog.view")}
          canReadSales={access.capabilities.includes("customers.history") && access.capabilities.includes("sales.view")} />
      ) : section === "financeiro" ? (
        <FinancePage scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("finance.manage")} />
      ) : (
        <>
          <DirectoryPage kind="locations" scope={scope} queryKey={queryKey} canManage={access.capabilities.includes("settings.manage")} />
          {access.capabilities.includes("sales.manage") && <PosRulePanel scope={scope} queryKey={queryKey} canManage />}
        </>
      )}
    </div>
  );
}
