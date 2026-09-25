# Agenda da Zélia abrindo em junho em vez do mês atual

## O que já foi verificado
- Conta usada: zelia.savoldi@hotmail.com (gestora, vê todos os eventos da organização, com acesso ao planejamento).
- Há eventos em setembro de 2026 (51 concluídos + 15 planejados), então a regra do mês inicial deveria escolher setembro.
- Junho de 2026 é o primeiro mês com eventos do ciclo (2 eventos). Ou seja, a agenda está caindo no "primeiro mês do ano" em vez do "mês atual".
- Esse recuo para o primeiro mês acontece em três caminhos do código: quando a URL traz apenas o ano (`timelineYear=2026` sem mês), quando o mês em foco some da lista durante o carregamento, e na versão de celular, que tem cálculo próprio de mês inicial.

A causa exata ainda não foi confirmada: o primeiro passo é reproduzir entrando como a Zélia.

## Etapas
1. **Reproduzir como a Zélia** (preciso da sua aprovação para abrir o preview com a conta dela): abrir a Agenda FenaSoja no computador e no celular (393 px), registrar a URL final, o mês em foco e se algum filtro, visão salva ou link com ano está sendo aplicado.
2. **Corrigir a causa confirmada**, sem mexer em dados ou permissões:
   - Quando só o ano vier indicado e for o ano atual, abrir no mês atual (ou no próximo com eventos), nunca no primeiro mês do ano.
   - Durante o carregamento, se o foco precisar ser recalculado, usar o mês atual e não o primeiro mês.
   - Alinhar a versão de celular com a mesma regra.
   - Links que apontam para um mês específico e a navegação feita pela própria usuária continuam sendo respeitados.
3. **Validar**: carga limpa como a Zélia em desktop e celular deve abrir em setembro de 2026 expandido; "Ir para hoje", troca de ano e links diretos continuam funcionando; testes da agenda passam. Nada publicado.

## Detalhes técnicos
- Arquivos prováveis: `src/hooks/useTimelineCycleNavigation.ts` (fallbacks `firstMonthByYear` em `resolveDesiredMonth`, efeito de reconciliação e caminho `external`), `src/components/cronograma-eventos/mobile/MobileCronogramaTimeline.tsx`, e o ponto que grava `timelineYear` na URL/armazenamento local.
- Regra única: para o ano corrente, fallback = `getInitialTimelineMonth(events, todayKey)`; para outros anos, primeiro mês daquele ano.
- Testes em `src/test/cronogramaTimeline.test.tsx` cobrindo: URL só com ano atual, dados chegando parcialmente e mobile.
