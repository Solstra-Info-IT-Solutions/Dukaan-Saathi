#!/usr/bin/env bash
# Load check for create_sale on real Postgres (CI `database` job; Phase 13, BL-1303).
# Fills one shop with LOAD_SALES bills (default 100 000) through create_sale itself, then times SAMPLE more calls
# (default 200) and fails when the p95 database time is at or above P95_LIMIT_MS (default 150).
# Database time only: no network or PostgREST, measured with clock_timestamp() around each call.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
LOAD_SALES="${LOAD_SALES:-100000}"
SAMPLE="${SAMPLE:-200}"
P95_LIMIT_MS="${P95_LIMIT_MS:-150}"
USER_ID=00000000-0000-0000-0000-00000000f1a1
AS_USER="select set_config('request.jwt.claims', '{\"sub\":\"$USER_ID\",\"role\":\"authenticated\"}', false); set role authenticated;"

q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1" | tail -n 1; }
trap 'echo "::error title=create_sale load::failed at line $LINENO"' ERR

q "insert into auth.users (id, phone, phone_confirmed_at, aud, role)
   values ('$USER_ID', '919500000101', now(), 'authenticated', 'authenticated') on conflict do nothing" >/dev/null
SHOP=$(q "$AS_USER select public.create_shop('{\"clientOperationId\":\"99999999-9999-4999-8999-99999999f1a1\",\"name\":\"Load Shop\",\"businessCategory\":\"kirana\"}') ->> 'shopId'")
DEVICE=$(q "$AS_USER select public.register_device('$SHOP', '99999999-0000-4000-8000-00000000f1a1', 'android') ->> 'deviceId'")
FY=$(q "select private.financial_year(now(), 'Asia/Kolkata')")

# One bill: two quick lines, cash. Sequence numbers continue from the device's last bill.
cat >/tmp/load.sql <<SQL
create temp table if not exists load_timings (ms numeric);
grant all on load_timings to public;
create or replace function pg_temp.bill(p_seq integer) returns jsonb language sql as \$\$
  select jsonb_build_object(
    'clientOperationId', gen_random_uuid(), 'shopId', '$SHOP', 'deviceId', '$DEVICE',
    'invoice', jsonb_build_object('fy', '$FY', 'seq', p_seq),
    'occurredAt', now(), 'origin', 'online', 'source', 'keypad',
    'lines', jsonb_build_array(jsonb_build_object('kind', 'quick', 'label', 'Doodh', 'amountPaise', 5600),
                               jsonb_build_object('kind', 'quick', 'amountPaise', 2400)),
    'payments', jsonb_build_array(jsonb_build_object('method', 'cash', 'amountPaise', 8000)),
    'clientTotals', jsonb_build_object('subtotalPaise', 8000, 'discountPaise', 0, 'taxPaise', 0,
                                       'roundOffPaise', 0, 'totalPaise', 8000))
\$\$;
SQL

start=$(date +%s)
# Fill in batches of 5 000 (one transaction each) so a failure shows where it stopped.
done_count=0
while [ "$done_count" -lt "$LOAD_SALES" ]; do
  batch=$(( LOAD_SALES - done_count < 5000 ? LOAD_SALES - done_count : 5000 ))
  psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX -f /tmp/load.sql -c "$AS_USER" -c "
    do \$\$ begin
      for i in $((done_count + 1))..$((done_count + batch)) loop
        perform public.create_sale(pg_temp.bill(i));
      end loop;
    end \$\$;" >/dev/null
  done_count=$((done_count + batch))
done
echo "filled $LOAD_SALES bills in $(( $(date +%s) - start )) s"

RESULT=$(psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX -f /tmp/load.sql -c "$AS_USER" -c "
  do \$\$ declare t timestamptz; begin
    for i in $((LOAD_SALES + 1))..$((LOAD_SALES + SAMPLE)) loop
      t := clock_timestamp();
      perform public.create_sale(pg_temp.bill(i));
      insert into load_timings values (extract(epoch from clock_timestamp() - t) * 1000);
    end loop;
  end \$\$;" -c "select round(percentile_cont(0.5) within group (order by ms)::numeric, 1) || ' ' ||
                 round(percentile_cont(0.95) within group (order by ms)::numeric, 1) || ' ' ||
                 round(max(ms), 1) from load_timings" | tail -n 1)
read -r P50 P95 MAX <<<"$RESULT"
COUNT=$(q "select count(*) from public.sales where shop_id = '$SHOP'")
echo "create_sale at $COUNT bills in the shop: p50 ${P50} ms, p95 ${P95} ms, max ${MAX} ms (limit p95 < ${P95_LIMIT_MS} ms)"
echo "::notice title=create_sale load::$COUNT bills; p50 ${P50} ms, p95 ${P95} ms, max ${MAX} ms"
awk -v p="$P95" -v l="$P95_LIMIT_MS" 'BEGIN { exit !(p < l) }' || {
  echo "::error title=create_sale load::p95 ${P95} ms is not below ${P95_LIMIT_MS} ms"
  exit 1
}
echo "ok - create_sale p95 below ${P95_LIMIT_MS} ms with $COUNT bills in one shop"
