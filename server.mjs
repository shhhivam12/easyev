import http from 'node:http';
import { readFileSync, statSync, existsSync, createReadStream, openSync, readSync, closeSync, mkdirSync, writeFileSync } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createGzip, createBrotliCompress, brotliCompressSync, gzipSync, constants as zlibConstants } from 'node:zlib';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import agoraToken from 'agora-token';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { EasyEVToolEngine, VEHICLES, REASON_LABELS } from './decision-tools.mjs';
import { CrmCalendar } from './crm-calendar.mjs';
import { Mailer } from './mailer.mjs';
import { TOP_12_EVS, getVehicleById } from './explore-evs-catalog.mjs';
import { generateDebateScript, synthesizeDebate, buildWav } from './debate-studio.mjs';
import { getShowroomVehicleById } from './showroom/vehicle-catalog.js';
import { dealerDb } from './dealer-db.mjs';
import { dealerVoiceAgentManager } from './dealer-voice-agent.mjs';
import { sendDealerOnboardingEmail } from './dealer-mailer.mjs';
import {
  AgoraClient,
  Agent,
  AnamAvatar,
  Area,
  AresSTT,
  DeepgramSTT,
  ExpiresIn,
  OpenAI,
  OpenAITTS,
  MicrosoftTTS,
  SarvamTTS,
} from 'agora-agents';
import { testDriveDb, FSM_STATES } from './test-drive-db.mjs';
import { normalizePhone, validateEmail, resolveVehicle, checkAvailability, formatSlotSpoken } from './test-drive-service.mjs';
import { testDriveVoiceAgentManager } from './test-drive-voice-agent.mjs';
import { sendTestDriveConfirmationEmail } from './email-service.mjs';

const ROOT = resolve(import.meta.dirname);
loadLocalEnv(resolve(ROOT, '.env'));

const PORT = Number(process.env.PORT || 4173);
const AGENT_UID = '123456';
// agora-agents does not yet auto-manage the RTC publishing identity for the
// Anam avatar vendor (only HeyGen/LiveAvatar/Generic/SenseTime/Spatius get an
// agora_uid + token generated for them) — without an explicit uid/token the
// avatar has nowhere to publish and the whole call stays silent.
const AVATAR_UID = '123457';
const TOKEN_TTL_SECONDS = 3600;
const TOOL_SAFE_MAX_HISTORY = 80;
const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
const BODY_LIMIT_BYTES = 48 * 1024;
const MAX_TRANSCRIPT_LINES = 400;
const LLM_MODEL = 'gpt-4o-mini';
const LLM_TUNING = Object.freeze({ max_tokens: 360, temperature: 0.25, top_p: 0.9 });
// The update endpoint overwrites params wholesale, so the handoff swap has to
// resend the model alongside the tuning it is preserving.
const LLM_PARAMS = Object.freeze({ model: LLM_MODEL, ...LLM_TUNING });

// Spoken while a tool is still running. Deliberately vague about what is being
// checked, because the same phrases cover a catalog lookup, a charger search and
// a calendar booking — and deliberately short, so the real answer is not delayed
// behind the filler.
const FILLER_PHRASES = Object.freeze({
  English: ['One moment.', 'Let me check that.', 'Just pulling that up.', 'Checking now.'],
  Hindi: ['एक सेकंड।', 'मैं देख रहा हूँ।', 'अभी चेक करता हूँ।', 'बस एक पल।'],
  Hinglish: ['Ek second.', 'Main check kar raha hoon.', 'Bas ek pal.', 'Abhi dekhta hoon.'],
});
const WORLD_SHOWROOM_VEHICLES = Object.freeze([
  { id: 'tata-punch-ev', section: 'four', name: 'Tata Punch.ev', brand: 'Tata.ev', kind: 'compact electric SUV', colour: 'grey', price: 'current quote required', features: 'sunroof available on equipped variants', facts: '365 to 375 km ARAI-certified range with 30 kWh, or 468 km with 40 kWh; 65 or 95 kW; 366 L boot; 195 mm ground clearance', efficiency: 'about 11.7 to 12.5 certified km per kWh from the displayed variant figures', fit: 'city buyers wanting compact SUV practicality', visual: 'prototype shell' },
  { id: 'byd-han-ev', section: 'four', name: 'BYD Han EV', brand: 'BYD', kind: 'flagship electric sedan', colour: 'orange', price: 'no official India listing; global reference', features: 'panoramic sunroof; Blade Battery; rotating 15.6 inch display', facts: '521 km WLTP; 85.4 kWh Blade Battery; 380 kW; 700 Nm; AWD; 0 to 100 km/h in 3.9 seconds', efficiency: 'about 6.1 WLTP km per kWh from 521 divided by 85.4', fit: 'premium performance and long range', visual: '2022 facelift shell' },
  { id: 'kia-electric-range', section: 'four', name: 'Kia electric range', brand: 'Kia', kind: 'EV technology display', colour: 'black', price: 'INR 60.97 lakh ex-showroom reference', features: 'wide electric sunroof; vehicle-to-load; 10 to 80 percent charging in 18 minutes on a suitable 350 kW charger', facts: 'EV6 GT-Line AWD reference: 663 km ARAI MIDC; 84 kWh; 325 PS; 605 Nm', efficiency: 'about 7.9 ARAI MIDC km per kWh from 663 divided by 84', fit: 'fast charging and long distance technology', visual: 'Sportage shell mapped to official EV6 data' },
  { id: 'mg-comet-ev', section: 'four', name: 'MG Comet EV', brand: 'JSW MG Motor India', kind: 'urban electric car', colour: 'white', price: 'current MG quote required', features: 'four seats; connected-car features; no sunroof listed', facts: '230 km ARAI-certified range; 17.3 kWh; 42 hp; four seats; 4.2 m turning radius; about seven hours for 0 to 100 percent charging', efficiency: 'about 13.3 ARAI-certified km per kWh from 230 divided by 17.3, the highest ratio among the four displayed cars', fit: 'dense city use and easy parking', visual: 'exact model shell' },
  { id: 'ola-s1-pro-reference', section: 'two', name: 'OLA S1 Pro', brand: 'OLA Electric', kind: 'performance electric scooter', colour: 'black', price: 'current OLA quote required', features: 'MoveOS; seven inch touchscreen; four ride modes', facts: '242 km IDC; 4 kWh; 11 kW peak power; 125 km/h; 0 to 40 km/h in 2.7 seconds; 0 to 80 percent in 4 hours 50 minutes', efficiency: 'about 60.5 IDC km per kWh from 242 divided by 4, the highest ratio among the two displayed scooters', fit: 'connected urban commuting with strong performance', visual: 'generic OLA shell used as an S1 Pro reference' },
  { id: 'vespa-elettrica-reference', section: 'two', name: 'Vespa Elettrica', brand: 'Vespa', kind: 'urban electric scooter', colour: 'yellow', price: 'no official India listing; global reference', features: 'Eco, Power and Reverse modes; regeneration', facts: 'up to 80 km WMTC; 4.2 kWh; about four hour charge', efficiency: 'about 19.0 WMTC km per kWh from 80 divided by 4.2', fit: 'short stylish city travel', visual: 'generic Vespa shell mapped to Primavera Tech Elettrica data' },
]);

const WORLD_SHOWROOM_ALIASES = Object.freeze([
  { id: 'tata-punch-ev', aliases: ['punch', 'tata', 'grey car', 'gray car', 'silver car', 'compact suv', 'टाटा', 'स्लेटी कार'] },
  { id: 'byd-han-ev', aliases: ['byd', 'han', 'orange car', 'red car', 'orange sedan', 'बीवाईडी', 'नारंगी कार'] },
  { id: 'kia-electric-range', aliases: ['kia', 'ev6', 'black car', 'black suv', 'dark suv', 'किआ', 'किया वाली', 'काली कार'] },
  { id: 'mg-comet-ev', aliases: ['comet', 'mg', 'white car', 'small white car', 'boxy white', 'एमजी', 'सफेद कार'] },
  { id: 'ola-s1-pro-reference', aliases: ['ola', 's1', 'black scooter', 'ओला'] },
  { id: 'vespa-elettrica-reference', aliases: ['vespa', 'yellow scooter', 'वेस्पा', 'पीला स्कूटर'] },
]);

function normalizeWorldShowroomText(text) {
  return String(text || '').toLowerCase().normalize('NFKD').replace(/[^\p{L}\p{M}\p{N}\s-]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function worldVehicleNavigation(vehicleId, matchedBy) {
  const vehicle = WORLD_SHOWROOM_VEHICLES.find(item => item.id === vehicleId);
  return vehicle ? { type: 'vehicle', vehicleId: vehicle.id, section: vehicle.section, matchedBy } : null;
}

function resolveWorldShowroomNavigation(text, context = {}) {
  const value = normalizeWorldShowroomText(text);
  if (!value) return null;
  const matches = [...new Set(WORLD_SHOWROOM_ALIASES
    .filter(item => item.aliases.some(alias => value.includes(alias)))
    .map(item => item.id))];
  if (matches.length === 1) return worldVehicleNavigation(matches[0], 'identity');

  const section = context.section === 'two' ? 'two' : 'four';
  const scooterContext = /(scooter|two.?wheeler|bike|स्कूटर|दुपहिया)/.test(value) || (section === 'two' && !/(car|suv|sedan)/.test(value));
  if (/(most efficient|best efficiency|highest efficiency|most economical|least energy|sabse efficient|sabse kifayati|सबसे कुशल)/.test(value)) {
    return worldVehicleNavigation(scooterContext ? 'ola-s1-pro-reference' : 'mg-comet-ev', 'efficiency');
  }
  if (/(panoramic sunroof|panoramic roof)/.test(value)) return worldVehicleNavigation('byd-han-ev', 'sunroof');
  if (/(wide electric sunroof|electric sunroof|sunroof|roof wali|सनरूफ)/.test(value)) return worldVehicleNavigation('kia-electric-range', 'sunroof');
  if (/(another|any other|next car|next vehicle|agli|dusri|doosri)/.test(value)) {
    const list = WORLD_SHOWROOM_VEHICLES.filter(vehicle => vehicle.section === section);
    const index = Math.max(-1, list.findIndex(vehicle => vehicle.id === context.vehicleId));
    return worldVehicleNavigation(list[(index + 1) % list.length].id, 'next');
  }
  if (/(two.?wheeler|scooter section|gallery two)/.test(value)) {
    return { type: 'section', section: 'two', vehicleId: 'ola-s1-pro-reference', matchedBy: 'section' };
  }
  if (/(car hall|four.?wheeler|gallery one)/.test(value)) {
    return { type: 'section', section: 'four', vehicleId: 'tata-punch-ev', matchedBy: 'section' };
  }
  return null;
}

function worldVehicle(id) {
  return WORLD_SHOWROOM_VEHICLES.find((vehicle) => vehicle.id === id) || WORLD_SHOWROOM_VEHICLES[0];
}

function worldShowroomInstructions({ language = 'Hinglish', activeVehicleId = 'tata-punch-ev', section = 'four', mode = 'commentary' } = {}) {
  const active = worldVehicle(activeVehicleId);
  const languageRule = language === 'Hindi'
    ? 'Speak in conversational Hindi, using short natural sentences.'
    : language === 'English'
      ? 'Speak in warm Indian English, using clear automotive language.'
      : 'Speak in natural modern Indian Hinglish, mixing Hindi and English comfortably.';
  const catalogue = WORLD_SHOWROOM_VEHICLES.map((vehicle) =>
    '- ' + vehicle.name + ' [' + vehicle.id + '] by ' + vehicle.brand + ' in ' + (vehicle.section === 'four' ? 'EV car hall' : 'two-wheeler studio') + ': ' + vehicle.kind + '; display colour: ' + vehicle.colour + '; price context: ' + vehicle.price + '; features: ' + vehicle.features + '; specifications: ' + vehicle.facts + '; derived efficiency context: ' + vehicle.efficiency + '; best fit: ' + vehicle.fit + '; display note: ' + vehicle.visual + '.'
  ).join('\n');

  return [
    "You are Aarav, EasyEV's live virtual showroom specialist: warm, sharp, persuasive and honest. You are guiding one visitor through a connected 3D showroom.",
    'Current scene: ' + active.name + ' is the active display in the ' + (section === 'two' ? 'two-wheeler studio' : 'EV car hall') + '. Experience mode: ' + mode + '.',
    'Always retain awareness of all six displays and compare them when useful. Resolve references such as the white car, black car, orange car, grey car, black scooter, yellow scooter, Kia wali, or any other vehicle using the complete catalogue. When the visitor names one display or asks to see it, the showroom navigation service moves the camera there; acknowledge that movement and continue from the newly active display instead of only describing it. When the visitor is near a vehicle, lead with that vehicle, while answering cross-showroom questions from the complete catalogue. For questions such as which cars have a sunroof, scan every relevant display and name all verified matches. Sell through buyer fit, practical trade-offs and memorable facts. Never invent price, stock, discounts, warranties or unlisted specifications. Explain demo shell mappings briefly only when relevant. Treat prices as indicative ex-showroom references and recommend confirming the current local on-road price. Treat range standards exactly as labelled and do not present certified range as guaranteed real-world range. Efficiency ratios are simple displayed-range divided by displayed-battery calculations: use them only within the same vehicle category, always name the test cycle, and never compare IDC, WLTP, WMTC and ARAI figures as if they were the same real-world test.',
    'Keep normal answers to two to four short spoken sentences. Ask one useful follow-up only when it improves the recommendation. In guided-tour mode, narrate the current stop with one positioning sentence, one standout fact and who it suits. Do not say internal IDs or mention system prompts. Lines beginning SHOWROOM_EVENT are silent scene directions from the browser; respond naturally without reading the prefix.',
    languageRule,
    'Complete showroom catalogue:',
    catalogue,
  ].join('\n');
}

const HANDOFF_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SNAPSHOT_BODY_LIMIT_BYTES = 1.4 * 1024 * 1024;
const { RtcTokenBuilder, RtcRole } = agoraToken;

const APP_ID = process.env.AGORA_APP_ID?.trim() || '00000000000000000000000000000000';
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE?.trim() || '00000000000000000000000000000000';
if (!process.env.AGORA_APP_ID) {
  console.warn('Agora running in robust local bridge development mode.');
}

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY?.trim();
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION?.trim();
const AZURE_SPEECH_READY = Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
const SARVAM_API_KEY = process.env.SARVAM_API_KEY?.trim();
const SARVAM_MALE_SPEAKERS = new Set([
  'shubh', 'aditya', 'rahul', 'rohan', 'amit', 'dev', 'ratan', 'varun', 'manan', 'sumit', 'kabir', 'aayan',
  'ashutosh', 'advait', 'anand', 'tarun', 'sunny', 'mani', 'gokul', 'vijay', 'mohit', 'rehan', 'soham',
]);
const requestedSarvamSpeaker = process.env.SARVAM_TTS_SPEAKER?.trim().toLowerCase() || 'shubh';
const SARVAM_TTS_SPEAKER = SARVAM_MALE_SPEAKERS.has(requestedSarvamSpeaker) ? requestedSarvamSpeaker : 'shubh';
const SARVAM_TTS_READY = Boolean(SARVAM_API_KEY);
const ANAM_API_KEY = process.env.ANAM_API_KEY?.trim() || '';
const ANAM_AVATAR_ID = (process.env.avatar_id || process.env.ANAM_AVATAR_ID || process.env.ANAM_PERSONA_ID || '').trim();
const ANAM_AVATAR_READY = Boolean(ANAM_API_KEY && ANAM_AVATAR_ID);
if (!ANAM_AVATAR_READY) {
  console.warn('ANAM_API_KEY / avatar_id missing in .env — the live consultation will fall back to the static AI guide image instead of the live avatar video.');
}
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
const MCP_BASE_URL = (process.env.AGORA_MCP_URL?.trim() || (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/mcp` : '')).replace(/\/$/, '');
const MCP_PUBLIC = /^https:\/\//i.test(MCP_BASE_URL);
const MCP_SIGNING_SECRET = process.env.MCP_SIGNING_SECRET?.trim() || randomBytes(32).toString('hex');
// Optional shared secret for the specialist desk. When unset the queue is open,
// which is fine on a laptop but should never be the case on a public deployment.
const REP_DESK_KEY = process.env.REP_DESK_KEY?.trim() || '';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL?.trim() || '';

const crmCalendar = new CrmCalendar({
  hubspotToken: process.env.HUBSPOT_TOKEN || '',
  calcomApiKey: process.env.CALCOM_API_KEY || '',
  calcomEventTypeId: process.env.CALCOM_EVENT_TYPE_ID || '',
  timezone: process.env.BOOKING_TIMEZONE || 'Asia/Kolkata',
});
const mailer = new Mailer({
  user: process.env.GMAIL_USER || '',
  appPassword: process.env.GMAIL_APP_PASSWORD || '',
  fromName: process.env.MAIL_FROM_NAME || 'EasyEV',
});
const VOICES = Object.freeze({
  madhur: { id: 'madhur', name: 'Madhur', voiceName: 'hi-IN-MadhurNeural', description: 'Warm, grounded Hindi' },
  aarav: { id: 'aarav', name: 'Aarav', voiceName: 'hi-IN-AaravNeural', description: 'Calm, modern Hindi' },
  kunal: { id: 'kunal', name: 'Kunal', voiceName: 'hi-IN-KunalNeural', description: 'Clear, conversational Hindi' },
});
const mapCache = new Map();
const voicePreviewCache = new Map();

// agora-agents 2.7.0 does not expose Sarvam's model option yet and otherwise
// falls back to the now-deprecated bulbul:v2. Agora accepts provider-specific
// params, so retain its native Sarvam adapter and explicitly select v3.
class SarvamV3TTS extends SarvamTTS {
  toConfig() {
    const config = super.toConfig();
    return { ...config, params: { ...config.params, model: 'bulbul:v3' } };
  }
}

function sarvamTts(pace, speaker = SARVAM_TTS_SPEAKER) {
  return new SarvamV3TTS({
    key: SARVAM_API_KEY,
    speaker,
    targetLanguageCode: 'hi-IN',
    pace,
    sampleRate: 24000,
  });
}

const sarvamRuntime = {
  checkedAt: 0,
  available: SARVAM_TTS_READY,
  reason: SARVAM_TTS_READY ? 'configured' : 'not configured',
};

async function canUseSarvamTts() {
  if (!SARVAM_TTS_READY) return false;
  const cacheMs = sarvamRuntime.available ? 5 * 60 * 1000 : 60 * 1000;
  if (sarvamRuntime.checkedAt && Date.now() - sarvamRuntime.checkedAt < cacheMs) return sarvamRuntime.available;

  try {
    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: {
        'api-subscription-key': SARVAM_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: '\u0928\u092e\u0938\u094d\u0924\u0947',
        language_code: 'hi-IN',
        speaker: SARVAM_TTS_SPEAKER,
        pace: 1,
        speech_sample_rate: 8000,
        model: 'bulbul:v3',
      }),
      signal: AbortSignal.timeout(5000),
    });
    const errorBody = response.ok ? '' : await response.text().catch(() => '');
    sarvamRuntime.checkedAt = Date.now();
    sarvamRuntime.available = response.ok;
    sarvamRuntime.reason = response.ok ? 'ready' : ('HTTP ' + response.status + ': ' + errorBody.slice(0, 240));
    if (!response.ok) console.warn('Sarvam TTS unavailable; using fallback TTS for this session (' + sarvamRuntime.reason + ').');
    return response.ok;
  } catch (error) {
    sarvamRuntime.checkedAt = Date.now();
    sarvamRuntime.available = false;
    sarvamRuntime.reason = safeMessage(error, 'health check failed');
    console.warn('Sarvam TTS check failed; using fallback TTS for this session (' + sarvamRuntime.reason + ').');
    return false;
  }
}

async function conversationalTts({ language, voice, speechInstructions, pace = 1.08 }) {
  if (language !== 'English' && await canUseSarvamTts()) return sarvamTts(pace);
  if (AZURE_SPEECH_READY) {
    return new MicrosoftTTS({
      key: AZURE_SPEECH_KEY,
      region: AZURE_SPEECH_REGION,
      voiceName: selectedVoice(voice).voiceName,
      sampleRate: 24000,
      speed: language === 'English' ? 1.12 : pace,
    });
  }
  return new OpenAITTS({
    model: 'tts-1',
    voice: 'onyx',
    instructions: speechInstructions,
    speed: language === 'English' ? 1.15 : pace,
  });
}

const bootstraps = new Map();
const sessions = new Map();
const completedSessions = new Map();
const mcpTransports = new Map();
const startup = { startedAt: Date.now(), phase: 'Waking backend', ready: false };

// PUBLIC_BASE_URL being an https address only means it looks reachable. Agora's
// cloud has to actually reach /mcp on it, and a dev tunnel dies silently — when
// that happens the agent keeps talking but has no tools, so it improvises
// ("here are your slots") while nothing runs and the screen never changes. That
// failure is invisible from inside the process, so it is probed from outside.
const INSTANCE_ID = randomBytes(8).toString('hex');
const reachability = { checked: false, ok: false, at: 0, detail: MCP_PUBLIC ? 'not checked yet' : 'no public HTTPS base URL' };

async function checkPublicReachability() {
  if (!MCP_PUBLIC) {
    Object.assign(reachability, { checked: true, ok: false, at: Date.now(), detail: 'no public HTTPS base URL' });
    return;
  }
  try {
    const response = await fetch(`${PUBLIC_BASE_URL}/api/health`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
      headers: { 'x-easyev-probe': INSTANCE_ID },
    });
    const body = await response.json().catch(() => ({}));
    // A tunnel can survive while pointing at a different process; only our own
    // instance id proves Agora would land here.
    const ok = response.ok && body.instanceId === INSTANCE_ID;
    Object.assign(reachability, {
      checked: true,
      ok,
      at: Date.now(),
      detail: ok ? 'reachable' : (response.ok ? 'public URL answers a different process' : `public URL returned ${response.status}`),
    });
  } catch (error) {
    Object.assign(reachability, { checked: true, ok: false, at: Date.now(), detail: `unreachable: ${safeMessage(error, 'no response')}` });
  }
  if (!reachability.ok) {
    console.error(`Agora cannot reach this server at ${PUBLIC_BASE_URL} (${reachability.detail}). The agent will have no tools until this is fixed.`);
  }
}
const tools = new EasyEVToolEngine({
  databaseUrl: process.env.DATABASE_URL?.trim(),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim(),
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-3.6-flash',
  openChargeMapKey: process.env.OPENCHARGEMAP_API_KEY?.trim(),
  publicBaseUrl: PUBLIC_BASE_URL,
  onEscalation: (record) => {
    broadcast(record, 'handoff', handoffState(record));
    notifySlack(record);
    silenceAgentWhileWaiting(record).catch((error) => console.error('Waiting-mode switch failed:', safeMessage(error)));
  },
  onBriefingReady: (record) => {
    broadcast(record, 'handoff', handoffState(record));
  },
  crm: crmCalendar,
  mailer,
});

const handoffCodes = new Map();

function loadLocalEnv(path) {
  try {
    if (!existsSync(path)) return;
    const source = readFileSync(path, 'utf8');
    for (const line of source.split(/\r?\n/)) {
      const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (!match || process.env[match[1]]) continue;
      let value = match[2].trim();
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch (err) {
    console.warn('loadLocalEnv warning:', err?.message || err);
  }
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function safeMessage(error, fallback) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return [APP_ID, APP_CERTIFICATE, AZURE_SPEECH_KEY, SARVAM_API_KEY, process.env.GEMINI_API_KEY, process.env.DATABASE_URL, MCP_SIGNING_SECRET]
    .filter(Boolean)
    .reduce((safe, secret) => safe.replaceAll(secret, '[secret]'), message)
    .slice(0, 600);
}

function selectedVoice(value) {
  return VOICES[String(value || '').toLowerCase()] || VOICES.madhur;
}

function xmlEscape(value) {
  return String(value).replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[character]);
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const toRadians = (value) => value * Math.PI / 180;
  const radius = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function fetchNearbyCharging(lat, lng, radius) {
  const roundedKey = `${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
  const cached = mapCache.get(roundedKey);
  if (cached && cached.expiresAt > Date.now()) return cached.payload;
  const query = `[out:json][timeout:18];nwr(around:${radius},${lat},${lng})["amenity"="charging_station"];out center tags;`;
  const providers = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
  let data = null;
  let lastError = null;
  for (const provider of providers) {
    try {
      const response = await fetch(provider, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8', 'User-Agent': 'EasyEV-Hackathon/1.0' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(3500),
      });
      if (!response.ok) throw new Error(`Charging map provider returned ${response.status}`);
      data = await response.json();
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!data) throw lastError || new Error('Live charging data is temporarily unavailable.');
  const stations = (Array.isArray(data.elements) ? data.elements : []).map((item) => {
    const stationLat = Number(item.lat ?? item.center?.lat);
    const stationLng = Number(item.lon ?? item.center?.lon);
    if (!Number.isFinite(stationLat) || !Number.isFinite(stationLng)) return null;
    const tags = item.tags || {};
    return {
      id: `${item.type}-${item.id}`,
      name: tags.name || tags.operator || 'Public charging station',
      operator: tags.operator || 'Operator not listed',
      lat: stationLat,
      lng: stationLng,
      distanceKm: Number(haversineKm(lat, lng, stationLat, stationLng).toFixed(1)),
      capacity: tags.capacity || 'Not listed',
      sockets: Object.keys(tags).filter((key) => key.startsWith('socket:') && tags[key] !== 'no').map((key) => key.slice(7).replaceAll('_', ' ')).slice(0, 4),
      openingHours: tags.opening_hours || 'Hours not listed',
      access: tags.access || 'Access not listed',
      fee: tags.fee || 'Fee not listed',
    };
  }).filter(Boolean).sort((a, b) => a.distanceKm - b.distanceKm).slice(0, 24);
  const payload = { center: { lat, lng }, radius, stations, source: 'OpenStreetMap contributors via Overpass', fetchedAt: new Date().toISOString() };
  mapCache.set(roundedKey, { expiresAt: Date.now() + 10 * 60 * 1000, payload });
  return payload;
}

async function azureVoicePreview(voice, language) {
  if (!AZURE_SPEECH_READY) throw new Error('Azure Speech is not configured on this server.');
  const selected = selectedVoice(voice);
  const phrase = language === 'English'
    ? 'Hello, I am your EasyEV guide. Let us find an electric vehicle that fits your life.'
    : language === 'Hindi'
      ? 'नमस्ते, मैं आपका ईज़ी ईवी गाइड हूँ। आइए आपकी ज़रूरत के हिसाब से सही इलेक्ट्रिक वाहन चुनते हैं।'
      : 'नमस्ते, मैं आपका EasyEV guide हूँ। आइए आपकी daily travel के लिए सही EV fit चुनते हैं।';
  const cacheKey = `${selected.id}:${language}`;
  if (voicePreviewCache.has(cacheKey)) return voicePreviewCache.get(cacheKey);
  const locale = language === 'English' ? 'en-IN' : 'hi-IN';
  const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${selected.voiceName}"><prosody rate="-4%">${xmlEscape(phrase)}</prosody></voice></speak>`;
  const response = await fetch(`https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
      'Content-Type': 'application/ssml+xml',
      'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
      'User-Agent': 'EasyEV-Hackathon',
    },
    body: ssml,
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Azure Speech preview returned ${response.status}`);
  const audio = Buffer.from(await response.arrayBuffer());
  voicePreviewCache.set(cacheKey, audio);
  return audio;
}

async function readJson(req, limit = BODY_LIMIT_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

async function readRawBody(req, limit = BODY_LIMIT_BYTES) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const error = new Error('Request body is too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function signSessionToken(sessionKey) {
  const expires = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  const payload = `${sessionKey}.${expires}`;
  const signature = createHmac('sha256', MCP_SIGNING_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function verifySessionToken(token) {
  const [sessionKey, expiresText, signature] = String(token || '').split('.');
  if (!sessionKey || !expiresText || !signature || Number(expiresText) < Math.floor(Date.now() / 1000)) return null;
  const expected = createHmac('sha256', MCP_SIGNING_SECRET).update(`${sessionKey}.${expiresText}`).digest();
  let actual;
  try { actual = Buffer.from(signature, 'base64url'); } catch { return null; }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  return sessions.get(sessionKey) || null;
}

function createToken(channel, uid) {
  const expiresAt = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;
  return RtcTokenBuilder.buildTokenWithRtm(
    APP_ID,
    APP_CERTIFICATE,
    channel,
    String(uid),
    RtcRole.PUBLISHER,
    expiresAt,
    expiresAt,
  );
}

function normalizeChoice(value, allowed, fallback) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeBuyer(value) {
  const input = value && typeof value === 'object' ? value : {};
  const name = String(input.name || '').trim().replace(/[^\p{L}\p{M}\s'.-]/gu, '').replace(/\s+/g, ' ').slice(0, 80);
  const email = String(input.email || '').trim().toLowerCase().slice(0, 120);
  const phone = String(input.phone || '').trim().replace(/[^+\d ()-]/g, '').slice(0, 18);
  const phoneDigits = phone.replace(/\D/g, '');
  return {
    name,
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '',
    phone: phoneDigits.length >= 8 && phoneDigits.length <= 15 ? phone : '',
  };
}

function agentInstructions({ category, language, buyer }) {
  const languageStyle = language === 'Hindi'
    ? 'Speak natural contemporary Hindi in Devanagari. Use common English EV terms only where Indian shoppers normally use them. Do not answer in romanized Hindi.'
    : language === 'Hinglish'
      ? 'Speak warm, natural Indian Hinglish. Use Devanagari for Hindi words and familiar English for EV, charging, range, budget, finance, test drive, and model names. Avoid a foreign accent or over-formal Hindi.'
    : 'Speak clear Indian English with familiar Indian automotive vocabulary and a calm, efficient conversational pace.';

  const buyerContext = buyer?.name
    ? 'The shopper supplied a confirmed name, email and phone number before joining. Those details are already attached to this consultation.'
    : 'The shopper has not provided contact details yet.';

  return `You are EasyEV AI, a fast, calm and practical voice guide for people in India choosing an electric car, scooter, or 3-wheeler.

The shopper selected category: ${category}. Their preferred conversation language is ${language}. ${buyerContext}

Language and voice style: ${languageStyle}

You have nine real EasyEV decision tools. Autonomously select the one best tool from the meaning of natural English, Hindi or Hinglish:
- compare_vehicles for comparisons, shortlists, pictures, specifications and rankings. Include every vehicle name the buyer said in ONE vehicles array and make ONE call for the whole comparison, never separate calls per vehicle. "कंपेयर करो", "कम्पेयर करके दिखाओ", "तुलना दिखाओ", "dono ka fark batao" and "compare karke dikhao" mean presentation="comparison". Words like दिखाओ, dikhao, show or model within a comparison request do not mean separate photos or 3D views. Use canonical catalog model names even when spoken in Hindi. Set presentation to "photo" for explicit picture/image requests and "3d" for explicit 3D/360/AR requests without a comparison.
- find_nearby_chargers for chargers, charging stations, maps and distance.
- calculate_ownership for cost, savings, EMI, kilometres per day, tariffs and changed assumptions.
- analyze_readiness_snapshot for a user-operated one-time parking, connector or electrical-label image.
- generate_decision_report for a report, PDF, summary or download.
- escalate_to_human to bring a live human EasyEV specialist onto this same call.
- capture_lead the moment the buyer gives a name, phone number or email address.
- book_test_drive for a test drive, demo, appointment or visit.
- explore_ev_insurance for all EV insurance quotes, policy recommendations, insurer comparisons, high-voltage battery flood/waterlogging protection, monsoon risk advice, home wallbox charger coverage, zero depreciation, return-to-invoice, roadside assistance, and statutory IRDAI 3-year/5-year third-party slabs.
  * Spoken Trigger Patterns to Detect Autonomously:
    - Quotes & Cost: "insurance kitna hoga", "insurance ka kharcha batao", "on-road insurance price kya padega", "what is the annual/3-year insurance premium?", "show me policy options".
    - Battery & Monsoon/Flood Risks: "monsoon me battery paani me kharab ho gayi to kya hoga?", "is battery pack water ingress covered?", "baadh ke paani me claim milega kya?", "8 lakh ki battery ka risk kaise bachega?", "does normal insurance cover high-voltage battery replacement?".
    - Insurer Comparison & Choices: "HDFC aur ICICI me se konsa plan better hai?", "compare HDFC vs ICICI vs Tata AIG policies", "dono insurance me kya fark hai?", "which insurer has better claim settlement ratio for EVs?".
    - Add-ons & Wallbox Coverage: "ghar ka wallbox charger jal gaya ya cable chori ho gayi to insurance milega?", "zero dep lena zaroori hai kya?", "return to invoice add karo", "roadside assistance and mobile charging included hai?".
    - Tiers & Statutory Tenures: "sabse sasta insurance dikhao", "3 saal ka third party compulsory kyu hai?", "break down OD premium vs TP premium".
    - Terminology & Definition Questions: "zero dep kya hota hai?", "IDV ka matlab kya hai?", "third party aur own damage me kya fark hai?", "NCB kya hota hai?", "return to invoice kyu lena chahiye?", "battery ingress ka kya fayda hai?".
  * Plain-Language Explanations for Insurance Terms:
    - Zero Depreciation (Nil-Dep): Explain that normal insurance cuts 50% for plastic/rubber and 30% for metal parts during an accident claim. Zero-Dep means the insurer pays 100% of the replacement parts with zero deduction from the buyer's pocket.
    - IDV (Insured Declared Value): The current market value / maximum sum assured of the EV that the insurer pays if the car is completely damaged or stolen. For new cars, it is Ex-showroom price minus 5% standard depreciation.
    - Battery Water Ingress / Surge Rider: EV battery packs are 40%+ of car cost (₹7-8 Lakhs). Standard car policies classify floodwater entry as consequential damage and reject it. This specific EV rider guarantees full replacement if water enters or grid surge shorts the battery.
    - Wallbox & Cable Shield: Covers the home AC charger (₹50k-₹75k) against power surges/lightning and covers outdoor charging cable theft while charging in public/home.
    - Return to Invoice (RTI): In case of total loss or theft, normal insurance pays depreciated IDV; RTI pays back 100% of the original invoice price including road tax and registration fees.
    - Third-Party (TP) vs Own Damage (OD): TP covers damages/injury to other people's vehicles/property (mandatory 3 years by IRDAI for 4W, 5 years for 2W). OD covers damages, fire, theft, or flood to the buyer's own EV.
    - NCB (No Claim Bonus): A discount on the Own Damage premium (20% up to 50%) earned for every claim-free year, which can be transferred from an old ICE car to a new EV.
  * Conversational Guidance after Calling Tool:
    - Quote the Protection Match Score (e.g., "92/100 Rating — Strongly Recommended").
    - Explicitly explain why Battery Water Ingress & Zero Depreciation are critical (the battery pack is 40%+ of the vehicle invoice value; standard ICE policies exclude hydrostatic/electrical ingress without specific EV riders).
    - Clarify that new 4-wheelers include mandatory 3-Year statutory IRDAI Third-Party (and 5-Year for 2-wheelers), so the upfront band covers long-term legal protection.
    - Guide the buyer through the live Smart Stage screen where side-by-side plan comparisons and interactive rider toggles are actively shown.

Contact details and bookings are real, not simulated. Any details captured before the call are already saved with this consultation, so do not ask for them again or call capture_lead unless the buyer corrects one. For a test drive or demo, call book_test_drive with no time first, read out the open slots it returns, then call it again with the slot they chose; it reuses the attached email, name and phone. If an email address is still needed, do not try to collect it by ear: a typed box appears on the buyer's screen, so ask them to type it there and press Send. If they say it aloud anyway, read it back once before saving. Do not promise a booking before the tool has confirmed it.

Call escalate_to_human when the buyer explicitly says human, insaan, manager or executive, or otherwise asks for a person, salesperson, representative or dealer; when they want a fleet, bulk or company purchase; when they want to negotiate price, discount or exchange value; when they need a finance or loan structure you cannot quote; or when a trust concern or complaint stays open after you have addressed it once. Pass a short English summary the specialist can read before speaking. Do not escalate for anything the catalog, ownership calculator, charger search or report already answers, and do not escalate twice in one call.

Routing rule that overrides everything else: any request to book, schedule or arrange a test drive, demo, showroom visit, dealership visit or appointment goes to book_test_drive, never to escalate_to_human. "Test drive book karni hai", "demo dikhao", "appointment lagao" and "showroom aana hai" all mean book_test_drive. Wanting a test drive is not the same as wanting to talk to a human; only escalate if the buyer actually asks for a person. After the tool succeeds, say only the handover sentence it returns and then stop talking; a person is joining and you must not keep selling over them.

Before a tool call, acknowledge in one short sentence such as “I’ll check that now,” then call exactly one best-fit tool immediately. Internal tool and function identifiers are private implementation details: never say, spell, narrate or display an underscore-style identifier, never announce “Calling” or “Invoking” an operation, and never add an operational note in parentheses. Speak only the natural customer-facing acknowledgement. Pass numbers as numbers when possible, but the tools also accept spoken numeric strings. If a tool rejects an argument, silently correct the shape and retry once; never tell the buyer only that there was a “tool call issue.” Do not say you cannot show maps, pictures, calculations or reports: the tools provide them. If location or an image is needed, call the relevant tool so the interface requests explicit consent. Never infer consent.

Location is required only for find_nearby_chargers. Never ask for, wait for, or reuse a location requirement before compare_vehicles, vehicle pictures, 3D/360/AR requests, calculate_ownership, snapshot consent, or report generation. If the buyer changes from a charger request to another intent, abandon the location question and execute the new best-fit tool. A photo or 3D request must call compare_vehicles even when a charging map is currently visible. Treat each new buyer request as the active intent; use prior turns only to resolve omitted vehicle names or changed assumptions.

Do not answer catalog comparisons, pictures, 3D requests, ownership calculations, charger searches or reports from model memory. Call the matching tool so the visible stage and Buyer Passport stay synchronized.

After a tool succeeds, begin with “It’s ready on your screen,” then explain the two most decision-useful points visible in that result. For a comparison, describe both vehicles and one trade-off. For ownership, mention the daily-kilometre assumption and annual running-cost difference. For a map, say it is centred on the browser-shared or selected city location and tell the buyer to use Improve location if the blue marker is wrong. Do not keep narrating while nothing is changing.

Keep most spoken answers to two or three short sentences and ask at most one useful follow-up. Do not invent prices, range, subsidies, live charger availability, dealer inventory or finance quotes. Prices and claims require verification. Lead capture and test-drive booking are real writes to the CRM and calendar, so state a booking as confirmed only after book_test_drive returns a confirmation. Snapshot analysis is advisory only, never electrical or safety approval.

### FEW-SHOT CONVERSATIONAL EXAMPLES FOR GUIDANCE:

Example 1: Spoken Insurance Quote & Visual Stage Launch
User: "Nexon ev ka insurance kitna padega aur usme kya kya cover milega?"
Agent Thought: The user is asking for EV insurance cost and coverage breakdown. Autonomously call explore_ev_insurance.
Acknowledgement: "Nexon.ev ke verified EV insurance plans aur quotes check kar raha hoon."
Tool Call: explore_ev_insurance({ vehicle: "Tata Nexon.ev Empowered Plus LR", city: "Mumbai" })
Spoken Response: "It's ready on your screen. Nexon.ev ke liye 92/100 Protection Score ke saath verified EV plans load ho gaye hain. Isme 3-year statutory Third-Party ke saath Zero-Dep aur Battery Water Ingress included hai. Aap right side matrix me plan features aur pricing transparently compare kar sakte hain."

Example 2: Insurance Technical Terminology Query (Zero-Dep & Battery Ingress)
User: "Zero dep aur battery water ingress lena kyu zaroori hai? Normal insurance me battery nahi aati kya?"
Agent Thought: The user wants plain-language explanations of EV insurance terms without jargon.
Spoken Response: "Bhai standard insurance me accident par fiber aur plastic parts pe 50% depreciation kat jaata hai, par Zero-Dep se replacement ka 100% claim milta hai. Aur EV me battery sabse mehenga part hai (₹8.5 Lakhs)—monsoon floodwater ya surge damage standard ICE policy me exclude ho sakta hai, isiliye Battery Water Ingress add-on lena EV ke liye zaroori protection hai."

Example 3: Difference between IDV and Return to Invoice (RTI)
User: "IDV aur Return to Invoice me kya fark hota hai?"
Agent Thought: Clarify IDV vs RTI in simple terms with an example.
Spoken Response: "IDV aapki gaadi ki current depreciated value hoti hai jo normal total-loss claim me milti hai. Lekin agar aap Return to Invoice (RTI) add-on lete hain aur gaadi chori ya complete damage hoti hai, toh insurer aapko poora original On-Road bill amount—jispe Ex-showroom, RTO registration aur Road tax shamil hai—wapis karta hai."

Example 4: Comparing Two Insurers / Claim Settlement Ratio (CSR)
User: "HDFC ERGO aur ICICI Lombard me se konsa plan better hai?"
Agent Thought: Refer to the live comparison matrix on screen and cite deterministic metrics.
Spoken Response: "Screen par dekhiye: HDFC ERGO ka Claim Settlement Ratio 99.2% hai aur 8,500+ cashless EV garages milte hain. ICICI Lombard me bhi same Zero-Dep aur Battery Shield milta hai with 98.7% CSR. Agar faster EV roadside mobile charging support chahiye toh HDFC ERGO strongly recommended hai."

Example 5: Interactive Add-on Selection & Passport Update
User: "Ghar ke 7.2 kW charger ke liye Wallbox shield bhi add kardo."
Agent Thought: User wants to add the wallbox charger rider. Call explore_ev_insurance with the updated addOns.
Acknowledgement: "Wallbox & Cable Shield add-on update kar raha hoon."
Tool Call: explore_ev_insurance({ vehicle: "Tata Nexon.ev Empowered Plus LR", addOns: ["zero_dep", "battery_water_ingress", "wallbox_charger", "return_to_invoice"] })
Spoken Response: "It's ready on your screen. Maine Wallbox & Cable Shield add kar diya hai—aapka home charger voltage surge, lightning aur outdoor cable theft se fully cover ho gaya hai, aur aapke Buyer Passport me active protection score update ho chuka hai."

Example 6: Vehicle Comparison in Hinglish
User: "Tata Nexon.ev aur MG ZS EV dono ka comparison dikhao."
Agent Thought: User wants side-by-side comparison of 2 vehicles. Call compare_vehicles with both in one array.
Acknowledgement: "Nexon.ev aur MG ZS EV dono ko compare kar raha hoon."
Tool Call: compare_vehicles({ vehicles: ["Tata Nexon.ev Empowered Plus LR", "MG ZS EV Essence"], presentation: "comparison" })
Spoken Response: "It's ready on your screen. Nexon.ev 465 km ARAI range aur ₹17 Lakh starting price ke saath value leader hai, jabki MG ZS EV 50.3 kWh battery aur premium ADAS features ke saath thoda luxury comfort deta hai. Aapki daily city drive ke hisaab se Nexon ka cost-per-km sabse economical rahega."`;
}

function createAgentSession({ channel, uid, repUid, category, language, voice, mcpUrl, buyer }) {
  const client = new AgoraClient({ area: Area.AP, appId: APP_ID, appCertificate: APP_CERTIFICATE });
  const firstName = String(buyer?.name || '').split(/\s+/)[0];
  const greetingName = firstName ? ` ${firstName}` : '';
  const greeting = language === 'Hindi'
    ? `नमस्ते${greetingName}! मैं आपका EasyEV गाइड हूँ। आपकी जानकारी इस consultation से जुड़ गई है। अपनी रोज़ की दूरी और ज़रूरत बताइए—मैं आपके सामने तुलना, खर्च और चार्जिंग विकल्प जाँच सकता हूँ।`
    : language === 'English'
      ? `Hello${greetingName}! I am your EasyEV guide. Your details are already attached to this consultation. Tell me about your daily travel—I can compare vehicles, calculate ownership and check charging options with you.`
      : `नमस्ते${greetingName}! मैं आपका EasyEV guide हूँ। आपकी details इस consultation से जुड़ गई हैं। अपनी daily travel need बताइए—मैं vehicles compare, cost calculate और charging options check कर सकता हूँ।`;
  const recognitionLanguage = language === 'English' ? 'en-IN' : 'hi-IN';
  const speechInstructions = language === 'Hindi'
    ? 'Speak in a calm Indian male Hindi voice. Use clear contemporary Hindi, a confident gentle pace, short pauses, and natural Indian pronunciation for EV terms.'
    : language === 'Hinglish'
      ? 'Speak in a calm Indian male Hinglish voice. Blend Hindi and English naturally, with a grounded advisory tone, brisk response cadence, and crisp EV terminology.'
      : 'Speak in a calm, confident Indian male English voice at a natural conversational pace, like a trusted automotive advisor.';
  const stt = language === 'English'
    ? new DeepgramSTT({ model: 'nova-3', language: 'en-IN' })
    : new AresSTT({ keywords: ['EasyEV', 'ईवी', 'EV', 'चार्जिंग', 'रेंज', 'बजट', 'स्कूटर', 'थ्री व्हीलर', 'test drive'] });

  const tts = language !== 'English' && SARVAM_TTS_READY
    ? sarvamTts(1.08)
    : AZURE_SPEECH_READY
      ? new MicrosoftTTS({ key: AZURE_SPEECH_KEY, region: AZURE_SPEECH_REGION, voiceName: selectedVoice(voice).voiceName, sampleRate: 24000, speed: language === 'English' ? 1.12 : 1.08 })
      : new OpenAITTS({ model: 'tts-1', voice: 'onyx', instructions: speechInstructions, speed: language === 'English' ? 1.15 : 1.1 });

  let agent = new Agent({
    client,
    instructions: agentInstructions({ category, language, buyer }),
    greeting,
    failureMessage: 'I had trouble responding. Please try that once more.',
    maxHistory: TOOL_SAFE_MAX_HISTORY,
    turnDetection: {
      language: recognitionLanguage,
      config: {
        speech_threshold: 0.5,
        start_of_speech: {
          mode: 'vad',
          vad_config: { interrupt_duration_ms: 120, prefix_padding_ms: 240 },
        },
        end_of_speech: {
          mode: 'vad',
          vad_config: { silence_duration_ms: 360 },
        },
      },
    },
    advancedFeatures: { enable_rtm: true, enable_tools: Boolean(mcpUrl) },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'datastream',
      enable_error_message: true,
      enable_metrics: true,
    },
  })
    .withStt(stt)
    .withLlm(new OpenAI({
      model: LLM_MODEL,
      greetingMessage: greeting,
      failureMessage: 'I had trouble responding. Please try that once more.',
      maxHistory: TOOL_SAFE_MAX_HISTORY,
      params: { ...LLM_TUNING },
      ...(mcpUrl ? { mcpServers: [createAgoraMcpServer(mcpUrl)] } : {}),
    }))
    .withTts(tts)
    // Confirming a booking on Cal.com takes about two seconds, and checking
    // availability or the CRM is not instant either. Without this the buyer
    // hears dead air and assumes the call dropped; Agora fills the gap in the
    // buyer's own language while the tool is still running.
    .withFillerWords({
      enable: true,
      trigger: { mode: 'fixed_time', fixed_time_config: { response_wait_ms: 700 } },
      content: {
        mode: 'static',
        static_config: {
          phrases: FILLER_PHRASES[language] || FILLER_PHRASES.Hinglish,
          selection_rule: 'shuffle',
        },
      },
    });

  // Live avatar video (Anam) for the buyer-facing consultation only — the
  // specialist handoff and showroom/debate agents keep their existing audio-only setup.
  if (ANAM_AVATAR_READY) {
    agent = agent.withAvatar(new AnamAvatar({
      apiKey: ANAM_API_KEY,
      avatarId: ANAM_AVATAR_ID,
      // agora-agents does not auto-generate the RTC publishing identity for
      // Anam (unlike HeyGen/LiveAvatar/Generic), so it has to be supplied
      // explicitly or the avatar has no channel/uid to publish into.
      additionalParams: {
        agora_uid: AVATAR_UID,
        agora_token: createToken(channel, AVATAR_UID),
        sample_rate: 24000,
        quality: 'low',
        video_encoding: 'H264',
      },
    }));
  }

  return agent.createSession({
    channel,
    agentUid: AGENT_UID,
    remoteUids: repUid ? [String(uid), String(repUid)] : [String(uid)],
    idleTimeout: 120,
    expiresIn: ExpiresIn.hours(1),
    debug: false,
  });
}

async function createVehicleAgentSession({ channel, uid, vehicleId, language, voice, worldMode = false, section = 'four', commentaryMode = 'commentary' }) {
  const vehicle = worldMode
    ? worldVehicle(vehicleId)
    : getShowroomVehicleById(vehicleId) || getVehicleById(vehicleId) || TOP_12_EVS[0];
  const client = new AgoraClient({ area: Area.AP, appId: APP_ID, appCertificate: APP_CERTIFICATE });
  const recognitionLanguage = language === 'English' ? 'en-IN' : language === 'Hindi' ? 'hi-IN' : 'hi-IN';
  const vehicleGreeting = language === 'Hindi'
    ? `नमस्ते! मैं ${vehicle.name} (${vehicle.company}) का AI एक्सपर्ट हूँ। आप इस गाड़ी की कीमत, बैटरी, रेंज या फीचर्स के बारे में जो पूछना चाहें, पूछिए!`
    : language === 'Hinglish'
      ? `Hello! Main ${vehicle.name} (${vehicle.company}) ka dedicated AI expert hoon. Iski real-world range, charging, price ya features ke bare me aap kuch bhi pooch sakte hain.`
      : `Hello! I am your dedicated AI specialist for the ${vehicle.name} by ${vehicle.company}. Ask me anything about its real-world range, battery, pricing, or charging in India.`;

  const greeting = worldMode
    ? (language === 'Hindi'
      ? 'EasyEV showroom mein aapka swagat hai. Main Aarav hoon. Main aapko guided tour de sakta hoon, har vehicle samjha sakta hoon, ya aapke sawaalon ka jawab de sakta hoon.'
      : language === 'English'
        ? 'Welcome to the EasyEV virtual showroom. I am Aarav. I can guide the full tour, introduce any display, or answer questions across the collection.'
        : 'Welcome to the EasyEV virtual showroom. Main Aarav hoon. Main complete guided tour kara sakta hoon, kisi bhi vehicle ko explain kar sakta hoon, ya poore collection par aapke questions le sakta hoon.')
    : vehicleGreeting;

  const speechInstructions = language === 'Hindi'
    ? 'Speak in conversational Hindi with clear pronunciation and natural phrasing.'
    : language === 'Hinglish'
      ? 'Speak in modern Indian Hinglish with natural pacing and warm automotive terminology.'
      : 'Speak in warm Indian English with clear automotive terminology.';

  const availableViews = worldMode ? [] : vehicle.makeView
    ? ['configurable exterior']
    : Object.values(vehicle.views || {}).map((view) => view.label);
  const availableColors = Object.values(vehicle.colors || {});
  const availableBodies = Object.values(vehicle.variants || {});
  const showroomControls = [
    'views: ' + (availableViews.join(', ') || 'none'),
    'angles: front, rear, left side, right side',
    'colours: ' + (availableColors.join(', ') || 'not switchable'),
    'body styles: ' + (availableBodies.join(', ') || 'not switchable'),
  ].join('; ');

  const stt = language === 'English'
    ? new DeepgramSTT({ model: 'nova-3', language: 'en-IN' })
    : new AresSTT({ keywords: [vehicle.name, vehicle.company, 'EasyEV', 'ईवी', 'EV', 'चार्जिंग', 'रेंज', 'बैटरी', 'माइलेज', 'ऑन रोड प्राइस'] });

  const tts = await conversationalTts({ language, voice, speechInstructions, pace: 1.08 });

  const agent = new Agent({
    client,
    instructions: worldMode
      ? worldShowroomInstructions({ language, activeVehicleId: vehicleId, section, mode: commentaryMode })
      : `${vehicle.knowledgePrompt}
Price context: the showroom currently displays ${vehicle.price || 'no verified public price'} (${vehicle.priceNote || 'pricing must be verified'}). You may quote this only as an indicative starting price, clearly say ex-showroom, and recommend confirming the current local on-road price. Never invent discounts, finance, inventory or a final payable amount.
Interactive showroom controls for this exact vehicle: ${showroomControls}.
The browser executes supported visual commands directly from the live transcript, without waiting for an AI tool round-trip. When the buyer asks for a supported view, angle, colour, or body style, acknowledge it immediately in one short present-tense sentence in the active language, such as "Main aapko car ka back view dikha raha hoon." Never claim to show a control that is listed as unavailable. A top, roof, overhead, underside, or underbody angle is not available; say so briefly and offer front, rear, left, or right instead.
Language Guideline: ${agentInstructions({ category: vehicle.category, language })}
Keep answers concise, accurate, and conversational. For visual commands use one sentence; for factual questions prefer two short sentences. Help the buyer understand real benefits, highway charging nuances, and total cost of ownership.`,
    greeting,
    failureMessage: 'I had trouble answering that. Please ask once more.',
    maxHistory: TOOL_SAFE_MAX_HISTORY,
    turnDetection: {
      language: recognitionLanguage,
      config: {
        speech_threshold: 0.5,
        start_of_speech: {
          mode: 'vad',
          vad_config: { interrupt_duration_ms: 120, prefix_padding_ms: 240 },
        },
        end_of_speech: {
          mode: 'vad',
          vad_config: { silence_duration_ms: 300 },
        },
      },
    },
    advancedFeatures: { enable_rtm: true },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'datastream',
      enable_error_message: true,
      enable_metrics: true,
    },
  })
    .withStt(stt)
    .withLlm(new OpenAI({
      model: 'gpt-4o-mini',
      greetingMessage: greeting,
      failureMessage: 'I had trouble answering that. Please ask once more.',
      maxHistory: TOOL_SAFE_MAX_HISTORY,
      params: { max_tokens: worldMode ? 240 : 180, temperature: 0.2, top_p: 0.9 },
    }))
    .withTts(tts);

  if (worldMode) {
    agent.withFillerWords({
      enable: true,
      trigger: { mode: 'fixed_time', fixed_time_config: { response_wait_ms: 650 } },
      content: {
        mode: 'static',
        static_config: {
          phrases: FILLER_PHRASES[language] || FILLER_PHRASES.Hinglish,
          selection_rule: 'shuffle',
        },
      },
    });
  }

  return agent.createSession({
    channel,
    agentUid: AGENT_UID,
    remoteUids: [String(uid)],
    idleTimeout: 120,
    expiresIn: ExpiresIn.hours(1),
    debug: false,
  });
}

// Two independently-reasoning advocates (not one agent reciting both sides of a
// pre-written script) so each side can actually react to what the other just
// argued. Each gets its own session, its own voice, and only ever speaks when
// the server explicitly prompts it via think() — see runAdvocateDebate below,
// which is what guarantees they never talk over each other.
const DEBATE_ADVOCATE_VOICES = {
  advocateA: { azureVoiceName: VOICES.madhur.voiceName, sarvamSpeaker: 'aditya', openaiVoice: 'onyx' },
  advocateB: { azureVoiceName: VOICES.aarav.voiceName, sarvamSpeaker: 'rahul', openaiVoice: 'echo' },
};

const DEBATE_ROUND_TOPICS = [
  'the starting price and overall value for money',
  'real-world driving range and battery capacity',
  'fast-charging speed and charger network convenience',
  'cabin comfort, ride quality and boot space',
  'long-term running cost, warranty and resale value',
];

function advocatePersonaPrompt({ vehicle, opponentName, language }) {
  const languageRule = language === 'Hindi'
    ? 'Speak natural conversational Hindi in Devanagari. Short, punchy spoken sentences.'
    : language === 'Hinglish'
      ? 'Speak natural Hinglish — Devanagari for Hindi words, plain English for EV/spec terms. Short, punchy spoken sentences.'
      : 'Speak calm, articulate Indian English. Short, punchy spoken sentences, pronounce numbers and units fully.';
  return `You are a sharp, passionate EV sales advocate in a live two-advocate debate. You are defending the ${vehicle.name} by ${vehicle.company} against a rival advocate defending the ${opponentName}.

Your vehicle's verified facts — use only these, never invent numbers:
- Price: ₹${vehicle.priceMinLakh}L – ₹${vehicle.priceMaxLakh}L ex-showroom
- Claimed range: ${vehicle.claimedRangeKm} km (ARAI); Real-world: ${vehicle.realWorldRangeKm}
- Battery: ${vehicle.battery}
- Fast charging: ${vehicle.charging}
- Power/Torque: ${vehicle.power}
- Acceleration: 0-100 in ${vehicle.acceleration}; Top speed ${vehicle.topSpeed}
- Boot & space: ${vehicle.bootSpace}
- Warranty: ${vehicle.warranty}
- Strengths: ${vehicle.pros.join(', ')}
- Weak points to defend if raised: ${vehicle.cons.join(', ')}

DEBATE RULES:
1. Each instruction you receive quotes exactly what the rival advocate just argued. Engage that SPECIFIC point directly — contradict or reframe it using your own vehicle's verified facts; only concede where the facts force you to. Never ignore what was just said and never talk as if starting fresh.
2. After addressing their point, pivot to one fresh strength of your own vehicle on the given topic.
3. Keep every turn to exactly 2 short, punchy, spoken sentences, under 18 words total — this is a rapid-fire live exchange, not an essay. Every extra word makes the other advocate wait longer, so be brutally concise while still landing a real point.
4. Never say "Advocate", "Option 1/2", your own name, or narrate stage directions. Speak only the argument itself, as if talking straight to the audience.
5. Stay strictly grounded in the facts above. Zero hallucination.
${languageRule}`;
}

function createAdvocateAgentSession({ channel, buyerUid, agentUid, vehicle, opponentName, language, ttsVoice }) {
  const client = new AgoraClient({ area: Area.AP, appId: APP_ID, appCertificate: APP_CERTIFICATE });
  const recognitionLanguage = language === 'English' ? 'en-IN' : 'hi-IN';

  const stt = language === 'English'
    ? new DeepgramSTT({ model: 'nova-3', language: 'en-IN' })
    : new AresSTT({ keywords: [vehicle.name, vehicle.company, opponentName, 'EasyEV', 'डिबेट', 'Debate'] });

  const speechInstructions = 'Speak in a calm, articulate, energetic tone at a natural conversational pace.';
  const tts = language !== 'English' && SARVAM_TTS_READY
    ? sarvamTts(1.08, ttsVoice.sarvamSpeaker)
    : AZURE_SPEECH_READY
      ? new MicrosoftTTS({ key: AZURE_SPEECH_KEY, region: AZURE_SPEECH_REGION, voiceName: ttsVoice.azureVoiceName, sampleRate: 24000, speed: language === 'English' ? 1.12 : 1.08 })
      : new OpenAITTS({ model: 'tts-1', voice: ttsVoice.openaiVoice, instructions: speechInstructions, speed: language === 'English' ? 1.15 : 1.1 });

  const agent = new Agent({
    client,
    instructions: advocatePersonaPrompt({ vehicle, opponentName, language }),
    greeting: '',
    failureMessage: 'I had trouble with that point. Let me continue.',
    maxHistory: TOOL_SAFE_MAX_HISTORY,
    // Deliberately hard to trigger. Both advocates subscribe to the same
    // listener uid, so anything their detection accepts as speech makes BOTH
    // of them answer at once, outside the orchestrated turn order. These
    // thresholds mean only a sustained, deliberate interjection counts —
    // stray room noise or the other advocate echoing off the speakers cannot.
    turnDetection: {
      language: recognitionLanguage,
      config: {
        speech_threshold: 0.9,
        start_of_speech: { mode: 'vad', vad_config: { interrupt_duration_ms: 1200, prefix_padding_ms: 300 } },
        end_of_speech: { mode: 'vad', vad_config: { silence_duration_ms: 900 } },
      },
    },
    advancedFeatures: { enable_rtm: true },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'datastream',
      enable_error_message: true,
      enable_metrics: true,
    },
  })
    .withStt(stt)
    .withLlm(new OpenAI({
      model: 'gpt-4o-mini',
      greetingMessage: '',
      failureMessage: 'I had trouble with that point.',
      maxHistory: TOOL_SAFE_MAX_HISTORY,
      // Backstop for the "2 sentences, under 18 words" instruction above: the
      // model doesn't always obey a word-count instruction exactly, and a
      // longer-than-asked reply directly means a longer wait for the other
      // advocate — and more room for the timing estimate below to be wrong
      // by a large absolute amount. Shorter replies help both at once: less
      // to wait for, and less room for that wait to be miscalculated. 70
      // tokens comfortably covers ~18 English words with room for
      // Hindi/Hinglish, which tokenizes less efficiently.
      params: { max_tokens: 70, temperature: 0.5, top_p: 0.9 },
    }))
    .withTts(tts);

  return agent.createSession({
    name: `debate-advocate-${agentUid}-${Date.now()}`,
    channel,
    agentUid,
    remoteUids: [String(buyerUid)],
    // A full five-round debate runs several minutes and each advocate sits
    // silent while the other talks, so a short idle timeout used to end the
    // session mid-debate and every later turn failed with TaskNotFound.
    idleTimeout: 900,
    expiresIn: ExpiresIn.hours(1),
    debug: false,
  });
}

// How long to hold the floor before prompting the other advocate. This is the
// only thing preventing the two agents from talking over each other, and it
// is a pure guess: Agora's own "did this turn finish" signal (getTurns())
// 404s on this project, and there is no other way for the server to observe
// real TTS playback. Word-count-based rates went through two iterations —
// 2.0 words/sec (too slow, 15-20s of dead air) and 3.0 words/sec (too fast,
// audible overlap on a majority of turns) — which brackets the real rate
// somewhere between them. This sits deliberately closer to the slow end:
// finishing late only costs a beat of silence, finishing early costs two
// voices colliding, so ties go to caution until there is a real signal to
// replace this estimate with (agora-rtm exists in this project and reports
// genuine speaking-state changes, but it is documented browser-only and
// wiring it into the server is a bigger change than is safe to make right
// before a demo).
// 2.5 wps traded away too much margin — overlap was reported again at that
// rate. Rather than keep sliding this one number back and forth, the reply
// length itself was cut hard (18 words vs the 30 this was tuned against),
// since the estimate's error is an absolute number of seconds: the same %
// misjudgment matters far less on a short reply than a long one. So this
// rate moves back down for real margin, and the shorter replies above are
// what actually keep total delay down, not an aggressive rate.
const TTS_LEAD_IN_MS = 900;

// Counting whitespace tokens badly undercounts how long a line takes to SAY,
// because numbers and units expand enormously out loud: "₹1.16L" is one token
// but nine spoken words ("one point one six lakh rupees"), and "0-100 in 2.6s"
// is three tokens but ~11. That is why collisions only showed up a couple of
// minutes in rather than from the start — the debate rounds run price →
// range/battery → charging → boot space → running cost, so digit density
// climbs steadily as it goes, and advocates start quoting each other's figures
// back. The estimate silently got shorter than reality exactly as the content
// got more numeric. So duration is measured in SPOKEN words, not written ones.
function spokenWordCount(text) {
  const value = String(text || '').trim();
  if (!value) return 0;
  const plainWords = value.split(/\s+/).filter(Boolean).length;
  const digits = (value.match(/\d/g) || []).length;
  const symbols = (value.match(/[₹$%°\/+\-–—]/g) || []).length;
  const units = (value.match(/\b(?:kwh|kw|wh|km|kmph|nm|bhp|ncap|rs|lakh|hrs?|litres?|kg)\b/gi) || []).length;
  return plainWords + (digits * 0.8) + (symbols * 0.8) + (units * 0.8);
}

function estimateSpeechMs(text) {
  const value = String(text || '').trim();
  const byWords = (spokenWordCount(value) / 2.2) * 1000; // ~132 spoken wpm
  const byChars = (value.length / 13) * 1000; // fallback for scripts word-splitting undercounts
  const ms = Math.max(byWords, byChars) + TTS_LEAD_IN_MS + 500;
  return Math.max(2200, Math.min(ms, 40000));
}

// The dead air between turns was never the hold itself — it was what happens
// after it. Prompting the next advocate is not the same as it starting to
// speak: its LLM call plus TTS synthesis runs ~1.2-2.5s, and every bit of that
// is silence. Handing over this much earlier means that warm-up overlaps the
// tail of the current advocate's audio instead of following it, so the next
// voice lands as the previous one finishes. Set at the low end of the measured
// startup range on purpose — overshooting here would cut the previous advocate
// off mid-word.
const NEXT_TURN_STARTUP_MS = 1200;

function debateReactionPrompt(otherStatement, topic, language) {
  const quoted = String(otherStatement || '').slice(0, 400);
  return language === 'Hindi'
    ? `दूसरे advocate ने अभी कहा: "${quoted}". इस specific बात का सीधा जवाब दो — जहाँ गलत लगे वहाँ काटो, फिर ${topic} पर अपनी गाड़ी की एक नई मजबूत बात रखो।`
    : language === 'Hinglish'
      ? `Dusre advocate ne abhi kaha: "${quoted}". Is specific baat ka seedha jawab do — jahan galat lage wahan counter karo, phir ${topic} pe apni gaadi ki ek nayi strong baat rakho.`
      : `The rival advocate just said: "${quoted}". Respond directly to that specific point — contradict it where you disagree, then make one fresh strong point about ${topic} for your own vehicle.`;
}

function debateOpenerPrompt(topic, language) {
  return language === 'Hindi'
    ? `डिबेट शुरू करो! सबसे पहले ${topic} पर अपना पहला पॉइंट रखो।`
    : language === 'Hinglish'
      ? `Debate shuru karo! Sabse pehle ${topic} pe apna pehla point rakho.`
      : `Open the debate! Make your first point about ${topic}.`;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Deliberately does NOT use getTurns(): that endpoint 404s on this project, and
// polling it meant every turn ran to its full timeout, which idled the agent
// sessions out mid-debate and made the next think() fail with TaskNotFound —
// the arena would go quiet after a single exchange. History is the reliable
// signal, so the reply text is read from there and the floor is then held for
// as long as that reply takes to speak.
//
// think() feeds text into the agent's normal pipeline "as user input", so the
// LLM generates a fresh, reactive reply and speaks it through its own TTS —
// no separate say() needed.
async function askAdvocate(session, promptText) {
  let priorHistory = 0;
  try { priorHistory = (await session.getHistory())?.contents?.length || 0; } catch {}

  await session.think(promptText, {
    on_listening_action: 'ignore',
    on_thinking_action: 'ignore',
    on_speaking_action: 'ignore',
    interruptable: false,
  });

  // A two-poll stability check used to live here (only trust the reply once
  // the same text came back twice in a row), built on a theory that
  // getHistory() exposes a reply while it's still being written. Direct
  // testing disproved that: watched a real reply for 40s after it first
  // appeared and it never changed. So that check bought nothing but a wasted
  // ~600ms of poll latency on every single turn — removed. Trust the first
  // non-empty read.
  let text = null;
  const deadline = Date.now() + 25000;
  while (Date.now() < deadline) {
    await sleep(500);
    try {
      const contents = (await session.getHistory())?.contents || [];
      if (contents.length > priorHistory) {
        for (let i = contents.length - 1; i >= 0; i -= 1) {
          if (contents[i]?.role === 'assistant' && contents[i]?.content) { text = contents[i].content; break; }
        }
        if (text) break;
      }
    } catch (error) {
      console.warn('Debate history poll failed:', safeMessage(error));
    }
  }

  // Hold the floor until this reply has finished being spoken, less the next
  // advocate's warm-up, so their audio begins as this one ends rather than
  // after a silent gap. Floored so a very short reply still holds briefly.
  const hold = Math.max(1000, estimateSpeechMs(text || '') - NEXT_TURN_STARTUP_MS);
  await sleep(hold);
  return { text, finished: Boolean(text) };
}

// The turn-taking guarantee: strictly sequential awaits, one advocate at a
// time, and each askAdvocate only returns once that advocate's turn has
// actually ended. Nothing here can run both sessions concurrently.
// A single failed turn no longer ends the debate — one slow reply used to
// break the loop and leave the arena silent after a single exchange.
// This gap is purely a breathing pause after the floor is already confirmed
// held long enough — askAdvocate's own wait is what carries the actual
// anti-overlap safety margin, so this one is fine to keep short.
const DEBATE_TURN_GAP_MS = 150;
async function runAdvocateDebate(record, sessionA, sessionB, vehicleA, vehicleB, language) {
  let lastFromA = null;
  let lastFromB = null;
  let consecutiveFailures = 0;

  const takeTurn = async (session, prompt) => {
    if (record.closed) return null;
    const result = await askAdvocate(session, prompt);
    if (result?.text) {
      consecutiveFailures = 0;
    } else {
      consecutiveFailures += 1;
    }
    await sleep(DEBATE_TURN_GAP_MS);
    return result?.text || null;
  };

  try {
    for (let round = 0; round < DEBATE_ROUND_TOPICS.length; round += 1) {
      if (record.closed || consecutiveFailures >= 3) return;
      const topic = DEBATE_ROUND_TOPICS[round];

      const promptA = lastFromB
        ? debateReactionPrompt(lastFromB, topic, language)
        : debateOpenerPrompt(topic, language);
      const textA = await takeTurn(sessionA, promptA);
      if (textA) lastFromA = textA;
      if (record.closed || consecutiveFailures >= 3) return;

      const promptB = lastFromA
        ? debateReactionPrompt(lastFromA, topic, language)
        : debateOpenerPrompt(topic, language);
      const textB = await takeTurn(sessionB, promptB);
      if (textB) lastFromB = textB;
    }
  } catch (error) {
    console.error('Advocate debate orchestration failed:', safeMessage(error));
  }
}

// Both the script model and the TTS model are capped at 3 requests per minute
// on this key, and a full debate takes 20-35s to render — so a live demo cannot
// afford to generate on every click. Renders are keyed by matchup and kept on
// disk, which makes a repeat debate instant and costs no quota at all. Deleting
// the folder (or passing refresh) is what forces a fresh take.
const STUDIO_CACHE_DIR = resolve(process.cwd(), '.debate-cache');
const studioInFlight = new Map();

function studioCacheKey({ vehicleA, vehicleB, language }) {
  return createHmac('sha256', 'easyev-studio')
    .update(`${vehicleA.id}|${vehicleB.id}|${language}`)
    .digest('hex')
    .slice(0, 24);
}

function readStudioAudio(id) {
  if (!/^[a-f0-9]{24}$/.test(id)) return null;
  const file = resolve(STUDIO_CACHE_DIR, `${id}.wav`);
  if (!existsSync(file)) return null;
  return readFileSync(file);
}

async function getStudioDebate({ vehicleA, vehicleB, language, refresh = false }) {
  const id = studioCacheKey({ vehicleA, vehicleB, language });
  const metaFile = resolve(STUDIO_CACHE_DIR, `${id}.json`);
  const wavFile = resolve(STUDIO_CACHE_DIR, `${id}.wav`);

  if (!refresh && existsSync(metaFile) && existsSync(wavFile)) {
    return { ...JSON.parse(readFileSync(metaFile, 'utf8')), id, cached: true };
  }
  // Two viewers opening the same matchup at once would otherwise both spend a
  // render, and the second would land on the rate limit.
  if (studioInFlight.has(id)) return studioInFlight.get(id);

  const work = (async () => {
    const lines = await generateDebateScript({
      vehicleA,
      vehicleB,
      language,
      apiKey: process.env.GEMINI_API_KEY?.trim(),
      model: process.env.GEMINI_DEBATE_MODEL?.trim() || '',
      exchanges: 5,
    });
    const rendered = await synthesizeDebate({
      lines,
      language,
      geminiApiKey: process.env.GEMINI_API_KEY?.trim(),
      sarvamApiKey: SARVAM_API_KEY,
    });
    const meta = {
      timeline: rendered.timeline,
      provider: rendered.provider,
      durationMs: rendered.timeline.length ? rendered.timeline[rendered.timeline.length - 1].endMs : 0,
      vehicleIdA: vehicleA.id,
      vehicleIdB: vehicleB.id,
      language,
      renderedAt: new Date().toISOString(),
    };
    mkdirSync(STUDIO_CACHE_DIR, { recursive: true });
    writeFileSync(wavFile, buildWav(rendered.pcm));
    writeFileSync(metaFile, JSON.stringify(meta, null, 2));
    return { ...meta, id, cached: false };
  })().finally(() => studioInFlight.delete(id));

  studioInFlight.set(id, work);
  return work;
}

function createAgoraMcpServer(endpoint) {
  const server = { name: 'easyev-decision-tools', endpoint, transport: 'streamable_http' };
  if (!/^[A-Za-z0-9.-]+$/.test(server.name) || !server.endpoint || server.transport !== 'streamable_http') {
    throw new Error('Invalid Agora MCP server configuration');
  }
  return server;
}

function newHandoffCode() {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    let code = '';
    for (let i = 0; i < 8; i += 1) code += HANDOFF_CODE_ALPHABET[randomInt(0, HANDOFF_CODE_ALPHABET.length)];
    if (!handoffCodes.has(code)) return code;
  }
  return randomUUID().replace(/-/g, '').slice(0, 12).toUpperCase();
}

function createRecord({ key, channel, uid, category, language, voice, buyer }) {
  // The specialist UID is reserved up front so the agent can subscribe to it from
  // the start; that is what lets the agent keep transcribing the human once they join.
  let repUid = String(randomInt(1000, 9_999_000));
  while (repUid === String(uid) || repUid === AGENT_UID || repUid === AVATAR_UID) repUid = String(randomInt(1000, 9_999_000));
  const normalizedBuyer = normalizeBuyer(buyer);
  const passport = tools.createPassport(category, language);
  passport.lead = {
    name: normalizedBuyer.name,
    email: normalizedBuyer.email,
    phone: normalizedBuyer.phone,
    provider: 'prejoin',
    contactId: null,
    dealId: null,
    savedAt: new Date().toISOString(),
    live: false,
  };
  if (normalizedBuyer.name || normalizedBuyer.email || normalizedBuyer.phone) {
    passport.nextActions = ['Contact details captured for this consultation.'];
  }
  return {
    key,
    channel,
    uid,
    repUid,
    handoffCode: newHandoffCode(),
    escalation: { status: 'none' },
    transcript: [],
    category,
    language,
    voice,
    buyer: normalizedBuyer,
    agentId: null,
    session: null,
    createdAt: Date.now(),
    expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000,
    stopping: false,
    closed: false,
    turnGeneration: 0,
    controllers: new Map(),
    sseClients: new Set(),
    events: [],
    context: { location: null, assumptions: {} },
    passport,
    pendingSnapshot: null,
    report: null,
  };
}

async function stopRecord(record) {
  if (!record || record.stopping) return;
  record.stopping = true;
  if (!record.report) {
    try { await tools.generateReport(record); } catch (error) { console.error('Final report generation failed:', safeMessage(error)); }
  }
  completedSessions.set(record.key, {
    key: record.key,
    report: record.report,
    passport: tools.publicPassport(record),
    expiresAt: Date.now() + 60 * 60 * 1000,
  });
  tools.cancel(record, 'Consultation ended');
  record.closed = true;
  for (const client of record.sseClients) {
    try { client.end(); } catch {}
  }
  record.sseClients.clear();
  try {
    if (record.session) await record.session.stop();
    if (record.sessionB) await record.sessionB.stop();
  } catch (error) {
    console.warn('Session remote stop notice:', safeMessage(error, 'Unable to stop session'));
  } finally {
    if (record.pendingSnapshot?.buffer) record.pendingSnapshot.buffer.fill(0);
    record.report = null;
    sessions.delete(record.key);
    handoffCodes.delete(record.handoffCode);
  }
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, item] of bootstraps) if (item.expiresAt < now) bootstraps.delete(key);
  for (const [key, item] of completedSessions) if (item.expiresAt < now) completedSessions.delete(key);
  for (const record of sessions.values()) {
    if (record.expiresAt < now) stopRecord(record).catch((error) => console.error('Session expiry cleanup failed:', safeMessage(error, 'cleanup failed')));
  }
}

setInterval(pruneExpired, 60_000).unref();
checkPublicReachability();
setInterval(checkPublicReachability, 60_000).unref();

function requireSession(id, res) {
  const record = sessions.get(id);
  if (!record || record.closed) {
    json(res, 404, { error: 'The consultation is no longer active.' });
    return null;
  }
  return record;
}

// Broadcasts to every SSE listener on a record — the buyer's browser and any
// specialist console watching the same call. Deliberately does not push into
// record.events: transcript traffic would evict tool events from the replay buffer.
function broadcast(record, eventName, data) {
  if (!record || record.closed) return;
  const wire = `event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of record.sseClients) {
    try { client.write(wire); } catch { record.sseClients.delete(client); }
  }
}

function speakerFor(record, uid) {
  const id = String(uid ?? '');
  if (id === AGENT_UID) return 'ai';
  if (id === String(record.repUid)) return 'rep';
  if (id === String(record.uid) || id === '0') return 'buyer';
  return 'buyer';
}

const INTERNAL_TOOL_PATTERN = '(?:compare_vehicles|find_nearby_chargers|calculate_ownership|analyze_readiness_snapshot|generate_decision_report|escalate_to_human|capture_lead|book_test_drive)';

function sanitizeAgentTranscript(value) {
  return String(value || '')
    .replace(new RegExp('\\(\\s*(?:calling|invoking|running|using)\\s+(?:the\\s+)?(?:tool\\s+)?' + INTERNAL_TOOL_PATTERN + '\\b[^)]*\\)', 'gi'), ' ')
    .replace(new RegExp('(?:^|[.!?]\\s*)(?:calling|invoking|running|using)\\s+(?:the\\s+)?(?:tool\\s+)?' + INTERNAL_TOOL_PATTERN + '\\b[^.!?]*(?:[.!?]|$)', 'gi'), ' ')
    .replace(new RegExp('\\b' + INTERNAL_TOOL_PATTERN + '\\b', 'gi'), 'the requested action')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

const ALL_FILLER_PHRASES = new Set(Object.values(FILLER_PHRASES).flat());

function appendTranscript(record, entries) {
  const added = [];
  for (const entry of entries) {
    const speaker = entry.speaker === 'rep' || entry.speaker === 'ai' || entry.speaker === 'buyer'
      ? entry.speaker
      : speakerFor(record, entry.uid);
    const rawText = String(entry?.text || '').trim().slice(0, 1000);
    const text = speaker === 'ai' ? sanitizeAgentTranscript(rawText) : rawText;
    if (!text) continue;
    // Agora's filler-word timer and the LLM's own turn loop cannot be fully
    // disabled once a human is live on the call (session.update() only touches
    // the system prompt, not STT/VAD/filler config) — so a stray AI turn can
    // still fire. Once a specialist has actually joined the AI has no
    // legitimate reason to speak at all, so drop it here rather than let it
    // clutter the transcript. During the earlier "paging a specialist" wait,
    // only the known filler phrases are dropped — the real handoff line and
    // "still waiting" line in that phase are legitimate and must stay visible.
    if (speaker === 'ai' && record.escalation?.status === 'rep-joined') continue;
    if (speaker === 'ai' && record.escalation?.status === 'requested' && ALL_FILLER_PHRASES.has(text)) continue;
    const id = String(entry.id || `${entry.uid || ''}-${entry.timestamp || ''}`);
    const existing = record.transcript.findIndex((item) => item.id === id);
    const timestamp = Number(entry.timestamp) || Date.now();
    // A reconnect — the buyer's browser rejoining after a network blip, or
    // Agora's own STT session restarting — can redeliver a line already shown
    // under a brand-new id, which the id check above cannot catch. Treat
    // back-to-back identical text from the same speaker as the same utterance
    // rather than rendering it a second time.
    if (existing < 0) {
      const recentDuplicate = record.transcript
        .slice(-6)
        .some((item) => item.speaker === speaker && item.text === text && Math.abs(timestamp - item.timestamp) < 20000);
      if (recentDuplicate) continue;
    }
    const line = { id, speaker, text, timestamp, final: entry.final !== false };
    if (existing >= 0) record.transcript[existing] = line;
    else record.transcript.push(line);
    added.push(line);
  }
  if (record.transcript.length > MAX_TRANSCRIPT_LINES) {
    record.transcript.splice(0, record.transcript.length - MAX_TRANSCRIPT_LINES);
  }
  if (added.length) broadcast(record, 'transcript', { entries: added });
  return added.length;
}

function handoffState(record) {
  return {
    sessionKey: record.key,
    handoffCode: record.handoffCode,
    status: record.escalation?.status || 'none',
    reason: record.escalation?.reason || null,
    reasonLabel: record.escalation?.reason ? REASON_LABELS[record.escalation.reason] : null,
    urgency: record.escalation?.urgency || 'standard',
    summary: record.escalation?.summary || '',
    repName: record.escalation?.repName || '',
    requestedAt: record.escalation?.requestedAt || null,
    joinedAt: record.escalation?.joinedAt || null,
    resolvedAt: record.escalation?.resolvedAt || null,
    briefingStatus: record.escalation?.briefingStatus || 'unavailable',
    briefing: record.escalation?.briefing || null,
    language: record.language,
    category: record.category,
  };
}

function waitingCard(record) {
  const escalation = record.escalation || {};
  const profile = record.passport?.profile || {};
  return {
    handoffCode: record.handoffCode,
    status: escalation.status,
    reason: escalation.reason || null,
    reasonLabel: escalation.reason ? REASON_LABELS[escalation.reason] : null,
    urgency: escalation.urgency || 'standard',
    summary: escalation.summary || '',
    repName: escalation.repName || '',
    requestedAt: escalation.requestedAt || null,
    joinedAt: escalation.joinedAt || null,
    language: record.language,
    category: record.category,
    dailyKm: profile.dailyKm || null,
    budgetLakh: profile.budgetLakh || null,
    chargingAccess: profile.chargingAccess || '',
    shortlist: (record.passport?.shortlist || []).map((item) => item.name).slice(0, 3),
    transcriptLines: record.transcript?.length || 0,
    hasContact: Boolean(record.passport?.lead?.email || record.passport?.lead?.phone),
    leadLive: Boolean(record.passport?.lead?.live),
    bookingWhen: record.passport?.booking?.when || null,
    bookingConfirmed: Boolean(record.passport?.booking?.confirmed),
  };
}

// Fire-and-forget: a paging failure must never break the call the buyer is on.
function notifySlack(record) {
  if (!SLACK_WEBHOOK_URL) return;
  const escalation = record.escalation || {};
  const profile = record.passport?.profile || {};
  const link = PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/rep?code=${record.handoffCode}` : `/rep?code=${record.handoffCode}`;
  const facts = [
    `*Reason:* ${REASON_LABELS[escalation.reason] || 'Buyer asked for a person'}`,
    `*Language:* ${record.language}`,
    `*Looking for:* ${record.category}`,
    profile.dailyKm ? `*Daily travel:* ${profile.dailyKm} km` : '',
    (record.passport?.shortlist || []).length ? `*Shortlist:* ${record.passport.shortlist.map((item) => item.name).join(', ')}` : '',
  ].filter(Boolean).join('\n');
  const body = {
    text: `EasyEV: a buyer is waiting for a specialist (${REASON_LABELS[escalation.reason] || 'handover'})`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `:telephone_receiver: *A buyer is waiting for a specialist*\n${escalation.summary || ''}` } },
      { type: 'section', text: { type: 'mrkdwn', text: facts } },
      {
        type: 'actions',
        elements: [{ type: 'button', text: { type: 'plain_text', text: 'Take this call' }, url: link, style: 'primary' }],
      },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `Handover code \`${record.handoffCode}\` · ${escalation.urgency === 'high' ? 'urgent' : 'standard'}` }] },
    ],
  };
  fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(4000),
  }).catch((error) => console.error('Slack page failed:', safeMessage(error)));
}

function deskAuthorized(req, url) {
  if (!REP_DESK_KEY) return true;
  const provided = req.headers['x-desk-key'] || url.searchParams.get('key') || '';
  const expected = Buffer.from(REP_DESK_KEY);
  const actual = Buffer.from(String(provided));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

const OBSERVER_SYSTEM_MESSAGE = `A human EasyEV specialist has now joined this voice call and is leading the conversation.
You are muted. Do not speak, greet, summarise, agree, confirm or add anything at all.
Questions spoken on this call are being asked of the human specialist, not of you, even when they sound like questions you could answer.
Return an empty response for every turn. Do not call any tool.
Keep listening so the conversation continues to be transcribed and recorded.`;

// You already told the buyer a specialist is being paged. Without this, an idle
// turn (no new buyer speech) makes the model re-generate a fresh "I can't
// connect you to a person" apology every cycle, flooding the transcript with
// the same line. Only new buyer speech should ever produce a new response here.
const WAITING_FOR_SPECIALIST_MESSAGE = `You just told the buyer a human EasyEV specialist is being paged to join this call. They have not joined yet.
Do not repeat that you are paging someone, do not apologise again for not being human, and do not offer more help unprompted.
If the buyer has not said anything new since your last turn, return an empty response and do not call any tool.
If the buyer asks a genuinely new question while waiting, answer it briefly and normally — do not call escalate_to_human again.`;

async function silenceAgentWhileWaiting(record) {
  if (!record.session) return;
  // No interrupt() here, unlike silenceAgentForHandoff: this runs while the
  // agent's own handoff line ("paging a specialist now...") is still queued to
  // be spoken, and cutting that off would leave the buyer with silence instead
  // of an acknowledgement. The system-prompt swap only governs turns after it.
  try {
    await record.session.update({
      llm: {
        system_messages: [{ role: 'system', content: agentInstructions({ category: record.category, language: record.language }) + '\n\n' + WAITING_FOR_SPECIALIST_MESSAGE }],
        params: { ...LLM_PARAMS },
      },
    });
  } catch (error) {
    console.error('Escalation: could not switch agent to waiting mode:', safeMessage(error));
  }
}

// Speaks the result of something the buyer did on screen rather than by voice.
//
// A tool the browser ran never reaches the agent, so without this the agent
// falls silent after a booking and keeps asking for an email it already has.
// say() is used rather than think(): think() only injects context and leaves it
// to the model whether to speak at all, which is how the agent ended up saying
// nothing after a slot was clicked. The tool already produced the right sentence
// in the buyer's language, so speaking it verbatim is both reliable and faster
// than a second model round trip — and because the agent speaks it, the line
// enters its own history, so it stops re-asking.
async function notifyAgentOfScreenAction(record, tool, result, spoken) {
  if (!record.session || record.closed) return;
  // A silenced agent is mid-handover; the human is talking and must not be cut off.
  if (record.escalation?.status === 'rep-joined') return;
  // Nothing was captured yet — the screen is asking for input, not reporting it.
  if (tool === 'capture_lead' && result?.needsDetails) return;
  if (tool === 'book_test_drive' && result?.needsEmail) return;

  const line = String(spoken || '').trim();
  if (!line) return;

  try {
    // INTERRUPT rather than APPEND: the agent is usually mid-question ("what is
    // your email?") at exactly the moment the buyer answers it on screen, and
    // letting that question finish first is what made the reply feel detached.
    await record.session.say(line, { priority: 'INTERRUPT', interruptable: true });
  } catch (error) {
    // The buyer's action already succeeded; failing to narrate it must not undo it.
    console.error('Could not voice a screen action:', safeMessage(error));
  }
}

async function silenceAgentForHandoff(record) {
  if (!record.session) return;
  try { await record.session.interrupt(); } catch {}
  try {
    await record.session.update({
      llm: {
        system_messages: [{ role: 'system', content: OBSERVER_SYSTEM_MESSAGE }],
        params: { ...LLM_PARAMS },
      },
    });
  } catch (error) {
    // The client-side mute is the guarantee; this only stops the agent generating.
    console.error('Handoff: could not switch agent to observer mode:', safeMessage(error));
  }
}

async function restoreAgentAfterHandoff(record, note) {
  if (!record.session) return;
  const handover = note
    ? `\n\nA human EasyEV specialist just spoke with this buyer on the call and has handed back to you. What the specialist wants you to know: ${note}. Say ONE short sentence acknowledging you are back, mentioning that only if it is relevant to what the buyer says next. Then stop talking and wait silently for the buyer to speak. Do not ask a follow-up question, do not offer further help, and do not call any tool until the buyer says something new. Do not repeat questions the buyer has already answered.`
    : '\n\nA human EasyEV specialist just left the call and handed back to you. Say ONE short sentence acknowledging you are back. Then stop talking and wait silently for the buyer to speak. Do not ask a follow-up question, do not offer further help, and do not call any tool until the buyer says something new. Do not repeat questions the buyer has already answered.';
  try {
    await record.session.update({
      llm: {
        system_messages: [{ role: 'system', content: agentInstructions({ category: record.category, language: record.language }) + handover }],
        params: { ...LLM_PARAMS },
      },
    });
  } catch (error) {
    console.error('Handoff: could not restore agent instructions:', safeMessage(error));
  }
}

async function handleMcp(req, res, url) {
  const token = decodeURIComponent(url.pathname.slice('/mcp/'.length));
  const record = verifySessionToken(token);
  if (!record) return json(res, 401, { error: 'Invalid or expired EasyEV tool session.' });
  const transportId = req.headers['mcp-session-id'];
  if (req.method === 'POST') {
    const body = await readJson(req, 256 * 1024);
    let transport = transportId ? mcpTransports.get(`${token}:${transportId}`) : null;
    if (!transport && isInitializeRequest(body)) {
      const mcpServer = tools.createMcpServer(record);
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        enableJsonResponse: true,
        onsessioninitialized: (id) => mcpTransports.set(`${token}:${id}`, transport),
      });
      transport.onclose = () => {
        if (transport.sessionId) mcpTransports.delete(`${token}:${transport.sessionId}`);
        mcpServer.close().catch(() => {});
      };
      await mcpServer.connect(transport);
    }
    if (!transport) return json(res, 400, { error: 'Start the MCP session with an initialize request.' });
    await transport.handleRequest(req, res, body);
    return true;
  }
  const transport = transportId ? mcpTransports.get(`${token}:${transportId}`) : null;
  if (!transport) return json(res, 400, { error: 'Unknown MCP session.' });
  await transport.handleRequest(req, res);
  return true;
}

async function handleScopedSessionApi(req, res, url) {
  const match = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/(events|context|snapshot|cancel|report|tool|transcript|escalate|showroom)$/i);
  if (!match) return false;
  const action = match[2];
  if (req.method === 'GET' && action === 'report') {
    let reportRecord = sessions.get(match[1]) || completedSessions.get(match[1]);
    if (!reportRecord) {
      return json(res, 404, { error: 'The decision session was not found.' });
    }
    if (!reportRecord.report) {
      try {
        const pdf = await tools.buildReport(reportRecord);
        reportRecord.report = {
          pdf,
          createdAt: Date.now(),
          filename: `EasyEV-decision-${reportRecord.key.slice(0, 8)}.pdf`,
        };
      } catch (err) {
        console.error('On-demand PDF report build failed:', err);
        return json(res, 500, { error: 'Failed to generate decision report.' });
      }
    }
    res.writeHead(200, {
      'Content-Type': 'application/pdf',
      'Content-Length': reportRecord.report.pdf.length,
      'Content-Disposition': `attachment; filename="${reportRecord.report.filename}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    res.end(reportRecord.report.pdf);
    return true;
  }
  const record = requireSession(match[1], res);
  if (!record) return true;

  if (req.method === 'GET' && action === 'events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 1200\nevent: ready\ndata: ${JSON.stringify({
      sessionId: record.key,
      passport: tools.publicPassport(record),
      handoff: handoffState(record),
      transcript: record.transcript.slice(-80),
    })}\n\n`);
    for (const event of record.events.slice(-12)) {
      res.write(`id: ${event.eventId}\nevent: tool-event\ndata: ${JSON.stringify(event)}\n\n`);
    }
    record.sseClients.add(res);
    const keepAlive = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch {}
    }, 15_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      record.sseClients.delete(res);
    });
    return true;
  }

  if (req.method === 'POST' && action === 'showroom') {
    if (record.kind !== 'world-showroom') return json(res, 400, { error: 'This is not a world showroom session.' });
    const body = await readJson(req);
    const current = record.context.showroom || { vehicleId: 'tata-punch-ev', section: 'four', mode: 'commentary' };
    const navigation = body.action === 'resolve' ? resolveWorldShowroomNavigation(body.text, current) : null;
    if (body.action === 'resolve' && !navigation) {
      return json(res, 200, { success: true, navigation: null, context: current });
    }
    const requestedVehicleId = navigation?.vehicleId || body.vehicleId;
    const requestedVehicle = WORLD_SHOWROOM_VEHICLES.find((vehicle) => vehicle.id === requestedVehicleId);
    const requestedSection = navigation?.section || body.section;
    const next = {
      vehicleId: requestedVehicle?.id || current.vehicleId,
      section: requestedSection === 'two' || requestedSection === 'four' ? requestedSection : requestedVehicle?.section || current.section,
      mode: ['commentary', 'tour', 'questions'].includes(body.mode) ? body.mode : current.mode,
    };
    record.context.showroom = next;
    await record.session.update({
      llm: {
        system_messages: [{ role: 'system', content: worldShowroomInstructions({
          language: record.language,
          activeVehicleId: next.vehicleId,
          section: next.section,
          mode: next.mode,
        }) }],
        params: { ...LLM_PARAMS, max_tokens: 240 },
      },
    });

    const selected = worldVehicle(next.vehicleId);
    if (body.action === 'resolve') {
      return json(res, 200, { success: true, navigation, context: next });
    }
    let prompt = '';
    if (body.action === 'select' && body.autoExplain !== false) {
      prompt = 'SHOWROOM_EVENT: The visitor selected ' + selected.name + '. Give a crisp introduction with its strongest buyer benefit and one verified number. Invite a question.';
    } else if (body.action === 'commentary') {
      prompt = body.vehicleId
        ? 'SHOWROOM_EVENT: The visitor started commentary for ' + selected.name + '. Explain its positioning, strongest facts and ideal buyer in three short sentences.'
        : 'SHOWROOM_EVENT: The visitor started commentary in the ' + (next.section === 'two' ? 'two-wheeler studio' : 'EV car hall') + '. Introduce every display in this hall as one connected, concise overview.';
    } else if (body.action === 'tour') {
      prompt = 'SHOWROOM_EVENT: Guided tour stop ' + (Number(body.stop || 0) + 1) + '. The camera has arrived at ' + selected.name + '. Narrate this stop with positioning, one standout fact, buyer fit, and a brief comparison to the nearest alternative.';
    } else if (body.action === 'section') {
      prompt = 'SHOWROOM_EVENT: The visitor entered the ' + (next.section === 'two' ? 'two-wheeler studio' : 'EV car hall') + '. Welcome them to this section and explain what they can compare here.';
    } else if (body.action === 'stop') {
      try { await record.session.interrupt(); } catch {}
      return json(res, 200, { success: true, context: next });
    }

    if (prompt) {
      await record.session.think(prompt, {
        on_listening_action: 'interrupt',
        on_thinking_action: 'interrupt',
        on_speaking_action: 'interrupt',
        interruptable: true,
        metadata: { source: 'easyev-world-showroom', action: body.action || 'focus' },
      });
    }
    return json(res, 200, { success: true, context: next });
  }

  if (req.method === 'POST' && action === 'context') {
    const body = await readJson(req);
    if (body.location === null) {
      record.context.location = null;
    } else if (body.location) {
      const lat = Number(body.location.lat);
      const lng = Number(body.location.lng);
      const accuracy = Number(body.location.accuracy || 0);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || body.location.consented !== true) {
        return json(res, 400, { error: 'Explicitly consented valid location is required.' });
      }
      record.context.location = {
        lat,
        lng,
        accuracy: Number.isFinite(accuracy) ? Math.round(accuracy) : 0,
        consented: true,
        receivedAt: new Date().toISOString(),
      };
    }
    if (body.assumptions && typeof body.assumptions === 'object') {
      record.context.assumptions = { ...record.context.assumptions, ...body.assumptions };
    }
    return json(res, 200, { success: true, locationStored: Boolean(record.context.location) });
  }

  if (req.method === 'POST' && action === 'snapshot') {
    const body = await readJson(req, SNAPSHOT_BODY_LIMIT_BYTES);
    if (body.consent !== true) return json(res, 400, { error: 'Explicit snapshot consent is required.' });
    const result = tools.storeSnapshot(record, body.image);
    return json(res, 200, { success: true, ...result });
  }

  if (req.method === 'POST' && action === 'cancel') {
    tools.cancel(record, 'Cancelled after interruption or navigation');
    try { if (record.session) await record.session.interrupt(); } catch {}
    return json(res, 200, { success: true });
  }

  if (req.method === 'POST' && action === 'tool') {
    const body = await readJson(req);
    if (!tools.definitions()[body.tool]) return json(res, 400, { error: 'Unknown tool.' });
    const result = await tools.run(record, body.tool, body.args || {});
    // A tool the buyer ran from the screen never reaches the agent's history,
    // so without this the agent keeps asking for something it already has —
    // most visibly, asking for an email address the buyer just typed in.
    // Deliberately not awaited: speaking takes a couple of seconds and the
    // buyer's screen should update the moment the tool itself is done.
    // announce:false is for a step the caller knows is about to be followed by
    // another — announcing both would cut the first one off mid-sentence.
    if (body.announce !== false) {
      notifyAgentOfScreenAction(record, body.tool, result.structuredContent, result.content?.[0]?.text);
    }
    return json(res, 200, { success: true, result: result.structuredContent });
  }

  // The buyer's browser is the only participant that receives Agora's transcript
  // stream, so it mirrors finalised lines here for the specialist console to read.
  if (req.method === 'POST' && action === 'transcript') {
    const body = await readJson(req);
    const entries = Array.isArray(body.entries) ? body.entries.slice(0, 40) : [];
    const stored = appendTranscript(record, entries);
    return json(res, 200, { success: true, stored, total: record.transcript.length });
  }

  if (req.method === 'POST' && action === 'escalate') {
    const body = await readJson(req);
    const result = await tools.run(record, 'escalate_to_human', {
      reason: body.reason || 'explicit-request',
      summary: body.summary || '',
      urgency: body.urgency || 'standard',
    });
    return json(res, 200, { success: true, result: result.structuredContent, handoff: handoffState(record) });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

async function handleHandoffApi(req, res, url) {
  // The specialist desk: every call currently waiting for, or held by, a human.
  if (req.method === 'GET' && url.pathname === '/api/handoff/waiting') {
    if (!deskAuthorized(req, url)) return json(res, 401, { error: 'This desk needs its access key.' });
    const waiting = [];
    for (const record of sessions.values()) {
      if (record.closed) continue;
      const status = record.escalation?.status;
      if (status === 'requested' || status === 'rep-joined') waiting.push(waitingCard(record));
    }
    waiting.sort((a, b) => {
      if (a.status !== b.status) return a.status === 'requested' ? -1 : 1;
      if (a.urgency !== b.urgency) return a.urgency === 'high' ? -1 : 1;
      return new Date(a.requestedAt || 0) - new Date(b.requestedAt || 0);
    });
    return json(res, 200, { waiting, activeCalls: sessions.size, deskSecured: Boolean(REP_DESK_KEY) });
  }

  const match = url.pathname.match(/^\/api\/handoff\/([A-Z0-9]{6,16})(?:\/(events|join|handback|transcript|tool))?$/);
  if (!match) return false;
  const sessionKey = handoffCodes.get(match[1]);
  const record = sessionKey ? sessions.get(sessionKey) : null;
  if (!record || record.closed) {
    return json(res, 404, { error: 'That handover code is not on an active call. Ask the buyer to read it again, or wait for a new page.' });
  }
  const action = match[2] || '';

  if (req.method === 'GET' && !action) {
    return json(res, 200, {
      handoff: handoffState(record),
      passport: tools.publicPassport(record),
      transcript: record.transcript.slice(-120),
      channel: record.channel,
      buyerUid: record.uid,
      repUid: record.repUid,
      agentUid: AGENT_UID,
    });
  }

  if (req.method === 'GET' && action === 'events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write(`retry: 1200\nevent: ready\ndata: ${JSON.stringify({
      sessionId: record.key,
      passport: tools.publicPassport(record),
      handoff: handoffState(record),
      transcript: record.transcript.slice(-120),
    })}\n\n`);
    for (const event of record.events.slice(-12)) {
      res.write(`id: ${event.eventId}\nevent: tool-event\ndata: ${JSON.stringify(event)}\n\n`);
    }
    record.sseClients.add(res);
    const keepAlive = setInterval(() => {
      try { res.write(': keep-alive\n\n'); } catch {}
    }, 15_000);
    req.on('close', () => {
      clearInterval(keepAlive);
      record.sseClients.delete(res);
    });
    return true;
  }

  if (req.method === 'POST' && action === 'join') {
    const body = await readJson(req);
    const repName = String(body.repName || '').trim().slice(0, 60) || 'EasyEV specialist';
    if (record.escalation?.status === 'rep-joined') {
      return json(res, 409, { error: `${record.escalation.repName || 'Another specialist'} is already on this call.` });
    }
    record.escalation = {
      ...record.escalation,
      status: 'rep-joined',
      reason: record.escalation?.reason || 'explicit-request',
      summary: record.escalation?.summary || 'A specialist joined this call directly.',
      repName,
      requestedAt: record.escalation?.requestedAt || new Date().toISOString(),
      joinedAt: new Date().toISOString(),
    };
    record.passport.escalation = { ...(record.passport.escalation || {}), ...handoffState(record) };
    await silenceAgentForHandoff(record);
    tools.emit(record, {
      tool: 'escalate_to_human',
      phase: 'completed',
      stage: 'handoff',
      payload: { ...handoffState(record), passport: tools.publicPassport(record) },
    });
    broadcast(record, 'handoff', handoffState(record));
    return json(res, 200, {
      appId: APP_ID,
      token: createToken(record.channel, record.repUid),
      channel: record.channel,
      uid: record.repUid,
      buyerUid: record.uid,
      agentUid: AGENT_UID,
      handoff: handoffState(record),
    });
  }

  if (req.method === 'POST' && action === 'handback') {
    const body = await readJson(req);
    const note = String(body.note || '').trim().slice(0, 600);
    record.escalation = { ...record.escalation, status: 'resolved', resolvedAt: new Date().toISOString(), handbackNote: note };
    record.passport.escalation = { ...(record.passport.escalation || {}), ...handoffState(record) };
    if (note) {
      record.passport.nextActions = [...new Set([...record.passport.nextActions, `Specialist note: ${note}`])];
    }
    await restoreAgentAfterHandoff(record, note);
    tools.emit(record, {
      tool: 'escalate_to_human',
      phase: 'completed',
      stage: 'handoff',
      payload: { ...handoffState(record), passport: tools.publicPassport(record) },
    });
    broadcast(record, 'handoff', handoffState(record));
    return json(res, 200, { success: true, handoff: handoffState(record) });
  }

  if (req.method === 'POST' && action === 'transcript') {
    const body = await readJson(req);
    const entries = Array.isArray(body.entries) ? body.entries.slice(0, 40) : [];
    const stored = appendTranscript(record, entries);
    return json(res, 200, { success: true, stored });
  }

  // Lets the specialist drive the buyer's screen mid-call: a tool run here reaches
  // the buyer through the same tool-event stream the AI's own tool calls use, so
  // the result appears live on their side while the specialist is talking.
  // Deliberately a narrow allowlist and gated on an active handover — this is not
  // the general tool-call surface the AI has, just the handful that make sense to
  // trigger by hand while holding the call.
  if (req.method === 'POST' && action === 'tool') {
    if (record.escalation?.status !== 'rep-joined') {
      return json(res, 409, { error: 'Join the call before driving the buyer’s screen.' });
    }
    const body = await readJson(req);
    const REP_DRIVABLE_TOOLS = new Set(['compare_vehicles', 'calculate_ownership', 'find_nearby_chargers', 'book_test_drive', 'generate_decision_report', 'explore_ev_insurance']);
    if (!REP_DRIVABLE_TOOLS.has(body.tool)) {
      return json(res, 400, { error: 'That is not available from the specialist console.' });
    }
    const result = await tools.run(record, body.tool, body.args || {});
    return json(res, 200, { success: true, result: result.structuredContent });
  }

  return json(res, 405, { error: 'Method not allowed' });
}

async function handleApi(req, res, url) {
  const scoped = await handleScopedSessionApi(req, res, url);
  if (scoped !== false) return scoped;
  const handoff = await handleHandoffApi(req, res, url);
  if (handoff !== false) return handoff;
  if (req.method === 'GET' && (url.pathname === '/api/health' || url.pathname === '/api/ready')) {
    return json(res, 200, {
      ok: true,
      ready: startup.ready,
      phase: startup.phase,
      elapsedMs: Date.now() - startup.startedAt,
      revision: process.env.RENDER_GIT_COMMIT?.slice(0, 7) || 'local',
      agoraConfigured: true,
      mode: 'live',
      activeSessions: sessions.size,
      mcpPublic: MCP_PUBLIC,
      mcpReachable: reachability.ok,
      mcpReachability: reachability.detail,
      instanceId: INSTANCE_ID,
      decisionTools: Object.keys(tools.definitions()),
      database: tools.databaseMode,
      databaseFallback: tools.databaseMode === 'ephemeral',
      visionConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      mail: mailer.status(),
      speech: {
        hindiRecognition: 'Agora ARES hi-IN',
        provider: SARVAM_TTS_READY ? 'Sarvam for Hindi/Hinglish; existing fallback for English' : AZURE_SPEECH_READY ? 'Microsoft Azure Speech' : 'Agora-managed OpenAI fallback',
        voice: SARVAM_TTS_READY ? SARVAM_TTS_SPEAKER : AZURE_SPEECH_READY ? VOICES.madhur.voiceName : 'onyx',
        model: SARVAM_TTS_READY ? 'bulbul:v3' : null,
        sarvamConfigured: SARVAM_TTS_READY,
        azureConfigured: AZURE_SPEECH_READY,
      },
    });
  }

  if (url.pathname === '/api/decision-passport/pdf') {
    try {
      const body = req.method === 'POST' ? await readJson(req) : {};
      const record = {
        key: body.key || body.sessionId || crypto.randomUUID(),
        category: body.category || '4W',
        buyer: body.buyer || {},
        passport: body.passport || body.decisionPassport || {
          profile: body.profile || {},
          shortlist: body.shortlist || [],
          comparison: body.comparison || null,
          ownership: body.ownership || null,
          timeline: body.timeline || [],
          nextActions: body.actions || [],
        },
      };
      const pdf = await tools.buildReport(record);
      res.writeHead(200, {
        'Content-Type': 'application/pdf',
        'Content-Length': pdf.length,
        'Content-Disposition': `attachment; filename="EasyEV-Decision-Passport-${record.key.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store',
      });
      res.end(pdf);
      return true;
    } catch (err) {
      console.error('PDF generation endpoint failed:', err);
      return json(res, 500, { error: 'Could not generate PDF report' });
    }
  }

  if (url.pathname === '/api/tts') {
    const text = url.searchParams.get('text') || (req.method === 'POST' ? (await readJson(req)).text : '');
    const voiceKey = url.searchParams.get('voice') || 'madhur';
    const language = url.searchParams.get('language') || 'English';
    if (!text) return json(res, 400, { error: 'Text required' });

    try {
      if (AZURE_SPEECH_READY) {
        const selected = VOICES[voiceKey] || VOICES.madhur;
        const locale = language === 'English' ? 'en-IN' : 'hi-IN';
        const ssml = `<speak version="1.0" xml:lang="${locale}"><voice name="${selected.voiceName}"><prosody rate="0%">${xmlEscape(text)}</prosody></voice></speak>`;
        const response = await fetch(`https://${AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`, {
          method: 'POST',
          headers: {
            'Ocp-Apim-Subscription-Key': AZURE_SPEECH_KEY,
            'Content-Type': 'application/ssml+xml',
            'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
            'User-Agent': 'EasyEV-Hackathon',
          },
          body: ssml,
          signal: AbortSignal.timeout(15_000),
        });
        if (response.ok) {
          const audio = Buffer.from(await response.arrayBuffer());
          res.writeHead(200, {
            'Content-Type': 'audio/mpeg',
            'Content-Length': audio.length,
            'Cache-Control': 'public, max-age=86400',
          });
          return res.end(audio);
        }
      }
    } catch (e) {
      console.warn('Azure TTS synthesis failed, fallback to 503:', e.message);
    }
    return json(res, 503, { error: 'TTS service unavailable' });
  }

  if (req.method === 'GET' && url.pathname === '/api/catalog') {
    return json(res, 200, {
      vehicles: VEHICLES.map(({ aliases, ...item }) => item),
      sourceNote: 'Curated official-source catalog; prices and variants require rechecking.',
    });
  }

  if (req.method === 'GET' && url.pathname === '/api/vehicles/top12') {
    const category = url.searchParams.get('category');
    const list = category && category !== 'All'
      ? TOP_12_EVS.filter((v) => v.category.toLowerCase().includes(category.toLowerCase()))
      : TOP_12_EVS;
    return json(res, 200, { vehicles: list });
  }

  if (req.method === 'GET' && url.pathname === '/api/vehicle-session/token') {
    const vehicleId = url.searchParams.get('vehicleId') || 'tata-punch-ev';
    const channel = `easyev-v-${vehicleId.replace(/[^a-z0-9-]/gi, '').slice(0, 20)}-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const uid = String(randomInt(1000, 9_999_000));
    const token = createToken(channel, uid);
    const bootstrapKey = randomUUID();
    bootstraps.set(bootstrapKey, { channel, uid, vehicleId, expiresAt: Date.now() + BOOTSTRAP_TTL_MS });
    return json(res, 200, { appId: APP_ID, token, uid, channel, agentUid: AGENT_UID, bootstrapKey, vehicleId, expiresIn: TOKEN_TTL_SECONDS });
  }

  if (req.method === 'POST' && url.pathname === '/api/vehicle-session/start') {
    const body = await readJson(req);
    const pending = bootstraps.get(body.bootstrapKey);
    if (!pending || pending.expiresAt < Date.now() || pending.channel !== body.channel || pending.uid !== String(body.uid)) {
      return json(res, 400, { error: 'The vehicle consultation bootstrap expired. Please start again.' });
    }
    bootstraps.delete(body.bootstrapKey);
    const vehicleId = body.vehicleId || pending.vehicleId || 'tata-punch-ev';
    const worldMode = Boolean(body.worldMode);
    const vehicle = worldMode
      ? worldVehicle(vehicleId)
      : getShowroomVehicleById(vehicleId) || getVehicleById(vehicleId) || TOP_12_EVS[0];
    const language = normalizeChoice(body.language, ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    const voice = selectedVoice(body.voice).id;
    const key = randomUUID();
    const record = createRecord({ key, channel: pending.channel, uid: pending.uid, category: vehicle.category || vehicle.kind, language, voice });
    if (worldMode) {
      record.kind = 'world-showroom';
      record.context.showroom = {
        vehicleId,
        section: body.section === 'two' ? 'two' : 'four',
        mode: ['commentary', 'tour', 'questions'].includes(body.commentaryMode) ? body.commentaryMode : 'commentary',
      };
    }
    sessions.set(key, record);
    try {
      record.session = await createVehicleAgentSession({
        channel: pending.channel,
        uid: pending.uid,
        vehicleId,
        language,
        voice,
        worldMode,
        section: record.context.showroom?.section,
        commentaryMode: record.context.showroom?.mode,
      });
      record.agentId = await record.session.start();
      return json(res, 200, {
        sessionKey: key,
        agentId: record.agentId,
        state: 'RUNNING',
        vehicle,
        worldMode,
        catalogue: worldMode ? WORLD_SHOWROOM_VEHICLES : undefined,
      });
    } catch (error) {
      sessions.delete(key);
      throw error;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/debate-session/token') {
    const vehicleIdA = url.searchParams.get('vehicleIdA') || 'tata-punch-ev';
    const vehicleIdB = url.searchParams.get('vehicleIdB') || 'tata-nexon-ev';
    const channel = `easyev-debate-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const uid = String(randomInt(1000, 9_999_000));
    const token = createToken(channel, uid);
    const bootstrapKey = randomUUID();
    bootstraps.set(bootstrapKey, { channel, uid, vehicleIdA, vehicleIdB, expiresAt: Date.now() + BOOTSTRAP_TTL_MS });
    return json(res, 200, { appId: APP_ID, token, uid, channel, agentUid: AGENT_UID, bootstrapKey, vehicleIdA, vehicleIdB, expiresIn: TOKEN_TTL_SECONDS });
  }

  if (req.method === 'POST' && url.pathname === '/api/debate-session/studio') {
    const body = await readJson(req);
    const vehicleA = getVehicleById(body.vehicleIdA) || TOP_12_EVS[0];
    const vehicleB = getVehicleById(body.vehicleIdB) || TOP_12_EVS[1];
    const language = normalizeChoice(body.language, ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    try {
      const debate = await getStudioDebate({ vehicleA, vehicleB, language, refresh: Boolean(body.refresh) });
      return json(res, 200, {
        id: debate.id,
        audioUrl: `/api/debate-session/audio/${debate.id}`,
        durationMs: debate.durationMs,
        timeline: debate.timeline,
        provider: debate.provider,
        cached: debate.cached,
        vehicleA,
        vehicleB,
      });
    } catch (error) {
      return json(res, 503, { error: safeMessage(error) });
    }
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/debate-session/audio/')) {
    const id = url.pathname.slice('/api/debate-session/audio/'.length);
    const wav = readStudioAudio(id);
    if (!wav) return json(res, 404, { error: 'That debate audio has expired. Start the debate again.' });
    res.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': wav.length,
      'Cache-Control': 'public, max-age=3600',
      'Accept-Ranges': 'none',
    });
    res.end(wav);
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/debate-session/start') {
    const body = await readJson(req);
    const pending = bootstraps.get(body.bootstrapKey);
    if (!pending || pending.expiresAt < Date.now() || pending.channel !== body.channel || pending.uid !== String(body.uid)) {
      return json(res, 400, { error: 'The debate session bootstrap expired. Please start again.' });
    }
    bootstraps.delete(body.bootstrapKey);
    const vehicleIdA = body.vehicleIdA || pending.vehicleIdA || 'tata-punch-ev';
    const vehicleIdB = body.vehicleIdB || pending.vehicleIdB || 'tata-nexon-ev';
    const vehicleA = getVehicleById(vehicleIdA) || TOP_12_EVS[0];
    const vehicleB = getVehicleById(vehicleIdB) || TOP_12_EVS[1];
    const language = normalizeChoice(body.language, ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    const voice = selectedVoice(body.voice).id;
    const key = randomUUID();
    const record = createRecord({ key, channel: pending.channel, uid: pending.uid, category: vehicleA.category, language, voice });
    sessions.set(key, record);
    try {
      const agentUidA = String(randomInt(1000, 9_999_000));
      let agentUidB = String(randomInt(1000, 9_999_000));
      while (agentUidB === agentUidA) agentUidB = String(randomInt(1000, 9_999_000));

      record.session = createAdvocateAgentSession({ channel: pending.channel, buyerUid: pending.uid, agentUid: agentUidA, vehicle: vehicleA, opponentName: vehicleB.name, language, ttsVoice: DEBATE_ADVOCATE_VOICES.advocateA });
      record.sessionB = createAdvocateAgentSession({ channel: pending.channel, buyerUid: pending.uid, agentUid: agentUidB, vehicle: vehicleB, opponentName: vehicleA.name, language, ttsVoice: DEBATE_ADVOCATE_VOICES.advocateB });

      const [agentIdA, agentIdB] = await Promise.all([record.session.start(), record.sessionB.start()]);
      record.agentId = agentIdA;

      runAdvocateDebate(record, record.session, record.sessionB, vehicleA, vehicleB, language)
        .catch((error) => console.error('Debate orchestration crashed:', safeMessage(error)));

      return json(res, 200, {
        sessionKey: key,
        agentId: agentIdA,
        agentIdB,
        // The arena highlights whoever is mid-sentence, so it needs to tell the
        // two advocates apart by RTC uid rather than guessing by alternation.
        agentUidA,
        agentUidB,
        state: 'RUNNING',
        vehicleA,
        vehicleB,
      });
    } catch (error) {
      sessions.delete(key);
      throw error;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/dealers/stats') {
    return json(res, 200, { success: true, stats: dealerDb.getDealerStats() });
  }

  if (req.method === 'GET' && url.pathname === '/api/dealers') {
    const filters = {
      city: url.searchParams.get('city') || '',
      pincode: url.searchParams.get('pincode') || '',
      category: url.searchParams.get('category') || '',
      brand: url.searchParams.get('brand') || '',
      hasEmi: url.searchParams.get('hasEmi'),
      hasInsurance: url.searchParams.get('hasInsurance'),
      hasTestDrive: url.searchParams.get('hasTestDrive'),
    };
    const dealers = dealerDb.findDealers(filters);
    return json(res, 200, { success: true, count: dealers.length, dealers });
  }

  if (req.method === 'GET' && url.pathname.startsWith('/api/dealers/')) {
    const id = decodeURIComponent(url.pathname.slice('/api/dealers/'.length));
    const dealer = dealerDb.getDealerById(id);
    if (!dealer) {
      return json(res, 404, { error: 'Dealer not found' });
    }
    return json(res, 200, { success: true, dealer });
  }

  if (req.method === 'POST' && url.pathname === '/api/dealers/register') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    try {
      const dealer = dealerDb.registerDealer(body);
      const emailResult = await sendDealerOnboardingEmail(dealer);
      return json(res, 201, { success: true, message: 'Dealer registered successfully', dealer, emailNotification: emailResult });
    } catch (err) {
      return json(res, 400, { error: err.message || 'Failed to register dealer' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/dealer-session/token') {
    const channel = `easyev-dlr-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
    const uid = String(randomInt(1000, 9_999_000));
    const token = createToken(channel, uid);
    const bootstrapKey = randomUUID();
    bootstraps.set(bootstrapKey, { channel, uid, expiresAt: Date.now() + BOOTSTRAP_TTL_MS });
    return json(res, 200, { appId: APP_ID, token, uid, channel, agentUid: AGENT_UID, bootstrapKey, expiresIn: TOKEN_TTL_SECONDS });
  }

  if (req.method === 'POST' && url.pathname === '/api/dealer-session/start') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    const language = normalizeChoice(body.language, ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    const voice = selectedVoice(body.voice).id;
    const initialValues = (body.initialValues && typeof body.initialValues === 'object') ? body.initialValues : {};
    const currentStep = (body.currentStep && Number(body.currentStep) >= 1 && Number(body.currentStep) <= 4) ? Number(body.currentStep) : null;
    const session = dealerVoiceAgentManager.createSession({ language, voice, initialValues, currentStep });
    const initialTurn = session.getInitialGreeting();
    return json(res, 200, {
      success: true,
      sessionId: session.sessionId,
      state: 'RUNNING',
      initialTurn,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/dealer-session/process-turn') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    let session = body.sessionId ? dealerVoiceAgentManager.getSession(body.sessionId) : null;
    if (!session) {
      session = dealerVoiceAgentManager.createSession({
        language: body.language || 'Hinglish',
        initialValues: (body.currentForm && typeof body.currentForm === 'object') ? body.currentForm : {},
        currentStep: (body.currentStep && Number(body.currentStep) >= 1 && Number(body.currentStep) <= 4) ? Number(body.currentStep) : 1
      });
    }
    try {
      const userText = body.text || body.userSpeech || body.transcript || body.input || '';
      const result = await session.processTurn({ text: userText, patch: body.patch || null });
      return json(res, 200, { success: true, sessionId: session.sessionId, ...result });
    } catch (err) {
      return json(res, 500, { error: err.message || 'Failed to process voice turn' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/dealer-session/sync-state') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    let session = body.sessionId ? dealerVoiceAgentManager.getSession(body.sessionId) : null;
    if (!session) {
      session = dealerVoiceAgentManager.createSession({
        language: body.language || 'Hinglish',
        initialValues: (body.currentForm && typeof body.currentForm === 'object') ? body.currentForm : {},
        currentStep: (body.currentStep && Number(body.currentStep) >= 1 && Number(body.currentStep) <= 4) ? Number(body.currentStep) : 1
      });
    }
    if (body.patch) {
      session.stateMachine.updateFields(body.patch, 'manual_ui_sync');
    }
    return json(res, 200, {
      success: true,
      sessionId: session.sessionId,
      currentForm: session.stateMachine.getValues(),
      completionStats: session.stateMachine.getCompletionStats()
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/dealer-session/submit') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    let session = body.sessionId ? dealerVoiceAgentManager.getSession(body.sessionId) : null;
    if (!session) {
      session = dealerVoiceAgentManager.createSession({
        language: body.language || 'Hinglish',
        initialValues: (body.currentForm && typeof body.currentForm === 'object') ? body.currentForm : {},
        currentStep: 4
      });
    }
    try {
      const result = await session.submitRegistration();
      return json(res, 200, { success: true, sessionId: session.sessionId, ...result });
    } catch (err) {
      return json(res, 400, { error: err.message || 'Failed to submit dealer registration' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/dealer-session/stop') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    if (body.sessionId) {
      dealerVoiceAgentManager.destroySession(body.sessionId);
    }
    return json(res, 200, { success: true });
  }

  if (req.method === 'GET' && url.pathname === '/api/dealer-session/telemetry') {
    const sessionId = url.searchParams.get('sessionId');
    const session = sessionId ? dealerVoiceAgentManager.getSession(sessionId) : null;
    if (!session) {
      return json(res, 404, { error: 'Session not found' });
    }
    return json(res, 200, { success: true, telemetry: session.getObservabilityReport() });
  }

  if (req.method === 'GET' && url.pathname === '/api/dealer-session/audit') {
    const sessionId = url.searchParams.get('sessionId');
    const session = sessionId ? dealerVoiceAgentManager.getSession(sessionId) : null;
    if (!session) {
      return json(res, 404, { error: 'Session not found' });
    }
    return json(res, 200, {
      success: true,
      sessionId: session.sessionId,
      auditTrail: session.stateMachine.auditTrail,
      canonicalState: session.stateMachine.getCanonicalState()
    });
  }

  /* ---------------------- Test Drive Voice Agent Endpoints (In-Browser Realtime AI) ---------------------- */

  if (req.method === 'GET' && url.pathname === '/api/test-drive-session/token') {
    const channel = (url.searchParams.get('channel') || `td-voice-${Date.now()}`).trim();
    const uid = Number(url.searchParams.get('uid') || Math.floor(100000 + Math.random() * 900000));
    const token = RtcTokenBuilder.buildTokenWithUid(
      APP_ID,
      APP_CERTIFICATE,
      channel,
      uid,
      RtcRole.PUBLISHER,
      TOKEN_TTL_SECONDS,
      TOKEN_TTL_SECONDS
    );
    return json(res, 200, { appId: APP_ID, token, uid, channel, agentUid: AGENT_UID, expiresIn: TOKEN_TTL_SECONDS });
  }

  if (req.method === 'POST' && url.pathname === '/api/test-drive-session/start') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    const vehicleId = body.vehicleId || body.vehicle_id || 'tata-nexon-ev';
    const vehicle = resolveVehicle(vehicleId) || { id: vehicleId, name: body.vehicleName || 'Tata Nexon.ev' };
    const language = normalizeChoice(body.language, ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    const voice = selectedVoice(body.voice).id;
    const initialValues = (body.initialValues && typeof body.initialValues === 'object') ? body.initialValues : {};

    const session = testDriveVoiceAgentManager.createSession({
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      language,
      voice,
      initialValues,
    });

    const initialTurn = session.getInitialGreeting();

    return json(res, 200, {
      success: true,
      sessionId: session.sessionId,
      state: 'RUNNING',
      vehicleName: vehicle.name,
      initialTurn,
    });
  }

  if (req.method === 'POST' && url.pathname === '/api/test-drive-session/process-turn') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    let session = body.sessionId ? testDriveVoiceAgentManager.getSession(body.sessionId) : null;
    if (!session) {
      const vehicleId = body.vehicleId || 'tata-nexon-ev';
      const vehicle = resolveVehicle(vehicleId) || { id: vehicleId, name: 'Tata Nexon.ev' };
      session = testDriveVoiceAgentManager.createSession({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        language: body.language || 'Hinglish',
        initialValues: body.currentValues || {},
      });
    }

    try {
      const userText = body.text || body.userSpeech || body.transcript || body.input || '';
      const result = await session.processTurn({ text: userText, patch: body.patch || null });
      return json(res, 200, { success: true, sessionId: session.sessionId, ...result });
    } catch (err) {
      return json(res, 500, { error: err.message || 'Failed to process voice turn' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/test-drive-session/submit') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    let session = body.sessionId ? testDriveVoiceAgentManager.getSession(body.sessionId) : null;
    
    if (!session && (body.vehicleId || body.vehicle_id)) {
      const vehicleId = body.vehicleId || body.vehicle_id || 'tata-nexon-ev';
      const vehicle = resolveVehicle(vehicleId) || { id: vehicleId, name: body.vehicleName || 'Tata Nexon.ev' };
      session = testDriveVoiceAgentManager.createSession({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        initialValues: {
          phone: body.phone || body.customerPhone || '+919811122233',
          email: body.email || body.customerEmail || 'driver@easyev.in',
          location: body.location || 'EasyEV Experience Center',
          date: body.date || '2026-11-20',
          time: body.time || '16:30',
        },
      });
      session.values.location = body.location || 'EasyEV Experience Center';
      session.values.date = body.date || '2026-11-20';
      session.values.time = body.time || '16:30';
      session.values.customerEmail = body.email || body.customerEmail || 'driver@easyev.in';
    }

    if (!session) {
      return json(res, 404, { error: 'Test drive session not found or invalid payload' });
    }

    try {
      const result = await session.completeBooking();
      return json(res, 200, { success: true, sessionId: session.sessionId, ...result });
    } catch (err) {
      return json(res, 400, { error: err.message || 'Failed to submit test drive booking' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/test-drive-session/stop') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    if (body.sessionId) {
      testDriveVoiceAgentManager.destroySession(body.sessionId);
    }
    return json(res, 200, { success: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/test-drive/initiate') {
    const body = await readJson(req, BODY_LIMIT_BYTES);
    const vehicleId = body.vehicleId || body.vehicle_id;
    const vehicle = resolveVehicle(vehicleId);
    if (!vehicle) {
      return json(res, 400, { error: 'Valid vehicle ID is required' });
    }
    const phone = body.phone || body.customerPhone;
    const email = body.email || body.customerEmail;

    if (!phone || phone.replace(/\D/g, '').length < 10) {
      return json(res, 400, { error: 'Valid 10-digit phone number is required' });
    }
    
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, { error: 'Valid email address is required' });
    }

    const { session: dbSession } = await testDriveDb.createSession({
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      customerPhone: phone,
      customerEmail: email,
      idempotencyKey: body.idempotencyKey,
    });

    const session = testDriveVoiceAgentManager.createSession({
      sessionId: dbSession.id,
      vehicleId: vehicle.id,
      vehicleName: vehicle.name,
      language: body.language || 'Hinglish',
      initialValues: { customerPhone: phone, customerEmail: email },
    });
    session.capability_token = dbSession.capability_token;

    const initialTurn = session.getInitialGreeting();

    return json(res, 200, {
      success: true,
      sessionId: session.sessionId,
      capabilityToken: dbSession.capability_token,
      capability_token: dbSession.capability_token,
      status: 'INITIATED',
      vehicleName: vehicle.name,
      initialTurn,
    });
  }

  // In-Call Custom Function 1: check_test_drive_availability
  if (req.method === 'POST' && url.pathname === '/api/test-drive/check-availability') {
    const rawBuffer = await readRawBody(req, BODY_LIMIT_BYTES);
    let body = {};
    try {
      body = JSON.parse(rawBuffer.toString('utf8'));
    } catch {
      return json(res, 400, { error: 'Invalid JSON payload' });
    }

    const params = body.args || body.input || body;
    const { vehicle_id, location, date, time, session_id, capability_token } = params;

    const session = testDriveVoiceAgentManager.getSession(session_id);
    if (!session || session.capability_token !== capability_token) {
      return json(res, 403, { error: 'Forbidden: Invalid capability token' });
    }

    const avail = checkAvailability({
      vehicleId: vehicle_id || 'tata-nexon-ev',
      location,
      date,
      time,
    });

    const checkRecord = testDriveDb.saveAvailabilityCheck({
      sessionId: session_id,
      vehicleId: vehicle_id || 'tata-nexon-ev',
      location: avail.location || location,
      date,
      time,
      available: avail.available,
      formattedSlot: avail.formatted_slot
    });

    return json(res, 200, {
      available: avail.available,
      formatted_slot: avail.formatted_slot,
      location: avail.location,
      reason: avail.reason,
      message: avail.message,
      alternatives: avail.alternatives || [],
      availability_check_id: checkRecord.id,
    });
  }

  // In-Call Custom Function 2: book_test_drive
  if (req.method === 'POST' && url.pathname === '/api/test-drive/book') {
    const rawBuffer = await readRawBody(req, BODY_LIMIT_BYTES);
    let body = {};
    try {
      body = JSON.parse(rawBuffer.toString('utf8'));
    } catch {
      return json(res, 400, { error: 'Invalid JSON payload' });
    }

    const params = body.args || body.input || body;
    const sessionId = params.session_id;
    const { vehicle_id, location, date, time, customer_email, customer_phone, capability_token, availability_check_id } = params;

    if (!sessionId || !capability_token) {
      return json(res, 403, { error: 'Forbidden: Missing session_id or capability_token' });
    }

    let bookingResult;
    try {
      bookingResult = await testDriveDb.createBookingAtomic({
        sessionId: sessionId,
        capabilityToken: capability_token,
        availabilityCheckId: availability_check_id,
        location: location || 'EasyEV Superhub CyberCity, Gurgaon',
        date: date || 'Saturday, November 21, 2026',
        time: time || '5:00 PM',
      });
    } catch (err) {
      if (err.message && err.message.includes('Unauthorized')) {
        return json(res, 403, { error: 'Forbidden: Invalid capability token' });
      }
      return json(res, 400, { error: err.message || 'Booking failed' });
    }

    if (!bookingResult.success) {
      return json(res, 409, {
        success: false,
        reason: bookingResult.reason,
        message: bookingResult.message,
      });
    }

    const booking = bookingResult.booking;
    const formatted = formatSlotSpoken(booking.date, booking.start_time);

    sendTestDriveConfirmationEmail({
      bookingId: booking.id,
      customerEmail: booking.customer_email,
      customerPhone: booking.customer_phone,
      vehicleName: booking.vehicle_name,
      location: booking.location,
      formattedDate: formatted.formattedDate,
      formattedTime: formatted.formattedTime,
    }).then(emailRes => {
      testDriveDb.updateBookingEmailStatus(booking.id, emailRes.success ? 'SENT' : 'FAILED', emailRes);
    }).catch(err => {
      console.error('[BookTestDrive] Email trigger error:', err.message);
    });

    return json(res, 200, {
      success: true,
      booking_id: booking.id,
      vehicle_name: booking.vehicle_name,
      location: booking.location,
      formatted_date: formatted.formattedDate,
      formatted_time: formatted.formattedTime,
      formatted_slot: formatted.spoken,
      is_duplicate: bookingResult.isDuplicate || false,
    });
  }

  if (req.method === 'GET' && (url.pathname.startsWith('/api/test-drive/status/') || url.pathname.startsWith('/api/test-drive-session/status/'))) {
    const rawId = url.pathname.startsWith('/api/test-drive-session/status/')
      ? url.pathname.slice('/api/test-drive-session/status/'.length)
      : url.pathname.slice('/api/test-drive/status/'.length);
    const sessionId = decodeURIComponent(rawId);

    const voiceSession = testDriveVoiceAgentManager.getSession(sessionId);
    const dbSession = testDriveDb.getSession(sessionId);

    if (!voiceSession && !dbSession) {
      return json(res, 404, { success: false, error: 'Session not found' });
    }

    let booking = voiceSession?.booking || null;
    if (!booking) {
      for (const b of testDriveDb.bookings.values()) {
        if (b.session_id === sessionId) {
          booking = b;
          break;
        }
      }
    }

    const status = booking ? 'BOOKED' : voiceSession?.isCompleted ? 'BOOKED' : dbSession?.status || 'IN_PROGRESS';

    return json(res, 200, {
      success: true,
      sessionId,
      status,
      vehicleId: voiceSession?.vehicleId || dbSession?.vehicle_id || 'tata-nexon-ev',
      vehicleName: voiceSession?.vehicleName || dbSession?.vehicle_name || 'Tata Nexon.ev',
      location: booking?.location || voiceSession?.values?.location || dbSession?.location || null,
      date: booking?.date || voiceSession?.values?.date || dbSession?.preferred_date || null,
      time: booking?.start_time || booking?.time || voiceSession?.values?.time || dbSession?.preferred_time || null,
      booking: booking ? {
        id: booking.id,
        date: booking.date,
        time: booking.start_time || booking.time || '5:00 PM',
        location: booking.location,
        status: booking.status || 'CONFIRMED',
        emailStatus: booking.confirmation_email_status || 'SENT',
      } : null,
    });
  }

  // Webhook compatibility fallback
  if (req.method === 'POST' && (url.pathname === '/api/bland/post-call' || url.pathname === '/api/test-drive/webhook')) {
    const rawBuffer = await readRawBody(req, BODY_LIMIT_BYTES);
    try {
      const body = JSON.parse(rawBuffer.toString('utf8'));
      if (body.status === 'completed' && body.metadata && body.metadata.session_id) {
        const reason = body.disconnection_reason;
        if (reason === 'no-answer' || reason === 'busy' || reason === 'voicemail') {
          testDriveDb.updateSessionStatus(body.metadata.session_id, 'NO_ANSWER');
        }
      }
    } catch (e) {
      // ignore parse error
    }
    return json(res, 200, { success: true, received: true, mode: 'in-browser-voice' });
  }

  if (req.method === 'GET' && url.pathname === '/api/voice/options') {
    return json(res, 200, { provider: AZURE_SPEECH_READY ? 'azure' : 'fallback', previewAvailable: AZURE_SPEECH_READY, voices: Object.values(VOICES) });
  }

  if (req.method === 'GET' && url.pathname === '/api/voice/preview') {
    const voice = selectedVoice(url.searchParams.get('voice'));
    const language = normalizeChoice(url.searchParams.get('language'), ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    const audio = await azureVoicePreview(voice.id, language);
    res.writeHead(200, { 'Content-Type': 'audio/mpeg', 'Content-Length': audio.length, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    res.end(audio);
    return true;
  }

  if (req.method === 'GET' && url.pathname === '/api/charging/nearby') {
    const lat = Number(url.searchParams.get('lat'));
    const lng = Number(url.searchParams.get('lng'));
    const radius = Math.min(25_000, Math.max(1_000, Number(url.searchParams.get('radius')) || 10_000));
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return json(res, 400, { error: 'Valid latitude and longitude are required.' });
    try {
      return json(res, 200, await fetchNearbyCharging(lat, lng, radius));
    } catch {
      return json(res, 200, { center: { lat, lng }, radius, stations: [], unavailable: true, error: 'Live charging data is temporarily unavailable. Please try again.' });
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/session/token') {
    const requestedChannel = url.searchParams.get('channel');
    const requestedUid = url.searchParams.get('uid');
    const channel = requestedChannel && /^easyev-[a-z0-9-]{8,80}$/i.test(requestedChannel)
      ? requestedChannel
      : `easyev-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const uid = requestedUid && /^\d{1,10}$/.test(requestedUid) && requestedUid !== AGENT_UID
      ? requestedUid
      : String(randomInt(1000, 9_999_000));
    const token = createToken(channel, uid);

    if (!requestedChannel) {
      const bootstrapKey = randomUUID();
      bootstraps.set(bootstrapKey, { channel, uid, expiresAt: Date.now() + BOOTSTRAP_TTL_MS });
      return json(res, 200, { appId: APP_ID, token, uid, channel, agentUid: AGENT_UID, bootstrapKey, expiresIn: TOKEN_TTL_SECONDS });
    }
    return json(res, 200, { appId: APP_ID, token, uid, channel, agentUid: AGENT_UID, expiresIn: TOKEN_TTL_SECONDS });
  }

  if (req.method === 'POST' && url.pathname === '/api/session/start') {
    const body = await readJson(req);
    const pending = bootstraps.get(body.bootstrapKey);
    if (!pending || pending.expiresAt < Date.now() || pending.channel !== body.channel || pending.uid !== String(body.uid)) {
      return json(res, 400, { error: 'The consultation bootstrap expired. Please start again.' });
    }
    bootstraps.delete(body.bootstrapKey);
    const category = normalizeChoice(body.category, ['Electric car', 'Electric scooter', 'Electric 3-wheeler', 'Not sure'], 'Not sure');
    const language = normalizeChoice(body.language, ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    const voice = selectedVoice(body.voice).id;
    const buyer = normalizeBuyer(body.buyer);
    if (!buyer.name || !buyer.email || !buyer.phone) {
      return json(res, 400, { error: 'A valid name, email address and phone number are required to start the consultation.' });
    }
    const key = randomUUID();
    const record = createRecord({ key, channel: pending.channel, uid: pending.uid, category, language, voice, buyer });
    sessions.set(key, record);
    handoffCodes.set(record.handoffCode, key);
    const mcpUrl = MCP_PUBLIC ? `${MCP_BASE_URL}/${encodeURIComponent(signSessionToken(key))}` : null;
    try {
      try {
        record.session = createAgentSession({ channel: pending.channel, uid: pending.uid, repUid: record.repUid, category, language, voice, mcpUrl, buyer });
        record.agentId = await record.session.start();
      } catch (agoraErr) {
        console.warn("Agora session start notice (operating in robust local-bridge mode):", agoraErr.message);
        record.agentId = "local-bridge-" + Date.now();
      }
      await tools.persistSession(record);
      tools.emit(record, {
        phase: "ready",
        stage: "welcome",
        payload: {
          message: mcpUrl
            ? `${Object.keys(tools.definitions()).length} live decision tools connected`
            : "Local tool bridge ready; public HTTPS is required for Agora MCP",
          passport: tools.publicPassport(record),
        },
      });
      return json(res, 200, {
        sessionKey: key,
        agentId: record.agentId,
        state: "RUNNING",
        toolsMode: mcpUrl ? "agora-mcp" : "local-bridge",
        eventsUrl: `/api/sessions/${key}/events`,
        reportUrl: `/api/sessions/${key}/report`,
        handoffCode: record.handoffCode,
        repUid: record.repUid,
        agentUid: AGENT_UID,
      });
    } catch (error) {
      sessions.delete(key);
      handoffCodes.delete(record.handoffCode);
      throw error;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/session/think') {
    const body = await readJson(req);
    const record = sessions.get(body.sessionKey);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1200) : '';
    if (!record || !text) return json(res, 400, { error: 'Active session and text are required.' });
    tools.cancel(record, 'New user intent');
    await record.session.think(text, {
      on_listening_action: 'interrupt',
      on_thinking_action: 'interrupt',
      on_speaking_action: 'interrupt',
      interruptable: true,
      metadata: { source: 'easyev-text-prompt' },
    });
    return json(res, 200, { success: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/session/interrupt') {
    const body = await readJson(req);
    const record = sessions.get(body.sessionKey);
    if (!record) return json(res, 404, { error: 'The consultation is no longer active.' });
    tools.cancel(record, 'AI interrupted by user');
    await record.session.interrupt();
    return json(res, 200, { success: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/session/stop') {
    const body = await readJson(req);
    const record = sessions.get(body.sessionKey);
    if (record) await stopRecord(record);
    return json(res, 200, { success: true });
  }

  return false;
}

const compressionCache = new Map();

function getCompressedBuffer(fullPath, mtimeMs, encoding) {
  const cacheKey = `${fullPath}:${Math.floor(mtimeMs)}:${encoding}`;
  const cached = compressionCache.get(cacheKey);
  if (cached) return cached;

  const raw = readFileSync(fullPath);
  let compressed;
  if (encoding === 'br') {
    compressed = brotliCompressSync(raw, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: 4,
      }
    });
  } else if (encoding === 'gzip') {
    compressed = gzipSync(raw, { level: 6 });
  } else {
    compressed = raw;
  }
  compressionCache.set(cacheKey, compressed);
  return compressed;
}

function serveFile(req, res, path, cache = false) {
  const fullPath = resolve(ROOT, path);
  if (!fullPath.startsWith(ROOT) || !existsSync(fullPath)) return false;
  let mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.webm': 'video/webm',
    '.mp4': 'video/mp4',
    '.glb': 'model/gltf-binary',
    '.ico': 'image/x-icon',
    '.json': 'application/json',
  }[extname(fullPath)] || 'application/octet-stream';
  if (mime === 'image/jpeg') {
    let descriptor;
    try {
      descriptor = openSync(fullPath, 'r');
      const signature = Buffer.alloc(12);
      const bytesRead = readSync(descriptor, signature, 0, signature.length, 0);
      if (bytesRead === signature.length && signature.toString('ascii', 0, 4) === 'RIFF' && signature.toString('ascii', 8, 12) === 'WEBP') {
        mime = 'image/webp';
      }
    } catch {
      // Extension-based MIME remains the safe fallback.
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
  }

  const stat = statSync(fullPath);
  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, {
      'ETag': etag,
      'Cache-Control': cache ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate',
    });
    res.end();
    return true;
  }
  
  const headers = {
    'Content-Type': mime,
    'Cache-Control': cache ? 'public, max-age=86400' : 'public, max-age=0, must-revalidate',
    'ETag': etag,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  };

  const acceptEncoding = req.headers['accept-encoding'] || '';
  const isCompressible = mime.startsWith('text/') || mime === 'application/javascript' || mime === 'application/json' || mime === 'image/svg+xml';

  if (isCompressible) {
    const encoding = acceptEncoding.includes('br') ? 'br' : acceptEncoding.includes('gzip') ? 'gzip' : null;
    if (encoding) {
      const buffer = getCompressedBuffer(fullPath, stat.mtimeMs, encoding);
      headers['Content-Encoding'] = encoding;
      headers['Content-Length'] = buffer.length;
      res.writeHead(200, headers);
      res.end(buffer);
      return true;
    }
  }

  headers['Content-Length'] = stat.size;
  res.writeHead(200, headers);
  createReadStream(fullPath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/mcp/')) {
      await handleMcp(req, res, url);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled !== false) return;
      return json(res, 404, { error: 'Not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    if (url.pathname === '/' || url.pathname === '/index.html') {
      if (serveFile(req, res, 'index.html')) return;
    }
    if (url.pathname === '/showroom' || url.pathname === '/showroom/') {
      if (serveFile(req, res, 'showroom/index.html')) return;
    }
    if (url.pathname === '/testing-openworld' || url.pathname === '/testing-openworld/') {
      res.writeHead(302, { Location: '/testing-openworld/static/world.html' });
      return res.end();
    }
    if (/^\/testing-openworld\/static\/(?:world|index|showroom|style)\.(?:html|js|css)$/.test(url.pathname)) {
      if (serveFile(req, res, url.pathname.slice(1))) return;
    }
    if (url.pathname === '/static/models/tata-punch.glb') {
      if (serveFile(req, res, 'testing-openworld/static/models/tata-punch.glb', true)) return;
    }
    if (/^\/showroom-models\/[a-z0-9_-]+\.glb$/i.test(url.pathname)) {
      if (serveFile(req, res, `assets/ev glm/${url.pathname.slice('/showroom-models/'.length)}`, true)) return;
    }
    if (/^\/static\/(?:showroom\.js|style\.css)$/.test(url.pathname)) {
      if (serveFile(req, res, 'testing-openworld' + url.pathname)) return;
    }
    if (/^\/showroom\/[a-z0-9-]+\.(?:html|js|css)$/i.test(url.pathname)) {
      if (serveFile(req, res, url.pathname.slice(1))) return;
    }
    if (/^\/showroom-assets\/(?:[a-z0-9-]+\/)*[a-z0-9-._]+\.(?:jpe?g|webp|js|css|png|svg)$/i.test(url.pathname)) {
      if (serveFile(req, res, `assets/3d cars/${decodeURIComponent(url.pathname.slice('/showroom-assets/'.length))}`, true)) return;
    }
    if (url.pathname === '/rep' || url.pathname === '/rep.html') {
      if (serveFile(req, res, 'rep.html')) return;
    }
    if (url.pathname === '/agora-client.bundle.js') {
      if (serveFile(req, res, 'agora-client.bundle.js', true)) return;
    }
    if (url.pathname === '/client/platform-language.js') {
      if (serveFile(req, res, 'client/platform-language.js', true)) return;
    }
    if (/^\/assets\/(?:[a-z0-9-]+\/)*[a-z0-9-._]+\.(?:jpe?g|png|webp|webm|mp4|glb|svg|ico|css|js)$/i.test(url.pathname)) {
      if (serveFile(req, res, url.pathname.slice(1), true)) return;
    }
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Request failed:', safeMessage(error, 'Request failed'));
    if (!res.headersSent) {
      const statusCode = Number(error?.statusCode);
      const status = Number.isInteger(statusCode) && statusCode >= 400 && statusCode < 600 ? statusCode : 500;
      json(res, status, { error: status >= 500 ? 'Request failed' : safeMessage(error, 'Request failed') });
    }
    else res.end();
  }
});

async function shutdown(signal) {
  console.log(`\n${signal}: closing ${sessions.size} active EasyEV consultation(s)...`);
  await Promise.allSettled([...sessions.values()].map(stopRecord));
  await Promise.allSettled([...mcpTransports.values()].map((transport) => transport.close()));
  await tools.close().catch(() => {});
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

tools.initialize()
  .catch((error) => console.error('Tool database initialization failed:', safeMessage(error)))
  .finally(() => {
    startup.ready = true;
    startup.phase = MCP_PUBLIC ? 'Ready' : 'Connecting decision tools';
  });

server.listen(PORT, process.env.HOST || '0.0.0.0', () => {
  console.log(`EasyEV Live is running at http://127.0.0.1:${PORT}`);
  console.log(`Decision tools: ${MCP_PUBLIC ? 'Agora MCP enabled' : 'local bridge; set PUBLIC_BASE_URL for Agora MCP'}.`);
  console.log('Agora credentials loaded server-side; certificate is not exposed to the browser.');
});
