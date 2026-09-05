import { normalizeEntities } from '../dealer-voice-agent.mjs';

const currentForm = {
  shopName: 'Shakti Motors EV Hub',
  managerName: 'Rajesh Sharma',
  phone: '9811223344',
  email: 'sales@shaktiev.com',
  city: 'New Delhi',
  address: 'Plot 42, Okhla Phase 3 Industrial Area',
  pincode: '110020'
};

const res = normalizeEntities('All 7 Days open rehta hai', currentForm, 'workingDays', 2);
console.log('Result with currentForm:', res);
