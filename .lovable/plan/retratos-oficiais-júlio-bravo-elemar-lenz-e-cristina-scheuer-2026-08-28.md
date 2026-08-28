# Retratos oficiais: Júlio Bravo, Elemar Lenz e Cristina Scheuermann

Adicionar as três fotos enviadas aos ícones de pessoa usados na Agenda FenaSoja e em todo o ecossistema (avatares de responsáveis, seletores, cards e listas), com o mesmo enquadramento circular focado no rosto já usado nos demais retratos.

## Pessoas identificadas no registro oficial

| Foto | Nome no sistema | Cargo |
| --- | --- | --- |
| Anexo 1 | Júlio Bravo | Assessoria de Relações Internacionais |
| Anexo 2 | Elemar Antonio Lenz | Presidente de Honra |
| Anexo 3 | Cristina Beatriz Manjabosco Scheuermann | Soja Store |

Os três já possuem cadastro ativo, então a vinculação será feita tanto por nome normalizado quanto pelo identificador de usuário — assim a foto aparece mesmo quando o nome for digitado com variação de acento ou forma curta.

## O que será feito

1. Publicar as três imagens no CDN de assets do projeto (nenhum binário fica no repositório).
2. Registrar cada retrato no mapa central de fotos de pessoas, por nome e por usuário, incluindo variações curtas ("cristina scheuermann", "elemar lenz").
3. Manter o recorte circular padrão (foco no rosto, topo ~18%) já validado para os outros retratos — sem alterar o componente de avatar.
4. Rodar os testes de identidade e de interações do cadastro para confirmar que nada regrediu.

## Detalhes técnicos

- Upload via `lovable-assets create`, gerando `src/assets/person-julio-bravo.png.asset.json`, `person-elemar-lenz.png.asset.json` e `person-cristina-scheuermann.png.asset.json`.
- Edição de `src/components/cronograma-eventos/personPhotos.ts`: novos imports + entradas em `PERSON_PHOTOS` e `PERSON_PHOTOS_BY_USER_ID` (ids `628ab8aa…`, `823f010b…`, `c3e01950…`).
- Sem mudanças de schema, RLS ou lógica de negócio.
