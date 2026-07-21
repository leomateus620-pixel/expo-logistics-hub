## Plano de correção

1. **Corrigir a perda de foco ao digitar em Sub-evento**
   - Ajustar `CronogramaSubeventForm` para usar uma identidade local estável para cada subevento em rascunho.
   - Hoje a chave do item muda conforme o título digitado, o que remonta o campo a cada letra e derruba o foco.
   - Manter o suporte a reordenação sem recriar inputs durante a digitação.

2. **Salvar subeventos pelo caminho oficial relacional**
   - Trocar o fluxo legado de inserção direta em `cronograma_subeventos` pelo RPC `cronograma_save_subevent`, que já deriva `org_id` a partir do evento pai.
   - Isso elimina o erro `null value in column "org_id"` sem abrir brecha de segurança ou depender de `org_id` enviado manualmente pelo formulário.
   - Ajustar criação/edição/exclusão/reordenação para manter o evento principal e seus subeventos sincronizados após salvar.

3. **Persistir subeventos criados dentro do cadastro/edição do evento**
   - Ao salvar um evento com subeventos preenchidos no formulário principal, salvar primeiro o evento principal e depois gravar os subeventos relacionais vinculados ao `id` persistido.
   - Evitar que subeventos novos fiquem apenas no JSON legado quando o evento já está no novo modelo relacional.
   - Preservar compatibilidade com registros antigos já existentes.

4. **Restaurar vínculos de comissões e responsáveis na edição**
   - Alterar a leitura do cronograma para usar os dados agregados de `cronograma_eventos_full` ou buscar as tabelas relacionais junto dos eventos.
   - Mapear corretamente `commissions_rel` e `responsibles_rel` para `commissionsRel` e `responsiblesRel` no frontend.
   - Garantir que o formulário de edição mostre todas as comissões/responsáveis já vinculados, inclusive principal/participante.

5. **Ajustar payloads do formulário para as RPCs**
   - Fazer `visualEventToDraft` / `visualEventToSourceUpdates` enviarem `commissions`, `responsibles` e `lock_version` quando disponíveis.
   - Garantir que os vínculos relacionais substituam o fallback antigo sem perder `commission_name`, `responsible_name` e dados legados.

6. **Data e horário de subevento**
   - No `CronogramaSubeventForm`, preencher automaticamente a data do evento principal ao adicionar um novo subevento.
   - Adicionar campos de horário de início/fim para o subevento na UI.
   - Como a tabela atual guarda datas e o banco ainda não possui colunas próprias de horário para subevento, salvar o horário de forma compatível no texto/descrição ou, se necessário, propor uma pequena migration para campos `start_time`/`end_time` antes de implementar a persistência estruturada.

7. **Validação**
   - Atualizar/expandir testes de `cronogramaRpc.test.ts` e testes do formulário para cobrir:
     - digitação sem perda de foco;
     - criação de evento com subevento vinculado;
     - edição mostrando comissões/responsáveis existentes;
     - criação de subevento sem erro de `org_id`.
   - Fazer verificação visual no fluxo `/cronograma-eventos`: criar evento, digitar subevento, salvar, reabrir edição e confirmar vínculos/subeventos carregados.