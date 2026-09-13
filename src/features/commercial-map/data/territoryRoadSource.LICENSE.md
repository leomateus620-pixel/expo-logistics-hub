# Dados viários do entorno

`territoryRoadSource.json`: © OpenStreetMap contributors, [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

Extrato obtido em 7 de setembro de 2026 da [API OpenStreetMap](https://api.openstreetmap.org/api/0.6/map?bbox=-54.49,-27.855,-54.465,-27.828).
Os eixos foram transformados e recortados para o sistema local do parque; os identificadores das vias, referências, atributos de superfície e âncoras da transformação acompanham o arquivo. A base derivada permanece disponível neste arquivo sob ODbL. Esta licença de dados não altera a licença do código do aplicativo.

Atribuição ao usuário: link “Entorno © OpenStreetMap” no mapa. [Informações de copyright](https://www.openstreetmap.org/copyright).

Correção localizada de 13 de setembro de 2026: `territorialRoads.ts` restitui a conexão da via OSM 951983188 e o primeiro nó omitido da via 569781512 no acesso A5. Esses dados derivados também estão sob ODbL. As respostas atuais das vias e dos nós usados estão em `docs/validation/road-precision/osm-access-*.json`; a transformação do extrato original foi preservada.
