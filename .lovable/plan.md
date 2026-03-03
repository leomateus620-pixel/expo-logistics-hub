

# Plano: 3 Alterações (Equipe lista, Evento recorrente, E-mail condicional)

## 1. TeamPage — Layout em lista/planilha com scroll

Substituir o grid de cards (`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) por uma tabela/lista com scroll horizontal e vertical.

**Estrutura:**
- Tabela com colunas: Avatar+Nome, Cargo, Telefone, Comissão, Pendentes, Concluídas, Status, Ações (editar/excluir/ver escala)
- Container com `overflow-auto max-h-[70vh]` para rolagem
- Header fixo com `sticky top-0`
- Linhas compactas, responsivas
- Manter todos os dialogs existentes (comissões, adicionar, editar, escalas)

**Arquivo:** `src/pages/TeamPage.tsx` — linhas 368-429 (substituir grid por tabela)

## 2. AgendaPage — Opção "Repetir diariamente" ao criar evento

Adicionar um checkbox/switch "Repetir diariamente" no formulário de criar/editar evento.

**Lógica:**
- Adicionar campo `repetir_diariamente` ao estado do form
- No `handleSave`, se marcado, criar eventos para os próximos N dias (ex: 7 dias) com mesmo horário, incrementando a data
- Usar um Switch ou Checkbox abaixo do campo Categoria/Tag
- Não precisa de mudança no banco — cria múltiplos registros na tabela `events`

**Arquivo:** `src/pages/AgendaPage.tsx`

## 3. TeamPage — E-mail obrigatório apenas para comissão "LOGÍSTICA, HOTELARIA E TURISMO"

No formulário "Adicionar Membro", condicionar a obrigatoriedade do e-mail e senha:
- Se a comissão selecionada for "LOGÍSTICA, HOTELARIA E TURISMO", exigir e-mail e senha
- Para outras comissões, tornar e-mail e senha opcionais
- Se não tiver e-mail, não chamar a edge function `create-user`; em vez disso, inserir diretamente na tabela `org_members` sem `user_id` vinculado (ou usar um fluxo alternativo)

**Problema:** Atualmente `org_members.user_id` é NOT NULL e referencia `auth.users`. Membros sem e-mail precisariam de um user_id. Duas opções:
- **Opção A:** Criar um usuário placeholder via edge function mesmo sem login real
- **Opção B:** Tornar `user_id` nullable no banco via migration

**Decisão:** Opção A é mais segura — manter a validação de e-mail/senha apenas visível quando a comissão for "LOGÍSTICA, HOTELARIA E TURISMO", mas para outras comissões gerar credenciais automáticas (e-mail genérico + senha aleatória) silenciosamente, já que o membro não precisará fazer login.

**Ajuste no formulário:**
- Observar `addForm.commission_id` e comparar o nome da comissão selecionada
- Se for "LOGÍSTICA, HOTELARIA E TURISMO": mostrar campos de e-mail e senha como obrigatórios
- Caso contrário: ocultar campos de e-mail/senha e gerar automaticamente no `handleAdd`

**Arquivos:** `src/pages/TeamPage.tsx`

---

## Resumo de arquivos alterados
- `src/pages/TeamPage.tsx` — layout tabela + e-mail condicional
- `src/pages/AgendaPage.tsx` — checkbox repetir diariamente

