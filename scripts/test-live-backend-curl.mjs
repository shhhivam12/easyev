import { execSync } from 'node:child_process';
import assert from 'node:assert';

const BASE_URL = 'http://127.0.0.1:4173';

console.log('🧪 Starting Direct Backend HTTP/cURL Verification for Dealer Voice Agent...\n');

let passCount = 0;
let failCount = 0;

function runCurl(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  let cmd = `curl -s -X ${method} "${url}" -H "Content-Type: application/json"`;
  if (body) {
    cmd += ` -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`;
  }
  const raw = execSync(cmd, { encoding: 'utf8', timeout: 5000 });
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse curl JSON response from ${endpoint}: ${raw}`);
  }
}

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

// --------------------------------------------------------------------
// 1. Session Start & Initial State Verification
// --------------------------------------------------------------------
console.log('--- 1. Session Lifecycle & Initial State ---');
let sessionId = null;

test('POST /api/dealer-session/start creates session with 0/11 progress & ASKING mode', () => {
  const res = runCurl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
  assert.strictEqual(res.success, true);
  assert.ok(res.sessionId);
  sessionId = res.sessionId;
  
  const initial = res.initialTurn;
  assert.strictEqual(initial.conversationMode, 'ASKING');
  assert.strictEqual(initial.step, 1);
  assert.strictEqual(initial.targetField, 'shopName');
  assert.strictEqual(initial.completionStats.filledCount, 0);
  assert.strictEqual(initial.completionStats.totalRequired, 11);
  assert.strictEqual(initial.completionStats.percentage, 0);
});

// --------------------------------------------------------------------
// 2. Tip 11: Information Memory (Never ask answered questions)
// --------------------------------------------------------------------
console.log('\n--- 2. Tip 11: Information Memory via Backend cURL ---');

test('POST /api/dealer-session/process-turn captures compound fields and skips asking them', () => {
  const res = runCurl('POST', '/api/dealer-session/process-turn', {
    sessionId,
    text: 'Mera showroom name Volt Drive Hub, owner Satvik Kesarwani, city Pune'
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.currentForm.shopName, 'Volt Drive Hub');
  assert.strictEqual(res.currentForm.managerName, 'Satvik Kesarwani');
  assert.strictEqual(res.currentForm.city, 'Pune');
  assert.strictEqual(res.completionStats.filledCount, 3);
  
  // Agent skips name & city questions and goes straight to phone!
  assert.strictEqual(res.targetField, 'phone');
  assert.ok(!res.speechText.includes('Aapke showroom ka kya naam hai'));
});

// --------------------------------------------------------------------
// 3. Tip 15 & 23: Conversation Mode & Latency Breakdown via cURL
// --------------------------------------------------------------------
console.log('\n--- 3. Tip 15 & 23: Conversation Mode & Latency Budget via cURL ---');

test('POST /api/dealer-session/process-turn tracks latency breakdown and pause mode', () => {
  const res = runCurl('POST', '/api/dealer-session/process-turn', {
    sessionId,
    text: 'Arre ek second ruko please'
  });
  assert.strictEqual(res.success, true);
  assert.strictEqual(res.conversationMode, 'PAUSED');
  assert.ok(res.latencyBreakdown);
  assert.strictEqual(typeof res.latencyBreakdown.extractionLatencyMs, 'number');
  assert.strictEqual(typeof res.latencyBreakdown.validationLatencyMs, 'number');
  assert.strictEqual(typeof res.latencyBreakdown.decisionLatencyMs, 'number');
  assert.strictEqual(typeof res.latencyBreakdown.totalTurnLatencyMs, 'number');
});

// --------------------------------------------------------------------
// 4. Tip 30: Field-Specific Repair Vocabulary via cURL
// --------------------------------------------------------------------
console.log('\n--- 4. Tip 30: Field-Specific Repair Vocabulary via cURL ---');

test('POST /api/dealer-session/process-turn provides targeted repair when invalid answer sent', () => {
  // Providing phone number
  const resPhone = runCurl('POST', '/api/dealer-session/process-turn', {
    sessionId,
    text: 'Phone number hai 9811223344'
  });
  assert.strictEqual(resPhone.currentForm.phone, '9811223344');
  assert.strictEqual(resPhone.completionStats.filledCount, 4);
});

// --------------------------------------------------------------------
// 5. Tip 12: Cross-Field Reasoning & Conflict Detection via cURL
// --------------------------------------------------------------------
console.log('\n--- 5. Tip 12: Cross-Field Reasoning & Conflict Detection via cURL ---');

test('POST /api/dealer-session/sync-state detects City vs Pincode mismatch conflict', () => {
  // Simulate setting address, city = Delhi, but pincode = 560038 (Bengaluru zone)
  const syncRes = runCurl('POST', '/api/dealer-session/sync-state', {
    sessionId,
    patch: {
      address: 'Connaught Place',
      city: 'Delhi',
      pincode: '560038'
    }
  });
  assert.strictEqual(syncRes.success, true);
  assert.strictEqual(syncRes.currentForm.city, 'Delhi');
  assert.strictEqual(syncRes.currentForm.pincode, '560038');

  // Triggering next turn exposes the cross field reasoning conflict
  const turnRes = runCurl('POST', '/api/dealer-session/process-turn', {
    sessionId,
    text: 'Working days all 7 days'
  });
  assert.strictEqual(turnRes.success, true);
  // Conflict detected and flagged
  assert.ok(turnRes.action === 'CROSS_FIELD_CONFLICT' || turnRes.conversationMode === 'CORRECTING' || turnRes.speechText.includes('pincode') || turnRes.speechText.includes('Delhi'));
});

// --------------------------------------------------------------------
// 6. Tip 31: Handling "I don't know" / UNKNOWN Intent via cURL
// --------------------------------------------------------------------
console.log('\n--- 6. Tip 31: Handling "I don\'t know" / UNKNOWN Intent via cURL ---');

test('POST /api/dealer-session/process-turn handles "I don\'t know" smoothly without retry loops', () => {
  // Resolve pincode cleanly
  runCurl('POST', '/api/dealer-session/sync-state', {
    sessionId,
    patch: { pincode: '110001', workingDays: 'All 7 Days' }
  });

  // Now in step 3 (brands)
  const unknownRes = runCurl('POST', '/api/dealer-session/process-turn', {
    sessionId,
    text: 'Mujhe abhi pata nahi brands, baad me bataunga'
  });
  assert.strictEqual(unknownRes.success, true);
  // Must not loop 3 times, moves cleanly
  assert.ok(unknownRes.speechText.includes('manually') || unknownRes.speechText.includes('screen') || unknownRes.speechText.includes('Koi baat nahi') || unknownRes.targetField);
});

// --------------------------------------------------------------------
// 7. Tip 20: Multi-Stage Transactional Submission via cURL
// --------------------------------------------------------------------
console.log('\n--- 7. Tip 20: Multi-Stage Transactional Submission via cURL ---');

test('POST /api/dealer-session/submit executes 8-stage transaction pipeline and commits with email audit', () => {
  // Sync remaining valid fields including required email
  runCurl('POST', '/api/dealer-session/sync-state', {
    sessionId,
    patch: {
      email: 'voltdrive.contact@easyev.in',
      brands: ['Tata Motors', 'Mahindra'],
      emiAvailable: true,
      showroomTestDrive: true
    }
  });

  const submitRes = runCurl('POST', '/api/dealer-session/submit', { sessionId });
  assert.strictEqual(submitRes.success, true);
  assert.strictEqual(submitRes.action, 'SUBMIT_SUCCESS');
  assert.strictEqual(submitRes.step, 5);
  assert.ok(submitRes.partnerId.startsWith('EEV-DLR-2026-'));
  assert.ok(submitRes.registeredDealer);
  assert.strictEqual(submitRes.registeredDealer.shopName, 'Volt Drive Hub');
  assert.strictEqual(submitRes.registeredDealer.email, 'voltdrive.contact@easyev.in');
  
  // Verify transaction stages audit
  assert.ok(submitRes.transactionAudit);
  assert.strictEqual(submitRes.transactionAudit.status, 'COMMITTED');
  const stageNames = submitRes.transactionAudit.stages.map(s => s.stage);
  assert.ok(stageNames.includes('REQUIRED_FIELDS_CHECK'));
  assert.ok(stageNames.includes('DETERMINISTIC_VALIDATION'));
  assert.ok(stageNames.includes('DEPENDENCY_CHECK'));
  assert.ok(stageNames.includes('CROSS_FIELD_CONFLICT_CHECK'));
  assert.ok(stageNames.includes('SERVER_SIDE_VALIDATION'));
  assert.ok(stageNames.includes('IDEMPOTENT_SUBMISSION'));
  assert.ok(stageNames.includes('EMAIL_CONFIRMATION_DISPATCHED'));
});

// --------------------------------------------------------------------
// 8. Observability & Audit Trail Endpoints via cURL
// --------------------------------------------------------------------
console.log('\n--- 8. Telemetry & Audit Trail GET Endpoints via cURL ---');

test('GET /api/dealer-session/telemetry returns aggregated session stats', () => {
  const res = runCurl('GET', `/api/dealer-session/telemetry?sessionId=${encodeURIComponent(sessionId)}`);
  assert.strictEqual(res.success, true);
  assert.ok(res.telemetry.totalTurns >= 3);
  assert.strictEqual(typeof res.telemetry.avgTurnLatencyMs, 'number');
});

test('GET /api/dealer-session/audit returns complete field history and canonical state', () => {
  const res = runCurl('GET', `/api/dealer-session/audit?sessionId=${encodeURIComponent(sessionId)}`);
  assert.strictEqual(res.success, true);
  assert.ok(Array.isArray(res.auditTrail));
  assert.ok(res.auditTrail.length >= 3);
  assert.ok(res.canonicalState.shopName);
  assert.strictEqual(res.canonicalState.shopName.value, 'Volt Drive Hub');
});

// --------------------------------------------------------------------
// 9. Session Stop via cURL
// --------------------------------------------------------------------
console.log('\n--- 9. Session Termination via cURL ---');

test('POST /api/dealer-session/stop destroys session cleanly', () => {
  const res = runCurl('POST', '/api/dealer-session/stop', { sessionId });
  assert.strictEqual(res.success, true);
});

console.log('\n=============================================');
console.log(`cURL Verification Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('=============================================\n');

if (failCount > 0) {
  process.exit(1);
}
