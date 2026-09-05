import { dealerVoiceAgentManager } from '../dealer-voice-agent.mjs';

const session = dealerVoiceAgentManager.createSession({ language: 'Hinglish' });
console.log('Turn 0:', session.getInitialGreeting().targetField);

const turns = [
  'Mera showroom name hai Shakti Motors EV Hub',
  'Owner name is Rajesh Sharma',
  'Mobile number 9811223344',
  'Official email is sales at the rate shaktiev dot com',
  'New Delhi',
  'Haan agle step par chalo',
  'Plot 42, Okhla Phase 3 Industrial Area',
  'Pincode 110020',
  'All 7 Days open rehta hai'
];

for (let i = 0; i < turns.length; i++) {
  const res = await session.processTurn({ text: turns[i] });
  console.log(`Turn ${i+1} ("${turns[i]}") -> filledCount: ${res.completionStats.filledCount}, extracted:`, Object.keys(res.extractedFields), 'state values:', Object.keys(res.currentForm).filter(k => session.stateMachine.fields[k].source !== 'none' && session.stateMachine.fields[k].source !== 'default'));
}
