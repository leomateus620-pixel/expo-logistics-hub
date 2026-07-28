# Anexos e fotos em eventos do Cronograma

Permitir que qualquer usuário autenticado anexe fotos/documentos a um evento do módulo "Cronograma e Eventos" para registro/validação de reuniões, com visualização imediata ao abrir o evento.

## Backend (Lovable Cloud)

**Nova tabela `cronograma_evento_anexos`** (migration única):
- Campos de domínio: `event_id` (FK `cronograma_eventos`), `org_id`, `uploaded_by` (auth.users), `uploader_name`, `file_name`, `file_path` (chave no bucket), `mime_type`, `size_bytes`, `kind` (`foto` | `documento`), `caption` (opcional).
- Padrão: `created_at`, `updated_at`, trigger `set_updated_at`.
- GRANTs para `authenticated` e `service_role`; RLS habilitada.
- Políticas PERMISSIVE:
  - SELECT / INSERT: membros da mesma `org_id` (via `is_org_member`).
  - UPDATE / DELETE: apenas quem enviou (`uploaded_by = auth.uid()`) ou admin/gestor (via `has_capability`/`get_user_org_role`).
- Cascata: ao excluir o evento, apaga anexos (ON DELETE CASCADE); trigger em delete registra em `audit_log`.

**Storage**: novo bucket privado `cronograma-event-attachments` (via ferramenta de storage). RLS em `storage.objects` restringe leitura/escrita aos membros da org (path prefixado por `{org_id}/{event_id}/`). URLs assinadas de 1h para exibição/download.

## Frontend

**Hook `useEventoAnexos(eventId)`** em `src/hooks/`:
- `list`, `upload` (multipart → storage + insert em anexos), `remove`, `getSignedUrl`.
- Invalidação de cache TanStack Query por `eventId`.

**Componente `EventoAnexosSection`** em `src/components/cronograma-eventos/`:
- Botão principal "Anexar foto/documento" (ícone `Paperclip` + `Camera` para mobile capture), estilo Liquid Glass alinhado ao drawer atual.
- Grid de miniaturas para imagens (lightbox ao clicar) + lista para documentos (PDF/etc.), com nome do autor, data, tamanho e botão de excluir (respeitando RLS).
- Suporte a drag-and-drop no desktop e `capture="environment"` no mobile.
- Barra de progresso durante upload; validação de tipo (imagens, PDF, docx, xlsx) e tamanho (≤ 20 MB por arquivo).

**Integração na UI** (feature aberta a todos os usuários com acesso ao evento):
- `src/components/cronograma-eventos/EventDrawer.tsx`: nova seção "Anexos e registros" logo acima de "Rastreabilidade".
- `src/components/cronograma-eventos/mobile/MobileEventScreen.tsx`: mesma seção, com FAB flutuante para câmera.
- Badge no cabeçalho do evento mostrando contagem de anexos (ícone `Paperclip` + número), visível na abertura.

## Detalhes técnicos

- Upload usa `supabase.storage.from('cronograma-event-attachments').upload(path, file)` e depois `insert` no anexo com metadados; ambos dentro de try/catch com toast padrão.
- Preview de imagem gera signed URL cacheada por 50 min no cliente.
- Sem alteração no fluxo do Google Calendar (anexos são registro interno, não sincronizam).
- Tipos gerados automaticamente após a migration; hooks tipados com `Database['public']['Tables']['cronograma_evento_anexos']`.

## Entregáveis

1. Migration `create_cronograma_evento_anexos` + criação do bucket.
2. `useEventoAnexos.ts`.
3. `EventoAnexosSection.tsx` (desktop + mobile responsive).
4. Integração em `EventDrawer.tsx` e `MobileEventScreen.tsx` + badge de contagem.
5. Toasts padrão de sucesso/erro e AlertDialog para exclusão.
