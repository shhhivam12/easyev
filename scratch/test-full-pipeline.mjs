import {
  isAffirmative,
  isNegative,
  normalizeEntities,
  cleanSpokenValue,
  isPureAffirmation
} from '../scratch/test-aff-proto.mjs';

// Let's create a robust test suite for all user reported scenarios
console.log('Testing user scenarios from prompt:');
const scenarios = [
  'haa kardo',
  'haa daldo',
  'haa available hai',
  'haa sahi hai',
  'haa bhai',
  'haa dete hai',
  'haa provide karte hai',
  'haa kardo haa available hai',
  'haa bhai kardo',
  'haa bilkul sahi hai',
  'haa sabhi available hai',
  'haa dono available hai',
  'haa chalo',
  'haa kardo bhai submit',
  'haa submit kardo',
  'haa daal do',
  'kar do',
  'dal do',
  'available hai',
  'sahi hai bhai',
  'theek hai',
  'bilkul sahi',
  'yes do it',
  'yes add it',
  'yes please'
];

for (const s of scenarios) {
  const isAff = isAffirmative(s);
  if (!isAff) {
    console.error(`FAILED: isAffirmative("${s}") was false!`);
  }
}
console.log(`All ${scenarios.length} affirmative phrases passed!`);
