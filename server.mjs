import http from 'node:http';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { extname, resolve } from 'node:path';
import { createHmac, randomBytes, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import agoraToken from 'agora-token';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { EasyEVToolEngine, VEHICLES, REASON_LABELS } from './decision-tools.mjs';
import { TOP_12_EVS, getVehicleById } from './explore-evs-catalog.mjs';
import {
  AgoraClient,
  Agent,
  Area,
  AresSTT,
  DeepgramSTT,
  ExpiresIn,
  OpenAI,
  OpenAITTS,
  MicrosoftTTS,
} from 'agora-agents';

const ROOT = resolve(import.meta.dirname);
const PORT = Number(process.env.PORT || 4173);
const AGENT_UID = '123456';
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
const HANDOFF_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SNAPSHOT_BODY_LIMIT_BYTES = 1.4 * 1024 * 1024;
const { RtcTokenBuilder, RtcRole } = agoraToken;

loadLocalEnv(resolve(ROOT, '.env'));

const APP_ID = process.env.AGORA_APP_ID?.trim();
const APP_CERTIFICATE = process.env.AGORA_APP_CERTIFICATE?.trim();
if (!APP_ID || !APP_CERTIFICATE) {
  console.error('Missing AGORA_APP_ID or AGORA_APP_CERTIFICATE in .env');
  process.exit(1);
}

const AZURE_SPEECH_KEY = process.env.AZURE_SPEECH_KEY?.trim();
const AZURE_SPEECH_REGION = process.env.AZURE_SPEECH_REGION?.trim();
const AZURE_SPEECH_READY = Boolean(AZURE_SPEECH_KEY && AZURE_SPEECH_REGION);
const PUBLIC_BASE_URL = (process.env.PUBLIC_BASE_URL || process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
const MCP_BASE_URL = (process.env.AGORA_MCP_URL?.trim() || (PUBLIC_BASE_URL ? `${PUBLIC_BASE_URL}/mcp` : '')).replace(/\/$/, '');
const MCP_PUBLIC = /^https:\/\//i.test(MCP_BASE_URL);
const MCP_SIGNING_SECRET = process.env.MCP_SIGNING_SECRET?.trim() || randomBytes(32).toString('hex');
// Optional shared secret for the specialist desk. When unset the queue is open,
// which is fine on a laptop but should never be the case on a public deployment.
const REP_DESK_KEY = process.env.REP_DESK_KEY?.trim() || '';
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL?.trim() || '';
const VOICES = Object.freeze({
  madhur: { id: 'madhur', name: 'Madhur', voiceName: 'hi-IN-MadhurNeural', description: 'Warm, grounded Hindi' },
  aarav: { id: 'aarav', name: 'Aarav', voiceName: 'hi-IN-AaravNeural', description: 'Calm, modern Hindi' },
  kunal: { id: 'kunal', name: 'Kunal', voiceName: 'hi-IN-KunalNeural', description: 'Clear, conversational Hindi' },
});
const mapCache = new Map();
const voicePreviewCache = new Map();

const bootstraps = new Map();
const sessions = new Map();
const completedSessions = new Map();
const mcpTransports = new Map();
const startup = { startedAt: Date.now(), phase: 'Waking backend', ready: false };
const tools = new EasyEVToolEngine({
  databaseUrl: process.env.DATABASE_URL?.trim(),
  geminiApiKey: process.env.GEMINI_API_KEY?.trim(),
  geminiModel: process.env.GEMINI_MODEL?.trim() || 'gemini-2.0-flash',
  openChargeMapKey: process.env.OPENCHARGEMAP_API_KEY?.trim(),
  publicBaseUrl: PUBLIC_BASE_URL,
  onEscalation: (record) => {
    broadcast(record, 'handoff', handoffState(record));
    notifySlack(record);
  },
});

const handoffCodes = new Map();

function loadLocalEnv(path) {
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
  return [APP_ID, APP_CERTIFICATE, AZURE_SPEECH_KEY, process.env.GEMINI_API_KEY, process.env.DATABASE_URL, MCP_SIGNING_SECRET]
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
        signal: AbortSignal.timeout(18_000),
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

function agentInstructions({ category, language }) {
  const languageStyle = language === 'Hindi'
    ? 'Speak natural contemporary Hindi in Devanagari. Use common English EV terms only where Indian shoppers normally use them. Do not answer in romanized Hindi.'
    : language === 'Hinglish'
      ? 'Speak warm, natural Indian Hinglish. Use Devanagari for Hindi words and familiar English for EV, charging, range, budget, finance, test drive, and model names. Avoid a foreign accent or over-formal Hindi.'
    : 'Speak clear Indian English with familiar Indian automotive vocabulary and a calm, efficient conversational pace.';

  return `You are EasyEV AI, a fast, calm and practical voice guide for people in India choosing an electric car, scooter, or 3-wheeler.

The shopper selected category: ${category}. Their preferred conversation language is ${language}.

Language and voice style: ${languageStyle}

You have six real EasyEV decision tools. Autonomously select the one best tool from the meaning of natural English, Hindi or Hinglish:
- compare_vehicles for comparisons, shortlists, pictures, specifications and rankings. Include every vehicle name the buyer said. Set presentation to "photo" for picture/image requests and "3d" for 3D/360/AR requests; for two vehicles use one call with both names.
- find_nearby_chargers for chargers, charging stations, maps and distance.
- calculate_ownership for cost, savings, EMI, kilometres per day, tariffs and changed assumptions.
- analyze_readiness_snapshot for a user-operated one-time parking, connector or electrical-label image.
- generate_decision_report for a report, PDF, summary or download.
- escalate_to_human to bring a live human EasyEV specialist onto this same call.

Call escalate_to_human when the buyer asks for a person, salesperson, manager or dealer; when they want a fleet, bulk or company purchase; when they want to negotiate price, discount or exchange value; when they need a finance or loan structure you cannot quote; when a trust concern or complaint stays open after you have addressed it once; or when they are ready to buy and need a human to close. Pass a short English summary the specialist can read before speaking. Do not escalate for anything the catalog, ownership calculator, charger search or report already answers, and do not escalate twice in one call. After the tool succeeds, say only the handover sentence it returns and then stop talking; a person is joining and you must not keep selling over them.

Before a tool call, acknowledge in one short sentence such as “I’ll check that now,” then call exactly one best-fit tool immediately. Pass numbers as numbers when possible, but the tools also accept spoken numeric strings. If a tool rejects an argument, silently correct the shape and retry once; never tell the buyer only that there was a “tool call issue.” Do not say you cannot show maps, pictures, calculations or reports: the tools provide them. If location or an image is needed, call the relevant tool so the interface requests explicit consent. Never infer consent.

Location is required only for find_nearby_chargers. Never ask for, wait for, or reuse a location requirement before compare_vehicles, vehicle pictures, 3D/360/AR requests, calculate_ownership, snapshot consent, or report generation. If the buyer changes from a charger request to another intent, abandon the location question and execute the new best-fit tool. A photo or 3D request must call compare_vehicles even when a charging map is currently visible. Treat each new buyer request as the active intent; use prior turns only to resolve omitted vehicle names or changed assumptions.

Do not answer catalog comparisons, pictures, 3D requests, ownership calculations, charger searches or reports from model memory. Call the matching tool so the visible stage and Buyer Passport stay synchronized.

After a tool succeeds, begin with “It’s ready on your screen,” then explain the two most decision-useful points visible in that result. For a comparison, describe both vehicles and one trade-off. For ownership, mention the daily-kilometre assumption and annual running-cost difference. For a map, say it is centred on the browser-shared or selected city location and tell the buyer to use Improve location if the blue marker is wrong. Do not keep narrating while nothing is changing.

Keep most spoken answers to two or three short sentences and ask at most one useful follow-up. Do not invent prices, range, subsidies, live charger availability, dealer inventory, finance quotes or booking confirmation. Prices and claims require verification. Test-drive, dealer, calendar and WhatsApp actions remain simulated. Snapshot analysis is advisory only, never electrical or safety approval.`;
}

function createAgentSession({ channel, uid, repUid, category, language, voice, mcpUrl }) {
  const client = new AgoraClient({ area: Area.AP, appId: APP_ID, appCertificate: APP_CERTIFICATE });
  const greeting = language === 'Hindi'
    ? 'नमस्ते! मैं आपका EasyEV गाइड हूँ। अपनी रोज़ की दूरी और ज़रूरत बताइए—मैं आपके सामने तुलना, खर्च और चार्जिंग विकल्प जाँच सकता हूँ।'
    : language === 'English'
      ? 'Hello! I am your EasyEV guide. Tell me about your daily travel—I can compare vehicles, calculate ownership and check charging options with you.'
      : 'नमस्ते! मैं आपका EasyEV guide हूँ। अपनी daily travel need बताइए—मैं आपके सामने vehicles compare, cost calculate और charging options check कर सकता हूँ।';
  const recognitionLanguage = language === 'English' ? 'en-IN' : 'hi-IN';
  const speechInstructions = language === 'Hindi'
    ? 'Speak in a calm Indian male Hindi voice. Use clear contemporary Hindi, a confident gentle pace, short pauses, and natural Indian pronunciation for EV terms.'
    : language === 'Hinglish'
      ? 'Speak in a calm Indian male Hinglish voice. Blend Hindi and English naturally, with a grounded advisory tone, brisk response cadence, and crisp EV terminology.'
      : 'Speak in a calm, confident Indian male English voice at a natural conversational pace, like a trusted automotive advisor.';
  const stt = language === 'English'
    ? new DeepgramSTT({ model: 'nova-3', language: 'en-IN' })
    : new AresSTT({ keywords: ['EasyEV', 'ईवी', 'EV', 'चार्जिंग', 'रेंज', 'बजट', 'स्कूटर', 'थ्री व्हीलर', 'test drive'] });

  const tts = AZURE_SPEECH_READY
    ? new MicrosoftTTS({ key: AZURE_SPEECH_KEY, region: AZURE_SPEECH_REGION, voiceName: selectedVoice(voice).voiceName, sampleRate: 24000, speed: language === 'English' ? 1.12 : 1.08 })
    : new OpenAITTS({ model: 'tts-1', voice: 'onyx', instructions: speechInstructions, speed: language === 'English' ? 1.15 : 1.1 });

  const agent = new Agent({
    client,
    instructions: agentInstructions({ category, language }),
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
    .withTts(tts);

  return agent.createSession({
    channel,
    agentUid: AGENT_UID,
    remoteUids: repUid ? [String(uid), String(repUid)] : [String(uid)],
    idleTimeout: 120,
    expiresIn: ExpiresIn.hours(1),
    debug: false,
  });
}

function createVehicleAgentSession({ channel, uid, vehicleId, language, voice }) {
  const vehicle = getVehicleById(vehicleId) || TOP_12_EVS[0];
  const client = new AgoraClient({ appId: APP_ID, appCert: APP_CERTIFICATE, area: Area.GLOBAL });
  const recognitionLanguage = language === 'English' ? 'en-IN' : language === 'Hindi' ? 'hi-IN' : 'hi-IN';
  const greeting = language === 'Hindi'
    ? `नमस्ते! मैं ${vehicle.name} (${vehicle.company}) का AI एक्सपर्ट हूँ। आप इस गाड़ी की कीमत, बैटरी, रेंज या फीचर्स के बारे में जो पूछना चाहें, पूछिए!`
    : language === 'Hinglish'
      ? `Hello! Main ${vehicle.name} (${vehicle.company}) ka dedicated AI expert hoon. Iski real-world range, charging, price ya features ke bare me aap kuch bhi pooch sakte hain.`
      : `Hello! I am your dedicated AI specialist for the ${vehicle.name} by ${vehicle.company}. Ask me anything about its real-world range, battery, pricing, or charging in India.`;

  const speechInstructions = language === 'Hindi'
    ? 'Speak in conversational Hindi with clear pronunciation and natural phrasing.'
    : language === 'Hinglish'
      ? 'Speak in modern Indian Hinglish with natural pacing and warm automotive terminology.'
      : 'Speak in warm Indian English with clear automotive terminology.';

  const stt = language === 'English'
    ? new DeepgramSTT({ model: 'nova-3', language: 'en-IN' })
    : new AresSTT({ keywords: [vehicle.name, vehicle.company, 'EasyEV', 'ईवी', 'EV', 'चार्जिंग', 'रेंज', 'बैटरी', 'माइलेज', 'ऑन रोड प्राइस'] });

  const tts = AZURE_SPEECH_READY
    ? new MicrosoftTTS({ key: AZURE_SPEECH_KEY, region: AZURE_SPEECH_REGION, voiceName: selectedVoice(voice).voiceName, sampleRate: 24000, speed: language === 'English' ? 1.12 : 1.08 })
    : new OpenAITTS({ model: 'tts-1', voice: 'onyx', instructions: speechInstructions, speed: language === 'English' ? 1.15 : 1.1 });

  const agent = new Agent({
    client,
    instructions: `${vehicle.knowledgePrompt}
Language Guideline: ${agentInstructions({ category: vehicle.category, language })}
Keep answers concise, accurate, and conversational. Help the buyer understand real benefits, highway charging nuances, and total cost of ownership.`,
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
          vad_config: { silence_duration_ms: 360 },
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
      params: { max_tokens: 360, temperature: 0.25, top_p: 0.9 },
    }))
    .withTts(tts);

  return agent.createSession({
    channel,
    agentUid: AGENT_UID,
    remoteUids: [String(uid)],
    idleTimeout: 120,
    expiresIn: ExpiresIn.hours(1),
    debug: false,
  });
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

function createRecord({ key, channel, uid, category, language, voice }) {
  // The specialist UID is reserved up front so the agent can subscribe to it from
  // the start; that is what lets the agent keep transcribing the human once they join.
  let repUid = String(randomInt(1000, 9_999_000));
  while (repUid === String(uid) || repUid === AGENT_UID) repUid = String(randomInt(1000, 9_999_000));
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
    passport: tools.createPassport(category, language),
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
  } catch (error) {
    const message = safeMessage(error, 'Unable to stop session').toLowerCase();
    if (!message.includes('404') && !message.includes('already') && !message.includes('not found')) throw error;
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

function appendTranscript(record, entries) {
  const added = [];
  for (const entry of entries) {
    const text = String(entry?.text || '').trim().slice(0, 1000);
    if (!text) continue;
    const id = String(entry.id || `${entry.uid || ''}-${entry.timestamp || ''}`);
    const existing = record.transcript.findIndex((item) => item.id === id);
    const line = {
      id,
      speaker: entry.speaker === 'rep' || entry.speaker === 'ai' || entry.speaker === 'buyer'
        ? entry.speaker
        : speakerFor(record, entry.uid),
      text,
      timestamp: Number(entry.timestamp) || Date.now(),
      final: entry.final !== false,
    };
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
    ? `\n\nA human EasyEV specialist just spoke with this buyer on the call and has handed back to you. What the specialist wants you to know: ${note}. Acknowledge the handover back in one short sentence, then continue from there. Do not repeat questions the buyer has already answered.`
    : '\n\nA human EasyEV specialist just left the call and handed back to you. Acknowledge the handover back in one short sentence, then continue. Do not repeat questions the buyer has already answered.';
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
  const match = url.pathname.match(/^\/api\/sessions\/([0-9a-f-]{36})\/(events|context|snapshot|cancel|report|tool|transcript|escalate)$/i);
  if (!match) return false;
  const action = match[2];
  if (req.method === 'GET' && action === 'report') {
    const reportRecord = sessions.get(match[1]) || completedSessions.get(match[1]);
    if (!reportRecord?.report || Date.now() - reportRecord.report.createdAt > 60 * 60 * 1000) {
      return json(res, 404, { error: 'The decision report is not ready.' });
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

  const match = url.pathname.match(/^\/api\/handoff\/([A-Z0-9]{6,16})(?:\/(events|join|handback|transcript))?$/);
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
      decisionTools: Object.keys(tools.definitions()),
      database: tools.databaseMode,
      databaseFallback: tools.databaseMode === 'ephemeral',
      visionConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      speech: {
        hindiRecognition: 'Agora ARES hi-IN',
        provider: AZURE_SPEECH_READY ? 'Microsoft Azure Speech' : 'Agora-managed OpenAI fallback',
        voice: AZURE_SPEECH_READY ? VOICES.madhur.voiceName : 'onyx',
        azureConfigured: AZURE_SPEECH_READY,
      },
    });
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
    const vehicle = getVehicleById(vehicleId) || TOP_12_EVS[0];
    const language = normalizeChoice(body.language, ['Hinglish', 'English', 'Hindi'], 'Hinglish');
    const voice = selectedVoice(body.voice).id;
    const key = randomUUID();
    const record = createRecord({ key, channel: pending.channel, uid: pending.uid, category: vehicle.category, language, voice });
    sessions.set(key, record);
    try {
      record.session = createVehicleAgentSession({ channel: pending.channel, uid: pending.uid, vehicleId, language, voice });
      record.agentId = await record.session.start();
      return json(res, 200, {
        sessionKey: key,
        agentId: record.agentId,
        state: 'RUNNING',
        vehicle,
      });
    } catch (error) {
      sessions.delete(key);
      throw error;
    }
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
    const key = randomUUID();
    const record = createRecord({ key, channel: pending.channel, uid: pending.uid, category, language, voice });
    sessions.set(key, record);
    handoffCodes.set(record.handoffCode, key);
    const mcpUrl = MCP_PUBLIC ? `${MCP_BASE_URL}/${encodeURIComponent(signSessionToken(key))}` : null;
    try {
      record.session = createAgentSession({ channel: pending.channel, uid: pending.uid, repUid: record.repUid, category, language, voice, mcpUrl });
      record.agentId = await record.session.start();
      await tools.persistSession(record);
      tools.emit(record, {
        phase: 'ready',
        stage: 'welcome',
        payload: {
          message: mcpUrl ? 'Five live decision tools connected' : 'Local tool bridge ready; public HTTPS is required for Agora MCP',
          passport: tools.publicPassport(record),
        },
      });
      return json(res, 200, {
        sessionKey: key,
        agentId: record.agentId,
        state: 'RUNNING',
        toolsMode: mcpUrl ? 'agora-mcp' : 'local-bridge',
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

function serveFile(res, path, cache = false) {
  const fullPath = resolve(ROOT, path);
  if (!fullPath.startsWith(ROOT) || !existsSync(fullPath)) return false;
  const mime = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
  }[extname(fullPath)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self)',
  });
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
    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(res, 'index.html');
    if (url.pathname === '/rep' || url.pathname === '/rep.html') return serveFile(res, 'rep.html');
    if (url.pathname === '/agora-client.bundle.js') return serveFile(res, 'agora-client.bundle.js');
    if (/^\/assets\/[a-z0-9\/-]+\.(?:jpe?g|png|webp|svg|glb|gltf)$/i.test(url.pathname)) return serveFile(res, url.pathname.slice(1), true);
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Request failed:', safeMessage(error, 'Request failed'));
    if (!res.headersSent) json(res, Number(error?.statusCode) || 500, { error: safeMessage(error, 'Request failed') });
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
