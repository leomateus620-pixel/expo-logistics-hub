# Ensaios de persistência ainda não executados

Nenhuma alteração foi aplicada ao Supabase pelo Codex. Não há resultado de execução SQL local ou remota nesta entrega. `evidencias/sql-sintaxe.json` é exclusivamente um resultado de parser.

O Lovable deve criar um projeto PostgreSQL/Supabase descartável com as migrations compatíveis, PostGIS, organização/projeto/usuário fictícios e capacidade explícita map.admin. Preparar o inventário antigo com as 95 parcelas, sete vias afetadas e os apoios reais simulados. Respeitar RLS e a identidade auditável; usar executor de manutenção autorizado, pois authenticated só pode ler a tabela de snapshots. Não usar UUIDs reais em fixtures públicas.

Para cada cenário, executar `BEGIN;`, carregar o payload resolvido de teste, rodar `migration_proposta.sql` e verificar resultado. Nas exceções, o esperado é transação abortada e nenhum efeito persistido. O inventário inicial deve ser produzido no banco descartável pelo seed antigo compatível; nunca rodar bootstrap global como atualização no projeto vivo.

| Cenário | Preparação e resultado esperado |
| --- | --- |
| Formulário entregue | UUIDs nulos/aprovações falsas; bloqueio antes de modificar entidades |
| Ambiente errado | org/projeto/segmento divergente; MAP_PERMISSION_DENIED ou WRONG_SEGMENT |
| Privilégios | Usuário sem map.admin ou sem acesso à manutenção; abortar, sem relaxar RLS |
| Versão concorrente | Alterar geometria, updated_at ou active_version após preflight; conflito explícito |
| Colisão de número | Inserir o código final em entidade/lot não incluído, inclusive arquivado; colisão bloqueada |
| Ciclo de renumeração | Trocar códigos entre UUIDs fictícios preservados; etapa temporária por UUID resolve o ciclo sem mover vínculos |
| R-56 crítico | Preservar UUID do antigo R-56 somente no destino físico aprovado R-62; novo R-56 deve ter outro UUID e 249,03 m² |
| Divisão sem vínculos | Alocar pais/filhos autorizados; pais arquivados, filhos novos, cada filho com linhagem e BLOCKED; nenhum preço inserido |
| Divisão ambígua | Ausência de pai, filho ou aprovação; abortar toda a transação |
| Pai com reserva | Reserva ACTIVE impede retirada; nenhuma reserva cancelada ou clonada |
| Venda ou contrato | Pai com histórico exige procedimento específico; não usar o roteiro genérico para retirar/reassociar |
| Continuidade vinculada | Aprovação explícita e has_linked_history_resolved; manter UUID e todas as linhas comerciais/valores/snapshots |
| Topologia | Geometria inválida, label fora, lote-lote ou lote-via; rejeitar antes do snapshot/aplicação |
| Apoios preservados | A proposta entregue conflita com B37/B38. Mesmo com UUIDs/aprovações preenchidos, esperar OUTSIDE_SCOPE_OR_PROTECTED_STRUCTURE_OVERLAP. Resolver a cartografia autorizada antes de testar o caminho de aplicação bem-sucedida; não retirar a proteção |
| Área sem número | Não criar R-66, não incluir 568,78 m² e não liberar venda |
| Inventário | Para fixture 108/95, conferir 116/100; para composição 111/95 equivalente, 119/100; baselines independentes |
| Linhagem e delta | Após reset lineageBaselineAt, delta inicial deve ser zero; futura divisão segue regra existente |
| Idempotência | Aplicar e COMMIT no banco descartável; repetir o MESMO payload. Esperar ALREADY_APPLIED_NO_CHANGES sem novos IDs/geometrias/preços/linhagens |
| Payload alterado | Mesma revisão com outro payload; REVISION_PAYLOAD_CONFLICT |
| Deriva posterior | Venda/preço/contrato/entidade/projeto alterado após aplicar; repetir/rollback deve abortar por deriva |
| Restauração | Sem deriva, seguir rollback_por_snapshot.md; preservar histórico e arquivar filhos, sem DELETE comercial |
| Fora do escopo | Hash dos dados externos idêntico antes/depois; nenhuma geometria/calibração global modificada |
| Publicação | Projeto não publicado até validar; releitura real por administrador e comissão; picking, busca, labels e cartão coerentes |

Guardar logs, snapshots e resultados SQL de cada cenário. O responsável deve apresentar falhas e resolver aprovações antes de propor a transação no banco vivo. A aprovação da geometria raster não autoriza marcar a validação métrica de 0,15% como aprovada.
