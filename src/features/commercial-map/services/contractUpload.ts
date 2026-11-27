import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'map-contracts';
const pendingPaths = new Map<string, string>();

interface ContractRegistration {
  contractId: string;
  version: number;
  versionId: string;
}

interface UploadStatus {
  linked: boolean;
  uploaded: boolean;
  registration: ContractRegistration | null;
}

type RpcError = { message?: string; code?: string };
type ContractRpc = 'attach_order_contract' | 'register_lot_contract_version' | 'replace_lot_order_contract' | 'revise_sale_order_items';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rpc = async (name: string, args: Record<string, unknown>) => await (supabase.rpc as any)(name, args);

function pendingError() {
  return new Error('O envio ainda está sem confirmação. Envie novamente o mesmo arquivo para verificar o vínculo no servidor.');
}

async function readStatus(path: string): Promise<UploadStatus | null> {
  try {
    const { data, error } = await rpc('get_commercial_contract_upload', { p_storage_path: path });
    if (!error && typeof data?.linked === 'boolean' && typeof data?.uploaded === 'boolean') return data;
  } catch { /* resultado segue indeterminado */ }
  return null;
}

function isDefinitiveRejection(error: RpcError): boolean {
  return error.code === 'P0001' && /^(MAP_PERMISSION_DENIED|AUTH_REQUIRED|NO_ITEMS_SELECTED|ORDER_NOT_FOUND|ORDER_NOT_ACTIVE|ITEM_NOT_IN_ORDER|LOT_NOT_FOUND|INVALID_CONTRACT_STORAGE_PATH|INVALID_CONTRACT_FILE|CONTRACT_OBJECT_NOT_FOUND|CONTRACT_NOT_FOUND|CONTRACT_CHANGED|ITEM_NOT_IN_CONTRACT|SALE_NOT_FOUND|SALE_CHANGED|SALE_NOT_SIGNED|RECONCILIATION_REQUIRED|PACKAGE_PLAN_INVALID|ORDER_ALREADY_RECONCILED|PACKAGE_ORIGIN_CHANGED|PACKAGE_FINANCIAL_CONFLICT|ORDER_CHANGED|PACKAGE_SIGNATURE_NOT_CONFIRMED)$/.test(error.message ?? '');
}

async function digest(content: BufferSource) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', content));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function registerPrivateContractUpload({ dir, file, operation, args, onProgress }: {
  dir: string;
  file: File;
  operation: ContractRpc;
  args: Record<string, unknown>;
  onProgress?: (phase: 'upload' | 'register') => void;
}) {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session) throw new Error('Entre novamente para enviar o contrato.');

  const contentDigest = await digest(await file.arrayBuffer());
  const fingerprint = await digest(new TextEncoder().encode(JSON.stringify([dir, operation, args, file.name, file.type, contentDigest])));
  const key = `fenasoja.contract-upload:${session.user.id}:${fingerprint}`;
  let path = pendingPaths.get(key) ?? null;
  try { path ??= localStorage.getItem(key); } catch { /* preserva a tentativa em memória */ }

  const forget = () => {
    pendingPaths.delete(key);
    try { localStorage.removeItem(key); } catch { /* armazenamento indisponível */ }
  };
  const recovered = (receipt: ContractRegistration) => {
    forget();
    return operation === 'register_lot_contract_version' ? receipt.versionId : receipt;
  };

  let uploaded = false;
  if (path) {
    onProgress?.('register');
    const status = await readStatus(path);
    if (!status) throw pendingError();
    if (status.registration) return recovered(status.registration);
    if (status.linked) throw pendingError();
    uploaded = status.uploaded;
  } else {
    path = `${dir}/${crypto.randomUUID()}.${file.name.split('.').pop()?.toLowerCase() || 'pdf'}`;
    pendingPaths.set(key, path);
    try { localStorage.setItem(key, path); } catch { /* preserva a tentativa em memória */ }
  }

  const bucket = supabase.storage.from(BUCKET);
  if (!uploaded) {
    onProgress?.('upload');
    const uploadedResponse = await bucket.upload(path, file, {
      cacheControl: '3600', contentType: file.type, upsert: false,
    }).catch(() => null);
    if (!uploadedResponse || uploadedResponse.error) {
      const status = await readStatus(path);
      if (status?.registration) return recovered(status.registration);
      if (!status?.uploaded || status.linked) throw pendingError();
    }
  }

  onProgress?.('register');
  const response = await rpc(operation, {
    ...args,
    p_storage_path: path,
    p_original_name: file.name,
    p_mime_type: file.type,
    p_file_size: file.size,
  }).catch(() => null);
  const data = response?.data;
  const valid = operation === 'register_lot_contract_version'
    ? typeof data === 'string' && data.length > 0
    : typeof data?.versionId === 'string' && typeof data.contractId === 'string' && Number.isInteger(data.version);
  if (response && !response.error && valid) {
    forget();
    return data;
  }

  const status = await readStatus(path);
  if (status?.registration) return recovered(status.registration);
  if (response?.error && isDefinitiveRejection(response.error) && status && !status.linked) {
    // O Storage também protege contra uma gravação que ocorra entre a consulta e o DELETE.
    if (status.uploaded) {
      const removed = await bucket.remove([path]).catch(() => null);
      if (!removed || removed.error) {
        const latest = await readStatus(path);
        if (latest?.registration) return recovered(latest.registration);
        throw pendingError();
      }
    }
    forget();
    throw response.error;
  }
  throw pendingError();
}
