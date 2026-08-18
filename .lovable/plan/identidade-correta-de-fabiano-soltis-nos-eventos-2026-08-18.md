# Identidade correta de Fabiano Soltis nos eventos

## Diagnóstico confirmado

- A conta de Fabiano (`soltis.fs@gmail.com`) ainda possui o nome legado **“Soltis”** nos metadados de autenticação e no perfil público, enquanto o cadastro organizacional oficial usa **“Fabiano Soltis”**.
- O histórico procura o nome do autor primeiro em `profiles`, por isso exibe “Soltis” mesmo que o `user_id` gravado esteja correto.
- A seleção e os snapshots de responsáveis aceitam nomes vindos de fontes diferentes e deduplicam parte da lista pelo texto. Isso permite nomes antigos e vínculos inconsistentes.
- Foram localizados **12 eventos** criados pela conta de Fabiano em que Djeison está como responsável principal e Fabiano não está como principal.
- Não há hoje eventos com mais de um responsável principal simultâneo.

## O que será corrigido

1. **Fonte única da identidade exibida**
   - Criar um resolvedor compartilhado de membros que priorize, por `user_id`, o registro organizacional ativo e oficial (`is_core_team`).
   - Usá-lo no cadastro, edição, seleção de responsáveis, histórico do evento e atividade do dashboard.
   - Para a conta de Fabiano, o nome final será sempre **Fabiano Soltis**, preservando a foto correta.

2. **Cadastro seguro de novos eventos**
   - Ao criar um evento, inserir o usuário autenticado como responsável principal com seu `user_id` real e nome oficial.
   - Novas pessoas continuarão entrando como convidadas; somente uma ação explícita poderá transferir o papel de responsável.
   - Antes de salvar, validar que existe no máximo um principal e atualizar o nome do vínculo a partir do cadastro organizacional, sem confiar em texto legado da interface.

3. **Seletores sem colisão de identidade**
   - Identificar e deduplicar usuários por `user_id`, não pelo nome digitado.
   - Manter pessoas externas sem conta separadas dos membros reais.
   - Evitar que homônimos ou versões como “Soltis” e “Fabiano Soltis” produzam opções erradas ou troquem a pessoa vinculada.

4. **Histórico e avatar corretos**
   - Trocar a resolução baseada em `profiles.full_name` pela identidade organizacional oficial em todos os históricos do Cronograma.
   - Exibir o avatar do autor ao lado do nome no histórico desktop e mobile, com fallback de iniciais.
   - Tornar o vínculo da foto preferencialmente baseado em `user_id`, mantendo compatibilidade com nomes externos.

5. **Correção dos dados existentes**
   - Atualizar o nome público e os metadados da conta de Fabiano para **Fabiano Soltis**.
   - Normalizar snapshots antigos do próprio Fabiano que ainda guardam “Soltis”.
   - Nos **12 eventos identificados**, substituir Djeison por Fabiano como responsável principal **somente quando o evento tiver sido criado pela conta de Fabiano**, conforme definido. Outros responsáveis históricos não serão alterados.
   - Registrar a reparação de forma auditável e não alterar eventos futuros ou atribuições intencionais fora desse recorte.

## Testes e validação

- Testar o resolvedor com registros duplicados/legados e confirmar prioridade do membro oficial por `user_id`.
- Testar criação como Fabiano: Fabiano começa como principal, demais entram como convidados e o nome salvo é “Fabiano Soltis”.
- Testar rebaixamento para convidado e transferência explícita do responsável.
- Testar histórico desktop/mobile para confirmar nome e foto oficiais.
- Consultar novamente os dados após a reparação: os 12 casos devem ter Fabiano como principal, nenhum evento pode ter dois principais e nenhuma atribuição de terceiros deve ser modificada.

## Detalhes técnicos

- Frontend: `EventForm.tsx`, resolução das opções relacionais, `useCronogramaEventos.ts`, `useCronogramaDashboardActivity.ts`, `EventDrawer.tsx`, `MobileEventScreen.tsx`, `PersonAvatar.tsx` e testes relacionados.
- Backend: migração de integridade para impedir mais de um principal por evento e operação controlada de correção dos registros existentes; atualização de dados de identidade pela ferramenta de dados, não por migração de esquema.