export type OrgRole = "admin" | "gestor" | "operador" | "leitura";

export type Membership = {
  org_id: string;
  role: OrgRole;
  is_active: boolean;
};

const orgRoles = new Set<string>(["admin", "gestor", "operador", "leitura"]);

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && orgRoles.has(value);
}

export function canCreateAccount(
  caller: Membership | null,
  callerIsGlobalAdmin: boolean,
  orgId: string | null,
  role: OrgRole,
) {
  if (!orgId) return callerIsGlobalAdmin;
  if (!caller?.is_active || caller.org_id !== orgId) return false;
  if (caller.role === "admin") return true;
  return caller.role === "gestor" && (role === "operador" || role === "leitura");
}

export function canUpdateAccount(
  caller: Membership | null,
  callerIsGlobalAdmin: boolean,
  targetMemberships: Membership[],
  targetIsGlobalAdmin: boolean,
  orgId: string,
  action: "update_identity" | "update_email" | "update_password",
) {
  if (!caller?.is_active || caller.org_id !== orgId) return false;
  const activeTargets = targetMemberships.filter((member) => member.is_active);
  const target = activeTargets.find((member) => member.org_id === orgId);
  if (!target) return false;
  if ((targetIsGlobalAdmin || targetMemberships.some((member) => member.org_id !== orgId)) && !callerIsGlobalAdmin) {
    return false;
  }
  if (caller.role === "admin") return true;
  return caller.role === "gestor" && action === "update_identity"
    && (target.role === "operador" || target.role === "leitura") && !targetIsGlobalAdmin;
}
