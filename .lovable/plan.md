
# Fase 5 — Arquitetura ✅ Concluída

## 5.4 Triggers de validação no PostgreSQL ✅
- `validate_transport()` — valida origem/destino obrigatórios, auto-preenche fim_real_em
- `validate_vehicle_usage()` — valida km_chegada >= km_saida
- `validate_guest()` — valida nome obrigatório
- `set_updated_at()` triggers garantidos em todas as 12 tabelas principais

## 5.1 Edge function `transport-lifecycle` ✅
- Centraliza create/update/delete de transportes no backend
- Inclui: criação de evento+schedule+shift, cleanup de eventos, vehicle_usage, audit log
- `useTransports.ts` simplificado — chama edge function em vez de múltiplas queries

## 5.2 Optimistic locking ✅
- Update envia `expectedUpdatedAt` para a edge function
- Edge function retorna 409 se registro foi modificado por outro usuário
- Frontend mostra toast com botão "Recarregar"

## 5.3 Service worker + persistência offline ✅
- `public/sw.js` — cache de assets estáticos, network-first para navegação
- Service worker registrado em `main.tsx`
- React Query cache persistido em localStorage via `@tanstack/react-query-persist-client`
- Dados sobrevivem ao refresh do browser (leitura offline dos últimos dados)
