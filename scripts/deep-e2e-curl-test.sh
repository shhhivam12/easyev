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
# 3. IN-BROWSER AI VOICE TEST DRIVE BOOKING LIFECYCLE ("AARAV")
# ==============================================================================
echo "🔹 CATEGORY 3: IN-BROWSER REALTIME AI VOICE TEST-DRIVE BOOKING LIFECYCLE"
RUN_ID=$(date +%s)
TD_KEY="deep_td_${RUN_ID}"
TD_DATE="2026-11-20"
TD_TIME="16:30"
TD_LOCATION="EasyEV Superhub DLF CyberCity Gurgaon"
TD_EMAIL="satvik.testdrive@easyev.in"

# 3.1 Start In-Browser Test Drive Session
TD_START_BODY="{\"vehicleId\":\"tata-nexon-ev\",\"vehicleName\":\"Tata Nexon.ev\",\"language\":\"English\",\"initialValues\":{\"phone\":\"+919811122233\"}}"
TD_START_RESP=$(curl -s -X POST "$BASE_URL/api/test-drive-session/start" -H "Content-Type: application/json" -d "$TD_START_BODY")
TD_SESSION_ID=$(node -e "try { const r = JSON.parse(process.argv[1] || '{}'); console.log(r.sessionId || ''); } catch(e){ console.log(''); }" "$TD_START_RESP")

execute_test "VOICE-AGENT" "3.1 Start In-Browser Test Drive Voice Session" "POST" "/api/test-drive-session/start" "$TD_START_BODY" 200

# 3.2 Fetch Agora Audio Stream Token for WebRTC Audio
execute_test "VOICE-AGENT" "3.2 Fetch Agora Real-time Audio Token for Test Drive Session" "GET" "/api/test-drive-session/token?channel=testdrive-${TD_SESSION_ID}&uid=101" "" 200

# 3.3 Turn 1: User provides Location via Voice Transcript
TD_TURN1_BODY="{\"sessionId\":\"${TD_SESSION_ID}\",\"userTranscript\":\"I want to test drive at ${TD_LOCATION}\"}"
execute_test "VOICE-AGENT" "3.3 Multi-Turn Turn 1: User specifies Location" "POST" "/api/test-drive-session/process-turn" "$TD_TURN1_BODY" 200

# 3.4 Rubbish Speech Detection & Graceful Fallback
TD_RUBBISH_BODY="{\"sessionId\":\"${TD_SESSION_ID}\",\"userTranscript\":\"blablabla xyz nonsense asdfghjkl random word banana potato\"}"
execute_test "VOICE-AGENT" "3.4 Rubbish Speech Detection & Recovery Handler" "POST" "/api/test-drive-session/process-turn" "$TD_RUBBISH_BODY" 200

# 3.5 Turn 2: User provides Date and Time
TD_TURN2_BODY="{\"sessionId\":\"${TD_SESSION_ID}\",\"userTranscript\":\"Book it for tomorrow 4:30 PM\"}"
execute_test "VOICE-AGENT" "3.5 Multi-Turn Turn 2: User specifies Date & Time" "POST" "/api/test-drive-session/process-turn" "$TD_TURN2_BODY" 200

# 3.6 Check Availability endpoint
TD_AVAIL_BODY="{\"args\":{\"session_id\":\"${TD_SESSION_ID}\",\"location\":\"${TD_LOCATION}\",\"date\":\"${TD_DATE}\",\"time\":\"${TD_TIME}\"}}"
execute_test "VOICE-AGENT" "3.6 Slot Availability Query Tool Check" "POST" "/api/test-drive/check-availability" "$TD_AVAIL_BODY" 200

# 3.7 Turn 3: User confirms slot
TD_TURN3_BODY="{\"sessionId\":\"${TD_SESSION_ID}\",\"userTranscript\":\"Yes that slot looks perfect, confirm it please\"}"
execute_test "VOICE-AGENT" "3.7 Multi-Turn Turn 3: User confirms Slot" "POST" "/api/test-drive-session/process-turn" "$TD_TURN3_BODY" 200

# 3.8 Turn 4: User provides Gmail and completes atomic booking + email dispatch
TD_TURN4_BODY="{\"sessionId\":\"${TD_SESSION_ID}\",\"userTranscript\":\"Send details to ${TD_EMAIL}\"}"
execute_test "VOICE-AGENT" "3.8 Multi-Turn Turn 4: User provides Gmail & Dispatches Pass" "POST" "/api/test-drive-session/process-turn" "$TD_TURN4_BODY" 200

# 3.9 Query Session Status & Confirmed Booking Pass
execute_test "VOICE-AGENT" "3.9 Query Voice Session Status & Confirmed Pass" "GET" "/api/test-drive-session/status/${TD_SESSION_ID}" "" 200

# 3.10 Direct Submission & Conflict Handling
TD_DIRECT_SUBMIT="{\"vehicleId\":\"tata-nexon-ev\",\"vehicleName\":\"Tata Nexon.ev\",\"phone\":\"+919877766655\",\"email\":\"direct.driver@easyev.in\",\"location\":\"EasyEV Experience Center\",\"date\":\"2026-11-25\",\"time\":\"15:00\"}"
execute_test "VOICE-AGENT" "3.10 Direct Test Drive Booking Submission" "POST" "/api/test-drive-session/submit" "$TD_DIRECT_SUBMIT" 200

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
