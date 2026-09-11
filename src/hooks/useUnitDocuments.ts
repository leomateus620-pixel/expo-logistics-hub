import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { useCurrentOrg } from './useCurrentOrg';
import type { DocumentKind, DocumentViewModel } from '@/features/commission-agenda/types';

const BUCKET = 'cronograma-event-attachments';
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_BYTES = 20 * 1024 * 1024;

export interface UnitDocumentRecord {
  id: string;
  fileName: string;
  filePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploaderName: string | null;
  eventId: string | null;
  eventTitle: string | null;
  source: 'unidade' | 'evento';
}

function kindFromMime(mime: string | null | undefined, fileName: string): DocumentKind {
  const value = (mime ?? '').toLowerCase();
  const ext = fileName.split('.').pop()?.toLowerCase() ?? '';
  if (value.startsWith('image/')) return 'image';
  if (value.includes('pdf') || ext === 'pdf') return 'pdf';
  if (value.includes('sheet') || ['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
  if (value.includes('presentation') || ['ppt', 'pptx'].includes(ext)) return 'presentation';
  if (value.includes('word') || ['doc', 'docx'].includes(ext)) return 'doc';
  return 'other';
}

function formatSize(bytes: number | null | undefined): string | null {
  if (!bytes || bytes <= 0) return null;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}

export function toDocumentViewModel(record: UnitDocumentRecord): DocumentViewModel {
  return {
    id: record.id,
    name: record.fileName,
    kind: kindFromMime(record.mimeType, record.fileName),
    category: record.source === 'evento' ? 'Documento do evento' : 'Documento da unidade',
    sizeLabel: formatSize(record.sizeBytes),
    date: record.createdAt.slice(0, 10),
    uploadedBy: record.uploaderName ? { id: record.id, name: record.uploaderName } : null,
    eventId: record.eventId,
    eventTitle: record.eventTitle,
  };
}

export interface UseUnitDocumentsOptions {
  /** Eventos da unidade, usados para trazer também os anexos de evento. */
  eventTitles?: Record<string, string>;
}

/**
 * Documentos da unidade: arquivos gerais (`cronograma_unidade_anexos`) e
 * anexos dos eventos da unidade, no mesmo bucket privado já existente.
 */
export function useUnitDocuments(
  commissionId: string | null | undefined,
  options: UseUnitDocumentsOptions = {},
) {
  const { user } = useAuth();
  const { orgId } = useCurrentOrg();
  const queryClient = useQueryClient();
  const eventTitles = options.eventTitles ?? {};
  const eventIds = Object.keys(eventTitles);
  const eventKey = eventIds.join('|');
  const enabled = Boolean(commissionId && orgId);

  const listQuery = useQuery({
    queryKey: ['unit-documents', orgId, commissionId, eventKey],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<UnitDocumentRecord[]> => {
      const unitPromise = (supabase as any)
        .from('cronograma_unidade_anexos')
        .select('*')
        .eq('commission_id', commissionId)
        .order('created_at', { ascending: false });

      const eventPromise = eventIds.length
        ? (supabase as any)
            .from('cronograma_evento_anexos')
            .select('*')
            .in('event_id', eventIds)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [], error: null });

      const [unitRes, eventRes] = await Promise.all([unitPromise, eventPromise]);
      if (unitRes.error) throw unitRes.error;
      if (eventRes.error) throw eventRes.error;

      const unitDocs: UnitDocumentRecord[] = (unitRes.data ?? []).map((row: any) => ({
        id: row.id,
        fileName: row.file_name,
        filePath: row.file_path,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        uploaderName: row.uploader_name,
        eventId: null,
        eventTitle: null,
        source: 'unidade',
      }));

      const eventDocs: UnitDocumentRecord[] = (eventRes.data ?? []).map((row: any) => ({
        id: row.id,
        fileName: row.file_name,
        filePath: row.file_path,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
        createdAt: row.created_at,
        uploaderName: row.uploader_name,
        eventId: row.event_id,
        eventTitle: eventTitles[row.event_id] ?? null,
        source: 'evento',
      }));

      return [...unitDocs, ...eventDocs].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    },
  });

  const records = useMemo(() => listQuery.data ?? [], [listQuery.data]);
  const documents = useMemo(() => records.map(toDocumentViewModel), [records]);
  const byId = useMemo(() => new Map(records.map((item) => [item.id, item])), [records]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['unit-documents', orgId, commissionId] });
    queryClient.invalidateQueries({ queryKey: ['unit-metrics', orgId, commissionId] });
  };

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!commissionId || !orgId || !user) throw new Error('Sessão inválida');
      if (file.size > MAX_BYTES) throw new Error('Arquivo excede 20 MB');
      const safeName = file.name.replace(/[^\w.\-]+/g, '_');
      const path = `${orgId}/unidades/${commissionId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeName}`;

      const { error: upErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false });
      if (upErr) throw upErr;

      const uploaderName =
        (user.user_metadata as any)?.nome_exibicao ||
        (user.user_metadata as any)?.full_name ||
        user.email ||
        null;

      const { error } = await (supabase as any).from('cronograma_unidade_anexos').insert({
        org_id: orgId,
        commission_id: commissionId,
        uploaded_by: user.id,
        uploader_name: uploaderName,
        file_name: file.name,
        file_path: path,
        mime_type: file.type || 'application/octet-stream',
        size_bytes: file.size,
        kind: file.type.startsWith('image/') ? 'foto' : 'documento',
      });

      if (error) {
        await supabase.storage.from(BUCKET).remove([path]).catch(() => undefined);
        throw error;
      }
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (documentId: string) => {
      const record = byId.get(documentId);
      if (!record) throw new Error('Documento não encontrado');
      const table = record.source === 'evento' ? 'cronograma_evento_anexos' : 'cronograma_unidade_anexos';
      const { error } = await (supabase as any).from(table).delete().eq('id', record.id);
      if (error) throw error;
      await supabase.storage.from(BUCKET).remove([record.filePath]).catch(() => undefined);
    },
    onSuccess: invalidate,
  });

  const openDocument = async (documentId: string, options?: { download?: boolean }) => {
    const record = byId.get(documentId);
    if (!record) return null;
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(record.filePath, SIGNED_URL_TTL_SECONDS, options?.download ? { download: record.fileName } : undefined);
    if (error) return null;
    return data?.signedUrl ?? null;
  };

  return {
    documents,
    records,
    isLoading: listQuery.isLoading,
    upload: upload.mutateAsync,
    uploading: upload.isPending,
    remove: remove.mutateAsync,
    removing: remove.isPending,
    openDocument,
    invalidate,
  };
}
