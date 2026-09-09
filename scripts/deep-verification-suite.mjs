import assert from 'node:assert';
import fs from 'node:fs';
import {
  calculateEVInsuranceEstimate,
  getTailoredInsuranceDossier,
  resolveStatutoryTp,
  classifyVehicle,
  IRDAI_EV_TP_SLABS,
  assessBatteryValueRisk,
  getCityRisk
} from '../easyev-insurance-catalog.mjs';

const BASE_URL = 'http://127.0.0.1:4173';

console.log('==================================================================');
console.log('🚀 RUNNING EXHAUSTIVE DEEP TEST SUITE FOR EV INSURANCE & PLATFORM');
console.log('==================================================================\n');

let passedTests = 0;
let totalTests = 0;

function runTest(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

async function runAsyncTest(name, fn) {
  totalTests++;
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    throw err;
  }
}

// -----------------------------------------------------------------------------
// SECTION 1: STATUTORY IRDAI SLAB VALIDATIONS
// -----------------------------------------------------------------------------
console.log('📦 SECTION 1: STATUTORY IRDAI TP SLAB VERIFICATION');

runTest('IRDAI 4W >65kW (Nexon EV / Ioniq 5 / EV6) statutory TP = ₹19,216 (3-Year)', () => {
  const tp = resolveStatutoryTp({ vehicle: { category: '4W', motorKw: 106.4 } });
  assert.strictEqual(tp.statutoryTpInr, 19216);
  assert.strictEqual(tp.slab.slabId, 'car_above_65kw');
  assert.strictEqual(tp.vehicleClass, 'private_car');
});

runTest('IRDAI 4W 30-65kW (Tiago EV / Punch EV base) statutory TP = ₹8,324 (3-Year)', () => {
  const tp = resolveStatutoryTp({ vehicle: { category: '4W', motorKw: 55 } });
  assert.strictEqual(tp.statutoryTpInr, 8324);
  assert.strictEqual(tp.slab.slabId, 'car_30_to_65kw');
});

runTest('IRDAI 4W <=30kW (MG Comet EV) statutory TP = ₹5,104 (3-Year)', () => {
  const tp = resolveStatutoryTp({ vehicle: { category: '4W', motorKw: 25 } });
  assert.strictEqual(tp.statutoryTpInr, 5104);
  assert.strictEqual(tp.slab.slabId, 'car_sub_30kw');
});

runTest('IRDAI 2W >7kW to <=16kW (Ola S1 Pro / Ultraviolette) statutory TP = ₹4,914 (5-Year)', () => {
  const tp = resolveStatutoryTp({ vehicle: { category: '2W', motorKw: 8.5 } });
  assert.strictEqual(tp.statutoryTpInr, 4914);
  assert.strictEqual(tp.slab.slabId, '2w_7_to_16kw');
  assert.strictEqual(tp.vehicleClass, 'two_wheeler');
});

runTest('IRDAI 2W 3-7kW (Ather 450X / TVS iQube) statutory TP = ₹3,851 (5-Year)', () => {
  const tp = resolveStatutoryTp({ vehicle: { category: '2W', motorKw: 6.2 } });
  assert.strictEqual(tp.statutoryTpInr, 3851);
  assert.strictEqual(tp.slab.slabId, '2w_3_to_7kw');
});

runTest('IRDAI 2W <=3kW (Commuter/moped EVs) statutory TP = ₹2,901 (5-Year)', () => {
  const tp = resolveStatutoryTp({ vehicle: { category: '2W', motorKw: 2.5 } });
  assert.strictEqual(tp.statutoryTpInr, 2901);
  assert.strictEqual(tp.slab.slabId, '2w_sub_3kw');
});

runTest('IRDAI 3W Commercial Passenger Auto statutory TP = ₹4,210 (1-Year)', () => {
  const tp = resolveStatutoryTp({ vehicle: { category: '3W', name: 'Mahindra Treo Passenger Auto' } });
  assert.strictEqual(tp.statutoryTpInr, 4210);
  assert.strictEqual(tp.slab.slabId, '3w_passenger_auto');
  assert.strictEqual(tp.vehicleClass, 'three_wheeler');
});

// -----------------------------------------------------------------------------
// SECTION 2: CITY FLOOD RISK & BATTERY EXPOSURE ASSESSMENT
// -----------------------------------------------------------------------------
console.log('\n📦 SECTION 2: CITY FLOOD RISK & BATTERY EXPOSURE ASSESSMENT');

runTest('Mumbai and Chennai classified as HIGH Flood Risk', () => {
  assert.strictEqual(getCityRisk('Mumbai').risk, 'HIGH');
  assert.strictEqual(getCityRisk('Chennai').risk, 'HIGH');
});

runTest('Bengaluru, Delhi, Kolkata classified as MEDIUM Flood Risk', () => {
  assert.strictEqual(getCityRisk('Bengaluru').risk, 'MEDIUM');
  assert.strictEqual(getCityRisk('Delhi').risk, 'MEDIUM');
  assert.strictEqual(getCityRisk('Kolkata').risk, 'MEDIUM');
});

runTest('Jaipur, Ahmedabad, Hyderabad classified as LOW Flood Risk', () => {
  assert.strictEqual(getCityRisk('Jaipur').risk, 'LOW');
  assert.strictEqual(getCityRisk('Ahmedabad').risk, 'LOW');
  assert.strictEqual(getCityRisk('Hyderabad').risk, 'LOW');
});

runTest('Battery value exposure evaluation classifies high capital risk', () => {
  const risk = assessBatteryValueRisk({ exShowroomPrice: 1899000 });
  assert.strictEqual(risk.category, 'HIGH');
  assert(risk.score >= 70);
});

// -----------------------------------------------------------------------------
// SECTION 3: DETERMINISTIC PRICING ENGINE & DOSSIER GENERATION
// -----------------------------------------------------------------------------
console.log('\n📦 SECTION 3: DETERMINISTIC PRICING ENGINE & DOSSIER GENERATION');

runTest('Tata Nexon.ev in Mumbai (High Flood Risk) calculates complete tailored dossier', () => {
  const dossier = getTailoredInsuranceDossier(
    { name: 'Tata Nexon.ev', exShowroomPrice: 1899000, category: '4W', motorKw: 106.4 },
    'Mumbai',
    18.99
  );
  assert(dossier.engineMetadata != null);
  assert.strictEqual(dossier.regulatoryTpDetails.statutoryRateInr, 19216);
  assert(dossier.pricingEstimate.totalMinInr > 0);
  assert(dossier.pricingEstimate.totalMaxInr > dossier.pricingEstimate.totalMinInr);
  assert.strictEqual(dossier.pricingEstimate.components.statutoryTpInr, 19216);
  assert(dossier.suitabilityAnalysis.coverageGapsIdentified != null);
});

runTest('Ather 450X 2W in Bengaluru (Moderate Risk) dossier', () => {
  const dossier = getTailoredInsuranceDossier(
    { name: 'Ather 450X', category: '2W', motorKw: 6.2 },
    'Bengaluru',
    1.55
  );
  assert.strictEqual(dossier.regulatoryTpDetails.statutoryRateInr, 3851);
  assert.strictEqual(dossier.vehicleSummary.vehicleClass, 'two_wheeler');
});

runTest('Mahindra Treo 3W Auto in Chennai dossier', () => {
  const dossier = getTailoredInsuranceDossier(
    { name: 'Mahindra Treo Plus', category: '3W' },
    'Chennai',
    3.8
  );
  assert.strictEqual(dossier.regulatoryTpDetails.statutoryRateInr, 4210);
  assert.strictEqual(dossier.vehicleSummary.vehicleClass, 'three_wheeler');
});

// -----------------------------------------------------------------------------
// SECTION 4: LIVE REST API & BUYER PASSPORT INTEGRATION (via cURL/fetch)
// -----------------------------------------------------------------------------
console.log('\n📦 SECTION 4: LIVE REST API & BUYER PASSPORT INTEGRATION');

await runAsyncTest('GET /api/session/token -> returns valid token', async () => {
  const res = await fetch(`${BASE_URL}/api/session/token`);
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert(data.bootstrapKey != null);
  assert(data.channel != null);
  assert(data.uid != null);
});

await runAsyncTest('Full End-to-End Session -> Tool -> Passport -> Report PDF flow', async () => {
  // Step A: Token
  const tokenRes = await fetch(`${BASE_URL}/api/session/token`);
  const tokenData = await tokenRes.json();

  // Step B: Start Session
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
        name: 'Aarav Sharma',
        email: 'aarav.sharma@example.com',
        phone: '9876543210'
      }
    })
  });
  assert.strictEqual(startRes.status, 200);
  const sessionData = await startRes.json();
  const sessionKey = sessionData.sessionKey;
  assert(sessionKey != null, 'sessionKey must be present');

  // Step C: Run explore_ev_insurance tool for Nexon.ev
  const toolRes = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'explore_ev_insurance',
      args: {
        vehicle: 'Tata Nexon.ev',
        city: 'Mumbai',
        driverNcb: 20
      }
    })
  });
  assert.strictEqual(toolRes.status, 200);
  const toolOutput = await toolRes.json();
  assert.strictEqual(toolOutput.success, true);
  assert.strictEqual(toolOutput.result.stage, 'insurance-plans');
  assert(toolOutput.result.dossier?.suitabilityAnalysis?.protectionMatchScore >= 75);
  assert.strictEqual(toolOutput.result.dossier?.regulatoryTpDetails?.statutoryRateInr, 19216);

  // Step D: Run explore_ev_insurance tool with custom addOns
  const addOnRes = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'explore_ev_insurance',
      args: {
        vehicle: 'Tata Nexon.ev',
        city: 'Mumbai',
        addOns: ['zero_dep', 'battery_water_ingress', 'wallbox_charger', 'return_to_invoice']
      }
    })
  });
  assert.strictEqual(addOnRes.status, 200);
  const addOnOutput = await addOnRes.json();
  assert.strictEqual(addOnOutput.success, true);
  assert.strictEqual(addOnOutput.result.stage, 'insurance-plans');

  // Step E: Disambiguation Fallback (no vehicle specified)
  const disambigRes = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'explore_ev_insurance',
      args: {
        vehicle: '',
        city: 'Mumbai'
      }
    })
  });
  assert.strictEqual(disambigRes.status, 200);
  const disambigOutput = await disambigRes.json();
  assert.strictEqual(disambigOutput.success, true);
  assert.strictEqual(disambigOutput.result.stage, 'insurance-needs-vehicle');
  assert.strictEqual(disambigOutput.result.status, 'VEHICLE_REQUIRED');

  // Step F: Generate Decision Report PDF with Insurance Dossier attached
  const reportRes = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/tool`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'generate_decision_report',
      args: {}
    })
  });
  assert.strictEqual(reportRes.status, 200);
  const reportOutput = await reportRes.json();
  assert.strictEqual(reportOutput.success, true);
  assert.strictEqual(reportOutput.result.stage, 'report-ready');
  assert(reportOutput.result.filename != null);

  // Step G: Verify PDF binary download via session report endpoint
  const pdfRes = await fetch(`${BASE_URL}/api/sessions/${sessionKey}/report`);
  assert.strictEqual(pdfRes.status, 200);
  const pdfBytes = await pdfRes.arrayBuffer();
  assert(pdfBytes.byteLength > 2000, `PDF must have substantial length, got ${pdfBytes.byteLength} bytes`);
});

// -----------------------------------------------------------------------------
// SECTION 5: FRONTEND HTML & CONTROLLER INTEGRITY
// -----------------------------------------------------------------------------
console.log('\n📦 SECTION 5: FRONTEND HTML & CONTROLLER INTEGRITY');

runTest('index.html defines InsuranceStageController with all interactive handlers', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  
  // Controller Definition
  assert(html.includes('window.InsuranceStageController = {'), 'Must define window.InsuranceStageController');
  assert(html.includes('setSort:'), 'Must have setSort');
  assert(html.includes('setFilterTier:'), 'Must have setFilterTier');
  assert(html.includes('toggleRider:'), 'Must have toggleRider');
  assert(html.includes('selectPlan:'), 'Must have selectPlan');
  assert(html.includes('openCompareModal:'), 'Must have openCompareModal');
  assert(html.includes('closeCompareModal:'), 'Must have closeCompareModal');
  
  // Stage Rendering & Passport Sync
  assert(html.includes("type === 'insurance-plans'"), 'Must handle insurance-plans stage rendering');
  assert(html.includes('state.decisionPassport.insurance'), 'Must sync with state.decisionPassport.insurance');
  assert(html.includes('Protection Score'), 'Must display Protection Score');
  assert(html.includes('Battery & Flood Shield'), 'Must display Battery & Flood Shield');
  assert(html.includes('pb-plan-card'), 'Must have Policybazaar-style plan cards');
  assert(html.includes('pb-matrix-table'), 'Must have comparison matrix table');
});

console.log('\n==================================================================');
console.log(`🎉 ALL ${passedTests}/${totalTests} DEEP TEST CASES PASSED WITH 100% SUCCESS!`);
console.log('==================================================================\n');
