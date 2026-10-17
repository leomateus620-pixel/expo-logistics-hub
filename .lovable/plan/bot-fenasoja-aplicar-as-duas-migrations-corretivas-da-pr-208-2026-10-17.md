# BOT FENASOJA: aplicar as duas migrations corretivas da PR #208

## Situação encontrada
- Os dois arquivos já estão no projeto: `20261017050000_workers_agenda_relationships.sql` (SHA começa `037c9c6f`) e `20261017060000_workers_identity_responses.sql` (SHA começa `4d11bceb`).
- O histórico oficial vai até a versão 0015. Nenhuma das duas consta nele. Isso ainda precisa ser confirmado no banco antes de aplicar.

## Etapas
1. **Origem e destino**: comparar os arquivos locais com a revisão atual da PR #208 e registrar o commit. Confirmar o projeto de destino pela configuração do repositório (`btfaumhroqtqzxomqorx`), sem expor credenciais.
2. **Conferência prévia (somente leitura)**:
   - Ver o histórico de migrations e confirmar que nenhuma das duas está registrada.
   - Confirmar que `cronograma_eventos.responsible_user_id` não existe.
   - Confirmar as colunas e os tipos usados de `cronograma_evento_responsaveis`, `cronograma_subevento_responsaveis`, `cronograma_evento_comissoes`, `cronograma_subevento_comissoes`, `commissions` e `org_members`.
   - Para cada função afetada, ler assinatura, retorno, proprietário, grants, modo INVOKER/DEFINER e `search_path`. Isso inclui os 4 leitores existentes, `workers_require_read_scope` e os helpers de sanitização.
   - Salvar essas definições e permissões em `docs/workers/bot-fenasoja/reliability/pre-apply-snapshot-2026-10-17.json`, para auditoria e recuperação. Não incluir dados de negócio.
   - Interromper se houver objetos parciais, assinaturas incompatíveis ou dependências ausentes.
3. **Aplicação**: aplicar pelo mecanismo oficial, uma de cada vez e em ordem.
   - O conteúdo é idêntico ao dos arquivos. Saem apenas `BEGIN`/`COMMIT` explícitos, se houver, porque a ferramenta já controla a transação, como nas versões 0012–0015.
   - Se a primeira falhar, a segunda não roda.
   - Depois de aplicar, conferir se o arquivo gravado é idêntico ao original.
4. **Validação pós-aplicação (banco real, leitura)**:
   - Rever definições, assinaturas e grants, comparando com o snapshot.
   - Os leitores novos devem ser SECURITY INVOKER, não executáveis por `anon` e executáveis por `authenticated`.
   - Nenhuma definição de função de Agenda pode citar `cronograma_eventos.responsible_user_id`.
   - Policies e RLS de `ai_messages` e das tabelas da Agenda devem continuar inalteradas; a contagem de mensagens deve ser preservada.
   - Os sanitizadores de `entity_ranking` e `clarification.choices` serão testados com JSON de exemplo, usando funções puras dentro de uma transação revertida. UUIDs devem ser preservados, e respostas antigas no formato versão 1 devem continuar legíveis.
5. **Validação autenticada**: com uma sessão autorizada do app, se for possível emitir uma, testar ranking de pessoas, ranking de comissões e busca por nome.
   - Comparar o resultado com o mesmo recorte da Agenda, conferindo deduplicação, subeventos e cancelados.
   - Testar acesso negado e outra organização.
   - Se não houver sessão autorizada, registrar como pendente. Uma execução administrativa não será tratada como prova de RLS.
6. **Compatibilidade publicada**: conferir se o `workers-orchestrator` publicado e o frontend já usam as novas funções e os blocos tipados.
   - Se não usarem, registrar que é preciso publicar os dois de forma coordenada.
   - Nada será publicado nem reimplantado nesta etapa.

## Fora do escopo
- Reaplicar migrations antigas, adicionar a coluna antiga, alterar dados ou policies, publicar ou reimplantar o serviço.

## Entrega
Uma tabela com arquivo | versão | situação | evidência, seguida de:
- estado anterior encontrado;
- verificações feitas, separando banco real de testes sintéticos;
- preservação de permissões e dados;
- compatibilidade com o publicado;
- pendências de homologação.
