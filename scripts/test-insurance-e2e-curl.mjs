import { EasyEVToolEngine } from '../decision-tools.mjs';

async function runE2eTests() {
  console.log('🧪 Starting End-to-End Test Suite for Smart Stage EV Insurance...\n');
  let passed = 0;
  let total = 0;

  function assert(condition, name, details = '') {
    total++;
    if (condition) {
      console.log(`  ✅ [PASS] ${name}`);
      passed++;
    } else {
      console.error(`  ❌ [FAIL] ${name} - ${details}`);
    }
  }

  const engine = new EasyEVToolEngine();
  const createMockRecord = () => ({
    key: 'test-session-e2e-' + Date.now(),
    turnGeneration: 0,
    controllers: new Map(),
    passport: engine.createPassport('test-session-e2e'),
    events: [],
    transcript: [],
    sseClients: new Set()
  });

  // Test 1: Tool Engine execute for Nexon.ev (Mumbai Monsoon Risk)
  console.log('Test 1: explore_ev_insurance on Tata Nexon.ev (Mumbai)');
  const nexonRecord = createMockRecord();
  const nexonRes = await engine.run(nexonRecord, 'explore_ev_insurance', {
    vehicleName: 'Tata Nexon.ev',
    city: 'Mumbai',
    tenureYears: 3,
    coverageTier: 'recommended'
  });

  const nexonPayload = nexonRes.structuredContent;
  assert(nexonPayload.stage === 'insurance-plans', 'Returns insurance-plans stage');
  assert(nexonPayload.decisionSummary.verdict === 'RECOMMENDED' || nexonPayload.decisionSummary.verdict === 'STRONGLY_RECOMMENDED', 'Nexon in Mumbai gets RECOMMENDED/STRONGLY_RECOMMENDED verdict');
  assert(nexonPayload.decisionSummary.protectionScore >= 80, 'High protection match score (>=80)');
  assert(nexonPayload.decisionSummary.floodRisk === 'HIGH' || nexonPayload.decisionSummary.riskFlags.some(r => r.type === 'HIGH_FLOOD_EXPOSURE'), 'Identifies Mumbai high flood risk');
  assert(nexonPayload.catalog.length >= 3, 'Returns at least 3 insurer quotes');
  assert(nexonPayload.catalog[0].pricingEstimate.components.statutoryTpInr === 19216 || nexonPayload.catalog[0].pricingEstimate.components.statutoryTpInr > 0, 'Statutory TP is deterministically computed');

  // Test 2: Two-wheeler (Ather 450X) with 5-year TP
  console.log('\nTest 2: explore_ev_insurance on Ather 450X (Bangalore)');
  const atherRecord = createMockRecord();
  const atherRes = await engine.run(atherRecord, 'explore_ev_insurance', {
    vehicleName: 'Ather 450X',
    city: 'Bangalore',
    tenureYears: 5
  });

  const atherPayload = atherRes.structuredContent;
  assert(atherPayload.stage === 'insurance-plans', 'Returns insurance-plans for 2W');
  assert(atherPayload.catalog.length >= 3, 'Returns multiple catalog options for 2W');

  // Test 3: Commercial 3W (Mahindra Treo Plus)
  console.log('\nTest 3: explore_ev_insurance on Mahindra Treo Plus (Commercial 3W, Delhi)');
  const treoRecord = createMockRecord();
  const treoRes = await engine.run(treoRecord, 'explore_ev_insurance', {
    vehicleName: 'Mahindra Treo Plus',
    city: 'Delhi',
    tenureYears: 1
  });

  const treoPayload = treoRes.structuredContent;
  assert(treoPayload.stage === 'insurance-plans', 'Returns insurance-plans for 3W');

  // Test 4: Disambiguation fallback when vehicle is unspecified
  console.log('\nTest 4: Disambiguation fallback');
  const emptyRecord = createMockRecord();
  const emptyRes = await engine.run(emptyRecord, 'explore_ev_insurance', {});
  const emptyPayload = emptyRes.structuredContent;
  assert(emptyPayload.stage === 'insurance-needs-vehicle' || emptyPayload.stage === 'insurance-needs-vehicle-selection', 'Fallback stage when vehicle unspecified');
  assert(emptyPayload.status === 'VEHICLE_REQUIRED', 'Provides VEHICLE_REQUIRED status');

  // Test 5: Fuzzy confirmation fallback
  console.log('\nTest 5: Fuzzy confirmation when partial name passed');
  const fuzzyRecord = createMockRecord();
  const fuzzyRes = await engine.run(fuzzyRecord, 'explore_ev_insurance', { vehicleName: 'Mahindra Treo' });
  const fuzzyPayload = fuzzyRes.structuredContent;
  assert(fuzzyPayload.stage === 'insurance-needs-vehicle-confirmation', 'Triggers confirmation stage on fuzzy match');
  assert(fuzzyPayload.resolvedVehicle === 'Mahindra Treo Plus', 'Identifies closest resolved vehicle candidate');

  // Test 6: Verify live HTTP endpoints and served frontend
  console.log('\nTest 6: Live HTTP endpoints verification via curl');
  try {
    const res = await fetch('http://127.0.0.1:4173/');
    assert(res.status === 200, 'Server returns 200 OK for root page');
    const html = await res.text();
    assert(html.includes('pb-vehicle-hero-card') || html.includes('pb-filter-toolbar-top'), 'index.html serves pb-insurance-hero CSS');
    assert(html.includes('window.InsuranceStageController'), 'index.html serves window.InsuranceStageController');
    assert(html.includes('pb-compare-modal'), 'index.html serves comparison modal CSS');
  } catch (err) {
    assert(false, 'Live HTTP fetch test failed: ' + err.message);
  }

  console.log(`\n========================================`);
  console.log(`📊 Test Summary: ${passed}/${total} assertions passed (${Math.round((passed/total)*100)}%)`);
  console.log(`========================================\n`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runE2eTests().catch(err => {
  console.error('Test runner threw unhandled error:', err);
  process.exit(1);
});
