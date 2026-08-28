# Fotos oficiais de 5 lideranças (Fernanda Seckler, Roque, Estela, Rodrigo, Elton)

Mesmo fluxo já usado nas fotos anteriores: publicar os retratos no CDN e registrá-los no cadastro central de fotos, de onde a Agenda FenaSoja (avatares de responsáveis/convidados, linha do tempo, cards) e o Ecossistema FenaSoja leem automaticamente.

## Pessoas e vínculos confirmados no banco

| Anexo | Pessoa | Registro no sistema |
| --- | --- | --- |
| 1 | Fernanda Seckler Eich — Comissão Central / Financeiro | 2 cadastros ("FERNANDA SECKLER EICH" e "Fernanda Secklereich") |
| 2 | Roque Vanderlei Lugoch — Coordenador Financeiro / Comissão Central | 2 cadastros (um ativo, um legado) |
| 3 | Estela Zamberlam Schwerz — Assessoria de Sustentabilidade | 1 cadastro |
| 4 | Rodrigo Calixto — Gastronomia | 1 cadastro |
| 5 | Elton Luis Walker — Espaço do Automóvel | 1 cadastro |

Os dois cadastros de Fernanda Seckler e de Roque serão mapeados para a mesma foto, para que o avatar apareça independentemente do registro usado no evento. Atenção: já existe "Fernanda Matarucco Meinertz" (outra pessoa, outra foto) — o mapeamento será feito por nome completo e por identificador de usuário, sem colisão entre as duas Fernandas.

## O que será feito

1. Publicar as 5 imagens como assets de CDN (pointers `.asset.json` em `src/assets`), sem versionar binários.
2. Registrar cada foto em `src/components/cronograma-eventos/personPhotos.ts`, por nome normalizado e por `user_id` (7 identificadores no total).
3. Delimitar melhor o enquadramento do rosto dentro do ícone circular: ajuste fino do recorte (`object-fit: cover` com foco no terço superior) e da borda/anel do avatar em `.cronograma-person-avatar`, garantindo rosto centralizado e sem corte de queixo/testa nos tamanhos xs–lg (inclusive no ecossistema).
4. Conferir no preview (Agenda FenaSoja e Ecossistema) que os 5 avatares carregam e estão bem enquadrados.

## Detalhes técnicos

- Sem mudança de schema: fotos estáticas resolvidas por `getPersonPhoto(name, userId)`.
- O resolver do ecossistema (`src/features/alvorada/organizational/resolver.ts`) já usa `getPersonPhoto`, herdando as fotos sem alteração.
- Teste em `src/test/memberIdentity.test.ts` receberá asserções garantindo que Fernanda Seckler e Fernanda Meinertz resolvem retratos diferentes.
- Fallback de iniciais/ícone permanece para quem não tem retrato.
