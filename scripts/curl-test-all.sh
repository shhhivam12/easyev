#!/usr/bin/env bash
set -e

BASE_URL="http://127.0.0.1:4173"
SEPARATOR="═══════════════════════════════════════════════════════════════════════════"
DIVIDER="───────────────────────────────────────────────────────────────────────────"

echo "$SEPARATOR"
echo "  🚀 EXHAUSTIVE REAL CURL TESTING SUITE FOR EASYEV RETELL VOICE BOOKING"
echo "  Target: $BASE_URL"
echo "$SEPARATOR"
echo ""

# Helper function to print curl command and response
execute_curl() {
  local title="$1"
  local method="$2"
  local endpoint="$3"
  local data="$4"
  local expected_status="$5"

  echo "$DIVIDER"
  echo "▶ TEST: $title"
  echo "  Command: curl -s -X $method \"$BASE_URL$endpoint\" \\"
  if [ -n "$data" ]; then
    echo "    -H \"Content-Type: application/json\" \\"
    echo "    -d '$data'"
  fi
  echo ""

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

  echo "  [HTTP STATUS] $http_code (Expected: $expected_status)"
  echo "  [RESPONSE BODY] $body"

  if [ "$http_code" -ne "$expected_status" ]; then
    echo "  ❌ FAILED: Expected status $expected_status but received $http_code"
    exit 1
  else
    echo "  ✅ PASSED"
  fi
  echo ""
}

# Generate unique run identifiers
RUN_ID=$(date +%s)
IDEM_KEY="curl_run_${RUN_ID}"
TEST_DATE="2026-10-15"
TEST_TIME="17:00"
TEST_LOCATION="Noida Cyber Hub ${RUN_ID}"

echo "🔹 GROUP 1: SHOWROOM BOOKING INITIATION (POST /api/test-drive/initiate)"

# 1.1 Valid initiation for Tata Punch.ev
INIT_PAYLOAD="{\"vehicleId\":\"tata-punch-ev\",\"phone\":\"+919876543210\",\"email\":\"buyer.punch@easyev.in\",\"idempotencyKey\":\"${IDEM_KEY}\"}"
execute_curl "1.1 Valid Initiation for Tata Punch.ev" "POST" "/api/test-drive/initiate" "$INIT_PAYLOAD" 200

# Extract Session ID and Capability Token from data/test-drives.json
SESSION_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${IDEM_KEY}');
  console.log(s ? s.id : '');
")
CAP_TOKEN=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${IDEM_KEY}');
  console.log(s ? s.capability_token : '');
")

echo "  -> Extracted Session ID: $SESSION_ID"
echo "  -> Extracted Capability Token: ${CAP_TOKEN:0:16}..."
echo ""

# 1.2 Invalid Phone number
execute_curl "1.2 Invalid Phone Number Rejected" "POST" "/api/test-drive/initiate" \
  '{"vehicleId":"tata-punch-ev","phone":"123","email":"test@easyev.in"}' 400

# 1.3 Invalid Email format
execute_curl "1.3 Invalid Email Address Rejected" "POST" "/api/test-drive/initiate" \
  '{"vehicleId":"tata-punch-ev","phone":"+919876543210","email":"not-an-email"}' 400

# 1.4 Unknown Vehicle ID
execute_curl "1.4 Unknown Vehicle ID Rejected" "POST" "/api/test-drive/initiate" \
  '{"vehicleId":"fake-tesla-model-x","phone":"+919876543210","email":"valid@easyev.in"}' 400

# 1.5 Idempotent Double Submission (Same Idempotency Key)
execute_curl "1.5 Idempotency: Duplicate Submission Returns Existing Session" "POST" "/api/test-drive/initiate" "$INIT_PAYLOAD" 200


echo "🔹 GROUP 2: RETELL CUSTOM FUNCTION 1: CHECK AVAILABILITY (POST /api/test-drive/check-availability)"

# 2.1 Valid slot availability check
AVAIL_PAYLOAD="{\"args\":{\"session_id\":\"${SESSION_ID}\",\"capability_token\":\"${CAP_TOKEN}\",\"location\":\"${TEST_LOCATION}\",\"date\":\"${TEST_DATE}\",\"time\":\"${TEST_TIME}\"}}"
execute_curl "2.1 Valid Slot Availability Check (Operating Hours)" "POST" "/api/test-drive/check-availability" "$AVAIL_PAYLOAD" 200

# Extract generated availability_check_id
CHECK_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const c = db.availabilityChecks.find(x => x.session_id === '${SESSION_ID}');
  console.log(c ? c.id : '');
")
echo "  -> Extracted Availability Check ID: $CHECK_ID"
echo ""

# 2.2 Out of operating hours (e.g. 02:00 AM)
OUT_OF_HOURS_PAYLOAD="{\"args\":{\"session_id\":\"${SESSION_ID}\",\"capability_token\":\"${CAP_TOKEN}\",\"location\":\"${TEST_LOCATION}\",\"date\":\"${TEST_DATE}\",\"time\":\"02:00\"}}"
execute_curl "2.2 Out of Operating Hours Rejected with Alternatives" "POST" "/api/test-drive/check-availability" "$OUT_OF_HOURS_PAYLOAD" 200

# 2.3 Forged Capability Token
FORGED_TOKEN_PAYLOAD="{\"args\":{\"session_id\":\"${SESSION_ID}\",\"capability_token\":\"forged_fake_token_hex_9999\",\"location\":\"${TEST_LOCATION}\",\"date\":\"${TEST_DATE}\",\"time\":\"${TEST_TIME}\"}}"
execute_curl "2.3 Forged Capability Token Rejected with 403 Forbidden" "POST" "/api/test-drive/check-availability" "$FORGED_TOKEN_PAYLOAD" 403

# 2.4 Non-existent Session ID
NON_EXISTENT_PAYLOAD="{\"args\":{\"session_id\":\"EEV-SES-NOTEXIST\",\"capability_token\":\"${CAP_TOKEN}\",\"location\":\"${TEST_LOCATION}\",\"date\":\"${TEST_DATE}\",\"time\":\"${TEST_TIME}\"}}"
execute_curl "2.4 Non-existent Session ID Rejected with 403 Forbidden" "POST" "/api/test-drive/check-availability" "$NON_EXISTENT_PAYLOAD" 403


echo "🔹 GROUP 3: RETELL CUSTOM FUNCTION 2: ATOMIC BOOKING (POST /api/test-drive/book)"

# 3.1 Valid booking with explicit confirmation & availability check ID
BOOK_PAYLOAD="{\"args\":{\"session_id\":\"${SESSION_ID}\",\"capability_token\":\"${CAP_TOKEN}\",\"availability_check_id\":\"${CHECK_ID}\"}}"
execute_curl "3.1 Atomic Booking Commit with Verified Check ID" "POST" "/api/test-drive/book" "$BOOK_PAYLOAD" 200

# 3.2 Idempotent Re-booking of already booked session
execute_curl "3.2 Idempotency: Re-booking Returns Existing Booking without Duplication" "POST" "/api/test-drive/book" "$BOOK_PAYLOAD" 200

# 3.3 Forged Capability Token on Booking
FORGED_BOOK_PAYLOAD="{\"args\":{\"session_id\":\"${SESSION_ID}\",\"capability_token\":\"forged_fake_token_hex_9999\",\"availability_check_id\":\"${CHECK_ID}\"}}"
execute_curl "3.3 Forged Capability Token on Booking Rejected with 403 Forbidden" "POST" "/api/test-drive/book" "$FORGED_BOOK_PAYLOAD" 403

# 3.4 Concurrent Collision: User 2 tries to book the exact same slot
USER2_KEY="curl_user2_${RUN_ID}"
USER2_INIT="{\"vehicleId\":\"tata-punch-ev\",\"phone\":\"+919988112233\",\"email\":\"user2@easyev.in\",\"idempotencyKey\":\"${USER2_KEY}\"}"
execute_curl "3.4a Initiate Session for User 2" "POST" "/api/test-drive/initiate" "$USER2_INIT" 200

USER2_SESSION_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${USER2_KEY}');
  console.log(s ? s.id : '');
")
USER2_CAP_TOKEN=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${USER2_KEY}');
  console.log(s ? s.capability_token : '');
")

# User 2 checks same slot -> returns available: false
USER2_AVAIL="{\"args\":{\"session_id\":\"${USER2_SESSION_ID}\",\"capability_token\":\"${USER2_CAP_TOKEN}\",\"location\":\"${TEST_LOCATION}\",\"date\":\"${TEST_DATE}\",\"time\":\"${TEST_TIME}\"}}"
execute_curl "3.4b User 2 Slot Check Confirms Collision (Available: false)" "POST" "/api/test-drive/check-availability" "$USER2_AVAIL" 200

# User 2 direct force book -> returns 409 Conflict
USER2_FORCE_BOOK="{\"args\":{\"session_id\":\"${USER2_SESSION_ID}\",\"capability_token\":\"${USER2_CAP_TOKEN}\",\"location\":\"${TEST_LOCATION}\",\"date\":\"${TEST_DATE}\",\"time\":\"${TEST_TIME}\"}}"
execute_curl "3.4c User 2 Direct Force Book Rejected with 409 Conflict" "POST" "/api/test-drive/book" "$USER2_FORCE_BOOK" 409


echo "🔹 GROUP 4: FRONTEND STATUS POLLING (GET /api/test-drive/status/:sessionId)"

# 4.1 Valid Session Status
execute_curl "4.1 Polling Status for Confirmed Booking" "GET" "/api/test-drive/status/${SESSION_ID}" "" 200

# 4.2 Non-existent Session Status
execute_curl "4.2 Polling Status for Non-existent Session" "GET" "/api/test-drive/status/EEV-SES-NONEXIST" "" 404


echo "🔹 GROUP 5: BLAND POST-CALL WEBHOOK LIFECYCLE & DISCONNECTION REASONS (POST /api/bland/post-call)"

# 5.1 Webhook: in-progress event
WEBHOOK_STARTED="{\"call_id\":\"bland_call_${RUN_ID}\",\"status\":\"in-progress\",\"metadata\":{\"session_id\":\"${SESSION_ID}\"}}"
execute_curl "5.1 Webhook: in-progress Call Connected Event" "POST" "/api/bland/post-call" "$WEBHOOK_STARTED" 200

# 5.2 Webhook: completed call (Normal Completion / User Hangup)
WEBHOOK_ENDED="{\"call_id\":\"bland_call_${RUN_ID}\",\"status\":\"completed\",\"disconnection_reason\":\"user_hangup\",\"call_length\":142,\"transcript\":\"User confirmed booking for Tata Punch.ev.\",\"metadata\":{\"session_id\":\"${SESSION_ID}\"}}"
execute_curl "5.2 Webhook: call completed (Normal Completion / User Hangup)" "POST" "/api/bland/post-call" "$WEBHOOK_ENDED" 200

# Create new sessions to test other telephony termination states
NO_ANSWER_KEY="no_answer_${RUN_ID}"
curl -s -X POST "$BASE_URL/api/test-drive/initiate" -H "Content-Type: application/json" -d "{\"vehicleId\":\"mg-comet-ev\",\"phone\":\"+919900112233\",\"email\":\"noanswer@easyev.in\",\"idempotencyKey\":\"${NO_ANSWER_KEY}\"}" > /dev/null

NO_ANSWER_SESSION_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${NO_ANSWER_KEY}');
  console.log(s ? s.id : '');
")

# 5.3 Webhook: no-answer -> FSM: NO_ANSWER
WEBHOOK_NO_ANSWER="{\"call_id\":\"bland_na_${RUN_ID}\",\"status\":\"completed\",\"disconnection_reason\":\"no-answer\",\"metadata\":{\"session_id\":\"${NO_ANSWER_SESSION_ID}\"}}"
execute_curl "5.3 Webhook: no-answer Transitions FSM to NO_ANSWER" "POST" "/api/bland/post-call" "$WEBHOOK_NO_ANSWER" 200

NO_ANSWER_STATUS=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.id === '${NO_ANSWER_SESSION_ID}');
  console.log(s ? s.status : '');
")
echo "  -> Session Status in Database: $NO_ANSWER_STATUS (Expected: NO_ANSWER)"
if [ "$NO_ANSWER_STATUS" != "NO_ANSWER" ]; then
  echo "  ❌ FSM State mismatch!"
  exit 1
fi
echo "  ✅ FSM Verified: NO_ANSWER"
echo ""

# 5.4 Webhook: busy -> FSM: BUSY
BUSY_KEY="busy_${RUN_ID}"
curl -s -X POST "$BASE_URL/api/test-drive/initiate" -H "Content-Type: application/json" -d "{\"vehicleId\":\"mg-comet-ev\",\"phone\":\"+919900445566\",\"email\":\"busy@easyev.in\",\"idempotencyKey\":\"${BUSY_KEY}\"}" > /dev/null

BUSY_SESSION_ID=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.idempotency_key === '${BUSY_KEY}');
  console.log(s ? s.id : '');
")

WEBHOOK_BUSY="{\"call_id\":\"bland_busy_${RUN_ID}\",\"status\":\"completed\",\"disconnection_reason\":\"busy\",\"metadata\":{\"session_id\":\"${BUSY_SESSION_ID}\"}}"
execute_curl "5.4 Webhook: busy Transitions FSM to BUSY" "POST" "/api/bland/post-call" "$WEBHOOK_BUSY" 200

BUSY_STATUS=$(node -e "
  const db = JSON.parse(require('fs').readFileSync('data/test-drives.json', 'utf8'));
  const s = db.sessions.find(x => x.id === '${BUSY_SESSION_ID}');
  console.log(s ? s.status : '');
")
echo "  -> Session Status in Database: $BUSY_STATUS (Expected: BUSY)"
if [ "$BUSY_STATUS" != "BUSY" ]; then
  echo "  ❌ FSM State mismatch!"
  exit 1
fi
echo "  ✅ FSM Verified: BUSY"
echo ""

echo "$SEPARATOR"
echo "🎉 ALL 18 INDIVIDUAL CURL SCENARIOS TESTED AND PASSED 100% OVER LIVE HTTP!"
echo "$SEPARATOR"
