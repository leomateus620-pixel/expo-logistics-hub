import { useEffect, useMemo, useState } from "react";
import {
  Crown,
  Mail,
  MoreHorizontal,
  Pencil,
  Search,
  UserPlus,
  Users,
  UserMinus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOrgCommissions } from "@/hooks/useOrgCommissions";
import { useTeamManagement } from "./useTeamManagement";
import { VolunteerForm } from "./VolunteerForm";
import { saveVolunteerAvatar } from "./api";
import { PersonAvatar } from "@/features/commission-agenda/components/primitives";
import type { PersonSummary } from "@/features/commission-agenda/types";
import {
  normalizeSearchTerm,
  responsibleRoleLabel,
  type OrgUnit,
} from "@/lib/org-units";
import "@/styles/volunteer-team.css";

export interface VolunteerTeamViewProps {
  unitName: string;
  leads: PersonSummary[];
  members: PersonSummary[];
  management: ReturnType<typeof useTeamManagement>;
  savePhoto: (
    id: string,
    version: number,
    photo: Parameters<typeof saveVolunteerAvatar>[3],
    requestId: string,
  ) => Promise<{ version: number }>;
}
export function VolunteerTeamView({
  unitName,
  leads,
  members,
  management,
  savePhoto,
}: VolunteerTeamViewProps) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(1),
    [editing, setEditing] = useState<PersonSummary | null | undefined>(
      undefined,
    );
  const [success, setSuccess] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [highlight, setHighlight] = useState("");
  useEffect(() => {
    if (!management.canManage) setEditing(undefined);
  }, [management.canManage]);
  const filtered = members.filter((p) =>
    normalizeSearchTerm(p.name).includes(normalizeSearchTerm(search)),
  );
  const ordered = highlight
    ? [
        ...filtered.filter((p) => p.id === highlight),
        ...filtered.filter((p) => p.id !== highlight),
      ]
    : filtered;
  const visible = ordered.slice(0, page * 24);
  const onSaved = (id: string) => {
    setSearch("");
    setPage(1);
    setHighlight(id);
    setSuccess("Voluntário salvo e disponível na equipe e na Agenda.");
    setTimeout(() => setHighlight(""), 5000);
  };
  const act = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await action();
      setSuccess(message);
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Não foi possível concluir. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };
  const card = (person: PersonSummary, lead = false) => {
    const contact = management.contacts.find(
      (c) => c.person_id === (person.personId ?? person.id),
    );
    return (
      <li
        key={person.id}
        className={`vt-person ${lead ? "vt-person--lead" : ""} ${highlight === person.id ? "vt-person--saved" : ""}`}
      >
        <PersonAvatar person={person} size="lg" tone="light" primary={lead} />
        <div className="min-w-0 flex-1">
          <p className="vt-person__name">{person.name}</p>
          <p className="vt-person__role">
            {person.role ?? (lead ? "Responsável" : "Voluntário")}
          </p>
        </div>
        {!lead && management.canManage && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                aria-label={`Ações de ${person.name}`}
                disabled={busy || !contact}
              >
                <MoreHorizontal className="h-5 w-5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => setEditing(person)}>
                <Pencil className="mr-2 h-4 w-4" />
                Editar cadastro
              </DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() =>
                  void act(
                    () =>
                      management.requestAccess(person.personId ?? person.id),
                    "Solicitação de acesso registrada para a administração.",
                  )
                }
              >
                <Mail className="mr-2 h-4 w-4" />
                Convidar para acessar
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onSelect={() => {
                  if (
                    window.confirm(
                      `Inativar o vínculo de ${person.name} com ${unitName}? O histórico dos eventos será preservado.`,
                    )
                  )
                    void act(
                      () =>
                        management.deactivate(
                          person.personId ?? person.id,
                          contact!.membership_version,
                        ),
                      "Vínculo inativado. O histórico foi preservado.",
                    );
                }}
              >
                <UserMinus className="mr-2 h-4 w-4" />
                Inativar vínculo
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </li>
    );
  };
  return (
    <section className="vt-page" aria-labelledby="volunteer-team-title">
      <header className="vt-header">
        <div>
          <p className="vt-eyebrow">{unitName}</p>
          <h2 id="volunteer-team-title">
            Equipe <span>{leads.length + members.length}</span>
          </h2>
          <p>As pessoas que fazem esta equipe acontecer.</p>
        </div>
        {management.canManage && (
          <Button className="vt-add" onClick={() => setEditing(null)}>
            <UserPlus className="h-4 w-4" />
            Adicionar voluntário
          </Button>
        )}
      </header>
      {success && (
        <p role="status" className="vt-success">
          {success}
        </p>
      )}
      {error && (
        <p role="alert" className="vt-error">
          {error}
        </p>
      )}
      {leads.length > 0 && (
        <section className="vt-section" aria-labelledby="volunteer-leads">
          <div className="vt-section__heading">
            <Crown aria-hidden="true" />
            <h3 id="volunteer-leads">Presidência e responsáveis</h3>
          </div>
          <ul className="vt-grid vt-grid--leads">
            {leads.map((p) => card(p, true))}
          </ul>
        </section>
      )}
      <section className="vt-section" aria-labelledby="volunteer-support">
        <div className="vt-section__heading vt-section__heading--search">
          <div className="flex items-center gap-2">
            <Users aria-hidden="true" />
            <h3 id="volunteer-support">
              Equipe de apoio <span>— Voluntários</span>
            </h3>
          </div>
          <div className="vt-search">
            <Search aria-hidden="true" />
            <Input
              aria-label="Buscar voluntário por nome"
              placeholder="Buscar por nome"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>
        {visible.length ? (
          <>
            <ul className="vt-grid">{visible.map((p) => card(p))}</ul>
            {visible.length < filtered.length && (
              <Button
                className="mt-4"
                variant="outline"
                onClick={() => setPage((p) => p + 1)}
              >
                Mostrar mais ({filtered.length - visible.length})
              </Button>
            )}
          </>
        ) : (
          <div className="vt-empty">
            <Users aria-hidden="true" />
            <h4>
              {search ? "Nenhum nome encontrado" : "Sua equipe começa aqui"}
            </h4>
            <p>
              {search
                ? "Tente outro nome ou limpe a busca."
                : "Cadastre os voluntários para reuni-los na equipe e na Agenda."}
            </p>
            {management.canManage && !search && (
              <Button variant="outline" onClick={() => setEditing(null)}>
                Adicionar primeiro voluntário
              </Button>
            )}
          </div>
        )}
      </section>
      {management.canManage && (
        <details className="vt-admin">
          <summary>
            <Mail aria-hidden="true" />
            Contatos administrativos <span>Acesso restrito</span>
          </summary>
          {management.privateLoading ? (
            <p role="status">Carregando contatos…</p>
          ) : management.privateError ? (
            <div role="alert">
              <p>Não foi possível validar o acesso aos contatos.</p>
              <Button
                variant="outline"
                onClick={() => void management.retryContacts()}
              >
                Tentar novamente
              </Button>
            </div>
          ) : (
            <ul>
              {visible.map((p) => (
                <li key={p.id}>
                  <strong>{p.name}</strong>
                  <span>
                    {management.contacts.find(
                      (c) => c.person_id === (p.personId ?? p.id),
                    )?.email ?? "E-mail ainda não informado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </details>
      )}
      {editing !== undefined && (
        <VolunteerForm
          key={editing?.id ?? "new"}
          unitName={unitName}
          person={editing ?? undefined}
          contact={management.contacts.find(
            (c) => c.person_id === (editing?.personId ?? editing?.id),
          )}
          onClose={() => setEditing(undefined)}
          onSaved={onSaved}
          save={management.save}
          savePhoto={savePhoto}
          requestAccess={management.requestAccess}
        />
      )}
    </section>
  );
}
export function VolunteerTeam({ unit }: { unit: OrgUnit }) {
  const management = useTeamManagement(unit.id);
  const { leads, members } = useMemo(() => {
    const convert = (p: OrgUnit["responsibles"][number]): PersonSummary => ({
      id: p.personId ?? p.id,
      personId: p.personId,
      name: p.displayName,
      userId: p.userId,
      photoUrl: p.photoUrl,
      legacyPhoto: p.legacyPhoto,
      role: responsibleRoleLabel(p.relationshipRole),
    });
    return {
      leads: unit.responsibles
        .filter((p) => p.relationshipRole !== "equipe_apoio")
        .map(convert),
      members: unit.responsibles
        .filter((p) => p.relationshipRole === "equipe_apoio")
        .map(convert),
    };
  }, [unit]);
  return (
    <VolunteerTeamView
      unitName={unit.name}
      leads={leads}
      members={members}
      management={management}
      savePhoto={async (id, version, photo, requestId) => {
        const result = await saveVolunteerAvatar(
          unit.id,
          id,
          version,
          photo,
          requestId,
        );
        await management.invalidate();
        return result;
      }}
    />
  );
}
export function VolunteerTeamById({
  commissionId,
}: {
  commissionId: string | null;
}) {
  const { units, isLoading, error, refetch } = useOrgCommissions();
  const unit = units.find((u) => u.id === commissionId);
  if (isLoading)
    return (
      <div className="vt-page vt-loading" role="status">
        Carregando equipe…
      </div>
    );
  if (error)
    return (
      <div className="vt-page vt-error" role="alert">
        Não foi possível carregar a equipe.{" "}
        <Button variant="outline" onClick={() => void refetch()}>
          Tentar novamente
        </Button>
      </div>
    );
  if (!unit)
    return (
      <div className="vt-page vt-empty">
        Esta unidade não está ativa nesta organização.
      </div>
    );
  return <VolunteerTeam unit={unit} />;
}
