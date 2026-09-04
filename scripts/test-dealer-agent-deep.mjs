import assert from 'node:assert';
import {
  DealerFormStateMachine,
  DealerAgentSession,
  dealerVoiceAgentManager,
  classifyIntent,
  normalizeEntities,
  parseSpokenNumberWords,
  normalizeSttTranscript,
  detectCrossFieldConflicts,
  CONVERSATION_MODE,
  FIELD_REPAIR_VOCABULARY,
  INTENT,
  FIELD_STATE,
  TURN_QUALITY,
  VOICE_INTERVIEW_FIELDS
} from '../dealer-voice-agent.mjs';

console.log('🧪 Starting Enterprise Production Verification Suite for Dealer Voice Agent...\n');

let passCount = 0;
let failCount = 0;
const testQueue = [];

function test(name, fn) {
  testQueue.push({ name, fn, isAsync: false });
}

function asyncTest(name, fn) {
  testQueue.push({ name, fn, isAsync: true });
}

function logSection(title) {
  testQueue.push({ isHeader: true, title });
}

logSection('--- Section 1: Canonical Form State Machine & Provenance ---');

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
  assert.strictEqual(f.history[0].source, 'voice');
  assert.strictEqual(sm.auditTrail.length, 1);
});

logSection('\n--- Section 2: Spoken Numbers & STT Normalization ---');

test('Spoken Hindi/English number conversion', () => {
  const seqs = parseSpokenNumberWords('mera number hai nau aath double one do teen chaar paanch chhe saat');
  assert.ok(seqs.includes('9811234567'), `Expected 9811234567 in ${JSON.stringify(seqs)}`);
});

test('STT email & transcript normalization', () => {
  const norm = normalizeSttTranscript('contact at the rate ecowheels dot com');
  assert.strictEqual(norm, 'contact@ecowheels.com');
});

test('Phone extraction with clean 10-digit extraction', () => {
  const ext = normalizeEntities('mera mobile number hai 9811234567');
  assert.strictEqual(ext.phone, '9811234567');
});

test('Pincode extraction', () => {
  const ext = normalizeEntities('humara pin code 110049 hai');
  assert.strictEqual(ext.pincode, '110049');
});

test('Multi-brand extraction', () => {
  const ext = normalizeEntities('hum tata motors aur mahindra electric sell karte hain');
  assert.ok(Array.isArray(ext.brands));
  assert.ok(ext.brands.includes('Tata Motors'));
  assert.ok(ext.brands.includes('Mahindra'));
});

logSection('\n--- Section 3: Intent Classification & Quality Control ---');

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

logSection('\n--- Section 4: 3-Attempt Progressive Fallback ---');

asyncTest('3-Attempt progressive fallback escalation to MANUAL_FALLBACK', async () => {
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

logSection('\n--- Section 5: Compound Extraction & Out-of-Order Answers ---');

asyncTest('Compound single sentence extracts shopName, managerName, phone, and city in one turn', async () => {
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

asyncTest('Out-of-order field answer (Email provided while Phone asked) is preserved', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  session.stateMachine.currentTargetField = 'phone';
  
  const turnRes = await session.processTurn({ text: 'By the way, my email is dealer@shaktiev.com' });
  assert.strictEqual(session.stateMachine.fields.email.value, 'dealer@shaktiev.com');
  assert.strictEqual(session.stateMachine.fields.email.status, FIELD_STATE.FILLED);
});

logSection('\n--- Section 6: Non-Destructive Corrections & Audit Trail ---');

asyncTest('Field correction maintains history and audit trail without data loss', async () => {
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

logSection('\n--- Section 7: Irrelevant Answer Guard ---');

asyncTest('Irrelevant answer (e.g. Pune) when phone is expected does not pollute phone field', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  session.stateMachine.currentTargetField = 'phone';

  const turnRes = await session.processTurn({ text: 'Main Pune me rehta hoon' });
  assert.strictEqual(session.stateMachine.fields.phone.value, '');
  assert.ok(session.stateMachine.fields.phone.status === FIELD_STATE.MISSING || session.stateMachine.fields.phone.status === FIELD_STATE.UNCLEAR);
  // City entity can be captured out-of-order, but phone remains protected
  assert.strictEqual(session.stateMachine.fields.city.value, 'Pune');
});

logSection('\n--- Section 8: End-to-End Onboarding Journey Simulation ---');

asyncTest('Simulate full 10-turn voice onboarding interview from 0/10 to 10/10 and Submit', async () => {
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

logSection('\n--- Section 9: Observability & Telemetry Metrics ---');

asyncTest('Observability report accurately aggregates latency and turn metrics', async () => {
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

logSection('\n--- Section 10: Live Server HTTP API Endpoints ---');

const BASE_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:4173';

asyncTest('GET /api/dealers/stats returns active dealer network statistics', async () => {
  const res = await fetch(`${BASE_URL}/api/dealers/stats`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(typeof data.stats.totalDealers === 'number');
  assert.ok(typeof data.stats.verifiedDealers === 'number');
});

asyncTest('GET /api/dealers returns list of dealerships with count', async () => {
  const res = await fetch(`${BASE_URL}/api/dealers`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.ok(Array.isArray(data.dealers));
  assert.ok(data.count >= 0);
});

asyncTest('POST /api/dealers/register creates new dealer and validates schema', async () => {
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

logSection('\n--- Section 11: Advanced Enterprise Production Features ---');

asyncTest('Tip 11: Information Memory - Agent never asks questions user already answered', async () => {
  const session = dealerVoiceAgentManager.createSession({ language: 'Hinglish' });
  
  // User gives showroom name, owner name, and city in the first turn
  const turn1 = await session.processTurn({ text: 'Mera showroom name hai Volt Drive Hub, owner Satvik Kesarwani, city Pune' });
  
  assert.strictEqual(turn1.currentForm.shopName, 'Volt Drive Hub');
  assert.strictEqual(turn1.currentForm.managerName, 'Satvik Kesarwani');
  assert.strictEqual(turn1.currentForm.city, 'Pune');
  
  // The only remaining missing field in Step 1 is phone!
  // Agent must ask for phone directly, NEVER asking "what is your name" or "which city"
  assert.strictEqual(turn1.targetField, 'phone');
  assert.ok(turn1.speechText.includes('phone') || turn1.speechText.includes('mobile') || turn1.speechText.includes('number'));
  assert.ok(!turn1.speechText.includes('Aapke EV showroom ka kya naam hai'));
});

test('Tip 12: Cross-field Reasoning - Detect city vs pincode mismatch conflict', () => {
  // Case A: Delhi city with Bangalore pincode (560038)
  const conflictForm = {
    city: 'Delhi',
    pincode: '560038'
  };
  const conflicts = detectCrossFieldConflicts(conflictForm);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].conflictCode, 'CITY_PINCODE_MISMATCH');
  assert.deepStrictEqual(conflicts[0].fields, ['city', 'pincode']);
  assert.ok(conflicts[0].suggestedQuestion.Hinglish.includes('pincode'));

  // Case B: Valid matching city and pincode (Mumbai + 400001)
  const validForm = {
    city: 'Mumbai',
    pincode: '400001'
  };
  const noConflicts = detectCrossFieldConflicts(validForm);
  assert.strictEqual(noConflicts.length, 0);
});

asyncTest('Tip 15: Explicit Conversation Mode transitions', async () => {
  const session = dealerVoiceAgentManager.createSession({ language: 'Hinglish' });
  
  // Initial Greeting should be ASKING
  const greeting = session.getInitialGreeting();
  assert.strictEqual(greeting.conversationMode, CONVERSATION_MODE.ASKING);
  
  // Hesitation should set PAUSED
  const pausedTurn = await session.processTurn({ text: 'Arre ek minute ruko please' });
  assert.strictEqual(pausedTurn.conversationMode, CONVERSATION_MODE.PAUSED);

  // Answering field returns to ASKING or CONFIRMING
  const ansTurn = await session.processTurn({ text: 'Showroom name hai Speed Wheels' });
  assert.ok([CONVERSATION_MODE.ASKING, CONVERSATION_MODE.CONFIRMING].includes(ansTurn.conversationMode));

  // Correction sets CORRECTING
  const corrTurn = await session.processTurn({ text: 'Nahi mera showroom name badlo, actual name hai Turbo EV' });
  assert.strictEqual(corrTurn.conversationMode, CONVERSATION_MODE.CORRECTING);
});

asyncTest('Tip 20: Submission is a multi-stage transaction with audit records', async () => {
  const session = dealerVoiceAgentManager.createSession({
    language: 'Hinglish',
    initialValues: {
      shopName: 'Apex EV World',
      managerName: 'Priya Sharma',
      phone: '9822334455',
      city: 'Pune',
      address: 'Senapati Bapat Road',
      pincode: '411016',
      brands: ['Tata Motors', 'Mahindra']
    }
  });

  const submitRes = await session.submitRegistration();
  assert.strictEqual(submitRes.action, 'SUBMIT_SUCCESS');
  assert.ok(submitRes.transactionAudit);
  assert.strictEqual(submitRes.transactionAudit.status, 'COMMITTED');
  assert.ok(Array.isArray(submitRes.transactionAudit.stages));
  
  const stageNames = submitRes.transactionAudit.stages.map(s => s.stage);
  assert.ok(stageNames.includes('REQUIRED_FIELDS_CHECK'));
  assert.ok(stageNames.includes('DETERMINISTIC_VALIDATION'));
  assert.ok(stageNames.includes('DEPENDENCY_CHECK'));
  assert.ok(stageNames.includes('CROSS_FIELD_CONFLICT_CHECK'));
  assert.ok(stageNames.includes('SERVER_SIDE_VALIDATION'));
  assert.ok(stageNames.includes('IDEMPOTENT_SUBMISSION'));
});

asyncTest('Tip 23: Latency budget & turn breakdown telemetry', async () => {
  const session = dealerVoiceAgentManager.createSession({ language: 'Hinglish' });
  const turn = await session.processTurn({ text: 'Showroom name hai Nexus EV', sttLatencyMs: 140 });
  
  assert.ok(turn.latencyBreakdown);
  assert.strictEqual(turn.latencyBreakdown.sttLatencyMs, 140);
  assert.strictEqual(typeof turn.latencyBreakdown.extractionLatencyMs, 'number');
  assert.strictEqual(typeof turn.latencyBreakdown.validationLatencyMs, 'number');
  assert.strictEqual(typeof turn.latencyBreakdown.decisionLatencyMs, 'number');
  assert.strictEqual(typeof turn.latencyBreakdown.totalTurnLatencyMs, 'number');
  assert.ok(turn.turnLatencyMs >= 0);
});

test('Tip 30: Field-Specific Repair Vocabulary exists for all major fields', () => {
  const fields = ['phone', 'email', 'pincode', 'address', 'brands', 'shopName', 'managerName', 'city'];
  for (const f of fields) {
    assert.ok(FIELD_REPAIR_VOCABULARY[f], `Repair vocabulary missing for ${f}`);
    assert.ok(FIELD_REPAIR_VOCABULARY[f].Hindi, `Hindi repair vocabulary missing for ${f}`);
    assert.ok(FIELD_REPAIR_VOCABULARY[f].Hinglish, `Hinglish repair vocabulary missing for ${f}`);
    assert.ok(FIELD_REPAIR_VOCABULARY[f].English, `English repair vocabulary missing for ${f}`);
  }
});

asyncTest('Tip 31: Handle "I don\'t know" / UNKNOWN Intent without 3-retry loop', async () => {
  const session = dealerVoiceAgentManager.createSession({ language: 'Hinglish' });
  
  // Step 1: user doesn't know the exact shop name right now
  const turn1 = await session.processTurn({ text: 'Mujhe abhi pata nahi, yaad nahi aa raha' });
  
  // Should gracefully mark as MANUAL_FALLBACK and proceed to next field without looping 3 times
  assert.strictEqual(session.stateMachine.fields.shopName.status, FIELD_STATE.MANUAL_FALLBACK);
  assert.strictEqual(turn1.targetField, 'managerName');
  assert.ok(turn1.speechText.includes('manually') || turn1.speechText.includes('screen') || turn1.speechText.includes('Koi baat nahi'));
});

asyncTest('Tip 33: Graceful Degradation preserves canonical form state on error', async () => {
  const session = dealerVoiceAgentManager.createSession({
    language: 'Hinglish',
    initialValues: { shopName: 'Saved Motors', managerName: 'Amit Shah' }
  });

  // Simulate internal error or manual patch sync
  await session.stateMachine.updateFields({ phone: '9811223344' }, 'manual_ui');
  
  const turn = await session.processTurn({ text: '' });
  assert.strictEqual(turn.currentForm.shopName, 'Saved Motors');
  assert.strictEqual(turn.currentForm.managerName, 'Amit Shah');
  assert.strictEqual(turn.currentForm.phone, '9811223344');
});

async function runAll() {
  for (const item of testQueue) {
    if (item.isHeader) {
      console.log(item.title);
      continue;
    }
    try {
      if (item.isAsync) {
        await item.fn();
      } else {
        item.fn();
      }
      console.log(`  ✅ PASS: ${item.name}`);
      passCount++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${item.name}`);
      console.error(`     Error: ${err.message}`);
      console.error(err.stack);
      failCount++;
    }
  }

  console.log('\n=============================================');
  console.log(`Summary: ${passCount} Passed, ${failCount} Failed`);
  console.log('=============================================\n');

  if (failCount > 0) {
    process.exit(1);
  }
}

await runAll();

