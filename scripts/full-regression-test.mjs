import assert from 'node:assert';
import fs from 'node:fs';

const BASE_URL = 'http://127.0.0.1:4173';

console.log('==================================================================');
console.log('🔄 STARTING COMPREHENSIVE FULL-PLATFORM REGRESSION TEST SUITE');
console.log('==================================================================\n');

let total = 0;
let passed = 0;

async function runRegressionStep(name, fn) {
  total++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// Step 1: Health & Static Bundles
await runRegressionStep('Static Web Server & Bundle Integrity', async () => {
  const indexRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(indexRes.status, 200);
  const bundleRes = await fetch(`${BASE_URL}/agora-client.bundle.js`);
  assert.strictEqual(bundleRes.status, 200);
  const bundleText = await bundleRes.text();
  assert(bundleText.length > 10000, 'Bundle must be non-empty and bundled');
});

// Step 2: Session Bootstrap & Token Minting
let sessionKey = null;
let tokenData = null;

await runRegressionStep('Session Token Minting & Creation', async () => {
  const tokenRes = await fetch(`${BASE_URL}/api/session/token`);
  assert.strictEqual(tokenRes.status, 200);
  tokenData = await tokenRes.json();
  assert(tokenData.bootstrapKey != null);
  assert(tokenData.channel != null);

  const startRes = await fetch(`${BASE_URL}/api/session/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bootstrapKey: tokenData.bootstrapKey,
      channel: tokenData.channel,
      uid: tokenData.uid,
      category: '4W',
      language: 'Hinglish',
      buyer: {
        name: 'Vikram Malhotra',
        email: 'vikram.m@example.com',
        phone: '9811122233'
      }
    })
  });
  assert.strictEqual(startRes.status, 200);
  const sessionData = await startRes.json();
  sessionKey = sessionData.sessionKey;
  assert(sessionKey != null);
});

// Helper for tool calls
async function callTool(tool, args) {
  const res = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tool, args })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.strictEqual(data.success, true);
  return data.result;
}

// Step 3: Regression Tool 1 - compare_vehicles
await runRegressionStep('Tool: compare_vehicles (Nexon.ev vs MG Windsor)', async () => {
  const result = await callTool('compare_vehicles', {
    vehicles: ['Tata Nexon.ev', 'MG Windsor EV'],
    presentation: 'comparison'
  });
  assert.strictEqual(result.stage, 'comparison');
  assert(result.vehicles.length >= 2);
  assert(result.vehicles[0].name.includes('Tata') || result.vehicles[0].name.includes('MG'));
});

// Step 4: Regression Tool 2 - calculate_ownership
await runRegressionStep('Tool: calculate_ownership (Running Cost & TCO)', async () => {
  const result = await callTool('calculate_ownership', {
    vehicleName: 'Tata Nexon.ev',
    dailyKm: 45,
    petrolPrice: 104,
    electricityTariff: 8
  });
  assert.strictEqual(result.stage, 'ownership');
  assert(result.results.annualSavings > 0);
  assert(result.results.annualRunningEv < result.results.annualRunningFuel);
});

// Step 5: Regression Tool 3 - find_nearby_chargers (Privacy Permission Flow)
await runRegressionStep('Tool: find_nearby_chargers (Explicit Location Consent Handshake)', async () => {
  // Check 1: Without consent -> location-permission prompt
  const unconsented = await callTool('find_nearby_chargers', {});
  assert.strictEqual(unconsented.stage, 'location-permission');
  assert.strictEqual(unconsented.permissionNeeded, true);

  // Check 2: Save explicit user consent
  const contextRes = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/context`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      location: { lat: 19.076, lng: 72.8777, label: 'Mumbai', consented: true }
    })
  });
  assert.strictEqual(contextRes.status, 200);

  // Check 3: With consent -> charging map executes
  const consented = await callTool('find_nearby_chargers', {});
  assert.strictEqual(consented.stage, 'charging-map');
});

// Step 6: Regression Tool 4 - book_test_drive
let openSlot = null;
await runRegressionStep('Tool: book_test_drive (Slots & Scheduling)', async () => {
  const slotsResult = await callTool('book_test_drive', {});
  assert.strictEqual(slotsResult.stage, 'booking-slots');
  assert(slotsResult.slots.length > 0);
  openSlot = slotsResult.slots[0].label;

  const bookResult = await callTool('book_test_drive', { slot: openSlot });
  assert.strictEqual(bookResult.stage, 'booking-confirmed');
  assert(bookResult.when != null);
});

// Step 7: Regression Tool 5 - capture_lead
await runRegressionStep('Tool: capture_lead (Contact Details Persistence)', async () => {
  const result = await callTool('capture_lead', {
    name: 'Vikram Malhotra',
    phone: '9811122233',
    email: 'vikram.m@example.com'
  });
  assert.strictEqual(result.stage, 'lead-capture');
  assert.strictEqual(result.phase, 'completed');
  assert.strictEqual(result.name, 'Vikram Malhotra');
});

// Step 8: Regression Tool 6 - escalate_to_human
await runRegressionStep('Tool: escalate_to_human (Specialist Live Handover)', async () => {
  const result = await callTool('escalate_to_human', {
    reason: 'Buyer requests commercial fleet discount negotiation'
  });
  assert.strictEqual(result.stage, 'handoff');
  assert(result.handoffCode != null);
  assert(result.consoleUrl != null);
});

// Step 9: Regression Tool 7 - explore_ev_insurance (New Feature Integrity)
await runRegressionStep('Tool: explore_ev_insurance (Multi-Insurer Quotes & Dossier)', async () => {
  const result = await callTool('explore_ev_insurance', {
    vehicle: 'Tata Nexon.ev',
    city: 'Mumbai',
    driverNcb: 20
  });
  assert.strictEqual(result.stage, 'insurance-plans');
  assert(result.dossier.suitabilityAnalysis.protectionMatchScore >= 75);
  assert.strictEqual(result.dossier.regulatoryTpDetails.statutoryRateInr, 19216);
});

// Step 10: Regression Tool 8 - generate_decision_report
await runRegressionStep('Tool: generate_decision_report & PDF Download with Dossier', async () => {
  const result = await callTool('generate_decision_report', {});
  assert.strictEqual(result.stage, 'report-ready');
  assert(result.filename != null);

  const reportDownload = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/report`);
  assert.strictEqual(reportDownload.status, 200);
  const pdfBytes = await reportDownload.arrayBuffer();
  assert(pdfBytes.byteLength > 2000, `PDF size ${pdfBytes.byteLength} bytes is healthy`);
});

console.log('\n==================================================================');
console.log(`🎉 ALL ${passed}/${total} FULL PLATFORM REGRESSION TESTS PASSED 100%!`);
console.log('🛡️ NO EXISTING EASYEV TOOLS OR ENDPOINTS ARE BROKEN.');
console.log('==================================================================\n');
