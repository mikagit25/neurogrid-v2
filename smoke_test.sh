#!/bin/bash
API="http://localhost:4001"
FRONT="http://localhost:4000"
PASS=0; FAIL=0

ok()  { echo "  PASS: $1"; PASS=$((PASS+1)); }
fail(){ echo "  FAIL: $1"; FAIL=$((FAIL+1)); }
section() { echo ""; echo "=== $1 ==="; }

# ── Auth ──────────────────────────────────────────────────────────────────────
section "AUTH"

R=$(curl -s -X POST $API/api/auth/register -H "Content-Type: application/json" \
  -d '{"email":"smoke_'$$'@ng.dev","password":"Test1234!","agreement_accepted":true}')
echo $R | grep -q '"email"' && ok "register" || fail "register: $R"

R=$(curl -s -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"smoke_'$$'@ng.dev","password":"Test1234!"}')
TOKEN=$(echo $R | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -n "$TOKEN" ] && ok "login" || fail "login: $R"

H="Authorization: Bearer $TOKEN"

R=$(curl -s $API/api/auth/me -H "$H")
echo $R | grep -q '"email"' && ok "auth/me" || fail "auth/me: $R"

# ── Admin login ───────────────────────────────────────────────────────────────
section "ADMIN AUTH"
AR=$(curl -s -X POST $API/api/auth/login -H "Content-Type: application/json" \
  -d '{"email":"admin@neurogrid.network","password":"Admin2026!"}')
ATOKEN=$(echo $AR | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
[ -n "$ATOKEN" ] && ok "admin login" || fail "admin login: $AR"
AH="Authorization: Bearer $ATOKEN"

# ── Blocked user cannot login ─────────────────────────────────────────────────
section "USER BLOCK"
BLOCK_UID=$(curl -s "$API/api/admin/users?search=smoke_$$" -H "$AH" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -X PATCH "$API/api/admin/users/$BLOCK_UID" -H "$AH" -H "Content-Type: application/json" -d '{"is_active":false}' | grep -q '"ok":true' && ok "block user" || fail "block user"
R=$(curl -s -X POST $API/api/auth/login -H "Content-Type: application/json" -d '{"email":"smoke_'$$'@ng.dev","password":"Test1234!"}')
echo $R | grep -q "заблокирована" && ok "blocked login rejected" || fail "blocked login rejected: $R"
curl -s -X PATCH "$API/api/admin/users/$BLOCK_UID" -H "$AH" -H "Content-Type: application/json" -d '{"is_active":true}' | grep -q '"ok":true' && ok "unblock user" || fail "unblock user"

# ── Admin stats ───────────────────────────────────────────────────────────────
section "ADMIN STATS & USERS"
curl -s $API/api/admin/stats -H "$AH" | grep -q '"users"' && ok "admin stats" || fail "admin stats"
curl -s "$API/api/admin/users?search=admin" -H "$AH" | grep -q '"users"' && ok "admin users search" || fail "admin users search"
TESTUID=$(curl -s "$API/api/admin/users?search=smoke_$$" -H "$AH" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s -X POST "$API/api/admin/users/$TESTUID/balance" -H "$AH" -H "Content-Type: application/json" \
  -d '{"amount":100,"note":"smoke test"}' | grep -q '"ok":true' && ok "admin adjust balance" || fail "admin adjust balance"
curl -s -X PATCH "$API/api/admin/users/$TESTUID" -H "$AH" -H "Content-Type: application/json" \
  -d '{"is_admin":false}' | grep -q '"ok":true' && ok "admin patch user" || fail "admin patch user"

# ── Scenarios ─────────────────────────────────────────────────────────────────
section "SCENARIOS"
R=$(curl -s $API/api/scenarios -H "$H")
echo $R | grep -q '"scenarios"' && ok "list scenarios" || fail "list scenarios: $R"
SCID=$(echo $R | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$SCID" ] && ok "scenario id found" || fail "scenario id not found"

# Admin toggle + edit
curl -s -X PATCH "$API/api/admin/scenarios/$SCID" -H "$AH" -H "Content-Type: application/json" \
  -d '{"is_active":true}' | grep -q '"ok":true' && ok "admin toggle scenario" || fail "admin toggle scenario"
curl -s -X PUT "$API/api/admin/scenarios/$SCID" -H "$AH" -H "Content-Type: application/json" \
  -d '{"price":9.9}' | grep -q '"ok":true' && ok "admin edit scenario price" || fail "admin edit scenario price"

# ── Connections ───────────────────────────────────────────────────────────────
section "CONNECTIONS"
# Connection validation hits real marketplace API — fake creds get 422 (invalid) or 500 (network)
# We just verify the schema validation layer passes (no "Required" errors)
R=$(curl -s -X POST $API/api/connections -H "$H" -H "Content-Type: application/json" \
  -d '{"platform":"ozon","clientId":"111","apiKey":"testkey","displayName":"Test Ozon"}')
echo $R | grep -qv '"Required"' && ok "create connection (ozon) schema valid" || fail "create connection (ozon) schema error: $R"
CONN_ID=$(echo $R | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
R2=$(curl -s -X POST $API/api/connections -H "$H" -H "Content-Type: application/json" \
  -d '{"platform":"wb","apiKey":"testwbkey","displayName":"Test WB"}')
echo $R2 | grep -qv '"Required"' && ok "create connection (wb) schema valid" || fail "create connection (wb) schema error: $R2"
CONN_WB_ID=$(echo $R2 | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
curl -s $API/api/connections -H "$H" | grep -q '"connections"' && ok "list connections" || fail "list connections"

# ── Wallet ────────────────────────────────────────────────────────────────────
section "WALLET"
curl -s $API/api/auth/me -H "$H" | grep -q '"balance"' && ok "wallet balance (via /me)" || fail "wallet balance (via /me)"
curl -s $API/api/wallet/transactions -H "$H" | grep -q '"transactions"' && ok "wallet transactions" || fail "wallet transactions"

# ── Billing profile ───────────────────────────────────────────────────────────
section "BILLING PROFILE"
R=$(curl -s -X PUT $API/api/profile/billing -H "$H" -H "Content-Type: application/json" \
  -d '{"company_name":"Test OOO","unp":"123456789","billing_email":"test@test.com"}')
echo $R | grep -q '"ok":true\|"profile"' && ok "save billing profile" || fail "save billing profile: $R"
curl -s $API/api/profile/billing -H "$H" | grep -q '"profile"' && ok "get billing profile" || fail "get billing profile"

# ── Invoices (user) ───────────────────────────────────────────────────────────
section "INVOICES"
R=$(curl -s -X POST $API/api/invoices/request -H "$H" -H "Content-Type: application/json" \
  -d '{"plan":"start","months":1}')
INV_ID=$(echo $R | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$INV_ID" ] && ok "create invoice" || fail "create invoice: $R"
curl -s $API/api/invoices -H "$H" | grep -q '"invoices"' && ok "list invoices" || fail "list invoices"

# Admin invoices
curl -s "$API/api/admin/invoices?status=pending" -H "$AH" | grep -q '"invoices"' && ok "admin list invoices" || fail "admin list invoices"
[ -n "$INV_ID" ] && {
  curl -s "$API/api/admin/invoices/$INV_ID/html" -H "$AH" | grep -qi "счёт\|invoice\|html" && ok "admin invoice HTML preview" || fail "admin invoice HTML preview"
  curl -s -X POST "$API/api/admin/invoices/$INV_ID/cancel" -H "$AH" | grep -q '"ok":true' && ok "admin cancel invoice" || fail "admin cancel invoice"
}

# ── Acts (admin) ──────────────────────────────────────────────────────────────
section "ACTS"
curl -s $API/api/admin/acts -H "$AH" | grep -q '"acts"' && ok "admin list acts" || fail "admin list acts"
curl -s $API/api/acts -H "$H" | grep -q '"acts"' && ok "user list acts" || fail "user list acts"

# ── Support tickets ───────────────────────────────────────────────────────────
section "SUPPORT"
R=$(curl -s -X POST $API/api/support -H "$H" -H "Content-Type: application/json" \
  -d '{"topic":"tech","subject":"Smoke test ticket","message":"This is a smoke test message for support"}')
TID=$(echo $R | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)
[ -n "$TID" ] && ok "create support ticket" || fail "create support ticket: $R"
curl -s $API/api/support -H "$H" | grep -q '"tickets"' && ok "list tickets" || fail "list tickets"
[ -n "$TID" ] && curl -s "$API/api/support/$TID" -H "$H" | grep -q '"ticket"' && ok "get ticket" || fail "get ticket"
[ -n "$TID" ] && curl -s -X POST "$API/api/support/$TID/reply" -H "$H" -H "Content-Type: application/json" \
  -d '{"message":"User reply"}' | grep -q '"ok":true' && ok "user reply ticket" || fail "user reply ticket"

# Admin support
curl -s $API/api/admin/support -H "$AH" | grep -q '"tickets"' && ok "admin list tickets" || fail "admin list tickets"
[ -n "$TID" ] && {
  curl -s "$API/api/admin/support/$TID" -H "$AH" | grep -q '"ticket"' && ok "admin get ticket" || fail "admin get ticket"
  curl -s -X POST "$API/api/admin/support/$TID/reply" -H "$AH" -H "Content-Type: application/json" \
    -d '{"message":"Admin reply","new_status":"replied"}' | grep -q '"ok":true' && ok "admin reply ticket" || fail "admin reply ticket"
  curl -s -X PATCH "$API/api/admin/support/$TID" -H "$AH" -H "Content-Type: application/json" \
    -d '{"status":"closed"}' | grep -q '"ok":true' && ok "admin close ticket" || fail "admin close ticket"
}

# ── Subscription ──────────────────────────────────────────────────────────────
section "SUBSCRIPTIONS"
curl -s $API/api/subscriptions/me -H "$H" | grep -q '"plan"' && ok "get subscription" || fail "get subscription"

# ── Frontend pages ────────────────────────────────────────────────────────────
section "FRONTEND PAGES"
for path in "/" "/login" "/register" "/oferta" "/privacy" "/terms"; do
  CODE=$(curl -s -o /dev/null -w "%{http_code}" $FRONT$path)
  [ "$CODE" = "200" ] && ok "GET $path → 200" || fail "GET $path → $CODE"
done

# ── Cleanup ───────────────────────────────────────────────────────────────────
section "CLEANUP"
[ -n "$TESTUID" ] && docker exec neurogrid-postgres-1 psql -U neurogrid -d neurogrid -q \
  -c "DELETE FROM transactions WHERE user_id='$TESTUID'; DELETE FROM scenario_runs WHERE user_id='$TESTUID'; DELETE FROM notifications WHERE user_id='$TESTUID'; DELETE FROM topup_requests WHERE user_id='$TESTUID'; DELETE FROM users WHERE id='$TESTUID';" 2>/dev/null && ok "cleanup test user" || fail "cleanup test user"

# ── Summary ───────────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  PASSED: $PASS   FAILED: $FAIL"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
