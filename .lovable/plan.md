

## Diagnóstico

No `ExpenseDetailSheet.tsx` (modal aberto ao clicar numa despesa), há duas limitações:

1. **Descrição truncada**: o `InfoRow` usa `truncate` (linha 60), cortando o texto da descrição em uma linha. No print, "CNPJ: 9833807200…" aparece com reticências.
2. **Comprovante invisível**: o componente apenas mostra `"1 comprovante(s) anexado(s)"` em texto, sem renderizar/abrir o arquivo. Os documentos estão no bucket privado `expense-documents` e a query em `useExpenses` já traz `expense_documents(id, file_url, extraction_status)`.

## Solução

### 1. Descrição completa (`ExpenseDetailSheet.tsx`)

- Renderizar a descrição em um bloco dedicado **fora** do componente `InfoRow` (que é forçado a uma linha), com `whitespace-pre-wrap break-words` e sem `truncate`.
- Manter ícone + label, mas usar layout em coluna para o texto fluir em múltiplas linhas.

### 2. Visualização de comprovantes

Substituir a linha textual por uma seção interativa:

- **Listar cada documento** com miniatura (se for imagem) ou ícone PDF.
- **Botão "Visualizar"** que abre o arquivo numa Lightbox/Dialog (imagens) ou nova aba (PDFs).
- Como o bucket é **privado**, gerar **Signed URL on-demand** via `supabase.storage.from('expense-documents').createSignedUrl(path, 3600)`.
  - O campo `file_url` salvo no banco já é uma signed URL (com expiração de 1h). Pode estar expirada — então sempre **regerar** ao abrir o detalhe, extraindo o `path` original armazenado em `expense_documents.file_path` (verificar nome real da coluna nos types).
- Detectar tipo de arquivo pela extensão (`.jpg/.png/.webp` → preview inline; `.pdf` → ícone + abrir em nova aba).

### 3. Novo subcomponente `ExpenseDocumentPreview.tsx`

- Recebe lista `expense.expense_documents`.
- Para cada doc: gera signed URL fresca via Supabase Storage.
- Renderiza grid 2-col (mobile 1-col) com thumb 80x80 + nome + botão olho/download.
- Ao clicar: abre `Dialog` fullscreen (mobile: `Drawer`) com `<img>` zoomável ou `<iframe>` PDF.
- Loading skeleton enquanto a signed URL é buscada.

### 4. Ajustes no `useExpenses.ts`

Adicionar à query de `expenses` o campo `file_path` (e `file_name`/`mime_type` se existirem):

```ts
.select('*, expense_categories(name, icon), expense_documents(id, file_url, file_path, file_name, mime_type, extraction_status)')
```

Se a tabela não tiver `file_path`, derivar o path a partir da `file_url` (parse) ou usar `file_url` diretamente quando ainda válida, com fallback para regenerar.

## Arquivos a editar

| Arquivo | Mudança |
|---|---|
| `src/components/expenses/ExpenseDetailSheet.tsx` | Descrição em bloco multilinha + integrar `ExpenseDocumentPreview` |
| `src/components/expenses/ExpenseDocumentPreview.tsx` | **Novo** — lista, signed URL, lightbox imagem/PDF |
| `src/hooks/useExpenses.ts` | Selecionar `file_path/file_name/mime_type` em `expense_documents` |

## Critérios de aceite

1. Clicar numa despesa abre o detalhe com a descrição **completa**, quebrando linha sem `…`.
2. Se houver comprovantes, aparece grid com thumb (imagem) ou ícone PDF + botão "Visualizar".
3. Clicar em "Visualizar" abre o arquivo em modal (imagem) ou nova aba (PDF).
4. Funciona para os 3 documentos do bucket privado, sempre com signed URL fresca de 1h.
5. Mobile: lightbox abre como Drawer; desktop: como Dialog.

