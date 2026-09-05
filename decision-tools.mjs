// EasyEV decision tools are isolated from Agora transport and browser rendering.
import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import pg from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { CrmCalendar, isEmail, normalizePhone, parseSpokenEmail } from './crm-calendar.mjs';
import { VEHICLES as SHOWROOM_VEHICLES } from './showroom/vehicle-catalog.js';
import * as z from 'zod/v4';

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

function safeError(error) {
  return cleanText(error instanceof Error ? error.message : String(error || 'Tool failed'), 400);
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

export class EasyEVToolEngine {
  constructor({ databaseUrl = '', geminiApiKey = '', geminiModel = 'gemini-2.0-flash', openChargeMapKey = '', publicBaseUrl = '', onEscalation = null, crm = null } = {}) {
    this.onEscalation = onEscalation;
    this.crm = crm || new CrmCalendar({});
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
    return {
      profile: { category, language, dailyKm: null, budgetLakh: null, chargingAccess: 'Not discussed', priorities: [] },
      shortlist: [],
      comparison: null,
      charging: null,
      ownership: null,
      readiness: null,
      escalation: null,
      lead: null,
      booking: null,
      unanswered: [],
      nextActions: [],
      updatedAt: new Date().toISOString(),
    };
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

    const shortlisted = record.passport.shortlist?.[0]?.name;
    const result = await this.crm.saveLead({
      ...contact,
      summary: [this.leadSummary(record), notes ? `Agent note: ${notes}` : ''].filter(Boolean).join('\n'),
      dealName: shortlisted ? `${contact.name || 'EasyEV buyer'} — ${shortlisted}` : `${contact.name || 'EasyEV buyer'} — EasyEV enquiry`,
      amountLakh: Number(record.passport.profile?.budgetLakh) || 0,
      sessionKey: record.key,
    });

    record.passport.lead = {
      name: result.name,
      email: result.email,
      phone: result.phone,
      provider: result.provider,
      contactId: result.contactId || null,
      dealId: result.dealId || null,
      savedAt: result.savedAt,
      live: result.provider === 'hubspot',
    };
    record.passport.nextActions = unique([
      ...record.passport.nextActions,
      result.provider === 'hubspot' ? 'Lead saved to HubSpot with the full Passport.' : 'Lead captured; connect HubSpot to sync it to the CRM.',
    ]);

    return {
      stage: 'lead-capture',
      payload: {
        ...record.passport.lead,
        crmUrl: result.crmUrl || null,
        failed: Boolean(result.failed),
        error: result.error || null,
      },
      spoken: result.provider === 'hubspot'
        ? `Saved. ${contact.name || 'You'} are now in our CRM with everything we have covered, so nobody will ask you to repeat it.`
        : 'I have captured your details against this conversation so a specialist can pick it up with full context.',
    };
  }

  async bookTestDrive(record, args) {
    const input = unpackArgs(args);
    const contact = this.contactDetails(record, input);
    const demoType = cleanText(firstDefined(input, ['demoType', 'demo_type', 'type']) || '', 60);
    const chosen = cleanText(firstDefined(input, ['slot', 'time', 'startISO', 'start', 'preferredTime', 'preferred_time']) || '', 80);

    const offered = record.passport.booking?.offered || [];
    let startISO = '';
    if (chosen) {
      const index = Number(chosen.replace(/[^\d]/g, ''));
      if (/^\d{4}-\d{2}-\d{2}T/.test(chosen)) startISO = chosen;
      else if (Number.isInteger(index) && index >= 1 && index <= offered.length && chosen.length <= 3) startISO = offered[index - 1].start;
      else {
        const match = offered.find((slot) => slot.label.toLowerCase().includes(chosen.toLowerCase()));
        if (match) startISO = match.start;
      }
    }

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
          ? `I have ${availability.slots.length} open times on the calendar. The earliest is ${availability.slots[0].label}. Which one suits you?`
          : 'I could not find an open slot in the next few days. Shall I have a specialist call you to arrange one?',
      };
    }

    if (!contact.email) {
      return {
        stage: 'booking-slots',
        payload: { slots: offered, needsEmail: true, pendingStart: startISO, emailUnclear: contact.emailUnclear, heard: contact.emailHeard },
        spoken: contact.emailUnclear
          ? `I have the time held, but I heard your email as "${contact.emailHeard}" and could not read it. Please type it with the keyboard button so the confirmation reaches you.`
          : 'I can lock that in. What email address should the confirmation go to?',
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
        : `${booking.demoType} pencilled in for ${booking.when}; confirm with the buyer before it is committed.`,
    ]);

    // A booking is the outcome, so make sure the CRM has the person attached to it.
    if (!record.passport.lead || record.passport.lead.email !== contact.email) {
      await this.captureLead(record, { ...contact, notes: `Booked ${booking.demoType} for ${booking.when}.` }).catch(() => {});
    }

    return {
      stage: 'booking-confirmed',
      payload: {
        ...record.passport.booking,
        email: contact.email,
        name: contact.name,
        failed: Boolean(booking.failed),
        error: booking.error || null,
        note: booking.note || null,
      },
      spoken: booking.confirmed
        ? `Done. ${booking.demoType} is booked for ${booking.when}, and the confirmation is on its way to ${contact.email}.`
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
    const joined = priorities.join(' ').toLowerCase();
    const ranking = [...vehicles].sort((a, b) => {
      let scoreA = a.claimedRangeKm / 10 - a.priceMinLakh;
      let scoreB = b.claimedRangeKm / 10 - b.priceMinLakh;
      if (/budget|price|afford|बजट/.test(joined)) { scoreA -= a.priceMinLakh * 2; scoreB -= b.priceMinLakh * 2; }
      if (/range|distance|रेंज/.test(joined)) { scoreA += a.claimedRangeKm / 4; scoreB += b.claimedRangeKm / 4; }
      return scoreB - scoreA;
    }).map((item, index) => ({
      id: item.id,
      rank: index + 1,
      reason: index === 0
        ? (priorities.length ? `Best fit for: ${priorities.join(', ')}` : 'Balanced indicative fit')
        : 'Alternative with different price, range or capacity trade-offs',
    }));
    const payload = {
      vehicles,
      ranking,
      priorities,
      ambiguous,
      missingFacts: ambiguous.map((name) => `Could not confidently resolve “${name}”.`),
      sourceNote: 'Specifications are curated from linked OEM pages. Prices and variants must be rechecked before purchase.',
      verifiedAt: vehicles.reduce((latest, item) => item.verifiedAt > latest ? item.verifiedAt : latest, ''),
      visualMode: wantsConcept && vehicles.some((item) => item.visual360) ? 'showroom-360' : 'photo',
    };
    record.passport.shortlist = vehicles.map(({ id, name, category, sourceUrl, verifiedAt }) => ({ id, name, category, sourceUrl, verifiedAt }));
    record.passport.comparison = payload;
    record.passport.profile.priorities = priorities;
    record.passport.nextActions = unique([...record.passport.nextActions, 'Verify current on-road price and selected variant with an authorised dealer.']);
    const leader = vehicles.find((item) => item.id === ranking[0]?.id);
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
            ? `The decision card for ${vehicles[0]?.name || 'your selected vehicle'} is ready on your screen, with its sourced specifications and visual explorer.`
            : `The side-by-side comparison of ${vehicles.map((item) => item.name).join(' and ')} is ready on your screen. ${leader ? `${leader.name} leads for the priorities we have, and you can open the visual explorer for either vehicle.` : ''}`,
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
    const query = `[out:json][timeout:3];nwr(around:${radiusMeters},${lat},${lng})["amenity"="charging_station"];out center tags;`;
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'EasyEV-Hackathon/2.0' },
      body: new URLSearchParams({ data: query }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(1500)]),
    });
    if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
    const data = await response.json();
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
      try {
        stations = await this.fetchOpenChargeMap(lat, lng, radiusKm, signal);
        source = 'Open Charge Map';
      } catch (error) {
        providerErrors.push(safeError(error));
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

  async buildReport(record) {
    const passport = this.publicPassport(record);
    const document = new PDFDocument({
      size: 'A4',
      margin: 48,
      info: { Title: 'EasyEV Buyer Decision Report', Author: 'EasyEV AI' },
    });
    const chunks = [];
    document.on('data', (chunk) => chunks.push(chunk));
    const done = new Promise((resolvePromise, rejectPromise) => {
      document.on('end', resolvePromise);
      document.on('error', rejectPromise);
    });
    const heading = (text) => {
      document.moveDown(0.7).font('Helvetica-Bold').fontSize(15).fillColor('#0b3b2b').text(text).moveDown(0.3);
    };
    const line = (label, value) => {
      document.font('Helvetica').fontSize(9.5).fillColor('#1f2a25').text(`${label}: ${value || 'Not discussed'}`, { paragraphGap: 3 });
    };
    document.font('Helvetica-Bold').fontSize(24).fillColor('#082f22').text('EasyEV Buyer Decision Report');
    document.font('Helvetica').fontSize(9).fillColor('#5b6a63').text(
      `Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} • Session ${record.key.slice(0, 8)} • Structured report, not an LLM reconstruction`,
    );
    heading('Buyer profile');
    line('Category', passport.profile.category);
    line('Language', passport.profile.language);
    line('Daily travel', passport.profile.dailyKm ? `${passport.profile.dailyKm} km` : 'Not discussed');
    line('Charging context', passport.profile.chargingAccess);
    line('Priorities', passport.profile.priorities?.join(', '));

    heading('Shortlist and comparison');
    if (!passport.shortlist.length) document.fontSize(10).text('No verified shortlist has been created yet.');
    for (const item of passport.comparison?.vehicles || []) {
      document.font('Helvetica-Bold').fontSize(11).fillColor('#111').text(item.name);
      document.font('Helvetica').fontSize(9).text(
        `${item.priceLabel}; ${item.claimedRangeLabel}; Battery ${item.battery}; Charging ${item.charging}; Capacity ${item.capacity}`,
      );
      document.fillColor('#356b58').text(`Source: ${item.sourceUrl} (verified ${item.verifiedAt})`, {
        link: item.sourceUrl,
        underline: true,
      });
    }

    heading('Ownership scenario');
    if (passport.ownership) {
      const { assumptions, results, vehicle: reportVehicle, notice } = passport.ownership;
      line('Vehicle', reportVehicle.name);
      line('Daily / annual distance', `${assumptions.dailyKm} km / ${assumptions.annualKm.toLocaleString('en-IN')} km`);
      line('Electricity / public rate', `${money(assumptions.electricityRate)} and ${money(assumptions.publicChargingRate)} per kWh`);
      line('Home charging share', `${assumptions.homeChargingSharePercent}%`);
      line('Estimated monthly EMI', money(results.monthlyEmi));
      line('Annual EV running', money(results.annualRunningEv));
      line('Annual fuel comparison', money(results.annualRunningFuel));
      line(`${assumptions.years}-year EV total`, money(results.totalEv));
      line(`${assumptions.years}-year fuel total`, money(results.totalFuel));
      line('Indicative break-even', results.breakEvenYears === null ? 'Not reached under assumptions' : `${results.breakEvenYears} years`);
      document.fontSize(8).fillColor('#6b625a').text(notice);
    } else {
      document.fontSize(10).text('No ownership scenario has been calculated yet.');
    }

    heading('Charging search');
    if (passport.charging) {
      line('Source', passport.charging.source);
      line('Checked', passport.charging.fetchedAt);
      line('Notice', passport.charging.availabilityNotice);
      for (const station of passport.charging.stations.slice(0, 6)) {
        line(station.name, `${station.distanceKm} km ${station.direction}; ${station.sockets.join(', ') || 'connector not listed'}`);
      }
    } else {
      document.fontSize(10).text('No location-based charging search has been performed.');
    }

    heading('Visual readiness');
    if (passport.readiness) {
      if (passport.readiness.rejected) {
        line('Result', `Image rejected and deleted: ${passport.readiness.reason}`);
      } else {
        line('Scene', passport.readiness.sceneType);
        line('Visible connector', passport.readiness.visibleConnector);
        line('Electrical label OCR', passport.readiness.electricalLabelText);
        for (const observation of passport.readiness.observations || []) line('Observation', observation);
        for (const question of passport.readiness.installerQuestions || []) line('Ask an installer', question);
      }
    } else {
      document.fontSize(10).text('No optional camera snapshot was analysed.');
    }

    if (passport.escalation) {
      heading('Human specialist handover');
      line('Reason', passport.escalation.reasonLabel);
      line('Brief given to specialist', passport.escalation.summary);
      line('Requested', passport.escalation.requestedAt);
      line('Specialist joined', passport.escalation.joinedAt || 'Not joined');
      line('Specialist', passport.escalation.repName || 'Not recorded');
      line('Handover completed', passport.escalation.resolvedAt || 'Call ended while escalated');
    }

    if (passport.lead || passport.booking?.confirmed) {
      heading('Lead and booking');
      if (passport.lead) {
        line('Saved as', [passport.lead.name, passport.lead.email, passport.lead.phone].filter(Boolean).join(' · '));
        line('CRM', passport.lead.live ? `HubSpot (contact ${passport.lead.contactId}, deal ${passport.lead.dealId})` : 'Held in this session; HubSpot not connected');
      }
      if (passport.booking) {
        line('Appointment', passport.booking.when || 'Not scheduled');
        line('Type', passport.booking.demoType || 'Test drive');
        line('Status', passport.booking.confirmed
          ? `Confirmed via ${passport.booking.provider}${passport.booking.bookingId ? ` (booking ${passport.booking.bookingId})` : ''}`
          : 'Held locally, not yet confirmed with the buyer');
      }
    }

    heading('Next actions and unanswered questions');
    const actions = passport.nextActions.length ? passport.nextActions : ['Discuss charging access and create a verified shortlist.'];
    for (const action of actions) document.fontSize(9.5).fillColor('#1f2a25').text(`• ${action}`);
    for (const question of passport.unanswered || []) document.text(`• Unanswered: ${question}`);
    document.moveDown().fontSize(8).fillColor('#6b625a').text(
      'Safety and demo notice: This report supports shopping decisions; it is not financial, electrical, legal or safety certification. Prices, range, warranty, incentives, charger access and connector data must be independently verified. Any booking or CRM entry recorded above states the system that actually received it.',
    );
    document.end();
    await done;
    return Buffer.concat(chunks);
  }

  async generateReport(record, _args, signal) {
    const pdf = await this.buildReport(record);
    // stopRecord() generates the closing report with no abort signal, so this
    // must tolerate its absence — otherwise every ended call loses its report.
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
      sections: ['Buyer profile', 'Verified shortlist', 'Ownership scenario', 'Charging results', 'Visual readiness', 'Sources and next actions'],
      generatedAt: new Date().toISOString(),
    };
    record.passport.nextActions = unique([...record.passport.nextActions, 'Download and review the decision report.']);
    return {
      stage: 'report-ready',
      payload,
      spoken: 'Your decision report is ready. It was generated from the structured Passport and the same deterministic calculations visible on screen.',
    };
  }
}
