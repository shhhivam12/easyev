import { normalizeEntities } from '../dealer-voice-agent.mjs';

const res = normalizeEntities('All 7 Days open rehta hai', {}, 'workingDays', 2);
console.log('Result of normalizeEntities:', res);
