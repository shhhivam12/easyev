// EasyEV decision tools are isolated from Agora transport and browser rendering.
import { createHash, randomUUID } from 'node:crypto';
import PDFDocument from 'pdfkit';
import pg from 'pg';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import * as z from 'zod/v4';

const { Pool } = pg;

function vehicle(id, name, category, aliases, priceMinLakh, priceMaxLakh, claimedRangeKm, battery, charging, warranty, capacity, kwhPer100Km, sourceUrl, verifiedAt) {
  return { id, name, category, aliases, priceMinLakh, priceMaxLakh, claimedRangeKm, battery, charging, warranty, capacity, kwhPer100Km, sourceUrl, verifiedAt, media: null };
}

export const VEHICLES = Object.freeze([
  vehicle('tata-punch-ev', 'Tata Punch.ev', 'Electric car', ['punch ev', 'punch.ev', 'टाटा पंच', 'पंच ईवी'], 9.99, 14.44, 315, '25–35 kWh', '56 min DC (10–80%, selected variants)', '8 years / 160,000 km battery and motor', '5 seats', 12.5, 'https://ev.tatamotors.com/punch/ev.html', '2026-08-30'),
  vehicle('tata-nexon-ev', 'Tata Nexon.ev', 'Electric car', ['nexon ev', 'नेक्सॉन ईवी', 'tata nexon'], 12.49, 17.19, 489, '30–45 kWh', '40 min DC (10–80%, selected variants)', '8 years / 160,000 km battery and motor', '5 seats', 13.5, 'https://ev.tatamotors.com/nexon/ev.html', '2026-08-30'),
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
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/0/04/Tata_punch.ev.jpg/1280px-Tata_punch.ev.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:Tata_punch.ev.jpg',
    license: 'CC0', creator: 'VideshiBhaktNRI', kind: 'licensed photograph', note: 'Tata Punch.ev reference photograph',
  },
  'citroen-ec3x': {
    url: 'https://thumb.wikimedia.org/wikipedia/commons/thumb/e/ea/2024_Citroen_e-C3.jpg/1280px-2024_Citroen_e-C3.jpg',
    pageUrl: 'https://commons.wikimedia.org/wiki/File:2024_Citroen_e-C3.jpg',
    license: 'CC BY-SA 4.0', creator: 'Calreyn88', kind: 'licensed reference photograph', note: 'Global ë-C3 reference; Indian ë-C3X styling may differ',
  },
});

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
  if (resolved.length < 2) {
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

export class EasyEVToolEngine {
  constructor({ databaseUrl = '', geminiApiKey = '', geminiModel = 'gemini-2.0-flash', openChargeMapKey = '' } = {}) {
    this.databaseUrl = databaseUrl;
    this.geminiApiKey = geminiApiKey;
    this.geminiModel = geminiModel;
    this.openChargeMapKey = openChargeMapKey;
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
        description: 'Compare or visually present Indian electric vehicles from the verified EasyEV catalog and update the Buyer Decision Passport. Put every vehicle the buyer names into vehicles; two names produce a side-by-side comparison. Recognises Citroen C3/eC3/eC3X and Tata Punch EV.',
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
    if (CURATED_MEDIA[item.id]) return CURATED_MEDIA[item.id];
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
    if (requested.length < 2) {
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
      visualMode: wantsConcept ? 'concept' : 'photo',
    };
    record.passport.shortlist = vehicles.map(({ id, name, category, sourceUrl, verifiedAt }) => ({ id, name, category, sourceUrl, verifiedAt }));
    record.passport.comparison = payload;
    record.passport.profile.priorities = priorities;
    record.passport.nextActions = unique([...record.passport.nextActions, 'Verify current on-road price and selected variant with an authorised dealer.']);
    const leader = vehicles.find((item) => item.id === ranking[0]?.id);
    return {
      stage: wantsVisual ? 'vehicle-visual' : 'comparison',
      payload,
      spoken: ambiguous.length
        ? `I found ${vehicles.length} close matches, but please clarify ${ambiguous.join(', ')}.`
        : wantsVisual
          ? `The visual explorer for ${vehicles[0]?.name || 'your selected vehicle'} is ready on screen. It includes a sourced photograph when available and an original interactive concept that is clearly illustrative.`
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

    heading('Next actions and unanswered questions');
    const actions = passport.nextActions.length ? passport.nextActions : ['Discuss charging access and create a verified shortlist.'];
    for (const action of actions) document.fontSize(9.5).fillColor('#1f2a25').text(`• ${action}`);
    for (const question of passport.unanswered || []) document.text(`• Unanswered: ${question}`);
    document.moveDown().fontSize(8).fillColor('#6b625a').text(
      'Safety and demo notice: This report supports shopping decisions; it is not financial, electrical, legal or safety certification. Prices, range, warranty, incentives, charger access and connector data must be independently verified. Dealer contact, WhatsApp, calendar and booking actions in this prototype remain simulated and do not create external commitments.',
    );
    document.end();
    await done;
    return Buffer.concat(chunks);
  }

  async generateReport(record, _args, signal) {
    const pdf = await this.buildReport(record);
    signal.throwIfAborted();
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
