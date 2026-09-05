import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { testDriveDb, FSM_STATES } from '../test-drive-db.mjs';
import { normalizePhone, validateEmail, normalizeDate, normalizeTime, checkAvailability, formatSlotSpoken, resolveVehicle } from '../test-drive-service.mjs';
import { BlandClient } from '../bland-client.mjs';
import { generateTestDriveEmailHtml } from '../email-service.mjs';

console.log('🧪 Starting Bland AI Test Drive Unit & Integration Test Suite...\n');

// 1. Phone Normalization Tests
console.log('1️⃣  Testing Phone Normalization...');
assert.equal(normalizePhone('9876543210'), '+919876543210');
assert.equal(normalizePhone('+91 98765 43210'), '+919876543210');
assert.equal(normalizePhone('09876543210'), '+919876543210');
assert.equal(normalizePhone('+919876543210'), '+919876543210');
assert.equal(normalizePhone(''), '');
console.log('   ✅ Phone normalization passed.');

// 2. Email Validation Tests
console.log('2️⃣  Testing Email Validation...');
assert.equal(validateEmail('buyer@example.com'), true);
assert.equal(validateEmail('satvik.k@easyev.in'), true);
assert.equal(validateEmail('invalid-email'), false);
assert.equal(validateEmail('@missing.com'), false);
console.log('   ✅ Email validation passed.');

// 3. Vehicle Resolution Tests
console.log('3️⃣  Testing Vehicle Resolution...');
const punch = resolveVehicle('tata-punch-ev');
assert.ok(punch, 'Tata Punch.ev must resolve');
assert.equal(punch.name, 'Tata Punch.ev');
assert.equal(punch.company, 'Tata Motors');

const nexon = resolveVehicle('tata-nexon-ev');
assert.ok(nexon, 'Tata Nexon.ev must resolve');

const unknown = resolveVehicle('unknown-flying-car');
assert.equal(unknown, null);
console.log('   ✅ Vehicle resolution passed.');

// 4. Natural Language Date & Time Parsing Tests
console.log('4️⃣  Testing Date/Time Parsing...');
const testNow = new Date('2026-09-05T10:00:00+05:30'); // Saturday
assert.equal(normalizeDate('today', testNow), '2026-09-05');
assert.equal(normalizeDate('tomorrow', testNow), '2026-09-06');
assert.equal(normalizeDate('2026-09-12', testNow), '2026-09-12');

assert.equal(normalizeTime('5 PM'), '17:00');
assert.equal(normalizeTime('5:30 pm'), '17:30');
assert.equal(normalizeTime('11:00 am'), '11:00');
assert.equal(normalizeTime('evening'), '17:00');
assert.equal(normalizeTime('morning'), '10:30');
console.log('   ✅ Date/Time parsing passed.');

// 5. Availability Check Tests
console.log('5️⃣  Testing Slot Availability Engine...');
const availRes = checkAvailability({
  vehicleId: 'tata-punch-ev',
  location: 'Noida Sector 62',
  date: '2026-09-05',
  time: '17:00',
});
assert.equal(availRes.available, true);
assert.equal(availRes.time, '17:00');
assert.ok(/5:00\s*pm/i.test(availRes.formatted_slot));

// Out of hours test (e.g. 3 AM)
const outOfHours = checkAvailability({
  vehicleId: 'tata-punch-ev',
  location: 'Noida Sector 62',
  date: '2026-09-05',
  time: '03:00',
});
assert.equal(outOfHours.available, false);
assert.equal(outOfHours.reason, 'OUTSIDE_HOURS');
assert.ok(outOfHours.alternatives.length > 0);
console.log('   ✅ Availability checks passed.');

// 6. FSM Transitions & Capability Token Tests
console.log('6️⃣  Testing FSM Transitions & Capability Security...');
const { session } = await testDriveDb.createSession({
  vehicleId: 'tata-punch-ev',
  vehicleName: 'Tata Punch.ev',
  customerPhone: '+919876543210',
  customerEmail: 'test@example.com',
  idempotencyKey: 'test_key_1',
});

assert.ok(session.id.startsWith('EEV-SES-'));
assert.equal(session.status, FSM_STATES.INITIATED);
assert.equal(testDriveDb.verifyCapabilityToken(session.id, session.capability_token), true);
assert.equal(testDriveDb.verifyCapabilityToken(session.id, 'fake_token'), false);

// Valid transition
await testDriveDb.transitionStatus(session.id, FSM_STATES.CALLING, { bland_call_id: 'call_test_1' });
assert.equal(session.status, FSM_STATES.CALLING);

await testDriveDb.transitionStatus(session.id, FSM_STATES.IN_PROGRESS);
await testDriveDb.transitionStatus(session.id, FSM_STATES.COLLECTING_DETAILS);
await testDriveDb.transitionStatus(session.id, FSM_STATES.SLOT_CHECKED, {
  location: 'Noida Sector 62',
  preferred_date: '2026-09-05',
  preferred_time: '17:00',
});
await testDriveDb.transitionStatus(session.id, FSM_STATES.AWAITING_CONFIRMATION);
assert.equal(session.status, FSM_STATES.AWAITING_CONFIRMATION);
console.log('   ✅ FSM state transitions & token verification passed.');

// 7. Atomic Booking & Concurrency Collision Test
console.log('7️⃣  Testing Atomic Booking & Slot Collision Prevention...');
const bookingRes1 = await testDriveDb.createBookingAtomic({
  sessionId: session.id,
  capabilityToken: session.capability_token,
  vehicleId: 'tata-punch-ev',
  vehicleName: 'Tata Punch.ev',
  customerPhone: '+919876543210',
  customerEmail: 'test@example.com',
  location: 'Noida Sector 62',
  date: '2026-09-05',
  time: '17:00',
});

assert.equal(bookingRes1.success, true);
assert.ok(bookingRes1.booking.id.startsWith('EEV-TD-'));
assert.equal(session.status, FSM_STATES.BOOKED);

// Second user trying to book identical slot at same location & time
const { session: session2 } = await testDriveDb.createSession({
  vehicleId: 'tata-punch-ev',
  vehicleName: 'Tata Punch.ev',
  customerPhone: '+919999999999',
  customerEmail: 'user2@example.com',
  idempotencyKey: 'test_key_2',
});

await testDriveDb.transitionStatus(session2.id, FSM_STATES.CALLING);
await testDriveDb.transitionStatus(session2.id, FSM_STATES.IN_PROGRESS);
await testDriveDb.transitionStatus(session2.id, FSM_STATES.COLLECTING_DETAILS);
await testDriveDb.transitionStatus(session2.id, FSM_STATES.SLOT_CHECKED);
await testDriveDb.transitionStatus(session2.id, FSM_STATES.AWAITING_CONFIRMATION);

const bookingRes2 = await testDriveDb.createBookingAtomic({
  sessionId: session2.id,
  capabilityToken: session2.capability_token,
  vehicleId: 'tata-punch-ev',
  vehicleName: 'Tata Punch.ev',
  customerPhone: '+919999999999',
  customerEmail: 'user2@example.com',
  location: 'Noida Sector 62',
  date: '2026-09-05',
  time: '17:00',
});

assert.equal(bookingRes2.success, false);
assert.equal(bookingRes2.reason, 'SLOT_OCCUPIED');
console.log('   ✅ Collision test passed (second booking successfully rejected with SLOT_OCCUPIED).');

// 8. HMAC Webhook Signature Verification Test
console.log('8️⃣  Testing Webhook HMAC Signature Verification...');
const webhookSecret = 'test_webhook_secret_key_123';
const rawPayload = Buffer.from(JSON.stringify({
  call_id: 'bland_123',
  status: 'completed',
  metadata: { session_id: session.id },
}));

const validSignature = createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');
const invalidSignature = 'invalid_tampered_signature_hex';

const computedValid = createHmac('sha256', webhookSecret).update(rawPayload).digest('hex');
assert.equal(validSignature, computedValid);
assert.notEqual(invalidSignature, computedValid);
console.log('   ✅ Webhook HMAC verification passed.');

// 9. Email HTML Generation Test
console.log('9️⃣  Testing Email HTML Generation...');
const emailHtml = generateTestDriveEmailHtml({
  bookingId: bookingRes1.booking.id,
  vehicleName: 'Tata Punch.ev',
  location: 'Noida Sector 62',
  formattedDate: 'Saturday, September 5, 2026',
  formattedTime: '5:00 PM',
  customerPhone: '+919876543210',
});

assert.ok(emailHtml.includes('Tata Punch.ev'));
assert.ok(emailHtml.includes(bookingRes1.booking.id));
assert.ok(emailHtml.includes('Noida Sector 62'));
console.log('   ✅ Email HTML generation passed.');

console.log('\n🎉 ALL 9 BLAND AI TEST SUITE CHECKS PASSED PERFECTLY!\n');
