# Cadastro da Fabiana (Agente de Viagem) com notificação automática em todo transporte

## Objetivo
Toda vez que **qualquer transporte for iniciado**, o sistema gera automaticamente uma mensagem de WhatsApp adicional para a **Fabiana (+55 55 99962-8546)** — Agente de Viagem — no formato customizado solicitado, exibida no `StartTripDialog` com um card 3D animado subindo. O fluxo atual de mensagens para hóspedes continua intacto.

## Arquitetura

### 1. Nova tabela `notification_recipients`
Tabela leve para cadastrar destinatários fixos que devem receber WhatsApp em todo transporte iniciado. Permite gerenciar Fabiana hoje e adicionar outros agentes/parceiros no futuro sem código.

```text
notification_recipients
├── id uuid pk
├── org_id uuid (RLS por org)
├── nome text             -- "Fabiana"
├── telefone text         -- "+55 55 99962-8546"
├── tipo text             -- "agente_viagem" (default)
├── ativo boolean         -- default true
├── notify_on_start bool  -- default true
├── message_template text -- template com placeholders
├── created_at, updated_at
```

**RLS** (mesmo padrão das outras tabelas): SELECT para membros da org; INSERT/UPDATE/DELETE para admin/gestor.

**Seed**: inserir Fabiana automaticamente na migração com o template:
```
Olá {nome_destinatario}, {motorista} aqui, estou iniciando meu deslocamento para o {destino} para buscar {hospede}, tudo certo com o voo {voo}? Se alguma alteração, me comunique! Obrigado!
```

### 2. Edge Function `transport-lifecycle` — `handleStart`
Após montar `whatsappGuests` para hóspedes, buscar `notification_recipients` ativos da org com `notify_on_start = true` e, para cada um, montar um item adicional no array `whatsappGuests` (ou novo array paralelo `whatsappRecipients`) com:

- `phone`: telefone normalizado (DDI 55)
- `message`: template com placeholders substituídos:
  - `{nome_destinatario}` → recipient.nome
  - `{motorista}` → driverName
  - `{destino}` → "aeroporto de Porto Alegre" / destinoLabel
  - `{hospede}` → primeiro hóspede (ou "o hóspede" se vazio)
  - `{voo}` → `transport.voo_numero` (ou "—")
- `url`: wa.me link
- `guestName`: recipient.nome
- `phoneValid`: bool
- `kind: 'recipient'` (novo discriminador)

Retornar tudo unificado em `whatsappGuests` para reutilizar o componente atual, marcando `kind: 'recipient'` para diferenciar visualmente.

### 3. UI — `StartTripDialog` com card 3D
- Renderizar uma seção dedicada **"Agentes & Parceiros"** abaixo dos hóspedes (Separator + título com ícone Plane).
- Para cada item com `kind === 'recipient'`, renderizar um **card 3D animado** que:
  - **Sobe da base** (`translateY(80px) → 0` + fade) com `transform-style: preserve-3d` e `perspective: 1200px`
  - Tilt suave (`rotateX(-12deg) → 0`) e leve `rotateY` em hover
  - Gradiente Liquid Glass dourado (#F2C94C) + verde-escuro (#006400) sutil + `backdrop-blur`
  - Ícone Plane (lucide) + Badge "Agente de Viagem"
  - Mensagem em fonte serif elegante dentro de um inset glass
  - Botões Copiar / Enviar no WhatsApp (mesmo padrão atual, cor verde Liquid)
  - Animação stagger: cada recipient aparece com `delay: 200ms * index` após hóspedes
- Reutilizar `GuestSection` para hóspedes; criar novo subcomponente `RecipientSection3D` para agentes.

### 4. Tela de gestão (mínima)
Adicionar na página **Configurações** (`SettingsPage.tsx`) uma seção **"Notificações Automáticas"** com:
- Lista dos recipients (nome, telefone, tipo, ativo)
- Botão "Adicionar destinatário" (dialog com nome, telefone, tipo, template editável)
- Toggle ativo/inativo
- Editar / Excluir (admin/gestor apenas)

Restrita a admin/gestor via `CapabilityGuard`.

## Detalhes técnicos

### Migração SQL
```sql
CREATE TABLE public.notification_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL,
  nome text NOT NULL,
  telefone text NOT NULL,
  tipo text NOT NULL DEFAULT 'agente_viagem',
  ativo boolean NOT NULL DEFAULT true,
  notify_on_start boolean NOT NULL DEFAULT true,
  message_template text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY nr_select ON public.notification_recipients
  FOR SELECT USING (is_org_member(auth.uid(), org_id));
CREATE POLICY nr_insert ON public.notification_recipients
  FOR INSERT WITH CHECK (get_user_org_role(auth.uid(), org_id) IN ('admin','gestor'));
CREATE POLICY nr_update ON public.notification_recipients
  FOR UPDATE USING (get_user_org_role(auth.uid(), org_id) IN ('admin','gestor'));
CREATE POLICY nr_delete ON public.notification_recipients
  FOR DELETE USING (get_user_org_role(auth.uid(), org_id) IN ('admin','gestor'));

CREATE TRIGGER nr_set_updated_at BEFORE UPDATE ON public.notification_recipients
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed Fabiana em todas as orgs existentes
INSERT INTO public.notification_recipients (org_id, nome, telefone, tipo, message_template)
SELECT id, 'Fabiana', '+5555999628546', 'agente_viagem',
  'Olá {nome_destinatario}, {motorista} aqui, estou iniciando meu deslocamento para o {destino} para buscar {hospede}, tudo certo com o voo {voo}? Se alguma alteração, me comunique! Obrigado!'
FROM public.organizations;
```

### Substituição de placeholders (edge function)
```typescript
const firstGuestName = allGuests[0]?.nome || 'o hóspede';
const vooNumero = transport.voo_numero || '—';
const message = recipient.message_template
  .replace(/\{nome_destinatario\}/g, recipient.nome)
  .replace(/\{motorista\}/g, driverName)
  .replace(/\{destino\}/g, destinoLabel)
  .replace(/\{hospede\}/g, firstGuestName)
  .replace(/\{voo\}/g, vooNumero);
```

### Card 3D (CSS-only, GPU-accelerated)
```tsx
<div
  className="relative rounded-2xl p-5 border border-amber-400/30
             bg-gradient-to-br from-emerald-950/80 via-emerald-900/60 to-amber-900/40
             backdrop-blur-xl shadow-[0_20px_60px_-15px_rgba(242,201,76,0.35)]
             animate-recipient-rise"
  style={{ transformStyle: 'preserve-3d', perspective: '1200px',
           animationDelay: `${200 * idx}ms` }}
>
  {/* glow dourado + ícone Plane + badge + mensagem + botões */}
</div>
```

Adicionar no `tailwind.config.ts`:
```ts
keyframes: {
  'recipient-rise': {
    '0%':   { opacity: '0', transform: 'translateY(80px) rotateX(-15deg) scale(0.9)' },
    '60%':  { opacity: '1', transform: 'translateY(-6px) rotateX(2deg) scale(1.02)' },
    '100%': { opacity: '1', transform: 'translateY(0) rotateX(0) scale(1)' },
  },
},
animation: {
  'recipient-rise': 'recipient-rise 700ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
},
```

## Arquivos afetados
- `supabase/migrations/<timestamp>_notification_recipients.sql` — tabela + RLS + seed Fabiana
- `supabase/functions/transport-lifecycle/index.ts` — buscar recipients e gerar mensagens (handleStart)
- `src/components/transport/StartTripDialog.tsx` — nova seção `RecipientSection3D`
- `tailwind.config.ts` — keyframe `recipient-rise`
- `src/pages/SettingsPage.tsx` — UI de gestão (CRUD básico)
- `src/hooks/useNotificationRecipients.ts` — novo hook (lista + create + update + delete)

## Garantias de não-regressão
- `whatsappGuests` mantém shape atual; novos itens só adicionam o campo opcional `kind`. Itens sem `kind` continuam renderizando como hóspedes normais.
- Se a tabela `notification_recipients` estiver vazia ou der erro, a edge function ignora silenciosamente (try/catch) — fluxo de hóspedes não quebra.
- Card 3D é puramente CSS — sem dependência nova, sem impacto em performance.
- RLS isola por org — Fabiana cadastrada na org da Fenasoja Logística não vaza para outras orgs.
