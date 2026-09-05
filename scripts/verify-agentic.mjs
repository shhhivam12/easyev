import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const cdpPort = Number(process.env.CDP_PORT || 9225);
const appUrl = process.env.EASYEV_URL || 'http://127.0.0.1:4174/';
const isRemoteLive = new URL(appUrl).protocol === 'https:';
const toolTimeout = isRemoteLive ? 45_000 : 12_000;
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
  if (message.method === 'Runtime.exceptionThrown') pageErrors.push(message.params.exceptionDetails?.text || 'Uncaught exception');
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
    await new Promise((resolveWait) => setTimeout(resolveWait, 180));
  }
  const snapshot = await evaluate('({view:document.body.dataset.view,call:document.querySelector("#room-connection-chip")?.textContent,stage:document.querySelector("#stage-title")?.textContent,content:document.querySelector("#stage-content")?.innerText,rail:document.querySelector("#action-rail")?.innerText,toast:document.querySelector("#room-toast")?.textContent})').catch(() => null);
  throw new Error(`Timed out waiting for ${label}: ${JSON.stringify(snapshot)}`);
};
const click = (selector) => evaluate(`(() => { const node=document.querySelector(${JSON.stringify(selector)}); if (!node) throw new Error('Missing ${selector}'); node.click(); return true; })()`);
const sendTypedPrompt = async (text) => {
  await click('#text-control');
  await waitFor('document.querySelector("#prompt-drawer")?.hidden === false', 3000, 'text prompt drawer');
  await evaluate(`(() => { const input=document.querySelector('#prompt-input'); input.value=${JSON.stringify(text)}; document.querySelector('#prompt-form').requestSubmit(); return true; })()`);
};
const viewport = (width, height) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width < 600 });
const screenshot = async (name) => {
  const shot = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  await writeFile(resolve(artifacts, name), Buffer.from(shot.data, 'base64'));
};

const results = { prejoin: {}, live: {}, viewports: [], reducedMotion: {} };
try {
  await Promise.all([send('Page.enable'), send('Runtime.enable'), send('Network.enable')]);
  await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: artifacts, eventsEnabled: true }).catch(() => {});
  await send('Browser.grantPermissions', { origin: new URL(appUrl).origin, permissions: ['geolocation', 'videoCapture', 'audioCapture'] }).catch(() => {});
  await send('Emulation.setGeolocationOverride', { latitude: 28.6139, longitude: 77.209, accuracy: 35 }).catch(() => {});
  await viewport(1280, 800);
  await send('Page.navigate', { url: appUrl });
  await waitFor('document.readyState === "complete"', 20_000, 'page load');
  await waitFor('Boolean(window.EasyEVAgoraBundle)', 20_000, 'Agora browser bundle');
  await click('#hero-start-button');
  await waitFor('document.querySelector("#prejoin-view")?.hidden === false', 5000, 'pre-call screen');
  await waitFor('document.querySelector("#join-demo-button")?.disabled === false', 20_000, 'backend readiness');
  await waitFor('document.activeElement?.id === "prejoin-title"', 5000, 'pre-call focus');
  results.prejoin.focus = true;
  results.prejoin.centered = await evaluate('(() => { const r=document.querySelector(".prejoin-sheet").getBoundingClientRect(); return Math.abs((r.left+r.width/2)-innerWidth/2)<8; })()');
  await evaluate(`(() => { const values={"#buyer-name":"Regression Buyer","#buyer-email":"regression@example.com","#buyer-phone":"+91 98765 43210"}; for (const [selector,value] of Object.entries(values)) { const input=document.querySelector(selector); input.value=value; input.dispatchEvent(new Event("input",{bubbles:true})); } return true; })()`);
  results.prejoin.contact = await evaluate('document.querySelector("#buyer-name")?.checkValidity() && document.querySelector("#buyer-email")?.checkValidity() && document.querySelector("#buyer-phone")?.checkValidity()');
  await click('[data-category="Electric car"]');
  await click('[data-language="English"]');
  await click('#enable-camera-button');
  await waitFor('document.querySelector("#prejoin-video")?.hidden === false', 10_000, 'camera preview');
  results.prejoin.camera = true;
  await click('#join-demo-button');
  await waitFor('document.querySelector("#room-view")?.hidden === false', 5000, 'live room');
  await waitFor('document.querySelector("#room-connection-chip")?.textContent.startsWith("Agora live")', 45_000, 'Agora live');
  await waitFor('document.querySelector("#room-connection-chip")?.textContent.includes("tools linked")', 15_000, 'tool SSE');
  results.live.agora = true;
  results.live.tools = true;
  if (isRemoteLive) {
    await waitFor('document.querySelectorAll(".transcript-entry--ai").length > 0 && document.querySelector("#ai-participant-tile")?.dataset.mode === "listening"', 45_000, 'live greeting to finish');
  }

  await click('[data-turn="compare"]');
  await waitFor('document.querySelectorAll(".verified-vehicle").length === 2', toolTimeout, 'verified comparison');
  results.live.comparison = await evaluate('({cards:document.querySelectorAll(".verified-vehicle").length,sources:document.querySelectorAll(".verified-vehicle .source-link").length,columns:document.querySelectorAll(".comparison-matrix thead th").length-1,rows:document.querySelectorAll(".comparison-matrix tbody tr").length,labels:[...document.querySelectorAll(".option-card__tag")].map(x=>x.textContent)})');
  await screenshot('easyev-agentic-comparison-desktop.png');

  await sendTypedPrompt('Compare Tata Punch EV and Tata Nexon EV in 3D.');
  await waitFor('document.querySelectorAll(".verified-vehicle").length === 2 && document.querySelectorAll(".verified-vehicle .showroom-360-visual").length === 2', toolTimeout, 'fast two-vehicle showroom 360 comparison');
  results.live.fastVisualComparison = await evaluate('({cards:document.querySelectorAll(".verified-vehicle").length,concepts:document.querySelectorAll(".verified-vehicle .showroom-360-visual").length,title:document.querySelector("#stage-title")?.textContent})');
  await screenshot('easyev-agentic-3d-comparison-desktop.png');

  await click('[data-visual-vehicle]');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Interactive vehicle explorer"', 5000, 'vehicle visual explorer');
  await click('[data-visual-mode="photo"]');
  await waitFor('Boolean(document.querySelector(".visual-scene img"))', 5000, 'local vehicle photo');
  results.live.vehiclePhoto = await evaluate('document.querySelector(".visual-scene img")?.getAttribute("src")?.startsWith("/")');
  await click('[data-visual-mode="showroom-360"]');
  await waitFor('Boolean(document.querySelector(".showroom-360-visual"))', 5000, 'exact-model showroom 360');
  await evaluate('(() => { const input=document.querySelector("[data-visual-angle]"); input.value="54"; input.dispatchEvent(new Event("input",{bubbles:true})); })()');
  results.live.vehicleConcept = await evaluate('(() => { const image=document.querySelector(".showroom-360-image"); return {present:Boolean(image),angle:document.querySelector("#visual-angle-output")?.textContent,disclosure:Number(image?.dataset.spinFrames || 0) > 1}; })()');
  await click('[data-visual-back]');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Verified vehicle comparison"', 5000, 'return to comparison');

  if (isRemoteLive) {
    await waitFor('document.querySelector("#ai-participant-tile")?.dataset.mode === "listening"', 30_000, 'agent ready after comparison');
    await sendTypedPrompt('Show me a picture of Tata Punch EV.');
    await waitFor('document.querySelector("#stage-title")?.textContent === "Interactive vehicle explorer"', toolTimeout, 'spoken picture request');
    results.live.spokenPicture = Boolean(await evaluate('document.querySelector(".visual-scene")'));
    await waitFor('document.querySelector("#ai-participant-tile")?.dataset.mode === "listening"', 30_000, 'agent ready after picture');
    await sendTypedPrompt('Show Tata Punch EV in 3D. Do not ask for my location.');
    await waitFor('document.querySelector("#stage-title")?.textContent === "Interactive vehicle explorer" && Boolean(document.querySelector(".showroom-360-visual"))', toolTimeout, 'spoken 3D request');
    results.live.spoken3d = true;
    await click('[data-visual-back]');
    await waitFor('document.querySelector("#stage-title")?.textContent === "Verified vehicle comparison"', 5000, 'return after spoken 3D request');
  }

  await sendTypedPrompt('Show me Citroen C3.');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Interactive vehicle explorer" && document.querySelector(".visual-scene img")?.getAttribute("src")?.includes("citroen-ec3")', toolTimeout, 'Citroen C3 visual');
  results.live.citroenVisual = true;

  await click('#stage-pin-button');
  const pinnedTitle = await evaluate('document.querySelector("#stage-title").textContent');
  await click('[data-turn="ownership"]');
  await waitFor('document.querySelector("#action-rail")?.innerText.includes("Result ready")', toolTimeout, 'queued ownership result');
  results.live.pinHeld = pinnedTitle === await evaluate('document.querySelector("#stage-title").textContent');
  await click('#stage-pin-button');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Ownership scenario"', 5000, 'unpin queued result');
  results.live.ownership = await evaluate('({metrics:document.querySelectorAll(".metric-card").length,bars:document.querySelectorAll(".cost-bar").length,notice:document.querySelector(".tool-notice")?.textContent})');
  await evaluate('(() => { const input=document.querySelector("[data-live-cost=\\"dailyKm\\"]"); input.value="95"; input.dispatchEvent(new Event("input",{bubbles:true})); })()');
  await waitFor('document.querySelector("#passport-content")?.innerText.includes("95 km/day")', 8000, 'cost recalculation');
  results.live.costRecalculated = true;

  await click('[data-turn="map"]');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Share location for this search"', toolTimeout, 'location consent stage');
  results.live.locationConsent = true;
  await click('[data-map-action="locate"]');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Charging points near you" && document.querySelectorAll(".station-card").length > 0', toolTimeout, 'charger result');
  results.live.chargers = await evaluate('({count:document.querySelectorAll(".station-card").length,source:document.querySelector("#stage-source")?.textContent,disclosure:document.querySelector(".map-disclosure")?.textContent})');
  results.live.mapCenter = await evaluate('(() => { const canvas=document.querySelector("#map-canvas").getBoundingClientRect(); const user=document.querySelector(".map-user").getBoundingClientRect(); const location=document.querySelector(".map-location-bar")?.innerText || ""; return {deltaX:Math.round(Math.abs((user.left+user.width/2)-(canvas.left+canvas.width/2))),deltaY:Math.round(Math.abs((user.top+user.height/2)-(canvas.top+canvas.height/2))),coordinatesShown:/\\d+\\.\\d{4}/.test(location),location}; })()');
  await click('[data-location-preset="delhi"]');
  await waitFor('document.querySelector(".map-location-bar")?.innerText.includes("Centred on Delhi")', 12_000, 'Delhi city preset');
  results.live.locationPreset = true;
  await screenshot('easyev-agentic-map-desktop.png');

  await click('[data-tool-prompt="snapshot"]');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Optional visual readiness check"', 8000, 'snapshot consent stage');
  results.live.snapshotConsent = await evaluate('document.querySelector("#stage-content")?.innerText.toLowerCase().includes("faces") && document.querySelector("#stage-content")?.innerText.toLowerCase().includes("deleted")');
  await click('[data-snapshot-camera]');
  await waitFor('Boolean(document.querySelector(".snapshot-preview"))', 5000, 'captured still preview');
  results.live.snapshotUserOperated = true;
  await click('[data-snapshot-clear]');

  await click('[data-tool-prompt="report"]');
  await waitFor('document.querySelector("#stage-title")?.textContent === "Decision report ready"', toolTimeout, 'report stage');
  results.live.report = await evaluate('({button:Boolean(document.querySelector("[data-download-report]")),sections:document.querySelector(".report-card")?.innerText})');
  results.live.falseCancellations = !(await evaluate('document.querySelector("#action-rail")?.innerText.includes("Cancelled")'));
  results.live.internalNamesHidden = await evaluate('!/(?:compare_vehicles|find_nearby_chargers|calculate_ownership|analyze_readiness_snapshot|generate_decision_report|escalate_to_human|capture_lead|book_test_drive|\\bCalling\\s+[a-z_]+)/i.test((document.querySelector("#transcript-content")?.innerText || "") + " " + (document.querySelector("#live-caption-text")?.textContent || ""))');

  const roomViewports = [[1440,900],[1280,800],[768,1024],[390,844]];
  for (const [width, height] of roomViewports) {
    await viewport(width, height);
    const layout = await evaluate('(() => { const stage=document.querySelector("#smart-stage").getBoundingClientRect(); const people=document.querySelector(".participant-strip").getBoundingClientRect(); const dock=document.querySelector(".call-dock").getBoundingClientRect(); return {width:innerWidth,scrollWidth:document.documentElement.scrollWidth,stageLeft:stage.left,stageRight:stage.right,stageTop:stage.top,peopleTop:people.top,dockLeft:dock.left,dockRight:dock.right}; })()');
    results.viewports.push({ view: 'room', width, height, overflow: layout.scrollWidth > layout.width, stageFits: layout.stageLeft >= 0 && layout.stageRight <= layout.width, stageAbovePeople: layout.stageTop < layout.peopleTop, dockFits: layout.dockLeft >= 0 && layout.dockRight <= layout.width });
    if (width <= 768) {
      await click('#context-toggle');
      await waitFor('document.querySelector("#consultation-sidebar")?.classList.contains("is-open")', 3000, `context drawer ${width}`);
      const drawer = await evaluate('(() => { const r=document.querySelector("#consultation-sidebar").getBoundingClientRect(); return {width:r.width,left:r.left,right:r.right,display:getComputedStyle(document.querySelector("#consultation-sidebar")).display}; })()');
      results.viewports.push({ view: 'passport-drawer', width, height, visible: drawer.display !== 'none' && drawer.width > 0 && drawer.right > 0 && drawer.left < width });
      await click('#context-toggle');
    }
    if (width === 390) await screenshot('easyev-agentic-room-mobile.png');
  }

  await viewport(1280, 800);
  await click('#end-call-control');
  await waitFor('document.querySelector("#outcome-view")?.hidden === false', 10_000, 'outcome');
  await waitFor('document.activeElement?.id === "outcome-title"', 5000, 'outcome focus');
  results.live.outcomeFocus = true;
  results.live.cameraStopped = await evaluate('document.querySelector("#room-video")?.srcObject === null && document.querySelector("#prejoin-video")?.srcObject === null');
  const elapsed = await evaluate('document.querySelector("#outcome-duration")?.textContent');
  await new Promise((resolveWait) => setTimeout(resolveWait, 1200));
  results.live.timerStopped = elapsed === await evaluate('document.querySelector("#outcome-duration")?.textContent');
  const pdfsBefore = new Set((await readdir(artifacts)).filter((name) => name.endsWith('.pdf')));
  await click('#download-report-button');
  const downloadStarted = Date.now();
  let newPdf = '';
  while (Date.now() - downloadStarted < 8000 && !newPdf) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    newPdf = (await readdir(artifacts)).find((name) => name.endsWith('.pdf') && !pdfsBefore.has(name)) || '';
  }
  results.live.reportAfterCall = Boolean(newPdf);

  for (const [width, height] of [[1440,900],[1280,800],[768,1024],[390,844]]) {
    await viewport(width, height);
    await send('Page.navigate', { url: appUrl });
    await waitFor('document.readyState === "complete"', 15_000, `landing ${width}x${height}`);
    const layout = await evaluate('({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,cta:Boolean(document.querySelector("#hero-start-button")?.offsetParent)})');
    results.viewports.push({ view: 'landing', width, height, overflow: layout.scrollWidth > layout.width, cta: layout.cta });
    if (width === 1440) await screenshot('easyev-agentic-landing-desktop.png');
    if (width === 390) await screenshot('easyev-agentic-landing-mobile.png');
  }

  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  results.reducedMotion.matches = await evaluate('matchMedia("(prefers-reduced-motion: reduce)").matches');
  results.reducedMotion.animationDuration = await evaluate('getComputedStyle(document.querySelector(".energy-band"), "::before").animationDuration');
} finally {
  try { await send('Page.close'); } catch {}
  socket.close();
}

results.consoleErrors = consoleErrors;
results.pageErrors = pageErrors;
console.log(JSON.stringify(results, null, 2));

const failed = !results.prejoin.focus || !results.prejoin.centered || !results.prejoin.contact || !results.prejoin.camera ||
  !results.live.agora || !results.live.tools || results.live.comparison?.cards !== 2 ||
  results.live.comparison?.sources !== 2 || results.live.comparison?.columns !== 2 || results.live.comparison?.rows < 6 ||
  results.live.fastVisualComparison?.cards !== 2 || results.live.fastVisualComparison?.concepts !== 2 || !results.live.citroenVisual ||
  !results.live.vehiclePhoto || !results.live.vehicleConcept?.present || results.live.vehicleConcept?.angle !== '54°' || !results.live.vehicleConcept?.disclosure ||
  (isRemoteLive && (!results.live.spokenPicture || !results.live.spoken3d)) ||
  !results.live.pinHeld || results.live.ownership?.metrics < 6 ||
  !results.live.costRecalculated || !results.live.locationConsent || results.live.chargers?.count < 1 ||
  results.live.mapCenter?.deltaX > 1 || results.live.mapCenter?.deltaY > 1 || !results.live.mapCenter?.coordinatesShown || !results.live.locationPreset ||
  !results.live.snapshotConsent || !results.live.snapshotUserOperated || !results.live.report?.button ||
  !results.live.outcomeFocus || !results.live.cameraStopped || !results.live.timerStopped ||
  !results.live.reportAfterCall || !results.live.falseCancellations || !results.live.internalNamesHidden ||
  results.viewports.some((item) => item.overflow || item.stageFits === false || item.stageAbovePeople === false || item.dockFits === false || item.cta === false || item.visible === false) ||
  !results.reducedMotion.matches || consoleErrors.length || pageErrors.length;
if (failed) process.exitCode = 1;
