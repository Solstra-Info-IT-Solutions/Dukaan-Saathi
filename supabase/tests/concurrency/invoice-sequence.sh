#!/usr/bin/env bash
# Concurrency checks for create_sale on real Postgres (CI `database` job, after pgTAP).
# PGlite has a single connection, so these cannot run in `npm run db:check:local`.
#   1. Two different bills race for the same invoice number → exactly one wins, the other gets
#      DS_INVOICE_SEQUENCE_CONFLICT.
#   2. The same bill is submitted twice at the same time (double tap / retry) → one sale, same id twice.
#   3. The device's invoice numbers have no gaps.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
USER_ID=00000000-0000-0000-0000-00000000f0a1
CLAIMS="select set_config('request.jwt.claims', '{\"sub\":\"$USER_ID\",\"role\":\"authenticated\"}', false)"
AS_USER="$CLAIMS; set role authenticated;"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

q() { psql "$DB_URL" -v ON_ERROR_STOP=1 -qtAX -c "$1" | tail -n 1; }
# On failure: full output in the log, and a short GitHub annotation (readable without log access).
fail() {
  echo "FAIL: $1"
  for f in "$TMP_DIR"/*.out; do echo "--- $f"; cat "$f"; done
  echo "::error title=create_sale concurrency::$1 | $(cat "$TMP_DIR"/*.out 2>/dev/null | tr '
' ' ' | cut -c1-900)"
  exit 1
}
trap 'echo "::error title=create_sale concurrency::setup failed at line $LINENO"' ERR

q "insert into auth.users (id, phone, phone_confirmed_at, aud, role)
   values ('$USER_ID', '919500000001', now(), 'authenticated', 'authenticated') on conflict do nothing" >/dev/null
SHOP=$(q "$AS_USER select public.create_shop('{\"clientOperationId\":\"99999999-9999-4999-8999-999999999991\",\"name\":\"Concurrency Shop\",\"businessCategory\":\"kirana\"}') ->> 'shopId'")
DEVICE=$(q "$AS_USER select public.register_device('$SHOP', '99999999-0000-4000-8000-000000000001', 'android') ->> 'deviceId'")
FY=$(q "select private.financial_year(now(), 'Asia/Kolkata')")
NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)

bill() { # seq, operation id
  echo "{\"clientOperationId\":\"$2\",\"shopId\":\"$SHOP\",\"deviceId\":\"$DEVICE\",\"invoice\":{\"fy\":\"$FY\",\"seq\":$1},\"occurredAt\":\"$NOW\",\"origin\":\"online\",\"lines\":[{\"kind\":\"quick\",\"amountPaise\":1000}],\"payments\":[{\"method\":\"cash\",\"amountPaise\":1000}],\"clientTotals\":{\"subtotalPaise\":1000,\"discountPaise\":0,\"taxPaise\":0,\"roundOffPaise\":0,\"totalPaise\":1000}}"
}
# Holds its transaction open for a second after create_sale so the two sessions overlap. One -c per statement:
# older psql clients print only the last result of a multi-statement -c string.
submit() { # json, output file
  psql "$DB_URL" -qtAX -c "begin" -c "$CLAIMS" -c "set role authenticated"     -c "select public.create_sale('$1')::text" -c "select pg_sleep(1)" -c "commit" >"$2" 2>&1 || true
}

# 1. Same invoice number, different bills
submit "$(bill 1 99999999-0000-7000-8000-00000000c001)" "$TMP_DIR/race-a.out" &
submit "$(bill 1 99999999-0000-7000-8000-00000000c002)" "$TMP_DIR/race-b.out" &
wait
WINS=$(cat "$TMP_DIR"/race-*.out | grep -c '"invoiceNumber"' || true)
CONFLICTS=$(cat "$TMP_DIR"/race-*.out | grep -c '^ERROR:  DS_INVOICE_SEQUENCE_CONFLICT' || true)
[ "$WINS" = 1 ] && [ "$CONFLICTS" = 1 ] || fail "race for one invoice number: $WINS wins, $CONFLICTS conflicts (expected 1 and 1)"
echo "ok 1 - concurrent bills with the same invoice number: one saved, one DS_INVOICE_SEQUENCE_CONFLICT"

# 2. Same bill twice at once
SAME=$(bill 2 99999999-0000-7000-8000-00000000c003)
submit "$SAME" "$TMP_DIR/dup-a.out" &
submit "$SAME" "$TMP_DIR/dup-b.out" &
wait
IDS=$(cat "$TMP_DIR"/dup-*.out | grep -o '"saleId": "[^"]*"' | sort -u | wc -l)
COUNT=$(q "select count(*) from public.sales where shop_id = '$SHOP' and seq = 2")
[ "$IDS" = 1 ] && [ "$COUNT" = 1 ] || fail "double submit: $IDS distinct sale ids, $COUNT rows (expected 1 and 1)"
echo "ok 2 - the same bill submitted twice at once is saved once and both calls return it"

# 3. No gaps
GAPS=$(q "select count(*) - max(seq) from public.sales where shop_id = '$SHOP' and device_id = '$DEVICE' and fy = '$FY'")
[ "$GAPS" = 0 ] || fail "invoice sequence has gaps"
echo "ok 3 - invoice numbers of the device are gap-free"
