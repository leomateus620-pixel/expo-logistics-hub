# Corrigir o envio da Casa Fenasoja ao Google Agenda

## Diagnóstico (conferido no banco)
- Fernanda e Zélia têm **duas contas cada** no sistema:
  - contas antigas (março, perfil Leitura): `FERNANDA SECKLER EICH`, `ZÉLIA SAVOLDI` — foram estas que vinculei à Casa Fenasoja;
  - contas atuais (julho, perfil Gestor): `Fernanda Seckler Eich`, `Zélia Savoldi` — são as que **têm o Google Agenda conectado**.
- Resultado: o envio olha a conta conectada, não encontra o vínculo e, nos próximos eventos (Safe Park 20/10, Mega Feira 21/10, Dario Núñez), o sistema chegou a mandar **remoções** para o Google delas às 20:49 de hoje.
- Débora tem uma única conta, vinculada corretamente, mas **nunca conectou o Google Agenda** — não há para onde enviar.
- Nada está travado: a fila não tem itens parados nem com erro.

## O que será feito
1. Vincular também as contas atuais de Fernanda e Zélia à Casa Fenasoja (mantendo as antigas, sem apagar nada).
2. Rodar uma rodada de envio: colocar na fila os 10 eventos da Casa Fenasoja para as contas conectadas de Fernanda e Zélia, e acionar o envio uma vez.
3. Conferir que os 10 eventos ficaram registrados como enviados no Google das duas, sem erros, e que os avisos no celular também passam a considerar as contas atuais.
4. Débora: fica pronta — assim que ela conectar o Google Agenda em Configurações, os eventos vão automaticamente. Informarei isso como pendência.

## Detalhes técnicos
- Migração de dados via ferramenta de dados (INSERT em `cronograma_location_watchers` para `c00d04b3…` e `74a71a9f…`, `ON CONFLICT DO NOTHING`).
- Reenfileirar `upsert` em `google_sync_outbox` para os pares (usuária, evento casa_fenasoja) e invocar `google-sync-worker`; validar `google_calendar_event_map` com `deleted_at IS NULL`.
- Conferir que `google_user_eligible_for_event` retorna verdadeiro para os 20 pares antes do envio.
