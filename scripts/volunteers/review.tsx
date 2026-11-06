import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import CommissionLayout from "@/components/commissions/CommissionLayout";
import { VolunteerTeamView } from "@/features/volunteers/VolunteerTeam";
import { teamModule, withTeamMenu } from "@/features/volunteers/teamRoutes";
import type { PersonSummary } from "@/features/commission-agenda/types";
import type { TeamContact, VolunteerInput } from "@/features/volunteers/types";
import "@/styles/tokens.css";
import "@/index.css";
import "@/styles/cronograma-operational-overrides.css";
import "@/styles/cronograma-mobile.css";
import "@/styles/cronograma-mobile-overlays.css";
const params = new URLSearchParams(location.search);
const unitName = params.get("name") ?? "Soja Store";
const module = teamModule({
  id: "qa-unit",
  slug: params.get("unit") ?? "soja-store",
  name: unitName,
  type: "comissao",
  displayOrder: 1,
  isOfficial: true,
  isLegacy: false,
  responsibles: [],
});
const names = [
  "Ana Luiza Martins",
  "Bruno Henrique dos Santos",
  "Carolina Ribeiro",
  "Daniela Costa",
  "Eduardo Silveira",
  "Fernanda Oliveira",
  "Gabriel Nunes",
  "Helena Albuquerque",
];
function Review() {
  const [members, setMembers] = useState<PersonSummary[]>(
    params.has("empty")
      ? []
      : names.map((name, i) => ({
          id: `qa-${i}`,
          personId: `qa-${i}`,
          name,
          role: "Voluntário",
          legacyPhoto: false,
        })),
  );
  const [contacts, setContacts] = useState<TeamContact[]>(
    names.map((_, i) => ({
      person_id: `qa-${i}`,
      membership_id: `membership-${i}`,
      email: `teste${i}@example.invalid`,
      version: 1,
      membership_version: 1,
      can_edit_identity: true,
      access_state: null,
    })),
  );
  const save = async (input: VolunteerInput) => {
    await new Promise((r) => setTimeout(r, 350));
    if (params.get("fail") === "save")
      throw new Error("Falha de rede simulada. Seus dados foram mantidos.");
    const id = input.personId ?? crypto.randomUUID(),
      version = (input.expectedVersion ?? 0) + 1;
    setMembers((all) => [
      ...all.filter((p) => p.id !== id),
      {
        id,
        personId: id,
        name: input.name,
        legacyPhoto: false,
        role: "Voluntário",
      },
    ]);
    setContacts((all) => [
      ...all.filter((p) => p.person_id !== id),
      {
        person_id: id,
        membership_id: id,
        email: input.email,
        version,
        membership_version: 1,
        can_edit_identity: true,
        access_state: null,
      },
    ]);
    return { person_id: id, membership_id: id, version };
  };
  const management = {
    canManage: !params.has("readonly"),
    contacts,
    privateLoading: false,
    privateError: null,
    retryContacts: async () => ({}),
    save,
    deactivate: async (id: string) => {
      setMembers((all) => all.filter((p) => p.id !== id));
    },
    requestAccess: async () => {
      if (params.get("fail") === "invite") throw new Error("Indisponível");
    },
    invalidate: async () => {},
  } as Parameters<typeof VolunteerTeamView>[0]["management"];
  return (
    <CommissionLayout module={module} menuItems={withTeamMenu(module.menus)}>
      <p className="mb-5 text-xs text-muted-foreground">
        Validação local · pessoas fictícias · nenhum envio de e-mail
      </p>
      <VolunteerTeamView
        unitName={unitName}
        leads={[
          {
            id: "qa-lead",
            name: "Mariana Fernandes",
            role: "Presidente",
            legacyPhoto: false,
          },
        ]}
        members={members}
        management={management}
        savePhoto={async (id, version, photo) => {
          if (params.get("fail") === "photo")
            throw new Error("Storage indisponível");
          const photoUrl = photo ? URL.createObjectURL(photo.file) : null;
          setMembers((all) =>
            all.map((p) => (p.id === id ? { ...p, photoUrl } : p)),
          );
          return { version: version + 1 };
        }}
      />
    </CommissionLayout>
  );
}
createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={new QueryClient()}>
    <BrowserRouter>
      <Review />
    </BrowserRouter>
  </QueryClientProvider>,
);
