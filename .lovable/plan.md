# Soja Store: 3 novas integrantes + correção de nome

## O que muda
1. **Novas integrantes na Equipe da Soja Store** (só nome, sem conta de acesso — igual a Paola, Andressa, Diovanna e Lucas):
   - Fernanda Reis Rauber
   - Alessandra Schaefer
   - Tatiane Raquel Meinhart
2. **Fotos em ícone redondo**, recortadas com foco no rosto:
   - Fernanda: recorte apertado no rosto (corta o braço, o fundo e a blusa).
   - Alessandra: rosto e óculos centralizados (corta a mão e a roupa).
   - Tatiane: rosto e ombros (corta braços, roupa e a assinatura do fotógrafo).
3. **Correção:** "Diovana Lorenzato" passa a se chamar **Diovanna Lorenzato** na comissão. A foto dela continua a mesma.

## Como fica
As três aparecem na equipe da Soja Store com foto, do mesmo jeito que os outros integrantes. Isso vale para a comissão, a Agenda e o Ecossistema. Diovanna aparece com o nome novo em todos esses lugares.

## Detalhes técnicos
- Recortes quadrados feitos com PIL (512px, webp), conferidos visualmente e enviados com `lovable-assets` para `src/assets/person-<slug>.webp.asset.json`.
- Mapa `personPhotos.ts`: adicionar as 3 chaves e renomear a chave para `diovanna lorenzato` (mantendo também `diovana lorenzato` como alias, para dados antigos).
- Banco: inserir as 3 em `commission_responsibles` da comissão Soja Store, com o mesmo papel e ordem usados para Paola, Andressa, Diovanna e Lucas, e atualizar o nome da Diovanna. Não alterar acessos nem RLS.
- Atualizar `sojaStorePortraits.test.ts` com os novos nomes e rodá-lo.
