import assert from 'node:assert';
import {
  DealerFormStateMachine,
  DealerAgentSession,
  dealerVoiceAgentManager,
  classifyIntent,
  normalizeEntities,
  parseSpokenNumberWords,
  INTENT,
  FIELD_STATE,
  VOICE_INTERVIEW_FIELDS
} from '../dealer-voice-agent.mjs';

console.log('🧪 Starting Deep Backend Verification for Dealer Voice Agent...\n');

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
// SECTION 1: VOICE_INTERVIEW_FIELDS & INITIAL PROGRESS STATS
// -------------------------------------------------------------
console.log('--- Section 1: State Machine & Initial Progress ---');

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

test('Initial blank form starts with 0 / 10 (0% completion)', () => {
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
});

// -------------------------------------------------------------
// SECTION 2: NUMBER PARSER & ENTITY EXTRACTION
// -------------------------------------------------------------
console.log('\n--- Section 2: Spoken Numbers & Entity Extraction ---');

test('Spoken Hindi/English number conversion', () => {
  const parsed1 = parseSpokenNumberWords('nau aath saat chhe paanch chaar teen do ek shunya');
  assert.strictEqual(parsed1.join(''), '9876543210');

  const parsed2 = parseSpokenNumberWords('double nine double eight double seven double six double five');
  assert.strictEqual(parsed2.join(''), '9988776655');
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
// SECTION 3: INTENT CLASSIFICATION & PRIORITY
// -------------------------------------------------------------
console.log('\n--- Section 3: Intent Classification & Priority ---');

test('Submit intent classification', () => {
  assert.strictEqual(classifyIntent('Submit my verified registration'), INTENT.SUBMIT);
  assert.strictEqual(classifyIntent('Please submit form'), INTENT.SUBMIT);
  assert.strictEqual(classifyIntent('Kar do register'), INTENT.SUBMIT);
  assert.strictEqual(classifyIntent('Verified registration submit kar do'), INTENT.SUBMIT);
});

test('Navigation intent classification', () => {
  assert.strictEqual(classifyIntent('Step 2 kholo'), INTENT.NAVIGATE_STEP);
  assert.strictEqual(classifyIntent('Pehle step par jao'), INTENT.NAVIGATE_STEP);
  assert.strictEqual(classifyIntent('Go back'), INTENT.GO_BACK);
});

test('Correction intent classification', () => {
  assert.strictEqual(classifyIntent('Name badlo'), INTENT.CORRECT_FIELD);
  assert.strictEqual(classifyIntent('Galat ho gaya change karo'), INTENT.CORRECT_FIELD);
});

// -------------------------------------------------------------
// SECTION 4: FULL CONVERSATIONAL ONBOARDING FLOW (STEPS 1 TO 5)
// -------------------------------------------------------------
console.log('\n--- Section 4: End-to-End Onboarding Journey Simulation ---');

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
  assert.strictEqual(t1.completionStats.percentage, 10);

  // Turn 2: Manager Name
  const t2 = await session.processTurn({ text: 'Owner name is Rajesh Sharma' });
  assert.strictEqual(session.stateMachine.fields.managerName.value, 'Rajesh Sharma');
  assert.strictEqual(t2.completionStats.filledCount, 2);
  assert.strictEqual(t2.completionStats.percentage, 20);

  // Turn 3: Phone
  const t3 = await session.processTurn({ text: 'Mobile number 9811223344' });
  assert.strictEqual(session.stateMachine.fields.phone.value, '9811223344');
  assert.strictEqual(t3.completionStats.filledCount, 3);
  assert.strictEqual(t3.completionStats.percentage, 30);

  // Turn 4: City
  const t4 = await session.processTurn({ text: 'New Delhi' });
  assert.strictEqual(session.stateMachine.fields.city.value, 'New Delhi');
  assert.strictEqual(t4.completionStats.filledCount, 4);
  assert.strictEqual(t4.completionStats.percentage, 40);

  // Step 1 Confirmation -> Move to Step 2
  const tStep1Conf = await session.processTurn({ text: 'Haan agle step par chalo' });
  assert.strictEqual(session.stateMachine.currentStep, 2);

  // Turn 5: Address
  const t5 = await session.processTurn({ text: 'Plot 42, Okhla Phase 3 Industrial Area' });
  assert.strictEqual(t5.completionStats.filledCount, 5);
  assert.strictEqual(t5.completionStats.percentage, 50);

  // Turn 6: Pincode
  const t6 = await session.processTurn({ text: 'Pincode 110020' });
  assert.strictEqual(session.stateMachine.fields.pincode.value, '110020');
  assert.strictEqual(t6.completionStats.filledCount, 6);
  assert.strictEqual(t6.completionStats.percentage, 60);

  // Turn 7: Working Days
  const t7 = await session.processTurn({ text: 'All 7 Days open rehta hai' });
  assert.strictEqual(session.stateMachine.fields.workingDays.value, 'All 7 Days');
  assert.strictEqual(t7.completionStats.filledCount, 7);
  assert.strictEqual(t7.completionStats.percentage, 70);

  // Step 2 Confirmation -> Move to Step 3
  const tStep2Conf = await session.processTurn({ text: 'Ji haan aage badhein' });
  assert.strictEqual(session.stateMachine.currentStep, 3);

  // Turn 8: Brands (Categories are pre-selected so only Brands is asked!)
  const t8 = await session.processTurn({ text: 'Hum Tata Motors aur Mahindra deal karte hain' });
  assert.ok(session.stateMachine.fields.brands.value.includes('Tata Motors'));
  assert.strictEqual(t8.completionStats.filledCount, 8);
  assert.strictEqual(t8.completionStats.percentage, 80);

  // Step 3 Confirmation -> Move to Step 4
  const tStep3Conf = await session.processTurn({ text: 'Haan Step 4 par chalo' });
  assert.strictEqual(session.stateMachine.currentStep, 4);

  // Turn 9: EMI Loan
  const t9 = await session.processTurn({ text: 'Haan hum loan aur EMI provide karte hain' });
  assert.strictEqual(session.stateMachine.fields.emiAvailable.value, true);
  assert.strictEqual(t9.completionStats.filledCount, 9);
  assert.strictEqual(t9.completionStats.percentage, 90);

  // Turn 10: Test Drive
  const t10 = await session.processTurn({ text: 'Haan showroom test drive facility hai' });
  assert.strictEqual(session.stateMachine.fields.showroomTestDrive.value, true);
  assert.strictEqual(t10.completionStats.filledCount, 10);
  assert.strictEqual(t10.completionStats.percentage, 100);
  assert.strictEqual(t10.action, 'COMPLETE');

  // Turn 11: Final Voice Submission
  const tSubmit = await session.processTurn({ text: 'Submit my verified registration' });
  assert.strictEqual(tSubmit.action, 'SUBMIT_SUCCESS');
  assert.strictEqual(tSubmit.step, 5);
  assert.strictEqual(tSubmit.isSubmitted, true);
  assert.ok(tSubmit.partnerId.startsWith('EEV-DLR-2026-'));
  assert.strictEqual(tSubmit.registeredDealer.shopName, 'Shakti Motors EV Hub');
  assert.ok(tSubmit.registeredDealer.location);
  assert.ok(tSubmit.registeredDealer.services);
  assert.ok(tSubmit.registeredDealer.testDrive);
  assert.ok(tSubmit.ttsText.length > 0);
});

// -------------------------------------------------------------
// SECTION 5: EDGE CASES & RESILIENCY
// -------------------------------------------------------------
console.log('\n--- Section 5: Edge Cases & Resiliency Tests ---');

await asyncTest('Double submit guard returns existing partner registration safely', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  session.stateMachine.updateFields({ shopName: 'Auto Test Hub', phone: '9811223344' }, 'voice');
  
  const sub1 = await session.submitRegistration();
  assert.strictEqual(sub1.action, 'SUBMIT_SUCCESS');
  const pId1 = sub1.partnerId;

  const sub2 = await session.submitRegistration();
  assert.strictEqual(sub2.action, 'SUBMIT_SUCCESS');
  assert.strictEqual(sub2.partnerId, pId1, 'Must return same partner ID without duplicating');
});

await asyncTest('Skip question progresses cleanly to next field', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  const skipRes = await session.processTurn({ text: 'is field ko chhod do baad me bharenge' });
  assert.strictEqual(session.stateMachine.fields.shopName.status, FIELD_STATE.SKIPPED);
  assert.ok(skipRes.speechText.length > 0);
});

await asyncTest('FAQ query during conversation gives informative answer without breaking flow', async () => {
  const session = dealerVoiceAgentManager.createSession({});
  const faqRes = await session.processTurn({ text: 'EasyEV par register karne ki fees kitni lagega?' });
  assert.ok(faqRes.speechText.includes('100% free') || faqRes.speechText.includes('muft') || faqRes.speechText.includes('free of charge'));
  assert.strictEqual(faqRes.step, 1);
});

// -------------------------------------------------------------
// SECTION 6: LIVE HTTP API INTEGRATION TESTS (SERVER ENDPOINTS)
// -------------------------------------------------------------
console.log('\n--- Section 6: Live Server HTTP API Endpoints ---');

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

await asyncTest('POST /api/dealer-session/start, process-turn, sync-state, and submit pipeline', async () => {
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

  // 4. Submit Registration via HTTP
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

  // 5. Clean Stop
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
