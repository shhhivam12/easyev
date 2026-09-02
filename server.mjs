import http from 'node:http';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import agoraToken from 'agora-token';
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
const BOOTSTRAP_TTL_MS = 5 * 60 * 1000;
const BODY_LIMIT_BYTES = 32 * 1024;
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
const VOICES = Object.freeze({
  madhur: { id: 'madhur', name: 'Madhur', voiceName: 'hi-IN-MadhurNeural', description: 'Warm, grounded Hindi' },
  aarav: { id: 'aarav', name: 'Aarav', voiceName: 'hi-IN-AaravNeural', description: 'Calm, modern Hindi' },
  kunal: { id: 'kunal', name: 'Kunal', voiceName: 'hi-IN-KunalNeural', description: 'Clear, conversational Hindi' },
});
const mapCache = new Map();
const voicePreviewCache = new Map();

const bootstraps = new Map();
const sessions = new Map();

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
  return [APP_ID, APP_CERTIFICATE, AZURE_SPEECH_KEY]
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

async function readJson(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT_BYTES) throw new Error('Request body is too large');
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
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
      : 'Speak clear Indian English with familiar Indian automotive vocabulary and a calm, unhurried pace.';

  return `You are EasyEV AI, a calm and practical voice guide for people in India choosing an electric car, scooter, or 3-wheeler.

The shopper selected category: ${category}. Their preferred conversation language is ${language}.

Language and voice style: ${languageStyle}

Your job is to discover their use case, daily distance, budget, charging access, passenger or payload needs, and priorities. Help them compare fit dimensions and trade-offs. Do not invent live vehicle prices, range claims, subsidies, dealer availability, finance quotes, or booking confirmation. The comparison cards and ownership calculator in the web app are explicitly illustrative. Test-drive selections are stored only in the browser and are not sent to a dealer, calendar, or WhatsApp.

Keep most spoken answers to two or three short sentences. Ask at most one useful follow-up question per turn. Pronounce numbers and units naturally for India. If uncertain, say so. Never pressure the shopper or claim that EasyEV has completed an external action.`;
}

function createAgentSession({ channel, uid, category, language, voice }) {
  const client = new AgoraClient({ area: Area.AP, appId: APP_ID, appCertificate: APP_CERTIFICATE });
  const greeting = language === 'Hindi'
    ? 'नमस्ते! मैं आपकी EasyEV गाइड हूँ। आप रोज़ कितनी दूरी तय करते हैं, और EV से क्या ज़रूरत पूरी करना चाहते हैं?'
    : language === 'English'
      ? 'Hello! I am your EasyEV guide. Tell me about your daily travel, and we will find the EV that fits your life.'
      : 'नमस्ते! मैं आपकी EasyEV guide हूँ। अपनी daily travel need बताइए, फिर हम सही EV fit साथ में compare करेंगे।';
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
    ? new MicrosoftTTS({ key: AZURE_SPEECH_KEY, region: AZURE_SPEECH_REGION, voiceName: selectedVoice(voice).voiceName, sampleRate: 24000, speed: language === 'English' ? 1 : 0.96 })
    : new OpenAITTS({ model: 'tts-1', voice: 'onyx', instructions: speechInstructions, speed: language === 'English' ? 1.04 : 0.98 });

  const agent = new Agent({
    client,
    instructions: agentInstructions({ category, language }),
    greeting,
    failureMessage: 'I had trouble responding. Please try that once more.',
    maxHistory: 50,
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
    advancedFeatures: { enable_rtm: true, enable_tools: false },
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
      failureMessage: 'I had trouble responding. Please try that once more.',
      maxHistory: 15,
      params: { max_tokens: 320, temperature: 0.4, top_p: 0.9 },
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

async function stopRecord(record) {
  if (!record || record.stopping) return;
  record.stopping = true;
  try {
    await record.session.stop();
  } catch (error) {
    const message = safeMessage(error, 'Unable to stop session').toLowerCase();
    if (!message.includes('404') && !message.includes('already') && !message.includes('not found')) throw error;
  } finally {
    sessions.delete(record.key);
  }
}

function pruneExpired() {
  const now = Date.now();
  for (const [key, item] of bootstraps) if (item.expiresAt < now) bootstraps.delete(key);
  for (const record of sessions.values()) {
    if (record.expiresAt < now) stopRecord(record).catch((error) => console.error('Session expiry cleanup failed:', safeMessage(error, 'cleanup failed')));
  }
}

setInterval(pruneExpired, 60_000).unref();

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      agoraConfigured: true,
      mode: 'live',
      activeSessions: sessions.size,
      speech: {
        hindiRecognition: 'Agora ARES hi-IN',
        provider: AZURE_SPEECH_READY ? 'Microsoft Azure Speech' : 'Agora-managed OpenAI fallback',
        voice: AZURE_SPEECH_READY ? VOICES.madhur.voiceName : 'onyx',
        azureConfigured: AZURE_SPEECH_READY,
      },
    });
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
    const session = createAgentSession({ channel: pending.channel, uid: pending.uid, category, language, voice });
    const agentId = await session.start();
    const key = randomUUID();
    sessions.set(key, { key, agentId, session, channel: pending.channel, uid: pending.uid, createdAt: Date.now(), expiresAt: Date.now() + TOKEN_TTL_SECONDS * 1000, stopping: false });
    return json(res, 200, { sessionKey: key, agentId, state: 'RUNNING' });
  }

  if (req.method === 'POST' && url.pathname === '/api/session/think') {
    const body = await readJson(req);
    const record = sessions.get(body.sessionKey);
    const text = typeof body.text === 'string' ? body.text.trim().slice(0, 1200) : '';
    if (!record || !text) return json(res, 400, { error: 'Active session and text are required.' });
    await record.session.think(text, { interruptable: true, metadata: { source: 'easyev-text-prompt' } });
    return json(res, 200, { success: true });
  }

  if (req.method === 'POST' && url.pathname === '/api/session/interrupt') {
    const body = await readJson(req);
    const record = sessions.get(body.sessionKey);
    if (!record) return json(res, 404, { error: 'The consultation is no longer active.' });
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
    '.png': 'image/png',
    '.webp': 'image/webp',
  }[extname(fullPath)] || 'application/octet-stream';
  res.writeHead(200, {
    'Content-Type': mime,
    'Cache-Control': cache ? 'public, max-age=3600' : 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(self), microphone=(self)',
  });
  createReadStream(fullPath).pipe(res);
  return true;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname.startsWith('/api/')) {
      const handled = await handleApi(req, res, url);
      if (handled !== false) return;
      return json(res, 404, { error: 'Not found' });
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Method not allowed' });
    if (url.pathname === '/' || url.pathname === '/index.html') return serveFile(res, 'index.html');
    if (url.pathname === '/agora-client.bundle.js') return serveFile(res, 'agora-client.bundle.js');
    if (/^\/assets\/[a-z0-9-]+\.(?:png|webp)$/i.test(url.pathname)) return serveFile(res, url.pathname.slice(1), true);
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Request failed:', safeMessage(error, 'Request failed'));
    if (!res.headersSent) json(res, 500, { error: safeMessage(error, 'Request failed') });
    else res.end();
  }
});

async function shutdown(signal) {
  console.log(`\n${signal}: closing ${sessions.size} active EasyEV consultation(s)...`);
  await Promise.allSettled([...sessions.values()].map(stopRecord));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

server.listen(PORT, '127.0.0.1', () => {
  console.log(`EasyEV Live is running at http://127.0.0.1:${PORT}`);
  console.log('Agora credentials loaded server-side; certificate is not exposed to the browser.');
});
