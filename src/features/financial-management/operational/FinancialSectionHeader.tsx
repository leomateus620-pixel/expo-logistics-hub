import type { ReactNode } from "react";
import { ReceiptText, TrendingUp } from "lucide-react";
import "@/styles/financial-section-header.css";

/** Identity and query controls share one React surface. Only decoration is clipped. */
export function FinancialSectionHeader({
  kind,
  tools,
  context,
}: {
  kind: "revenue" | "expenses";
  tools?: ReactNode;
  context: ReactNode;
}) {
  const Icon = kind === "revenue" ? TrendingUp : ReceiptText;
  return (
    <header className="f28-section-header" data-menu={kind}>
      <div className="f28-section-header__decoration" aria-hidden="true">
        <Icon className="f28-section-header__art" />
        <Icon className="f28-section-header__art-secondary" />
      </div>
      <div className="f28-section-header__identity">
        <span className="f28-section-header__mark" aria-hidden="true">
          <Icon />
        </span>
        <div>
          <h1>{kind === "revenue" ? "Receitas" : "Despesas"}</h1>
          <span className="f28-section-header__edition">
            FENASOJA <strong>2028</strong>
          </span>
        </div>
      </div>
      {tools && <div className="f28-section-header__tools">{tools}</div>}
      <div className="f28-section-header__context">{context}</div>
    </header>
  );
}
