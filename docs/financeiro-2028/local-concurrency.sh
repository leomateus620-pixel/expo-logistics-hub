#!/usr/bin/env bash
# APENAS BANCO LOCAL SINTÉTICO (após local-test.sql). Uso: PSQL="psql -h /tmp -p 5499 -U postgres -d postgres" ./local-concurrency.sh
set -u
PSQL=${PSQL:-psql}
ORG="'a0000000-0000-0000-0000-000000000001'"
AS_ADMIN="SET ROLE authenticated; SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',false);"
E28="(SELECT id FROM financial_editions WHERE org_id=$ORG AND code=2028)"
q() { $PSQL -qtAX -v ON_ERROR_STOP=1 -c "$AS_ADMIN $1" | tail -1; }
new_obligation() { q "SELECT financial_save($ORG,'obligation',jsonb_build_object('edition_id',$E28,'direction','receber','description','$1','amount_cents',10000),NULL,gen_random_uuid())->>'id';"; }
receive() { echo "SELECT financial_record_movement($ORG,jsonb_build_object('edition_id',$E28,'kind','$3','direction','$4','amount_cents',$2,'occurred_on','2027-02-01'),jsonb_build_array(jsonb_build_object('obligation_id','$1','amount_cents',$2)),gen_random_uuid())->>'id';"; }
net() { q "SELECT coalesce(sum(amount_cents),0) FROM financial_movement_allocations WHERE obligation_id='$1';"; }
fail=0

# 1) devolução de 40 em transação aberta × estorno do recebimento original de 100
O1=$(new_obligation "Conc A"); R1=$(q "$(receive "$O1" 10000 recebimento entrada)")
( $PSQL -qtAX -c "BEGIN; $AS_ADMIN $(receive "$O1" 4000 devolucao saida) SELECT pg_sleep(2); COMMIT;" >/tmp/concA.out 2>&1 ) &
sleep 0.5
$PSQL -qtAX -c "$AS_ADMIN SELECT financial_reverse_movement($ORG,'$R1','Estorno concorrente','2027-02-02',gen_random_uuid());" >/tmp/concB.out 2>&1
wait
N=$(net "$O1")
if grep -q REVERSAL_EXCEEDS_NET /tmp/concB.out && [ "$N" = "6000" ]; then echo "ok: estorno concorrente à devolução recusado, quitação 60"; else echo "FALHOU 1 (net=$N)"; cat /tmp/concA.out /tmp/concB.out; fail=1; fi

# 2) dois recebimentos simultâneos de 70 numa obrigação de 100
O2=$(new_obligation "Conc B")
( $PSQL -qtAX -c "BEGIN; $AS_ADMIN $(receive "$O2" 7000 recebimento entrada) SELECT pg_sleep(1.5); COMMIT;" >/tmp/concC.out 2>&1 ) &
sleep 0.5
$PSQL -qtAX -c "$AS_ADMIN $(receive "$O2" 7000 recebimento entrada)" >/tmp/concD.out 2>&1
wait
N=$(net "$O2")
if grep -q OVER_SETTLEMENT /tmp/concD.out && [ "$N" = "7000" ]; then echo "ok: só um recebimento concorrente passa"; else echo "FALHOU 2 (net=$N)"; cat /tmp/concC.out /tmp/concD.out; fail=1; fi

# 3) duas gravações simultâneas da mesma origem: uma obrigação
SRC="'91000000-0000-0000-0000-0000000000a1'"
$PSQL -qtAX -c "INSERT INTO lot_sale_installments VALUES ($SRC,'f0000000-0000-0000-0000-000000000001',9,'2027-07-05',50,'PENDING');" >/dev/null
SAVE="SELECT financial_save($ORG,'obligation',jsonb_build_object('edition_id',$E28,'source_type','parcela_comercial','source_id',$SRC),NULL,gen_random_uuid());"
( $PSQL -qtAX -c "BEGIN; $AS_ADMIN $SAVE SELECT pg_sleep(1.5); COMMIT;" >/tmp/concE.out 2>&1 ) &
sleep 0.5
$PSQL -qtAX -c "$AS_ADMIN $SAVE" >/tmp/concF.out 2>&1
wait
C=$($PSQL -qtAX -c "SELECT count(*) FROM financial_obligations WHERE source_id=$SRC;")
if [ "$C" = "1" ] && ! grep -q ERROR /tmp/concE.out /tmp/concF.out; then echo "ok: gravações simultâneas da mesma origem geram uma obrigação"; else echo "FALHOU 3 (count=$C)"; cat /tmp/concE.out /tmp/concF.out; fail=1; fi

[ $fail = 0 ] && echo "CONCORRÊNCIA OK"
exit $fail
