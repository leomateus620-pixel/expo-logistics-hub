# Mapa Comercial Fenasoja — arquitetura e implantação

## Objetivo e princípio de segurança

O módulo transforma a planta oficial de 2024 em uma base cartográfica editável e em um fluxo comercial auditável. A imagem anexada é tratada como referência visual, nunca como levantamento métrico. Por isso:

- nenhuma unidade da imagem foi promovida automaticamente a lote vendável;
- somente `SELLABLE_LOT` e `INTERNAL_STAND` podem entrar no fluxo comercial;
- todas as 62 estruturas iniciais estão em `NEEDS_REVIEW`, sem área oficial e sem preço;
- área cartográfica, área calculada após calibração e área oficial validada permanecem campos distintos;
- toda mudança sensível ocorre em RPC transacional, com permissão repetida no banco.

## Auditoria do sistema existente

A implementação reutiliza a arquitetura já presente:

- React 18, Vite e React Router;
- `AuthProvider`, `AuthGuard`, `OrgGuard` e `CapabilityGuard`;
- organização atual e papéis existentes (`admin`, `gestor`, `operador`, `leitura`);
- cliente Supabase único em `src/integrations/supabase/client`;
- TanStack Query para estado persistido e invalidação após mutações;
- Zustand somente para câmera, seleção, filtros, camadas e rascunhos locais;
- componentes shadcn/Radix e o `Layout` autenticado atual;
- Vitest e ESLint existentes.

Não foi criado um segundo cliente Supabase, fluxo de autenticação, layout ou sistema de permissões.

## Rota e autorização

A rota autenticada é `/mapa-comercial`, fora de Comissões. O menu “Mapa Comercial” aparece no grupo Operação. O login direto preserva a URL de retorno, e uma conta apenas com `map.view` é encaminhada para o mapa.

| Capacidade | Uso |
| --- | --- |
| `map.view` | projeto, camadas, entidades e situação pública dos lotes |
| `map.edit` | auditoria e manutenção de entidades |
| `map.edit_geometry` | editor vetorial e calibração |
| `map.manage_lots` | cadastro, dados comerciais, divisão e mesclagem |
| `map.manage_sales` | reserva, negociação e venda |
| `map.manage_contracts` | upload, versões e URLs temporárias de contratos |
| `map.manage_layers` | manutenção de camadas |
| `map.admin` | implantação e administração cartográfica |

`admin` e `gestor` recebem as capacidades cartográficas elevadas pelo modelo de papel atual. `operador` visualiza o mapa, mas não recebe edição ou vendas automaticamente. A RLS e as RPCs usam as mesmas regras; esconder um botão não é considerado controle de acesso.

## Modelo cartográfico

O projeto usa coordenadas locais normalizadas de `120 × 67,5` unidades. Cada entidade mantém um GeoJSON `Polygon` independente de Three.js:

```text
map_project
  ├── map_calibrations (versões da escala e imagem)
  ├── map_layers
  └── map_entities (classificação e hierarquia)
       └── map_entity_geometries (geometria atual)
            └── map_geometry_versions (revisões substituídas)
```

O PostGIS materializa cada GeoJSON como geometria nativa gerada. Isso fornece validação topológica e índice GiST sem acoplar o domínio ao objeto renderizado. O banco rejeita polígonos vazios, sem área, inválidos ou sobrepostos a outro lote vendável. Limites compartilhados continuam permitidos.

As classificações cobrem lotes, estandes, pavilhões, construções, alimentação, banheiros, portões, estacionamentos, ruas, circulação, áreas verdes, árvores, água, administração, segurança, emergência, serviços, atrações, pecuária, Exporural, áreas restritas e marcos.

## Base oficial inicial

`officialReference2024.ts` contém somente estruturas de alto nível identificáveis com segurança na planta e na legenda:

- portões A1 a A6 visíveis e áreas de estacionamento;
- pavilhões e construções principais B1 a B14 visíveis;
- blocos comerciais visíveis, ainda não vendáveis;
- pista campeira, pista de remates, áreas pecuárias e Exporural;
- ruas/circulação principais;
- lago, áreas verdes e parque de diversões;
- alimentação, etnias, banheiros, segurança, emergência e apoio claramente identificáveis.

A implantação usa uma única RPC atômica. Projeto, camadas, entidades, geometrias, calibração inicial e log são confirmados juntos ou revertidos juntos.

## Calibração e áreas

O administrador seleciona dois pontos, informa uma distância conhecida e salva uma nova versão de calibração. A conversão é:

```text
unidades_por_metro = distância_no_mapa / distância_real
área_calculada_m² = área_cartográfica / unidades_por_metro²
```

Uma área calculada nunca se torna área oficial automaticamente. Preço por metro quadrado exige `area_validation_status = VALIDATED` e `official_area_sqm > 0` no navegador e novamente na RPC.

A referência também possui deslocamento X/Y, escala X/Y, rotação e bloqueio. Validar uma nova calibração recalcula as áreas cartográficas de todos os lotes ativos; invalidá-la remove essas áreas calculadas, sem tocar nas medidas oficiais.

## Cadastro e edição de lote

O editor de implantação permite traçar uma unidade sobre a referência, definir identificador, nome, classificação, bloco, estrutura superior, medidas documentadas e preço inicial. Uma RPC cria entidade, geometria, lote, preço, histórico de status e auditoria na mesma transação.

O diálogo “Editar lote” mantém controle otimista por `updated_at`. Ele versiona o preço, preserva a versão anterior no histórico, diferencia notas comerciais/internas e atualiza características de infraestrutura sem alterar silenciosamente o status.

Antes de publicar, um administrador deve aprovar individualmente cada entidade. A aprovação exige a calibração mais recente válida e, no caso de lotes, área oficial validada. A RPC de publicação repete todos os gates e incrementa a versão do projeto.

## Geometria, divisão e mesclagem

O editor geométrico mantém rascunho, desfazer/refazer e validação no cliente. O salvamento exige motivo e versão esperada; conflito simultâneo retorna `GEOMETRY_VERSION_CONFLICT`.

### Divisão

1. O usuário escolhe eixo e posição da linha divisória.
2. O cliente produz dois polígonos e confirma preservação de área.
3. O PostGIS confirma que a união dos filhos é exatamente a origem, que os interiores não se sobrepõem e que não há invasão de outros lotes.
4. A origem é arquivada e os dois resultados são criados em `BLOCKED`/`NEEDS_REVIEW`.
5. Área oficial, preço e contrato não são copiados.
6. `map_lot_lineage` e `map_activity_logs` preservam a origem.

### Mesclagem

1. Somente lotes compatíveis com limite compartilhado aparecem como candidatos.
2. O cliente constrói a união do contorno.
3. O PostGIS confirma adjacência e equivalência exata entre a união das origens e o resultado.
4. Lotes com reserva, negociação, venda ou contrato ativo são bloqueados.
5. As origens são arquivadas e o resultado nasce em `BLOCKED`/`NEEDS_REVIEW`, sem preço ou área oficial herdados.

Essas regras evitam duplicar valor comercial ou vínculo jurídico durante uma alteração física.

## Fluxo comercial

`commercial_lots` possui estados `AVAILABLE`, `RESERVED`, `IN_NEGOTIATION`, `SOLD`, `BLOCKED` e `UNAVAILABLE`. Preços, reservas, negociações, vendas e contratos vivem em tabelas próprias.

- reserva, negociação e venda bloqueiam a linha do lote (`FOR UPDATE`);
- índices parciais impedem duas reservas, negociações ou vendas confirmadas simultâneas;
- reservas vencidas são expiradas de forma idempotente na sincronização do mapa, retornando o lote reservado a disponível e registrando histórico;
- preço por m² depende exclusivamente da área oficial validada;
- alterações de preço criam uma nova vigência em vez de sobrescrever o histórico.

## Contratos privados

Os arquivos ficam no bucket privado `map-contracts`, com limite de 15 MB e tipos PDF/DOCX. O caminho obrigatório é `org_id/lot_id/uuid.ext`, validado pela RPC contra o objeto efetivamente enviado. A tabela guarda metadados e versões; a interface usa URLs assinadas por cinco minutos. Substituir um contrato marca a versão anterior como superada, sem apagar o documento histórico.

O bucket `map-references` também é privado, aceita JPEG/PNG/WebP e limita arquivos a 25 MB.

## Renderização e experiência

A rota é carregada sob demanda. React Three Fiber e drei renderizam extrusões a partir das entidades estruturadas, com câmera superior/isométrica, foco, pan, zoom, rotação, filtros, busca, camadas, opacidade, rótulos adaptativos e modo gráfico reduzido.

A textura de trabalho usa WebP em 2.750 px (aprox. 250 KB), enquanto o JPEG oficial integral permanece preservado para conferência. O runtime 3D é um chunk lazy separado do código comercial, reduzindo o JavaScript específico da rota para aproximadamente 133 KB minificados.

Há uma tabela sincronizada para acessibilidade e fallback WebGL. No celular, detalhes usam painel inferior e controles compatíveis com toque/safe area. Estados comerciais combinam texto, símbolo, borda e cor.

## Implantação

1. Aplicar `20260710010000_create_commercial_map.sql` primeiro em homologação.
2. Confirmar que a extensão PostGIS está instalada no schema `extensions`.
3. Executar testes de RLS com contas de cada papel/capacidade.
4. Regenerar os tipos Supabase; o serviço usa um cast local documentado enquanto a migration ainda não existe no snapshot versionado.
5. Atribuir capacidades específicas às contas comerciais que não sejam `admin`/`gestor`.
6. Abrir `/mapa-comercial` e executar “Iniciar implantação”.
7. Carregar a referência oficial de melhor resolução, calibrar e validar.
8. Revisar as 62 entidades iniciais antes de publicar o projeto.
9. Traçar cada lote/estande a partir de cadastro e medição oficiais.

Não há nova variável de ambiente. As credenciais Supabase existentes continuam sendo usadas.

## Validação manual ainda obrigatória

- limites e identificadores de todos os lotes individuais dos blocos A–S;
- estandes internos de cada pavilhão;
- medidas, testadas, profundidades e áreas oficiais;
- portão A7, estruturas pequenas e itens parcialmente ilegíveis na imagem;
- hierarquia exata de blocos/pavilhões;
- posição fina de ruas, passeios, vegetação e apoio;
- nomes empresariais presentes na edição de 2024, que não devem virar cadastro permanente sem confirmação;
- levantamento de uma distância real para a primeira calibração válida;
- eventual georreferenciamento futuro.

## Verificações executadas nesta entrega

- TypeScript sem emissão;
- ESLint focado em todo o módulo e integrações alteradas;
- 32 testes Vitest;
- parser PostgreSQL 17 aceitando as 163 instruções da migration;
- build Vite de produção;
- inspeção visual desktop e mobile, incluindo seleção, tabela sincronizada e fallback de autenticação.

O lint integral do repositório ainda contém dívida anterior fora do módulo. A migration não foi aplicada a uma instância local porque o ambiente não oferece PostgreSQL/Docker; por isso, a homologação com RLS e Storage reais permanece um gate obrigatório de publicação operacional.
