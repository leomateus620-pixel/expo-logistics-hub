
Diagnóstico confirmado na revisão do código, rede e replay:

- O erro do print é real e a causa já está identificada: `public_form_links` permite `SELECT/INSERT/UPDATE/DELETE` apenas para `admin` e `gestor`, mas você definiu que `operador` também deve poder gerar e administrar links. Por isso o POST retorna `403 new row violates row-level security policy`.
- A rota pública `/f/mobilidade/:token` já está isolada corretamente do app principal: está fora de `AuthGuard`, `OrgGuard` e `Layout`. Hoje ela não expõe menus nem dados privados.
- Porém a feature ainda está incompleta na arquitetura:
  - o link público só valida token; ainda não existe o formulário público funcional
  - os dados públicos ainda não ficam em camada separada/staging
  - os menus de carrinhos e patinetes ainda não consomem essas autorizações
  - o painel interno conta “respondidas” por `submission_status === 'enviado'`, mas o formulário atual cria registros sem finalizar esse status
  - o fluxo atual salva formulário e membros em etapas separadas no cliente, sem atomicidade
  - os links gerados só podem ser copiados na mesma sessão; depois do refresh o token puro se perde, então a UX de distribuição fica frágil

Plano de correção e fechamento da feature:

1. Corrigir imediatamente o bloqueio de geração de links
- Criar migration para ajustar as policies de `public_form_links` e permitir `operador` em `SELECT/INSERT/UPDATE`
- Manter `anon` sem acesso direto
- Preservar o modelo com `token_hash` e índice único por comissão

2. Completar a camada pública isolada
- Criar as tabelas separadas:
  - `public_mobility_forms`
  - `public_mobility_members`
  - `public_form_audit`
  - `mobility_authorizations`
- Manter o app principal separado: formulário público grava apenas nessa camada isolada
- Preservar snapshots de comissão/presidente para histórico

3. Implementar o formulário público completo
- Evoluir `PublicMobilityFormPage.tsx` para:
  - carregar comissão/presidente pelo token
  - permitir preencher responsável operacional
  - marcar carro elétrico/patinete
  - adicionar integrantes dinamicamente
  - validar duplicidade por comissão + modal
  - enviar com estados claros: inválido, inativo, sucesso, erro, já enviado, edição permitida
- Layout continua isolado, sem qualquer navegação interna

4. Criar backend seguro para submissão e sincronização
- Manter `resolve-public-link`
- Criar função de submissão pública para gravar staging com segurança
- Criar sincronização idempotente para popular `mobility_authorizations`
- Se o formulário for reenviado, atualizar sem duplicar
- Registrar auditoria da origem pública e da sincronização

5. Integrar com os menus internos corretos
- Atualizar `ElectricCartsPage.tsx` para consumir autorizações de carro elétrico
- Atualizar `ScootersPage.tsx` para consumir autorizações de patinete
- Adicionar filtros por comissão, nome, status, QR gratuito, origem
- Permitir liberar/bloquear e exportar CSV a partir da base consolidada

6. Corrigir bugs e UX do módulo atual
- Ajustar `MobilityForm.tsx` para finalizar o status corretamente no fluxo interno
- Evitar criação parcial de formulário + membros
- Melhorar feedback de erro e sucesso
- Resolver a UX de links gerados:
  - exibir os links recém-gerados para cópia/download imediato
  - oferecer regeneração segura por comissão quando necessário
- Revisar o warning de `Select` reportado no console durante o fluxo do formulário

Arquivos que devem ser alterados
- `supabase/migrations/...sql`
- `supabase/functions/resolve-public-link/index.ts`
- nova função para submissão pública
- nova função de sincronização
- `src/hooks/usePublicFormLinks.ts`
- `src/hooks/useMobilityForms.ts`
- `src/hooks/useMobilityMembers.ts`
- novos hooks para formulários públicos/autorizações
- `src/components/mobility/MobilityLinksPanel.tsx`
- `src/components/mobility/MobilityAdminPanel.tsx`
- `src/components/mobility/MobilityForm.tsx`
- `src/components/mobility/MobilityMemberRow.tsx`
- `src/pages/PublicMobilityFormPage.tsx`
- `src/pages/ElectricCartsPage.tsx`
- `src/pages/ScootersPage.tsx`

Resultado esperado após implementação
- operador conseguirá gerar links sem erro de RLS
- o público acessará apenas a rota pública isolada
- o formulário público ficará realmente separado do sistema principal
- os dados serão persistidos em camada isolada e sincronizados de forma rastreável
- carrinhos e patinetes passarão a consumir automaticamente essas autorizações
- o fluxo completo ficará consistente, sem retrabalho manual e com melhor UX operacional
