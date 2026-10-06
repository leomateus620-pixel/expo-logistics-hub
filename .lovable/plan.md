# Ativação do encaminhamento Centro de Eventos → Restaurante (PR 185)

## Resultado esperado
Um evento salvo na Agenda Fenasoja com o local **Centro de Eventos Fenasoja** gera automaticamente um único pedido no Restaurante. O pedido mantém o criador original e fica **pendente de aprovação somente pelo Roque**. Ninguém mais aprova esse pedido, nem o administrador geral. O evento só passa a aprovado quando o Roque aprova no Restaurante. Não é criada nenhuma rota nova e a Arena fica de fora.

## O que já foi verificado
- **Ambiente:** o projeto da Fenasoja (mesmo backend do preview e do site publicado), organização **Fenasoja 2026** (`985888b8…`).
- **Migration:** ainda não foi aplicada. A tabela `venue_events` não tem as colunas `cronograma_source_*`, e o esquema privado da configuração ainda não pode ser lido. Ela é a única pendente deste trabalho.
- **Conta do Roque (confirmada por você):** `cc1fe83d-41f1-4df2-8604-9bb8b2f9abda`, "Roque Vanderlei Lugoch", vínculo ativo como gestor na Fenasoja 2026. A outra conta (`00b790ae…`, só leitura) está inativa e não será usada.
- **Permissões do Roque:** ele já tem `venue_events_access` e `venue_events_full_access`. Com o acesso completo, ele passa nas duas regras do servidor: acesso ao Restaurante e aprovação de eventos (`venue_events_approve`). Não falta nenhuma permissão. Ele não vira administrador e nenhuma conta nova é criada.
- **Destino:** existe exatamente um espaço ativo `restaurante-fenasoja`, do tipo restaurante (`4bdffcce…`), com uma unidade de reserva ativa (`cfdf3b5a…`).

## Sobre o "administrador da configuração"
O banco exige que a gravação da configuração registre um administrador ativo em `configured_by`. Isso serve **só para a auditoria**: indica quem fez a manutenção. Essa pessoa **não aprova eventos** e não aparece como aprovadora. Quem aprova é sempre e somente o responsável configurado (o Roque), e o servidor confere isso a cada aprovação. Vou registrar **Leonardo Mateus Stroschein** (`b664fc22…`, administrador ativo). Se preferir outro administrador, diga antes de aprovar.

## Etapas
1. Aplicar `20261006120000_cronograma_restaurant_bridge.sql` byte a byte, de uma vez, em transação. Se aparecer `VENUE_TRANSITION_LAYOUT_CHANGED` ou outra divergência, a migration é revertida inteira e eu paro para avisar.
2. Rodar as consultas do `responsible-preflight.sql` e conferir que a configuração ainda não existe.
3. Gravar a configuração com org Fenasoja 2026, responsável `cc1fe83d…`, ativa e `configured_by` Leonardo. O gatilho do servidor revalida o Roque e registra a alteração na auditoria. Não existe configuração anterior; se houver, ela é atualizada (revisão +1, com o estado anterior guardado na auditoria), nunca apagada.
4. Verificação sem tocar em dados reais:
   - Rodar a bateria de testes do banco (`cronograma_restaurant_bridge.test.sql`) e o teste de concorrência num Postgres isolado, local, com dados fictícios. Os pontos testados:
     - um pedido por evento;
     - pendente, com o criador original;
     - repetir a requisição não duplica;
     - falhas revertem tudo;
     - só o responsável aprova;
     - a Sala dos Voluntários continua igual;
     - nada vai para a Arena.
   - No banco real, apenas leituras: estruturas, gatilhos, permissões (sem acesso público às tabelas privadas), a regra de aprovação instalada e a configuração gravada.
   - Rodar os testes de interface da agenda e do Restaurante.

## Fora do escopo
- Nenhum evento real é criado ou alterado.
- Não há backfill nem notificação real.
- Nenhuma outra migration é aplicada.
- Nenhuma proteção é removida e nenhum histórico é apagado.
- Nada é publicado.

## Detalhes técnicos
- A aprovação passa por `venue_transition_event` → `agenda_private.require_linked_transition`. A regra exige três coisas: `auth.uid() = config.responsible_user_id`, o evento designado ao mesmo responsável, e `venue_has_capability(org,'venue_events_approve')`. Os administradores não têm atalho.
- Atenção: `enabled=false` bloqueia o encaminhamento obrigatório do Centro de Eventos (`CRONOGRAMA_RESTAURANT_CONFIGURATION_REQUIRED`). Por isso a configuração já entra ativa, logo depois da migration, para não haver uma janela em que salvar eventos do Centro falhe.
- Limite: daqui não consigo ler o e-mail das contas nem o histórico de migrations. A identidade foi confirmada pelo UUID, pelo vínculo ativo e pela sua escolha.
