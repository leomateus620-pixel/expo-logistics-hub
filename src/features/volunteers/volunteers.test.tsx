import {
  render,
  screen,
  waitFor,
  cleanup,
  fireEvent,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VolunteerForm } from "./VolunteerForm";
import { VolunteerTeamView } from "./VolunteerTeam";
import { teamUnitForSlug, withTeamMenu } from "./teamRoutes";
import {
  buildInstitutionalPersonOptions,
  responsibleLinksToSelections,
  selectionsToResponsibleLinks,
  reconcileResponsibleSelections,
} from "@/components/cronograma-eventos/useCronogramaRelationOptions";
import { PersonAvatar } from "@/components/cronograma-eventos/PersonAvatar";
import type { OrgUnit } from "@/lib/org-units";
import { officialUnitResolutions } from "@/modules/commissions/officialCommissionCatalog";
import { buildOrganizationalGraph } from "@/features/alvorada/organizational/resolver";
import { OrganizationalEcosystem } from "@/features/alvorada/organizational/components/OrganizationalEcosystem";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
const unit = (id: string, slug: string, name = slug): OrgUnit => ({
  id,
  slug,
  name,
  type: "comissao",
  displayOrder: 1,
  isOfficial: true,
  isLegacy: false,
  responsibles: [],
});
const person = (id: string, userId: string | null = null) => ({
  id: `membership-${id}`,
  personId: id,
  userId,
  displayName: "Maria Oliveira",
  responsibleType: "pessoa" as const,
  relationshipRole: "equipe_apoio" as const,
  isPrimary: false,
  legacyPhoto: false,
});
const baseProps = () => ({
  unitName: "Soja Store",
  onClose: vi.fn(),
  onSaved: vi.fn(),
  save: vi
    .fn()
    .mockResolvedValue({ person_id: "p1", membership_id: "m1", version: 1 }),
  savePhoto: vi.fn(),
  requestAccess: vi.fn(),
});
async function fill(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/Nome completo/), "Maria Oliveira");
  await user.type(screen.getByLabelText(/^E-mail/), "qa@example.invalid");
}

describe("Shared volunteer identity", () => {
  it.each([false, true])(
    "renders support separately in the Ecosystem, leadership present: %s",
    (hasLeader) => {
      const store = unit("store", "soja-store", "Soja Store");
      store.responsibles = [person("support")];
      if (hasLeader)
        store.responsibles.push({
          ...person("lead"),
          displayName: "Presidente Teste",
          relationshipRole: "principal",
          isPrimary: true,
        });
      const graph = buildOrganizationalGraph({ members: [], units: [store] });
      expect(graph.people["person:support"].highestAuthorityLevel).toBe(5);
      render(<OrganizationalEcosystem graph={graph} active />);
      const skip = screen.queryByRole("button", { name: "Pular apresentação" });
      if (skip) fireEvent.click(skip);
      const node = within(
        screen.getByRole("group", { name: /MAPA INTERATIVO/ }),
      ).getByRole("button", {
        name: hasLeader ? /^PRESIDENTE TESTE/ : /^SOJA STORE/,
      });
      expect(node.getAttribute("aria-label")).toContain("1 VOLUNTÁRIO");
      expect(node.getAttribute("aria-label")).not.toContain("MARIA OLIVEIRA");
      fireEvent.click(node);
      const supportSection = screen.getByRole("region", {
        name: "EQUIPE DE APOIO — VOLUNTÁRIOS",
      });
      expect(
        within(supportSection).getByRole("button", {
          name: /Selecionar MARIA OLIVEIRA/i,
        }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("region", { name: "RESPONSÁVEL" }) !== null,
      ).toBe(hasLeader);
      if (!hasLeader)
        expect(
          screen.getByRole("heading", { name: "SOJA STORE" }),
        ).toBeInTheDocument();
    },
  );
  it("resolves every official unit, module slug and route alias to one persisted unit", () => {
    const units = officialUnitResolutions.map((r) => ({
      ...unit(r.entry.id, r.entry.id, r.entry.name),
      type: r.entry.type,
    }));
    for (const r of officialUnitResolutions) {
      for (const alias of [
        r.entry.id,
        r.entry.moduleSlug,
        r.entry.mapPortalSlug,
        ...(r.entry.aliases ?? []),
      ].filter(Boolean)) {
        expect(
          teamUnitForSlug(units, alias!)?.id,
          `${r.entry.id}: ${alias}`,
        ).toBe(r.entry.id);
      }
    }
  });
  it("shows shared identities in the Ecosystem without promoting support members or merging homonyms", () => {
    const a = unit("store", "soja-store", "Soja Store"),
      b = unit("rural", "exporural", "Exporural");
    a.responsibles = [
      { ...person("one"), photoUrl: "https://example.invalid/one.webp" },
      person("two"),
    ];
    b.responsibles = [
      { ...person("one"), photoUrl: "https://example.invalid/one.webp" },
    ];
    const graph = buildOrganizationalGraph({ members: [], units: [a, b] });
    expect(graph.people["person:one"].avatarUrl).toBe(
      "https://example.invalid/one.webp",
    );
    expect(graph.people["person:two"].avatarUrl).toBeNull();
    expect(
      Object.values(graph.people).filter(
        (p) => p.fullName === "MARIA OLIVEIRA",
      ),
    ).toHaveLength(2);
    for (const node of graph.nodes.filter((n) => n.type === "commission")) {
      expect(
        node.responsibilities.every(
          (r) => r.relationshipRole === "EQUIPE_APOIO" && !r.isPrimary,
        ),
      ).toBe(true);
    }
    a.responsibles[0].displayName = "Maria Atualizada";
    b.responsibles[0].displayName = "Maria Atualizada";
    expect(
      buildOrganizationalGraph({ members: [], units: [a, b] }).people[
        "person:one"
      ].fullName,
    ).toBe("MARIA ATUALIZADA");
  });
  it("keeps homonyms separate and consolidates memberships without requiring auth", () => {
    const a = unit("a", "soja-store", "Soja Store"),
      b = unit("b", "logistica", "Logística");
    a.responsibles = [person("one"), person("two", "auth-two")];
    b.responsibles = [person("one")];
    const options = buildInstitutionalPersonOptions(
      [a, b],
      [{ user_id: "auth-two", nome_exibicao: "Maria Oliveira" }],
    );
    expect(options).toHaveLength(2);
    expect(options.find((p) => p.id === "person:one")?.hint).toContain(
      "Soja Store · Logística",
    );
    expect(JSON.stringify(options)).not.toMatch(/email|example.invalid/);
    const selected = options.map((o) => ({ id: o.id, label: o.label }));
    const links = selectionsToResponsibleLinks(selected);
    expect(links.map((l) => l.personId)).toEqual(["one", "two"]);
    expect(links.every((l) => l.userId === null)).toBe(true);
    expect(responsibleLinksToSelections(links).map((s) => s.id)).toEqual(
      selected.map((s) => s.id),
    );
    expect(
      reconcileResponsibleSelections([...selected, selected[0]], options),
    ).toHaveLength(2);
    expect(
      reconcileResponsibleSelections(
        [...selected, { id: "external:maria", label: "Maria Oliveira" }],
        options,
      ),
    ).toHaveLength(3);
  });
  it("routes map aliases and active out-of-catalog units to the same persisted unit", () => {
    const units = [
      unit("car", "espaco-do-automovel"),
      unit("rural", "exporural"),
      unit("ics", "industria-comercio-e-servicos"),
      unit("infra", "infraestrutura-e-seguranca-do-trabalho"),
      unit("legacy", "etnias"),
    ];
    for (const slug of ["espaco-do-automovel", "espaco-automovel"])
      expect(teamUnitForSlug(units, slug)?.id).toBe("car");
    expect(teamUnitForSlug(units, "industria-comercio-servicos")?.id).toBe(
      "ics",
    );
    expect(teamUnitForSlug(units, "infraestrutura")?.id).toBe("infra");
    expect(teamUnitForSlug(units, "etnias")?.id).toBe("legacy");
    expect(teamUnitForSlug(units, "fotografia")).toBeUndefined();
    expect(teamUnitForSlug(units, "limpeza")).toBeUndefined();
    const menus = withTeamMenu([]);
    expect(withTeamMenu(menus)).toHaveLength(1);
  });
  it("uses persistent avatars first and never assigns a legacy portrait to a new homonym", () => {
    const { rerender, container } = render(
      <PersonAvatar
        personId="new-person"
        name="Leonardo Mateus"
        photoUrl="https://example.invalid/avatar.webp"
        legacyPhoto={false}
        fallback={<span>LM</span>}
      />,
    );
    expect(container.querySelector("img")).toHaveAttribute(
      "src",
      "https://example.invalid/avatar.webp",
    );
    rerender(
      <PersonAvatar
        personId="other-person"
        name="Leonardo Mateus"
        legacyPhoto={false}
        fallback={<span>LM</span>}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
  });
});

describe("Volunteer registration interaction", () => {
  it("validates inline and never submits invalid fields", async () => {
    const p = baseProps();
    render(<VolunteerForm {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Salvar" }));
    expect(p.save).not.toHaveBeenCalled();
    expect(screen.getByText(/Informe o nome completo/)).toBeVisible();
    expect(screen.getByLabelText(/Nome completo/)).toHaveFocus();
  });
  it("does not warn when closing an untouched empty form", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false),
      p = baseProps();
    render(<VolunteerForm {...p} />);
    await userEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(confirm).not.toHaveBeenCalled();
    expect(p.onClose).toHaveBeenCalledOnce();
  });
  it("keeps destination and moves focus after saving another; prevents duplicate submits", async () => {
    const user = userEvent.setup(),
      p = baseProps();
    let done: (value: unknown) => void = () => {};
    p.save.mockImplementation(
      () =>
        new Promise((r) => {
          done = r;
        }),
    );
    render(<VolunteerForm {...p} />);
    await fill(user);
    await user.dblClick(
      screen.getByRole("button", { name: "Salvar e adicionar outro" }),
    );
    expect(p.save).toHaveBeenCalledTimes(1);
    done({ person_id: "p1", membership_id: "m1", version: 1 });
    await waitFor(() =>
      expect(screen.getByLabelText(/Nome completo/)).toHaveValue(""),
    );
    expect(screen.getByText("Soja Store")).toBeVisible();
    await waitFor(() =>
      expect(screen.getByLabelText(/Nome completo/)).toHaveFocus(),
    );
    expect(p.onClose).not.toHaveBeenCalled();
    expect(p.requestAccess).not.toHaveBeenCalled();
  });
  it("retains fields and the idempotency key after a network failure", async () => {
    const user = userEvent.setup(),
      p = baseProps();
    p.save.mockRejectedValueOnce(new Error("Rede indisponível"));
    render(<VolunteerForm {...p} />);
    await fill(user);
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Rede indisponível",
    );
    expect(screen.getByLabelText(/^E-mail/)).toHaveValue("qa@example.invalid");
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(p.save.mock.calls[0][0].requestId).toEqual(
      p.save.mock.calls[1][0].requestId,
    );
    expect(p.onClose).toHaveBeenCalledOnce();
  });
  it("retries a failed access request without creating another person", async () => {
    const user = userEvent.setup(),
      p = baseProps();
    p.requestAccess
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({});
    render(<VolunteerForm {...p} />);
    await fill(user);
    await user.click(screen.getByRole("checkbox"));
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "O cadastro está salvo",
    );
    await user.click(screen.getByRole("button", { name: "Salvar" }));
    expect(p.save).toHaveBeenCalledOnce();
    expect(p.requestAccess).toHaveBeenCalledTimes(2);
    expect(p.onSaved).toHaveBeenCalledWith("p1");
  });
  it("read-only team never renders administrative contacts or actions", () => {
    const management = {
      canManage: false,
      contacts: [{ person_id: "p", email: "secret@example.invalid" }],
      privateLoading: false,
      privateError: null,
      retryContacts: vi.fn(),
      save: vi.fn(),
      deactivate: vi.fn(),
      requestAccess: vi.fn(),
      invalidate: vi.fn(),
    } as unknown as Parameters<typeof VolunteerTeamView>[0]["management"];
    render(
      <VolunteerTeamView
        unitName="Equipe de teste"
        leads={[]}
        members={[{ id: "p", name: "Maria Oliveira", legacyPhoto: false }]}
        management={management}
        savePhoto={vi.fn()}
      />,
    );
    expect(screen.getByText("Maria Oliveira")).toBeVisible();
    expect(screen.queryByText(/secret@example/)).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Adicionar voluntário" }),
    ).toBeNull();
  });
});
