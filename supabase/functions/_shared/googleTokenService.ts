// Server-only helper to load a valid Google access token for a user's connection.
// Handles decrypt -> expiry check -> refresh -> re-encrypt -> persist.
// Never returns tokens to callers other than the server-side worker/callback code.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  bytesFromDb,
  bytesToHex,
  decryptToken,
  encryptToken,
} from "./googleTokenCrypto.ts";
import { refreshAccessToken } from "./googleCalendarClient.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REFRESH_LEEWAY_MS = 5 * 60 * 1000;

function admin() {
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } });
}

interface EncryptedRow {
  user_id: string;
  org_id: string;
  access_token_ciphertext: unknown;
  access_token_iv: unknown;
  access_token_tag: unknown;
  refresh_token_ciphertext: unknown;
  refresh_token_iv: unknown;
  refresh_token_tag: unknown;
  token_expires_at: string | null;
  connection_generation: string | null;
}

async function readConnectionRow(userId: string, orgId: string): Promise<EncryptedRow> {
  const db = admin();
  const { data, error } = await db.from("google_calendar_connections")
    .select(
      "user_id, org_id, access_token_ciphertext, access_token_iv, access_token_tag, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, token_expires_at, connection_generation",
    )
    .eq("user_id", userId)
    .eq("org_id", orgId)
    .maybeSingle();
  if (error) throw new Error("connection_lookup_failed");
  if (!data) throw new Error("connection_not_found");
  if (!data.access_token_ciphertext || !data.refresh_token_ciphertext) {
    throw new Error("connection_tokens_missing");
  }
  return data as EncryptedRow;
}

async function markReconnectRequired(userId: string, orgId: string, code: string) {
  const db = admin();
  await db.from("google_calendar_connections").update({
    status: "reconnect_required",
    error_code: code,
    last_error: code,
  }).eq("user_id", userId).eq("org_id", orgId);
}

export interface EncryptedTokenColumns {
  access_token_ciphertext: string;
  access_token_iv: string;
  access_token_tag: string;
  refresh_token_ciphertext?: string;
  refresh_token_iv?: string;
  refresh_token_tag?: string;
  token_expires_at: string;
}

export async function buildEncryptedTokenColumns(
  accessToken: string,
  expiresInSeconds: number,
  refreshToken?: string,
): Promise<EncryptedTokenColumns> {
  const access = await encryptToken(accessToken);
  const columns: EncryptedTokenColumns = {
    access_token_ciphertext: bytesToHex(access.ciphertext),
    access_token_iv: bytesToHex(access.iv),
    access_token_tag: bytesToHex(access.tag),
    token_expires_at: new Date(Date.now() + Math.max(60, expiresInSeconds - 30) * 1000).toISOString(),
  };
  if (refreshToken) {
    const refresh = await encryptToken(refreshToken);
    columns.refresh_token_ciphertext = bytesToHex(refresh.ciphertext);
    columns.refresh_token_iv = bytesToHex(refresh.iv);
    columns.refresh_token_tag = bytesToHex(refresh.tag);
  }
  return columns;
}

/**
 * Returns a valid Google access token for the (userId, orgId) connection.
 * Refreshes and persists a new token when the current one is close to expiring.
 * Throws `refresh_token_invalid` (and marks reconnect_required) on invalid_grant.
 */
export async function getValidGoogleAccessToken(userId: string, orgId: string): Promise<string> {
  const row = await readConnectionRow(userId, orgId);
  const expiresAt = row.token_expires_at ? Date.parse(row.token_expires_at) : 0;
  const needsRefresh = !expiresAt || expiresAt - Date.now() <= REFRESH_LEEWAY_MS;

  if (!needsRefresh) {
    return await decryptToken({
      ciphertext: bytesFromDb(row.access_token_ciphertext),
      iv: bytesFromDb(row.access_token_iv),
      tag: bytesFromDb(row.access_token_tag),
    });
  }

  const refreshToken = await decryptToken({
    ciphertext: bytesFromDb(row.refresh_token_ciphertext),
    iv: bytesFromDb(row.refresh_token_iv),
    tag: bytesFromDb(row.refresh_token_tag),
  });

  let payload;
  try {
    payload = await refreshAccessToken(refreshToken);
  } catch (error) {
    const code = String((error as Error).message ?? error);
    if (code === "refresh_token_invalid") {
      await markReconnectRequired(userId, orgId, "authorization_revoked");
      throw new Error("refresh_token_invalid");
    }
    throw error;
  }

  if (!payload.access_token || !payload.expires_in) {
    throw new Error("refresh_failed:invalid_payload");
  }

  const columns = await buildEncryptedTokenColumns(
    payload.access_token,
    payload.expires_in,
    payload.refresh_token,
  );

  const db = admin();
  const { error: updateError } = await db.from("google_calendar_connections")
    .update(columns)
    .eq("user_id", userId)
    .eq("org_id", orgId);
  if (updateError) throw new Error("token_persist_failed");

  return payload.access_token;
}
