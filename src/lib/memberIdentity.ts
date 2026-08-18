export interface MemberIdentityRecord {
  user_id?: string | null;
  nome_exibicao?: string | null;
  cargo?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  is_core_team?: boolean | null;
}

function identityScore(member: MemberIdentityRecord): number {
  return (member.is_core_team ? 4 : 0) + (member.is_active !== false ? 2 : 0) + (member.nome_exibicao?.trim() ? 1 : 0);
}

/** One canonical organizational identity per auth user. */
export function resolveOfficialMembers<T extends MemberIdentityRecord>(members: T[]): Map<string, T> {
  const resolved = new Map<string, T>();
  members.forEach((member) => {
    const userId = member.user_id?.trim();
    if (!userId) return;
    const current = resolved.get(userId);
    if (!current || identityScore(member) > identityScore(current)) resolved.set(userId, member);
  });
  return resolved;
}

export function officialMemberLabel(member: MemberIdentityRecord | null | undefined): string | null {
  const label = member?.nome_exibicao?.trim();
  return label || null;
}