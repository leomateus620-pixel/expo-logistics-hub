// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  EventoAnexosSection,
  SOYBEAN_ANIMATION_DURATION_MS,
} from "@/components/cronograma-eventos/EventoAnexosSection";
import type { EventoAnexo } from "@/hooks/useEventoAnexos";

const mocks = vi.hoisted(() => ({
  attachmentHook: vi.fn(),
  authHook: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/hooks/useEventoAnexos", () => ({
  useEventoAnexos: mocks.attachmentHook,
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: mocks.authHook,
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mocks.toast }),
}));

const upload = vi.fn();
const remove = vi.fn();
const getSignedUrl = vi.fn();

function attachmentHookValue(overrides: Record<string, unknown> = {}) {
  return {
    anexos: [],
    isLoading: false,
    upload,
    uploading: false,
    remove,
    removing: false,
    getSignedUrl,
    ...overrides,
  };
}

function attachment(overrides: Partial<EventoAnexo> = {}): EventoAnexo {
  return {
    id: "attachment-1",
    event_id: "event-1",
    org_id: "org-1",
    uploaded_by: "user-1",
    uploader_name: "Elton Walker",
    file_name: "registro-do-evento.pdf",
    file_path: "org-1/event-1/registro-do-evento.pdf",
    mime_type: "application/pdf",
    size_bytes: 1_572_864,
    kind: "documento",
    caption: null,
    created_at: "2026-07-28T14:50:00.000Z",
    updated_at: "2026-07-28T14:50:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  upload.mockResolvedValue(attachment());
  remove.mockResolvedValue("attachment-1");
  getSignedUrl.mockResolvedValue("https://example.test/signed-file");
  mocks.authHook.mockReturnValue({ user: { id: "user-1" } });
  mocks.attachmentHook.mockReturnValue(attachmentHookValue());
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("Anexos e fotos", () => {
  it("integra orientação, ação e estado vazio em uma única região acessível", () => {
    render(<EventoAnexosSection eventId="event-1" />);

    const region = screen.getByRole("region", { name: "Anexos" });
    expect(
      within(region).getByText("Imagens, PDF, Word, Excel ou TXT"),
    ).toBeVisible();
    expect(within(region).getByText("Até 20 MB por arquivo")).toBeVisible();
    expect(
      within(region).getByText("Nenhum anexo enviado"),
    ).toBeVisible();
    expect(within(region).queryByRole("status")).not.toBeInTheDocument();

    const action = within(region).getByRole("button", {
      name: "Anexar arquivo",
    });
    action.focus();
    expect(action).toHaveFocus();
    expect(action).toHaveAttribute("aria-describedby");
  });

  it("abre o seletor imediatamente e mantém uma única camada de soja por exatamente 1,3 segundo", () => {
    vi.useFakeTimers();
    const inputClick = vi
      .spyOn(HTMLInputElement.prototype, "click")
      .mockImplementation(() => undefined);
    render(<EventoAnexosSection eventId="event-1" />);

    const action = screen.getByRole("button", { name: "Anexar arquivo" });
    fireEvent.click(action);

    expect(inputClick).toHaveBeenCalledTimes(1);
    const burst = screen.getByTestId("soybean-burst");
    expect(
      burst.querySelectorAll(".cronograma-attachments__soybean-flight"),
    ).toHaveLength(8);
    expect(action).toHaveAttribute("data-soy-active", "true");

    fireEvent.click(action);
    expect(inputClick).toHaveBeenCalledTimes(2);
    expect(screen.getAllByTestId("soybean-burst")).toHaveLength(1);

    act(() => vi.advanceTimersByTime(SOYBEAN_ANIMATION_DURATION_MS - 1));
    expect(screen.getByTestId("soybean-burst")).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.queryByTestId("soybean-burst")).not.toBeInTheDocument();
    expect(action).toHaveAttribute("data-soy-active", "false");

    inputClick.mockRestore();
  });

  it("anuncia o envio real e confirma sucesso sem substituir permanentemente a ação", async () => {
    render(<EventoAnexosSection eventId="event-1" />);
    const file = new File(["conteúdo"], "evidencia.pdf", {
      type: "application/pdf",
    });

    fireEvent.change(screen.getByLabelText("Selecionar arquivos para anexar"), {
      target: { files: [file] },
    });

    await waitFor(() => expect(upload).toHaveBeenCalledWith(file));
    expect(await screen.findByRole("status")).toHaveTextContent(
      "Arquivo anexado.",
    );
    expect(
      screen.getByRole("button", { name: "Anexar arquivo" }),
    ).toBeEnabled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Arquivo anexado",
      }),
    );
  });

  it("mantém o nome selecionado no erro e oferece nova tentativa", async () => {
    upload.mockRejectedValueOnce(new Error("Arquivo excede 20 MB"));
    render(<EventoAnexosSection eventId="event-1" />);
    const file = new File(["conteúdo"], "foto-da-montagem.jpg", {
      type: "image/jpeg",
    });

    fireEvent.change(screen.getByLabelText("Selecionar arquivos para anexar"), {
      target: { files: [file] },
    });

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(
      "Falha em foto-da-montagem.jpg: Arquivo excede 20 MB",
    );
    expect(
      screen.getByRole("button", { name: "Tentar novamente" }),
    ).toBeEnabled();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Falha ao anexar",
        variant: "destructive",
      }),
    );
  });

  it("mostra envio bloqueado com texto explícito quando não há sessão", () => {
    mocks.authHook.mockReturnValue({ user: null });
    render(<EventoAnexosSection eventId="event-1" />);

    expect(
      screen.getByRole("button", { name: "Acesso necessário" }),
    ).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Faça login para anexar arquivos a este evento.",
    );
  });

  it("organiza arquivos preenchidos com metadados, truncamento seguro e ações contextuais", async () => {
    const longName =
      "registro-fotografico-da-montagem-do-espaco-do-automovel-com-nome-muito-longo-para-o-drawer.jpg";
    const photo = attachment({
      id: "photo-1",
      file_name: longName,
      file_path: `org-1/event-1/${longName}`,
      mime_type: "image/jpeg",
      size_bytes: 842_120,
      kind: "foto",
    });
    const document = attachment({
      id: "document-1",
      uploaded_by: "user-2",
      uploader_name: "Comissão Central",
      file_name: "planilha-de-conferência.xlsx",
      mime_type:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      size_bytes: 2_097_152,
    });
    mocks.attachmentHook.mockReturnValue(
      attachmentHookValue({ anexos: [photo, document] }),
    );

    render(<EventoAnexosSection eventId="event-1" />);

    expect(screen.getByLabelText("2 anexos")).toBeVisible();
    expect(screen.getByText(longName)).toHaveAttribute("title", longName);
    expect(screen.getByText("Excel")).toBeVisible();
    expect(screen.getByText("2.0 MB")).toBeVisible();
    expect(screen.getByText("Comissão Central")).toBeVisible();
    expect(
      screen.getByRole("button", { name: `Ações para ${longName}` }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", {
        name: "Ações para planilha-de-conferência.xlsx",
      }),
    ).toBeVisible();
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: `Visualizar ${longName}` }),
      ).toBeEnabled(),
    );
  });

  it("abre a imagem em um diálogo de viewport, move o foco e fecha com Escape", async () => {
    const photo = attachment({
      id: "photo-1",
      file_name: "registro-fotografico.jpg",
      file_path: "org-1/event-1/registro-fotografico.jpg",
      mime_type: "image/jpeg",
      kind: "foto",
    });
    mocks.attachmentHook.mockReturnValue(
      attachmentHookValue({ anexos: [photo] }),
    );

    render(<EventoAnexosSection eventId="event-1" />);

    const preview = screen.getByRole("button", {
      name: "Visualizar registro-fotografico.jpg",
    });
    await waitFor(() => expect(preview).toBeEnabled());
    preview.focus();
    fireEvent.click(preview);

    const dialog = await screen.findByRole("dialog", {
      name: "Visualização de registro-fotografico.jpg",
    });
    const close = within(dialog).getByRole("button", {
      name: "Fechar visualização",
    });
    await waitFor(() => expect(close).toHaveFocus());
    fireEvent.keyDown(document, { key: "Escape", code: "Escape" });

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", {
          name: "Visualização de registro-fotografico.jpg",
        }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() => expect(preview).toHaveFocus());
  });

  it("expõe carregamento e upload em andamento sem alterar as dimensões da ação", () => {
    mocks.attachmentHook.mockReturnValue(
      attachmentHookValue({
        isLoading: true,
        uploading: true,
      }),
    );
    render(<EventoAnexosSection eventId="event-1" />);

    const action = screen.getByRole("button", { name: "Enviando…" });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("status")).toHaveTextContent("Enviando arquivo…");
    expect(screen.getByLabelText("Carregando anexos")).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("mantém contrato leve, responsivo e compatível com movimento reduzido", () => {
    const css = readFileSync("src/styles/cronograma-attachments.css", "utf8");

    expect(SOYBEAN_ANIMATION_DURATION_MS).toBe(1_300);
    expect(css).toContain(
      "animation: cronograma-attachment-soybean-cross 920ms",
    );
    expect(css).toContain("translate3d(calc(100cqw + 3.2rem)");
    expect(css).toContain("will-change: transform, opacity");
    expect(css).toContain("@media (max-width: 639px)");
    expect(css).toContain("width: 100%");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).toContain("animation: none !important");
    expect(css).toContain("opacity: 0.68");
    expect(css).not.toContain("cronograma-attachment-reduced-confirm");
  });
});
