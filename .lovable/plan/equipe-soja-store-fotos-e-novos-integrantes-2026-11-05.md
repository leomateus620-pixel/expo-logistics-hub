# Equipe Soja Store: fotos e novos integrantes

## O que muda
1. **Carla Freisleben Servat** passa a aparecer como voluntária (Equipe de apoio) na Soja Store. A conta dela e o que ela pode ver ou editar continuam iguais.
2. **Foto da Carla** ligada à conta dela e ao nome, aparecendo na comissão, na Agenda e no Ecossistema.
3. **Novos nomes na Soja Store** (sem conta, como equipe de apoio, com foto):
   - Paola Johann Külzer
   - Andressa Kunzler
   - Diovana Lorenzato
   - Lucas Tolazzi
4. Cristina continua como contato principal.

## Detalhes técnicos
- Fotos: recortar em formato quadrado no rosto, converter para webp e subir com lovable-assets (`person-<nome>.webp.asset.json`). Registrar em `personPhotos.ts`: Carla por user ID (`f0520c35…`) e por nome; os outros quatro por nome normalizado (com e sem acento).
- Dados (run_sql): Carla `relationship_role` corresponsavel → `equipe_apoio` (user_id, active e is_primary inalterados). Inserir 4 linhas em `commission_responsibles` (pessoa, equipe_apoio, user_id nulo, display_order 4–7).
- Antes de mudar a função da Carla, conferir se alguma regra de acesso depende de `relationship_role`; se depender, manter o acesso dela igual a hoje (aviso antes de qualquer ajuste).
- Teste pequeno: as 5 fotos são encontradas pelo nome e a da Carla pelo user ID.
- Verificar abrindo a comissão Soja Store no preview.
