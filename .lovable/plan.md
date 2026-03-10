

# Plano: Fase 5 — Arquitetura

## 5.1 Mover regras de negócio para edge functions/DB

**Problema**: Lógica complexa vive no frontend (criação de eventos+shifts ao criar transporte, cálculo de conflito de veículos, cleanup de eventos). Isso é frágil e bypassável.

**Ação — Edge function `transport-lifecycle`**:
- Criar `supabase/functions/transport-lifecycle/index.ts` que recebe ações: `create`, `update`, `delete`
- Mover para dentro da function:
  - Criação automática de evento + schedule + shift (hoje em `useTransports.ts` linhas 21-87)
  - Cleanup de eventos ao cancelar/deletar (hoje linhas 108-122)
  - Registro de `vehicle_usage` ao concluir (hoje em `TransportsPage.tsx` linhas 534-548)
  - Audit log (hoje espalhado em cada mutation)
- Usar `SUPABASE_SERVICE_ROLE_KEY` para operações cruzadas
- Frontend chamará `supabase.functions.invoke('transport-lifecycle', { body: { action, payload } })`

**Ação — Simplificar `useTransports.ts`**:
- Cada mutation passa a chamar a edge function em vez de fazer múltiplas queries
- Remove `createEventAndShift`, `cleanupTransportEvents` do frontend

**Ação — `TransportsPage.tsx`**:
- Remover lógica de `createUsage` + `updateVehicle` do `handleEditSave` (linhas 534-548) — agora na edge function

## 5.2 Optimistic locking para edições concorrentes

**Problema**: Dois usuários editando o mesmo transporte simultaneamente podem sobrescrever dados um do outro.

**Ação — Migration SQL**:
- A coluna `updated_at` já existe em todas as tabelas relevantes com trigger `set_updated_at()`
- Precisamos apenas garantir que os triggers existam (verificar) e usar `updated_at` como version token

**Ação — `useTransports.ts` (update mutation)**:
- Incluir `updated_at` do registro original no payload
- Na edge function, antes de atualizar, verificar: `WHERE id = $id AND updated_at = $expected_updated_at`
- Se 0 rows affected → retornar erro 409 "Registro modificado por outro usuário"

**Ação — Frontend**:
- Ao receber erro 409, mostrar toast com opção "Recarregar dados"
- Invalidar query para buscar versão mais recente

## 5.3 Service worker para offline-first básico

**Problema**: Hoje só mostra banner "Sem conexão". Dados em cache do React Query se perdem no refresh.

**Ação — Criar `public/sw.js`**:
- Cache de assets estáticos (App Shell: HTML, JS, CSS, imagens)
- Estratégia: Network First para API calls, Cache First para assets
- Não interceptar chamadas ao Supabase (manter read-only offline via React Query cache)

**Ação — Registrar SW em `src/main.tsx`**:
- `navigator.serviceWorker.register('/sw.js')` com fallback silencioso

**Ação — Persistir React Query cache**:
- Usar `persistQueryClient` do `@tanstack/react-query-persist-client` com `createSyncStoragePersister` (localStorage)
- Configurar em `App.tsx` para que dados sobrevivam ao refresh

**Escopo limitado**: Não implementar write queue offline (complexidade alta). Apenas leitura offline dos últimos dados carregados.

## 5.4 Triggers de validação no PostgreSQL

**Problema**: Validações existem apenas no frontend. Dados inconsistentes podem entrar via API direta.

**Ação — Migration SQL com triggers**:

```sql
-- 1. Transporte: inicio_em obrigatório e no futuro (ou hoje)
CREATE FUNCTION validate_transport() RETURNS trigger AS $$
BEGIN
  IF NEW.origem IS NULL OR trim(NEW.origem) = '' THEN
    RAISE EXCEPTION 'origem é obrigatória';
  END IF;
  IF NEW.destino IS NULL OR trim(NEW.destino) = '' THEN
    RAISE EXCEPTION 'destino é obrigatório';
  END IF;
  IF NEW.status = 'concluido' AND NEW.fim_real_em IS NULL THEN
    NEW.fim_real_em := now();
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 2. Vehicle usage: km_chegada >= km_saida
CREATE FUNCTION validate_vehicle_usage() RETURNS trigger AS $$
BEGIN
  IF NEW.km_chegada IS NOT NULL AND NEW.km_chegada < NEW.km_saida THEN
    RAISE EXCEPTION 'km_chegada deve ser >= km_saida';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

-- 3. Guest: nome obrigatório
CREATE FUNCTION validate_guest() RETURNS trigger AS $$
BEGIN
  IF NEW.nome IS NULL OR trim(NEW.nome) = '' THEN
    RAISE EXCEPTION 'nome do hóspede é obrigatório';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;
```

- Attach triggers BEFORE INSERT OR UPDATE em `transports`, `vehicle_usage`, `guests`
- Garantir que triggers de `set_updated_at` existam em todas as tabelas

---

## Resumo de Arquivos

| Arquivo | Mudanças |
|---------|----------|
| `supabase/functions/transport-lifecycle/index.ts` | **NOVO** — lógica de negócio centralizada |
| `supabase/config.toml` | Registrar nova function |
| `src/hooks/useTransports.ts` | Simplificar mutations para chamar edge function |
| `src/pages/TransportsPage.tsx` | Remover lógica de vehicle_usage do handleEditSave |
| `public/sw.js` | **NOVO** — service worker para cache de assets |
| `src/main.tsx` | Registrar service worker |
| `src/App.tsx` | Adicionar persistência do React Query cache |
| Migration SQL | Triggers de validação + verificar `set_updated_at` |

## Ordem de Execução

1. **5.4** — Triggers de validação (DB-only, zero risco no frontend)
2. **5.1** — Edge function `transport-lifecycle` + simplificar hooks
3. **5.2** — Optimistic locking (depende de 5.1)
4. **5.3** — Service worker + persistência de cache (independente)

## Dependência externa

- Pacote `@tanstack/react-query-persist-client` precisa ser instalado para 5.3

