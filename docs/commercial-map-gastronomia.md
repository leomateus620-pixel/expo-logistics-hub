# Gastronomia no Mapa Comercial 2028

No Mapa Comercial, abra **Segmentos → Gastronomia** e escolha uma estrutura no mapa ou na lista. Toque em um ponto para consultar o código, o tipo quando cadastrado, o preço e a situação. No modo **Vendas**, marque os pontos disponíveis e selecione **Adicionar à venda**. O carrinho móvel tem fundo opaco, controle de etapa e botão para fechar e voltar ao mapa.

O checkout usa Expositor → Pagamento → Revisão. A venda registrada fica em aberto e o ponto passa a vendido na confirmação autorizada da assinatura. O detalhe da Dashboard permite localizar cada ponto no mapa, revisar o pedido e anexar um arquivo a um ponto ou a vários espaços da venda. A página da comissão usa a capability `gastronomia_access`. A leitura do mapa geral usa `map.view`.

Em **Dashboard Comercial → Áreas externas → Gastronomia**, abra uma estrutura para ver contagens, valores e pontos. **Vendas e contratos** abre a lista filtrada pelo segmento. Os valores do recorte e do consolidado vêm do mesmo inventário e das vendas registradas. A metragem comercial considera os espaços com cobrança por área.

## Cadastro inicial conferido

Os preços são da coluna J (`TOTAL`) da aba `Plan1` da planilha de comercialização 2028. Os dois pontos da Alameda preservam a numeração original 2 e 3 em `price_source`. Os tipos do Mirante permanecem nulos.

| Estrutura | Código | UUID do ponto no Fenasoja Log | Ponto | Origem | Preço por ponto |
| --- | --- | --- | --- | --- | ---: |
| C1 · Centro de Eventos Fenasoja | `GAST-C1-01` | `eb1c7b26-0af4-4fcf-886a-52702eb62543` | Restaurante Fenasoja | J3 | R$ 85.107,00 |
| C2 · Restaurante | `GAST-C2-01` | `02de3f62-958e-46c2-95c9-ab445c552a64` | Restaurante Central | J4 | R$ 50.107,00 |
| C2 · Restaurante | `GAST-C2-02` | `24ef0960-d488-43ba-a845-e321f0db42f1` | Pizzaria | J5 | R$ 32.357,00 |
| C4 · Churrascaria Exporural | `GAST-C4-01` | `69b1f494-e291-478b-9bd2-84c13d7538dd` | Churrascaria Exporural | J33 | R$ 17.500,00 |
| D1 · Alameda Gastronômica | `GAST-D1-01` | `68a9a0a7-9ef7-48de-acda-4ee0e7a77abc` | Ponto de alimentação 01 | J7 | R$ 33.000,00 |
| D1 · Alameda Gastronômica | `GAST-D1-02` | `534f2c18-0fd6-4eb8-8bdd-38a874f22b2c` | Ponto de alimentação 02 | J8 | R$ 33.000,00 |
| D3 · Espaço Mirante | `GAST-D3-01` | `4f25d807-5d9d-4309-91f9-235743dbaf48` | Ponto de alimentação 01 | J26 | R$ 22.780,00 |
| D3 · Espaço Mirante | `GAST-D3-02` | `80e82774-b887-44dd-ace1-480468310989` | Ponto de alimentação 02 | J27 | R$ 22.780,00 |
| D3 · Espaço Mirante | `GAST-D3-03` | `881e2792-3a3b-40a4-ac67-56c4fbb05271` | Ponto de alimentação 03 | J28 | R$ 22.780,00 |
| D3 · Espaço Mirante | `GAST-D3-04` | `a392e813-6ea9-4976-aa17-587822e0ef61` | Ponto de alimentação 04 | J29 | R$ 22.780,00 |
| D3 · Espaço Mirante | `GAST-D3-05` | `fd712711-4de0-4b70-92c8-ef2072b83be3` | Ponto de alimentação 05 | J30 | R$ 19.150,00 |
| D4 · Tenda da Pecuária | `GAST-D4-01` | `55b692e4-ecb7-4e46-9364-887fdd5128bd` | Restaurante Exposição Animais | J9 | R$ 25.200,00 |
| **6 estruturas** | **12 pontos** | | | | **R$ 386.541,00** |

Os subtotais de C2 e D3 são R$ 82.464,00 e R$ 110.270,00. As duas etapas usam a mesma tabela de preço fechado. Os 12 pontos estavam disponíveis na conferência após a carga, todos com área e preço por m² nulos e sem venda associada. A comparação antes e depois retornou 1.652 espaços por metragem e 205 pedidos preexistentes em ambas as leituras.

## Via Expressa e Caminhão de Chopp

| Estrutura | Pontos | Origem na Plan1 | Tabela inicial |
| --- | ---: | --- | ---: |
| Via Expressa · D2 | 11 | J14–J24 | R$ 155.680,00 |
| Caminhão de Chopp · `GAST-CHOPP` | 1 | J32 | R$ 24.500,00 |
| **Incremento** | **12** | | **R$ 180.180,00** |

Cada ponto usa preço fechado nas duas etapas. A ficha de D2 mantém **Conhecer a história** e mostra os 11 pontos em ordem. A busca por código, nome ou categoria abre o ponto e enquadra a estrutura que o contém. A planilha registra preço e categoria em `price_source`, com B14–B24 para os tipos da Via Expressa e C32 para a categoria Chope.

O caminhão fica no gramado ao norte da Via Expressa, a leste do Pavilhão 4, entre a Rua Paraguai e a Rua Bolívia. O centro está em X = 11,38909 e Z = −9,90545. A carroceria segue o eixo X com a frente da cabine apontada para oeste. O perímetro de 2,10 × 1,08 unidades inclui as coberturas laterais e os módulos de atendimento abertos. O teto está 0,96 unidade acima do terreno local, cuja cota na cena é −0,08. As baias com tanques, tubulações aparentes e chopeiras ficam na lateral +Z. A normal da abertura gira 29,44° de +Z para +X e aponta para a calçada oeste de acesso ao Mirante. As dimensões são estimativas visuais na escala local do mapa.

A foto de referência enviada na revisão orientou a cabine alta, o baú metálico, as portas de abertura superior, os tanques expostos e o serviço junto ao chassi. O acabamento usa a identidade da Fenasoja.

## Ativação

A [migration versionada](../supabase/migrations/20261111190000_commercial_gastronomy.sql) foi aplicada pelo `query_database` do projeto [Fenasoja Log](https://lovable.dev/projects/756eeb64-0d44-4171-b445-f8a60f0492c0). A execução registrou o SQL e seu SHA-256 no histórico `supabase_migrations.schema_migrations`, versão `20261111190000`. O [script de preparação](../scripts/gastronomy/migration-envelope.mjs) produz o SQL transacional para o Lovable e verifica o inventário na primeira execução. A implantação da interface segue o fluxo de revisão, merge e publicação da Fenasoja.

Depois da publicação, abra o mapa com `map.view`, confirme a ficha de C2 e abra o recorte Gastronomia na Dashboard. Para suspender novas vendas, bloqueie os pontos disponíveis em uma migration compensatória no mesmo projeto Lovable. Mantenha as linhas, chaves e vínculos históricos para que vendas e contratos continuem auditáveis.

A [migration da ampliação](../supabase/migrations/20261116180000_commercial_gastronomy_via_expressa_chopp.sql) reutiliza D2 e cria a geometria vigente do caminhão antes dos pontos. Gere o SQL para registrar a versão e seu SHA-256 pelo `query_database` do mesmo projeto Lovable com `node scripts/gastronomy/migration-envelope.mjs --via-expressa-chopp`. O ensaio pelo conector conferiu os preços nas duas etapas e a elegibilidade dos 12 pontos e reverteu a transação. O inventário comercial continuou com 12 pontos em 6 estruturas. Com a carga aplicada a esse inventário, a tabela inicial passa a R$ 566.721,00 em 24 pontos de 8 estruturas.

## Pontos individuais no parque e no entorno

A carga de 24/11/2026 acrescentou oito unidades com preço fixo nas duas etapas da comercialização de 2028. A coluna A identifica a origem e a coluna J fornece o preço fechado. O rótulo e a categoria originais permanecem em `price_source`. A categoria de Balão está vazia em B13. Os nomes da coluna Empresa são referências da planilha. O comprador exibido vem dos dados do fluxo comercial.

No filtro **Gastronomia**, a borda dourada identifica os emblemas de ponto individual. Clique ou toque no emblema para abrir a ficha com a unidade correspondente expandida. No modo **Vendas**, a inclusão no carrinho é feita pela ficha. O clique direto no brinquedo continua iniciando a atração. As fichas do parque mantêm os brinquedos parados durante a consulta diurna. Na Dashboard, cada linha possui **Localizar no mapa**.

Os três emblemas do Parque de Diversões ficam do lado interno da divisa com a Rua Buenos Aires. O morango fica na calçada junto à face externa de B1, o sanduíche na entrada do corredor entre B3 e B4, Balão na faixa ao lado da Alameda, e J12 na faixa livre da Calçada do Arvoredo. O emblema de J31 acompanha a cumeeira do Núcleo D5. A busca encontra J31 por **Cavalo Crioulo** e **Primus**.

### Ativação e conferência

A versão `20261124190000` foi aplicada ao projeto **Fenasoja Log** pelo Lovable após ensaio com reversão. O histórico registra o SHA-256 `bfe3bc889f92cef96911afff5646978cea604640c2fd7f0fbe48e8ccb65cb66a`. O inventário de tabela passou de 24 pontos e R$ 566.721,00 para 32 pontos e R$ 688.018,00. [Projeto no Lovable](https://lovable.dev/projects/756eeb64-0d44-4171-b445-f8a60f0492c0)

| Nº · célula | Código | Estrutura | Preço fechado 2028 |
| --- | --- | --- | ---: |
| 8 · J10 | `GAST-B3-01` | Corredor P12/P8 | R$ 14.915,00 |
| 10 · J12 | `GAST-ARVOREDO-02` | Calçada do Arvoredo | R$ 10.680,00 |
| 11 · J13 | `GAST-D1-03` | Lateral da Alameda Gastronômica | R$ 2.815,00 |
| 23 · J25 | `GAST-B1-01` | Lateral do Pavilhão 1 | R$ 17.500,00 |
| 29 · J31 | `GAST-D5-01` | Núcleo dos Criadores de Cavalos Crioulos | R$ 23.107,00 |
| 33 · J35 | `GAST-J-01` | Parque de Diversões | R$ 19.040,00 |
| 34 · J36 | `GAST-J-02` | Parque de Diversões | R$ 22.560,00 |
| 35 · J37 | `GAST-J-03` | Parque de Diversões | R$ 10.680,00 |
| **8 pontos** | | | **R$ 121.297,00** |

J12 é a única unidade do Arvoredo. J11 pertence à Via Expressa e pode ser reconciliado para D2 quando a origem comprovar um vínculo prévio incorreto. J14 é o Crepes de D2 e tem origem e UUID próprios. A consulta de auditoria retorna o inventário por estrutura e situação, os preços e os vínculos comerciais por unidade. [Migration](../supabase/migrations/20261124190000_commercial_gastronomy_site_points.sql) · [Consulta de auditoria](../scripts/gastronomy/site-points-audit.sql)

O Financeiro 2028 recebe a mesma classificação de Gastronomia e a tabela vigente. As Simulações comparam vendas em carteira, confirmadas ou recebimentos alocados com as três metas oficiais. [Simulações financeiras](financial-scenarios/README.md)

### Evidências da implantação

Prévia local em Chromium com cartografia oficial e PostgreSQL descartável `gastronomy_qa`. A regressão usa eventos reais de mouse e toque no Canvas e confere o UUID expandido, o preço e a situação da roda-gigante, além da preservação da câmera ao fechar a ficha, orbitagem, zoom e pinça. O mapa publicado recebe a interface pelo fluxo de merge e publicação da Fenasoja.

| Local | Planta | Oblíqua |
| --- | --- | --- |
| Parque de Diversões | [Planta](evidence/gastronomia/site-points/parque-planta.jpg) | [Oblíqua](evidence/gastronomia/site-points/parque-obliqua.jpg) |
| Pavilhão 1 | [Planta](evidence/gastronomia/site-points/pavilhao-1-planta.jpg) | [Oblíqua](evidence/gastronomia/site-points/pavilhao-1-obliqua.jpg) |
| Corredor P12/P8 | [Planta](evidence/gastronomia/site-points/corredor-p12-p8-planta.jpg) | [Oblíqua](evidence/gastronomia/site-points/corredor-p12-p8-obliqua.jpg) |
| Lateral da Alameda | [Planta](evidence/gastronomia/site-points/alameda-planta.jpg) | [Oblíqua](evidence/gastronomia/site-points/alameda-obliqua.jpg) |
| Calçada do Arvoredo | [Planta](evidence/gastronomia/site-points/arvoredo-planta.jpg) | [Oblíqua](evidence/gastronomia/site-points/arvoredo-obliqua.jpg) |
| Cavalo Crioulo | [Planta](evidence/gastronomia/site-points/cavalo-crioulo-planta.jpg) | [Oblíqua](evidence/gastronomia/site-points/cavalo-crioulo-obliqua.jpg) |

[Visão geral com Gastronomia em destaque](evidence/gastronomia/site-points/gastronomia-destaque.jpg) · [Parque no celular](evidence/gastronomia/site-points/parque-ficha-celular.jpg) · [Parque à noite com gráficos reduzidos](evidence/gastronomia/site-points/parque-noturno-reduzido-celular.jpg) · [Ficha do Cavalo Crioulo no celular](evidence/gastronomia/site-points/cavalo-crioulo-ficha-celular.jpg) · [Arvoredo na Dashboard](evidence/gastronomia/site-points/dashboard-arvoredo.jpg)

Para reproduzir as capturas e a regressão no mapa, prepare o banco e abra o servidor da prévia. `PLAYWRIGHT_PATH` permite indicar uma instalação de Playwright fora do repositório.

```sh
node scripts/gastronomy/setup-database.mjs --via-expressa-chopp --site-points
npx vite --config scripts/gastronomy/review.vite.config.ts
node scripts/gastronomy/site-points-browser-qa.mjs
```

No PostgreSQL descartável, `database-qa.mjs` também confirmou 20 pontos e R$ 507.838,00 na base com a carga inicial. Testou colisão com reversão integral, preços reajustados, correção de J11 e J31 com venda e documento, reaplicação após assinatura, contrato por ponto e por cobertura explícita e cancelamento de venda em aberto. O pedido conjunto de Lanches/Bebidas e Balão totalizou R$ 25.375,00 em duas unidades. Os outros dois pontos do Parque permaneceram disponíveis.

Execute `node scripts/gastronomy/site-points-browser-qa.mjs --venda` na prévia com um banco recém-preparado para reproduzir o checkout, assinatura, anexação e abertura do PDF após recarregar. [Pedido de teste confirmado](evidence/gastronomia/site-points/contratos-do-pedido.jpg) · [Ficha após recarga](evidence/gastronomia/site-points/contratos-balao-apos-recarga.jpg)

A suíte integral retornou 87 falhas que também ocorrem em `main` no commit `4069966b`, com a mesma lista de testes. As suítes de Gastronomia, seleção, precificação de pontos, indicadores, vendas e contratos relacionadas à carga passaram.

## Validação reproduzível

O cenário local usa um PostgreSQL descartável em `127.0.0.1:55438` com usuário `postgres` e permissão de criar bancos. A preparação recria `gastronomy_qa`, com identidades e pedidos sintéticos.

```sh
npm install
npm run typecheck
npm run build
npm test
node scripts/gastronomy/setup-database.mjs
node scripts/gastronomy/database-qa.mjs
node scripts/commercial-analytics/database-qa.mjs
```

Para repetir a validação visual com a ampliação, prepare um banco novo com o parâmetro abaixo e abra a prévia do mapa em `http://127.0.0.1:5196/scripts/gastronomy/review.html`.

```sh
node scripts/gastronomy/setup-database.mjs --via-expressa-chopp
npx vite --config scripts/gastronomy/review.vite.config.ts
```

As verificações PostgreSQL cobrem células e totais, reaplicação com ponto já vendido, isolamento entre Gastronomia e Exporural, três formas de pagamento, total adulterado, falha sem escrita parcial, reenvio, disputa simultânea, assinatura e cancelamento independentes, revisão com parcela paga, documentos e exportação. A suíte completa foi comparada com `main` em `7f39c1bb` com as mesmas dependências. O checkout de teste e os perfis sintéticos foram exercitados no ambiente isolado. Os testes de contrato usam vínculos sintéticos no schema de armazenamento e validam o conteúdo do PDF gerado. A verificação no Lovable foi de inventário, preços, elegibilidade e permissões do schema. O teste de upload e abertura de arquivo privado na interface publicada fica para a ativação com um perfil habilitado.

Para a ampliação, o PostgreSQL descartável verifica conflito de identidade com rollback, os subtotais por estrutura, contratos vinculados individualmente ou por cobertura explícita, autorização e reaplicação após assinatura e reajuste. O cenário também revisa e cancela uma venda de D2 pelo fluxo existente.

## Capturas da ampliação

O navegador consultou o inventário e a geometria do caminhão no PostgreSQL descartável, com a cartografia oficial do parque na prévia. Os testes de interface de checkout, anexação e abertura dos PDFs usaram respostas simuladas. As operações de escrita e as permissões foram verificadas separadamente pelas RPCs no banco descartável.

Na mesma vista oblíqua próxima, o Chromium em Apple M5 alternou a visibilidade da malha três vezes por perfil, com os marcadores fixos e DPR 1. O caminhão acrescentou 14 chamadas de desenho, de 177 para 191. A mediana do intervalo entre quadros foi de 16,7 ms com e sem o modelo nos perfis Médio e Baixo.

| Tela | Capturas |
| --- | --- |
| Implantação | [Planta](evidence/gastronomia/via-expressa-chopp/01-planta.jpg) · [Oblíqua](evidence/gastronomia/via-expressa-chopp/02-diagonal.jpg) · [Atendimento visto do Mirante](evidence/gastronomia/via-expressa-chopp/03-face-desde-mirante.jpg) · [Detalhe da lateral](evidence/gastronomia/via-expressa-chopp/04c-lateral-industrial.jpg) |
| Fichas | [Via Expressa](evidence/gastronomia/via-expressa-chopp/06-ficha-via-expressa.jpg) · [Caminhão de Chopp](evidence/gastronomia/via-expressa-chopp/05-ficha-caminhao.jpg) |
| Dashboard | [Recorte Gastronomia](evidence/gastronomia/via-expressa-chopp/08-dashboard-gastronomia.jpg) |
| Celular | [Modo Noturno com gráficos reduzidos](evidence/gastronomia/via-expressa-chopp/12-caminhao-celular-noturno-reduzido.jpg) |

## Capturas da prévia local

| Tela | Desktop · 1440 × 920 | Celular · 390 × 844 |
| --- | --- | --- |
| Segmento e estruturas | [Mapa](evidence/gastronomia/01-segmento-desktop.jpg) | [Segmentos](evidence/gastronomia/08-segmento-celular.jpg) |
| Restaurante · C2 | [Consulta no modo padrão](evidence/gastronomia/02-restaurante-desktop.jpg) | [Consulta do ponto](evidence/gastronomia/03-restaurante-celular.jpg) |
| Mirante · D3 | [Seleção com estados mistos](evidence/gastronomia/09-mirante-desktop.jpg) | [Seleção e subtotal](evidence/gastronomia/05-mirante-celular.jpg) |
| Dashboard | [Recorte e valores](evidence/gastronomia/06-dashboard-desktop.jpg) | [Indicadores e estrutura](evidence/gastronomia/07-dashboard-celular.jpg) |
| Venda | [Detalhe de C2](evidence/gastronomia/10-venda-c2-desktop.jpg) · [Inspeção da Pizzaria](evidence/gastronomia/11-inspecao-pizzaria.jpg) | [Carrinho opaco](evidence/gastronomia/04-carrinho-celular.jpg) |
