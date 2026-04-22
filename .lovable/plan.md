

## Novo Menu: "Eventos Fenasoja"

Menu dedicado a exibir e gerenciar eventos institucionais da feira (01/05 a 10/05), com cadastro independente da Agenda de Transportes, design Liquid Glass aprimorado e controle de permissões (apenas admin/operador podem criar/editar).

### Arquitetura de dados

Para garantir **isolamento total** entre eventos institucionais e eventos da agenda, criar uma nova tabela dedicada:

```sql
CREATE TABLE public.fenasoja_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  inicio_em timestamptz NOT NULL,
  fim_em timestamptz NOT NULL,
  local text,
  tipo_tag text,
  responsavel_user_id uuid,
  commission_id uuid,
  cover_color text,           -- destaque visual do card (verde/dourado/auto)
  created_by_user_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

**RLS PERMISSIVE** seguindo o padrão do projeto:
- `SELECT`: qualquer membro ativo da org (`is_org_member`)
- `INSERT/UPDATE/DELETE`: somente roles `admin` ou `operador` (validado via `get_user_org_role`)
- Trigger `set_updated_at` para optimistic locking
- Trigger de auditoria via `audit_log`

### Migração de dados

Mover o evento existente "Evento Parlasul" da tabela `events` → `fenasoja_events` e remover o original:

```sql
INSERT INTO fenasoja_events (org_id, titulo, descricao, inicio_em, fim_em, local, tipo_tag)
SELECT org_id, titulo, descricao, inicio_em, fim_em, local, 'institucional'
FROM events WHERE id = '2d8db6fd-e17d-4e1b-8b52-74286c0cb68c';

DELETE FROM events WHERE id = '2d8db6fd-e17d-4e1b-8b52-74286c0cb68c';
```

### Novo menu na sidebar

Adicionar entre **Agenda** e **Escala** no grupo Operação:
- Rota: `/fenasoja-events`
- Ícone: `Sparkles` (ou `PartyPopper`) — destaca natureza institucional
- Label: "Eventos Fenasoja"
- Badge: contagem de eventos do dia atual
- Capability: `full_access` (visível a todos), mas **botão Criar/Editar** condicional

### Página `/fenasoja-events` (Liquid Glass Premium aprimorado)

**Layout responsivo (mobile-first):**

```
┌────────────────────────────────────────────────┐
│ Eventos Fenasoja                    [+ Novo]   │
│ Programação institucional · 01/05 → 10/05      │
├────────────────────────────────────────────────┤
│ [01] [02] [03] [04] [05] [06] [07] [08] [09]  │ ← chips dias (gold accent)
│ Sex   Sáb   Dom   Seg   Ter   Qua   Qui   Sex │
├────────────────────────────────────────────────┤
│ ╭──────────────────────────────────────────╮   │
│ │ 🌟 Evento Parlasul          [Manhã] [📍] │   │ ← card glass premium
│ │ ─────────────────────────────────────── │   │
│ │ ⏰ 05:00 — 09:00                         │   │
│ │ 📍 Etnia Italiana Parque de Exposições  │   │
│ │ 👤 Motorista Márcio Aquino · 55 9...    │   │
│ │ ─────────────────────────────────────── │   │
│ │              [Editar] [Excluir]          │   │ ← só admin/operador
│ ╰──────────────────────────────────────────╯   │
└────────────────────────────────────────────────┘
```

**Estética Liquid Glass aprimorada:**
- Cards com `backdrop-blur-2xl`, borda `gold/15`, gradiente sutil verde→transparente
- Cabeçalho do card com **stripe dourado** vertical de 3px à esquerda (acento Fenasoja)
- Hora em fonte tabular grande (text-2xl, mono) destacada à esquerda em coluna fixa
- Badge de turno (Manhã/Tarde/Noite) com ícone Sun/Sunset/Moon
- Hover/active: leve `translateY(-2px)` + sombra dourada (`shadow-[0_0_24px_-8px_hsl(var(--gold)/0.4)]`)
- Animação stagger fade-in 60ms por card (alinhado a `mem://style/visual-animations`)

**Chips de data:**
- Limitados ao período 01/05 → 10/05/2026 (sempre exibidos, mesmo sem evento)
- Dia atual com pulso dourado; dia selecionado bg-primary
- Contador de eventos abaixo do dia (ex: "3 eventos")

**Empty state premium:**
- Ícone Sparkles dourado em círculo glass
- "Nenhum evento programado para este dia"
- Botão "Criar Evento" (somente para admin/operador)

### Formulário de cadastro (Dialog Liquid Glass)

Idêntico em campos ao da Agenda (referência da imagem enviada):
- Título (uppercase, obrigatório)
- Observações (textarea livre)
- Início / Fim (DateTimePicker, restrito a 01/05–10/05)
- Local
- Comissão (opcional)
- Responsável (opcional)
- Categoria/Tag
- Toggle "Repetir diariamente (até 10/05)" — clona até o último dia do período

Validação: datas devem cair entre 2026-05-01 e 2026-05-10. Bloqueio com toast caso contrário.

### Permissões (RBAC)

Hook `useFenasojaEvents` retorna `canManage = myRole === 'admin' || myRole === 'operador'`.

- Botões **+ Novo Evento**, **Editar**, **Excluir** renderizados condicionalmente
- Validação dupla no backend via RLS (admin/operador apenas)
- Leitores (gestor/leitura) veem apenas os cards, sem ações

### Integração e isolamento

- Eventos cadastrados aqui **NÃO aparecem** na Agenda de Transportes (tabela separada)
- Evento Parlasul migrado: removido de `/agenda`, exibido apenas em `/fenasoja-events`
- Cache React Query com chave `['fenasoja-events', orgId]`, invalidação automática em CRUD
- Auditoria completa via `logAudit` (entity: `fenasoja_events`)

### QA end-to-end (antes de marcar como pronto)

1. Login como admin → criar evento dia 03/05 → aparece no card do dia 03
2. Login como operador → editar evento → mudança propagada
3. Login como gestor → vê cards mas **não vê botões** de ação
4. Confirmar Parlasul **sumiu da Agenda** e aparece em Eventos Fenasoja dia 08/05
5. Mobile (390px): cards full-width, chips horizontais com snap, dialog ocupa 90dvh
6. Desktop: grid 1 coluna centralizado max-w-3xl para legibilidade
7. Validar bloqueio de datas fora de 01–10/05
8. Reload → cache persistido, sem flicker

### Arquivos

| Arquivo | Tipo | Mudança |
|---|---|---|
| `supabase/migrations/*.sql` | Migração | Cria `fenasoja_events`, RLS, triggers, migra Parlasul |
| `src/hooks/useFenasojaEvents.ts` | Novo | CRUD + `canManage` |
| `src/pages/FenasojaEventsPage.tsx` | Novo | Página principal Liquid Glass |
| `src/components/fenasoja/EventCard.tsx` | Novo | Card glass premium |
| `src/components/fenasoja/EventForm.tsx` | Novo | Dialog de cadastro/edição |
| `src/components/Sidebar.tsx` | Edit | Adiciona item de menu |
| `src/App.tsx` | Edit | Registra rota `/fenasoja-events` |

### Critério de aceite

1. Menu "Eventos Fenasoja" visível na sidebar com badge de eventos do dia
2. Página exibe chips dos 10 dias da feira; ao clicar, lista cards do dia
3. Admin/operador conseguem criar, editar e excluir; demais perfis apenas visualizam
4. Evento Parlasul aparece em `/fenasoja-events` no dia 08/05 e **NÃO** em `/agenda`
5. Layout fluido em mobile (390px) e desktop (1280px+) com identidade Liquid Glass dourada
6. Auditoria registrada para todas as operações

