# CCPF como categoria própria na Agenda

## Objetivo
No seletor "Comissão ou Assessoria responsável", o CCPF deixa de aparecer como Assessoria (ou Comissão) e passa a ter grupo e rótulo próprios: **CCPF — Conselho Consultivo Permanente Fenasoja**, listado primeiro, com botão de seleção rápida "CCPF" ao lado de Assessorias/Comissões.

## O que muda para o usuário
- Novo grupo "CCPF" no topo da lista, separado de Assessorias e Comissões.
- Linha secundária mostra "Conselho · Marcos, Dário, Elemar e Milton" em vez de "Assessoria · ...".
- Botão rápido "CCPF" na barra Tudo / CCPF / Assessorias / Comissões / Limpar.
- Eventos já vinculados ao CCPF continuam vinculados (mesmo cadastro, sem duplicar).
- Ecossistema permanece como está (CCPF já é o nó raiz próprio).

## Detalhes técnicos
- Banco: migration ampliando a restrição `commissions_unit_type_check` para aceitar `'conselho'`, e atualização apenas da linha `slug='ccpf'` para `unit_type='conselho'` (sem tocar responsáveis, permissões ou outras unidades). Antes, conferir o `unit_type` atual do CCPF e funções/RLS que filtram por `unit_type` para não quebrar acesso.
- `src/lib/org-units.ts`: `OrgUnitType` ganha `'conselho'`; rótulos `Conselho` / grupo `CCPF`; ordem de grupos `['conselho','comissao','assessoria','externo']`.
- `useOrgCommissions.ts`, `useCronogramaRelationOptions.ts`, `OrgUnitSelect.tsx`: aceitar o novo tipo; ícone próprio (ex.: Landmark/Badge).
- Conferir `officialCommissionCatalog.ts` e `resolver.ts` para que o novo tipo continue excluído de portais e nível 4.
- Testes: atualizar `orgUnitsRegistry.test.ts` e `cronogramaKindsCcpf.test.ts` (grupo CCPF, ordem, ausência em Assessorias).
- Atualizar regra no `AGENTS.md` da Agenda. Sem publicação.
