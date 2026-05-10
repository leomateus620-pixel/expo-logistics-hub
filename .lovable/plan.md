## Objetivo

Gerar `Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v7.pdf` em `/mnt/documents/`, mantendo **exatamente** o design, capa, paleta, tipografia, gráficos e estrutura do V6 — corrigindo apenas as inconsistências apontadas. Esta é a versão final oficial.

## Correções em relação ao V6

### 1. Equipe Logística — lista oficial (9 membros vinculados à comissão "LOGÍSTICA, HOTELARIA E TURISMO" no banco)

| # | Nome | Cargo |
|---|---|---|
| 1 | EDUARDO SANTOS | PRESIDENTE COMISSÃO |
| 2 | LEONARDO MATEUS STROSCHEIN | VOLUNTÁRIO |
| 3 | LUCAS FRANKEN | VOLUNTÁRIO |
| 4 | LUIS FERNANDO FURLANETTO | VOLUNTÁRIO |
| 5 | MARCELO DE BAIRROS | VOLUNTÁRIO |
| 6 | MICAEL ARCANJO BÖCK | VOLUNTÁRIO |
| 7 | RICARDO CARPENEDO CAETANO | VOLUNTÁRIO |
| 8 | RICARDO EMILIO ZIMMERMANN | VOLUNTÁRIO |
| 9 | VLADIMIR ANTÔNIO MADALOSSO DA ROSA | VOLUNTÁRIO |

→ Substituir qualquer nome divergente do V6, manter o KPI "9 oficiais", garantir que a tabela/lista da seção "Equipe Logística" reflita exatamente esses nomes/cargos.

### 2. Hotel Imigrantes não é aeroporto

- Revisar todas as seções (transportes, ranking de destinos, tabela diária, gráficos por destino) e reclassificar **Hotel Imigrantes** como destino tipo **Hotel/Hospedagem**, **nunca** como aeroporto.
- Recalcular contagens e gráficos de "Aeroporto vs. Hotel" se necessário (mantendo o total de 32 transportes).

### 3. Frota Botolli — remover Sprinter e Kombi

Frota oficial confirmada no banco (7 veículos), sem Sprinter nem Kombi:

| Marca | Modelo | Placa |
|---|---|---|
| VW | AMAROK | JDF6D47 |
| VW | SAVEIRO | TQW2A80 |
| VW | T CROSS | IZT7H43 |
| VW | T CROSS | TQX7C18 |
| VW | UP | IZH9J56 |
| VW | UP | IXU8B21 |
| DEFENDER | 4X4 | (sem placa registrada) |

→ Remover linhas Sprinter/Kombi da tabela "Frota Botolli", manter o KPI "7 veículos" e o KM oficial **5.811 km**.

### 4. Manter tudo do V6

- Mesmo design institucional (verde profundo `#0F3D1F` + dourado `#E2C24A`), capa com círculo decorativo, faixas, header/footer, KPIs em grid, gráficos matplotlib.
- Mesmos dados oficiais: 32 transportes, 5.811 km, R$ 3.337,06 combustível real, 22 carrinhos elétricos, 2.157 h totais (~98 h/carrinho), 221/228 retiradas/devoluções, 23/14 hóspedes, 19 eventos, 195 autorizações, 476 ações auditadas.
- Sem patinetes, sem checklist, sem comparação entre versões, sem custo estimado por km.

## Implementação técnica

- Duplicar `/tmp/genrep_v6.py` → `/tmp/genrep_v7.py`.
- Atualizar lista hard-coded da equipe Logística com os 9 nomes acima.
- Remover entradas Sprinter/Kombi da estrutura da tabela Botolli.
- Reclassificar "Hotel Imigrantes" no dicionário/lookup de destinos (de aeroporto → hotel) e revisar gráficos e ranking.
- Atualizar header/footer/metadata para "v7" e rodapé "Versão Final Oficial".

## QA obrigatório

- `pdftoppm -jpeg -r 130 v7.pdf qa/page` em todas as páginas.
- Conferir página por página: capa intacta, equipe = exatamente 9 nomes acima, sem Sprinter/Kombi, Hotel Imigrantes nunca aparece como aeroporto, KM = 5.811, combustível = R$ 3.337,06, horas carrinhos = 2.157 h, sem checklist, sem patinetes, sem menção a versões anteriores.
- Iterar até zero defeitos visuais.

## Entregável

`Relatorio_Geral_Operacao_Logistica_Fenasoja_2026_v7.pdf` (versão final oficial).
