import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import LoginPage from "@/pages/LoginPage";

const authMocks = vi.hoisted(() => ({
  signIn: vi.fn(),
}));

vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({
    signIn: authMocks.signIn,
    user: null,
    loading: false,
  }),
}));

function LocationMarker() {
  const location = useLocation();
  return (
    <output data-testid="current-location">{`${location.pathname}${location.search}`}</output>
  );
}

function renderLogin(path = "/login/cronograma-eventos") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/login/:moduleSlug"
          element={
            <>
              <LoginPage />
              <LocationMarker />
            </>
          }
        />
        <Route path="*" element={<LocationMarker />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("experiência de autenticação Fenasoja 2028", () => {
  beforeEach(() => {
    authMocks.signIn.mockReset();
    localStorage.clear();
  });

  it("apresenta o hero simplificado, o título correto e o ciclo estratégico", () => {
    renderLogin();

    const heroBrand = screen.getByRole("img", {
      name: "Fenasoja 2028, Planejamento institucional",
    });

    expect(heroBrand).toBeInTheDocument();
    expect(
      heroBrand.querySelector(".fenasoja-brand__edition"),
    ).not.toBeInTheDocument();
    expect(
      screen
        .getByRole("img", { name: "Fenasoja 2028, Acesso ao sistema" })
        .querySelector(".fenasoja-brand__edition"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Planejamento da Fenasoja 2028" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "Ciclo estratégico de 2026 a 2028, com foco atual em 2028",
      }),
    ).toBeInTheDocument();

    expect(screen.queryByText("Acesso protegido")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Capacidades do ambiente"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Calendário estratégico"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Linha do tempo")).not.toBeInTheDocument();
    expect(screen.queryByText("Reuniões centrais")).not.toBeInTheDocument();
    expect(screen.queryByText("Decisões do ciclo")).not.toBeInTheDocument();
  });

  it("mantém o e-mail real em minúsculas apesar do tratamento visual em maiúsculas", () => {
    renderLogin();

    const email = screen.getByLabelText("E-mail");
    fireEvent.change(email, { target: { value: "usuario@fenasoja.com.br" } });

    expect(email).toHaveValue("usuario@fenasoja.com.br");
    expect(email.closest('[data-field="email"]')).toBeInTheDocument();
  });

  it("expõe validação local próxima aos campos sem chamar a autenticação", () => {
    renderLogin();

    fireEvent.click(screen.getByRole("button", { name: "Entrar no sistema" }));

    expect(screen.getByText("Informe seu e-mail.")).toBeInTheDocument();
    expect(screen.getByText("Informe sua senha.")).toBeInTheDocument();
    expect(screen.getAllByRole("alert")).toHaveLength(2);
    expect(screen.getByLabelText("E-mail")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("Senha")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(screen.getByLabelText("E-mail")).toHaveFocus();
    expect(authMocks.signIn).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "email-invalido" },
    });
    expect(screen.getByText("Digite um e-mail válido.")).toBeInTheDocument();
  });

  it("direciona o foco ao primeiro campo ainda inválido", () => {
    renderLogin();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@fenasoja.com.br" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no sistema" }));

    expect(screen.getByLabelText("Senha")).toHaveFocus();
    expect(authMocks.signIn).not.toHaveBeenCalled();
  });

  it("oferece visibilidade de senha com nome e estado acessíveis", () => {
    renderLogin();

    const password = screen.getByLabelText("Senha");
    const toggle = screen.getByRole("button", { name: "Mostrar senha" });

    expect(password).toHaveAttribute("type", "password");
    expect(toggle).toHaveAttribute("aria-pressed", "false");

    fireEvent.click(toggle);

    expect(password).toHaveAttribute("type", "text");
    expect(
      screen.getByRole("button", { name: "Ocultar senha" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("mantém a autenticação real e apresenta o erro retornado sem alterar o destino", async () => {
    authMocks.signIn.mockResolvedValue({
      error: new Error("invalid credentials"),
    });
    renderLogin();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@fenasoja.com.br" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no sistema" }));

    await waitFor(() => {
      expect(authMocks.signIn).toHaveBeenCalledWith(
        "usuario@fenasoja.com.br",
        "senha-segura",
      );
    });

    expect(screen.getByRole("alert")).toHaveTextContent(
      "E-mail ou senha incorretos. Confira suas credenciais e tente novamente.",
    );
    expect(screen.getByTestId("current-location")).toHaveTextContent(
      "/login/cronograma-eventos",
    );
    expect(
      screen.getByRole("button", { name: "Entrar no sistema" }),
    ).toBeEnabled();
  });

  it("preserva o redirect do módulo após autenticação bem-sucedida", async () => {
    authMocks.signIn.mockResolvedValue({ error: null });
    renderLogin();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@fenasoja.com.br" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no sistema" }));

    expect(
      await screen.findByRole("button", { name: "Acesso confirmado" }),
    ).toBeDisabled();
    expect(
      screen.getByText(
        "Acesso confirmado. Redirecionando para o ambiente selecionado.",
      ),
    ).toHaveAttribute("role", "status");

    await waitFor(
      () => {
        expect(screen.getByTestId("current-location")).toHaveTextContent(
          "/cronograma-eventos",
        );
      },
      { timeout: 1_500 },
    );
  });

  it("contextualiza e preserva o destino independente de Restaurante e Arena", async () => {
    authMocks.signIn.mockResolvedValue({ error: null });
    renderLogin("/login/eventos-restaurante-arena");

    expect(
      screen.getByRole("heading", {
        name: /Gestão operacional do Restaurante e da Arena/i,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Eventos Restaurante e Arena").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Conflitos em tempo real")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@fenasoja.com.br" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no sistema" }));

    await waitFor(
      () => {
        expect(screen.getByTestId("current-location")).toHaveTextContent(
          "/eventos-restaurante-arena",
        );
      },
      { timeout: 1_500 },
    );
  });

  it("apresenta o acesso do Mapa Comercial sem capacidades ou linguagem da Logística", () => {
    renderLogin("/login/mapa-comercial");

    expect(
      screen.getByRole("heading", { name: "Mapa Comercial" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Gestão visual dos espaços, lotes e disponibilidade do parque.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("E-mail")).toBeInTheDocument();
    expect(screen.getByLabelText("Senha")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Entrar no sistema" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Voltar ao portal" }),
    ).toHaveAttribute("href", "/portal");

    expect(screen.queryByText("Acesso protegido")).not.toBeInTheDocument();
    expect(screen.queryByText("Capacidades do ambiente")).not.toBeInTheDocument();
    expect(screen.queryByText("Módulo selecionado")).not.toBeInTheDocument();
    expect(screen.queryByText("Acesso restrito")).not.toBeInTheDocument();
    expect(screen.queryByText("Parque mapeado")).not.toBeInTheDocument();
    expect(screen.queryByText("Estruturas oficiais")).not.toBeInTheDocument();
    expect(screen.queryByText("Disponibilidade")).not.toBeInTheDocument();
    expect(screen.queryByText("Situação comercial")).not.toBeInTheDocument();
    expect(screen.queryByText("Contratos")).not.toBeInTheDocument();
    expect(screen.queryByText("Histórico conectado")).not.toBeInTheDocument();
    expect(screen.queryByText("Acesso controlado")).not.toBeInTheDocument();
    expect(screen.queryByText("Perfis e permissões")).not.toBeInTheDocument();
  });

  it("preserva o redirect dedicado do Mapa Comercial após autenticação", async () => {
    authMocks.signIn.mockResolvedValue({ error: null });
    renderLogin("/login/mapa-comercial");

    fireEvent.change(screen.getByLabelText("E-mail"), {
      target: { value: "usuario@fenasoja.com.br" },
    });
    fireEvent.change(screen.getByLabelText("Senha"), {
      target: { value: "senha-segura" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Entrar no sistema" }));

    await waitFor(
      () => {
        expect(screen.getByTestId("current-location")).toHaveTextContent(
          "/mapa-comercial",
        );
      },
      { timeout: 1_500 },
    );
  });
});
