# Personagens do auditório — procedência

Dois personagens masculinos adultos genéricos, de pele clara, preparados para esta visita. Não representam pessoas reais nem reutilizam os modelos de dirigentes existentes no projeto.

Fonte: [MakeHuman system assets, CC0](https://static.makehumancommunity.org/assets/assetpacks/makehuman_system_assets.html), obtidos de `https://files.makehumancommunity.org/asset_packs/makehuman_system_assets/makehuman_system_assets_cc0.zip`.

SHA-256 do pacote: `b542127a8e25547c7c29c19f2d1d2adb9a664c80396ecd694095dbc8028a0107`.

Os cabeçalhos dos arquivos `.mhclo` declaram liberação explícita em CC0 em setembro de 2020, com Data Collection AB, Joel Palmius e Jonas Hauquier como titulares na data. [Política oficial de licenças](https://static.makehumancommunity.org/about/license.html) e [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/).

Assets: malha humana hm08; peles `young_caucasian_male` e `middleage_caucasian_male`; cabelos `short02` / `short01`; sobrancelhas `eyebrow001` / `eyebrow003`; olhos `high-poly`, cílios `eyelashes01`, dentes `teeth_base`, terno `male_elegantsuit01`, sapatos `shoes01`. Pele, cabelo, olhos, sobrancelhas, roupa e calçado têm mapas próprios. Os cabelos e sobrancelhas usam alpha mask; pele e roupa são opacas.

Autoria externa: Blender 4.5.10 LTS e [MPFB 2.0.18](https://github.com/makehumancommunity/mpfb2), commit `6ff1eb358f6c1959ced77e79e6dd2406d9a71f49`. O software MPFB tem sua licença própria; seu código não é distribuído no aplicativo. A saída utiliza os assets CC0. O script `build-ushers.py` carrega o checkout externo numa sessão Blender isolada, sem salvar preferências do usuário.

Exportação: glTF 2.0 binário, rig de nomes Mixamo gerado pelo MPFB, sem usar modelos ou animações do serviço Mixamo. Perfis/macros e bones em `public/soy-summit/people/ushers-authoring.json`; pesos finais em `docs/soy-summit/ushers-assets.json`. `optimize-ushers.cjs` reempacota mapas opacos em JPEG 90, conserva alfa em PNG e limita mapas a 1024 px (512 px nos recortes de cabelo). A animação, IK e cortina são código próprio do projeto, sem animações externas.

São personagens de tempo real com anatomia e materiais humanos; não são digitalizações de pessoas nem personagens de cinema fotorrealistas. O produto os observa à distância do palco. A captura aproximada de QA serve para inspecionar roupa, cabelo e articulações.
