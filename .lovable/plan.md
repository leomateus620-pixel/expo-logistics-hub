# Corrigir troca de fotos: Fabiano Soltis e Djeison Drey

## O que muda

As fotos dos dois usuários estão invertidas: quem aparece como Fabiano Soltis exibe o retrato do Djeison Drey e vice-versa. A correção troca o vínculo nome→foto, de modo que cada pessoa passe a exibir o próprio retrato em todos os lugares onde o ícone aparece (seletor de responsáveis no cadastro, linha do tempo desktop e mobile, e visualização expandida do evento).

Nenhum outro usuário é afetado e nenhum layout muda.

## Detalhes técnicos

- Único ponto de correção: `src/components/cronograma-eventos/personPhotos.ts`, onde o mapa `PERSON_PHOTOS` associa `'fabiano soltis'` e `'djeison drey'` aos assets. Inverter os dois valores (ou renomear os arquivos em `src/assets/`, mantendo os imports coerentes).
- Todos os consumidores (`PersonAvatar`, `EventPeopleAvatars`, `RelationalMultiSelect`, `EventRelationFields`, cards da timeline) resolvem a foto por esse mapa, então a correção se propaga automaticamente.
- Validação: abrir a linha do tempo autenticada e um evento com os dois usuários (desktop 1280 e mobile 390), conferindo por captura que cada nome exibe o retrato certo.
