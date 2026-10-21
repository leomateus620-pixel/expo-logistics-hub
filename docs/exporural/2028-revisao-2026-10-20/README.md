# ExpoRural — revisão oficial de 20/10/2026

Implementação do cadastro oficial 2028, com aplicação real no banco conectado Fenasoja e correções de renderização para publicação pela PR. O código do frontend desta branch ainda não foi publicado. As capturas `after-replay-*` mostram esse código local usando a geometria exportada do banco; não são prova de publicação nem substituem a validação SQL.

## Origem e ambiente

- Repositório e base conferidos novamente: `main`, `5641f56dc813e8074e2d6756d308b36a7924374f`.
- Projeto cartográfico: `0538d132-34dd-4347-a33c-526edac7339c`; segmento: `feb6fcb7-5bc4-4725-ad74-d408a7b56522`.
- Banco conectado pelo plugin Lovable/Fenasoja, projeto `756eeb64-0d44-4171-b445-f8a60f0492c0` (Supabase `btfaumhroqtqzxomqorx`). Execução de manutenção como `postgres`, sem simular identidade autenticada.
- Fonte: [PDF original](fontes/A1%20-%20Fenasoja%20Exporural%20Planta%20Geral%20-%20sem%20imagem.pdf), página 1. SHA-256 `863fac46cc4f7b00a6e04c8d25be9b81396c0ae4af0a9da2be8209c4fdd9065f`.
- Os três JPEGs fornecidos e os recortes das observações posteriores estão em `fontes/`, com hashes em `fontes/SHA256SUMS`. As imagens servem como contexto visual; os limites e áreas vêm do PDF.

A base encontrada tinha 65 R + 35 S numerados e uma área sem número: 101 espaços ativos. Não foi utilizada a fixture legada de 59 R/36 S nem a prévia com IDs `reference:preview:` para persistência.

## Resultado cadastral

| Controle | Antes | Após revisão |
| --- | ---: | ---: |
| R numerados | 65 | 72 |
| S numerados | 35 | 35 |
| R + S numerados | 100 | 107 |
| Área numerada | 45.767,79 m² | 45.557,86 m² |
| Área separada sem número | 568,78 m² | 568,78 m² |
| Espaços ativos incluindo a área sem número | 101 | 108 |
| Área comercial incluindo a área sem número | 46.336,57 m² | 46.126,64 m² |

A redução de 209,93 m² é explicada pelas faixas atingidas: R/40–47 anteriores somavam 4.205,35 m² e seus substitutos somam 4.085,48 m² (−119,87 m²); S/11–17 passa de 3.048,98 para 2.958,92 m² (−90,06 m²). As demais áreas do segmento permanecem iguais.

São 40 lotes no trecho tabelado. A conferência independente do texto do PDF dentro de cada face vetorial confirmou individualmente **107/107 áreas**, não apenas os subtotais. Ver `manifesto.csv` e `manifest-pdf-check.json`. R soma 29.444,39 m²; S soma 16.113,47 m².

- R/40–47 anteriores: oito origens arquivadas, quinze identidades novas R/40–54 e 29 relações espaciais em `map_lot_lineage`; várias parcelas têm mais de uma origem.
- S/11–17: UUIDs mantidos, limites/áreas atualizados.
- R/48–61 anteriores: UUIDs mantidos, atuais R/55–68; contornos confrontados com os vetores.
- R/62–65 anteriores: atuais R/69–72, UUIDs, geometria e área de 471,00 m² preservados exatamente.
- R/47 é uma única face curva, com 333,34 m², ao lado de R/46 e R/54.
- A venda vinculada ao UUID `137a7fe9-1724-42b0-adc6-64c46b91a7e8` passou de R/52 para R/59. Valor negociado R$ 4.125,00, confirmação e snapshots históricos preservados. O item histórico continua identificado como R/52.
- A área sem número conserva UUID, cadastro, participação comercial e regras; não recebeu R/73.

[Correspondência completa](correspondencia-completa.csv), [correspondência do trecho](crosswalk.csv), [linhagem](linhagem-espacial.csv) e [conferência por lote/etapa](conferencia-comercial.csv).

## Vetores e calibração

Os caminhos da camada `LOTES - EXPORURAL` foram extraídos diretamente, incluindo linhas e Béziers. Os textos identificam as 107 faces. Béziers usam 16 subdivisões; agrupamento de extremidades a 0,10 ponto do PDF (aproximadamente 0,018 m). Não houve reconstrução dos lotes por raster nem ajuste individual para forçar áreas.

A transformação local é uma única similaridade sobre 15 controles estáveis ao redor da intervenção. RMSE 0,26275 m; maior resíduo 0,54980 m, com tolerância de registro de 0,65 m. O maior resíduo de área dos lotes reextraídos é 0,108135 m², inferior à tolerância de 0,15 m². `official_area_sqm` é transcrição decimal; `calculated_area_sqm` é independente, derivada da geometria e da calibração local. Os quatro lotes inferiores conservam sua geometria e cálculo anterior.

`calibracao.json` documenta a transformação e os controles. A escala do PDF confere as cotas; a unidade local foi registrada em 0,14679168487402955 unidade/m para esse recorte. A calibração global 0,15, a rotação, os deslocamentos e a posição do parque não foram alterados. O projeto global permanece `2026.4`, versão 6. A precisão é cartográfica, não geodésica.

[Sobreposição anterior](evidencias/overlay-before.jpg) e [sobreposição oficial](evidencias/overlay-official.jpg) usam exatamente o mesmo recorte/câmera técnica do PDF.

## Vias e observações visuais

As três seções longitudinais passam entre S/13–14, R/42–43 e R/50–51, R/57–58 e R/64–65. As duas superiores são novas entidades; a inferior reutiliza `EXPORURAL-PASSAGEM-INTERNA-01`. Os limites vêm das divisas vetoriais; as cotas de 3,00 m pertencem aos trechos central e inferior. Não há rua horizontal entre as duas fileiras R/40–54 e a passagem não continua abaixo de Emanuel Brachmann.

A via não recebeu nome oficial inventado. IDs técnicos são estáveis; a identificação neutra e discreta no piso é “Passagem”. Foram retirados os cordões brancos largos dessas três seções, preservando o asfalto e as margens dos lotes.

As observações posteriores foram tratadas assim:

1. A anotação `Rua Ubiretama (lateral do Q-R-55)` foi suprimida e, após o pedido de retirar a duplicação física, as entidades legadas `RUA-LESTE-EXPORURAL` e `RUA-UBIRETAMA-LATERAL-R55` foram arquivadas. A via atual e seu terreno são os únicos responsáveis pela apresentação do trecho; a grama volta a aparecer fora da via vigente.
2. O trecho preto em L junto à churrascaria era o pavimento de acesso `acesso-churrascaria`, em y=0,048, sobreposto ao asfalto cadastral em y=0,032. O renderizador deixa esse pavimento para as vias cadastrais quando a continuidade existe, mantendo os demais acessos. A mesma regra integra o piso do modo Visita.
3. Os dois cantos Johan–Ubiretama receberam o complemento persistido de asfalto no espaço negativo entre as faces curvas oficiais e o limite externo da via. Nenhuma face comercial foi modificada por esse complemento. Ver `junction-apron.json`.
4. As faixas verdes sobre Emanuel eram marcadores retangulares de situação comercial calculados pela média dos vértices. Foram retirados da ExpoRural, que já indica a situação pela cor da face inteira; identificação contextual e filtros continuam disponíveis.

As estruturas B37/B38 foram consultadas no banco: não há interseção com os lotes atingidos. Não foram deslocadas. Portões, estacionamento, poços e infraestrutura fora da intervenção permanecem nas posições existentes.

## Migração, histórico e reversão

Revisões efetivamente aplicadas:

| Revisão | Snapshot |
| --- | --- |
| `2028-exporural-2026-10-20.1` | `dbeaf99c-ab1c-4f56-ae11-2dac59d9b535` |
| `2028-exporural-2026-10-21.labels.1` | `28ba4e87-ad05-41b3-a860-76203d1af1be` |
| `2028-exporural-2026-10-21.surfaces.1` | `b0f93185-4262-416d-a255-7e6e8d14a71c` |
| `2028-exporural-2026-10-21.legacy-roads.1` | `d645f31a-be2e-4154-8bc1-537117db42aa` |

A revisão principal foi confirmada em 21/10/2026 às 04:16:21 UTC (01:16:21 em São Paulo). As migrações usam transação, bloqueio breve, projeto/segmento/revisão e fingerprint do estado esperado, snapshots completos dos registros atingidos e vínculos, versões e logs. Renumerações passam por códigos históricos temporários; não há `DELETE` de entidades/lotes. As oito origens reparceladas não tinham venda, reserva, contrato ou override que exigisse decisão comercial. Não há pendência específica de destinação de negócio na faixa reparcelada.

Lotes novos começam bloqueados e só são disponibilizados após a resolução comprovada das duas tarifas já aprovadas. As cópias de marcação de esquina do template foram removidas dos filhos internos sem segunda frente; não foi aprovado adicional de esquina.

A reaplicação das **quatro** migrações foi executada no banco: fingerprint idêntico, nenhum lote, snapshot ou evento adicional (`evidencias/idempotency-final.json`). Houve ensaio em schema isolado antes da aplicação e ensaio da cadeia completa em transação real **descartada com ROLLBACK**. Um negócio posterior simulado bloqueou a reversão no ensaio isolado. `rollback.sql` mantém ROLLBACK como padrão e só aceita os checkpoints e as revisões auxiliares conhecidas; o histórico geométrico e as identidades novas permanecem arquivados.

O controle dentro da transação principal confirmou a igualdade dos registros fora do escopo. Após a retomada da sessão houve atualizações posteriores fora da ExpoRural (B2-M041/042 e Q-G-01/02); o hash externo atual não deve ser confundido com o instante da aplicação. Essas atualizações não foram revertidas nem atribuídas a esta revisão.

## Preços, Dashboard e sincronização

Tarifas aprovadas por faixa física foram mantidas nas duas etapas: R/40–72 usa R$ 16,50 / R$ 18,15 por m²; S usa R$ 14,00 / R$ 15,40. As faixas anteriores de R/1–39 permanecem iguais. A view existente `commercial_lot_pricing_2028` resolve área, regra e override por identidade persistida.

Os overrides de R/69–72, de R$ 0,00 nas duas etapas, **já existiam nos quatro UUIDs** e foram preservados. Não são ausência de regra. Também foram preservados os demais overrides e a regra da área sem número. Nenhum preço pendente foi transformado em zero. Há cobertura das duas etapas para os 108 espaços e nenhuma resolução pendente na releitura.

Os indicadores e o SVG continuam derivados do inventário do mapa, sem totais paralelos persistidos. O cache do minimapa considera coordenadas/revisão e reaproveita os registros comerciais atuais. Uma leitura que atravesse um commit verificado é rejeitada pelo carregador, preservando a última resposta coerente pelo React Query. A alteração de revisão usa `scheduleCommercialMapRefresh`, invalidando também os preços das fichas. A ficha e o modo Visita não apresentam uma resposta de preço com área/totais de outro snapshot.

A assinatura leve passa a ser verificada também em Vendas; não há consulta por lote nem novo temporizador. Carrinhos atingidos são revalidados; seleção de UUID fisicamente mantido permanece, sem refoco forçado. Links existentes resolvem UUID, sem deslocar um lote arquivado para um filho arbitrário. Vendas, parcelas e contratos não são reprecificados.

## Validação executada e limites

- Releitura do banco: 107 áreas individuais, zero anéis inválidos, zero sobreposições de área lote/lote ou lote/via; identidades da venda, dos quatro lotes inferiores e da área sem número conferidas.
- Manifesto independente do texto do PDF: 107/107 correspondências. Subtotais e áreas do trecho em `geometry-qa.json`.
- Banco: aplicação, releitura, reaplicação sem alteração e reversão ensaiada; vínculos comerciais preservados. Os dumps completos de snapshots com dados privados permanecem no banco, não no repositório.
- RPC pública executada com **role anon**, token existente validado e token inválido rejeitado: 108 espaços. Mudança somente de preço e somente de geometria alteraram a assinatura sem mudar contagem. Os probes foram integralmente descartados (`test-revision-signals.sql`). Não foi criado negócio de teste em produção.
- Navegador autenticado: Dashboard ExpoRural com 108 espaços, seleção de R/47 pelo minimapa e abertura do mesmo UUID no mapa; Renovação R$ 5.500,11 e 2ª Etapa R$ 6.050,12; fechamento/reabertura, releitura após reload e chegada da revisão em uma segunda aba já aberta. Duas abas não equivalem a duas autenticações independentes.
- Capturas locais da branch confirmam a retirada do trecho preto, das faixas verdes e dos cordões brancos, e a pavimentação do entroncamento. São replay dos registros persistidos com o renderizador real; não testam autenticação de comissão. O contexto fora da ExpoRural nesse replay vem da referência local.
- `npm run typecheck` e `npm run build`: aprovados. O build conserva avisos de tamanho de chunks. A suíte completa teve 3.789 testes aprovados e as mesmas 91 falhas em 52 arquivos já presentes no baseline; os nomes foram comparados exatamente. Ver `evidencias/testes.json`.
- As medições de navegação publicadas antes/depois estão em `performance-*.json`. Os caches e o histórico de navegação diferem; não são benchmark controlado do frontend final nem comprovam ganho de FPS. O carregamento tardio do renderer continua protegido por teste específico.

**Ainda não executado:** publicação/merge deste frontend, login independente de comissão, logout/login completo, conferência manual de todas as exportações pela UI, aparelho físico e benchmark controlado de navegação. A emulação/captura final de desktop amplo e mobile não foi concluída de forma confiável: a sessão manteve 600×400 pixels CSS, apesar das capturas em resolução física maior. Não confundir resolução da imagem com viewport validado. Esses limites ficam registrados para a revisão da PR; não há afirmação de teste físico ou de publicação das correções visuais.

## Reprodução

Os scripts não acessam credenciais nem gravam no banco por conta própria. Extração requer Python com PyMuPDF, NumPy, Shapely e Pillow. O export de inventário é explícito e privado; não há fallback que aplique fixture ao banco.

```sh
python scripts/exporural/official-2026-10-20/extract.py
python scripts/exporural/official-2026-10-20/build.py /caminho/inventario-preflight.json FINGERPRINT_DO_PREFLIGHT
python scripts/exporural/official-2026-10-20/check-manifest.py
python scripts/exporural/official-2026-10-20/compile-sql.py
npm run typecheck
npm run build
npm test
```

`payload.json` e as migrações entregues registram o preflight efetivamente aplicado; não devem ser regenerados com um inventário de outra revisão para contornar as guardas. `isolated-qa.py` registra o ensaio da base anterior à aplicação e deve receber essa base ao reproduzir. `validate.sql` é somente leitura, e `rollback.sql`/`test-revision-signals.sql` descartam as alterações por padrão.

O replay visual usa o Supabase local que falha fechado em qualquer escrita e não faz parte do build público:

```sh
npx vite --config scripts/exporural/official-2026-10-20/review.vite.config.ts
# http://127.0.0.1:5198/scripts/exporural/official-2026-10-20/review.html?scope=commission
```

O parâmetro `scope=commission` apenas exercita o recorte de apresentação local. Não autentica uma comissão nem substitui o teste RLS.
