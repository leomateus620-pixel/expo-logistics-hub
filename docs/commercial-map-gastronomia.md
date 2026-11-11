# Gastronomia no Mapa Comercial 2028

No Mapa Comercial, abra **Segmentos → Gastronomia** e escolha uma estrutura no mapa ou na lista. Toque em um ponto para consultar o código, o tipo quando cadastrado, o preço e a situação. No modo **Vendas**, marque os pontos disponíveis e selecione **Adicionar à venda**. O carrinho móvel tem fundo opaco, controle de etapa e botão para fechar e voltar ao mapa.

O checkout usa Expositor → Pagamento → Revisão. A venda registrada fica em aberto e o ponto passa a vendido na confirmação autorizada da assinatura. O detalhe da Dashboard permite localizar cada ponto no mapa, revisar o pedido e anexar um arquivo a um ponto ou a vários espaços da venda. A página da comissão usa a capability `gastronomia_access`. A leitura do mapa geral usa `map.view`.

Em **Dashboard Comercial → Áreas externas → Gastronomia**, abra uma das seis estruturas para ver contagens, valores e pontos. **Vendas e contratos** abre a lista filtrada pelo segmento. Os valores do recorte e do consolidado vêm do mesmo inventário e das vendas registradas. A metragem comercial considera os espaços com cobrança por área.

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

## Ativação

A [migration versionada](../supabase/migrations/20261111190000_commercial_gastronomy.sql) foi aplicada pelo `query_database` do projeto [Fenasoja Log](https://lovable.dev/projects/756eeb64-0d44-4171-b445-f8a60f0492c0). A execução registrou o SQL e seu SHA-256 no histórico `supabase_migrations.schema_migrations`, versão `20261111190000`. O [script de preparação](../scripts/gastronomy/migration-envelope.mjs) produz o SQL transacional para o Lovable e verifica o inventário na primeira execução. A implantação da interface segue o fluxo de revisão, merge e publicação da Fenasoja.

Depois da publicação, abra o mapa com `map.view`, confirme a ficha de C2 e abra o recorte Gastronomia na Dashboard. Para suspender novas vendas, bloqueie os pontos disponíveis em uma migration compensatória no mesmo projeto Lovable. Mantenha as linhas, chaves e vínculos históricos para que vendas e contratos continuem auditáveis.

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

Para repetir a validação visual, prepare um banco novo com `setup-database.mjs` e abra a prévia do mapa real em `http://127.0.0.1:5196/scripts/gastronomy/review.html`.

```sh
npx vite --config scripts/gastronomy/review.vite.config.ts
```

As verificações PostgreSQL cobrem células e totais, reaplicação com ponto já vendido, isolamento entre Gastronomia e Exporural, três formas de pagamento, total adulterado, falha sem escrita parcial, reenvio, disputa simultânea, assinatura e cancelamento independentes, revisão com parcela paga, documentos e exportação. A suíte completa foi comparada com `main` em `7f39c1bb` com as mesmas dependências. O checkout de teste e os perfis sintéticos foram exercitados no ambiente isolado. Os testes de contrato usam vínculos sintéticos no schema de armazenamento e validam o conteúdo do PDF gerado. A verificação no Lovable foi de inventário, preços, elegibilidade e permissões do schema. O teste de upload e abertura de arquivo privado na interface publicada fica para a ativação com um perfil habilitado.

## Capturas da prévia local

| Tela | Desktop · 1440 × 920 | Celular · 390 × 844 |
| --- | --- | --- |
| Segmento e estruturas | [Mapa](evidence/gastronomia/01-segmento-desktop.jpg) | [Segmentos](evidence/gastronomia/08-segmento-celular.jpg) |
| Restaurante · C2 | [Consulta no modo padrão](evidence/gastronomia/02-restaurante-desktop.jpg) | [Consulta do ponto](evidence/gastronomia/03-restaurante-celular.jpg) |
| Mirante · D3 | [Seleção com estados mistos](evidence/gastronomia/09-mirante-desktop.jpg) | [Seleção e subtotal](evidence/gastronomia/05-mirante-celular.jpg) |
| Dashboard | [Recorte e valores](evidence/gastronomia/06-dashboard-desktop.jpg) | [Indicadores e estrutura](evidence/gastronomia/07-dashboard-celular.jpg) |
| Venda | [Detalhe de C2](evidence/gastronomia/10-venda-c2-desktop.jpg) · [Inspeção da Pizzaria](evidence/gastronomia/11-inspecao-pizzaria.jpg) | [Carrinho opaco](evidence/gastronomia/04-carrinho-celular.jpg) |
