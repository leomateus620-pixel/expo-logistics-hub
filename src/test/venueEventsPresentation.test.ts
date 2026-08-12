import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const workspace = read(
  "src/components/venue-events/VenueWorkspace.tsx",
);
const form = read(
  "src/components/venue-events/VenueEventFormDialog.tsx",
);
const managementDialogs = read(
  "src/components/venue-events/VenueManagementDialogs.tsx",
);
const agreementCard = read(
  "src/components/venue-events/VenueAgreementCard.tsx",
);
const productionCss = read("src/styles/venue-events-production.css");
const switcher = read("src/components/venue-events/VenueWorkspaceSwitcher.tsx");
const app = read("src/App.tsx");

describe("contrato de apresentação de Eventos Restaurante e Arena", () => {
  it("preserva a rota canônica e aplica a camada visual somente ao módulo", () => {
    expect(app).toContain(
      '<Route path="/eventos-restaurante-arena" element={<VenueEventsModuleRoute />} />',
    );
    expect(workspace).toContain(
      'import "@/styles/venue-events-production.css";',
    );
    expect(productionCss).not.toMatch(/(^|\n)\s*:root\s*\{/);
    expect(productionCss).toContain(".venue-workspace,");
    expect(productionCss).toContain(".venue-event-form-dialog,");
  });

  it("organiza a navegação em planejamento, gestão e controle", () => {
    expect(workspace).toContain('{ id: "planejamento", label: "Planejamento" }');
    expect(workspace).toContain('{ id: "gestao", label: "Gestão" }');
    expect(workspace).toContain('{ id: "controle", label: "Controle" }');
    expect(workspace).toContain('className="venue-desktop-nav__group"');
  });

  it("exibe o seletor de workspaces em duas metades sem ações do hero", () => {
    expect(productionCss).toContain("grid-template-columns: 1fr 1fr");
    expect(switcher).not.toContain("{description}");
    expect(switcher).not.toContain("<small>");
    expect(workspace).not.toContain("venue-command-hero__actions");
    expect(workspace).not.toContain("venue-command-hero__context");
  });

  it("mantém o formulário sólido, com uma única rolagem e rodapé estável", () => {
    expect(productionCss).toContain(
      "grid-template-rows: auto auto minmax(0, 1fr) auto;",
    );
    expect(productionCss).toContain("background: var(--venue-surface) !important;");
    expect(productionCss).toContain(".venue-event-form__body,");
    expect(productionCss).toContain("overflow-y: auto;");
    expect(productionCss).toContain(".venue-supporting-team > div");
    expect(productionCss).toContain("max-height: none;");
    expect(managementDialogs).toContain("venue-agreement-dialog__actions");
    expect(managementDialogs).toContain("venue-dialog-scroll venue-agreement-form");
  });

  it("organiza a edição contratual sem etapas e preserva todos os grupos", () => {
    expect(managementDialogs).toContain(">Identificação</h3>");
    expect(managementDialogs).toContain(">Condições</h3>");
    expect(managementDialogs).toContain(">Vigência</h3>");
    expect(managementDialogs).toContain(">Tipos de evento permitidos</span>");
    expect(managementDialogs).toContain(">Regras e governança</h3>");
    expect(managementDialogs).toContain("venue-agreement-restrictions");
    expect(managementDialogs).toContain("venue-agreement-notes");
    expect(managementDialogs).toContain("venue-agreement-approver");
    expect(managementDialogs).toContain("venue-agreement-requires-approval");
    expect(managementDialogs).toContain("venue-agreement-no-show");
    expect(managementDialogs).not.toContain("USO_ESPACO");
  });

  it("usa progresso segmentado acessível e estados de edição precisos", () => {
    expect(agreementCard).toContain('role="progressbar"');
    expect(agreementCard).toContain('data-segment="consumed"');
    expect(agreementCard).toContain('data-segment="reserved"');
    expect(agreementCard).toContain('data-segment="available"');
    expect(agreementCard).toContain("aria-valuetext={progressDescription}");
    expect(agreementCard).toContain('aria-haspopup="dialog"');
    expect(agreementCard).toContain("aria-expanded={selected}");
    expect(productionCss).toContain("@keyframes venue-agreement-progress-reveal");
    expect(productionCss).toContain("venue-agreement-card--premium[data-selected");
  });

  it("torna o modal tela cheia em celulares e evita zoom dos campos", () => {
    expect(productionCss).toMatch(
      /@media \(min-width: 641px\) and \(max-width: 1120px\)[\s\S]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/,
    );
    expect(productionCss).toMatch(/@media \(max-width: 640px\)[\s\S]*height: 100dvh !important;/);
    expect(productionCss).toMatch(/@media \(max-width: 640px\)[\s\S]*font-size: 16px;/);
    expect(productionCss).toContain("env(safe-area-inset-bottom)");
    expect(productionCss).toContain("env(safe-area-inset-left)");
    expect(productionCss).toContain("env(safe-area-inset-right)");
    expect(productionCss).toMatch(
      /@media \(max-width: 640px\)[\s\S]*\.venue-management-dialog--agreement[\s\S]*height: 100dvh !important;/,
    );
  });

  it("expõe etapas, obrigatoriedade e foco de contexto para tecnologias assistivas", () => {
    expect(form).toContain('aria-current={index === step ? "step" : undefined}');
    expect(form).toContain("const REQUIRED_FIELDS");
    expect(form).toContain('isRequired ? "Obrigatório" : "Opcional"');
    expect(form).toContain('data-step={step + 1}');
    expect(form).toContain('querySelector<HTMLElement>(".venue-form-section__intro h3")');
    expect(form).toContain("?.focus({ preventScroll: true })");
  });

  it("mantém o registro mestre limpo, com anos do ciclo e histórico opcional", () => {
    expect(workspace).toContain("venue-events-registry__scope");
    expect(workspace).toContain("<VenueEventsYearSelector");
    expect(workspace).toContain("<VenueEventsFiltersTrigger");
    expect(workspace).toContain('const CYCLE_YEARS = ["2026", "2027", "2028"]');
    expect(workspace).toContain("venue-event-card");
    expect(workspace).not.toContain("venue-filter-bar--agenda");
    expect(read("src/components/venue-events/VenueModuleShell.tsx")).not.toContain(
      "venue-module-shell__organization",
    );
  });

  it("limita movimento a interações intencionais e respeita preferências do sistema", () => {

    expect(productionCss).not.toMatch(/transition\s*:\s*all/);
    expect(productionCss).toContain("@media (hover: hover) and (pointer: fine)");
    expect(productionCss).toContain("@media (prefers-reduced-motion: reduce)");
    expect(productionCss).toContain("@media (prefers-reduced-transparency: reduce)");
    expect(productionCss).toContain("@media (prefers-contrast: more)");
    expect(productionCss).toContain("@media (forced-colors: active)");
  });
});
