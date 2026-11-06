import { supabase } from "@/integrations/supabase/client";
import type {
  SavedVolunteer,
  TeamContact,
  VolunteerInput,
  VolunteerPhoto,
} from "./types";

// Explicit RPC boundary; private contacts never enter the institutional directory.
export async function teamRpc<T>(
  name: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await (
    supabase as unknown as {
      rpc(
        name: string,
        args: Record<string, unknown>,
      ): Promise<{ data: T; error: { message: string; code?: string } | null }>;
    }
  ).rpc(name, args);
  if (error)
    throw Object.assign(new Error(error.message), { code: error.code });
  return data;
}
export const listTeamContacts = (commissionId: string) =>
  teamRpc<TeamContact[]>("team_admin_contacts", {
    _commission_id: commissionId,
  });
export async function saveVolunteer(
  commissionId: string,
  input: VolunteerInput,
): Promise<SavedVolunteer> {
  const result = await teamRpc<
    SavedVolunteer & { reconciliation_required?: boolean }
  >("team_save_volunteer", {
    _commission_id: commissionId,
    _request_id: input.requestId,
    _name: input.name,
    _email: input.email,
    _person_id: input.personId ?? null,
    _expected_version: input.expectedVersion ?? null,
  });
  if (result.reconciliation_required)
    throw new Error(
      "Solicitação registrada para validação administrativa. A administração verificará o vínculo antes de concluir o cadastro.",
    );
  return result;
}
export async function saveVolunteerAvatar(
  commissionId: string,
  personId: string,
  version: number,
  photo: VolunteerPhoto | null,
  requestId: string,
) {
  const body = new FormData();
  body.set("commission_id", commissionId);
  body.set("person_id", personId);
  body.set("expected_version", String(version));
  body.set("request_id", requestId);
  if (photo) {
    body.set("file", photo.file);
    body.set("crop", JSON.stringify(photo.crop));
  } else body.set("remove", "true");
  const { data, error } = await supabase.functions.invoke("team-avatar", {
    body,
  });
  if (error || data?.error)
    throw new Error(
      data?.error ??
        "O cadastro foi salvo, mas a foto não foi atualizada. Tente novamente.",
    );
  return data as { version: number };
}
