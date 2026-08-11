# Exporural — correção de fidelidade cartográfica 2026.4

## Fonte de verdade e regra de interpretação

A revisão `2026.4-exporural.1` usa a planta oficial Fenasoja 2026 e os recortes fornecidos em 11/08/2026 como fonte cartográfica absoluta. Quando a implantação 3D anterior diverge dos recortes claros, prevalece a planta oficial. A instrução explícita de remoção prevalece apenas para os cinco overlays listados abaixo; ela não remove nem redimensiona os lotes que existem sob esses elementos.

O JPG integral fornecido tem SHA-256 `650080ace6fa8656863f9decc98d5fc6721eb8a2e91f48e18a28e280434eea38`, o mesmo hash já declarado em `OFFICIAL_2026_SOURCE_MANIFEST`. Portanto, os recortes detalham a mesma planta oficial já usada pelo mapa, sem introduzir uma segunda referência.

### Manifesto dos recortes

| Arquivo | Papel na revisão | SHA-256 |
| --- | --- | --- |
| `59ad9094-460d-463c-a582-c7bc958fb109.png` | estado anterior — cruzamento central da Quadra R | `ae42a37f97570ed7994c61a851a82f024949948454532d87b6737b7f2a7bc4e2` |
| `6e76daf3-60ba-40e1-901b-53a5a9c04a05.png` | estado anterior — acesso A8 | `f425d874e10581b9d6f59edb0dd06e4e7b341e3b1b581f660fb843616b5e049c` |
| `183e3347-b274-4393-9c4e-15cba2389bc3.png` | referência oficial — acesso A8 / Quadra S | `b47bf70672388c6fb81bf6b97ca510ae002412e4edc0122e754fed09472c653c` |
| `3ecc5c43-1ef5-44df-8a91-ee8fe16a6402.png` | estado anterior — acesso A9 | `9e5aaad41f3cdc00c08409a673db2385bac36a98bdbd9d888a6dcb359d456501` |
| `04ca722b-7e9c-4d19-9615-7c22e41dd00f.png` | referência oficial — acesso A9 / borda oeste | `be457f724827ff9e8649e1f3b591fb0588c9dd775cb3c603de2bb5fa48f3d7ee` |
| `52f185d3-0b95-4445-b5cf-22d050cf9f36.png` | estado anterior — extensão oeste A7/B8 | `2fd0fbf1778dcbb75aa59a32c8ab1acb9f0cc32d485d3e8d2563a1d5d9d15727` |
| `f7e16047-7c04-49d3-9c92-9ceee9ba1bc2.png` | referência oficial — extensão oeste A7/B8 | `67d190f059898a330379f19aa92be856027551fbe4a47910ad5d0ad2b1ea97da` |
| `b0e897c7-f592-4bc6-a667-9a5cfc605d7e.png` | estado anterior — lotes R-56 a R-59 | `63fd6dbefd669bae650bb6a0fd25c3fa8b83596f21f4cfe587dc016dd40c992a` |
| `60f64bd3-b01e-4f96-bbf2-c9b356ef1d2a.png` | referência oficial — lotes R-56 a R-59 | `e19c13c602dbaa42bc1b5e186debc9d756dd5416609530e7021e0df2bbdbbf22` |

## Reconstrução aplicada

| Zona | Defeito anterior | Contrato corrigido |
| --- | --- | --- |
| A9 / oeste da Quadra S | Ruas Bruno Schwartz e Johan Muller terminavam em área vazia | O corredor norte-sul passa por A9, conecta as duas ruas e continua como Rua Pastor Albert Lehenbauer até a extensão oeste da Quadra R. |
| A8 / centro da Quadra S | O acesso parava no primeiro conjunto de lotes | O corredor de A8 atravessa a Quadra S e se conecta à Rua Johan Muller e à Rua 15 de Novembro, sem transformar B37/B38 em lotes. |
| Centro da Quadra R | A Rua 15 de Novembro aparecia como um T incompleto | A via forma o eixo contínuo entre Johan Muller, Gustavo Bessel e Emanuel Brachmann; as ilhas 28–30 e 41–43 mantêm bordas regulares e separação real. |
| Extensão A7/B8 | R-13, R-14 e R-01/R-02 tinham proporções e encontros instáveis | A sequência superior 15–19/05–08 e as quatro parcelas inferiores preservam continuidade, sem absorver B8, A7 ou a área campeira. |
| Sudeste R-56–R-59 | O bloco era destacado da rua e o perímetro gerava um triângulo de recorte | Os quatro lotes formam um único leque contínuo sob a Rua Emanuel Brachmann, com divisões internas limpas e lote 59 afunilado junto à borda externa. |

As Quadras R e S, o perímetro Exporural, as sete vias oficiais e os 95 lotes continuam derivados de uma única referência canônica. O mapa completo, o filtro Exporural e o portal `/comissoes/exporural/mapa-comercial` não possuem cópias independentes dessa geometria.

## Remoções e preservação de substrato

Foram removidos somente:

- `B35` — Simulador AGCO;
- `B36` — Palco Semear;
- `D6-01`, `D6-02` e `D6-03` — três blocos Food Truck.

Continuam ativos os 95 lotes Exporural, com destaque para os substratos diretamente afetados pelos overlays: `Q-S-17`, `Q-R-52`, `Q-R-53`, `Q-R-54` e `Q-R-55`. `B37` (Comissão Exporural), `B38` (Área de Lazer), sanitários, B7, B8 e D3 não fazem parte da remoção. B7, B8 e D3 permanecem no parque completo e continuam excluídos do segmento isolado, como antes.

O inventário-base do segmento muda de **116 entidades / 95 lotes** para **111 entidades / 95 lotes**. Nenhum lote é arquivado, recriado ou renumerado por essa mudança.

## Persistência e implantação

A correção exige a migration aditiva desta revisão antes de aparecer nos dados persistidos. Ela deve:

1. registrar snapshot anterior e versionar as geometrias alteradas;
2. confirmar que os cinco alvos são entidades de referência sem lote comercial vinculado;
3. arquivar somente esses cinco alvos e limpar sua associação canônica ao segmento;
4. preservar IDs, status, preços, reservas, negociações, vendas, contratos e histórico dos 95 lotes;
5. atualizar o baseline Exporural para 111/95 e impedir que `areaCode=EXPORURAL` reatribua um alvo removido;
6. manter a liberação condicionada a `map.admin`, RLS, inventário completo e geometrias vigentes.

O rollback 2026.4 restaura as 111 geometrias e os 95 lotes do snapshot, mas mantém os cinco alvos como tombstones arquivados e sem segmento. Assim, reverter a geometria não volta a publicar elementos cuja remoção foi uma instrução cartográfica explícita.

Até a migration ser aplicada no projeto Supabase correto e validada com sessões reais por papel, a liberação remota desta revisão permanece **NO-GO**. Testes locais e inspeção do estado publicado anterior não substituem essa evidência.

### Evidência local da revisão

- 21 arquivos e 140 testes focados do Mapa Comercial, portais, migration e deep links: aprovados;
- suíte global: 635 testes aprovados e 29 falhas herdadas, todas nos quatro arquivos de Cronograma fora deste diff;
- type-check global, ESLint dos 16 arquivos TypeScript/TSX tocados e build de produção: aprovados;
- migration aceita pelo `pglast` 8.4: 23 statements / 82.560 bytes; contrato SQL e guardas fail-closed aprovados;
- QA do mesmo Canvas e da mesma referência canônica em 1440 × 900 e 480 × 844: inventário 111/95, vistas superior e isométrica, presets Exporural e extremo leste, sem overflow ou overlay de erro;
- mapa principal e portal Exporural publicados foram inspecionados apenas como estado anterior; a revisão 2026.4 ainda não foi aplicada remotamente.

## Checklist de validação

- [x] áreas e 95 identificadores cadastrais preservados;
- [x] zero sobreposição interior entre lotes e entre lote/via;
- [x] A8 e A9 conectados às ruas horizontais correspondentes;
- [x] Rua 15 de Novembro contínua até a Rua Emanuel Brachmann;
- [x] R-47 e R-56–R-59 afunilados, contíguos, dentro do perímetro e sem artefato triangular;
- [x] perímetros Exporural/Quadra R fora de B8 e D3, sem perder lotes limítrofes;
- [x] cinco overlays ausentes no mapa completo, filtro, busca e portal da comissão;
- [x] `Q-S-17` e `Q-R-52` a `Q-R-55` ativos e selecionáveis;
- [x] inventário Exporural 111/95 e parque completo com 262 lotes;
- [x] rotas, guards, filtros, câmera, busca e navegação sem alteração contratual;
- [x] build, testes focados, lint tocado e QA superior/isométrico desktop/mobile registrados na PR;
- [ ] migration, RLS e inventário validados remotamente antes de GO.
