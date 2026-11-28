# Cessão de espaços · Fenasoja 2028

## Banco e documentação

O conector Lovable aplicou as migrações no projeto **Fenasoja Log** (`756eeb64-0d44-4171-b445-f8a60f0492c0`), no banco Supabase `btfaumhroqtqzxomqorx`. A aplicação usa o mapa `0538d132-34dd-4347-a33c-526edac7339c`, cadastrado como “Parque Fenasoja — referência oficial 2026”, com regras de comercialização do exercício 2028. A publicação da interface depende da integração e implantação desta PR.

| Versão aplicada | Nome | MD5 do SQL registrado no histórico de migrações |
| --- | --- | --- |
| 20261128120000 | commercial_space_cessions | fd8bbfd6c637d8e477a9e332ec798a5b |
| 20261128121000 | commercial_cession_inventory | cb40781db1032b3941a018c243e7af0b |

Os hashes correspondem ao conteúdo versionado entre `BEGIN` e `COMMIT`, removidos os espaços externos. A carga conferiu projeto, lote, entidade, quadra, número, segmento e geometria vigente. A conferência posterior comparou os preços dos demais lotes, nas duas direções, com a precificação anterior.

| Operação | Beneficiário | Finalidade | Lotes | Situação documental |
| --- | --- | --- | --- | --- |
| `e02f21cc-345d-4882-8dd2-a916b937ab64` | Emater Ascar | Espaço cedido por patrocínio | V01–V05 e S25–S26 | Aguardando anexo |
| `56d3bc54-40d7-4452-859d-02e31ae44028` | Fenasoja | Espaço Palco Semear | R69–R72 | Aguardando anexo |

A Fenasoja foi vinculada ao expositor existente. A Emater foi identificada pelo nome informado, pois o cadastro fiscal exige documento. As duas operações têm valor unitário e total de R$ 0,00. O teste de anexo e assinatura usou um instrumento sintético exclusivamente no banco descartável.

## Inventário anterior e vizinhança

Todos os onze lotes estavam disponíveis, sem pedido, venda, pagamento ou contrato comercial incompatível. Todos participavam da quantidade e da área comercializáveis. Os totais anteriores abaixo incluem os ajustes de preço vigentes. As colunas financeiras estão em reais.

| Lote | UUID do lote | Área oficial (m²) | Renovação | 2ª etapa |
| --- | --- | ---: | ---: | ---: |
| Q-R-69 | `73fac7d7-224e-457c-8031-4905a28c3850` | 471,00 | 0,00 | 0,00 |
| Q-R-70 | `467b0174-db02-4d29-9425-e53955cb20ad` | 471,00 | 0,00 | 0,00 |
| Q-R-71 | `6a848982-f9bf-4d9c-8098-32c123911e04` | 471,00 | 0,00 | 0,00 |
| Q-R-72 | `39542dee-d9c3-4d07-b17e-e3b29e7b081b` | 471,00 | 0,00 | 0,00 |
| Q-S-25 | `a6ec0be5-593e-406f-a2ef-0fda8c3448f2` | 450,00 | 6.300,00 | 6.930,00 |
| Q-S-26 | `a39b8f10-a566-484b-a563-7dc66a2b2429` | 450,00 | 6.300,00 | 6.930,00 |
| Q-V-01 | `57c1ebe7-e652-4b21-897e-c0ed07448cb1` | 190,98 | 8.021,16 | 8.785,08 |
| Q-V-02 | `3b1a50d7-b667-406d-8fb4-1303f7153452` | 191,00 | 7.067,00 | 7.831,00 |
| Q-V-03 | `784fc3c0-ee5f-4376-8cf4-0aed5fe9f2e6` | 191,00 | 7.067,00 | 7.831,00 |
| Q-V-04 | `20868234-dc63-44c4-b14e-40aa2aa4fdf6` | 191,00 | 7.067,00 | 7.831,00 |
| Q-V-05 | `dbe9bfb0-f8e3-4808-bd6d-4c807b57aba9` | 190,98 | 8.021,16 | 8.785,08 |
| Q-V-06 (controle) | `3aabd05c-5c77-4c3c-bbcd-7cb91c982eaa` | 239,05 | 10.040,10 | 10.996,30 |

R e S têm segmento persistido Exporural. Na V, o segmento do registro e o da quadra estão nulos. A apresentação territorial da aplicação identifica V em Indústria, Comércio e Serviços. A carga preservou esse cadastro. S25 e S26 tinham o sinalizador da entidade `is_sellable=false`, mas figuravam no inventário comercial do banco. V06 continua disponível. Os quatro lotes da R já tinham ajustes individuais de R$ 0,00 nas duas etapas. Seus preços calculados antes desses ajustes eram R$ 7.771,50 e R$ 8.548,65 por lote. Os UUIDs de entidade, polígonos e valores de origem constam do [inventário de conferência](../../../scripts/cessions/inventory-2028.json).

## Redução por quadra

| Quadra | Lotes retirados | Área (m²) | Renovação (R$) | 2ª etapa (R$) |
| --- | ---: | ---: | ---: | ---: |
| V | 5 | 954,96 | 37.243,32 | 41.063,16 |
| S | 2 | 900,00 | 12.600,00 | 13.860,00 |
| R | 4 | 1.884,00 | 0,00 | 0,00 |
| **Consolidado** | **11** | **3.738,96** | **49.843,32** | **54.923,16** |

## Conciliação global

Valores financeiros em reais. As contagens de vendas medem itens. O potencial considera o preço da etapa para o estoque e o valor comercial reconhecido para itens com venda. O cálculo preserva a composição dos pacotes comerciais. Cada lote participa uma vez. A consulta de conferência foi reexecutada no banco conectado e reproduziu todos os valores posteriores. [SQL de conciliação](../../../scripts/cessions/reconcile-2028.sql)

| Indicador | Antes | Depois | Variação |
| --- | ---: | ---: | ---: |
| Potencial · renovação | 5.405.684,78 | 5.355.841,46 | -49.843,32 |
| Potencial · 2ª etapa | 5.443.958,52 | 5.389.035,36 | -54.923,16 |
| Valor disponível · renovação | 2.371.023,42 | 2.321.180,10 | -49.843,32 |
| Valor disponível · 2ª etapa | 2.409.297,16 | 2.354.374,00 | -54.923,16 |
| Lotes comercializáveis | 1.509 | 1.498 | -11 |
| Lotes disponíveis | 541 | 530 | -11 |
| Área comercializável (m²) | 83.887,44 | 80.148,48 | -3.738,96 |
| Área disponível (m²) | 52.495,58 | 48.756,62 | -3.738,96 |
| Itens em venda aberta | 118 | 118 | 0 |
| Valor das vendas abertas | 422.248,39 | 422.248,39 | 0,00 |
| Itens vendidos | 850 | 850 | 0 |
| Valor vendido | 2.612.412,97 | 2.612.412,97 | 0,00 |
| Operações não comercializáveis | 0 | 2 | +2 |
| Beneficiários da categoria | 0 | 2 | +2 |
| Lotes cedidos | 0 | 11 | +11 |
| Valor comercial das cessões | 0,00 | 0,00 | 0,00 |

## Prévia e testes

A prévia local usa o frontend da PR, PostgreSQL descartável e os polígonos e preços dos lotes conferidos. As capturas documentam a interface da prévia. O contrato exibido representa uma operação que aguarda anexo.

- [R72 no desktop](mapa-r72-desktop.jpg) e [no celular](mapa-r72-celular.jpg).
- [Palco Semear à noite no desktop](palco-noturno-desktop.jpg) e [no celular com gráficos reduzidos](palco-noturno-celular.jpg).
- [Cinco lotes da Emater na quadra V](emater-quadra-v.jpg) e [filtro da legenda](legenda.jpg).
- [Revisão da modalidade no modo Vendas](revisao-cessao.jpg).
- [Categoria na dashboard](dashboard.jpg) e [operação multiquadra da Emater](contrato-emater.jpg).

### Revisão visual e de interação

1. Na quadra R, cada ícone usa a marca do ativo oficial e abre o UUID projetado sob o ponto de toque. A primeira revisão mostrou excesso de margem em torno da marca. O recorte final preserva o símbolo e amplia sua leitura dentro do disco. [Ativo oficial](https://fenasojagestao.com/__l5e/assets-v1/fbbb48a2-dd3f-4c91-9350-4a0db3bb8a0c/fenasoja-logo-oficial.png)
2. A ficha de R72 mostra o selo, a área de 471,00 m² e os valores da cessão. A câmera conserva posição e alvo após o fechamento. As linhas cruzadas, o losango e o texto identificam a cessão também sem recorrer à cor.
3. A dashboard agrupa a Emater em uma operação. O instrumento está pendente e cada uma das sete linhas oferece um botão de localização com nome acessível e código do lote. O teste de documento em PostgreSQL confirmou o mesmo arquivo pelos lotes de duas quadras.
4. O navegador de teste reproduz desktop e celular com toque, vista oblíqua, iluminação noturna e gráficos reduzidos. A revisão de celular usa emulação do Chrome.

Use uma instância PostgreSQL **descartável** em loopback. O preparador recria o banco `gastronomy_qa` da porta informada.

```sh
export GASTRONOMY_QA_PORT=55493
node scripts/gastronomy/setup-database.mjs --via-expressa-chopp --site-points --stallonne-fixture
node scripts/gastronomy/stallonne-database-qa.mjs --prepare-review
node scripts/cessions/database-qa.mjs
CESSION_REVIEW=1 node_modules/.bin/vite --config scripts/gastronomy/review.vite.config.ts
```

Com a prévia na porta 5196, execute `node scripts/cessions/browser-qa.mjs` em outro terminal com Playwright e Chrome instalados. A variável opcional `PLAYWRIGHT_PATH` permite usar o pacote de um runtime externo. A opção `--register-in-disposable-db` usa V06 como operação adicional de teste, anexa um PDF sintético e confere a leitura privada do arquivo após a assinatura. Recrie a base descartável antes de repetir esse cenário.

### Resultado dos testes

- Typecheck e build de produção concluídos.
- Os 49 testes focados de navegação, indicadores, renderização externa e apresentação pública passaram.
- A execução completa com três workers teve 4.556 testes aprovados e 87 falhas. A base `1e8e0923` teve 4.555 aprovados e as mesmas 87 falhas, conferidas pelo arquivo e nome de cada teste.
- A migração e a reaplicação passaram no PostgreSQL descartável. Um segundo checkout tentou confirmar o lote enquanto a cessão mantinha o bloqueio transacional. A concorrência foi serializada, e o carrinho antigo recebeu o código do lote ao tentar vender uma cessão já confirmada.
- Na prévia, o teste criou uma cessão adicional, anexou o PDF sintético, registrou a confirmação de assinatura e comparou o arquivo obtido por URL privada com o arquivo enviado. Ao final, a base de prévia foi recriada com as duas operações originais e V06 disponível.
