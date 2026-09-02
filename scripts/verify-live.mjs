import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cdpPort = Number(process.env.CDP_PORT || 9225);
const appUrl = process.env.EASYEV_URL || 'http://127.0.0.1:4173/';
const voiceExpected = String(process.env.VOICE_EXPECTED || '').trim().toLowerCase();
const artifacts = resolve('test-artifacts');
await mkdir(artifacts, { recursive: true });

const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then((response) => {
  if (!response.ok) throw new Error(`Could not create Chrome test tab (${response.status})`);
  return response.json();
});

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];
const requests = [];
let messageId = 0;

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.id) {
    const item = pending.get(message.id);
    if (!item) return;
    pending.delete(message.id);
    if (message.error) item.reject(new Error(message.error.message));
    else item.resolve(message.result);
    return;
  }
  if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
    consoleErrors.push(message.params.args.map((item) => item.value || item.description || '').join(' '));
  }
  if (message.method === 'Runtime.exceptionThrown') {
    pageErrors.push(message.params.exceptionDetails?.text || 'Uncaught browser exception');
  }
  if (message.method === 'Network.requestWillBeSent') {
    const url = new URL(message.params.request.url);
    requests.push(`${url.origin}${url.pathname}`);
  }
});

await new Promise((resolveOpen, rejectOpen) => {
  socket.addEventListener('open', resolveOpen, { once: true });
  socket.addEventListener('error', rejectOpen, { once: true });
});

const send = (method, params = {}) => new Promise((resolveSend, rejectSend) => {
  const id = ++messageId;
  pending.set(id, { resolve: resolveSend, reject: rejectSend });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
};

const waitFor = async (expression, timeoutMs = 30_000, label = expression) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
  }
  throw new Error(`Timed out waiting for ${label}`);
};

const click = (selector) => evaluate(`(() => { const node = document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('Missing ${selector}'); node.click(); return true; })()`);

const setViewport = async (width, height) => {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
};

const screenshot = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(resolve(artifacts, name), Buffer.from(shot.data, 'base64'));
};

const results = { live: {}, viewports: [], reducedMotion: {} };

try {
  await Promise.all([
    send('Page.enable'),
    send('Runtime.enable'),
    send('Network.enable'),
    send('Log.enable'),
  ]);
  await setViewport(1280, 800);
  await send('Page.navigate', { url: appUrl });
  await waitFor('document.readyState === "complete"', 20_000, 'page load');
  await waitFor('Boolean(window.EasyEVAgoraBundle)', 20_000, 'Agora client bundle');

  await click('#hero-start-button');
  await waitFor('document.querySelector("#prejoin-view")?.hidden === false', 5_000, 'pre-call screen');
  await click('[data-language="English"]');
  await click('#join-demo-button');
  await waitFor('document.querySelector("#room-view")?.hidden === false', 5_000, 'consultation room');
  await waitFor('document.querySelector("#room-connection-chip")?.textContent === "Agora live"', 45_000, 'Agora live status');
  await waitFor('document.querySelectorAll("#transcript-content .transcript-entry").length > 0', 30_000, 'live greeting transcript');

  results.live.joined = true;
  results.live.connection = await evaluate('document.querySelector("#room-connection-chip")?.textContent');
  results.live.micReady = await evaluate('!document.querySelector("#mic-control")?.disabled');
  results.live.greetingVisible = await evaluate('document.querySelectorAll("#transcript-content .transcript-entry--ai").length > 0');
  results.live.mediaTracks = await evaluate('navigator.mediaDevices ? true : false');

  if (voiceExpected) {
    await waitFor(`document.querySelector("#transcript-content")?.innerText.toLowerCase().includes(${JSON.stringify(voiceExpected)})`, 60_000, 'spoken user transcript');
    await waitFor('document.querySelector("#stage-title")?.textContent.includes("70 km")', 15_000, 'voice-driven comparison stage');
    results.live.voiceTranscript = true;
    results.live.voiceDrivenStage = await evaluate('document.querySelector("#stage-title")?.textContent');
  } else {
    await click('[data-turn="compare"]');
    await waitFor('document.querySelector("#stage-title")?.textContent.includes("70 km")', 10_000, 'comparison stage');
    await waitFor('document.querySelectorAll("#transcript-content .transcript-entry--ai").length > 1', 45_000, 'AI comparison reply');
    results.live.textPromptReply = true;
    results.live.comparisonStage = await evaluate('document.querySelector("#stage-title")?.textContent');

    await waitFor('document.querySelector("#interrupt-control")?.classList.contains("is-visible")', 30_000, 'interrupt control');
    await click('#interrupt-control');
    await waitFor('document.querySelector("#stage-title")?.textContent.includes("Home charging")', 15_000, 'interruption stage');
    results.live.interrupted = true;
    results.live.chargingConstraint = await evaluate('document.querySelector("#passport-content")?.innerText.includes("No dedicated home charging")');
  }

  await click('#mic-control');
  await waitFor('document.querySelector("#mic-control")?.getAttribute("aria-pressed") === "false"', 5_000, 'microphone mute');
  results.live.mute = true;
  await click('#mic-control');
  await waitFor('document.querySelector("#mic-control")?.getAttribute("aria-pressed") === "true"', 5_000, 'microphone unmute');
  results.live.unmute = true;

  await screenshot('easyev-live-desktop.png');
  await click('#end-call-control');
  await waitFor('document.querySelector("#outcome-view")?.hidden === false', 10_000, 'outcome screen');
  results.live.outcome = true;
  await waitFor('fetch("/api/health").then(r => r.json()).then(v => v.activeSessions === 0)', 20_000, 'agent cleanup');
  results.live.cleanedUp = true;

  const viewports = [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
  ];
  for (const [width, height] of viewports) {
    await setViewport(width, height);
    await send('Page.navigate', { url: appUrl });
    await waitFor('document.readyState === "complete"', 15_000, `${width}x${height} load`);
    const layout = await evaluate(`({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, ctaVisible: Boolean(document.querySelector('#hero-start-button')?.offsetParent) })`);
    results.viewports.push({ width, height, overflow: layout.scrollWidth > layout.width, ctaVisible: layout.ctaVisible });
    if (width === 390) await screenshot('easyev-mobile.png');
  }

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  results.reducedMotion.matches = await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches');
  results.reducedMotion.energyAnimation = await evaluate('getComputedStyle(document.querySelector(".energy-band"), "::after").animationName');
} finally {
  try { await send('Page.close'); } catch {}
  socket.close();
}

results.consoleErrors = consoleErrors;
results.pageErrors = pageErrors;
results.apiPaths = [...new Set(requests.filter((url) => url.includes('/api/')))];
console.log(JSON.stringify(results, null, 2));

if (
  !results.live.joined ||
  (!voiceExpected && !results.live.greetingVisible) ||
  (voiceExpected ? !results.live.voiceTranscript : !results.live.textPromptReply) ||
  (voiceExpected ? !results.live.voiceDrivenStage : !results.live.interrupted) ||
  !results.live.cleanedUp ||
  results.viewports.some((item) => item.overflow || !item.ctaVisible) ||
  !results.reducedMotion.matches ||
  consoleErrors.length ||
  pageErrors.length
) {
  process.exitCode = 1;
}
