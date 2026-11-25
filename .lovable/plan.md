# Gastronomia 2028 — plano de implantação da recuperação de vendas e contratos

## Escopo desta etapa

Registrar somente a revisão e o roteiro da implantação no projeto Fenasoja Log. Não executar SQL, alterar código ou configurações, criar projeto adicional nem publicar aplicação ou funções. O único arquivo produzido nesta etapa é este registro de plano.

**A implantação permanece reservada à aprovação da PR e à autorização expressa da execução coordenada. Aprovar este registro não autoriza aplicar a migração.**

## Entrega informada

- Repositório conectado indicado: `leomateus620-pixel/expo-logistics-hub`.
- PR: https://github.com/leomateus620-pixel/expo-logistics-hub/pull/259.
- Commit de referência: `97d33b8a45a47506010a72a021d893964ed6b391`.
- Objetivo: recuperar vendas e contratos da Gastronomia 2028, preservando o pedido conjunto, a situação da assinatura, os vínculos dos documentos privados e a integração com o Financeiro 2028.

Conforme informado pelo solicitante, a carga de cadastro `20261124190000` já consta no banco e o ensaio local validou o pedido conjunto de **R$ 25.375,00**, a assinatura, os vínculos do Storage privado e o Financeiro 2028. Essas informações ficam registradas como evidência fornecida, não como verificações executadas nesta etapa.

## Roteiro reservado à implantação futura

1. **Autorizar e conferir a revisão:** confirmar a aprovação da PR #259, a autorização coordenada e a correspondência do conteúdo aprovado com o commit de referência. Se a revisão mudar, conferir novamente o arquivo e seu hash antes de prosseguir.
2. **Verificar o banco ativo em leitura:** confirmar a carga `20261124190000`, consultar o histórico da migração de recuperação e registrar a situação anterior dos pedidos, contratos, assinatura e vínculos privados abrangidos. Não reaplicar a carga de cadastro.
3. **Preparar o SQL versionado:** a partir da revisão aprovada, conferir o SHA-256 da migração e gerar o envelope transacional pelo comando informado abaixo. Revisar seu alcance, registro de versão/hash e condições para evitar aplicação duplicada.
4. **Aplicar de forma coordenada:** executar somente o envelope validado no banco deste projeto, usando o mecanismo oficial e preservando a transação e o histórico da migração. Qualquer divergência de revisão, hash ou pré-condição interrompe a implantação para revisão.
5. **Validar a recuperação:** conferir o pedido conjunto de R$ 25.375,00, os itens recuperados, o estado correto da assinatura, os vínculos dos contratos no Storage privado e os valores e estados no Financeiro 2028. Validar leitura e download com sessão autorizada, sem tornar documentos públicos nem gerar assinatura ou receita indevida.
6. **Encerrar com evidências:** registrar a versão e o SHA efetivamente aplicados, os resultados antes/depois e as verificações realizadas. Confirmar que não houve duplicação, alteração fora do escopo ou publicação. Relatar separadamente qualquer teste não executado.

## Referência técnica

Migração:

```text
supabase/migrations/20261125180000_commercial_sale_recovery.sql
```

SHA-256 esperado:

```text
7bfa6e88584e3e58712ea24951e5e38b2f9467f71cb9051db79784898ef7a319
```

Comando informado para gerar o SQL transacional e incluir versão e SHA no histórico:

```sh
node scripts/gastronomy/migration-envelope.mjs --sale-recovery
```

O comando não será executado nesta etapa. O código da PR, o hash, o ensaio local e o estado do banco não foram auditados neste registro; suas conferências pertencem à implantação futura autorizada.

## Condições de liberação

- PR #259 aprovada.
- Revisão e SHA conferidos.
- Pré-condições e situação anterior verificadas no banco ativo.
- Autorização expressa para a implantação coordenada.
- Nenhuma publicação de frontend ou de funções incluída neste plano.