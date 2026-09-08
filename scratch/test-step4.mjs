import {
  DealerAgentSession,
  isAffirmative,
  isNegative,
  normalizeEntities,
  extractEmailFromUtterance,
  transliterateDevanagari,
  DealerFormStateMachine
} from '../dealer-voice-agent.mjs';

console.log('=== Test 1: Affirmative & Negative Classifier ===');
const affCases = [
  'haa', 'haan', 'ha', 'haanji', 'haaji', 'han', 'yes', 'bilkul', 'theek hai',
  'karwate hain', 'karate hain', 'karte hain', 'dete hain', 'available hai',
  'sab hai', 'dono hai', 'haan test drive dete hain', 'haa test drive karate hai',
  'das bar bol diya haan', 'kitni baar bolu haan', 'haan bol to raha hu', 'haan bola na',
  'are haan bhai', 'mai bolta hu haa to nai samajhta', 'हाँ', 'हां', 'जी हाँ', 'हा'
];
let affPass = 0;
for (const phrase of affCases) {
  const res = isAffirmative(phrase);
  if (!res) {
    console.error(`FAIL isAffirmative("${phrase}") -> false`);
  } else {
    affPass++;
  }
}
console.log(`Affirmative tests: ${affPass}/${affCases.length} passed`);

console.log('\n=== Test 2: Spoken Email Extraction ===');
const emailCases = [
  { input: 'satvik at the rate gmail dot com', expected: 'satvik@gmail.com' },
  { input: 'satvik kesarwani at the rate gmail.com', expected: 'satvikkesarwani@gmail.com' },
  { input: 'satvik.kesarwani at the rate gmail.com', expected: 'satvik.kesarwani@gmail.com' },
  { input: 'mera email satvik123 at the rate gmail dot com hai', expected: 'satvik123@gmail.com' },
  { input: 'official email id is sales at the rate dealership dot in', expected: 'sales@dealership.in' },
  { input: 'contact at the rate evhub dot co dot in', expected: 'contact@evhub.co.in' },
  { input: 'satvik atthedate gmail.com', expected: 'satvik@gmail.com' },
  { input: 'satvik enter rate gmail.com', expected: 'satvik@gmail.com' },
  { input: 'satvik add the rate gmail.com', expected: 'satvik@gmail.com' },
  { input: 'सात्विक एट द रेट जीमेल डॉट कॉम', expected: 'satvik@gmail.com' }
];

let emailPass = 0;
for (const tc of emailCases) {
  const extracted = extractEmailFromUtterance(tc.input);
  if (extracted !== tc.expected) {
    console.error(`FAIL extractEmail("${tc.input}") -> got "${extracted}", expected "${tc.expected}"`);
  } else {
    emailPass++;
  }
}
console.log(`Email tests: ${emailPass}/${emailCases.length} passed`);

console.log('\n=== Test 3: Step 4 Voice Conversation Flow ===');
const session = new DealerAgentSession({
  language: 'Hinglish',
  initialValues: {
    shopName: 'Shree Ram EV',
    managerName: 'Satvik Kesarwani',
    phone: '9876543210',
    email: 'satvik@gmail.com',
    city: 'New Delhi',
    address: 'Plot 10 South Ext',
    pincode: '110049',
    brands: ['Tata Motors']
  },
  currentStep: 4
});

console.log('Target Field at start of Step 4:', session.stateMachine.currentTargetField);

// Step 4 Turn 1: User says "haa" to EMI/Insurance
const t1 = await session.processTurn({ text: 'haa' });
console.log('Turn 1 (after "haa" to EMI):', {
  action: t1.action,
  targetField: t1.targetField,
  speechText: t1.speechText,
  extracted: t1.extractedFields,
  isSubmitted: t1.isSubmitted
});

// Step 4 Turn 2: User says "haa" to Test Drive (or Final Submit)
const t2 = await session.processTurn({ text: 'haa' });
console.log('Turn 2 (after "haa" to Test Drive / Submit):', {
  action: t2.action,
  targetField: t2.targetField,
  speechText: t2.speechText,
  extracted: t2.extractedFields,
  isSubmitted: t2.isSubmitted,
  partnerId: t2.partnerId
});

if (t2.isSubmitted || t2.action === 'COMPLETE' || t2.action === 'SUBMIT_SUCCESS') {
  console.log('Step 4 test PASSED! Successful completion / submission.');
}
