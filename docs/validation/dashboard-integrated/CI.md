# Conferência de CI após a PR #178

A PR #178 foi incorporada em `main` em 01/10/2026, pelo merge `3c653eb8d365b53736a12e1443e79b6c9eeb918e`. O commit de implementação é `c01222b187cf015b199ee4041d5e2f99c211db03`.

## Resultado remoto do commit de implementação

| Check | Resultado | Evidência |
| --- | --- | --- |
| dashboard | Aprovado | [Commercial Dashboard scopes](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36933826072) |
| public-map | Aprovado | [Public Map contracts](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36933826176) |
| architecture | Aprovado | [Rural architecture contracts](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36933826069) |
| spatial | Falhou: 198/200 testes aprovados | [Commercial Map spatial contracts](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36933826294) |
| validate (standard, wide, mobile) | Falharam | [Territorial reconstruction](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36933826220) |
| contracts | Falhou; build aprovado | [Arena reconstruction](https://github.com/leomateus620-pixel/expo-logistics-hub/actions/runs/36933826287) |
| visual (mobile) | Aprovado | Mesmo workflow Arena |
| visual (desktop, wide) | Falharam | Mesmo workflow Arena |

O CI completo não está verde. Os workflows territoriais e Arena comparam a revisão atual com referências históricas fixas (`4f8bdf37` e `8783fea7`), anteriores à base desta implementação. Essas comparações não permitem atribuir todas as falhas a este diff.

Os jobs visuais da Arena falharam na preparação da revisão histórica por falta de hidratação dentro do orçamento de QA e, na revisão atual, por timeout de 30 segundos ao capturar screenshots. Esses jobs não abriram a dashboard. Isso não substitui nem invalida a validação local dedicada de SVG em quatro viewports, documentada no README; também não comprova a cena 3D nesses runners.

## Reprodução na base atual e ajuste de contratos Q/V

Foi criado um checkout isolado da base efetiva `28c237902d7eae2a37a003e1da6081d020824f7e`, com os mesmos módulos de dependências locais, sem alterar a fonte do checkout de implementação. Foram executados os 33 arquivos com falhas no artefato territorial remoto, com `--maxWorkers=2 --testTimeout=60000` e reporter JSON. Após a comparação, o checkout de auditoria foi arquivado.

Dois testes que passavam nessa base passaram a falhar depois da classificação confirmada das quadras Q e V:

- O contrato elétrico fixava o recorte ICS em 107 nós e 74 conexões. A extensão confirmada do recorte contém 123 nós e 87 conexões, provenientes do mesmo catálogo físico. O teste foi atualizado e continua verificando o catálogo global, os demais recortes, a presença de Q/V e a integridade de cada conexão.
- A orientação territorial fixava 14 quadras confirmadas. O teste agora verifica as 16 identidades oficiais completas, incluindo Q e V, e exige que ambas pertençam ao segmento ICS.

Essas expectativas foram corrigidas em uma PR complementar apenas de testes e documentação. Não foram alterados renderer, infraestrutura elétrica, geometria, classificação, preços ou regras da interface já incorporada.

Resultado local dos mesmos 33 arquivos após o ajuste:

| Revisão | Aprovados | Falhas | Total |
| --- | --- | --- | --- |
| Base `28c23790` | 228 | 45 | 273 |
| Implementação + contratos Q/V corrigidos | 228 | 45 | 273 |

As 45 identidades de testes com falha são as mesmas nas duas execuções. Dois prefixos de asserção mudam devido à classificação autorizada: o hash integral de entidades em `commercialMapExporuralArchitecture` e o primeiro registro divergente em `commercialMapSoyGateInfrastructure` (Q/V passam a ter associação ICS). Ambos já falhavam na base; esses testes e hashes históricos foram preservados. Os resumos JSON registram cada identidade e seu primeiro erro, sem afirmar equivalência integral de todos os detalhes de asserção.

As falhas específicas de `spatial` — preservação contra inventário antigo e folga de postes em vias posteriores — e os dois hard gates da Arena — inventário antigo e interseções das vias posteriores — foram reproduzidas na base efetiva. Os arquivos de domínio correspondentes não foram modificados pela dashboard.

A execução focada dos dois arquivos corrigidos aprovou 23 de 25 testes: todos os dez testes de orientação e treze de elétrica. As duas falhas elétricas restantes (`transformer-ref-007` e folga de fases) são as mesmas da base. ESLint desses dois arquivos e `git diff --check` passaram. Nenhum novo build ou teste visual foi necessário para mudanças exclusivamente em expectativas de teste e documentação.

Evidências compactas: [base atual](evidence/ci-current-base-failures.json), [candidato após ajuste](evidence/ci-qv-contracts-failures.json). Os artefatos completos e logs remotos permanecem nos workflows vinculados acima.
