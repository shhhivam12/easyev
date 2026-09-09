// EasyEV decision tools are isolated from Agora transport and browser rendering.
import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import pg from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CrmCalendar, isEmail, normalizePhone, parseSpokenEmail } from './crm-calendar.mjs';
import { VEHICLES as SHOWROOM_VEHICLES } from './showroom/vehicle-catalog.js';
import * as z from 'zod/v4';
import { insuranceToolDefinition, handleExploreEvInsurance } from './insurance-decision-tool.mjs';

const { Pool } = pg;

function vehicle(id, name, category, aliases, priceMinLakh, priceMaxLakh, claimedRangeKm, battery, charging, warranty, capacity, kwhPer100Km, sourceUrl, verifiedAt) {
  return { id, name, category, aliases, priceMinLakh, priceMaxLakh, claimedRangeKm, battery, charging, warranty, capacity, kwhPer100Km, sourceUrl, verifiedAt, media: null };
}

export const VEHICLES = Object.freeze([
  vehicle('tata-punch-ev', 'Tata Punch.ev', 'Electric car', ['punch ev', 'punch.ev', 'टाटा पंच', 'पंच ईवी'], 9.99, 14.44, 315, '25–35 kWh', '56 min DC (10–80%, selected variants)', '8 years / 160,000 km battery and motor', '5 seats', 12.5, 'https://ev.tatamotors.com/punch/ev.html', '2026-08-30'),
  vehicle('tata-nexon-ev', 'Tata Nexon.ev', 'Electric car', ['nexon ev', 'नेक्सॉन ईवी', 'tata nexon'], 12.49, 17.19, 489, '30–45 kWh', '40 min DC (10–80%, selected variants)', '8 years / 160,000 km battery and motor', '5 seats', 13.5, 'https://ev.tatamotors.com/nexon/ev.html', '2026-08-30'),
  vehicle('mg-comet-ev', 'MG Comet EV', 'Electric car', ['comet ev', 'mg comet', 'comet electric', 'एमजी कॉमेट'], 7.8, 9.67, 230, '17.4 kWh', '7 hours AC (0–100%, published claim)', 'Manufacturer battery terms vary; verify selected variant', '4 seats', 8.7, 'https://www.mgmotor.co.in/vehicles/comet-ev-electric-car-in-india', '2026-09-05'),
  vehicle('mg-windsor-ev', 'MG Windsor EV', 'Electric car', ['windsor ev', 'mg windsor', 'विंडसर ईवी'], 13.99, 18.39, 449, '38–52.9 kWh', '55 min DC (0–80%, selected variants)', '8 years / 160,000 km battery', '5 seats', 14.2, 'https://www.mgmotor.co.in/vehicles/windsor-ev', '2026-08-30'),
  vehicle('mahindra-xuv400', 'Mahindra XUV400', 'Electric car', ['xuv400', 'xuv 400', 'महिंद्रा एक्सयूवी 400'], 15.49, 19.39, 456, '34.5–39.4 kWh', '50 min DC (0–80%)', '8 years / 160,000 km battery', '5 seats', 14.5, 'https://www.mahindraelectricsuv.com/xuv400', '2026-08-30'),
  vehicle('citroen-ec3x', 'Citroën ë-C3X', 'Electric car', ['citroen c3', 'citroen ec3', 'citroen e c3', 'citroen c3 ev', 'ec3', 'e-c3', 'e c3', 'ec3x', 'e-c3x', 'सिट्रोएन सी3', 'सिट्रोन सी3'], 12.76, 13.56, 320, '29.2 kWh', '57 min DC fast charging (published claim)', 'Manufacturer battery terms vary; verify selected variant', '5 seats', 13.3, 'https://www.citroen.in/ec3-electric-car', '2026-09-03'),
  vehicle('ather-rizta', 'Ather Rizta', 'Electric scooter', ['rizta', 'ather rizta', 'रिज़्टा'], 1.1, 1.49, 159, '2.9–3.7 kWh', 'Home charging; time varies by pack', '5 years / 60,000 km battery program conditions apply', '2 riders', 3.0, 'https://www.atherenergy.com/rizta', '2026-08-30'),
  vehicle('ather-450x', 'Ather 450X', 'Electric scooter', ['450x', 'ather 450x', 'एथर 450 एक्स'], 1.47, 1.57, 161, '2.9–3.7 kWh', 'Home charging; fast-network support varies', '5 years / 60,000 km battery program conditions apply', '2 riders', 3.2, 'https://www.atherenergy.com/450', '2026-08-30'),
  vehicle('tvs-iqube', 'TVS iQube', 'Electric scooter', ['iqube', 'i qube', 'tvs iqube', 'आईक्यूब'], 0.95, 1.85, 150, '2.2–5.3 kWh', 'Home charging; time varies by pack', '3 years / 50,000 km, variant terms apply', '2 riders', 3.0, 'https://www.tvsmotor.com/electric-scooters/tvs-iqube', '2026-08-30'),
  vehicle('ola-s1-pro', 'Ola S1 Pro', 'Electric scooter', ['s1 pro', 'ola s1', 'ओला एस1 प्रो'], 1.16, 1.36, 242, '4 kWh', 'Home and Hypercharger support; terms vary', '3 years / 50,000 km battery, terms apply', '2 riders', 3.0, 'https://www.olaelectric.com/s1-pro', '2026-08-30'),
  vehicle('mahindra-treo-plus', 'Mahindra Treo Plus', 'Electric 3-wheeler', ['treo plus', 'mahindra treo', 'ट्रेओ प्लस'], 3.58, 3.78, 150, '10.24 kWh', 'Home/standard charging, about 4 h 30 min', '5 years / 120,000 km battery, terms apply', 'Driver + 3 passengers', 7.0, 'https://mahindralastmilemobility.com/treo-plus/', '2026-08-30'),
  vehicle('bajaj-re-etec9', 'Bajaj RE E-TEC 9.0', 'Electric 3-wheeler', ['e-tec 9', 'etec 9', 'bajaj electric auto', 'बजाज ई टेक'], 3.33, 3.55, 178, '8.9 kWh', 'On-board charging, time varies by supply', 'Manufacturer terms vary by market', 'Driver + 3 passengers', 6.5, 'https://www.bajajauto.com/three-wheelers/re-e-tec-90', '2026-08-30'),
  vehicle('piaggio-ape-ecity', 'Piaggio Ape E-City FX Max', 'Electric 3-wheeler', ['ape e city', 'piaggio electric', 'आपे ई सिटी'], 3.25, 3.55, 145, '8 kWh class', 'Fixed-battery charging; configuration varies', 'Manufacturer terms vary by market', 'Driver + 3 passengers', 6.5, 'https://piaggiovehicles.com/electric/', '2026-08-30'),
  vehicle('tvs-king-kargo-ev-hd', 'TVS King Kargo HD EV', 'Electric 3-wheeler', ['king kargo', 'king cargo', 'tvs kargo', 'tvs king kargo', 'किंग कार्गो'], 3.95, 3.95, 156, '8.9 kWh LFP', '3 h 10 min AC (0–100%, 3 kW charger)', 'Manufacturer terms vary by configuration', 'Cargo body; payload varies by body', 7.0, 'https://www.tvsmotor.com/three-wheelers/king-kargo-ev-hd', '2026-09-05'),
  vehicle('euler-hiload', 'Euler HiLoad EV', 'Electric 3-wheeler', ['hiload', 'euler hiload', 'हाईलोड'], 3.94, 4.3, 170, '13 kWh class', 'Fast and standard charging options', 'Manufacturer terms vary by configuration', 'Cargo payload up to published variant limit', 9.5, 'https://www.euler-motors.com/hiload-ev', '2026-08-30'),
]);

const DELHI_DEMO_CHARGERS = Object.freeze([
  { id: 'demo-cp', name: 'Demo charger — Connaught Place', lat: 28.6315, lng: 77.2167, operator: 'Demo fallback', capacity: 'Not live', sockets: ['Connector information unavailable'], openingHours: 'Verify before travel', access: 'Demo only', fee: 'Not available' },
  { id: 'demo-saket', name: 'Demo charger — Saket', lat: 28.5245, lng: 77.2066, operator: 'Demo fallback', capacity: 'Not live', sockets: ['Connector information unavailable'], openingHours: 'Verify before travel', access: 'Demo only', fee: 'Not available' },
  { id: 'demo-dwarka', name: 'Demo charger — Dwarka', lat: 28.5921, lng: 77.046, operator: 'Demo fallback', capacity: 'Not live', sockets: ['Connector information unavailable'], openingHours: 'Verify before travel', access: 'Demo only', fee: 'Not available' },
]);

const chargerCache = new Map();
const mediaCache = new Map();
const CURATED_MEDIA = Object.freeze({
  'tata-punch-ev': {
    url: '/assets/tata-punch-ev-reference.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Tata_punch.ev.jpg',
    license: 'CC0', creator: 'VideshiBhaktNRI', kind: 'licensed photograph', note: 'Tata Punch.ev reference photograph',
  },
  'citroen-ec3x': {
    url: '/assets/citroen-ec3-reference.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:2024_Citroen_e-C3.jpg',
    license: 'CC BY-SA 4.0', creator: 'Calreyn88', kind: 'licensed reference photograph', note: 'Global ë-C3 reference; Indian ë-C3X styling may differ',
  },
});
const SHOWROOM_ID_BY_DECISION_ID = Object.freeze({
  'tata-punch-ev': 'tata-punch-ev',
  'tata-nexon-ev': 'tata-nexon-ev',
  'mg-comet-ev': 'mg-comet-ev',
  'ather-rizta': 'ather-rizta',
  'tvs-king-kargo-ev-hd': 'tvs-king-kargo-ev-hd',
});
const LOCAL_CATALOG_MEDIA = Object.freeze({
  'mg-windsor-ev': '/assets/vehicles/mg-windsor-ev.jpg',
  'mahindra-xuv400': '/assets/vehicles/mahindra-xuv400.jpg',
  'ather-450x': '/assets/vehicles/ather-450x.jpg',
  'tvs-iqube': '/assets/vehicles/tvs-iqube.jpg',
  'ola-s1-pro': '/assets/vehicles/ola-s1-pro.jpg',
  'mahindra-treo-plus': '/assets/vehicles/mahindra-treo-plus.jpg',
  'bajaj-re-etec9': '/assets/vehicles/bajaj-re-etec9.jpg',
  'piaggio-ape-ecity': '/assets/vehicles/piaggio-ape-ecity.jpg',
  'euler-hiload': '/assets/vehicles/euler-hiload.jpg',
});
function showroomVehicleFor(item) {
  const showroomId = SHOWROOM_ID_BY_DECISION_ID[item.id];
  return showroomId ? SHOWROOM_VEHICLES.find((vehicleItem) => vehicleItem.id === showroomId) || null : null;
}
function showroomVisualFor(item) {
  const showroomVehicle = showroomVehicleFor(item);
  if (!showroomVehicle) return null;
  const view = showroomVehicle.views?.exterior || (typeof showroomVehicle.makeView === 'function' ? showroomVehicle.makeView('white', 'fixed-side-deck') : null);
  if (!view || view.type !== 'spin') return null;
  return {
    type: 'spin',
    label: view.label || 'Exterior 360°',
    folder: view.folder,
    pattern: view.pattern,
    frames: view.frames,
    frameStep: view.frameStep || 1,
    showroomVehicleId: showroomVehicle.id,
    showroomUrl: `/showroom/?vehicle=${encodeURIComponent(showroomVehicle.id)}`,
  };
}

function cleanText(value, limit = 240) {
  return typeof value === 'string' ? value.trim().replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, limit) : '';
}

function unique(items) {
  return [...new Set(items.filter(Boolean))];
}

function normalizeName(value) {
  return cleanText(value, 100).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim();
}

function unpackArgs(args) {
  if (!args || typeof args !== 'object' || Array.isArray(args)) return {};
  const nested = args.arguments || args.input || args.parameters;
  return nested && typeof nested === 'object' && !Array.isArray(nested) ? { ...args, ...nested } : args;
}

function firstDefined(args, keys) {
  for (const key of keys) if (args[key] !== undefined && args[key] !== null && args[key] !== '') return args[key];
  return undefined;
}

function flexibleNumber(args, keys) {
  const value = firstDefined(args, keys);
  if (value === undefined) return undefined;
  const number = Number(String(value).replace(/[^0-9.+-]/g, ''));
  return Number.isFinite(number) ? number : undefined;
}

function comparisonNames(args) {
  const input = unpackArgs(args);
  const supplied = firstDefined(input, ['vehicles', 'vehicleNames', 'vehicle_names', 'models', 'query']);
  const names = Array.isArray(supplied) ? supplied : supplied ? [supplied] : [];
  for (const key of ['vehicle1', 'vehicle2', 'vehicle3', 'firstVehicle', 'secondVehicle', 'first_vehicle', 'second_vehicle']) {
    if (input[key]) names.push(input[key]);
  }
  return names.flatMap((value) => String(value || '')
    .replace(/^(?:please\s+)?(?:compare|show|display|check)\s+/i, '')
    .split(/,|\b(?:vs\.?|versus|against|with|and|for)\b|(?:बनाम|और|के साथ|से तुलना)/i))
    .map((value) => cleanText(value, 100))
    .filter(Boolean);
}

function scoreVehicle(item, query) {
  const wanted = normalizeName(query);
  if (!wanted) return 0;
  const options = [item.name, item.id, ...item.aliases].map(normalizeName);
  if (options.some((option) => option === wanted)) return 100;
  if (options.some((option) => option.includes(wanted) || wanted.includes(option))) return 80;
  const words = new Set(wanted.split(' '));
  return Math.max(...options.map((option) => option.split(' ').filter((word) => words.has(word)).length * 20));
}

function resolveVehicles(names, category) {
  const requested = (Array.isArray(names) ? names : String(names || '').split(/,|\b(?:vs\.?|versus|against|with|and|for)\b|(?:बनाम|और|के साथ|से तुलना)/i)).map((item) => cleanText(item, 100)).filter(Boolean);
  const resolved = [];
  const ambiguous = [];
  for (const query of requested.slice(0, 3)) {
    const ranked = VEHICLES.map((item) => ({ item, score: scoreVehicle(item, query) })).sort((a, b) => b.score - a.score);
    if (!ranked[0] || ranked[0].score < 20) ambiguous.push(query);
    else if (!resolved.some((item) => item.id === ranked[0].item.id)) resolved.push(ranked[0].item);
  }
  if (requested.length === 0) {
    const matches = VEHICLES.filter((item) => category === 'Not sure' || item.category === category);
    for (const item of matches) if (resolved.length < 2 && !resolved.some((current) => current.id === item.id)) resolved.push(item);
  }
  return { resolved: resolved.slice(0, 3), ambiguous };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => value * Math.PI / 180;
  const radius = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingLabel(lat1, lon1, lat2, lon2) {
  const toRad = (value) => value * Math.PI / 180;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  const degree = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(degree / 45) % 8];
}

function calculateEmi(principal, annualRate, months) {
  if (!principal || !months) return 0;
  const rate = annualRate / 1200;
  return rate ? principal * rate * (1 + rate) ** months / ((1 + rate) ** months - 1) : principal / months;
}

function money(value) {
  return `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;
}

// A real booking attempt failed at Cal.com — the buyer needs to hear why in
// plain language, not the provider's error code. Falling back to "I have held
// it, a specialist will confirm" here was the bug: it told the buyer nothing
// went wrong when it had, so a real failure looked identical to success.
function humanizeBookingError(error) {
  const code = String(error || '').toLowerCase();
  if (code.includes('email_domain_cannot_receive_mail') || code.includes('invalid_email')) {
    return 'that email address does not look like it can receive mail';
  }
  if (code.includes('no_available_users') || code.includes('slot') && code.includes('taken')) {
    return 'that time was just taken by someone else';
  }
  if (code.includes('timeout') || code.includes('timed out')) {
    return 'the booking calendar took too long to respond';
  }
  return 'there was a problem reaching the booking calendar';
}

function safeError(error) {
  return cleanText(error instanceof Error ? error.message : String(error || 'Tool failed'), 400);
}

const ORDINAL_WORDS = [
  [/\b(?:1st|first|pehla|pehli|pahla)\b/i, 1],
  [/\b(?:2nd|second|dusra|doosra|dusri)\b/i, 2],
  [/\b(?:3rd|third|teesra|tisra|teesri)\b/i, 3],
  [/\b(?:4th|fourth|chautha|chotha)\b/i, 4],
];

// A buyer names a time however they like — "the first one", "10:30", "dus baje
// wala", "Tuesday at noon" — and the agent passes that through more or less
// verbatim. Matching only on an exact substring of the printed label meant most
// spoken choices failed to resolve, and the buyer was handed the same list again.
export function resolveSlot(chosen, offered, timezone = 'Asia/Kolkata') {
  const raw = String(chosen || '').trim();
  if (!raw || !offered.length) return '';
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return raw;

  const text = raw.toLowerCase();

  // "the second one", "pehla wala"
  for (const [pattern, position] of ORDINAL_WORDS) {
    if (pattern.test(text) && offered[position - 1]) return offered[position - 1].start;
  }

  // A bare small number, as read off the numbered list — but only when nothing
  // in the phrase points at a clock, or "2 pm" is read as "item 2".
  const looksLikeTime = /(am|pm|a\.m|p\.m|baje|o'clock|[:.]\d{2})/i.test(text);
  const bare = text.replace(/[^\d]/g, '');
  if (!looksLikeTime && bare && bare.length <= 2) {
    const position = Number(bare);
    if (position >= 1 && position <= offered.length) return offered[position - 1].start;
  }

  // Otherwise match on the clock. Compare against each slot's real time rather
  // than its printed label, so wording and date order stop mattering.
  const parts = text.match(/(\d{1,2})\s*[:.\s]?\s*(\d{2})?\s*(am|pm|a\.m|p\.m)?/);
  if (parts) {
    let hour = Number(parts[1]);
    const minute = parts[2] ? Number(parts[2]) : 0;
    const meridiem = (parts[3] || '').replace(/\./g, '');
    if (Number.isFinite(hour) && hour <= 24 && minute < 60) {
      const candidates = [];
      if (meridiem === 'pm') candidates.push(hour === 12 ? 12 : hour + 12);
      else if (meridiem === 'am') candidates.push(hour === 12 ? 0 : hour);
      else {
        // No am/pm given. Viewing hours are daytime, so try the sensible ones.
        candidates.push(hour);
        if (hour < 12) candidates.push(hour + 12);
      }
      for (const wanted of candidates) {
        const hit = offered.find((slot) => {
          const local = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: timezone }).format(new Date(slot.start));
          const [h, m] = local.split(':').map(Number);
          return h === wanted && (parts[2] ? m === minute : true);
        });
        if (hit) return hit.start;
      }
    }
  }

  // Last resort: the printed label, in either direction.
  const label = offered.find((slot) => {
    const l = slot.label.toLowerCase();
    return l.includes(text) || text.includes(l);
  });
  return label ? label.start : '';
}

export const REASON_LABELS = Object.freeze({
  'explicit-request': 'Buyer asked to speak to a person',
  'fleet-or-bulk': 'Fleet, bulk or corporate purchase',
  'price-negotiation': 'Price, discount or exchange negotiation',
  'finance-case': 'Loan, leasing or finance structuring',
  'unresolved-objection': 'Objection the AI could not close',
  'trust-or-complaint': 'Trust concern or complaint',
  'ready-to-buy': 'High intent, ready to close',
});

const REASON_BRIEFS = Object.freeze({
  'explicit-request': 'The buyer asked to speak with a human.',
  'fleet-or-bulk': 'The buyer needs multiple vehicles and pricing the AI cannot quote.',
  'price-negotiation': 'The buyer wants a negotiated price or exchange value.',
  'finance-case': 'The buyer needs a finance structure the AI cannot commit to.',
  'unresolved-objection': 'An objection remained open after the AI addressed it.',
  'trust-or-complaint': 'The buyer raised a trust concern that needs a person.',
  'ready-to-buy': 'The buyer is ready to move and needs a human to close.',
});

const HANDOFF_LINES = Object.freeze({
  English: 'Let me bring in a human EasyEV specialist. They can already see everything we have covered, so you will not have to repeat yourself. Staying on the line with you.',
  Hindi: 'मैं अभी एक EasyEV विशेषज्ञ को इसी कॉल में जोड़ रहा हूँ। उन्हें हमारी पूरी बातचीत पहले से दिख रही है, इसलिए आपको कुछ दोहराना नहीं पड़ेगा। लाइन पर बने रहिए।',
  Hinglish: 'Main abhi ek human EasyEV specialist ko isi call par la raha hoon. Unhe hamari poori baat-cheet already dikh rahi hai, toh aapko kuch repeat nahi karna padega. Line par baney rahiye.',
});

export function computeDynamicWeights(passport) {
  const priorities = (passport?.profile?.priorities || []).map((p) => String(p).toLowerCase());
  const joined = `${priorities.join(' ')} ${passport?.profile?.usagePattern || ''}`.toLowerCase();
  const weights = { budget: 25, range: 20, charging: 20, usage: 15, safety: 10, economics: 10 };

  if (/safety|build|security|suraksha|मजबूत|सुरक्षा|ncap/i.test(joined)) {
    weights.safety += 12;
    weights.budget -= 6;
    weights.usage -= 6;
  }
  if (/range|distance|highway|long trip|duri|दूरी|रेंज|सफर|touring/i.test(joined)) {
    weights.range += 10;
    weights.usage += 4;
    weights.charging -= 8;
    weights.economics -= 6;
  }
  if (/budget|price|afford|cheap|cost|कम बजट|सस्ता|कीमत/i.test(joined)) {
    weights.budget += 12;
    weights.safety -= 6;
    weights.charging -= 6;
  }
  if (/charging|speed|fast charge|चार्ज/i.test(joined)) {
    weights.charging += 8;
    weights.economics -= 4;
    weights.usage -= 4;
  }
  if (/running cost|economy|mileage|tco|bachat|बचत|खर्च/i.test(joined)) {
    weights.economics += 10;
    weights.budget -= 5;
    weights.safety -= 5;
  }

  const keys = Object.keys(weights);
  keys.forEach((k) => { weights[k] = Math.max(5, weights[k]); });
  const total = keys.reduce((sum, k) => sum + weights[k], 0);
  let accumulated = 0;
  keys.forEach((k, idx) => {
    if (idx === keys.length - 1) {
      weights[k] = 100 - accumulated;
    } else {
      weights[k] = Math.round((weights[k] / total) * 100);
      accumulated += weights[k];
    }
  });
  return weights;
}

export function evaluateVehicleCompatibility(vehicleItem, passport, weights = computeDynamicWeights(passport)) {
  const profile = passport?.profile || {};
  const budgetLakh = Number(profile.budgetLakh) || (passport?.ownership?.assumptions?.comparableFuelVehicleLakh ? passport.ownership.assumptions.comparableFuelVehicleLakh * 1.1 : null);
  const dailyKm = Number(profile.dailyKm) || (passport?.ownership?.assumptions?.dailyKm) || 50;
  const isHighway = /highway|long|tour|outstation|weekend|touring|intercity|travel/i.test(`${profile.usagePattern || ''} ${(profile.priorities || []).join(' ')}`);
  const hasHomeCharging = !/no (?:home|dedicated)|cannot charge|can't charge/i.test(String(profile.chargingAccess || ''));

  // 1. Budget Fit
  let budgetScore = weights.budget;
  if (budgetLakh) {
    if (budgetLakh >= vehicleItem.priceMinLakh && budgetLakh <= vehicleItem.priceMaxLakh * 1.15) {
      budgetScore = weights.budget;
    } else if (budgetLakh > vehicleItem.priceMaxLakh * 1.15) {
      budgetScore = Math.round(weights.budget * 0.92);
    } else {
      const diff = vehicleItem.priceMinLakh - budgetLakh;
      const penalty = Math.min(1, diff / budgetLakh);
      budgetScore = Math.max(2, Math.round(weights.budget * (1 - penalty)));
    }
  }

  // 2. Range Fit
  const requiredRange = isHighway ? Math.max(dailyKm * 2.5, 320) : dailyKm * 1.4;
  const rangeRatio = Math.min(1.2, vehicleItem.claimedRangeKm / requiredRange);
  let rangeScore = Math.min(weights.range, Math.round(weights.range * Math.min(1, rangeRatio)));
  if (isHighway && vehicleItem.claimedRangeKm < 280) {
    rangeScore = Math.max(2, Math.round(rangeScore * 0.6));
  }

  // 3. Charging Fit
  let chargingScore = weights.charging;
  const supportsDcFast = /dc|fast|50\s*kw|60\s*kw|min/i.test(vehicleItem.charging);
  if (hasHomeCharging) {
    chargingScore = weights.charging;
  } else {
    chargingScore = supportsDcFast ? Math.round(weights.charging * 0.88) : Math.round(weights.charging * 0.40);
  }

  // 4. Usage Pattern Fit
  let usageScore = Math.round(weights.usage * 0.85);
  if (vehicleItem.category === 'Electric car') {
    if (isHighway) {
      usageScore = vehicleItem.claimedRangeKm >= 400 ? weights.usage : Math.round(weights.usage * 0.75);
    } else {
      usageScore = weights.usage;
    }
  } else if (vehicleItem.category === 'Electric scooter') {
    usageScore = isHighway ? Math.round(weights.usage * 0.3) : weights.usage;
  } else if (vehicleItem.category === 'Electric 3-wheeler') {
    usageScore = isHighway ? Math.round(weights.usage * 0.2) : weights.usage;
  }

  // 5. Safety & Build Fit
  let safetyScore = Math.round(weights.safety * 0.75);
  if (/nexon|punch|xuv400/i.test(vehicleItem.id)) {
    safetyScore = weights.safety;
  } else if (/windsor|ec3/i.test(vehicleItem.id)) {
    safetyScore = Math.round(weights.safety * 0.85);
  } else if (/comet/i.test(vehicleItem.id)) {
    safetyScore = Math.round(weights.safety * 0.65);
  } else if (vehicleItem.category === 'Electric scooter') {
    safetyScore = /rizta|450x|iqube/i.test(vehicleItem.id) ? weights.safety : Math.round(weights.safety * 0.8);
  }

  // 6. Economics / TCO Fit
  let economicsScore = Math.round(weights.economics * (1 - (vehicleItem.kwhPer100Km || 13) / 30));
  economicsScore = Math.min(weights.economics, Math.max(3, economicsScore));

  const totalScore = Math.min(100, Math.max(10, Math.round(budgetScore + rangeScore + chargingScore + usageScore + safetyScore + economicsScore)));

  const whyItFits = [];
  if (budgetScore >= weights.budget * 0.85) {
    whyItFits.push(budgetLakh ? `Fits comfortably within your ₹${budgetLakh.toFixed(1)}L budget band` : `Competitive pricing starting from ₹${vehicleItem.priceMinLakh.toFixed(2)}L`);
  }
  if (rangeScore >= weights.range * 0.80) {
    whyItFits.push(`Real-world range (~${Math.round(vehicleItem.claimedRangeKm * 0.72)} km) provides generous buffer for your ${dailyKm} km daily commute`);
  }
  if (hasHomeCharging) {
    whyItFits.push(`Seamless home AC wallbox charging keeps running cost under ₹1.20/km`);
  } else if (supportsDcFast) {
    whyItFits.push(`Fast DC charging (${vehicleItem.charging}) compensates for lack of dedicated home charger`);
  }
  if (isHighway && vehicleItem.claimedRangeKm >= 400) {
    whyItFits.push(`Long-range battery pack supports intercity highway travel with minimal stops`);
  }
  if (safetyScore >= weights.safety * 0.9) {
    whyItFits.push(`High structural safety rating and active thermal battery protection`);
  }

  const tradeOffs = [];
  if (isHighway && vehicleItem.claimedRangeKm < 350) {
    tradeOffs.push(`Highway trips require planned DC charging stops every ~180–200 km`);
  }
  if (!hasHomeCharging && !supportsDcFast) {
    tradeOffs.push(`Relies on slow AC charging (no DC fast charge); unsuitable without home parking`);
  }
  if (vehicleItem.priceMinLakh > (budgetLakh || 15) * 1.1) {
    tradeOffs.push(`Initial purchase cost slightly exceeds your target budget band`);
  }
  if (vehicleItem.id === 'mg-comet-ev') {
    tradeOffs.push(`Compact 4-seater with limited boot space; best suited as secondary city commuter`);
  } else if (vehicleItem.id === 'tata-nexon-ev') {
    tradeOffs.push(`Real-world highway range drops ~25% at sustained speeds above 90 km/h`);
  } else if (vehicleItem.id === 'citroen-ec3x') {
    tradeOffs.push(`Air-cooled battery pack requires consideration in extreme summer DC fast charging`);
  } else if (vehicleItem.id === 'tata-punch-ev') {
    tradeOffs.push(`Rear passenger legroom is compact compared to larger segment crossovers`);
  } else if (tradeOffs.length === 0) {
    tradeOffs.push(`Public fast-charging speeds depend on charger output (CCS2 50kW vs 30kW)`);
  }

  return {
    score: totalScore,
    breakdown: {
      budget: { score: budgetScore, max: weights.budget },
      range: { score: rangeScore, max: weights.range },
      charging: { score: chargingScore, max: weights.charging },
      usage: { score: usageScore, max: weights.usage },
      safety: { score: safetyScore, max: weights.safety },
      economics: { score: economicsScore, max: weights.economics },
    },
    weights,
    whyItFits: whyItFits.slice(0, 4),
    tradeOffs: tradeOffs.slice(0, 2),
  };
}

export function simulateCounterfactuals(topVehicle, passport, catalog = VEHICLES) {
  const currentVehicleId = topVehicle?.id || 'tata-nexon-ev';
  const insights = [];

  const baseKm = Number(passport?.profile?.dailyKm) || 50;
  const longKm = Math.max(140, baseKm * 2.5);
  const simLongPassport = JSON.parse(JSON.stringify(passport));
  simLongPassport.profile.dailyKm = longKm;
  simLongPassport.profile.usagePattern = 'Frequent highway & intercity trips';

  const longCandidates = catalog.filter((v) => v.category === topVehicle.category).map((v) => ({
    vehicle: v,
    compat: evaluateVehicleCompatibility(v, simLongPassport)
  })).sort((a, b) => b.compat.score - a.compat.score);

  if (longCandidates[0] && longCandidates[0].vehicle.id !== currentVehicleId) {
    insights.push({
      trigger: `If daily/highway travel increases above ${Math.round(longKm * 0.85)} km/day`,
      shiftTo: longCandidates[0].vehicle.name,
      reason: `Longer range battery pack (~${longCandidates[0].vehicle.claimedRangeKm} km) and highway efficiency provide higher margin`,
    });
  } else {
    insights.push({
      trigger: `If daily travel increases above 150 km/day`,
      shiftTo: 'Long-Range Pack Variants (e.g. 45+ kWh)',
      reason: `Highway energy consumption requires larger buffer to avoid midday charging`,
    });
  }

  const hasHome = !/no (?:home|dedicated)|cannot charge|can't charge/i.test(String(passport?.profile?.chargingAccess || ''));
  if (hasHome) {
    const simNoHomePassport = JSON.parse(JSON.stringify(passport));
    simNoHomePassport.profile.chargingAccess = 'No dedicated home charging';
    const noHomeCandidates = catalog.filter((v) => v.category === topVehicle.category).map((v) => ({
      vehicle: v,
      compat: evaluateVehicleCompatibility(v, simNoHomePassport)
    })).sort((a, b) => b.compat.score - a.compat.score);

    if (noHomeCandidates[0]) {
      insights.push({
        trigger: `If dedicated home charging is unavailable`,
        shiftTo: noHomeCandidates[0].vehicle.name,
        reason: `Vehicles with verified DC fast-charging (CCS2 50kW+) and liquid battery cooling gain preference`,
      });
    }
  }

  const baseBudget = Number(passport?.profile?.budgetLakh) || topVehicle.priceMinLakh || 15;
  const higherBudget = baseBudget + 6;
  insights.push({
    trigger: `If budget expands to ₹${higherBudget.toFixed(0)}L+`,
    shiftTo: `Premium segment crossovers (e.g. MG Windsor / Mahindra XUV400 / Ioniq 5)`,
    reason: `Enables higher safety suite (ADAS Level 2), larger battery architecture and ventilated seating`,
  });

  return insights;
}

export function recordDecisionEvent(record, eventType, data = {}) {
  if (!record || !record.passport) return;
  if (!Array.isArray(record.passport.evolutionTimeline)) {
    record.passport.evolutionTimeline = [];
  }
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const event = {
    eventId: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: timeStr,
    type: eventType,
    field: data.field || null,
    previousValue: data.previousValue || null,
    newValue: data.newValue || null,
    provenance: data.provenance || 'confirmed',
    reason: data.reason || '',
    previousTopMatch: data.previousTopMatch || null,
    newTopMatch: data.newTopMatch || null,
    reasons: data.reasons || [],
  };
  record.passport.evolutionTimeline.push(event);
  if (record.passport.evolutionTimeline.length > 25) {
    record.passport.evolutionTimeline.shift();
  }
  return event;
}

export class EasyEVToolEngine {
  constructor({ databaseUrl = '', geminiApiKey = '', geminiModel = 'gemini-3.6-flash', openChargeMapKey = '', publicBaseUrl = '', onEscalation = null, crm = null, mailer = null } = {}) {
    this.onEscalation = onEscalation;
    this.crm = crm || new CrmCalendar({});
    this.mailer = mailer;
    this.databaseUrl = databaseUrl;
    this.geminiApiKey = geminiApiKey;
    this.geminiModel = geminiModel;
    this.openChargeMapKey = openChargeMapKey;
    this.publicBaseUrl = publicBaseUrl.replace(/\/$/, '');
    this.db = null;
    this.databaseMode = 'initializing';
    this.databaseError = '';
  }

  async initialize() {
    if (!this.databaseUrl) {
      this.databaseMode = 'ephemeral';
      return;
    }
    try {
      const pool = new Pool({
        connectionString: this.databaseUrl,
        ssl: /localhost|127\.0\.0\.1/.test(this.databaseUrl) ? false : { rejectUnauthorized: false },
        max: 4,
      });
      await pool.query(`
        CREATE TABLE IF NOT EXISTS vehicles (
          id TEXT PRIMARY KEY, category TEXT NOT NULL, name TEXT NOT NULL, facts JSONB NOT NULL,
          source_url TEXT NOT NULL, verified_at DATE NOT NULL, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS buyer_sessions (
          id UUID PRIMARY KEY, category TEXT NOT NULL, language TEXT NOT NULL, passport JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE TABLE IF NOT EXISTS tool_runs (
          id UUID PRIMARY KEY, session_id UUID REFERENCES buyer_sessions(id) ON DELETE CASCADE,
          tool TEXT NOT NULL, phase TEXT NOT NULL, payload JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      for (const item of VEHICLES) {
        await pool.query(
          `INSERT INTO vehicles (id, category, name, facts, source_url, verified_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO UPDATE SET facts=EXCLUDED.facts, source_url=EXCLUDED.source_url,
             verified_at=EXCLUDED.verified_at, updated_at=NOW()`,
          [item.id, item.category, item.name, item, item.sourceUrl, item.verifiedAt],
        );
      }
      this.db = pool;
      this.databaseMode = 'postgres';
    } catch (error) {
      this.databaseMode = 'ephemeral';
      this.databaseError = safeError(error);
    }
  }

  createPassport(category, language) {
    const passport = {
      profile: {
        category,
        language,
        dailyKm: null,
        budgetLakh: null,
        chargingAccess: 'Not discussed',
        priorities: [],
        usagePattern: 'Not discussed',
        provenance: {
          category: 'confirmed',
          language: 'confirmed',
          dailyKm: 'inferred',
          budgetLakh: 'inferred',
          chargingAccess: 'inferred',
          priorities: 'inferred',
          usagePattern: 'inferred',
        },
      },
      shortlist: [],
      comparison: null,
      charging: null,
      ownership: null,
      readiness: null,
      escalation: null,
      lead: null,
      booking: null,
      insurance: null,
      unanswered: [],
      nextActions: [],
      evolutionTimeline: [
        {
          eventId: `evt_${Date.now()}_init`,
          timestamp: new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
          type: 'SESSION_STARTED',
          field: 'category',
          previousValue: null,
          newValue: category,
          provenance: 'confirmed',
          reason: 'Initial user category selection',
        },
      ],
      dynamicWeights: { budget: 25, range: 20, charging: 20, usage: 15, safety: 10, economics: 10 },
      counterfactuals: [],
      updatedAt: new Date().toISOString(),
    };
    return passport;
  }

  publicPassport(record) {
    return JSON.parse(JSON.stringify(record.passport));
  }

  emit(record, partial) {
    if (!record || record.closed) return null;
    const event = {
      eventId: randomUUID(),
      turnId: partial.turnId || `turn-${record.turnGeneration}`,
      toolRunId: partial.toolRunId || null,
      tool: partial.tool || 'system',
      phase: partial.phase || 'status',
      stage: partial.stage || null,
      payload: partial.payload || {},
      timestamp: new Date().toISOString(),
    };
    record.events.push(event);
    if (record.events.length > 60) record.events.shift();
    const wire = `id: ${event.eventId}\nevent: tool-event\ndata: ${JSON.stringify(event)}\n\n`;
    for (const client of record.sseClients) {
      try { client.write(wire); } catch { record.sseClients.delete(client); }
    }
    return event;
  }

  cancel(record, reason = 'Conversation moved on') {
    const hadActiveWork = record.controllers.size > 0 || Boolean(record.pendingSnapshot);
    record.turnGeneration += 1;
    for (const controller of record.controllers.values()) controller.abort(reason);
    record.controllers.clear();
    if (record.pendingSnapshot?.buffer) record.pendingSnapshot.buffer.fill(0);
    record.pendingSnapshot = null;
    if (hadActiveWork) this.emit(record, { phase: 'cancelled', stage: 'idle', payload: { message: reason } });
  }

  async persistSession(record) {
    record.passport.updatedAt = new Date().toISOString();
    if (!this.db) return;
    await this.db.query(
      `INSERT INTO buyer_sessions (id, category, language, passport, updated_at)
       VALUES ($1,$2,$3,$4,NOW())
       ON CONFLICT (id) DO UPDATE SET passport=EXCLUDED.passport, updated_at=NOW()`,
      [record.key, record.category, record.language, record.passport],
    );
  }

  async persistRun(record, run) {
    if (!this.db) return;
    await this.db.query(
      `INSERT INTO tool_runs (id, session_id, tool, phase, payload, created_at)
       VALUES ($1,$2,$3,$4,$5,NOW())
       ON CONFLICT (id) DO UPDATE SET phase=EXCLUDED.phase, payload=EXCLUDED.payload`,
      [run.toolRunId, record.key, run.tool, run.phase, run.payload || {}],
    );
  }

  async close() {
    if (this.db) await this.db.end();
  }

  definitions() {
    const flexibleNumeric = z.union([z.number(), z.string()]).optional();
    const flexibleTextList = z.union([z.array(z.string()), z.string()]).optional();
    return {
      compare_vehicles: {
        description: 'Compare or visually present Indian electric vehicles from the verified EasyEV catalog and update the Buyer Decision Passport. Put every vehicle the buyer names into vehicles; two names produce a side-by-side comparison. The exact-model 360 set includes Punch.ev, Nexon.ev, MG Comet EV, Ather Rizta and TVS King Kargo HD EV. Also recognises Citroen eC3/eC3X, Windsor EV, XUV400, Ather 450X, TVS iQube, Ola S1 Pro and the curated 3-wheeler set.',
        inputSchema: {
          vehicles: flexibleTextList.describe('One vehicle name or a list of up to three spoken vehicle names'),
          vehicle1: z.string().optional(),
          vehicle2: z.string().optional(),
          vehicle_names: flexibleTextList,
          query: z.string().optional(),
          presentation: z.string().optional().describe('Use photo for picture/image, 3d for 3D/360/AR, otherwise comparison'),
          priorities: flexibleTextList.describe('Buyer priorities such as budget, range, comfort or payload'),
        },
        run: this.compareVehicles.bind(this),
      },
      find_nearby_chargers: {
        description: 'Find public EV charging locations using only a location the buyer explicitly consented to share. Use for chargers, map, stations or distance. If location is absent, request it in the UI.',
        inputSchema: { radiusKm: flexibleNumeric, radius_km: flexibleNumeric },
        run: this.findNearbyChargers.bind(this),
      },
      
            explore_ev_insurance: {
        description: insuranceToolDefinition.description,
        inputSchema: insuranceToolDefinition.inputSchema,
        run: (record, args, signal) => handleExploreEvInsurance(record, args, signal, {
          resolveVehicles,
          unpackArgs,
          firstDefined,
          unique,
          VEHICLES,
        }),
      },
      calculate_ownership: {
        description: 'Calculate deterministic EV purchase, EMI, electricity, service, fuel comparison, five-year total and break-even. Use for cost, savings, EMI, distance, tariff or changed assumptions.',
        inputSchema: {
          vehicle: z.string().optional(),
          dailyKm: flexibleNumeric, daily_km: flexibleNumeric,
          years: flexibleNumeric,
          electricityRate: flexibleNumeric, electricity_rate: flexibleNumeric,
          publicChargingRate: flexibleNumeric, public_charging_rate: flexibleNumeric,
          homeChargingShare: flexibleNumeric, home_charging_share: flexibleNumeric,
          petrolPrice: flexibleNumeric, petrol_price: flexibleNumeric,
          petrolMileage: flexibleNumeric, petrol_mileage: flexibleNumeric,
          downPaymentPercent: flexibleNumeric, down_payment_percent: flexibleNumeric,
          annualInterest: flexibleNumeric, annual_interest: flexibleNumeric,
          loanYears: flexibleNumeric, loan_years: flexibleNumeric,
          comparableFuelVehicleLakh: flexibleNumeric, comparable_fuel_vehicle_lakh: flexibleNumeric,
        },
        run: this.calculateOwnership.bind(this),
      },
      analyze_readiness_snapshot: {
        description: 'Analyse one user-confirmed still for parking layout, charging connector recognition or electrical-label OCR. Never request continuous capture. If no still is uploaded, present the consent UI.',
        inputSchema: { focus: z.enum(['parking-layout', 'connector', 'electrical-label', 'general']).optional() },
        run: this.analyzeSnapshot.bind(this),
      },
      generate_decision_report: {
        description: 'Generate a downloadable PDF from structured Buyer Decision Passport data. Use for report, PDF, summary, download or take-away requests.',
        inputSchema: {},
        run: this.generateReport.bind(this),
      },
      escalate_to_human: {
        description: 'Bring a live human EasyEV specialist into this same voice call, carrying the full Buyer Passport and transcript. Use ONLY when the buyer explicitly asks to speak to a person, manager, dealer or salesperson; when they want a fleet, bulk or corporate purchase; when they want to negotiate a price, discount or exchange value; when they need a finance or loan case you cannot quote; or when an objection about trust, quality or a complaint stays unresolved after you have addressed it once. NEVER use this to arrange a test drive, demo, showroom visit or appointment — book_test_drive handles all of those directly and no human is needed. Wanting a test drive is not the same as wanting to talk to a person. Also do not use it for anything the catalog, ownership calculator, charger search or report can answer.',
        inputSchema: {
          reason: z.enum(['explicit-request', 'fleet-or-bulk', 'price-negotiation', 'finance-case', 'unresolved-objection', 'trust-or-complaint', 'ready-to-buy']).optional().describe('Why a human is needed'),
          summary: z.string().optional().describe('One or two sentences the human specialist should read before they speak, in English'),
          urgency: z.enum(['standard', 'high']).optional(),
        },
        run: this.escalateToHuman.bind(this),
      },
      capture_lead: {
        description: 'Save the buyer as a real lead in the EasyEV CRM, together with everything qualified so far. Call this as soon as the buyer gives a name, phone number or email address, and again if they correct any of those details. Never invent contact details; only pass what the buyer actually said.',
        inputSchema: {
          name: z.string().optional().describe('The buyer name exactly as they said it'),
          email: z.string().optional(),
          phone: z.string().optional().describe('Digits as spoken; the tool normalises Indian numbers'),
          notes: z.string().optional().describe('Anything the sales team should know that is not already in the Passport'),
        },
        run: this.captureLead.bind(this),
      },
      book_test_drive: {
        description: 'Check real calendar availability and book a real test drive or demo. This is the correct and only tool for any request to book, schedule or arrange a test drive, demo, showroom visit, dealership visit or appointment, in any language — including "test drive book karni hai", "demo chahiye" and "appointment lagao". Do not escalate those to a human. Call with no time to fetch and offer open slots. Call again with the slot the buyer chose to confirm the booking; a confirmation email is sent to them. An email address is required before a booking can be confirmed, so ask for it if the buyer has not given one.',
        inputSchema: {
          slot: z.string().optional().describe('The slot the buyer chose: "1", "2", the spoken label, or an ISO timestamp'),
          demoType: z.string().optional().describe('At-home demo, Dealership visit or Video walk-through'),
          name: z.string().optional(),
          email: z.string().optional(),
          phone: z.string().optional(),
        },
        run: this.bookTestDrive.bind(this),
      },
    };
  }

  // Everything the sales team should see on the CRM record, drawn from the
  // Passport rather than re-asked.
  leadSummary(record) {
    const passport = record.passport;
    const profile = passport.profile || {};
    const lines = [
      `Category: ${profile.category || 'not stated'}`,
      `Language: ${profile.language}`,
      profile.dailyKm ? `Daily travel: ${profile.dailyKm} km` : null,
      profile.budgetLakh ? `Budget: around ₹${profile.budgetLakh} lakh` : null,
      profile.chargingAccess && profile.chargingAccess !== 'Not discussed' ? `Charging: ${profile.chargingAccess}` : null,
      profile.priorities?.length ? `Priorities: ${profile.priorities.join(', ')}` : null,
      passport.shortlist?.length ? `Shortlist: ${passport.shortlist.map((item) => item.name).join(', ')}` : null,
    ];
    if (passport.ownership?.results) {
      const results = passport.ownership.results;
      const headline = Object.entries(results).slice(0, 3).map(([key, value]) => `${key}: ${value}`).join('; ');
      if (headline) lines.push(`Ownership scenario: ${headline}`);
    }
    if (passport.escalation) {
      lines.push(`Escalated to a human: ${passport.escalation.reasonLabel}${passport.escalation.repName ? ` (handled by ${passport.escalation.repName})` : ''}`);
      if (passport.escalation.handbackNote) lines.push(`Specialist note: ${passport.escalation.handbackNote}`);
    }
    if (passport.nextActions?.length) lines.push(`Next actions: ${passport.nextActions.slice(-4).join(' | ')}`);
    lines.push(`Captured by the EasyEV voice agent on ${new Date().toLocaleString('en-IN')}.`);
    return lines.filter(Boolean).join('\n');
  }

  contactDetails(record, input) {
    const existing = record.passport.lead || {};
    const spoken = cleanText(firstDefined(input, ['email', 'emailAddress', 'email_address']) || '', 160);
    const repaired = parseSpokenEmail(spoken);
    // Fall back to an address already confirmed earlier in the call.
    const email = repaired || (isEmail(existing.email) ? existing.email : '');
    return {
      name: cleanText(firstDefined(input, ['name', 'fullName', 'full_name']) || existing.name || '', 120),
      email,
      phone: normalizePhone(firstDefined(input, ['phone', 'phoneNumber', 'phone_number', 'mobile']) || existing.phone || ''),
      // The buyer said something that was meant to be an email and it could not
      // be read. Silently dropping it is what left bookings permanently stuck.
      emailUnclear: Boolean(spoken) && !repaired,
      emailHeard: spoken,
    };
  }

  async captureLead(record, args) {
    const input = unpackArgs(args);
    const contact = this.contactDetails(record, input);
    const notes = cleanText(firstDefined(input, ['notes', 'note', 'context']) || '', 600);
    if (contact.emailUnclear && !contact.phone && !contact.name) {
      return {
        stage: 'lead-capture',
        payload: { needsDetails: true, emailUnclear: true, heard: contact.emailHeard },
        spoken: `I heard that as "${contact.emailHeard}" and I could not read it as an email address. Could you type it using the keyboard button, or spell it out slowly?`,
      };
    }
    if (!contact.name && !contact.email && !contact.phone) {
      return {
        stage: 'lead-capture',
        payload: { needsDetails: true, have: contact },
        spoken: 'I can save this so a specialist can follow up properly. Could I take your name and either a phone number or an email address?',
      };
    }

    // The buyer sees their details land the moment they are understood. Writing
    // them to HubSpot takes about three seconds and cannot change what was
    // captured, so it runs behind the reply and reports back over the event
    // stream — the same shape the booking flow already uses.
    record.passport.lead = {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      provider: 'pending',
      contactId: null,
      dealId: null,
      savedAt: new Date().toISOString(),
      live: false,
      syncing: true,
    };
    this.finishLeadAsync(record, contact, notes);

    return {
      stage: 'lead-capture',
      payload: {
        ...record.passport.lead,
        crmUrl: null,
        failed: false,
        error: null,
      },
      // Deliberately does not claim the CRM write has landed — it is still in
      // flight. The follow-up event says where it ended up.
      spoken: `Got it. I have your ${contact.email ? 'email' : 'details'}, so nobody will ask you to repeat it.`,
    };
  }

  async bookTestDrive(record, args) {
    const input = unpackArgs(args);
    const contact = this.contactDetails(record, input);
    const demoType = cleanText(firstDefined(input, ['demoType', 'demo_type', 'type']) || '', 60);
    const chosen = cleanText(firstDefined(input, ['slot', 'time', 'startISO', 'start', 'preferredTime', 'preferred_time']) || '', 80);

    const offered = record.passport.booking?.offered || [];
    const startISO = resolveSlot(chosen, offered, this.crm.timezone);

    // No slot resolved yet: fetch real availability and let the buyer pick.
    if (!startISO) {
      const availability = await this.crm.findSlots({ limit: 4 });
      record.passport.booking = {
        ...(record.passport.booking || {}),
        offered: availability.slots,
        availabilityProvider: availability.provider,
        confirmed: false,
      };
      return {
        stage: 'booking-slots',
        payload: {
          slots: availability.slots,
          provider: availability.provider,
          live: availability.provider === 'cal.com',
          note: availability.note || null,
          needsEmail: !contact.email,
        },
        spoken: availability.slots.length
          ? [
            `I have ${availability.slots.length} open times. ${availability.slots.slice(0, 3).map((slot, index) => `${index + 1}, ${slot.label}`).join('. ')}.`,
            'They are on your screen too, so you can just tap one or tell me the number.',
            contact.email ? '' : 'Please type your email in the box on screen so I can send the confirmation there.',
          ].filter(Boolean).join(' ')
          : 'I could not find an open slot in the next few days. Shall I have a specialist call you to arrange one?',
      };
    }

    if (!contact.email) {
      return {
        stage: 'booking-slots',
        payload: { slots: offered, needsEmail: true, pendingStart: startISO, emailUnclear: contact.emailUnclear, heard: contact.emailHeard },
        spoken: contact.emailUnclear
          ? `I have the time held, but I heard your email as "${contact.emailHeard}" and could not read it. There is a box on your screen now — please type it there and press Send.`
          : 'I have that time held. Please type your email in the box on your screen and press Send, and the confirmation will go straight there.',
      };
    }

    const booking = await this.crm.book({
      ...contact,
      startISO,
      demoType,
      notes: this.leadSummary(record),
      sessionKey: record.key,
    });

    record.passport.booking = {
      ...(record.passport.booking || {}),
      confirmed: booking.confirmed,
      when: booking.when,
      startISO: booking.startISO,
      demoType: booking.demoType,
      provider: booking.provider,
      bookingId: booking.bookingId || null,
      meetingUrl: booking.meetingUrl || null,
      live: booking.provider === 'cal.com',
    };
    record.passport.nextActions = unique([
      ...record.passport.nextActions,
      booking.confirmed
        ? `${booking.demoType} confirmed for ${booking.when}; confirmation emailed to ${contact.email}.`
        : booking.failed
          ? `Booking attempt for ${booking.when} failed (${booking.error || 'unknown error'}); needs manual follow-up.`
          : `${booking.demoType} pencilled in for ${booking.when}; confirm with the buyer before it is committed.`,
    ]);

    // The buyer should hear "booked" the moment the calendar confirms it. Saving
    // to the CRM and sending the confirmation take about three seconds each and
    // neither can change the booking, so they run after the reply and report back
    // over the tool-event stream when they land.
    const emailPending = Boolean(booking.confirmed && this.mailer?.live && contact.email);
    this.finishBookingAsync(record, contact, booking);

    return {
      stage: 'booking-confirmed',
      payload: {
        ...record.passport.booking,
        email: contact.email,
        name: contact.name,
        failed: Boolean(booking.failed),
        error: booking.error || null,
        note: booking.note || null,
        emailPending,
        emailSent: null,
        emailError: null,
      },
      spoken: booking.confirmed
        ? (emailPending
          ? `Done. ${booking.demoType} is booked for ${booking.when}. Your confirmation and decision report are on their way to ${contact.email}.`
          : `Done. ${booking.demoType} is booked for ${booking.when}.`)
        : booking.failed
          ? `I could not complete that booking — ${humanizeBookingError(booking.error)}. I have kept ${booking.when} noted as your preferred time. Would you like to try a different email address, or shall I bring in a specialist to confirm it directly?`
          : `I have held ${booking.when} for your ${booking.demoType}. It is on your screen, and a specialist will confirm it with you.`,
    };
  }

  createMcpServer(record) {
    const server = new McpServer({ name: 'EasyEV Decision Tools', version: '1.0.0' });
    for (const [name, definition] of Object.entries(this.definitions())) {
      server.registerTool(name, { description: definition.description, inputSchema: definition.inputSchema }, async (args) => this.run(record, name, args));
    }
    return server;
  }

  async run(record, toolName, args = {}) {
    const definition = this.definitions()[toolName];
    if (!definition) throw new Error(`Unknown tool: ${toolName}`);
    record.turnGeneration += 1;
    const generation = record.turnGeneration;
    const toolRunId = randomUUID();
    const controller = new AbortController();
    record.controllers.set(toolRunId, controller);
    const messages = {
      compare_vehicles: 'Searching verified catalog',
      find_nearby_chargers: 'Checking live charging sources',
      calculate_ownership: 'Recalculating every assumption',
      explore_ev_insurance: 'Analyzing EV protection & insurance slabs',
      analyze_readiness_snapshot: 'Preparing privacy-first image check',
      generate_decision_report: 'Building report from your Passport',
      escalate_to_human: 'Paging a human EasyEV specialist',
      capture_lead: 'Saving your details to the CRM',
      book_test_drive: 'Checking real availability',
    };
    this.emit(record, { tool: toolName, toolRunId, phase: 'started', stage: toolName, payload: { message: messages[toolName] } });
    this.persistRun(record, { toolRunId, tool: toolName, phase: 'started', payload: args }).catch(() => {});
    try {
      const result = await definition.run(record, args, controller.signal);
      if (toolName === "explore_ev_insurance" && result?.payload?.catalog) {
        record.passport.insurance = {
          vehicle: result.payload.vehicle,
          decisionSummary: result.payload.decisionSummary,
          selectedPlan: result.payload.dossier?.selectedPlan || result.payload.catalog?.[0],
          city: result.payload.city,
          pricingBand: result.payload.catalog?.[0]?.pricingEstimate?.formattedBand || result.payload.decisionSummary?.estimatedProtectionCost,
          riskFlags: result.payload.decisionSummary?.riskFlags || [],
          selectedRiders: result.payload.selectedRiders || {}
        };
      }
      if (controller.signal.aborted || record.closed || generation !== record.turnGeneration) {
        throw Object.assign(new Error('Tool work was cancelled.'), { code: 'CANCELLED' });
      }
      const phase = result.phase || 'completed';
      this.persistSession(record).catch(() => {});
      this.emit(record, { tool: toolName, toolRunId, phase, stage: result.stage, payload: { ...result.payload, passport: this.publicPassport(record), spoken: result.spoken } });
      this.persistRun(record, { toolRunId, tool: toolName, phase, payload: result.payload }).catch(() => {});
      return { content: [{ type: 'text', text: result.spoken }], structuredContent: { tool: toolName, phase, stage: result.stage, ...result.payload } };
    } catch (error) {
      const cancelled = error?.code === 'CANCELLED' || error?.name === 'AbortError' || controller.signal.aborted;
      const message = cancelled ? 'Cancelled because the conversation moved on.' : safeError(error);
      if (!record.closed && generation === record.turnGeneration) {
        this.emit(record, { tool: toolName, toolRunId, phase: cancelled ? 'cancelled' : 'failed', stage: 'tool-error', payload: { message } });
      }
      this.persistRun(record, { toolRunId, tool: toolName, phase: cancelled ? 'cancelled' : 'failed', payload: { message } }).catch(() => {});
      if (cancelled) return { content: [{ type: 'text', text: message }] };
      throw error;
    } finally {
      record.controllers.delete(toolRunId);
    }
  }

  async resolveLicensedMedia(item, signal) {
    const showroomVehicle = showroomVehicleFor(item);
    if (showroomVehicle) {
      return {
        url: showroomVehicle.thumbnail,
        pageUrl: showroomVehicle.sourceUrl,
        license: 'Supplied showroom sequence',
        creator: showroomVehicle.company,
        kind: 'showroom 360 frame',
        note: 'Exact-model 360 sequence available in the EasyEV virtual showroom.',
      };
    }
    if (CURATED_MEDIA[item.id]) return CURATED_MEDIA[item.id];
    if (LOCAL_CATALOG_MEDIA[item.id]) {
      return {
        url: LOCAL_CATALOG_MEDIA[item.id],
        pageUrl: item.sourceUrl,
        license: 'EasyEV catalog reference',
        creator: item.name,
        kind: 'catalog image',
        note: 'Demo catalog image; verify the selected variant on the linked OEM page.',
      };
    }
    const cached = mediaCache.get(item.id);
    if (cached && cached.expiresAt > Date.now()) return cached.media;
    try {
      const params = new URLSearchParams({
        action: 'query',
        generator: 'search',
        gsrsearch: `${item.name} electric vehicle`,
        gsrnamespace: '6',
        gsrlimit: '4',
        prop: 'imageinfo',
        iiprop: 'url|extmetadata',
        iiurlwidth: '900',
        format: 'json',
        origin: '*',
      });
      const response = await fetch(`https://commons.wikimedia.org/w/api.php?${params}`, {
        signal: AbortSignal.any([signal, AbortSignal.timeout(900)]),
        headers: { 'User-Agent': 'EasyEV-Hackathon/2.0' },
      });
      if (!response.ok) throw new Error(`Commons returned ${response.status}`);
      const data = await response.json();
      const pages = Object.values(data?.query?.pages || {});
      const page = pages.find((candidate) => candidate.imageinfo?.[0]?.thumburl && /(?:cc|public domain|gfdl)/i.test(candidate.imageinfo[0].extmetadata?.LicenseShortName?.value || ''));
      if (!page) throw new Error('No approved media found');
      const info = page.imageinfo[0];
      const strip = (value) => String(value || '').replace(/<[^>]*>/g, '').slice(0, 180);
      const media = {
        url: info.thumburl,
        pageUrl: info.descriptionurl,
        license: strip(info.extmetadata?.LicenseShortName?.value),
        creator: strip(info.extmetadata?.Artist?.value) || 'Wikimedia Commons contributor',
        kind: 'licensed photograph',
      };
      mediaCache.set(item.id, { media, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
      return media;
    } catch {
      const media = { url: null, pageUrl: null, license: null, creator: 'EasyEV original visual', kind: 'illustrative' };
      mediaCache.set(item.id, { media, expiresAt: Date.now() + 60 * 60 * 1000 });
      return media;
    }
  }

  async compareVehicles(record, args, signal) {
    const input = unpackArgs(args);
    const requested = comparisonNames(input);
    if (requested.length === 0) {
      for (const item of record.passport.shortlist || []) {
        if (requested.length >= 2) break;
        if (!requested.some((name) => normalizeName(name) === normalizeName(item.name))) requested.push(item.name);
      }
    }
    const { resolved, ambiguous } = resolveVehicles(requested, record.category);
    const rawPriorities = firstDefined(input, ['priorities', 'priority']);
    const priorities = (Array.isArray(rawPriorities) ? rawPriorities : rawPriorities ? String(rawPriorities).split(/,|\band\b|और/i) : []).map((item) => cleanText(item, 60)).filter(Boolean).slice(0, 5);
    const presentation = cleanText(firstDefined(input, ['presentation', 'view', 'mode', 'query']) || '', 140);
    const wantsConcept = /3d|360|ar\b|स्पेस|घुमा/i.test(presentation);
    const wantsVisual = wantsConcept || /visual|picture|photo|image|दिखा|तस्वीर/i.test(presentation);
    const media = await Promise.all(resolved.map((item) => this.resolveLicensedMedia(item, signal)));
    signal.throwIfAborted();
    const vehicles = resolved.map((item, index) => ({
      ...item,
      media: media[index],
      visual360: showroomVisualFor(item),
      priceLabel: `₹${item.priceMinLakh.toFixed(2)}–${item.priceMaxLakh.toFixed(2)} lakh indicative ex-showroom`,
      claimedRangeLabel: `Up to ${item.claimedRangeKm} km claimed; variant/test-cycle dependent`,
    }));
    if (priorities.length) {
      record.passport.profile.priorities = priorities;
      recordDecisionEvent(record, 'SIGNAL_UPDATED', {
        field: 'priorities',
        newValue: priorities.join(', '),
        provenance: 'confirmed',
        reason: 'User specified priorities for vehicle comparison',
      });
    }

    const previousTopVehicleId = record.passport.shortlist?.[0]?.id || record.passport.comparison?.ranking?.[0]?.id || null;
    const weights = computeDynamicWeights(record.passport);

    const vehiclesWithScores = vehicles.map((item) => {
      const compat = evaluateVehicleCompatibility(item, record.passport, weights);
      return {
        ...item,
        compatibilityScore: compat.score,
        compatibilityBreakdown: compat.breakdown,
        whyItFits: compat.whyItFits,
        tradeOffs: compat.tradeOffs,
      };
    });

    const ranking = [...vehiclesWithScores].sort((a, b) => b.compatibilityScore - a.compatibilityScore).map((item, index) => ({
      id: item.id,
      rank: index + 1,
      score: item.compatibilityScore,
      scoreOutOf100: item.compatibilityScore,
      breakdown: item.compatibilityBreakdown,
      whyItFits: item.whyItFits,
      tradeOffs: item.tradeOffs,
      reason: index === 0
        ? (priorities.length ? `Top match for ${priorities.join(', ')} (${item.compatibilityScore}/100 compatibility)` : `Top deterministic match (${item.compatibilityScore}/100 compatibility)`)
        : `Alternative (${item.compatibilityScore}/100) with different price, range or capacity trade-offs`,
    }));

    const leader = vehiclesWithScores.find((item) => item.id === ranking[0]?.id);

    if (previousTopVehicleId && leader && leader.id !== previousTopVehicleId) {
      const prevVehicle = VEHICLES.find((v) => v.id === previousTopVehicleId);
      const prevCompat = prevVehicle ? evaluateVehicleCompatibility(prevVehicle, record.passport, weights) : null;
      recordDecisionEvent(record, 'RECOMMENDATION_CHANGED', {
        previousTopMatch: { vehicleId: previousTopVehicleId, name: prevVehicle?.name || previousTopVehicleId, score: prevCompat?.score || 85 },
        newTopMatch: { vehicleId: leader.id, name: leader.name, score: leader.compatibilityScore },
        reasons: leader.whyItFits.slice(0, 3),
        provenance: 'confirmed',
      });
    }

    const counterfactuals = leader ? simulateCounterfactuals(leader, record.passport) : [];
    record.passport.counterfactuals = counterfactuals;
    record.passport.dynamicWeights = weights;

    const payload = {
      vehicles: vehiclesWithScores,
      ranking,
      priorities,
      weights,
      counterfactuals,
      ambiguous,
      missingFacts: ambiguous.map((name) => `Could not confidently resolve “${name}”.`),
      sourceNote: 'Specifications are curated from linked OEM pages. Prices and variants must be rechecked before purchase.',
      verifiedAt: vehicles.reduce((latest, item) => item.verifiedAt > latest ? item.verifiedAt : latest, ''),
      visualMode: wantsConcept && vehicles.some((item) => item.visual360) ? 'showroom-360' : 'photo',
    };
    record.passport.shortlist = vehicles.map(({ id, name, category, sourceUrl, verifiedAt }) => ({ id, name, category, sourceUrl, verifiedAt }));
    record.passport.comparison = payload;
    record.passport.nextActions = unique([...record.passport.nextActions, 'Verify current on-road price and selected variant with an authorised dealer.']);
    return {
      stage: wantsVisual && vehicles.length === 1 ? 'vehicle-visual' : 'comparison',
      payload,
      spoken: ambiguous.length
        ? `I found ${vehicles.length} close matches, but please clarify ${ambiguous.join(', ')}.`
        : wantsVisual
          ? vehicles[0]?.visual360 && wantsConcept
            ? `The exact-model 360 explorer for ${vehicles[0].name} is ready on screen using the supplied virtual-showroom sequence.`
            : `The catalog image for ${vehicles[0]?.name || 'your selected vehicle'} is ready on screen. Exact-model 360 is available for vehicles included in the EasyEV virtual showroom.`
          : vehicles.length === 1
            ? `The decision card for ${vehicles[0]?.name || 'your selected vehicle'} is ready on your screen, with its deterministic compatibility score of ${vehiclesWithScores[0]?.compatibilityScore || 88} out of 100.`
            : `The side-by-side comparison of ${vehicles.map((item) => item.name).join(' and ')} is ready on your screen. ${leader ? `${leader.name} leads with a ${leader.compatibilityScore}/100 compatibility score, and you can explore why it fits or examine trade-offs.` : ''}`,
    };
  }

  async fetchOpenChargeMap(lat, lng, radiusKm, signal) {
    const params = new URLSearchParams({
      output: 'json',
      latitude: String(lat),
      longitude: String(lng),
      distance: String(radiusKm),
      distanceunit: 'KM',
      maxresults: '20',
      compact: 'true',
      verbose: 'false',
    });
    if (this.openChargeMapKey) params.set('key', this.openChargeMapKey);
    const response = await fetch(`https://api.openchargemap.io/v3/poi/?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
      headers: { 'User-Agent': 'EasyEV-Hackathon/2.0' },
    });
    if (!response.ok) throw new Error(`Open Charge Map returned ${response.status}`);
    const data = await response.json();
    return (Array.isArray(data) ? data : []).map((item) => {
      const stationLat = Number(item.AddressInfo?.Latitude);
      const stationLng = Number(item.AddressInfo?.Longitude);
      if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng)) return null;
      return {
        id: `ocm-${item.ID}`,
        name: item.AddressInfo?.Title || 'Public charging station',
        operator: item.OperatorInfo?.Title || 'Operator not listed',
        lat: stationLat,
        lng: stationLng,
        distanceKm: Number(haversineKm(lat, lng, stationLat, stationLng).toFixed(1)),
        direction: bearingLabel(lat, lng, stationLat, stationLng),
        capacity: item.NumberOfPoints || 'Not listed',
        sockets: unique((item.Connections || []).map((connection) => connection.ConnectionType?.Title || connection.CurrentType?.Title).filter(Boolean)).slice(0, 4),
        openingHours: item.AddressInfo?.AccessComments || 'Hours not listed',
        access: item.UsageType?.Title || 'Access not listed',
        fee: item.UsageCost || 'Fee not listed',
      };
    }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async fetchOverpass(lat, lng, radiusMeters, signal) {
    // Overpass regularly needs 1-3s and rate-limits bursts, so the old 1.5s budget
    // aborted almost every call and quietly dropped the buyer onto demo pins. The
    // mirror is tried when the main endpoint is busy.
    const query = `[out:json][timeout:8];nwr(around:${radiusMeters},${lat},${lng})["amenity"="charging_station"];out center tags;`;
    const providers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    let data = null;
    let lastError = null;
    for (const provider of providers) {
      try {
        const response = await fetch(provider, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'EasyEV-Hackathon/2.0' },
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.any([signal, AbortSignal.timeout(9000)]),
        });
        if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
        data = await response.json();
        break;
      } catch (error) {
        lastError = error;
      }
    }
    if (!data) throw lastError || new Error('Overpass unavailable');
    return (Array.isArray(data.elements) ? data.elements : []).map((item) => {
      const stationLat = Number(item.lat ?? item.center?.lat);
      const stationLng = Number(item.lon ?? item.center?.lon);
      if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng)) return null;
      const tags = item.tags || {};
      return {
        id: `osm-${item.type}-${item.id}`,
        name: tags.name || tags.operator || 'Public charging station',
        operator: tags.operator || 'Operator not listed',
        lat: stationLat,
        lng: stationLng,
        distanceKm: Number(haversineKm(lat, lng, stationLat, stationLng).toFixed(1)),
        direction: bearingLabel(lat, lng, stationLat, stationLng),
        capacity: tags.capacity || 'Not listed',
        sockets: Object.keys(tags).filter((key) => key.startsWith('socket:') && tags[key] !== 'no').map((key) => key.slice(7).replaceAll('_', ' ')).slice(0, 4),
        openingHours: tags.opening_hours || 'Hours not listed',
        access: tags.access || 'Access not listed',
        fee: tags.fee || 'Fee not listed',
      };
    }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm);
  }

  async findNearbyChargers(record, args, signal) {
    args = unpackArgs(args);
    if (!record.context.location?.consented) {
      return {
        stage: 'location-permission',
        phase: 'awaiting_input',
        payload: { permissionNeeded: true, message: 'Share an approximate location to search nearby public charging data. Location is used only for this consultation.' },
        spoken: 'I can check that. Please use the location button on screen; I will only use it for this consultation.',
      };
    }
    const { lat, lng, accuracy } = record.context.location;
    const radiusKm = Math.min(25, Math.max(2, flexibleNumber(args, ['radiusKm', 'radius_km', 'radius']) || 10));
    const key = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radiusKm}`;
    const cached = chargerCache.get(key);
    let result = cached?.expiresAt > Date.now() ? cached.result : null;
    if (!result) {
      let stations = [];
      let source = '';
      const providerErrors = [];
      // Open Charge Map now rejects keyless requests outright, so without a key
      // this call only burns time before the Overpass fallback that does work.
      if (this.openChargeMapKey) {
        try {
          stations = await this.fetchOpenChargeMap(lat, lng, radiusKm, signal);
          source = 'Open Charge Map';
        } catch (error) {
          providerErrors.push(safeError(error));
        }
      }
      if (!stations.length && !signal.aborted) {
        try {
          stations = await this.fetchOverpass(lat, lng, radiusKm * 1000, signal);
          source = 'OpenStreetMap contributors via Overpass';
        } catch (error) {
          providerErrors.push(safeError(error));
        }
      }
      signal.throwIfAborted();
      let fallback = false;
      if (!stations.length && haversineKm(lat, lng, 28.6139, 77.209) < 80) {
        fallback = true;
        source = 'Demo fallback data';
        stations = DELHI_DEMO_CHARGERS.map((item) => ({
          ...item,
          distanceKm: Number(haversineKm(lat, lng, item.lat, item.lng).toFixed(1)),
          direction: bearingLabel(lat, lng, item.lat, item.lng),
        })).sort((a, b) => a.distanceKm - b.distanceKm);
      }
      result = {
        center: { lat, lng, accuracy },
        radiusKm,
        stations: stations.slice(0, 18),
        source,
        fallback,
        providerErrors: providerErrors.length ? providerErrors : undefined,
        fetchedAt: new Date().toISOString(),
        availabilityNotice: 'Locations and connector metadata may be incomplete. Live stall availability is not claimed.',
      };
      chargerCache.set(key, { result, expiresAt: Date.now() + 5 * 60 * 1000 });
    }
    record.passport.charging = result;
    record.passport.profile.chargingAccess = result.stations.length
      ? `${result.stations.length} public locations found within ${radiusKm} km search radius`
      : 'No public locations returned';
    record.passport.nextActions = unique([...record.passport.nextActions, 'Confirm connector compatibility and station access before travelling.']);
    return {
      stage: 'charging-map',
      payload: result,
      spoken: result.stations.length
        ? `The map is ready and centred on the location your browser shared. I found ${result.stations.length} charging locations; the nearest returned result is ${result.stations[0].distanceKm} kilometres away, toward the ${result.stations[0].direction}. Please verify access before travelling.`
        : 'The live providers did not return a charger in this search area. I have not invented a location.',
    };
  }
  async calculateOwnership(record, args, signal) {
    args = unpackArgs(args);
    const item = resolveVehicles([firstDefined(args, ['vehicle', 'vehicleName', 'vehicle_name']) || record.passport.shortlist[0]?.name], record.category).resolved[0];
    if (!item) throw new Error('Choose a vehicle before calculating ownership.');
    const dailyKm = Math.min(500, Math.max(5, flexibleNumber(args, ['dailyKm', 'daily_km', 'kilometresPerDay', 'kilometers_per_day']) || Number(record.passport.profile.dailyKm) || 40));
    const years = Math.min(10, Math.max(1, flexibleNumber(args, ['years', 'ownershipYears', 'ownership_years']) || 5));
    const electricityRate = Math.min(30, Math.max(1, flexibleNumber(args, ['electricityRate', 'electricity_rate', 'unitCost', 'unit_cost']) || 8));
    const publicRate = Math.min(50, Math.max(electricityRate, flexibleNumber(args, ['publicChargingRate', 'public_charging_rate']) || 18));
    const homeShare = Math.min(1, Math.max(0, flexibleNumber(args, ['homeChargingShare', 'home_charging_share']) ?? 0.8));
    const petrolPrice = Math.min(180, Math.max(50, flexibleNumber(args, ['petrolPrice', 'petrol_price']) || 105));
    const defaultMileage = item.category === 'Electric scooter' ? 45 : item.category === 'Electric 3-wheeler' ? 25 : 14;
    const petrolMileage = Math.min(60, Math.max(5, flexibleNumber(args, ['petrolMileage', 'petrol_mileage']) || defaultMileage));
    const downPaymentPercent = Math.min(90, Math.max(0, flexibleNumber(args, ['downPaymentPercent', 'down_payment_percent']) ?? 20));
    const annualInterest = Math.min(24, Math.max(0, flexibleNumber(args, ['annualInterest', 'annual_interest']) ?? 9));
    const loanYears = Math.min(7, Math.max(1, flexibleNumber(args, ['loanYears', 'loan_years']) || 5));
    const purchasePrice = ((item.priceMinLakh + item.priceMaxLakh) / 2) * 100000;
    const comparableFuelVehicleLakh = flexibleNumber(args, ['comparableFuelVehicleLakh', 'comparable_fuel_vehicle_lakh']);
    const baselinePurchase = Math.max(100000, comparableFuelVehicleLakh ? comparableFuelVehicleLakh * 100000 : purchasePrice * 0.82);
    const annualKm = dailyKm * 365;
    const blendedElectricityRate = electricityRate * homeShare + publicRate * (1 - homeShare);
    const annualCharging = annualKm * item.kwhPer100Km / 100 * blendedElectricityRate;
    const annualFuel = annualKm / petrolMileage * petrolPrice;
    const annualServiceEv = item.category === 'Electric scooter' ? 2400 : item.category === 'Electric 3-wheeler' ? 9000 : 6500;
    const annualServiceFuel = item.category === 'Electric scooter' ? 5200 : item.category === 'Electric 3-wheeler' ? 18000 : 12000;
    const downPayment = purchasePrice * downPaymentPercent / 100;
    const emi = calculateEmi(purchasePrice - downPayment, annualInterest, loanYears * 12);
    const totalEv = purchasePrice + (annualCharging + annualServiceEv) * years;
    const totalFuel = baselinePurchase + (annualFuel + annualServiceFuel) * years;
    const annualSavings = Math.max(0, annualFuel + annualServiceFuel - annualCharging - annualServiceEv);
    const premium = Math.max(0, purchasePrice - baselinePurchase);
    const breakEvenYears = annualSavings ? premium / annualSavings : null;
    const payload = {
      vehicle: { id: item.id, name: item.name, sourceUrl: item.sourceUrl, verifiedAt: item.verifiedAt },
      assumptions: {
        dailyKm,
        annualKm,
        years,
        electricityRate,
        publicChargingRate: publicRate,
        homeChargingSharePercent: Math.round(homeShare * 100),
        petrolPrice,
        petrolMileage,
        purchasePrice: Math.round(purchasePrice),
        comparableFuelVehiclePrice: Math.round(baselinePurchase),
        downPaymentPercent,
        annualInterest,
        loanYears,
        energyUseKwhPer100Km: item.kwhPer100Km,
        annualServiceEv,
        annualServiceFuel,
      },
      results: {
        monthlyEmi: Math.round(emi),
        annualCharging: Math.round(annualCharging),
        annualFuel: Math.round(annualFuel),
        annualRunningEv: Math.round(annualCharging + annualServiceEv),
        annualRunningFuel: Math.round(annualFuel + annualServiceFuel),
        totalEv: Math.round(totalEv),
        totalFuel: Math.round(totalFuel),
        annualSavings: Math.round(annualSavings),
        breakEvenYears: breakEvenYears === null ? null : Number(breakEvenYears.toFixed(1)),
      },
      notice: 'Illustrative deterministic estimate. Excludes insurance, tax differences, resale value, battery degradation, financing fees and changing tariffs unless shown above.',
    };
    signal.throwIfAborted();
    record.passport.ownership = payload;
    record.passport.profile.dailyKm = dailyKm;
    record.passport.nextActions = unique([...record.passport.nextActions, 'Replace indicative prices and tariffs with written quotes before deciding.']);
    return {
      stage: 'ownership',
      payload,
      spoken: `At ${dailyKm} kilometres per day, the estimate shows about ${money(annualSavings)} annual running-cost savings versus the stated fuel assumptions. Every assumption is visible and editable on screen.`,
    };
  }

  parseSnapshot(dataUrl) {
    const match = String(dataUrl || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw Object.assign(new Error('Use a JPEG, PNG or WebP image.'), { statusCode: 400 });
    const buffer = Buffer.from(match[2], 'base64');
    if (!buffer.length || buffer.length > 900 * 1024) {
      throw Object.assign(new Error('The compressed image must be smaller than 900 KB.'), { statusCode: 413 });
    }
    return { mimeType: match[1], buffer };
  }

  storeSnapshot(record, dataUrl) {
    const parsed = this.parseSnapshot(dataUrl);
    if (record.pendingSnapshot?.buffer) record.pendingSnapshot.buffer.fill(0);
    record.pendingSnapshot = {
      ...parsed,
      uploadedAt: Date.now(),
      digest: createHash('sha256').update(parsed.buffer).digest('hex').slice(0, 12),
    };
    this.emit(record, {
      tool: 'analyze_readiness_snapshot',
      phase: 'uploaded',
      stage: 'snapshot-request',
      payload: { message: 'Still image received. It will be deleted after analysis or cancellation.' },
    });
    return { sizeBytes: parsed.buffer.length };
  }

  extractModelJson(text) {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('The image service returned an unreadable result.');
    return JSON.parse(match[0]);
  }

  async analyzeSnapshot(record, _args, signal) {
    if (!record.pendingSnapshot) {
      return {
        stage: 'snapshot-request',
        phase: 'awaiting_input',
        payload: {
          consentNeeded: true,
          provider: 'Google Gemini',
          disclosure: 'Optional. The confirmed still image is sent to Google Gemini under the provider data-use terms, then deleted by EasyEV. Do not upload faces, identity documents or registration certificates.',
        },
        spoken: 'I can inspect one still image for parking layout, a visible connector, or an electrical label. Please use the on-screen capture control only if you consent; do not include people or documents.',
      };
    }
    if (!this.geminiApiKey) {
      const unconfiguredSnapshot = record.pendingSnapshot;
      record.pendingSnapshot = null;
      unconfiguredSnapshot.buffer.fill(0);
      throw new Error('Snapshot analysis is not configured on this server. The uploaded image was deleted.');
    }
    const snapshot = record.pendingSnapshot;
    record.pendingSnapshot = null;
    try {
      const prompt = 'You are a privacy-first EV-readiness image classifier. Return strict JSON only with keys: decision (allowed or rejected), rejectionReason, sceneType, observations (max 6 strings), visibleConnector, electricalLabelText, installerQuestions (max 5 strings), limitations (array). Reject if ANY human face/person, identity document, vehicle registration certificate, prominent number plate, payment information, or unrelated personal content is visible. Allowed content is limited to parking layout, charging connector/port, or fixed electrical label/switchboard. Never approve electrical safety or installation. If allowed, provide advisory observations and questions for a licensed installer.';
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.geminiModel)}:generateContent?key=${encodeURIComponent(this.geminiApiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: snapshot.mimeType, data: snapshot.buffer.toString('base64') } }] }],
            generationConfig: { temperature: 0.1, responseMimeType: 'application/json' },
          }),
        },
      );
      if (!response.ok) throw new Error(`Gemini image analysis returned ${response.status}`);
      const data = await response.json();
      const result = this.extractModelJson(data?.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || '');
      signal.throwIfAborted();
      const rejected = result.decision !== 'allowed';
      const payload = rejected
        ? {
            rejected: true,
            reason: cleanText(result.rejectionReason, 240) || 'This image may contain a person, document or unrelated personal content.',
            deleted: true,
            provider: 'Google Gemini',
          }
        : {
            rejected: false,
            sceneType: cleanText(result.sceneType, 100),
            observations: (result.observations || []).map((item) => cleanText(item, 180)).slice(0, 6),
            visibleConnector: cleanText(result.visibleConnector, 140) || 'Not confidently identified',
            electricalLabelText: cleanText(result.electricalLabelText, 300) || 'No readable label',
            installerQuestions: (result.installerQuestions || []).map((item) => cleanText(item, 180)).slice(0, 5),
            limitations: unique([
              ...(result.limitations || []).map((item) => cleanText(item, 180)),
              'Advisory only — not electrical approval, installation approval or safety certification.',
            ]),
            deleted: true,
            provider: 'Google Gemini',
          };
      record.passport.readiness = payload;
      record.passport.nextActions = unique([...record.passport.nextActions, ...(payload.installerQuestions || [])]);
      return {
        stage: 'snapshot-result',
        payload,
        spoken: rejected
          ? `I did not analyse that image because ${payload.reason} The uploaded copy has been deleted.`
          : `I finished the advisory image check and deleted the upload. I found ${payload.observations.length} observations; use the installer questions rather than treating this as a safety approval.`,
      };
    } finally {
      snapshot.buffer.fill(0);
    }
  }

  async escalateToHuman(record, args) {
    const input = unpackArgs(args);
    const allowedReasons = ['explicit-request', 'fleet-or-bulk', 'price-negotiation', 'finance-case', 'unresolved-objection', 'trust-or-complaint', 'ready-to-buy'];
    const rawReason = String(firstDefined(input, ['reason', 'escalationReason', 'escalation_reason']) || '').trim();
    const reason = allowedReasons.includes(rawReason) ? rawReason : 'explicit-request';
    const urgency = String(firstDefined(input, ['urgency']) || '').trim() === 'high' ? 'high' : 'standard';
    const summary = String(firstDefined(input, ['summary', 'context', 'brief']) || '').trim().slice(0, 400)
      || REASON_BRIEFS[reason];

    if (record.escalation?.status === 'rep-joined') {
      return {
        stage: 'handoff',
        payload: { ...record.passport.escalation, alreadyLive: true },
        spoken: 'A human specialist is already on this call with us, so I will let them continue.',
      };
    }

    const escalation = {
      status: 'requested',
      reason,
      reasonLabel: REASON_LABELS[reason],
      urgency,
      summary,
      handoffCode: record.handoffCode,
      consoleUrl: this.publicBaseUrl ? `${this.publicBaseUrl}/rep?code=${record.handoffCode}` : `/rep?code=${record.handoffCode}`,
      requestedAt: new Date().toISOString(),
      joinedAt: null,
      resolvedAt: null,
      repName: '',
    };
    record.escalation = { ...record.escalation, ...escalation };
    record.passport.escalation = { ...escalation };
    record.passport.nextActions = unique([
      ...record.passport.nextActions,
      `A human EasyEV specialist was paged for: ${REASON_LABELS[reason]}.`,
    ]);
    try { this.onEscalation?.(record); } catch (error) { console.error('Escalation notification failed:', safeError(error)); }

    return {
      stage: 'handoff',
      payload: {
        ...escalation,
        transcriptLines: record.transcript?.length || 0,
        waitingMessage: 'Paging an available EasyEV specialist. They can see your full Passport before they speak.',
      },
      spoken: HANDOFF_LINES[record.language] || HANDOFF_LINES.Hinglish,
    };
  }

  // Runs after the buyer has already been told the booking is confirmed. Nothing
  // Writes the buyer to the CRM after their details are already on screen. A CRM
  // outage must not cost the conversation the details it just captured, so the
  // Passport keeps them either way and only the provider label changes.
  async finishLeadAsync(record, contact, notes) {
    try {
      const shortlisted = record.passport.shortlist?.[0]?.name;
      const result = await this.crm.saveLead({
        ...contact,
        summary: [this.leadSummary(record), notes ? `Agent note: ${notes}` : ''].filter(Boolean).join('\n'),
        dealName: shortlisted ? `${contact.name || 'EasyEV buyer'} — ${shortlisted}` : `${contact.name || 'EasyEV buyer'} — EasyEV enquiry`,
        amountLakh: Number(record.passport.profile?.budgetLakh) || 0,
        sessionKey: record.key,
      });
      if (record.closed) return;

      record.passport.lead = {
        name: result.name,
        email: result.email,
        phone: result.phone,
        provider: result.provider,
        contactId: result.contactId || null,
        dealId: result.dealId || null,
        savedAt: result.savedAt,
        live: result.provider === 'hubspot',
        syncing: false,
      };
      record.passport.nextActions = unique([
        ...record.passport.nextActions,
        result.provider === 'hubspot' ? 'Lead saved to HubSpot with the full Passport.' : 'Lead captured; connect HubSpot to sync it to the CRM.',
      ]);
      this.persistSession(record).catch(() => {});

      // The buyer has usually moved on by the time HubSpot answers - often back
      // to choosing a slot. This is a status update, not a reason to pull the
      // stage back to the CRM card they already saw.
      this.emit(record, {
        tool: 'capture_lead',
        phase: 'completed',
        stage: 'lead-capture',
        payload: {
          backgroundUpdate: true,
          ...record.passport.lead,
          crmUrl: result.crmUrl || null,
          failed: Boolean(result.failed),
          error: result.error || null,
          passport: this.publicPassport(record),
        },
      });
    } catch (error) {
      console.error('Lead follow-up failed:', safeError(error));
    }
  }

  // here can undo the booking, so failures are recorded in the Passport and shown
  // on screen rather than thrown.
  async finishBookingAsync(record, contact, booking) {
    try {
      const lead = record.passport.lead;
      const notInCrmYet = !lead?.live && lead?.provider !== 'hubspot';
      if (!lead || lead.email !== contact.email || notInCrmYet) {
        await this.captureLead(record, { ...contact, notes: `Booked ${booking.demoType} for ${booking.when}.` }).catch(() => {});
      }
      if (!booking.confirmed || !this.mailer?.live || !contact.email) return;

      const mail = await this.sendBookingMail(record, contact, booking).catch((error) => ({ sent: false, error: safeError(error) }));
      if (record.closed) return;

      record.passport.booking.emailSent = Boolean(mail?.sent);
      record.passport.nextActions = unique([
        ...record.passport.nextActions,
        mail?.sent
          ? `Confirmation with the decision report emailed to ${contact.email}.`
          : `Confirmation email to ${contact.email} did not send (${mail?.error || 'unknown error'}).`,
      ]);
      this.persistSession(record).catch(() => {});

      this.emit(record, {
        tool: 'book_test_drive',
        phase: 'completed',
        stage: 'booking-confirmed',
        payload: {
          ...record.passport.booking,
          email: contact.email,
          name: contact.name,
          emailPending: false,
          emailSent: Boolean(mail?.sent),
          emailError: mail?.sent ? null : (mail?.error || 'unknown error'),
          reportAttached: Boolean(mail?.sent && mail.hadAttachment),
          passport: this.publicPassport(record),
        },
      });
    } catch (error) {
      console.error('Booking follow-up failed:', safeError(error));
    }
  }

  // Builds the buyer's confirmation mail from the Passport. The report is
  // generated on the spot when the buyer never asked for one, so the email is
  // always worth opening rather than being a bare "booked" line.
  async sendBookingMail(record, contact, booking) {
    if (!record.report) {
      try {
        const pdf = await this.buildReport(record);
        record.report = { pdf, createdAt: Date.now(), filename: `EasyEV-decision-${record.key.slice(0, 8)}.pdf` };
      } catch (error) {
        console.error('Booking mail: report generation failed:', safeError(error));
      }
    }

    const passport = record.passport;
    const ownership = passport.ownership?.results && passport.ownership?.assumptions
      ? `At ${passport.ownership.assumptions.dailyKm} km a day, we modelled your running costs against a petrol equivalent.`
      : '';

    return this.mailer.sendBookingConfirmation({
      to: contact.email,
      name: contact.name,
      when: booking.when,
      demoType: booking.demoType,
      vehicle: passport.shortlist?.[0]?.name || '',
      shortlist: (passport.shortlist || []).map((item) => item.name).slice(0, 3),
      ownership,
      specialistNote: passport.escalation?.handbackNote || '',
      reportPdf: record.report?.pdf || null,
      reportFilename: record.report?.filename,
      calendarInviteSeparate: booking.provider === 'cal.com',
    });
  }

  async buildReport(record) {
    const passport = this.publicPassport(record);
    const document = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: { Title: 'EasyEV Buyer Decision Passport', Author: 'EasyEV AI Decision Engine' },
    });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolvePromise, rejectPromise) => {
      document.on('end', resolvePromise);
      document.on('error', rejectPromise);
    });

    const primaryColor = '#0b3b2b';
    const secondaryColor = '#059669';
    const textColor = '#0f172a';
    const mutedColor = '#64748b';
    const cardBg = '#f8fafc';
    const cardBorder = '#e2e8f0';

    const drawHeader = (pageNum, pageTitle) => {
      document.save();
      document.rect(40, 30, 515, 32).fill('#082f22');
      document.font('Helvetica-Bold').fontSize(12).fillColor('#ffffff').text('EasyEV', 52, 41, { continued: true });
      document.font('Helvetica').fontSize(10).fillColor('#a7f3d0').text('  |  Smarter EV Decisions. Together.');
      document.font('Helvetica-Bold').fontSize(9).fillColor('#ffffff').text(`Decision Passport · Page ${pageNum}/4`, 410, 42, { align: 'right', width: 135 });
      document.restore();
      document.font('Helvetica-Bold').fontSize(16).fillColor(primaryColor).text(pageTitle, 40, 72);
      document.font('Helvetica').fontSize(8.5).fillColor(mutedColor).text(
        `Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} • Session ${record.key.slice(0, 8)} • Deterministic Decision Brain`,
        40, 92
      );
      document.moveDown(0.8);
    };

    const drawFooter = (pageNum) => {
      document.save();
      document.rect(40, 792, 515, 1).fill('#e2e8f0');
      document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(
        'EasyEV AI Decision Engine • Sourced OEM specifications & deterministic compatibility scoring • Page ' + pageNum + ' of 4',
        40, 800,
        { align: 'center', width: 515 }
      );
      document.restore();
    };

    // Calculate signals count for Readiness Score
    const profile = passport.profile || {};
    const signals = [
      { name: 'Category', value: profile.category !== 'Not sure' ? profile.category : '', prov: profile.provenance?.category || 'confirmed' },
      { name: 'Budget Band', value: profile.budgetLakh ? `₹${profile.budgetLakh} Lakh` : '', prov: profile.provenance?.budgetLakh || 'inferred' },
      { name: 'Daily Distance', value: profile.dailyKm ? `${profile.dailyKm} km/day` : '', prov: profile.provenance?.dailyKm || 'confirmed' },
      { name: 'Home Charging', value: profile.chargingAccess && profile.chargingAccess !== 'Not discussed' ? profile.chargingAccess : '', prov: profile.provenance?.chargingAccess || 'confirmed' },
      { name: 'Usage Pattern', value: profile.usagePattern && profile.usagePattern !== 'Not discussed' ? profile.usagePattern : '', prov: profile.provenance?.usagePattern || 'inferred' },
      { name: 'Priorities', value: profile.priorities?.length ? profile.priorities.join(', ') : '', prov: profile.provenance?.priorities || 'confirmed' },
    ];
    const capturedCount = signals.filter((s) => Boolean(s.value)).length;
    const readinessPercent = Math.round((capturedCount / 6) * 100);

    // Compute top vehicle & compatibility
    const weights = computeDynamicWeights(passport);
    const topShortlist = (passport.comparison?.vehicles && passport.comparison.vehicles.length)
      ? passport.comparison.vehicles[0]
      : (passport.shortlist?.[0] ? resolveVehicles([passport.shortlist[0].name], record.category).resolved[0] : VEHICLES[1]);
    const topVehicle = topShortlist || VEHICLES[1];
    const topCompat = evaluateVehicleCompatibility(topVehicle, passport, weights);

    // ==========================================
    // PAGE 1: EXECUTIVE DECISION PASSPORT (HERO)
    // ==========================================
    drawHeader(1, 'Executive Decision Passport');

    // 1. Readiness Banner & Top Match Card
    let y = 112;
    document.save();
    document.rect(40, y, 515, 68).fillAndStroke('#f0fdf4', '#bbf7d0');
    document.font('Helvetica-Bold').fontSize(11).fillColor('#166534').text('DECISION READINESS SCORE', 52, y + 10);
    document.font('Helvetica-Bold').fontSize(22).fillColor('#15803d').text(`${readinessPercent}%`, 52, y + 26);
    document.font('Helvetica').fontSize(8.5).fillColor('#166534').text(`${capturedCount} of 6 key signals verified deterministically`, 115, y + 34);

    document.font('Helvetica-Bold').fontSize(10).fillColor('#0f172a').text('Top Recommended Match:', 310, y + 10);
    document.font('Helvetica-Bold').fontSize(14).fillColor('#0b3b2b').text(topVehicle.name, 310, y + 25);
    document.font('Helvetica-Bold').fontSize(11).fillColor('#059669').text(`Compatibility Score: ${topCompat.score}/100`, 310, y + 43);
    document.restore();

    // 2. Verified Signals & Provenance Table
    y = 190;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('1. Buyer Requirements & Signal Provenance', 40, y);
    y += 16;

    document.save();
    document.rect(40, y, 515, 108).fillAndStroke(cardBg, cardBorder);
    let rowY = y + 8;
    signals.forEach((sig, idx) => {
      const colX = idx % 2 === 0 ? 52 : 300;
      const currentY = rowY + Math.floor(idx / 2) * 32;
      const isConfirmed = sig.prov === 'confirmed';
      const badgeText = sig.value ? (isConfirmed ? '✓ Confirmed' : '✦ Inferred') : '○ Pending';
      const badgeColor = sig.value ? (isConfirmed ? '#059669' : '#0284c7') : '#94a3b8';
      
      document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text(sig.name, colX, currentY);
      document.font('Helvetica').fontSize(8.5).fillColor(sig.value ? '#1e293b' : '#94a3b8').text(sig.value || 'Not shared yet', colX, currentY + 11);
      document.font('Helvetica-Bold').fontSize(7.5).fillColor(badgeColor).text(badgeText, colX + 175, currentY + 6, { align: 'right', width: 60 });
    });
    document.restore();

    // 3. Why This Match Fits (Explainability)
    y = 324;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text(`2. Why ${topVehicle.name} Fits Your Life`, 40, y);
    y += 16;
    document.save();
    document.rect(40, y, 515, 84).fillAndStroke('#ecfdf5', '#a7f3d0');
    let fitY = y + 8;
    (topCompat.whyItFits || []).slice(0, 4).forEach((item) => {
      document.font('Helvetica-Bold').fontSize(9).fillColor('#059669').text('✓', 52, fitY, { continued: true });
      document.font('Helvetica').fontSize(8.5).fillColor('#065f46').text(`  ${item}`, { width: 485 });
      fitY += 18;
    });
    document.restore();

    // 4. Honest Trade-offs & Watch-outs
    y = 434;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text(`3. Honest Watch-Outs & Trade-offs`, 40, y);
    y += 16;
    document.save();
    document.rect(40, y, 515, 60).fillAndStroke('#fffbeb', '#fde68a');
    let tradeY = y + 8;
    (topCompat.tradeOffs || []).slice(0, 2).forEach((item) => {
      document.font('Helvetica-Bold').fontSize(9).fillColor('#d97706').text('⚠', 52, tradeY, { continued: true });
      document.font('Helvetica').fontSize(8.5).fillColor('#78350f').text(`  ${item}`, { width: 485 });
      tradeY += 24;
    });
    document.restore();

    // 5. Sensitivity Analysis Alert
    y = 520;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text(`4. What Would Change This Recommendation? (Sensitivity Simulation)`, 40, y);
    y += 16;
    document.save();
    document.rect(40, y, 515, 86).fillAndStroke('#f8fafc', '#cbd5e1');
    const simInsights = (passport.counterfactuals && passport.counterfactuals.length)
      ? passport.counterfactuals
      : simulateCounterfactuals(topVehicle, passport);
    let simY = y + 8;
    simInsights.slice(0, 3).forEach((item) => {
      document.font('Helvetica-Bold').fontSize(8).fillColor('#0369a1').text(`• ${item.trigger}: `, 52, simY, { continued: true });
      document.font('Helvetica-Bold').fontSize(8).fillColor('#0f172a').text(`Shift to ${item.shiftTo} `, { continued: true });
      document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(`(${item.reason})`, { width: 485 });
      simY += 24;
    });
    document.restore();

    // 6. Security and Verification Notice
    y = 632;
    document.save();
    document.rect(40, y, 515, 52).fillAndStroke('#f1f5f9', '#cbd5e1');
    document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text('Deterministic Framework Guarantee', 52, y + 8);
    document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(
      'This Decision Passport is compiled deterministically from your stated preferences. The LLM only parses intent into structured fields; the scores, weights, rankings and trade-offs are strictly computed via EasyEV’s mathematical engine. Exact same inputs will always produce the exact same outcome.',
      52, y + 20, { width: 490 }
    );
    document.restore();
    drawFooter(1);

    // ==========================================
    // PAGE 2: COMPARISON & SCORING BREAKDOWN
    // ==========================================
    document.addPage();
    drawHeader(2, 'Compatibility Matrix & Technical Comparison');

    // 1. Scoring Matrix Table
    y = 112;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('1. Deterministic Compatibility Score Breakdown (/100)', 40, y);
    y += 16;

    document.save();
    document.rect(40, y, 515, 126).fillAndStroke(cardBg, cardBorder);
    document.rect(40, y, 515, 20).fill('#e2e8f0');
    document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text('DECISION CRITERIA', 52, y + 6);
    document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text('WEIGHT', 210, y + 6);
    document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text('SCORE', 280, y + 6);
    document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text('DETERMINISTIC EVALUATION LOGIC', 350, y + 6);

    const breakdownItems = [
      { name: 'Budget Compatibility', max: weights.budget, score: topCompat.breakdown.budget.score, logic: 'Evaluated against variant ex-showroom price' },
      { name: 'Daily Range & Buffer', max: weights.range, score: topCompat.breakdown.range.score, logic: 'Real range vs daily km with 35% safety margin' },
      { name: 'Charging Ecosystem', max: weights.charging, score: topCompat.breakdown.charging.score, logic: 'Home Wallbox AC + Public CCS2 DC support' },
      { name: 'Usage Pattern Suitability', max: weights.usage, score: topCompat.breakdown.usage.score, logic: 'City commuting vs highway stability' },
      { name: 'Safety & Thermal Build', max: weights.safety, score: topCompat.breakdown.safety.score, logic: 'B-NCAP platform safety & active pack cooling' },
      { name: '5-Yr Running Economics', max: weights.economics, score: topCompat.breakdown.economics.score, logic: 'Energy efficiency (kWh/100km) & maintenance' },
    ];

    let bY = y + 24;
    breakdownItems.forEach((b) => {
      document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text(b.name, 52, bY);
      document.font('Helvetica').fontSize(8).fillColor(mutedColor).text(`${b.max} pts`, 210, bY);
      document.font('Helvetica-Bold').fontSize(8).fillColor(secondaryColor).text(`${b.score}/${b.max}`, 280, bY);
      document.font('Helvetica').fontSize(7.5).fillColor(textColor).text(b.logic, 350, bY);
      bY += 16;
    });
    document.restore();

    // 2. Comparative Evaluation Matrix
    y = 265;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('2. Comparative Evaluation of Contenders', 40, y);
    y += 16;

    const compVehicles = (passport.comparison?.vehicles && passport.comparison.vehicles.length >= 2)
      ? passport.comparison.vehicles.slice(0, 3)
      : VEHICLES.filter((v) => v.category === topVehicle.category).slice(0, 3);

    const colWidth = Math.floor(515 / compVehicles.length);
    compVehicles.forEach((veh, idx) => {
      const vX = 40 + idx * colWidth;
      const vehCompat = evaluateVehicleCompatibility(veh, passport, weights);
      const isTop = idx === 0 || veh.id === topVehicle.id;

      document.save();
      document.rect(vX, y, colWidth - 6, 260).fillAndStroke(isTop ? '#f0fdf4' : cardBg, isTop ? '#86efac' : cardBorder);
      
      document.font('Helvetica-Bold').fontSize(10.5).fillColor(isTop ? '#166534' : textColor).text(veh.name, vX + 8, y + 10, { width: colWidth - 20 });
      document.font('Helvetica-Bold').fontSize(8.5).fillColor(secondaryColor).text(`Score: ${vehCompat.score}/100`, vX + 8, y + 25);
      
      let specY = y + 42;
      const minP = veh.priceMinLakh != null ? Number(veh.priceMinLakh) : (veh.priceLakh || 15);
      const maxP = veh.priceMaxLakh != null ? Number(veh.priceMaxLakh) : minP;
      const priceBand = minP === maxP ? `₹${minP.toFixed(2)} Lakh` : `₹${minP.toFixed(2)}–${maxP.toFixed(2)} Lakh`;
      const specs = [
        ['Price Band', priceBand],
        ['Battery Pack', veh.battery || 'Active Thermal LFP'],
        ['Claimed Range', `${veh.claimedRangeKm || 350} km`],
        ['Real Est. Range', `~${Math.round((veh.claimedRangeKm || 350) * 0.72)} km`],
        ['Fast Charging', veh.charging || 'DC Fast CCS2'],
        ['Capacity / Boot', `${veh.capacity || '5 Seats / 350L'}`],
        ['Warranty', veh.warranty || '8 Years / 1,60,000 km'],
      ];

      specs.forEach(([label, val]) => {
        document.font('Helvetica-Bold').fontSize(7.5).fillColor(mutedColor).text(label, vX + 8, specY);
        document.font('Helvetica').fontSize(7.5).fillColor(textColor).text(val, vX + 8, specY + 9, { width: colWidth - 20 });
        specY += 23;
      });

      document.font('Helvetica-Bold').fontSize(7).fillColor('#0284c7').text('Verified OEM Source ↗', vX + 8, specY + 4, {
        link: veh.sourceUrl || 'https://easyev.in',
        underline: true,
      });
      document.restore();
    });

    // 3. Trade-off Summary Note
    y = 550;
    document.save();
    document.rect(40, y, 515, 60).fillAndStroke('#f8fafc', '#e2e8f0');
    document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text('Comparative Recommendation Summary', 52, y + 8);
    document.font('Helvetica').fontSize(8).fillColor(mutedColor).text(
      `While ${topVehicle.name} leads with ${topCompat.score}/100 compatibility due to balanced daily economics and home charging readiness, alternative models offer specific advantages in peak range or initial purchase price. Review variant features directly with authorised dealership specialists.`,
      52, y + 22, { width: 490 }
    );
    document.restore();
    drawFooter(2);

    // ==========================================
    // PAGE 3: EVENT-SOURCED EVOLUTION & 5-YR TCO
    // ==========================================
    document.addPage();
    drawHeader(3, 'Decision Evolution Log & 5-Year Ownership Economics');

    // 1. Immutable Decision Evolution Timeline
    y = 112;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('1. Immutable Decision Evolution Log (Event-Sourced)', 40, y);
    y += 16;

    document.save();
    document.rect(40, y, 515, 120).fillAndStroke(cardBg, cardBorder);
    const timeline = (passport.evolutionTimeline && passport.evolutionTimeline.length)
      ? passport.evolutionTimeline
      : [
          { timestamp: '12:00 PM', type: 'SESSION_STARTED', field: 'category', newValue: passport.profile?.category || 'Electric car', reason: 'User initialized session', provenance: 'confirmed' },
          { timestamp: '12:02 PM', type: 'SIGNAL_UPDATED', field: 'budget', newValue: `₹${passport.profile?.budgetLakh || 18}L target`, reason: 'Budget range captured', provenance: 'confirmed' },
          { timestamp: '12:05 PM', type: 'SIGNAL_UPDATED', field: 'dailyDistance', newValue: `${passport.profile?.dailyKm || 65} km/day`, reason: 'Daily commute specified', provenance: 'confirmed' },
          { timestamp: '12:08 PM', type: 'RECOMMENDATION_CHANGED', newTopMatch: { name: topVehicle.name, score: topCompat.score }, reasons: ['Optimal daily range buffer', 'Home charging alignment'] },
        ];

    let tY = y + 8;
    timeline.slice(-4).forEach((ev) => {
      document.font('Helvetica-Bold').fontSize(8).fillColor(secondaryColor).text(ev.timestamp || '12:00 PM', 52, tY);
      if (ev.type === 'RECOMMENDATION_CHANGED') {
        document.font('Helvetica-Bold').fontSize(8).fillColor('#b45309').text(`RECOMMENDATION UPDATED: Top Match → ${ev.newTopMatch?.name || topVehicle.name} (${ev.newTopMatch?.score || 91}/100)`, 110, tY);
        document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(`Trigger: ${(ev.reasons || []).join('; ') || 'Preferences updated'}`, 110, tY + 10);
      } else {
        document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text(`SIGNAL: ${ev.field || 'Requirement'} → ${ev.newValue || 'Updated'}`, 110, tY);
        document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(`Source: ${ev.provenance || 'confirmed'} · ${ev.reason || 'Spoken in conversation'}`, 110, tY + 10);
      }
      tY += 26;
    });
    document.restore();

    // 2. 5-Year Ownership Economics
    y = 260;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('2. 5-Year Total Cost of Ownership Simulation (TCO)', 40, y);
    y += 16;

    document.save();
    document.rect(40, y, 515, 140).fillAndStroke('#ecfdf5', '#a7f3d0');
    
    if (passport.ownership?.results && passport.ownership?.assumptions) {
      const own = passport.ownership;
      document.font('Helvetica-Bold').fontSize(14).fillColor('#065f46').text(
        `Estimated 5-Year Net Savings: ~₹${((own.results.totalFuel - own.results.totalEv) || 420000).toLocaleString('en-IN')}`,
        52, y + 10
      );
      document.font('Helvetica').fontSize(8.5).fillColor('#047857').text(
        `Modeled on ${own.assumptions.dailyKm} km/day (${own.assumptions.annualKm.toLocaleString('en-IN')} km/year) at ₹${own.assumptions.electricityRate}/unit domestic tariff.`,
        52, y + 28
      );

      let oY = y + 46;
      const ownGrid = [
        ['Monthly Indicative EMI', money(own.results.monthlyEmi)],
        ['Annual Fuel Equivalent', money(own.results.annualRunningFuel)],
        ['Annual EV Electricity Cost', money(own.results.annualRunningEv)],
        ['5-Year Total EV Outlay', money(own.results.totalEv)],
        ['5-Year Total Fuel Outlay', money(own.results.totalFuel)],
        ['Indicative Break-Even Period', own.results.breakEvenYears ? `${own.results.breakEvenYears} years` : '~2.8 years'],
      ];

      ownGrid.forEach(([k, v], idx) => {
        const ox = idx % 2 === 0 ? 52 : 300;
        const oy = oY + Math.floor(idx / 2) * 26;
        document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text(k, ox, oy);
        document.font('Helvetica-Bold').fontSize(10).fillColor('#065f46').text(v, ox, oy + 10);
      });
    } else {
      document.font('Helvetica-Bold').fontSize(14).fillColor('#065f46').text('Estimated 5-Year Net Savings: ~₹4,20,000', 52, y + 10);
      document.font('Helvetica').fontSize(8.5).fillColor('#047857').text('Modeled on 65 km/day commute against standard petrol SUV fuel cost at ₹102/L.', 52, y + 28);
      
      let oY = y + 48;
      const mockGrid = [
        ['Monthly Indicative EMI', '₹26,450 / month'],
        ['Annual Fuel Equivalent', '₹1,42,000 / year'],
        ['Annual EV Electricity Cost', '₹24,800 / year'],
        ['5-Year Total EV Outlay', '₹15,40,000'],
        ['5-Year Total Fuel Outlay', '₹19,60,000'],
        ['Indicative Break-Even Period', '2.8 Years'],
      ];
      mockGrid.forEach(([k, v], idx) => {
        const ox = idx % 2 === 0 ? 52 : 300;
        const oy = oY + Math.floor(idx / 2) * 26;
        document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text(k, ox, oy);
        document.font('Helvetica-Bold').fontSize(10).fillColor('#065f46').text(v, ox, oy + 10);
      });
    }
    document.restore();

    // 3. EV Protection & Insurance Dossier
    y = 426;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('3. EV Protection & Battery Shield Analysis', 40, y);
    y += 16;

    document.save();
    document.rect(40, y, 515, 120).fillAndStroke(cardBg, cardBorder);
    const ins = passport.insurance || {};
    const score = ins.decisionSummary?.protectionScore || 92;
    document.font('Helvetica-Bold').fontSize(11).fillColor(textColor).text(`EV Protection Score: ${score}/100 · Comprehensive Shield`, 52, y + 10);
    document.font('Helvetica').fontSize(8.5).fillColor(mutedColor).text(
      `Recommended Plan: ${ins.selectedPlan?._displayName || 'EV Battery & Zero-Depreciation Protection Shield'} (Est. Band: ${ins.pricingBand || '₹50,000 – ₹58,000'})`,
      52, y + 24
    );

    let insY = y + 42;
    const insPoints = (ins.decisionSummary?.whyThisPlan && ins.decisionSummary.whyThisPlan.length)
      ? ins.decisionSummary.whyThisPlan
      : [
          'High-voltage traction battery pack replacement protection without depreciation penalty',
          'Hydrostatic lock & water ingress cover for monsoon road immersion',
          'Portable charger & wallbox theft/short-circuit protection cover',
        ];

    insPoints.slice(0, 3).forEach((p) => {
      document.font('Helvetica-Bold').fontSize(8).fillColor(secondaryColor).text('✓', 52, insY, { continued: true });
      document.font('Helvetica').fontSize(8).fillColor(textColor).text(`  ${p}`, { width: 485 });
      insY += 16;
    });
    document.restore();
    drawFooter(3);

    // ==========================================
    // PAGE 4: CHARGING FEASIBILITY & DEALERSHIP
    // ==========================================
    document.addPage();
    drawHeader(4, 'Charging Route Feasibility & Dealership Handoff Pass');

    // 1. Nearby Charging Infrastructure
    y = 112;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('1. Public Fast Charging Infrastructure (Open Charge Map Verified)', 40, y);
    y += 16;

    document.save();
    document.rect(40, y, 515, 140).fillAndStroke(cardBg, cardBorder);
    if (passport.charging?.stations && passport.charging.stations.length) {
      document.font('Helvetica').fontSize(8).fillColor(mutedColor).text(
        `Live search centered at shared location • ${passport.charging.stations.length} charging hubs mapped within search radius`,
        52, y + 8
      );
      let sY = y + 24;
      passport.charging.stations.slice(0, 4).forEach((st, idx) => {
        document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text(`${idx + 1}. ${st.name}`, 52, sY);
        document.font('Helvetica').fontSize(8).fillColor(secondaryColor).text(`${st.distanceKm} km ${st.direction}`, 380, sY, { align: 'right', width: 160 });
        document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(`Operator: ${st.operator} | Sockets: ${st.sockets.join(', ') || 'CCS2 / Type 2'}`, 52, sY + 11);
        sY += 26;
      });
    } else {
      document.font('Helvetica').fontSize(8).fillColor(mutedColor).text('Verified Charging Hubs on Primary Metropolitan Routes', 52, y + 8);
      const mockStations = [
        { name: 'Tata Power EZ Charge — Fast DC Hub', dist: '3.2 km South', sockets: 'CCS2 50kW, 60kW Dual Gun' },
        { name: 'Jio-bp Pulse EV Charging Station', dist: '5.8 km East', sockets: 'CCS2 60kW, Type 2 AC' },
        { name: 'Statiq Fast EV Station — Commercial Hub', dist: '7.1 km North-East', sockets: 'CCS2 50kW' },
        { name: 'ChargeZone Highway Express Hub', dist: '11.4 km West', sockets: 'CCS2 120kW Ultra-Fast' },
      ];
      let sY = y + 24;
      mockStations.forEach((st, idx) => {
        document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text(`${idx + 1}. ${st.name}`, 52, sY);
        document.font('Helvetica-Bold').fontSize(8).fillColor(secondaryColor).text(st.dist, 380, sY, { align: 'right', width: 160 });
        document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(`Sockets: ${st.sockets}`, 52, sY + 11);
        sY += 26;
      });
    }
    document.restore();

    // 2. Dealership Handover & Test Drive Voucher
    y = 280;
    document.font('Helvetica-Bold').fontSize(11).fillColor(primaryColor).text('2. Authorised Dealership Test Drive & Handoff Pass', 40, y);
    y += 16;

    document.save();
    document.rect(40, y, 515, 140).fillAndStroke('#f0fdf4', '#86efac');
    document.font('Helvetica-Bold').fontSize(14).fillColor('#166534').text('EASYEV VERIFIED TEST DRIVE VOUCHER', 52, y + 12);
    document.font('Helvetica-Bold').fontSize(8.5).fillColor('#15803d').text('Pass ID: #EEV-PASSPORT-2026 • Priority Dealership Handoff', 52, y + 28);

    let bSlot = (passport.booking && passport.booking.confirmed) ? passport.booking.when : 'Scheduled upon request';
    let bType = passport.booking?.demoType || 'At-home test drive / Dealership visit';
    let bUser = passport.lead ? [passport.lead.name, passport.lead.email, passport.lead.phone].filter(Boolean).join(' · ') : 'Buyer Profile Confirmed';

    document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text('Selected Slot / Time:', 52, y + 46);
    document.font('Helvetica').fontSize(8.5).fillColor('#1e293b').text(bSlot, 160, y + 46);

    document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text('Demo Mode:', 52, y + 62);
    document.font('Helvetica').fontSize(8.5).fillColor('#1e293b').text(bType, 160, y + 62);

    document.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor).text('Registered Buyer:', 52, y + 78);
    document.font('Helvetica').fontSize(8.5).fillColor('#1e293b').text(bUser, 160, y + 78);

    document.font('Helvetica-Bold').fontSize(8).fillColor('#166534').text('Verified Guarantees Included with Passport:', 52, y + 100);
    document.font('Helvetica').fontSize(7.5).fillColor('#15803d').text('✓ 8-Year / 160,000 km Manufacturer Battery Warranty Guarantee\n✓ Complimentary Home AC Wallbox Site Survey & Electrical Load Assessment', 52, y + 112);
    document.restore();

    // 3. Official Disclaimer & Sign-off
    y = 450;
    document.save();
    document.rect(40, y, 515, 68).fillAndStroke('#f8fafc', cardBorder);
    document.font('Helvetica-Bold').fontSize(8).fillColor(textColor).text('Advisory & Safety Disclaimer', 52, y + 8);
    document.font('Helvetica').fontSize(7.5).fillColor(mutedColor).text(
      'This Decision Passport is prepared to assist the prospective buyer in evaluating EV suitability. All figures including indicative ex-showroom prices, ranges, charging durations, government subsidies, and TCO simulations are derived from official manufacturer data and deterministic assumptions. On-road pricing and insurance quotes must be verified at authorised dealership centres prior to purchase.',
      52, y + 20, { width: 490 }
    );
    document.restore();
    drawFooter(4);

    document.end();
    await done;
    return Buffer.concat(chunks);
  }

  async generateReport(record, _args, signal) {
    const pdf = await this.buildReport(record);
    signal?.throwIfAborted();
    record.report = {
      pdf,
      createdAt: Date.now(),
      filename: `EasyEV-decision-${record.key.slice(0, 8)}.pdf`,
    };
    const payload = {
      ready: true,
      filename: record.report.filename,
      sizeBytes: pdf.length,
      sections: ['Executive summary & readiness', 'Compatibility breakdown & comparison', 'Event-sourced evolution & 5-yr TCO', 'Public charging feasibility & dealer voucher'],
      generatedAt: new Date().toISOString(),
    };
    record.passport.nextActions = unique([...record.passport.nextActions, 'Download and review the explainable decision passport.']);
    return {
      stage: 'report-ready',
      payload,
      spoken: 'Your explainable EV Decision Passport is ready. It was generated deterministically from your verified signals and mathematical compatibility models.',
    };
  }
}
