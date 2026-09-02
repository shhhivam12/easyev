import http from 'node:http';
import { readFileSync, existsSync, createReadStream } from 'node:fs';
import { extname, resolve } from 'node:path';
import { randomInt, randomUUID } from 'node:crypto';
import agoraToken from 'agora-token';
import {
  AgoraClient,
  Agent,
  Area,
  DeepgramSTT,
  ExpiresIn,
  MiniMaxTTS,
  OpenAI,
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
  return message
    .replaceAll(APP_ID, '[app-id]')
    .replaceAll(APP_CERTIFICATE, '[secret]')
    .slice(0, 600);
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
  return `You are EasyEV AI, a calm and practical voice guide for people in India choosing an electric car, scooter, or 3-wheeler.

The shopper selected category: ${category}. Their preferred conversation language is ${language}.

Your job is to discover their use case, daily distance, budget, charging access, passenger or payload needs, and priorities. Help them compare fit dimensions and trade-offs. Do not invent live vehicle prices, range claims, subsidies, dealer availability, finance quotes, or booking confirmation. The comparison cards and ownership calculator in the web app are explicitly illustrative. Test-drive selections are stored only in the browser and are not sent to a dealer, calendar, or WhatsApp.

Keep most spoken answers to two or three short sentences. Ask at most one useful follow-up question per turn. Match the selected language naturally; for Hinglish, use simple conversational Hindi written and spoken with common English EV terms. If uncertain, say so. Never pressure the shopper or claim that EasyEV has completed an external action.`;
}

function createAgentSession({ channel, uid, category, language }) {
  const client = new AgoraClient({ area: Area.AP, appId: APP_ID, appCertificate: APP_CERTIFICATE });
  const greeting = language === 'Hindi'
    ? 'Namaste! Main aapka EasyEV guide hoon. Aapki daily travel need kya hai?'
    : language === 'English'
      ? 'Hello! I am your EasyEV guide. What would you like your electric vehicle to solve?'
      : 'Namaste! Main aapka EasyEV guide hoon. Aap apni daily travel need bataiye, phir hum sahi EV fit compare karenge.';

  const agent = new Agent({
    client,
    instructions: agentInstructions({ category, language }),
    greeting,
    failureMessage: 'I had trouble responding. Please try that once more.',
    maxHistory: 50,
    turnDetection: {
      config: {
        speech_threshold: 0.5,
        start_of_speech: {
          mode: 'vad',
          vad_config: { interrupt_duration_ms: 160, prefix_padding_ms: 300 },
        },
        end_of_speech: {
          mode: 'vad',
          vad_config: { silence_duration_ms: 480 },
        },
      },
    },
    advancedFeatures: { enable_rtm: true, enable_tools: false },
    parameters: {
      audio_scenario: 'chorus',
      data_channel: 'rtm',
      enable_error_message: true,
      enable_metrics: true,
    },
  })
    .withStt(new DeepgramSTT({ model: 'nova-3', language: language === 'English' ? 'en' : 'hi' }))
    .withLlm(new OpenAI({
      model: 'gpt-4o-mini',
      greetingMessage: greeting,
      failureMessage: 'I had trouble responding. Please try that once more.',
      maxHistory: 15,
      params: { max_tokens: 700, temperature: 0.45, top_p: 0.9 },
    }))
    .withTts(new MiniMaxTTS({ model: 'speech_2_6_turbo', voiceId: 'English_captivating_female1' }));

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
    return json(res, 200, { ok: true, agoraConfigured: true, mode: 'live', activeSessions: sessions.size });
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
    const session = createAgentSession({ channel: pending.channel, uid: pending.uid, category, language });
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
    if (url.pathname === '/agora-client.bundle.js') return serveFile(res, 'agora-client.bundle.js', true);
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

