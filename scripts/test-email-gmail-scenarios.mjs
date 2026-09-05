import { execSync } from 'node:child_process';
import assert from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeSttTranscript,
  normalizeEntities,
  validators,
  dealerVoiceAgentManager,
  DealerFormStateMachine
} from '../dealer-voice-agent.mjs';

const BASE_URL = process.env.TEST_SERVER_URL || 'http://127.0.0.1:4173';

console.log('======================================================================');
console.log('📧 IN-DEPTH GMAIL & EMAIL SCENARIOS TEST SUITE FOR EASYEV');
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
    console.error(`💥 Scenario Level Exception: ${err.message}`);
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
// SCENARIO 1: Spoken Speech Normalization for Diverse Email Providers
// ====================================================================
runScenario('1. Spoken Speech Normalization across Diverse Email Providers', () => {
  it('1.1 Standard Gmail: "john dot doe at the rate gmail dot com"', () => {
    const raw = 'john dot doe at the rate gmail dot com';
    const norm = normalizeSttTranscript(raw);
    assert.strictEqual(norm, 'john.doe@gmail.com');
  });

  it('1.2 Numbers in Gmail: "sharma motors 2026 at rate gmail dot com"', () => {
    const raw = 'sharma motors 2026 at rate gmail dot com';
    const norm = normalizeSttTranscript(raw);
    assert.ok(norm.includes('@gmail.com'));
    const ent = normalizeEntities('mera email sharma motors 2026 at rate gmail dot com', {}, 'email');
    assert.ok(ent.email.includes('@gmail.com'));
  });

  it('1.3 Multi-level TLD (.co.in): "satvik at the rate yahoo dot co dot in"', () => {
    const raw = 'satvik at the rate yahoo dot co dot in';
    const norm = normalizeSttTranscript(raw);
    assert.strictEqual(norm, 'satvik@yahoo.co.in');
  });

  it('1.4 Spoken Underscore: "dealer underscore ev at the rate rediffmail dot com"', () => {
    const raw = 'dealer underscore ev at the rate rediffmail dot com';
    const norm = normalizeSttTranscript(raw);
    assert.strictEqual(norm, 'dealer_ev@rediffmail.com');
  });

  it('1.5 Spoken Dash / Hyphen: "support dash electric at the rate outlook dot com"', () => {
    const raw = 'support dash electric at the rate outlook dot com';
    const norm = normalizeSttTranscript(raw);
    assert.strictEqual(norm, 'support-electric@outlook.com');
  });

  it('1.6 Custom Dealership Domain: "sales at the rate autohub dot in"', () => {
    const raw = 'sales at the rate autohub dot in';
    const norm = normalizeSttTranscript(raw);
    assert.strictEqual(norm, 'sales@autohub.in');
  });
});

// ====================================================================
// SCENARIO 2: Pure Hindi & Devanagari Email Utterances
// ====================================================================
runScenario('2. Pure Hindi & Devanagari Email Utterances', () => {
  it('2.1 Devanagari keywords: "विकास डॉट सिंह एट द रेट जीमेल डॉट कॉम"', () => {
    const raw = 'विकास डॉट सिंह एट द रेट जीमेल डॉट कॉम';
    const norm = normalizeSttTranscript(raw);
    assert.ok(norm.includes('@gmail.com'));
  });

  it('2.2 Devanagari with digits: "राकेश १२३ एट रेट याहू डॉट इन"', () => {
    const raw = 'राकेश १२३ एट रेट याहू डॉट इन';
    const norm = normalizeSttTranscript(raw);
    assert.ok(norm.includes('123@yahoo.in'));
  });
});

// ====================================================================
// SCENARIO 3: Live Multi-turn Voice Email Interview via Backend cURL
// ====================================================================
runScenario('3. Live Multi-turn Voice Email Interview via Backend cURL', () => {
  let session = null;

  it('3.1 Start fresh session and fill Shop, Manager, and Phone', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    assert.strictEqual(session.success, true);

    const r1 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Showroom name Apex EV Studio, owner Priya Sharma, phone 9822334455'
    });
    assert.strictEqual(r1.currentForm.shopName, 'Apex EV Studio');
    assert.strictEqual(r1.currentForm.managerName, 'Priya Sharma');
    assert.strictEqual(r1.currentForm.phone, '9822334455');
    // Next missing field in Step 1 MUST be email!
    assert.strictEqual(r1.targetField, 'email');
    assert.ok(r1.speechText.includes('email') || r1.speechText.includes('ईमेल'));
  });

  it('3.2 Provide official Gmail with conversational filler: "Hamara official email id priya dot apex at the rate gmail dot com hai"', () => {
    const r2 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Hamara official email id priya dot apex at the rate gmail dot com hai'
    });
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.currentForm.email, 'priya.apex@gmail.com');
    // Advances to city
    assert.strictEqual(r2.targetField, 'city');
    assert.strictEqual(r2.completionStats.filledCount, 4);
  });
});

// ====================================================================
// SCENARIO 4: Mid-Flight Email In-Turn Non-Destructive Corrections
// ====================================================================
runScenario('4. Mid-Flight Email In-Turn Non-Destructive Corrections', () => {
  let session = null;

  it('4.1 Set initial wrong email and verify capture', () => {
    session = curl('POST', '/api/dealer-session/start', { language: 'Hinglish' });
    const r1 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Showroom Nexa EV, manager Rohit, phone 9811223344, email wrong.email@gmail.com'
    });
    assert.strictEqual(r1.currentForm.email, 'wrong.email@gmail.com');
  });

  it('4.2 Issue correction intent: "Arre email galat note ho gaya, actual email contact@nexaev.in hai"', () => {
    const r2 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'Arre email galat note ho gaya, actual email contact@nexaev.in hai'
    });
    assert.strictEqual(r2.success, true);
    assert.strictEqual(r2.currentForm.email, 'contact@nexaev.in');

    // Verify audit trail preserves history of correction
    const auditRes = curl('GET', `/api/dealer-session/audit?sessionId=${encodeURIComponent(session.sessionId)}`);
    assert.strictEqual(auditRes.success, true);
    assert.strictEqual(auditRes.canonicalState.email.value, 'contact@nexaev.in');
    assert.ok(auditRes.auditTrail.length >= 2);
    const emailAuditEntries = auditRes.auditTrail.filter(a => a.field === 'email');
    assert.ok(emailAuditEntries.length >= 2);
    assert.strictEqual(emailAuditEntries[emailAuditEntries.length - 1].to, 'contact@nexaev.in');
  });
});

// ====================================================================
// SCENARIO 5: Garbage Noise & 3-Attempt Progressive Fallback on Email
// ====================================================================
runScenario('5. Garbage Noise & 3-Attempt Progressive Fallback on Email', () => {
  let session = null;

  it('5.1 Setup session directly targeting email', () => {
    session = curl('POST', '/api/dealer-session/start', {
      language: 'Hinglish',
      initialValues: { shopName: 'Turbo EV', managerName: 'Vikas', phone: '9811002200' }
    });
    assert.strictEqual(session.initialTurn.targetField, 'email');
  });

  it('5.2 Attempt 1: User gives unintelligible noise on email', () => {
    const r1 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'err... beep beep horn sound'
    });
    assert.strictEqual(r1.targetField, 'email');
    assert.ok(r1.speechText.includes('email') || r1.speechText.includes('samajh nahi aaya'));
  });

  it('5.3 Attempt 2: User gives second unclear answer -> Targeted rephrase prompt', () => {
    const r2 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'kuch bhi anaab shanaab'
    });
    assert.strictEqual(r2.targetField, 'email');
    assert.ok(r2.speechText.includes('domain') || r2.speechText.includes('gmail dot com') || r2.speechText.includes('email'));
  });

  it('5.4 Attempt 3: Third failed answer -> Graceful MANUAL_FALLBACK transition to City', () => {
    const r3 = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: session.sessionId,
      text: 'kuch nahi bolunga'
    });
    assert.strictEqual(r3.targetField, 'city');
    assert.ok(r3.speechText.includes('city') || r3.speechText.includes('City') || r3.speechText.includes('showroom'));
  });

  it('5.5 Tip 31: Handle "I don\'t know" on email immediately without 3-retry loops', () => {
    const s2 = curl('POST', '/api/dealer-session/start', {
      language: 'Hinglish',
      initialValues: { shopName: 'Nexus EV', managerName: 'Kunal', phone: '9822001122' }
    });
    const rUnknown = curl('POST', '/api/dealer-session/process-turn', {
      sessionId: s2.sessionId,
      text: 'Mujhe official email abhi pata nahi hai'
    });
    assert.strictEqual(rUnknown.targetField, 'city');
    assert.ok(rUnknown.speechText.includes('manually') || rUnknown.speechText.includes('screen') || rUnknown.speechText.includes('Koi baat nahi'));
  });
});

// ====================================================================
// SCENARIO 6: Server API Schema Rejections for Missing/Invalid Emails
// ====================================================================
runScenario('6. Server API Schema Rejections for Missing/Invalid Emails', () => {
  it('6.1 POST /api/dealers/register with MISSING email is rejected with 400', () => {
    const invalidDealer = {
      name: 'No Email Dealership',
      dealerType: 'Authorized OEM Dealership',
      managerName: 'Sunil Gupta',
      phone: '9811223344',
      city: 'Delhi',
      address: 'Main Road',
      pincode: '110001'
    };
    const res = curl('POST', '/api/dealers/register', invalidDealer);
    assert.strictEqual(res.error, 'Valid official email address is required');
  });

  it('6.2 POST /api/dealers/register with MALFORMED email is rejected with 400', () => {
    const malformedDealer = {
      name: 'Bad Email Dealership',
      dealerType: 'Authorized OEM Dealership',
      managerName: 'Sunil Gupta',
      phone: '9811223344',
      email: 'not-a-valid-email',
      city: 'Delhi',
      address: 'Main Road',
      pincode: '110001'
    };
    const res = curl('POST', '/api/dealers/register', malformedDealer);
    assert.strictEqual(res.error, 'Valid official email address is required');
  });

  it('6.3 POST /api/dealers/register with VALID Gmail is ACCEPTED (201) and triggers email dispatch', () => {
    const validDealer = {
      name: 'Eco Drive Hub Gmail Test',
      dealerType: 'Authorized OEM Dealership',
      managerName: 'Sunil Gupta',
      phone: '9811223344',
      email: 'ecodrive.test@gmail.com',
      city: 'Delhi',
      address: 'Plot 10, Connaught Place',
      pincode: '110001',
      categories: ['4W'],
      brands: ['Tata Motors']
    };
    const res = curl('POST', '/api/dealers/register', validDealer);
    assert.strictEqual(res.success, true);
    assert.ok(res.dealer.id);
    assert.strictEqual(res.dealer.contactPerson.email, 'ecodrive.test@gmail.com');
    assert.ok(res.emailNotification);
    assert.strictEqual(res.emailNotification.status, 'SENT');
    assert.strictEqual(res.emailNotification.recipientEmail, 'ecodrive.test@gmail.com');
  });
});

// ====================================================================
// SCENARIO 7: Transactional Mailer Audit Log Verification
// ====================================================================
runScenario('7. Transactional Mailer Audit Log Verification', () => {
  it('7.1 Verify data/dealer-emails.log contains audit entries for registered emails', () => {
    const logPath = resolve(process.cwd(), 'data', 'dealer-emails.log');
    assert.ok(existsSync(logPath), 'data/dealer-emails.log must exist');
    const content = readFileSync(logPath, 'utf8');
    assert.ok(content.includes('ecodrive.test@gmail.com'), 'Log must contain ecodrive.test@gmail.com entry');
    assert.ok(content.includes('🎉 Welcome to EasyEV Network: Partner ID'));
  });
});

// ====================================================================
// FINAL SUMMARY
// ====================================================================
console.log('\n======================================================================');
console.log(`📊 GMAIL & EMAIL IN-DEPTH TEST COMPLETE: ${passCount} Passed, ${failCount} Failed (Total: ${totalTests})`);
console.log('======================================================================\n');

if (failCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
