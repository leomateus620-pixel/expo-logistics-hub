import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { teamRpc } from "./api";

interface AccessRequest {
  id: string;
  name: string;
  unit_name: string;
  email: string;
  state: string;
  attempts: number;
}
interface Reconciliation {
  id: string;
  name: string;
  unit_name: string;
  email: string;
  candidates: { person_id: string; name: string }[] | null;
}
const labels: Record<string, string> = {
  requested: "Aguardando administração",
  processing: "Em atendimento",
  completed: "Concluído",
  declined: "Não aprovado",
};

/** Mounted only for an active organization administrator. RPCs revalidate that role. */
export function TeamAdministration({
  orgId,
  userId,
}: {
  orgId: string;
  userId: string;
}) {
  const qc = useQueryClient();
  const key = ["team-private", orgId, userId, "administration"];
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const queue = useQuery({
    queryKey: key,
    queryFn: async () => {
      try {
        const [access, reconciliation] = await Promise.all([
          teamRpc<AccessRequest[]>("team_access_requests", { _org_id: orgId }),
          teamRpc<Reconciliation[]>("team_reconciliation_requests", {
            _org_id: orgId,
          }),
        ]);
        return { access, reconciliation };
      } catch (e) {
        qc.setQueryData(key, { access: [], reconciliation: [] });
        throw e;
      }
    },
    meta: { persist: false },
    gcTime: 0,
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false,
  });
  useEffect(
    () => () => {
      void qc.cancelQueries({ queryKey: key });
      qc.removeQueries({ queryKey: key });
    },
    [orgId, userId, qc],
  );
  const act = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await Promise.all(
        [
          "team-private",
          "org-commissions",
          "unit-agenda",
          "cronograma-eventos",
        ].map((k) => qc.invalidateQueries({ queryKey: [k] })),
      );
      setMessage("Solicitação atualizada.");
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
  const resolve = (request: Reconciliation, personId: string | null) => {
    const question = personId
      ? "Confirmar que é a mesma pessoa e vincular o cadastro à equipe?"
      : "Confirmar que são pessoas distintas e criar uma identidade separada?";
    if (window.confirm(question))
      void act(() =>
        teamRpc("team_resolve_reconciliation", {
          _request_id: request.id,
          _person_id: personId,
        }),
      );
  };
  return (
    <details className="vt-admin">
      <summary>
        Solicitações das equipes <span>Administração</span>
      </summary>
      <p className="my-3">
        Confira a identidade antes de vincular pessoas. O e-mail informado pela
        equipe não comprova a titularidade de uma conta.
      </p>
      {error && (
        <p className="vt-error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="vt-success" role="status">
          {message}
        </p>
      )}
      {queue.isError ? (
        <div role="alert">
          Não foi possível validar o acesso.{" "}
          <Button variant="outline" onClick={() => void queue.refetch()}>
            Tentar novamente
          </Button>
        </div>
      ) : queue.isLoading ? (
        <p role="status">Carregando solicitações…</p>
      ) : (
        <>
          <h2 className="mt-5 font-semibold">Revisão de identidade</h2>
          {!queue.data?.reconciliation.length && (
            <p className="mt-2">Nenhuma revisão pendente.</p>
          )}
          <ul>
            {queue.data?.reconciliation.map((r) => (
              <li className="!grid border-b pb-4" key={r.id}>
                <strong>
                  {r.name} · {r.unit_name}
                </strong>
                <span>{r.email}</span>
                <div className="flex flex-wrap gap-2">
                  {r.candidates?.map((p) => (
                    <Button
                      key={p.person_id}
                      disabled={busy}
                      variant="outline"
                      onClick={() => resolve(r, p.person_id)}
                    >
                      Vincular a {p.name}
                    </Button>
                  ))}
                  <Button
                    disabled={busy}
                    variant="ghost"
                    onClick={() => resolve(r, null)}
                  >
                    São pessoas distintas
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <h2 className="mt-5 font-semibold">Acesso ao sistema</h2>
          <p className="mt-2">
            Use o provisionamento administrativo existente, com confirmação
            segura da conta e somente o perfil básico. Marcar como concluído
            registra o atendimento; esta ação não envia convite nem concede
            acesso.
          </p>
          {!queue.data?.access.length && (
            <p className="mt-2">Nenhuma solicitação de acesso.</p>
          )}
          <ul>
            {queue.data?.access.map((r) => (
              <li className="!grid border-b pb-4" key={r.id}>
                <strong>
                  {r.name} · {r.unit_name}
                </strong>
                <span>
                  {r.email} · {labels[r.state]} · {r.attempts} tentativa(s)
                </span>
                <div className="flex flex-wrap gap-2">
                  {(["processing", "completed", "declined"] as const)
                    .filter((state) => state !== r.state)
                    .map((state) => (
                      <Button
                        key={state}
                        variant="outline"
                        disabled={busy}
                        onClick={() =>
                          void act(() =>
                            teamRpc("team_update_access_request", {
                              _request_id: r.id,
                              _expected_state: r.state,
                              _state: state,
                            }),
                          )
                        }
                      >
                        {state === "processing"
                          ? "Iniciar atendimento"
                          : state === "completed"
                            ? "Registrar conclusão"
                            : "Não aprovar"}
                      </Button>
                    ))}
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  );
}
