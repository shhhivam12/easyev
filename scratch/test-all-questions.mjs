import {
  DealerAgentSession,
  isAffirmative,
  isNegative,
  normalizeEntities,
  extractEmailFromUtterance,
  DealerFormStateMachine
} from '../dealer-voice-agent.mjs';

const testCases = [
  // 1. Shop name with haan variations
  { step: 1, field: 'shopName', utterances: [
    'haa hamare showroom ka naam Tata EV Hub hai',
    'haa Shakti Motors daldo',
    'haa Shakti Motors kardo',
    'haan Shakti Motors',
    'haa showroom ka naam shakti motors hai',
    'haan bhai Shakti Motors likh do'
  ]},
  // 2. Manager name with haan variations
  { step: 1, field: 'managerName', utterances: [
    'haa mera naam Satvik Kesarwani hai',
    'haa Satvik Kesarwani daldo',
    'haa Satvik Kesarwani kardo',
    'haan Satvik Kesarwani',
    'haa manager Satvik Kesarwani hai'
  ]},
  // 3. City with haan variations
  { step: 1, field: 'city', utterances: [
    'haa Delhi me hai',
    'haa Delhi daldo',
    'haa Delhi kardo',
    'haan New Delhi',
    'haa Pune',
    'haa Mumbai'
  ]},
  // 4. Address with haan variations
  { step: 2, field: 'address', utterances: [
    'haa Plot 10 South Extension',
    'haa address Plot 10 Ring Road daldo',
    'haan MG Road Sector 62 kardo'
  ]},
  // 5. Brands with haan variations
  { step: 3, field: 'brands', utterances: [
    'haa Tata Motors aur Mahindra',
    'haa Tata Motors daldo',
    'haa Tata Motors kardo',
    'haa sabhi brands',
    'haa all brands',
    'haa Tata aur Ather available hai',
    'haa sab brand daldo',
    'haa sabhi available hai'
  ]},
  // 6. EMI with affirmative variations
  { step: 4, field: 'emiAvailable', utterances: [
    'haa kardo',
    'haa daldo',
    'haa available hai',
    'haa sahi hai',
    'haa dete hai',
    'haa provide karte hai',
    'haa dono dete hai',
    'haa sab dete hai',
    'haa bhai',
    'haa hota hai',
    'bilkul dete hai',
    'yes do it',
    'yes add it'
  ]},
  // 7. Test drive with affirmative variations
  { step: 4, field: 'showroomTestDrive', utterances: [
    'haa kardo',
    'haa daldo',
    'haa available hai',
    'haa sahi hai',
    'haa dete hai',
    'haa karwate hai',
    'haa dono',
    'haa showroom aur doorstep dono',
    'haa bhai',
    'yes do it'
  ]}
];

console.log('Testing extraction across question variations...');
for (const tc of testCases) {
  console.log(`\n--- Testing ${tc.field} (Step ${tc.step}) ---`);
  for (const utt of tc.utterances) {
    const extracted = normalizeEntities(utt, {}, tc.field, tc.step);
    console.log(`Utterance: "${utt}" -> extracted[${tc.field}]:`, extracted[tc.field] || 'FAILED / EMPTY');
  }
}
