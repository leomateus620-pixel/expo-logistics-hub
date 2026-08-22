# Fotos dos presidentes nos ícones de responsáveis

## O que muda

As 10 fotos enviadas passam a aparecer no mesmo ícone circular já usado hoje por Fabiano Soltis e Djeison Drey — em todos os pontos onde a pessoa aparece (seletor de responsáveis do cadastro, lista de selecionados, faixa de avatares na linha do tempo desktop/mobile e cartões "Responsável"/"Convidados" do evento expandido).

Vínculo confirmado no banco (nome exibido → comissão):

| Anexo | Pessoa no sistema | Comissão |
| --- | --- | --- |
| 1 | Bruna Pacheco de Quadros | Acolhimento e Bem Comum |
| 2 | EDUARDO SANTOS | Logística, Hotelaria e Turismo |
| 3 | José Fernando Borella | Bilheteria |
| 4 | Larissa Mello Dallalba | Credenciamento |
| 5 | Paulo Miguel Nedel | Relações Estratégicas |
| 6 | Raul Dário Nunez | Mercosul |
| 7 | Cap. Leonardo Ruy Dambroz | Prevenção e Combate a Incêndio |
| 8 | Cassio Ricardo Feltes | Soy Summit |
| 9 | Felipe Carpenedo Gabriel | Inovação e Tecnologia |
| 10 | Fernanda Matarucco Meinertz | Relacionamento e Experiência |

Observação sobre o Anexo 5: a foto tem duas pessoas (Paulo e a esposa). A imagem será recortada para o rosto do Paulo antes de entrar no sistema, para que o ícone circular fique com o enquadramento igual aos demais.

Todos os demais usuários continuam com iniciais/ícone genérico, e se alguma imagem falhar o ícone volta automaticamente para as iniciais.

## Detalhes técnicos

- Recortar o Anexo 5 (retrato do Paulo) e enviar as 10 imagens como assets de CDN via `lovable-assets create`, gerando `src/assets/person-<slug>.png.asset.json`.
- Estender `src/components/cronograma-eventos/personPhotos.ts`:
  - `PERSON_PHOTOS` com as chaves normalizadas dos nomes (ex.: `bruna pacheco de quadros`, `jose fernando borella`, `felipe carpenedo gabriel`).
  - `PERSON_PHOTOS_BY_USER_ID` com os `user_id` confirmados (`fae623bc…` Bruna, `87d4fa05…` Eduardo Santos, `6e758caf…` Fernando, `ae54d98d…` Larissa, `0ff212de…` Paulo, `3f4c603a…` Raul, `338f2835…` Leonardo, `62fec475…` Cássio, `8dce325e…` Felipe/Gabriel, `a3b62599…` Fernanda Matarucco), garantindo acerto mesmo com nome legado divergente.
  - Ajustar o `includes` do matcher para exigir correspondência por token, evitando que "Leonardo Chitolina" ou "Fernanda Seckler Eich" capturem a foto de outra pessoa.
- Nenhuma mudança de componente ou CSS: `PersonAvatar`/`EventPeopleAvatars` e as classes `.cronograma-person-avatar` já entregam tamanho, borda e enquadramento padronizados.
- Validação: teste unitário em `src/test/memberIdentity.test.ts` cobrindo resolução por `user_id` e ausência de colisão entre os dois Leonardos e as duas Fernandas, mais typecheck e captura Playwright autenticada (desktop 1280 e mobile 390) do seletor de responsáveis.
