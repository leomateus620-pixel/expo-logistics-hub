# Portais Exporural e Indústria, Comércio e Serviços

## Atualização cartográfica Exporural 2026.4

A revisão local `2026.4-exporural.1` substitui a geometria Exporural 2026.3 pela reconstrução baseada na planta oficial e nos recortes de detalhe recebidos em 11/08/2026. O mapa completo, o filtro Exporural e o portal vinculado continuam consumindo a mesma referência canônica; nenhuma rota, guard ou regra de navegação foi alterada.

O inventário-base Exporural passa a **111 entidades / 95 lotes**. A redução de cinco entidades corresponde somente a `B35` (Simulador AGCO), `B36` (Palco Semear) e `D6-01` a `D6-03` (Food Trucks). Os 95 lotes permanecem, inclusive `Q-S-17` e `Q-R-52` a `Q-R-55`, que formam o substrato cadastral sob esses overlays.

A migration aditiva `20260811153000_apply_exporural_reference_2026_4_fidelity.sql` versiona as geometrias, arquiva somente esses cinco apoios após preflight e atualiza resolver, atribuição canônica, RPC auditada e baseline 111/95. Sua aplicação e a validação autenticada no projeto Supabase correto continuam **NO-GO** até a execução dos gates remotos desta página. O manifesto de fontes e a matriz de validação específica estão em `EXPORURAL_CARTOGRAPHIC_FIDELITY_2026_4.md`.

Evidência local 2026.4: 140/140 testes focados aprovados em 21 arquivos; type-check, ESLint tocado e build aprovados; migration aceita pelo `pglast` (23 statements); Canvas corrigido validado em 1440 × 900 e 480 × 844 nas vistas superior e isométrica. A suíte global manteve 635 testes aprovados e 29 falhas herdadas exclusivamente nos quatro arquivos de Cronograma fora do diff.

## Situação da entrega

Evidência histórica da referência oficial 2026.3, anterior à correção 2026.4: migrations aplicadas e inventário/isolamento validados com sessões reais em 05/08/2026:

- projeto cartográfico `0538d132-34dd-4347-a33c-526edac7339c`, revisão `2026.3`, 13 camadas, 415 entidades, 262 lotes;
- `validate_commercial_map_segments`: `exporural` 116 entidades / 95 lotes e `industria-comercio-servicos` 140 entidades / 103 lotes, `complete = true`, geometria vigente 1:1, `invalidSegmentReferences = 0`, `exclusiveAssignmentConflicts = 0`;
- admin: enxerga os dois segmentos com contagens exatas;
- usuário `leitura` sem capacidade: 0 entidades, 0 lotes, RPC de inventário nega com `MAP_PERMISSION_DENIED`;
- usuário com apenas `exporural_access`: 116/95 no Exporural, 0 no segmento oposto, `map_calibrations` invisível (capacidade de teste revogada em seguida);
- suítes `commercialMapSegments`, `commissionMapPortals`, `commissionMapSidebar` e `commissionMapMigration.contract`: 21 testes aprovados.

Pendência conhecida: `publish_commercial_map` exige calibração validada (`VALIDATED_CALIBRATION_REQUIRED`); os portais de comissão não dependem da publicação, mas o mapa completo permanece não publicado até a calibração ser validada.



## Rotas, autenticação e navegação

| Portal | Login dedicado | Destino protegido | Capacidade específica |
| --- | --- | --- | --- |
| Exporural | `/login/exporural` | `/comissoes/exporural/mapa-comercial` | `exporural_access` |
| Indústria, Comércio e Serviços | `/login/industria-comercio-servicos` | `/comissoes/industria-comercio-servicos/mapa-comercial` | `industria_comercio_servicos_access` |

- O formulário continua usando o fluxo real de `useAuth().signIn`; não foi criada autenticação paralela, callback alternativo ou credencial local.
- Cada destino passa, nesta ordem, por `AuthGuard`, `OrgGuard` e `ModuleAccessGuard` antes de montar o layout e o mapa da comissão.
- O redirecionamento pós-login preserva o destino dedicado. Slugs desconhecidos falham com segurança e retornam ao portal, sem abrir um módulo por aproximação.
- A sidebar de cada comissão é gerada pelo registro central e contém somente **Mapa Comercial**. No mobile, o drawer tem papel de diálogo modal, bloqueio de rolagem, fechamento por `Escape`, contenção e restauração de foco e alvos mínimos de 44 px.
- As rotas preexistentes, inclusive `/mapa-comercial`, permanecem com seus guards e contratos originais.

## Escopo persistido e ausência de vazamento

A migration `20260804090000_create_commission_map_segments.sql` cria `map_segments` e associa cada `map_entity` a no máximo um segmento canônico por `segment_id`. A fronteira de cada portal é uma união explícita das entidades classificadas; entidades desconhecidas permanecem com `segment_id = NULL` e são excluídas dos portais de comissão.

| Segmento | Inventário-base | Delimitação canônica |
| --- | --- | --- |
| Exporural | 111 entidades / 95 lotes após 2026.4 (116/95 na evidência histórica 2026.3) | Quadras R e S, vias e estruturas rurais explicitamente classificadas; `B35`, `B36`, `D6-01` a `D6-03`, `B7`, `B8` e `D3` excluídos |
| Indústria, Comércio e Serviços | 140 entidades / 103 lotes | Quadras M, G, L, F, J, E, I e D e suas estruturas comerciais, com lista explícita de exclusões fora do contorno aprovado |

No modo comissão:

- a consulta começa pelo registro persistido do segmento e filtra projeto, `segment_id`, entidades ativas e geometrias vigentes;
- camadas, lotes, preços ativos, reservas ativas e vendas confirmadas são buscados somente pelos IDs já autorizados do segmento;
- a calibração do parque completo é deliberadamente omitida;
- não existe fallback para referência oficial, array local ou mapa completo quando a migration, a permissão ou o segmento estão indisponíveis;
- busca, filtros, métricas, rótulos e enquadramento de câmera operam somente sobre o conjunto já isolado;
- a chave de cache inclui usuário, organização, comissão e segmento, e consultas de comissão não são persistidas, evitando reaproveitamento de estado entre escopos.

O mapa completo mantém seu fluxo anterior. O fallback oficial existente continua restrito a esse modo legado e não é reutilizado pelos novos portais.

## Permissões, RLS e inventário fail-closed

O acesso exige vínculo ativo com a organização e uma das autorizações previstas: a capacidade exata do segmento, perfil `admin`/`gestor`, `full_access` ou `admin_access`. A migration acrescenta políticas RLS para projeto, segmento, camadas relacionadas, entidades, geometrias atuais, lotes não arquivados, preços ativos, reservas ativas, vendas confirmadas e logs vinculados ao segmento. Nenhuma policy de comissão expõe `map_calibrations`.

O carregamento só prossegue quando `map_segment_is_complete` e `get_commission_map_segment_inventory` confirmam:

- contagens inteiras e positivas do baseline, ajustadas por um delta de linhagem válido;
- igualdade exata entre o inventário esperado e o persistido;
- uma geometria vigente para cada entidade ativa;
- lotes únicos e vinculados a entidades do mesmo segmento e projeto.

O cliente repete as verificações de cardinalidade e vínculos antes de renderizar. Ausência de infraestrutura, segmento vazio, geometria incompleta ou divergência de inventário produz erro bloqueante; dados do parque não substituem silenciosamente a falha.

Triggers preservam projeto e segmento em operações de linhagem, impedem troca direta entre segmentos por usuário sem `map.admin` e protegem arquivamento/remoção sem sucessor válido. Escrita direta em `map_lot_lineage` foi revogada para perfis de aplicação; divisões e fusões continuam pelo fluxo auditado existente.

## Identidade visual

- A Exporural recebeu paleta agrícola em oliva, verde profundo e dourado, tipografia editorial e o asset WebP `public/commissions/exporural-harvester.webp`. A colheitadeira sobre soja é recortada e composta exclusivamente atrás da palavra **Rural**; a parte **Expo** permanece limpa.
- Indústria, Comércio e Serviços usa composição tipográfica institucional em duas linhas, estrutura geométrica discreta e acentos azul-petróleo/dourado, sem ilustrações ou elementos decorativos concorrentes.
- Ambos reutilizam a hierarquia limpa de “Cronograma e Eventos”, preservando o formulário, feedback de erro, alternância de visibilidade da senha e estados de carregamento/sucesso.

## Evidências locais

- Parse estático da migration com `pglast`: **115 statements** aceitos.
- Testes focados dos portais, login, sidebar, escopo e contrato SQL: **50 testes aprovados**.
- Regressão dedicada do Mapa Comercial completo e dos novos segmentos: **110 testes aprovados em 18 arquivos**.
- Type-check global: aprovado.
- Build global de produção: aprovado.
- ESLint dos arquivos tocados: aprovado.
- QA em navegador: Exporural, Indústria e página inicial de acesso inspecionadas em **1440 × 900** e **480 × 844**, sem overflow horizontal; hierarquia, destinos, formulário, erros, foco e controles responsivos conferidos.
- O QA autenticado do mapa interno e das permissões por papel não foi executado, pois não havia sessão real disponível.

### Dívida global separada

- `eslint .` ainda reporta **974 erros e 33 warnings herdados** do repositório; esse resultado não é apresentado como verde.
- A rodada global atual terminou com **635 testes aprovados e 29 falhas em 4 arquivos**. Todas as falhas remanescentes estão nas suítes preexistentes de Cronograma (`cronogramaMobileOverlays`, `cronogramaMobilePresentation`, `eventHarvestCompletion` e `cronogramaTimeline`); as suítes dos portais e do mapa ficaram verdes.

## Gate de implantação — NO-GO

Não havia token Supabase, Docker local nem sessão autenticada por papel durante esta entrega. Portanto, ainda não há evidência de aplicação da migration, relatório remoto, isolamento RLS, desempenho ou comportamento autenticado no ambiente-alvo. A produção só pode receber GO depois do checklist abaixo.

1. Confirmar o projeto Supabase de destino, fazer backup e revisar a ordem das migrations. `20260726120000_apply_exporural_reference_2026.sql` deve preceder `20260804090000_create_commission_map_segments.sql`.
2. Vincular a CLI ao projeto correto, revisar o plano com `npx supabase db push --dry-run` e aplicar com `npx supabase db push`. Não executar DDL manual parcial.
3. Como `service_role`, confirmar que os segmentos existem para o projeto; se necessário, executar uma única vez:

   ```sql
   select public.ensure_commission_map_segments('<project_uuid>'::uuid);
   ```

4. Com sessão `map.admin`, executar e arquivar o resultado:

   ```sql
   select public.validate_commercial_map_segments('<project_uuid>'::uuid);
   ```

   Cada segmento deve retornar `complete = true`, contagens atuais iguais às contagens efetivas, `invalidSegmentReferences = 0` e `exclusiveAssignmentConflicts = 0`. Entidades não classificadas de outras áreas do parque devem ser analisadas, não reclassificadas automaticamente.

5. Conferir o inventário efetivo pelos RPCs protegidos:

   ```sql
   select segment.slug, inventory.*
   from public.map_segments segment
   cross join lateral public.get_commission_map_segment_inventory(segment.id) inventory
   where segment.project_id = '<project_uuid>'::uuid
     and segment.slug in ('exporural', 'industria-comercio-servicos');
   ```

6. Fazer smoke autenticado com, no mínimo: usuário somente `exporural_access`; usuário somente `industria_comercio_servicos_access`; usuário com ambas; `gestor`; `admin`; usuário sem capacidade; e ex-membro removido da organização. Cada capacidade deve enxergar apenas seu segmento, e o ex-membro deve ser negado.
7. Validar que consultas diretas às tabelas protegidas não revelam entidades, geometrias, lotes, preços, reservas, vendas, logs ou calibração do segmento oposto. Confirmar também que trocar slug/UUID, deep link ou estado em cache não amplia acesso.
8. Exercitar `split_commercial_lot` e `merge_commercial_lots` em dados descartáveis do ambiente de homologação: sucessores devem herdar projeto e segmento, o delta de inventário deve fechar e operações cruzando segmentos devem falhar. Confirmar que DML direto em `map_lot_lineage` é negado.
9. Executar `expire_commission_segment_reservations` nos dois segmentos e verificar status, histórico e log somente dentro do segmento correspondente. Se a referência Exporural precisar ser reaplicada, usar o fluxo auditado `apply_exporural_reference_2026` e repetir integralmente os itens 4 e 5.
10. Regressar `/mapa-comercial` com perfil autorizado ao mapa completo e executar `EXPLAIN (ANALYZE, BUFFERS)` nas consultas RLS críticas. Finalizar com QA autenticado desktop/mobile de login, sidebar, câmera, busca, filtros, métricas, rótulos e estados vazio/erro.

Enquanto qualquer item remoto estiver sem evidência ou falhar, o status de implantação permanece **NO-GO**.
