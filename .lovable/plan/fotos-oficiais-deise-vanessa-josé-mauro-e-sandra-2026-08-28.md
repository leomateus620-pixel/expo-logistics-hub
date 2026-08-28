# Fotos oficiais: Deise, Vanessa, José Mauro e Sandra

Adicionar os quatro retratos enviados aos ícones de pessoa da Agenda FenaSoja e do ecossistema FENASOJA, seguindo exatamente o mesmo fluxo já usado nas levas anteriores de fotos.

## Pessoas e vínculos confirmados

| Anexo | Pessoa | Cargo (cadastro) | Usuário |
| --- | --- | --- | --- |
| 1 | Deise Anelise Froelich | Assessoria de Imprensa | encontrado e ativo |
| 2 | Vanessa Matraszek Gnoatto | Agricultura, Soja e Derivados | encontrado e ativo |
| 3 | José Mauro Barbieri | Assessoria Jurídica | encontrado e ativo |
| 4 | Sandra Lameira | Assessoria Jurídica (co-responsável) | encontrado e ativo |

Cada pessoa tem um único cadastro ativo, então não há duplicidade de vínculo a tratar nesta leva.

## O que será feito

1. Publicar as quatro fotos no CDN de assets do projeto, gerando os ponteiros `person-deise-froelich`, `person-vanessa-gnoatto`, `person-jose-mauro-barbieri` e `person-sandra-lameira`.
2. Registrar cada foto no cadastro de retratos por nome normalizado (incluindo variações usadas nos eventos, como "Deise Froelich" e "Vanessa Gnoatto") e também pelo identificador de usuário, garantindo que o ícone apareça mesmo quando o evento guarda apenas o nome digitado.
3. Conferir o enquadramento circular: o recorte atual foca a parte superior da imagem, e as quatro fotos são retratos quadrados centrados no rosto, portanto o mesmo tratamento já aplicado às fotos anteriores mantém o rosto bem posicionado nos tamanhos xs/sm/md/lg.
4. Rodar a suíte de testes de identidade de membros para confirmar que os novos nomes resolvem corretamente e que nenhum homônimo herda foto de outra pessoa.

## Detalhes técnicos

- Assets via `lovable-assets create` a partir de `/mnt/user-uploads/`, com ponteiros `.asset.json` em `src/assets/`.
- Registro em `src/components/cronograma-eventos/personPhotos.ts`: novas entradas em `PERSON_PHOTOS` (chaves normalizadas) e em `PERSON_PHOTOS_BY_USER_ID`.
- Nenhuma alteração de banco de dados é necessária; a resolução continua sendo feita por `getPersonPhoto(name, userId)`.
- Verificação com `vitest` nos testes existentes de `memberIdentity` e das interações de cadastro do cronograma.
