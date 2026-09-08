import { readFile } from 'node:fs/promises';

const appUrl = process.env.EASYEV_URL || 'http://127.0.0.1:4173/';
const cdpPort = Number(process.env.CDP_PORT || 9226);
const expectedLinks = [
  '/#consultation-process',
  '/showroom/',
  '/#compare',
  '/#for-dealers'
];

const indexSource = await readFile('index.html', 'utf8');
const showroomSource = await readFile('showroom/showroom.js', 'utf8');
const languageSource = await readFile('client/platform-language.js', 'utf8');

const sourceChecks = {
  consultationPrecallUnchanged: /data-language="English"[\s\S]*data-language="Hindi"[\s\S]*data-language="Hinglish"/.test(indexSource)
    && /adapter\.join\(\{[^}]*language: state\.language,[^}]*voice: state\.voice/s.test(indexSource),
  debateUsesGlobalLanguage: /joinDebate\(\{[\s\S]*?language,[\s\S]*?voice: 'madhur'/.test(indexSource),
  dealerUsesGlobalLanguage: /selectedDealerLanguage = getPlatformLanguage\(\)/.test(indexSource)
    && /language: selectedDealerLanguage \|\| 'Hinglish'/.test(indexSource),
  showroomUsesGlobalLanguage: /joinVehicle\(\{[^}]*language:state\.language/.test(showroomSource),
  testDriveUsesGlobalLanguage: /vehicleName: vehicle\.name,[\s\S]*?language: state\.language/.test(showroomSource),
  sharedPreferenceHasThreeLanguages: /\['English', 'Hindi', 'Hinglish'\]/.test(languageSource)
};
for (const [name, passed] of Object.entries(sourceChecks)) {
  if (!passed) throw new Error('Source check failed: ' + name);
}

const target = await fetch('http://127.0.0.1:' + cdpPort + '/json/new?' + encodeURIComponent(appUrl), { method: 'PUT' }).then((response) => {
  if (!response.ok) throw new Error('Could not create Chrome test tab (' + response.status + ')');
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
await new Promise((resolve, reject) => {
  socket.addEventListener('open', resolve, { once: true });
  socket.addEventListener('error', reject, { once: true });
});
const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++messageId;
  pending.set(id, { resolve, reject });
  socket.send(JSON.stringify({ id, method, params }));
});
const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'Browser evaluation failed');
  return result.result?.value;
};
const waitFor = async (expression, label, timeoutMs = 10000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await evaluate(expression)) return;
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  throw new Error('Timed out waiting for ' + label);
};
const click = (selector) => evaluate("(() => { const node=document.querySelector(" + JSON.stringify(selector) + "); if(!node) throw new Error('Missing " + selector + "'); node.click(); return true; })()");
const snapshotNav = (headerSelector) => evaluate("(() => { const header=document.querySelector(" + JSON.stringify(headerSelector) + "); const floating=document.querySelector('.platform-language-float'); const control=floating?.querySelector('[data-platform-language]'); return { links:[...header.querySelectorAll('nav a')].map(a=>new URL(a.href).pathname+new URL(a.href).hash), language:control?.value, languageInsideNav:Boolean(header.querySelector('[data-platform-language]')), floatingPosition:floating ? getComputedStyle(floating).position : null, controlCount:document.querySelectorAll('select[data-platform-language]').length, visible:!header.closest('[hidden]') }; })()");
const assertNav = (snapshot, label, language) => {
  if (JSON.stringify(snapshot.links) !== JSON.stringify(expectedLinks)) throw new Error(label + ' links differ: ' + JSON.stringify(snapshot.links));
  if (snapshot.language !== language) throw new Error(label + ' language is ' + snapshot.language + ', expected ' + language);
  if (snapshot.languageInsideNav) throw new Error(label + ' still contains the language control');
  if (snapshot.floatingPosition !== 'fixed') throw new Error(label + ' language control is not independently positioned');
  if (snapshot.controlCount !== 1) throw new Error(label + ' has ' + snapshot.controlCount + ' language controls');
};

await Promise.all([send('Page.enable'), send('Runtime.enable')]);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: appUrl });
await waitFor("document.readyState === 'complete' && Boolean(window.EasyEVLanguage)", 'main page load');
await evaluate("window.localStorage.removeItem('easyev-platform-language'); window.EasyEVLanguage.set('Hindi'); true");

assertNav(await snapshotNav('#site-nav'), 'Landing navbar', 'Hindi');
await click('#site-nav [data-nav-action="compare"]');
await waitFor("document.body.dataset.view === 'compare' && location.hash === '#compare'", 'compare route');
assertNav(await snapshotNav('#compare-site-nav'), 'Compare navbar', 'Hindi');

await click('#compare-site-nav [data-nav-action="dealers"]');
await waitFor("document.body.dataset.view === 'dealers' && location.hash === '#for-dealers'", 'dealer route');
assertNav(await snapshotNav('#dealers-view .site-nav'), 'Dealer navbar', 'Hindi');

await click('#dealers-view [data-nav-action="how"]');
await waitFor("document.body.dataset.view === 'landing' && location.hash === '#consultation-process'", 'how-it-works route');
assertNav(await snapshotNav('#site-nav'), 'Returned landing navbar', 'Hindi');

await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await evaluate("window.history.pushState(null, '', '/#compare'); window.dispatchEvent(new HashChangeEvent('hashchange')); true");
await waitFor("document.body.dataset.view === 'compare'", 'mobile compare route');
await click('#compare-site-nav [data-mobile-menu]');
await waitFor("document.querySelector('#compare-primary-navigation').classList.contains('is-open')", 'mobile menu open');

await send('Page.navigate', { url: new URL('/showroom/', appUrl).href });
await waitFor("document.readyState === 'complete' && Boolean(window.EVShowroom) && Boolean(window.EasyEVLanguage)", 'showroom load', 15000);
assertNav(await snapshotNav('#showroom-site-nav'), 'Showroom navbar', 'Hindi');
await evaluate("window.EasyEVLanguage.set('English'); true");
const showroomLanguage = await evaluate("({stored:localStorage.getItem('easyev-platform-language'),state:window.EVShowroom.getState().language,control:document.querySelector('select[data-platform-language]').value})");
if (showroomLanguage.stored !== 'English' || showroomLanguage.state !== 'English' || showroomLanguage.control !== 'English') {
  throw new Error('Showroom language did not synchronize: ' + JSON.stringify(showroomLanguage));
}

if (consoleErrors.length || pageErrors.length) {
  throw new Error('Browser errors: ' + JSON.stringify({ consoleErrors, pageErrors }));
}

console.log(JSON.stringify({
  ok: true,
  routes: ['landing', 'compare', 'dealers', 'how-it-works', 'showroom'],
  viewports: ['1280x800', '390x844'],
  languages: ['English', 'Hindi', 'Hinglish'],
  sourceChecks,
  consoleErrors,
  pageErrors
}, null, 2));

socket.close();
