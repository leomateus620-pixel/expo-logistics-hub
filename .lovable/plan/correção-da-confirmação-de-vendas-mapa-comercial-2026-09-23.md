# Correção da confirmação de vendas — Mapa Comercial

## Causa confirmada (verificada no banco em uso, 23/09/2026)

A função de venda que está **de fato instalada** no banco do aplicativo grava o nome do vendedor assim:

```sql
coalesce((SELECT nome FROM public.profiles WHERE id = auth.uid()), 'Equipe comercial')
```

A tabela de perfis tem apenas as colunas `id`, `user_id`, `full_name`, `created_at` — não existe `nome`, e o vínculo com o usuário logado é `user_id`, não `id`.

Consequência: toda confirmação de venda quebra no momento de gravar a venda de cada espaço (coluna inexistente), a transação inteira é revertida e o app mostra a mensagem genérica "Venda não concluída — nenhum espaço foi alterado". Isso explica os três casos relatados (pavilhão B1 e lotes Q-J), porque o erro acontece depois da validação de preço, para qualquer espaço.

Segundo ponto: no app, o erro do banco é convertido só em texto amigável; código, detalhe e dica técnica são descartados, o que impede diagnóstico.

## O que será corrigido

### 1. Banco (nova migração, sem recriar tabelas)

Nova migração com `CREATE OR REPLACE FUNCTION` sobre a **definição atual instalada** (mantendo assinatura, elegibilidade por `commercial_sale_eligibility`, travamento de linhas, recálculo de preço no servidor, conferência de total e parcelas, histórico, auditoria e atualização de status).

Mudança mínima: resolver o nome do vendedor **uma vez**, em variável local, logo após validar a sessão:

```sql
v_salesperson_name := coalesce(
  (SELECT nullif(btrim(p.full_name), '') FROM public.profiles p WHERE p.user_id = auth.uid()),
  'Equipe comercial'
);
```

`salesperson_user_id` continua sendo o usuário autenticado; o nome do expositor nunca substitui o do vendedor. Perfil ausente ou nome vazio cai no texto padrão. Nenhuma coluna nova, nenhuma permissão ampliada, RLS intacta, tudo continua em uma única transação.

Antes da migração: varredura das demais rotinas ativas em busca do mesmo padrão (`profiles ... nome`, `profiles ... WHERE id = auth.uid()`), reportando o que for encontrado sem corrigir fora do escopo sem aviso.

### 2. App (tratamento de erro)

Em `salesService.ts`:
- Erro tipado próprio que carrega mensagem segura para a tela **e** dados técnicos (código, detalhe e dica sanitizados, operação, identificador de correlação, etapa, quantidade de espaços).
- Classificação distinta: regra comercial, erro interno de banco, sessão/permissão e falha de comunicação — cada uma com texto próprio na tela.
- Registro técnico via console estruturado (`commercial_sale_order_failed`), sem token, documento, telefone, e-mail ou conteúdo de linha pessoal.
- Validação do identificador devolvido pela função: retorno nulo ou inválido não é tratado como sucesso.

Em `useSalesCheckout.ts` / `SalesCheckoutDialog.tsx`:
- Falha preserva formulário e seleção (já ocorre; será coberto por teste).
- Em falha indeterminada (tempo esgotado / resposta perdida) não afirmar "nenhum espaço foi alterado": manter a mesma chave de idempotência e orientar nova tentativa, que reaproveita o pedido em vez de duplicar.

### 3. Testes

- Teste de integração contra o banco real de testes, com perfil cujo `id` é diferente de `user_id`: a consulta antiga falha, a nova funciona; nome preenchido, nome vazio e perfil ausente.
- Confirmação de que `salesperson_user_id` é o operador e `salesperson_name` vem do perfil certo.
- Reprodução dos três cenários com espaços fictícios e precificação equivalente (nunca os espaços reais, nunca os dados pessoais das capturas): um espaço e vários espaços, as duas etapas, à vista e parcelado, conferindo total por item, total do pedido, área e fechamento das parcelas.
- Falhas: sem permissão, sessão inválida, espaço indisponível, sem preço, total divergente — confirmando ausência de pedido/venda/parcela/histórico órfãos.
- Concorrência: duplo clique, reenvio com a mesma chave e duas tentativas simultâneas no mesmo espaço.
- App: preservação do código técnico, mensagem segura, dados mantidos após falha, botão bloqueado durante envio, mapa atualizado só após confirmação válida, persistência conferida por nova leitura.
- Rodar testes, verificação de tipos, análise de código e build.

### 4. Documentação

`docs/diagnostics/fenasoja-sales-confirmation-2026-09-23.md` com ambiente analisado, evidência sanitizada, causa confirmada, alteração SQL, arquivos tocados, testes executados com resultado, pendências e orientação de implantação.

## Fora do escopo

Geometria, áreas oficiais, tabela de preços, cadastro de espaços, modelos 3D, aparência dos diálogos e qualquer módulo não ligado à venda. Nada será publicado em produção.
