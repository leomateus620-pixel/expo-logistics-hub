# Reimplantar o serviço da Equipe Fenasoja (workers-orchestrator)

## Objetivo
Publicar no backend a versão atual do serviço de conversa da Equipe Fenasoja, junto com os módulos compartilhados e o registro de ferramentas gerado da mesma versão (PR #206 já na main), sem mudar configuração, autenticação ou permissões.

## Passos
1. **Conferência antes do envio (somente leitura)**
   - Confirmar que o registro gerado (`_shared/workers/generated/read-tools.js`) corresponde ao código-fonte atual das ferramentas: regenerar em pasta temporária com o script do projeto e comparar hash; se divergir, parar e relatar (não sobrescrever).
   - Registrar SHA256 de `index.ts`, `deno.json`, `deno.lock`, todos os arquivos de `_shared/workers/` e do registro gerado.
   - Conferir que as RPCs chamadas pelo registro (vendas, Agenda pessoal, ranking, inventário, Agenda filtrada, histórico por turnos, `ai_workers_finish_turn`) existem no banco (migrations 0012–0015).
   - Confirmar que `supabase/config.toml` mantém `verify_jwt = true` para `workers-orchestrator`; nenhuma edição nesse arquivo.
2. **Implantação**
   - Implantar apenas `workers-orchestrator` pela ferramenta oficial (inclui `_shared/` automaticamente). Não implantar `workers-actions`/rotinas nem alterar secrets.
3. **Validação posterior (sem criar dados de negócio)**
   - OPTIONS → 204; POST sem login → 401; POST com JWT inválido → 401.
   - Logs do serviço sem erro de inicialização/importação.
   - Se houver sessão autorizada disponível: uma pergunta de leitura simples verificando acesso permitido, `ai_workers_can_access`, ordenação pergunta → resposta e resposta estruturada (tabela/gráfico). Caso contrário, marcar como pendente.
4. **Entrega**
   - Tabela: arquivo | SHA256 | situação.
   - Resultado das validações e pendências; não declarar homologado sem teste autenticado.

## Preservado
JWT obrigatório, organização ativa, elegibilidade (admin/CCPF/Comissão Central), reconfirmação de senha, capabilities, RLS, auditoria, SECURITY INVOKER. Nenhum arquivo do projeto é alterado.

## Rollback
Se a validação falhar, relatar o erro; a versão anterior pode ser reimplantada a partir do commit anterior mediante autorização.
