import { execSync } from 'node:child_process';
import assert from 'node:assert';

const BASE_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:4173';

console.log('======================================================================');
console.log('🚀 DEEP MULTI-SCENARIO PRODUCTION cURL TEST SUITE FOR DEALER VOICE AGENT');
console.log(`🎯 Target Base URL: ${BASE_URL}`);
console.log('======================================================================\n');

let totalTests = 0;
let passCount = 0;
let failCount = 0;

function curl(method, endpoint, body = null) {
  const url = `${BASE_URL}${endpoint}`;
  let cmd = `curl -s -X ${method} "${url}" -H "Content-Type: application/json"`;
  if (body) {
    cmd += ` -d '${JSON.stringify(body).replace(/'/g, "'\\''")}'`;
  }
  const raw = execSync(cmd, { encoding: 'utf8', timeout: 10000 });
  try {
    return JSON.parse(raw);
  } catch (err) {
    throw new Error(`Failed to parse curl JSON response from ${endpoint}: ${raw}`);
  }
}

function runScenario(title, fn) {
  console.log(`\n▶ SCENARIO: ${title}`);
  try {
    fn();
  } catch (err) {
    console.error(`💥 Scenario Failure: ${err.message}`);
  }
}

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${desc}`);
    passCount++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`);
    console.error(`     Error: ${err.message}`);
    failCount++;
  }
}

// ====================================================================
// SCENARIO 1: Realistic Conversational Indian EV Dealer (10-Turn Full Onboarding)
// ====================================================================
runScenario('1. Realistic Messy Conversational Indian EV Dealer (10-Turn Flow)', () => {
  let session = null;

  it('1.1 Start Session in Hinglish and verify 0/11 initial progress', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    assert.strictEqual(session.success, true);
    assert.ok(session.sessionId);
    assert.strictEqual(session.initialTurn.completionStats.filledCount, 0);
    assert.strictEqual(session.initialTurn.completionStats.totalRequired, 11);
    assert.strictEqual(session.initialTurn.targetField, 'shopName');
    assert.strictEqual(session.initialTurn.conversationMode, 'ASKING');
  });

  it('1.2 Turn 1: Conversational shop name with Hindi filler', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Haanji bhai hamare showroom ka naam Electra Wheels EV Studio hai'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.shopName, 'Electra Wheels EV Studio');
    assert.strictEqual(res.completionStats.filledCount, 1);
    assert.strictEqual(res.targetField, 'managerName');
  });

  it('1.3 Turn 2: Manager name with honorific', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Main Rakesh Sharma baat kar raha hu yaha ka proprietor'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.managerName, 'Rakesh Sharma');
    assert.strictEqual(res.completionStats.filledCount, 2);
    assert.strictEqual(res.targetField, 'phone');
  });

  it('1.4 Turn 3: Spoken words phone number ("double nine triple eight...")', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Mera mobile number note karo: double nine double eight seven seven double four one zero'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.phone, '9988774410');
    assert.strictEqual(res.completionStats.filledCount, 3);
    assert.strictEqual(res.targetField, 'email');
  });

  it('1.5 Turn 4: Spoken official email ("at the rate gmail dot com")', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Email id hai rakesh dot electra at the rate gmail dot com'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.email, 'rakesh.electra@gmail.com');
    assert.strictEqual(res.completionStats.filledCount, 4);
    assert.strictEqual(res.targetField, 'city');
  });

  it('1.6 Turn 5: City name', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'City Bengaluru hai Karnataka me'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.city, 'Bengaluru');
    assert.strictEqual(res.completionStats.filledCount, 5);
    assert.strictEqual(res.targetField, 'address');
  });

  it('1.7 Turn 6: Address with landmark', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Plot 42, Opposite Apollo Hospital, Bannerghatta Main Road'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.address, 'Plot 42, Opposite Apollo Hospital, Bannerghatta Main Road');
    assert.strictEqual(res.completionStats.filledCount, 6);
    assert.strictEqual(res.targetField, 'pincode');
  });

  it('1.8 Turn 7: Spoken Bangalore pincode ("five six zero zero seven six")', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Pincode hai five six zero zero seven six'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.pincode, '560076');
    assert.strictEqual(res.completionStats.filledCount, 7);
    assert.strictEqual(res.targetField, 'workingDays');
  });

  it('1.9 Turn 8: Operating days ("Monday to Saturday")', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Monday to Saturday open rehta hai, Sunday holiday'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.workingDays, 'Monday to Saturday');
    assert.strictEqual(res.completionStats.filledCount, 8);
    assert.strictEqual(res.targetField, 'brands');
  });

  it('1.10 Turn 9: Multi-brand EV dealership (Tata Motors, MG, Ather)', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Hum Tata Motors aur Ather Energy ke authorized dealer hain'
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.currentForm.brands.includes('Tata Motors'));
    assert.ok(res.currentForm.brands.includes('Ather Energy'));
    assert.strictEqual(res.completionStats.filledCount, 9);
    assert.strictEqual(res.targetField, 'emiAvailable');
  });

  it('1.11 Turn 10: Service facilities (EMI & Test Drive)', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Haan bhai customer ko EMI loan facility aur doorstep test drive dono dete hain'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.emiAvailable, true);
    assert.strictEqual(res.currentForm.showroomTestDrive, true);
    assert.strictEqual(res.completionStats.filledCount, 11);
    assert.strictEqual(res.completionStats.percentage, 100);
    assert.ok(res.action === 'STEP_CONFIRMATION' || res.action === 'COMPLETE');
  });

  it('1.12 Submit full registration via cURL and check database commit', () => {
    const submitRes = curl('POST', '/api/dealer-session/submit', { sessionId: session.sessionId });
    assert.strictEqual(submitRes.success, true);
    assert.ok(submitRes.registeredDealer?.id || submitRes.partnerId || submitRes.isSubmitted);
    assert.strictEqual(submitRes.registeredDealer?.verificationStatus || 'VERIFIED', 'VERIFIED');

    const dealerId = submitRes.registeredDealer?.id || submitRes.partnerId;
    assert.ok(dealerId);

    // Verify lookup by dealer ID endpoint
    const getRes = curl('GET', `/api/dealers/${dealerId}`);
    assert.strictEqual(getRes.success, true);
    assert.ok(getRes.dealer);
    assert.strictEqual(getRes.dealer.location?.city || getRes.dealer.city, 'Bengaluru');
    assert.strictEqual(getRes.dealer.location?.pincode || getRes.dealer.pincode, '560076');
  });
});

// ====================================================================
// SCENARIO 2: Conversational Chaos, Mid-Flight FAQs, Pauses, Corrections
// ====================================================================
runScenario('2. Conversational Chaos, Mid-Flight FAQs, Pauses & Non-Destructive Corrections', () => {
  let session = null;

  it('2.1 Initialize session and set initial shop name', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Showroom Zenith EV Motors'
    });
    assert.strictEqual(res.currentForm.shopName, 'Zenith EV Motors');
  });

  it('2.2 Mid-interview FAQ: User asks "Is there any fee or charge to register?"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Bhai EasyEV pe register karne ka koi charge ya fee lagti hai kya?'
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.speechText.toLowerCase().includes('free') || res.speechText.toLowerCase().includes('koi registration fee nahi'));
    // State is preserved! Still on managerName
    assert.strictEqual(res.targetField, 'managerName');
    assert.strictEqual(res.currentForm.shopName, 'Zenith EV Motors');
  });

  it('2.3 Hesitation / Pause: User says "Arre ek second ruko file dekh raha hu"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Arre ek second ruko please'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.conversationMode, 'PAUSED');
    assert.ok(res.speechText.includes('aaram se'));
    assert.strictEqual(res.targetField, 'managerName');
  });

  it('2.4 Repeat Request: User says "Dobara bolo kya pucha aapne"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Dobara bolo please'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.conversationMode, 'ASKING');
    assert.ok(res.speechText.includes('repeat') || res.speechText.includes('naam'));
  });

  it('2.5 Supply manager name and phone number', () => {
    let res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Manager Deepak Verma'
    });
    assert.strictEqual(res.currentForm.managerName, 'Deepak Verma');

    res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Phone number 9822114455'
    });
    assert.strictEqual(res.currentForm.phone, '9822114455');
  });

  it('2.6 Non-destructive correction: "Arre phone number change karo 9877665544"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Arre phone number change karo naya number hai 9877665544'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.conversationMode, 'CORRECTING');
    assert.strictEqual(res.currentForm.phone, '9877665544');

    // Audit trail should capture previous value 9822114455
    const auditRes = curl('GET', `/api/dealer-session/audit?sessionId=${session.sessionId}`);
    const phoneAudit = auditRes.auditTrail.filter(a => a.field === 'phone');
    assert.ok(phoneAudit.length >= 2);
    assert.strictEqual(phoneAudit[0].value, '9822114455');
    assert.strictEqual(phoneAudit[1].value, '9877665544');
  });
});

// ====================================================================
// SCENARIO 3: Compound Ultra-Bulk Utterances (10 Details in 2 turns)
// ====================================================================
runScenario('3. Compound Ultra-Bulk Utterance (0/10 -> 5/10 -> 10/10 in 2 Turns)', () => {
  let session = null;

  it('3.1 Start fresh session at 0/10', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    assert.strictEqual(session.initialTurn.completionStats.filledCount, 0);
  });

  it('3.2 Turn 1: 5 fields in single sentence', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Mera showroom GreenRide EV Hub hai Noida city me, owner Amit Kumar, mobile 9988776655 aur email amit.ev@greenride.in'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.shopName, 'GreenRide EV Hub');
    assert.strictEqual(res.currentForm.managerName, 'Amit Kumar');
    assert.strictEqual(res.currentForm.city, 'Noida');
    assert.strictEqual(res.currentForm.phone, '9988776655');
    assert.strictEqual(res.currentForm.email, 'amit.ev@greenride.in');
    assert.strictEqual(res.completionStats.filledCount, 5);
    assert.strictEqual(res.completionStats.percentage, 45);
    // Agent jumps directly to remaining field (address)
    assert.strictEqual(res.targetField, 'address');
  });

  it('3.3 Turn 2: Remaining 6 fields in single sentence', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Address Sector 62 Electronic City pincode 201301, All 7 Days open, Tata Motors and Mahindra brands with EMI and test drive facility'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.pincode, '201301');
    assert.strictEqual(res.currentForm.workingDays, 'All 7 Days');
    assert.ok(res.currentForm.brands.includes('Tata Motors'));
    assert.ok(res.currentForm.brands.includes('Mahindra'));
    assert.strictEqual(res.currentForm.emiAvailable, true);
    assert.strictEqual(res.currentForm.showroomTestDrive, true);
    assert.strictEqual(res.completionStats.filledCount, 11);
    assert.strictEqual(res.completionStats.percentage, 100);
    assert.ok(res.action === 'COMPLETE' || res.action === 'STEP_CONFIRMATION');
  });

  it('3.4 Immediate voice submission confirmation', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Haan bhai bilkul confirm hai submit kar do'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.isSubmitted, true);
    assert.ok(res.registeredDealer.id);
  });
});

// ====================================================================
// SCENARIO 4: Shuddh Hindi & Devanagari Conversational Flow
// ====================================================================
runScenario('4. Shuddh Hindi & Devanagari Conversational Flow', () => {
  let session = null;

  it('4.1 Start session in Pure Hindi', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hindi' });
    assert.strictEqual(session.success, true);
    assert.ok(session.initialTurn.speechText.includes('नमस्ते') || session.initialTurn.speechText.includes('शोरूम'));
  });

  it('4.2 Provide Hindi Showroom and Manager Name', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'शोरूम का नाम शक्ति मोटर्स है और मेरा नाम विजय वर्मा है'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.shopName, 'शक्ति मोटर्स');
    assert.strictEqual(res.currentForm.managerName, 'विजय वर्मा');
    assert.strictEqual(res.targetField, 'phone');
  });

  it('4.3 Provide Devanagari Numerals for Phone: "९८७६५४३२१०"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'मेरा मोबाइल नंबर ९८७६५४३२१० है'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.phone, '9876543210');
  });
});

// ====================================================================
// SCENARIO 5: Adversarial, Garbage, Noise & 3-Attempt Progressive Fallback
// ====================================================================
runScenario('5. Adversarial, Garbage Noise, Irrelevant Guard & 3-Attempt Fallback', () => {
  let session = null;

  it('5.1 Start session on shopName', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Volt City'
    });
    assert.strictEqual(res.currentForm.shopName, 'Volt City');
  });

  it('5.2 ManagerName asked -> User speaks irrelevant noise: "Mujhe biryani khani hai"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Mujhe biryani khani hai'
    });
    assert.strictEqual(res.success, true);
    // Guard prevents managerName from becoming "biryani khani hai"
    assert.notStrictEqual(res.currentForm.managerName, 'biryani khani hai');
    assert.strictEqual(res.targetField, 'managerName');
    assert.strictEqual(res.currentAttempt, 1);
  });

  it('5.3 Second garbage noise: "err... beep beep horn sound"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Um err... horn beep beep'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.targetField, 'managerName');
    assert.strictEqual(res.currentAttempt, 2);
  });

  it('5.4 Third garbage noise: triggers progressive fallback to MANUAL_FALLBACK without crashing', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'kuch bhi samajh nahi aa raha'
    });
    assert.strictEqual(res.success, true);
    // Advances to next field with guidance to fill on screen
    assert.strictEqual(res.targetField, 'phone');
    assert.strictEqual(res.canonicalState.fields.managerName.status, 'MANUAL_FALLBACK');
  });
});

// ====================================================================
// SCENARIO 6: Cross-Field Conflict Detection (City vs Pincode Mismatch)
// ====================================================================
runScenario('6. Cross-Field Reasoning & Conflict Detection (City vs Pincode)', () => {
  let session = null;

  it('6.1 Start session and sync City: Delhi with Mumbai Pincode: 400001', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    const syncRes = curl('POST', '/api/dealer-session/sync-state', {
      sessionId: session.sessionId,
      patch: {
        shopName: 'Delhi Central EV',
        managerName: 'Arjun Das',
        phone: '9811223344',
        city: 'Delhi',
        pincode: '400001' // Mumbai PIN
      }
    });
    assert.strictEqual(syncRes.success, true);
  });

  it('6.2 Process turn detects CROSS_FIELD_CONFLICT and prompts repair', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Address hai Connaught Place'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.crossFieldConflictDetected, true);
    assert.ok(res.speechText.includes('pincode') || res.speechText.includes('Delhi'));
  });

  it('6.3 Resolve conflict by supplying correct Delhi pincode: 110001', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Pincode 110001 hai'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.pincode, '110001');
    assert.strictEqual(res.crossFieldConflictDetected, false);
  });
});

// ====================================================================
// SCENARIO 7: Unknown / "Pata nahi" Intent (Tip 31)
// ====================================================================
runScenario('7. Handling "I don\'t know" / UNKNOWN Intent (Tip 31)', () => {
  let session = null;

  it('7.1 Start session on shopName', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
  });

  it('7.2 User says "Mujhe nahi pata abhi" on required field -> Graceful manual fallback', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Mujhe nahi pata abhi'
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.speechText.includes('baad me') || res.speechText.includes('screen par'));
    assert.strictEqual(res.canonicalState.fields.shopName.status, 'MANUAL_FALLBACK');
    assert.strictEqual(res.targetField, 'managerName');
  });
});

// ====================================================================
// SCENARIO 8: Direct Step Navigation via Voice & UI Patch Sync
// ====================================================================
runScenario('8. Step Navigation via Voice & Multi-Select Sync', () => {
  let session = null;

  it('8.1 Start session and jump to Step 3 via voice', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Step 3 par jao brand select karna hai'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.step, 3);
    assert.strictEqual(res.targetField, 'brands');
  });

  it('8.2 Sync multiple brand selections via UI sync patch', () => {
    const syncRes = curl('POST', '/api/dealer-session/sync-state', {
      sessionId: session.sessionId,
      patch: {
        brands: ['Tata Motors', 'Mahindra', 'Ola Electric'],
        categories: ['4W', '2W', '3W']
      }
    });
    assert.strictEqual(syncRes.success, true);
    assert.strictEqual(syncRes.currentForm.brands.length, 3);
    assert.strictEqual(syncRes.currentForm.categories.length, 3);
  });

  it('8.3 Go back via voice "Peeche jao"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Peeche jao'
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.step === 2 || res.step === 1);
  });
});

// ====================================================================
// SCENARIO 9: Field-Specific Targeted Repair Prompt (Tip 30)
// ====================================================================
runScenario('9. Field-Specific Targeted Repair Prompt (Tip 30)', () => {
  let session = null;

  it('9.1 Start session and ask for phone', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Nova EV Motors, manager Suresh'
    });
  });

  it('9.2 User gives invalid 6-digit phone number -> Targeted 10-digit repair guidance', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Phone number 981122'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.targetField, 'phone');
    assert.ok(res.speechText.includes('10-digit') || res.speechText.includes('10 अंकों'));
  });

  it('9.3 User gives invalid email -> Targeted email repair guidance', () => {
    curl('POST', '/api/dealer-session/sync-state', {
      sessionId: session.sessionId,
      patch: { phone: '9811223344' }
    });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'email nahi bataunga abc'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.targetField, 'email');
    assert.ok(res.speechText.includes('email') || res.speechText.includes('ईमेल'));
  });

  it('9.4 User gives invalid city -> Targeted city repair guidance', () => {
    curl('POST', '/api/dealer-session/sync-state', {
      sessionId: session.sessionId,
      patch: { email: 'nova.motors@easyev.in' }
    });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'X'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.targetField, 'city');
    assert.ok(res.speechText.includes('city') || res.speechText.includes('शहर'));
  });

  it('9.5 User gives invalid pincode -> Targeted pincode repair guidance', () => {
    curl('POST', '/api/dealer-session/sync-state', {
      sessionId: session.sessionId,
      patch: { city: 'Delhi', address: 'Connaught Place' }
    });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: '1100'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.targetField, 'pincode');
    assert.ok(res.speechText.includes('pincode') || res.speechText.includes('6-digit') || res.speechText.includes('6 अंकों'));
  });
});

// ====================================================================
// SCENARIO 10: Multi-Session Concurrency & State Isolation via cURL
// ====================================================================
runScenario('10. Multi-Session Concurrency & Strict State Isolation', () => {
  let sessionA = null;
  let sessionB = null;
  let sessionC = null;

  it('10.1 Spawn 3 concurrent sessions simultaneously via cURL', () => {
    sessionA = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    sessionB = curl('POST', '/api/dealer-session/start', { language: 'Hindi' });
    sessionC = curl('POST', '/api/dealer-session/start', { language: 'English' });

    assert.ok(sessionA.sessionId && sessionB.sessionId && sessionC.sessionId);
    assert.notStrictEqual(sessionA.sessionId, sessionB.sessionId);
    assert.notStrictEqual(sessionB.sessionId, sessionC.sessionId);
  });

  it('10.2 Send distinct dealer names to each session', () => {
    const resA = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: sessionA.sessionId,
      text: 'Showroom Alpha Wheels Delhi'
    });
    const resB = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: sessionB.sessionId,
      text: 'शोरूम बीटा मोटर्स वाराणसी'
    });
    const resC = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: sessionC.sessionId,
      text: 'Showroom Gamma EV Hub Bangalore'
    });

    assert.strictEqual(resA.currentForm.shopName, 'Alpha Wheels Delhi');
    assert.strictEqual(resB.currentForm.shopName, 'बीटा मोटर्स वाराणसी');
    assert.strictEqual(resC.currentForm.shopName, 'Gamma EV Hub Bangalore');
  });

  it('10.3 Verify strict session isolation in Telemetry & Audit GET endpoints', () => {
    const auditA = curl('GET', `/api/dealer-session/audit?sessionId=${sessionA.sessionId}`);
    const auditB = curl('GET', `/api/dealer-session/audit?sessionId=${sessionB.sessionId}`);
    const auditC = curl('GET', `/api/dealer-session/audit?sessionId=${sessionC.sessionId}`);

    assert.strictEqual(auditA.canonicalState.shopName.value, 'Alpha Wheels Delhi');
    assert.strictEqual(auditB.canonicalState.shopName.value, 'बीटा मोटर्स वाराणसी');
    assert.strictEqual(auditC.canonicalState.shopName.value, 'Gamma EV Hub Bangalore');
  });

  it('10.4 Cleanly terminate all 3 sessions via cURL', () => {
    const stopA = curl('POST', '/api/dealer-session/stop', { sessionId: sessionA.sessionId });
    const stopB = curl('POST', '/api/dealer-session/stop', { sessionId: sessionB.sessionId });
    const stopC = curl('POST', '/api/dealer-session/stop', { sessionId: sessionC.sessionId });

    assert.strictEqual(stopA.success, true);
    assert.strictEqual(stopB.success, true);
    assert.strictEqual(stopC.success, true);
  });
});

// ====================================================================
// SCENARIO 11: Multi-Turn Corrections & Partial In-Flight Amendments
// ====================================================================
runScenario('11. Multi-Turn Corrections & Partial In-Flight Amendments', () => {
  let session = null;

  it('11.1 Start session and fill shopName + managerName', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    const t1 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Showroom name Green Volt EV Hub'
    });
    assert.strictEqual(t1.currentForm.shopName, 'Green Volt EV Hub');

    const t2 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Manager Amit Verma'
    });
    assert.strictEqual(t2.currentForm.managerName, 'Amit Verma');
    assert.strictEqual(t2.targetField, 'phone');
  });

  it('11.2 Correct manager name mid-flight: "Nahi manager badlo, actual manager Rahul Verma hai"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Nahi manager badlo, manager naam Rahul Verma kardo'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.managerName, 'Rahul Verma');
    assert.strictEqual(res.conversationMode, 'CORRECTING');
  });

  it('11.3 Supply phone and then immediately correct it in next turn', () => {
    const t3 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Mobile number 9811223344'
    });
    assert.strictEqual(t3.currentForm.phone, '9811223344');

    const t4 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Arre galat ho gaya, phone number change karo 9876543210'
    });
    assert.strictEqual(t4.currentForm.phone, '9876543210');
  });

  it('11.4 Clean up session', () => {
    curl('POST', '/api/dealer-session/stop', { sessionId: session.sessionId });
  });
});

// ====================================================================
// SCENARIO 12: Skip, Fallback, and Intent Interleaving Flow
// ====================================================================
runScenario('12. Skip, Fallback, and Intent Interleaving Flow', () => {
  let session = null;

  it('12.1 Start session and skip shopName via voice', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Iski jagah next field par chalo, skip this'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.targetField, 'managerName');
  });

  it('12.2 Ask FAQ in between skipping fields: "Kya document upload karna padega?"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Ek baat batao kya koi document upload karna padega?'
    });
    assert.strictEqual(res.success, true);
    assert.ok(res.speechText.includes('verification') || res.speechText.includes('दस्तावेज') || res.speechText.includes('document'));
    assert.strictEqual(res.targetField, 'managerName');
  });

  it('12.3 Fill manager and then provide out-of-order City and Pincode', () => {
    const t1 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Manager Sunita Rao'
    });
    assert.strictEqual(t1.currentForm.managerName, 'Sunita Rao');

    const t2 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Humara showroom Jaipur me hai, pincode hai 302001'
    });
    assert.strictEqual(t2.currentForm.city, 'Jaipur');
    assert.strictEqual(t2.currentForm.pincode, '302001');
  });

  it('12.4 Clean up session', () => {
    curl('POST', '/api/dealer-session/stop', { sessionId: session.sessionId });
  });
});

// ====================================================================
// SCENARIO 13: Spoken Number Expressions Variations (Hindi, English, Mixed)
// ====================================================================
runScenario('13. Spoken Number Expressions Variations', () => {
  let session = null;

  it('13.1 Start session and supply shopName', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Showroom Speed Motors Mumbai'
    });
    curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Manager Ankit Jain'
    });
  });

  it('13.2 Hindi words for phone: "nau aath saat chhe paanch chaar teen do ek shunya"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Phone number hai nau aath saat chhe paanch chaar teen do ek shunya'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.phone, '9876543210');
  });

  it('13.3 Spoken pincode with mixed zero / oh: "four zero zero zero zero one"', () => {
    curl('POST', '/api/dealer-session/sync-state', {
      sessionId: session.sessionId,
      patch: { city: 'Mumbai', address: 'Bandra West' }
    });
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Pincode hai four double zero double zero one'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.pincode, '400001');
  });

  it('13.4 Clean up session', () => {
    curl('POST', '/api/dealer-session/stop', { sessionId: session.sessionId });
  });
});

// ====================================================================
// SCENARIO 14: Step Reset and Full State Clearing via Voice
// ====================================================================
runScenario('14. Step Reset and Full State Clearing via Voice', () => {
  let session = null;

  it('14.1 Start session and fill partial form', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Showroom Tesla EV Delhi'
    });
    curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Manager Rajesh Kumar'
    });
  });

  it('14.2 Issue full reset intent: "Bhai shuru se shuru karo pura form reset kardo"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Bhai shuru se shuru karo pura form clear all kar do'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.shopName, '');
    assert.strictEqual(res.currentForm.managerName, '');
    assert.strictEqual(res.completionStats.filledCount, 0);
    assert.strictEqual(res.targetField, 'shopName');
  });

  it('14.3 Verify form can be filled freshly after reset', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Showroom Nexa EV World'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.shopName, 'Nexa EV World');
    assert.strictEqual(res.completionStats.filledCount, 1);
  });

  it('14.4 Clean up session', () => {
    curl('POST', '/api/dealer-session/stop', { sessionId: session.sessionId });
  });
});

// ====================================================================
// SCENARIO 15: All Services Positive Declaration & Fast Completion
// ====================================================================
runScenario('15. All Services Positive Declaration & Fast Completion', () => {
  let session = null;

  it('15.1 Start session pre-filled up to step 3', () => {
    session = curl('POST', '/api/dealer-session/start', {
      language: 'Hinglish',
      initialValues: {
        shopName: 'Green Velocity EV',
        managerName: 'Karan Mehra',
        phone: '9811002233',
        email: 'karan.mehra@greenvelocity.in',
        city: 'Pune',
        address: 'MG Road Camp',
        pincode: '411001',
        workingDays: 'All 7 Days',
        brands: ['Tata Motors', 'Ather Energy']
      }
    });
    assert.strictEqual(session.initialTurn.completionStats.filledCount, 9);
    assert.strictEqual(session.initialTurn.step, 4);
  });

  it('15.2 In Step 4, declare all services in single sentence: "Humare yahan sabhi services uplabdh hain"', () => {
    const res = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Humare showroom par sabhi services uplabdh hain, EMI, insurance, test drive sab dete hain'
    });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.currentForm.emiAvailable, true);
    assert.strictEqual(res.currentForm.insuranceAvailable, true);
    assert.strictEqual(res.currentForm.showroomTestDrive, true);
    assert.strictEqual(res.completionStats.filledCount, 11);
    assert.strictEqual(res.completionStats.percentage, 100);
  });

  it('15.3 Submit registration and check status', () => {
    const subRes = curl('POST', '/api/dealer-session/submit', { sessionId: session.sessionId });
    assert.strictEqual(subRes.success, true);
    const dealerObj = subRes.registeredDealer || subRes.dealer;
    assert.ok(dealerObj);
    assert.strictEqual(dealerObj.shopName, 'Green Velocity EV');
    assert.strictEqual(dealerObj.city, 'Pune');
  });
});

// ====================================================================
// FINAL SUMMARY
// ====================================================================
console.log('\n======================================================================');
console.log(`📊 ALL-SCENARIOS cURL TEST SUITE COMPLETE: ${passCount} Passed, ${failCount} Failed (Total: ${totalTests})`);
console.log('======================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
