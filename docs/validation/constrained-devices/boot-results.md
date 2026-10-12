# Abertura: base e candidato nas mesmas condições locais

Base `8f3e871010ebfeab45824ba042183127da3b15e3`; candidato de código `38aff99abd08261e7523a1855ca074ff1c350008`. Manifests servidos verificados; os relatórios brutos não embutem SHA em cada abertura. Commit documental posterior não muda o código medido.

72 aberturas válidas, 0 falhas. Matriz limpa concluída, após substituir a rodada CPU4 excluída.

Apple M5/ANGLE Metal, Chrome 155, HIGH fixo. Execução sequencial AB/BA em contextos isolados, sem dois contextos WebGL vivos. As condições aceitas excluem a rodada que coincidiu com um syntax check breve; os dados originais e a razão são preservados pela política de entrada. Alimentação/bateria, temperatura/clocks e outras aplicações não controlados. CPU4 e viewport/toque móvel são emulação na mesma GPU/driver.

Valores em ms: **mediana [mínimo; máximo]**, por versão/cache/condição. n explícito; não há p95 populacional. Prontidão usa a barreira real de três apresentações novas, estrutura preparada e controles. Hidratação mede a duração posterior até o trabalho secundário terminar; spans se sobrepõem e não são somados como decomposição serial.

| Condição/cache | n base/candidato | Prontidão base | Candidato | Montagem essencial base | Candidato | Hidratação base | Candidato |
|---|---:|---:|---:|---:|---:|---:|---:|
| desktop / cold | 10/10 | 3472 [3375; 3495] | 3395.5 [3309; 3415] | 1383.5 [1372; 1402] | 1308.5 [1290; 1325] | 6683.5 [6450; 6816] | 6691.5 [6500; 6767] |
| desktop / warm | 10/10 | 3281.5 [3258; 3308] | 3202 [3171; 3239] | 1241 [1231; 1255] | 1165.5 [1161; 1190] | 6658.5 [6550; 6767] | 6691.5 [6516; 6781] |
| cpu4 / cold | 3/3 | 7865 [7816; 7972] | 7582 [7536; 7685] | 5418 [5400; 5527] | 5148 [5080; 5244] | 14012 [13978; 14149] | 13964 [13880; 14189] |
| cpu4 / warm | 3/3 | 7230 [7213; 7284] | 6980 [6884; 7032] | 4962 [4953; 5010] | 4716 [4612; 4749] | 14040 [13941; 14336] | 14749 [13392; 15805] |
| mobile / cold | 3/3 | 3731 [3729; 3737] | 3649 [3645; 3649] | 1386 [1379; 1398] | 1307 [1307; 1311] | 6883 [6833; 6918] | 6900 [6817; 6917] |
| mobile / warm | 3/3 | 3542 [3540; 3557] | 3426 [3418; 3477] | 1241 [1239; 1247] | 1173 [1158; 1176] | 6917 [6883; 6998] | 6883 [6866; 6900] |
| network / cold | 2/2 | 20603.5 [20448; 20759] | 20475 [20416; 20534] | 1349.5 [1335; 1364] | 1287 [1270; 1304] | 6574 [6533; 6615] | 6683.5 [6650; 6717] |
| network / warm | 2/2 | 3290.5 [3268; 3313] | 3192 [3160; 3224] | 1245.5 [1239; 1252] | 1189 [1185; 1193] | 6683 [6600; 6766] | 6608 [6533; 6683] |

A montagem/prontidão mostram redução nas condições observadas; isso não certifica aparelhos afetados ou ganho universal. Hidratação secundária não melhora uniformemente e suas diferenças/caudas permanecem na tabela. Cada abertura aceita teve barreira válida e gesto nativo que moveu a câmera; isso não comprova fluidez sustentada nem latência física.

`cold`: contexto novo + cache HTTP explicitamente limpo pelo CDP. `warm`: reload no mesmo contexto preservando HTTP/CacheStorage. Cache de shaders/OS não controlado. Assets do servidor usam public,max-age=3600 e sem compressão; transferências aquecidas próximas de 3.370 bytes comprovam reutilização das respostas nesse cenário. Body inclui recursos cacheados e não equivale a bytes transferidos. decodedBodySize não foi capturado e permanece desconhecido. Resource Timing do documento não inventaria todos os fetches dos workers.

Rede emulada: 150 ms, download 200.000 B/s e upload 100.000 B/s. São assets do servidor loopback, não CDN ou dados remotos. Inventário oficial 2026/persistedStage não é o projeto autorizado atual; sessão/retries/paginação/RLS/tokens público/comissão não foram medidos. dataMs e routeDataWaitMs null representam medição ausente, não tempo zero.

O próximo RAF após input é oportunidade do event-loop, não input-to-photon físico. Tempo do gesto inclui a conclusão do harness. Submissão de programas mede JS; link/reflexão elapsed inclui scheduling/polling e overlap. program-submission existe somente no candidato; ausência na base é desconhecida. Eventos têm limite 500 e podem perder etapas antigas. Upload marker não mede GPU puro. Heap bruto não tem GC normalizado; contadores de texturas/geometrias/programas não são VRAM. GPU timer/targets/residência e temperatura em 15–30 min permanecem não medidos.

[boot-summary.json](boot-summary.json) conserva cada abertura e seus marcos/readiness/saúde/contexto/qualidade/DPR/buffer/identidade, heap/counters, preparação QA e bytes. [boot-input-policy.json](boot-input-policy.json) preserva a exclusão/substituição da CPU4. Originais completos (~14MB) continuam em `/tmp/fenasoja-map-benchmarks` e o repeat em `/tmp/fenasoja-map-benchmarks-cpu4-repeat`; não são duplicados na PR.

Reproduzir: `MAP_BOOT_SUMMARY_INPUT=/tmp/fenasoja-map-benchmarks node scripts/constrained-devices/summarize.cjs`. O script aplica a política de exclusões por padrão; aceita output/provenance/SHA/policy/replacement nas variáveis descritas no código. Navegação e validação funcional são medidas separadamente.
