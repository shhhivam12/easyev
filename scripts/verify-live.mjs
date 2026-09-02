import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cdpPort = Number(process.env.CDP_PORT || 9225);
const appUrl = process.env.EASYEV_URL || 'http://127.0.0.1:4173/';
const voiceExpected = String(process.env.VOICE_EXPECTED || '').trim().toLowerCase();
const selectedLanguage = String(process.env.EASYEV_LANGUAGE || 'English').trim();
const artifacts = resolve('test-artifacts');
await mkdir(artifacts, { recursive: true });

const target = await fetch(`http://127.0.0.1:${cdpPort}/json/new?${encodeURIComponent(appUrl)}`, { method: 'PUT' }).then((response) => {
  if (!response.ok) throw new Error(`Could not create Chrome test tab (${response.status})`);
  return response.json();
});

const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
const consoleErrors = [];
const consoleMessages = [];
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
  if (message.method === 'Runtime.consoleAPICalled') {
    consoleMessages.push(`${message.params.type}: ${message.params.args.map((item) => item.value || item.description || '').join(' ')}`);
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
  const snapshot = await evaluate('({call:document.querySelector("#room-connection-chip")?.textContent, ai:document.querySelector("#ai-state")?.textContent, transcript:document.querySelector("#transcript-content")?.innerText, toast:document.querySelector("#room-toast")?.textContent})').catch(() => null);
  console.error(JSON.stringify({ timeout: label, snapshot, consoleMessages: consoleMessages.slice(-25), pageErrors }, null, 2));
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

const results = { live: {}, roomViewports: [], viewports: [], reducedMotion: {} };

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
  await waitFor('document.activeElement?.id === "prejoin-title"', 5_000, 'pre-call heading focus');
  results.live.prejoinFocus = true;
  await click('[data-category="Electric car"]');
  results.live.categorySelector = await evaluate(`document.querySelector('[data-category="Electric car"]')?.getAttribute('aria-pressed') === 'true'`);
  await click(`[data-language="${selectedLanguage}"]`);
  await click('#enable-camera-button');
  await waitFor('document.querySelector("#prejoin-video")?.hidden === false', 10_000, 'camera preview');
  results.live.cameraPreview = true;
  await click('#join-demo-button');
  await waitFor('document.querySelector("#room-view")?.hidden === false', 5_000, 'consultation room');
  await waitFor('document.querySelector("#room-connection-chip")?.textContent.startsWith("Agora live")', 45_000, 'Agora live status');
  await waitFor('document.querySelectorAll("#transcript-content .transcript-entry").length > 0', 30_000, 'live greeting transcript');

  results.live.joined = true;
  results.live.connection = await evaluate('document.querySelector("#room-connection-chip")?.textContent');
  results.live.micReady = await evaluate('!document.querySelector("#mic-control")?.disabled');
  results.live.greetingVisible = await evaluate('document.querySelectorAll("#transcript-content .transcript-entry--ai").length > 0');
  results.live.language = selectedLanguage;
  results.live.captionVisible = await evaluate('document.querySelector("#live-caption")?.hidden === false && document.querySelector("#live-caption-text")?.textContent.length > 10');
  await click('#captions-control');
  results.live.captionToggleOff = await evaluate('document.querySelector("#live-caption")?.hidden === true');
  await click('#captions-control');
  results.live.captionToggleOn = await evaluate('document.querySelector("#live-caption")?.hidden === false');
  results.live.mediaTracks = await evaluate('navigator.mediaDevices ? true : false');
  await click('#text-control');
  await waitFor('document.activeElement?.id === "prompt-input"', 5_000, 'text prompt focus');
  results.live.textPromptFocus = true;
  await click('#close-prompt-drawer');

  const roomViewports = [
    [1440, 900],
    [1280, 800],
    [768, 1024],
    [390, 844],
  ];
  for (const [width, height] of roomViewports) {
    await setViewport(width, height);
    const layout = await evaluate(`(() => { const dock=document.querySelector('.call-dock')?.getBoundingClientRect(); const stage=document.querySelector('#smart-stage')?.getBoundingClientRect(); return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,dockLeft:dock?.left,dockRight:dock?.right,stageLeft:stage?.left,stageRight:stage?.right}; })()`);
    results.roomViewports.push({ width, height, overflow: layout.scrollWidth > layout.width, dockFits: layout.dockLeft >= 0 && layout.dockRight <= layout.width, stageFits: layout.stageLeft >= 0 && layout.stageRight <= layout.width });
    if (width === 390) await screenshot('easyev-live-mobile-room.png');
  }
  await setViewport(1280, 800);

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
    results.live.latestAiText = await evaluate('[...document.querySelectorAll("#transcript-content .transcript-entry--ai .transcript-entry__text")].at(-1)?.textContent || ""');
    results.live.devanagariReply = selectedLanguage !== 'Hindi' || await evaluate('/[\\u0900-\\u097F]/.test([...document.querySelectorAll("#transcript-content .transcript-entry--ai .transcript-entry__text")].at(-1)?.textContent || "")');
    results.live.comparisonStage = await evaluate('document.querySelector("#stage-title")?.textContent');

    await waitFor('document.querySelector("#interrupt-control")?.classList.contains("is-visible")', 30_000, 'interrupt control');
    await click('#interrupt-control');
    await waitFor('document.querySelector("#stage-title")?.textContent.includes("Home charging")', 15_000, 'interruption stage');
    await waitFor('document.querySelector("#passport-content")?.innerText.includes("No dedicated home charging")', 5_000, 'interruption constraint');
    results.live.interrupted = true;
    results.live.chargingConstraint = true;
  }

  await click('[data-turn="ownership"]');
  await waitFor('document.querySelector("#stage-title")?.textContent.includes("ownership cost")', 10_000, 'ownership stage');
  await evaluate('(() => { const input=document.querySelector("#daily-km-input"); input.value="95"; input.dispatchEvent(new Event("input",{bubbles:true})); })()');
  results.live.costInteraction = await evaluate('document.querySelector("#daily-km-output")?.textContent === "95 km" && document.querySelector("#estimate-value")?.textContent.length > 1');
  await click('[data-turn="booking"]');
  await waitFor('document.querySelector("#stage-title")?.textContent.includes("demo type")', 10_000, 'booking stage');
  await click('[data-booking-slot="Tomorrow · 11:00 AM"]');
  await click('[data-demo-type="At-home demo"]');
  await click('[data-stage-action="confirm-booking"]');
  results.live.bookingSimulation = await evaluate('document.querySelector("#stage-content")?.innerText.includes("No calendar, dealer or WhatsApp action was sent")');

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
  await waitFor('document.activeElement?.id === "outcome-title"', 5_000, 'outcome focus');
  results.live.outcomeFocus = true;
  results.live.cameraStopped = await evaluate('document.querySelector("#room-video")?.srcObject === null && document.querySelector("#prejoin-video")?.srcObject === null');
  const endedElapsed = await evaluate('document.querySelector("#outcome-duration")?.textContent');
  await new Promise((resolveWait) => setTimeout(resolveWait, 1200));
  results.live.timerStopped = endedElapsed === await evaluate('document.querySelector("#outcome-duration")?.textContent');
  await click('#save-passport-button');
  results.live.passportSaved = await evaluate('Boolean(localStorage.getItem("easyev-decision-passport-v1"))');
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
    if (width === 1440) await screenshot('easyev-landing-desktop.png');
    if (width === 390) await screenshot('easyev-landing-mobile.png');
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
  !results.live.captionVisible ||
  !results.live.captionToggleOff ||
  !results.live.captionToggleOn ||
  !results.live.prejoinFocus ||
  !results.live.categorySelector ||
  !results.live.cameraPreview ||
  !results.live.textPromptFocus ||
  !results.live.outcomeFocus ||
  !results.live.cameraStopped ||
  !results.live.timerStopped ||
  !results.live.costInteraction ||
  !results.live.bookingSimulation ||
  !results.live.passportSaved ||
  results.live.devanagariReply === false ||
  (!voiceExpected && !results.live.greetingVisible) ||
  (voiceExpected ? !results.live.voiceTranscript : !results.live.textPromptReply) ||
  (voiceExpected ? !results.live.voiceDrivenStage : !results.live.interrupted) ||
  (!voiceExpected && !results.live.chargingConstraint) ||
  !results.live.cleanedUp ||
  results.roomViewports.some((item) => item.overflow || !item.dockFits || !item.stageFits) ||
  results.viewports.some((item) => item.overflow || !item.ctaVisible) ||
  !results.reducedMotion.matches ||
  consoleErrors.length ||
  pageErrors.length
) {
  process.exitCode = 1;
}
