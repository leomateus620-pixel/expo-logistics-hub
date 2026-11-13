import { strict as assert } from "node:assert";
import { test } from "node:test";
import { canCreateAccount, canUpdateAccount, type Membership } from "./authorization.ts";

const admin: Membership = { org_id: "fenasoja", role: "admin", is_active: true };
const manager: Membership = { ...admin, role: "gestor" };
const operator: Membership = { ...admin, role: "operador" };

test("only the active administrator of the target org can create its administrators", () => {
  assert.equal(canCreateAccount(admin, false, "fenasoja", "admin"), true);
  assert.equal(canCreateAccount(manager, false, "fenasoja", "admin"), false);
  assert.equal(canCreateAccount(admin, true, "different", "admin"), false);
  assert.equal(canCreateAccount({ ...admin, is_active: false }, false, "fenasoja", "admin"), false);
  assert.equal(canCreateAccount(manager, false, "fenasoja", "operador"), true);
  assert.equal(canCreateAccount(manager, false, null, "leitura"), false);
});

test("credentials and identities stay scoped to the target account and organization", () => {
  assert.equal(canUpdateAccount(admin, false, [operator], false, "fenasoja", "update_password"), true);
  assert.equal(canUpdateAccount(manager, false, [operator], false, "fenasoja", "update_password"), false);
  assert.equal(canUpdateAccount(manager, false, [operator], false, "fenasoja", "update_identity"), true);
  assert.equal(canUpdateAccount(manager, false, [admin], false, "fenasoja", "update_identity"), false);
  assert.equal(canUpdateAccount(admin, false, [{ ...operator, org_id: "different" }], false, "fenasoja", "update_email"), false);
  assert.equal(canUpdateAccount(admin, false, [operator, { ...operator, org_id: "different" }], false, "fenasoja", "update_email"), false);
  assert.equal(canUpdateAccount(admin, false, [operator, { ...admin, org_id: "different", is_active: false }], false, "fenasoja", "update_email"), false);
  assert.equal(canUpdateAccount(admin, false, [operator], true, "fenasoja", "update_password"), false);
});
