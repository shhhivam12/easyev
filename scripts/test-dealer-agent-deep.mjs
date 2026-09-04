import assert from 'node:assert';
import {
  DealerFormStateMachine,
  DealerAgentSession,
  dealerVoiceAgentManager,
  classifyIntent,
  normalizeEntities,
  parseSpokenNumberWords,
  normalizeSttTranscript,
  INTENT,
  FIELD_STATE,
  TURN_QUALITY,
  VOICE_INTERVIEW_FIELDS
} from '../dealer-voice-agent.mjs';

console.log('🧪 Starting Enterprise Production Verification Suite for Dealer Voice Agent...\n');

let passCount = 0;
let failCount = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    console.error(err.stack);
    failCount++;
  }
}

async function asyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ PASS: ${name}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ FAIL: ${name}`);
    console.error(`     Error: ${err.message}`);
    console.error(err.stack);
    failCount++;
  }
}

// -------------------------------------------------------------
// SECTION 1: CANONICAL FORM STATE & PROVENANCE TRACKING (P1, P9, P20)
// -------------------------------------------------------------
console.log('--- Section 1: Canonical Form State Machine & Provenance ---');

test('VOICE_INTERVIEW_FIELDS contains exactly 10 questions without categories', () => {
  assert.strictEqual(VOICE_INTERVIEW_FIELDS.length, 10);
  assert.ok(!VOICE_INTERVIEW_FIELDS.includes('categories'), 'categories must not be in voice interview fields');
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('shopName'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('managerName'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('phone'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('city'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('address'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('pincode'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('workingDays'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('brands'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('emiAvailable'));
  assert.ok(VOICE_INTERVIEW_FIELDS.includes('showroomTestDrive'));
});

test('Initial blank form starts with 0 / 10 (0% completion) with strict field metadata', () => {
  const sm = new DealerFormStateMachine({
    categories: ['4W', '2W', '3W', 'commercial'],
    openTime: '09:30 AM',
    closeTime: '08:30 PM',
    emiAvailable: true,
    insuranceAvailable: true
  });
  const stats = sm.getCompletionStats();
  assert.strictEqual(stats.totalRequired, 10);
  assert.strictEqual(stats.filledCount, 0);
  assert.strictEqual(stats.percentage, 0);
  assert.strictEqual(stats.isComplete, false);

  const phoneField = sm.fields.phone;
  assert.strictEqual(phoneField.status, FIELD_STATE.MISSING);
  assert.strictEqual(phoneField.attempts, 0);
  assert.strictEqual(phoneField.confidence, 0.0);
  assert.strictEqual(phoneField.validated, false);
});

test('Controlled updateField records provenance, utterance, confidence, and audit trail', () => {
  const sm = new DealerFormStateMachine();
  sm.updateField('shopName', 'Eco Wheels EV Hub', 'voice', 'Mera showroom name hai Eco Wheels EV Hub', 0.98, 'Voice input');
  
  const f = sm.fields.shopName;
  assert.strictEqual(f.value, 'Eco Wheels EV Hub');
  assert.strictEqual(f.status, FIELD_STATE.FILLED);
  assert.strictEqual(f.source, 'voice');
  assert.strictEqual(f.sourceUtterance, 'Mera showroom name hai Eco Wheels EV Hub');
  assert.strictEqual(f.confidence, 0.98);
  assert.strictEqual(f.validated, true);
  assert.strictEqual(f.history.length, 1);
  assert.strictEqual(f.history[0].value, 'Eco Wheels EV Hub');
  assert.strictEqual(sm.auditTrail.length, 1);
});

// -------------------------------------------------------------
// SECTION 2: SPOKEN NUMBERS & STT ERROR NORMALIZATION (P4, P17)
// -------------------------------------------------------------
console.log('\n--- Section 2: Spoken Numbers & STT Normalization ---');

test('Spoken Hindi/English number conversion', () => {
  const parsed1 = parseSpokenNumberWords('nau aath saat chhe paanch chaar teen do ek shunya');
  assert.strictEqual(parsed1.join(''), '9876543210');

  const parsed2 = parseSpokenNumberWords('double nine double eight double seven double six double five');
  assert.strictEqual(parsed2.join(''), '9988776655');
});

test('STT email & transcript normalization', () => {
  const cleaned = normalizeSttTranscript('satvik at the rate easyev dot com');
  assert.strictEqual(cleaned, 'satvik@easyev.com');

  const cleaned2 = normalizeSttTranscript('support at rate tataev dot in');
  assert.strictEqual(cleaned2, 'support@tataev.in');
});

test('Phone extraction with clean 10-digit extraction', () => {
  const res1 = normalizeEntities('Mera phone number hai 9811234567', {}, 'phone', 1);
  assert.strictEqual(res1.phone, '9811234567');

  const res2 = normalizeEntities('WhatsApp number 91 98765 43210', {}, 'phone', 1);
  assert.strictEqual(res2.phone, '9876543210');
});

test('Pincode extraction', () => {
  const res1 = normalizeEntities('Humara showroom 110049 me hai', {}, 'pincode', 2);
  assert.strictEqual(res1.pincode, '110049');

  const res2 = normalizeEntities('Pincode hai 560038', {}, 'pincode', 2);
  assert.strictEqual(res2.pincode, '560038');
});

test('Multi-brand extraction', () => {
  const res = normalizeEntities('Hum Tata Motors aur Mahindra aur Ather deal karte hain', {}, 'brands', 3);
  assert.ok(Array.isArray(res.brands));
  assert.ok(res.brands.includes('Tata Motors'));
  assert.ok(res.brands.includes('Mahindra'));
  assert.ok(res.brands.includes('Ather Energy'));
});

// -------------------------------------------------------------
// SECTION 3: INTENT CLASSIFICATION & QUALITY CONTROL (P3, P10)
// -------------------------------------------------------------
console.log('\n--- Section 3: Intent Classification & Quality Control ---');

test('Submit intent classification with negative lookahead for fees/help', () => {
  assert.strictEqual(classifyIntent('Submit my verified registration'), INTENT.SUBMIT);
  assert.strictEqual(classifyIntent('Please submit form'), INTENT.SUBMIT);
  assert.strictEqual(classifyIntent('Kar do register'), INTENT.SUBMIT);
  assert.strictEqual(classifyIntent('Verified registration submit kar do'), INTENT.SUBMIT);
});

test('Navigation & Correction intents', () => {
  assert.strictEqual(classifyIntent('Step 2 kholo'), INTENT.NAVIGATE_STEP);
  assert.strictEqual(classifyIntent('Pehle step par jao'), INTENT.NAVIGATE_STEP);
  assert.strictEqual(classifyIntent('Go back'), INTENT.GO_BACK);
  assert.strictEqual(classifyIntent('Name badlo'), INTENT.CORRECT_FIELD);
  assert.strictEqual(classifyIntent('Nahi mera phone actually alag hai'), INTENT.CORRECT_FIELD);
});

// -------------------------------------------------------------
// SECTION 4: 3-ATTEMPT PROGRESSIVE FALLBACK (P2)
// -------------------------------------------------------------
console.log('\n--- Section 4: 3-Attempt Progressive Fallback ---');

await asyncTest('3-Attempt progressive fallback escalation to MANUAL_FALLBACK', async () => {
  const session = dealerVoiceAgentManager.createSession({ language: 'Hinglish' });

  // Attempt 0: First time asking for shopName
  const t0 = session.getInitialGreeting();
  assert.strictEqual(t0.targetField, 'shopName');
  assert.strictEqual(session.stateMachine.fields.shopName.attempts, 0);

  // Attempt 1: User gives unintelligible response
  const t1 = await session.processTurn({ text: 'blah blah gibberish ???' });
  assert.strictEqual(session.stateMachine.fields.shopName.attempts, 1);
  assert.strictEqual(session.stateMachine.fields.shopName.status, FIELD_STATE.UNCLEAR);
  assert.ok(t1.speechText.includes('samajh nahi aaya') || t1.speechText.includes('kya naam hai'));

  // Attempt 2: User gives second unclear response -> Rephrase with explicit hint
  const t2 = await session.processTurn({ text: 'uhmmm hmm' });
  assert.strictEqual(session.stateMachine.fields.shopName.attempts, 2);
  assert.ok(t2.speechText.includes('for example') || t2.speechText.includes('Shakti Motors'));

  // Attempt 3: Third failed attempt -> Smooth transition to Manual Fallback
  const t3 = await session.processTurn({ text: 'kuch bhi nahi' });
  assert.strictEqual(session.stateMachine.fields.shopName.attempts, 3);
  assert.strictEqual(session.stateMachine.fields.shopName.status, FIELD_STATE.MANUAL_FALLBACK);
  // Transitions to the next question (managerName)
  assert.strictEqual(t3.targetField, 'managerName');
});

// -------------------------------------------------------------
// SECTION 5: MULTI-FIELD COMPOUND EXTRACTION & OUT-OF-ORDER (P5, P6)
// -------------------------------------------------------------
console.log('\n--- Section 5: Compound Extraction & Out-of-Order Answers ---');

await asyncTest('Compound single sentence extracts shopName, managerName, phone, and city in one turn', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  const utterance = 'Mera showroom name Shakti Motors EV, manager Rajesh Sharma, phone 9811223344, located in New Delhi';
  
  const turnRes = await session.processTurn({ text: utterance });
  assert.strictEqual(session.stateMachine.fields.shopName.value, 'Shakti Motors EV');
  assert.strictEqual(session.stateMachine.fields.managerName.value, 'Rajesh Sharma');
  assert.strictEqual(session.stateMachine.fields.phone.value, '9811223344');
  assert.strictEqual(session.stateMachine.fields.city.value, 'New Delhi');
  assert.strictEqual(turnRes.completionStats.filledCount, 4);
  assert.strictEqual(turnRes.completionStats.percentage, 40);
  // Automatically advances past completed step 1 fields to step 2
  assert.strictEqual(turnRes.step, 2);
});

await asyncTest('Out-of-order field answer (Email provided while Phone asked) is preserved', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  session.stateMachine.currentTargetField = 'phone';
  
  const turnRes = await session.processTurn({ text: 'By the way, my email is dealer@shaktiev.com' });
  assert.strictEqual(session.stateMachine.fields.email.value, 'dealer@shaktiev.com');
  assert.strictEqual(session.stateMachine.fields.email.status, FIELD_STATE.FILLED);
});

// -------------------------------------------------------------
// SECTION 6: CORRECTIONS WITH AUDIT TRAIL (P7, P20)
// -------------------------------------------------------------
console.log('\n--- Section 6: Non-Destructive Corrections & Audit Trail ---');

await asyncTest('Field correction maintains history and audit trail without data loss', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  await session.processTurn({ text: 'Mera phone number 9811223344 hai' });
  assert.strictEqual(session.stateMachine.fields.phone.value, '9811223344');

  // Correction turn
  await session.processTurn({ text: 'Sorry galat ho gaya, phone number change karke 9876543210 kardo' });
  assert.strictEqual(session.stateMachine.fields.phone.value, '9876543210');
  
  const phoneHistory = session.stateMachine.fields.phone.history;
  assert.ok(phoneHistory.length >= 2);
  assert.strictEqual(phoneHistory[0].value, '9811223344');
  assert.strictEqual(phoneHistory[phoneHistory.length - 1].value, '9876543210');
  assert.ok(session.stateMachine.auditTrail.length >= 2);
});

// -------------------------------------------------------------
// SECTION 7: IRRELEVANT ANSWER REJECTION (P3, P4)
// -------------------------------------------------------------
console.log('\n--- Section 7: Irrelevant Answer Guard ---');

await asyncTest('Irrelevant answer (e.g. Pune) when phone is expected does not pollute phone field', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  session.stateMachine.currentTargetField = 'phone';

  const turnRes = await session.processTurn({ text: 'Main Pune me rehta hoon' });
  assert.strictEqual(session.stateMachine.fields.phone.value, '');
  assert.ok(session.stateMachine.fields.phone.status === FIELD_STATE.MISSING || session.stateMachine.fields.phone.status === FIELD_STATE.UNCLEAR);
  // City entity can be captured out-of-order, but phone remains protected
  assert.strictEqual(session.stateMachine.fields.city.value, 'Pune');
});

// -------------------------------------------------------------
// SECTION 8: FULL END-TO-END ONBOARDING JOURNEY (P18)
// -------------------------------------------------------------
console.log('\n--- Section 8: End-to-End Onboarding Journey Simulation ---');

await asyncTest('Simulate full 10-turn voice onboarding interview from 0/10 to 10/10 and Submit', async () => {
  const session = dealerVoiceAgentManager.createSession({ language: 'Hinglish' });

  // Initial check
  const greeting = session.getInitialGreeting();
  assert.strictEqual(greeting.step, 1);
  assert.strictEqual(greeting.targetField, 'shopName');
  assert.strictEqual(session.stateMachine.getCompletionStats().filledCount, 0);

  // Turn 1: Shop Name
  const t1 = await session.processTurn({ text: 'Mera showroom name hai Shakti Motors EV Hub' });
  assert.strictEqual(session.stateMachine.fields.shopName.value, 'Shakti Motors EV Hub');
  assert.strictEqual(t1.completionStats.filledCount, 1);

  // Turn 2: Manager Name
  const t2 = await session.processTurn({ text: 'Owner name is Rajesh Sharma' });
  assert.strictEqual(session.stateMachine.fields.managerName.value, 'Rajesh Sharma');
  assert.strictEqual(t2.completionStats.filledCount, 2);

  // Turn 3: Phone
  const t3 = await session.processTurn({ text: 'Mobile number 9811223344' });
  assert.strictEqual(session.stateMachine.fields.phone.value, '9811223344');
  assert.strictEqual(t3.completionStats.filledCount, 3);

  // Turn 4: City
  const t4 = await session.processTurn({ text: 'New Delhi' });
  assert.strictEqual(session.stateMachine.fields.city.value, 'New Delhi');
  assert.strictEqual(t4.completionStats.filledCount, 4);

  // Step 1 Confirmation -> Move to Step 2
  await session.processTurn({ text: 'Haan agle step par chalo' });
  assert.strictEqual(session.stateMachine.currentStep, 2);

  // Turn 5: Address
  const t5 = await session.processTurn({ text: 'Plot 42, Okhla Phase 3 Industrial Area' });
  assert.strictEqual(t5.completionStats.filledCount, 5);

  // Turn 6: Pincode
  const t6 = await session.processTurn({ text: 'Pincode 110020' });
  assert.strictEqual(session.stateMachine.fields.pincode.value, '110020');
  assert.strictEqual(t6.completionStats.filledCount, 6);

  // Turn 7: Working Days
  const t7 = await session.processTurn({ text: 'All 7 Days open rehta hai' });
  assert.strictEqual(session.stateMachine.fields.workingDays.value, 'All 7 Days');
  assert.strictEqual(t7.completionStats.filledCount, 7);

  // Step 2 Confirmation -> Move to Step 3
  await session.processTurn({ text: 'Ji haan aage badhein' });
  assert.strictEqual(session.stateMachine.currentStep, 3);

  // Turn 8: Brands
  const t8 = await session.processTurn({ text: 'Hum Tata Motors aur Mahindra deal karte hain' });
  assert.ok(session.stateMachine.fields.brands.value.includes('Tata Motors'));
  assert.strictEqual(t8.completionStats.filledCount, 8);

  // Step 3 Confirmation -> Move to Step 4
  await session.processTurn({ text: 'Haan Step 4 par chalo' });
  assert.strictEqual(session.stateMachine.currentStep, 4);

  // Turn 9: EMI Loan
  const t9 = await session.processTurn({ text: 'Haan hum loan aur EMI provide karte hain' });
  assert.strictEqual(session.stateMachine.fields.emiAvailable.value, true);
  assert.strictEqual(t9.completionStats.filledCount, 9);

  // Turn 10: Test Drive
  const t10 = await session.processTurn({ text: 'Haan showroom test drive facility hai' });
  assert.strictEqual(session.stateMachine.fields.showroomTestDrive.value, true);
  assert.strictEqual(t10.completionStats.filledCount, 10);
  assert.strictEqual(t10.completionStats.percentage, 100);

  // Turn 11: Final Voice Submission
  const tSubmit = await session.processTurn({ text: 'Submit my verified registration' });
  assert.strictEqual(tSubmit.action, 'SUBMIT_SUCCESS');
  assert.strictEqual(tSubmit.step, 5);
  assert.strictEqual(tSubmit.isSubmitted, true);
  assert.ok(tSubmit.partnerId.startsWith('EEV-DLR-2026-'));
  assert.strictEqual(tSubmit.registeredDealer.shopName, 'Shakti Motors EV Hub');
});

// -------------------------------------------------------------
// SECTION 9: OBSERVABILITY & TELEMETRY REPORT (P21)
// -------------------------------------------------------------
console.log('\n--- Section 9: Observability & Telemetry Metrics ---');

await asyncTest('Observability report accurately aggregates latency and turn metrics', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  await session.processTurn({ text: 'Showroom ABC Motors' });
  await session.processTurn({ text: 'uhhh' });
  await session.processTurn({ text: 'Manager Rohit' });

  const report = session.getObservabilityReport();
  assert.strictEqual(report.totalTurns, 3);
  assert.ok(report.successfulExtractions >= 2);
  assert.ok(report.retriedTurns >= 1);
  assert.ok(typeof report.avgTurnLatencyMs === 'number');
  assert.ok(report.auditTrailLength >= 2);
});

// -------------------------------------------------------------
// SECTION 10: LIVE SERVER HTTP API ENDPOINTS
// -------------------------------------------------------------
console.log('\n--- Section 10: Live Server HTTP API Endpoints ---');

const BASE_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:4173';

await asyncTest('GET /api/dealers/stats returns active dealer network statistics', async () => {
  const res = await fetch(`${BASE_URL}/api/dealers/stats`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(typeof data.stats.totalDealers === 'number');
  assert.ok(typeof data.stats.verifiedDealers === 'number');
});

await asyncTest('GET /api/dealers returns list of dealerships with count', async () => {
  const res = await fetch(`${BASE_URL}/api/dealers`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(Array.isArray(data.dealers));
  assert.ok(data.count >= 0);
});

await asyncTest('POST /api/dealers/register creates new dealer and validates schema', async () => {
  const sampleDealer = {
    name: 'Integration Test EV Showroom',
    dealerType: 'Authorized OEM Dealership',
    managerName: 'Vikram Singh',
    phone: '9876500001',
    email: 'vikram.test@easyev.in',
    address: 'Sector 62, Electronic City',
    city: 'Noida',
    state: 'Uttar Pradesh',
    pincode: '201301',
    categories: ['4W', '2W'],
    brands: ['Tata Motors', 'Mahindra']
  };

  const res = await fetch(`${BASE_URL}/api/dealers/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(sampleDealer)
  });
  assert.strictEqual(res.status, 201);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(data.dealer.id);
  assert.strictEqual(data.dealer.shopName, 'Integration Test EV Showroom');

  // Verify fetch by ID
  const getByIdRes = await fetch(`${BASE_URL}/api/dealers/${data.dealer.id}`);
  assert.strictEqual(getByIdRes.status, 200);
  const getByIdData = await getByIdRes.json();
  assert.strictEqual(getByIdData.dealer.id, data.dealer.id);
});

await asyncTest('POST /api/dealer-session/start, process-turn, sync-state, telemetry, audit and submit pipeline', async () => {
  // 1. Start Session
  const startRes = await fetch(`${BASE_URL}/api/dealer-session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ language: 'Hinglish', currentStep: 1 })
  });
  assert.strictEqual(startRes.status, 200);
  const startData = await startRes.json();
  assert.strictEqual(startData.success, true);
  const sessionId = startData.sessionId;
  assert.ok(sessionId);

  // 2. Process Turn via HTTP
  const turnRes = await fetch(`${BASE_URL}/api/dealer-session/process-turn`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      text: 'Showroom name Royal Motors EV Hub, manager Rohit Verma, phone 9811223399'
    })
  });
  assert.strictEqual(turnRes.status, 200);
  const turnData = await turnRes.json();
  assert.strictEqual(turnData.success, true);
  assert.strictEqual(turnData.currentForm.shopName, 'Royal Motors EV Hub');
  assert.strictEqual(turnData.currentForm.managerName, 'Rohit Verma');
  assert.strictEqual(turnData.currentForm.phone, '9811223399');

  // 3. Sync State via HTTP
  const syncRes = await fetch(`${BASE_URL}/api/dealer-session/sync-state`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      patch: { city: 'Bengaluru', pincode: '560001' }
    })
  });
  assert.strictEqual(syncRes.status, 200);
  const syncData = await syncRes.json();
  assert.strictEqual(syncData.success, true);
  assert.strictEqual(syncData.currentForm.city, 'Bengaluru');

  // 4. Inspect Telemetry via HTTP
  const telRes = await fetch(`${BASE_URL}/api/dealer-session/telemetry?sessionId=${encodeURIComponent(sessionId)}`);
  assert.strictEqual(telRes.status, 200);
  const telData = await telRes.json();
  assert.strictEqual(telData.success, true);
  assert.strictEqual(telData.telemetry.totalTurns, 1);

  // 5. Inspect Audit Trail via HTTP
  const auditRes = await fetch(`${BASE_URL}/api/dealer-session/audit?sessionId=${encodeURIComponent(sessionId)}`);
  assert.strictEqual(auditRes.status, 200);
  const auditData = await auditRes.json();
  assert.strictEqual(auditData.success, true);
  assert.ok(Array.isArray(auditData.auditTrail));

  // 6. Submit Registration via HTTP
  const submitRes = await fetch(`${BASE_URL}/api/dealer-session/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  assert.strictEqual(submitRes.status, 200);
  const submitData = await submitRes.json();
  assert.strictEqual(submitData.success, true);
  assert.strictEqual(submitData.action, 'SUBMIT_SUCCESS');
  assert.strictEqual(submitData.step, 5);
  assert.ok(submitData.partnerId);

  // 7. Clean Stop
  const stopRes = await fetch(`${BASE_URL}/api/dealer-session/stop`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId })
  });
  assert.strictEqual(stopRes.status, 200);
});

console.log('\n=============================================');
console.log(`Summary: ${passCount} Passed, ${failCount} Failed`);
console.log('=============================================\n');

if (failCount > 0) {
  process.exit(1);
}
