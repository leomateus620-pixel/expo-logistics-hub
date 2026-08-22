# Fotos de mais 8 lideranças nos ícones de responsáveis

## O que muda

As 8 fotos enviadas passam a aparecer no mesmo ícone circular já usado hoje pelos demais (seletor de responsáveis do cadastro, lista de selecionados, faixa de avatares na linha do tempo desktop/mobile e cartões "Responsável"/"Convidados" do evento expandido).

Vínculo confirmado no banco:

| Anexo | Pessoa no sistema | Função |
| --- | --- | --- |
| 1 | Daniel U. Ribeiro da Silva | Shows |
| 2 | Josyane Cristina Heck | Novas Gerações |
| 3 | Leonardo Chitolina | Arte e Cultura |
| 4 | Rosa Zorzan de Paula | Saúde, Bem Estar e Acessibilidade |
| 5 | Germano Tessmer Büttow | Presidente Exporural |
| 6 | Dário Júnior da Motta Germano | CCPF |
| 7 | Cléo Antonio Rockenbach | Diretor Comercial (Comissão Central) |
| 8 | Marcos Eduardo Servat | Presidente CCPF |

Germano, Dário, Cléo e Marcos têm dois registros cada no banco (versão "voluntário/legado" e versão oficial). Ambos os IDs de cada um recebem a mesma foto, para que o ícone apareça em qualquer evento antigo ou novo.

Quem não tem foto continua com iniciais/ícone genérico, e se alguma imagem falhar o ícone volta automaticamente para as iniciais.

## Detalhes técnicos

- Subir as 8 imagens via `lovable-assets create`, gerando `src/assets/person-<slug>.png.asset.json`.
- Estender `src/components/cronograma-eventos/personPhotos.ts`:
  - `PERSON_PHOTOS` com as chaves normalizadas: `daniel u ribeiro da silva`, `josyane cristina heck`, `leonardo chitolina`, `rosa zorzan de paula`, `germano tessmer buttow`, `dario junior da motta germano`, `cleo antonio rockenbach`, `marcos eduardo servat`.
  - `PERSON_PHOTOS_BY_USER_ID` com os IDs confirmados: Daniel `c44eb392…`; Josyane `f2eca357…`; Leonardo Chitolina `17a834e4…`; Rosa `aafa8fd8…`; Germano `b431453a…` e `d3bd4c52…`; Dário `8a948030…` e `f7b108d9…`; Cléo `557dacc6…` e `a3e893e1…`; Marcos `f9ed4ab9…` e `7e7b9e5f…`.
- O matcher por tokens já existente evita colisões (Leonardo Chitolina × Cap. Leonardo Ruy Dambroz, Daniel U. Ribeiro × Daniel Dallalba, Rosa Zorzan × Vladimir da Rosa, Marcos Servat × Carla Servat).
- Nenhuma mudança de componente ou CSS: `PersonAvatar`/`EventPeopleAvatars` já entregam tamanho, borda e enquadramento padronizados.
- Validação: ampliar `src/test/memberIdentity.test.ts` cobrindo resolução por nome e por user_id e ausência de colisão entre os homônimos acima, mais typecheck.
