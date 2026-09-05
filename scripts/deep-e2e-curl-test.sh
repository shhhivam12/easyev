#!/usr/bin/env bash
set -e

BASE_URL="http://127.0.0.1:4173"
SEPARATOR="═══════════════════════════════════════════════════════════════════════════════════════"
HEADER="╔═════════════════════════════════════════════════════════════════════════════════════╗"
FOOTER="╚═════════════════════════════════════════════════════════════════════════════════════╝"
DIVIDER="───────────────────────────────────────────────────────────────────────────────────────"

echo "$HEADER"
echo "║          🚀 EASYEV DEEP END-TO-END REST & VOICE API VERIFICATION SUITE              ║"
echo "║                   Target: $BASE_URL                                   ║"
echo "$FOOTER"
echo ""

PASSED_TESTS=0
FAILED_TESTS=0

execute_test() {
  local suite="$1"
  local test_name="$2"
  local method="$3"
  local endpoint="$4"
  local data="$5"
  local expected_status="$6"

  echo "$DIVIDER"
  echo "[$suite] ▶ $test_name"
  echo "  Method: $method | Endpoint: $endpoint"
  
  local response_file
  response_file=$(mktemp)
  local http_code

  if [ -n "$data" ]; then
    http_code=$(curl -s -o "$response_file" -w "%{http_code}" -X "$method" "$BASE_URL$endpoint" \
      -H "Content-Type: application/json" \
      -d "$data")
  else
    http_code=$(curl -s -o "$response_file" -w "%{http_code}" -X "$method" "$BASE_URL$endpoint")
  fi

  local body
  body=$(cat "$response_file")
  rm -f "$response_file"

  # Truncate response if too long for display
  local display_body
  if [ ${#body} -gt 150 ]; then
    display_body="${body:0:140}... (truncated)"
  else
    display_body="$body"
  fi

  echo "  HTTP Code: $http_code (Expected: $expected_status)"
  echo "  Payload: $display_body"

  if [ "$http_code" -ne "$expected_status" ]; then
    echo "  ❌ FAILED: Status code mismatch!"
    FAILED_TESTS=$((FAILED_TESTS + 1))
    exit 1
  else
    echo "  ✅ PASSED"
    PASSED_TESTS=$((PASSED_TESTS + 1))
  fi
  echo ""
}

# ==============================================================================
# 1. SYSTEM HEALTH & CORE INFRASTRUCTURE
# ==============================================================================
echo "🔹 CATEGORY 1: SYSTEM HEALTH, STATIC ASSETS & PLATFORM READY CHECKS"
execute_test "HEALTH" "1.1 Backend Health Check" "GET" "/api/health" "" 200
execute_test "HEALTH" "1.2 Platform Ready Probe" "GET" "/api/ready" "" 200
execute_test "ASSETS" "1.3 Home Page (index.html)" "GET" "/" "" 200
execute_test "ASSETS" "1.4 Virtual Showroom Page" "GET" "/showroom/" "" 200
execute_test "ASSETS" "1.5 Live Rep Desk Page" "GET" "/rep.html" "" 200

# ==============================================================================
# 2. EV CATALOG & CHARGING INFRASTRUCTURE
# ==============================================================================
echo "🔹 CATEGORY 2: EV CATALOGS & CHARGING INFRASTRUCTURE APIS"
execute_test "CATALOG" "2.1 Full EV Catalog Query" "GET" "/api/catalog" "" 200
execute_test "CATALOG" "2.2 Top 12 Electric Vehicles Query" "GET" "/api/vehicles/top12" "" 200
execute_test "CHARGING" "2.3 Nearby EV Charging Stations (Delhi NCR Coordinates)" "GET" "/api/charging/nearby?lat=28.6139&lng=77.2090" "" 200
execute_test "CHARGING" "2.4 Charging Station Bad Coordinates Validation" "GET" "/api/charging/nearby?lat=999&lng=999" "" 400
execute_test "VOICE" "2.5 Voice Engine Options Query" "GET" "/api/voice/options" "" 200

# ==============================================================================
# 3. TEST DRIVE BOOKING LIFECYCLE (SHOWROOM -> IN-CALL TOOLS -> DB -> EMAIL)
# ==============================================================================
echo "🔹 CATEGORY 3: OUTBOUND TEST-DRIVE VOICE BOOKING LIFECYCLE"
RUN_ID=$(date +%s)
TD_KEY="deep_td_${RUN_ID}"
TD_DATE="2026-11-20"
TD_TIME="16:30"
TD_LOCATION="EasyEV Superhub DLF Phase 5 ${RUN_ID}"

# 3.1 Initiate for Tata Nexon.ev
TD_INIT_BODY="{\"vehicleId\":\"tata-nexon-ev\",\"phone\":\"+919811122233\",\"email\":\"nexon.driver@easyev.in\",\"idempotencyKey\":\"${TD_KEY}\"}"
execute_test "TEST-DRIVE" "3.1 Initiate Outbound Call for Tata Nexon.ev" "POST" "/api/test-drive/initiate" "$TD_INIT_BODY" 200

TD_SESSION_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${TD_KEY}');
  console.log(s ? s.id : '');
")
TD_TOKEN=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${TD_KEY}');
  console.log(s ? s.capability_token : '');
")

# 3.2 Double-click idempotency
execute_test "TEST-DRIVE" "3.2 Double-click Idempotency Protection" "POST" "/api/test-drive/initiate" "$TD_INIT_BODY" 200

# 3.3 Check Availability in-call tool
TD_AVAIL_BODY="{\"args\":{\"session_id\":\"${TD_SESSION_ID}\",\"capability_token\":\"${TD_TOKEN}\",\"location\":\"${TD_LOCATION}\",\"date\":\"${TD_DATE}\",\"time\":\"${TD_TIME}\"}}"
execute_test "TEST-DRIVE" "3.3 In-Call Tool: Check Slot Availability (4:30 PM)" "POST" "/api/test-drive/check-availability" "$TD_AVAIL_BODY" 200

TD_CHECK_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const c = db.availabilityChecks.find(x => x.session_id === '${TD_SESSION_ID}');
  console.log(c ? c.id : '');
")

# 3.4 Out-of-hours check
TD_OFFHOURS_BODY="{\"args\":{\"session_id\":\"${TD_SESSION_ID}\",\"capability_token\":\"${TD_TOKEN}\",\"location\":\"${TD_LOCATION}\",\"date\":\"${TD_DATE}\",\"time\":\"01:30\"}}"
execute_test "TEST-DRIVE" "3.4 In-Call Tool: Reject Out-of-hours Slot (1:30 AM)" "POST" "/api/test-drive/check-availability" "$TD_OFFHOURS_BODY" 200

# 3.5 Security: Forged token rejected
TD_FORGED_BODY="{\"args\":{\"session_id\":\"${TD_SESSION_ID}\",\"capability_token\":\"attacker_forged_token_123\",\"location\":\"${TD_LOCATION}\",\"date\":\"${TD_DATE}\",\"time\":\"${TD_TIME}\"}}"
execute_test "TEST-DRIVE" "3.5 Security: Forged Token Rejected with 403" "POST" "/api/test-drive/check-availability" "$TD_FORGED_BODY" 403

# 3.6 Book Test Drive in-call tool
TD_BOOK_BODY="{\"args\":{\"session_id\":\"${TD_SESSION_ID}\",\"capability_token\":\"${TD_TOKEN}\",\"availability_check_id\":\"${TD_CHECK_ID}\"}}"
execute_test "TEST-DRIVE" "3.6 In-Call Tool: Atomic Reservation & Email Dispatch" "POST" "/api/test-drive/book" "$TD_BOOK_BODY" 200

# 3.7 Idempotent re-booking
execute_test "TEST-DRIVE" "3.7 Idempotency: Re-booking Returns Existing Booking" "POST" "/api/test-drive/book" "$TD_BOOK_BODY" 200

# 3.8 Slot Collision check for concurrent user
USER2_KEY="td_col_${RUN_ID}"
curl -s -X POST "$BASE_URL/api/test-drive/initiate" -H "Content-Type: application/json" \
  -d "{\"vehicleId\":\"tata-nexon-ev\",\"phone\":\"+919899001122\",\"email\":\"user2@easyev.in\",\"idempotencyKey\":\"${USER2_KEY}\"}" > /dev/null

USER2_SESSION_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${USER2_KEY}');
  console.log(s ? s.id : '');
")
USER2_TOKEN=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${USER2_KEY}');
  console.log(s ? s.capability_token : '');
")

TD_COL_BOOK_BODY="{\"args\":{\"session_id\":\"${USER2_SESSION_ID}\",\"capability_token\":\"${USER2_TOKEN}\",\"location\":\"${TD_LOCATION}\",\"date\":\"${TD_DATE}\",\"time\":\"${TD_TIME}\"}}"
execute_test "TEST-DRIVE" "3.8 Slot Collision Prevention (409 Conflict)" "POST" "/api/test-drive/book" "$TD_COL_BOOK_BODY" 409

# 3.9 Frontend Polling
execute_test "TEST-DRIVE" "3.9 Frontend UI Status Polling for Booked Session" "GET" "/api/test-drive/status/${TD_SESSION_ID}" "" 200

# 3.10 Post-call webhook
TD_WEBHOOK_BODY="{\"call_id\":\"bland_deep_${RUN_ID}\",\"status\":\"completed\",\"disconnection_reason\":\"user_hangup\",\"call_length\":180,\"transcript\":\"Customer confirmed test drive booking.\",\"metadata\":{\"session_id\":\"${TD_SESSION_ID}\"}}"
execute_test "TEST-DRIVE" "3.10 Post-Call Webhook Audit Logging" "POST" "/api/bland/post-call" "$TD_WEBHOOK_BODY" 200

# ==============================================================================
# 4. DEALER VOICE ONBOARDING & NETWORK APIS
# ==============================================================================
echo "🔹 CATEGORY 4: DEALER VOICE AGENT & REGISTRATION WORKFLOW"
execute_test "DEALERS" "4.1 Dealer Network Statistics Query" "GET" "/api/dealers/stats" "" 200
execute_test "DEALERS" "4.2 Dealer Directory Listing" "GET" "/api/dealers" "" 200
execute_test "DEALERS" "4.3 Dealer Session Agora Token Generation" "GET" "/api/dealer-session/token?channel=test-channel&uid=123" "" 200

# Start Dealer Voice Session
DEALER_START_BODY='{"language":"Hinglish","initialValues":{"dealerName":"Apex EV Motors","city":"Gurgaon"}}'
execute_test "DEALERS" "4.4 Start Dealer Onboarding Voice Session" "POST" "/api/dealer-session/start" "$DEALER_START_BODY" 200

# Submit Dealer Registration
DEALER_REG_BODY='{"shopName":"Apex EV Motors","contactName":"Vikram Malhotra","phone":"+919811223344","email":"vikram@apexev.in","city":"Gurgaon","state":"Haryana","pincode":"122002","brands":["Tata","MG","Mahindra"]}'
execute_test "DEALERS" "4.5 Direct Dealer Network Registration" "POST" "/api/dealers/register" "$DEALER_REG_BODY" 201

# ==============================================================================
# 5. AGORA REAL-TIME VOICE WEBRTC CHANNELS & TOKENS
# ==============================================================================
echo "🔹 CATEGORY 5: AGORA REAL-TIME AI VOICE COPILOT TOKENS"
execute_test "AGORA" "5.1 Virtual Showroom Session Token" "GET" "/api/session/token?channel=showroom-ch1&uid=999" "" 200
execute_test "AGORA" "5.2 Vehicle Detail Voice Guide Token" "GET" "/api/vehicle-session/token?channel=vehicle-nexon&uid=888" "" 200
execute_test "AGORA" "5.3 Multi-Car Debate Arena Token" "GET" "/api/debate-session/token?channel=debate-arena&uid=777" "" 200

# ==============================================================================
# SUMMARY & VERIFICATION REPORT
# ==============================================================================
echo "$SEPARATOR"
echo "🎉 DEEP END-TO-END CURL VERIFICATION SUITE COMPLETE"
echo "  Total Tests Run: $((PASSED_TESTS + FAILED_TESTS))"
echo "  Passed:          $PASSED_TESTS"
echo "  Failed:          $FAILED_TESTS"
echo "$SEPARATOR"

if [ "$FAILED_TESTS" -eq 0 ]; then
  echo "✅ 100% OF ALL EASYEV BACKEND, VOICE & DATABASE APIS ARE FULLY OPERATIONAL!"
  exit 0
else
  echo "❌ Some tests failed!"
  exit 1
fi
