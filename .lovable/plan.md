# Fotos oficiais de 6 lideranças

Adicionar os retratos enviados ao registro central de fotos, para que apareçam automaticamente na Agenda FenaSoja (avatares de responsáveis/convidados, linha do tempo, cards) e no Ecossistema Organizacional — os dois módulos já leem do mesmo registro.

## Pessoas e vínculos confirmados no banco

| Anexo | Pessoa | Comissão/Assessoria |
| --- | --- | --- |
| 1 | Roberto Steffen | Infraestrutura e Segurança do Trabalho |
| 2 | Felipe Bortoli | Indústria, Comércio e Serviços |
| 3 | Valtair Dornelles | Serviços |
| 4 | Elisandra Simão Reis | Pecuária |
| 5 | Alexandre Dall'agnese | Cooperativismo |
| 6 | Zélia Savoldi | Marketing / Comissão Central |

Valtair e Zélia possuem dois registros de usuário cada; ambos os identificadores serão mapeados para a mesma foto, evitando avatar vazio conforme o cadastro usado no evento.

## O que será feito

1. Publicar as 6 imagens como assets de CDN (pointers `.asset.json` em `src/assets`), sem versionar binários.
2. Registrar cada foto em `src/components/cronograma-eventos/personPhotos.ts`, por nome normalizado e por `user_id` (10 identificadores no total).
3. Garantir enquadramento facial correto: os avatares usam recorte circular; ajustar o CSS de `.cronograma-person-avatar` e do nó do ecossistema para `object-fit: cover` com foco no topo do rosto (`object-position` levemente acima do centro), de modo que o rosto fique centralizado e sem corte de queixo/testa em todos os tamanhos (xs–lg).
4. Verificar visualmente no preview (Agenda FenaSoja e Ecossistema) que os 6 avatares carregam e estão bem enquadrados.

## Detalhes técnicos

- Nenhuma mudança de schema: as fotos são estáticas, resolvidas por `getPersonPhoto(name, userId)`.
- O resolver do ecossistema (`src/features/alvorada/organizational/resolver.ts`) já cai em `getPersonPhoto`, então herda as fotos sem alteração.
- Fallback de iniciais/ícone permanece intacto para quem não tem retrato.
