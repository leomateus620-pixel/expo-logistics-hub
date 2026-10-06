# Ativação do Financeiro 2028 no banco de produção

## Situação conferida
- O banco não tem nenhuma estrutura do Financeiro: nenhuma tabela, função ou coluna financeira, inclusive nas despesas. Por isso não há nada aplicado antes que possa ser repetido.
- Dados atuais: 1 organização, 10 despesas e 182 atualizações de banco registradas.
- As tabelas de comissões, membros e permissões existem com as colunas que o Financeiro usa.
- As duas correções pedidas já estão na versão em preparação e passaram no banco isolado:
  - estorno com revalidação do saldo líquido sob bloqueio, inclusive depois de uma devolução;
  - obrigação ligada a receita, patrocínio, despesa ou parcela só aceita origem real, da mesma organização e edição, com valor da origem e uma por fato.
- Resultado no banco isolado: 49 testes e 3 simulações simultâneas passaram.

## Passos
1. **Ensaio fiel antes de aplicar.** Montar o banco isolado com a estrutura real das tabelas que o Financeiro usa (organizações, membros, permissões, comissões, despesas, pedidos, parcelas e mapas), copiando só a estrutura, sem dados. Rodar:
   - a atualização duas vezes (para provar que pode ser reaplicada);
   - os 49 testes e as 3 simulações simultâneas;
   - a recuperação completa, confirmando que despesas e demais tabelas ficam iguais.
2. **Versão única para produção.** Juntar o rascunho numa só atualização, mantendo apenas a versão final de cada função e sem trechos substituídos depois. Ela contém somente:
   - as tabelas novas do Financeiro (edições, categorias, campos complementares, orçamentos e linhas, receitas, patrocínios, obrigações, movimentos e alocações, cenários, auditoria e controle de repetição);
   - colunas novas e vazias nas despesas (vínculo com a edição, previsto, realizado, vencimento e situação), com regras que só valem quando preenchidas;
   - funções de gravação e consolidação, gatilhos de sincronização das obrigações e regras de acesso;
   - dois registros de edição para a organização: "2026 · Histórico" (somente leitura, sem nenhum valor) e "2028" (operacional).
3. **Aplicar** como uma atualização registrada no histórico do banco, numa única transação: ou entra tudo, ou nada.
4. **Conferir depois de aplicar**, só com consultas de leitura:
   - objetos criados e segurança por linha ativa;
   - funções internas sem acesso direto do aplicativo;
   - nenhum acesso para visitantes sem login;
   - 10 despesas preservadas, com os campos novos vazios e situação e valores logísticos sem mudança;
   - duas edições criadas;
   - consolidação de 2028 respondendo zero, e não erro.
   - Não serão criadas movimentações, receitas ou despesas de teste em produção.
5. **Relatar** o que foi aplicado e o que ficou utilizável.

## O que não será feito
- Nada de reset, exclusão ou alteração de dados existentes, cópia de valores de 2026 ou lançamentos iniciais.
- Nenhuma permissão financeira será concedida a usuários. Hoje só administradores acessam; outras pessoas dependem de permissão financeira explícita, a ser concedida depois e só com autorização.
- As vendas, os contratos, o mapa e os demais módulos não serão alterados.

## O que fica utilizável e o que continua pendente
- **Utilizável por administradores:**
  - seleção 2026 Histórico / 2028;
  - painel de 2028;
  - orçamento por comissão e linhas;
  - receitas projetadas e confirmadas;
  - patrocínios.
- **Ainda pendente (desenvolvimento aprovado, a continuar):**
  - tela de despesas 2028;
  - telas de obrigações, pagamentos e recebimentos com comprovantes privados;
  - comercialização com a regra da Dashboard Comercial;
  - simulações;
  - relatórios;
  - tela de categorias e campos complementares;
  - local privado para guardar comprovantes.

## Recuperação
Um roteiro de recuperação guardado junto com a atualização remove, numa transação:
- os gatilhos, funções e tabelas novas do Financeiro;
- as colunas novas das despesas.

Ele só roda se as tabelas financeiras estiverem vazias e as colunas novas sem valores; se houver qualquer lançamento, ele para. Nada existente é tocado, e o roteiro só é usado com o seu pedido.

## Ponto de parada
Se o ensaio indicar mudança destrutiva, alteração de algo existente além das colunas novas nas despesas ou conflito de nome, nada é aplicado. Eu paro e informo o ponto exato.

## Detalhes técnicos
- **Arquivo da atualização:** `supabase/migrations/<timestamp>_financial_operational_2028.sql`, gerado a partir de `docs/financeiro-2028/financial_operational_2028.sql`. Ele mantém as definições finais de `financial_sync_source_obligation`, `financial_record_movement`, `financial_reverse_movement` e `financial_edition_summary`.
- **Aplicação:** via ferramenta de migração. Por estar num bloco único, uma falha em qualquer comando desfaz tudo.
- **Recuperação:** `docs/financeiro-2028/rollback_financial_operational_2028.sql`, com guarda `IF EXISTS (SELECT 1 FROM financial_* LIMIT 1) OR EXISTS (expenses com financial_edition_id) THEN RAISE`.
- **Ensaio:** `pg_dump --schema-only` é indisponível, então a estrutura das tabelas de prova vem de `information_schema`. As restrições relevantes são reproduzidas: o enum `org_role` e as chaves de `expenses`.
- **Gatilho em `expenses`:** é `AFTER UPDATE OF` apenas nas colunas novas e sai cedo quando `financial_edition_id` é nulo. Com isso, os fluxos atuais de despesas não mudam.
- **Permissões:** `REVOKE` de `PUBLIC`/`anon` em todas as funções; `EXECUTE` só para `authenticated` nas funções públicas do Financeiro. O acesso continua sendo checado por `financial_can`.
- **Pós-aplicação:** linter de segurança e consultas de verificação (`pg_policies`, `has_function_privilege`, contagem de `expenses`).
