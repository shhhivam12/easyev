import { spawn } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const OUT_DIR = resolve('assets/screenshots');
await mkdir(OUT_DIR, { recursive: true });

console.log('Launching headless Chrome on port', PORT);
const chromeProc = spawn(CHROME_PATH, [
  `--remote-debugging-port=${PORT}`,
  '--headless=new',
  '--disable-gpu',
  '--no-first-run',
  '--no-default-browser-check',
  '--window-size=1440,960',
  'about:blank'
], { stdio: 'ignore' });

// Wait for CDP
let versionData = null;
for (let i = 0; i < 30; i++) {
  try {
    const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
    if (res.ok) {
      versionData = await res.json();
      break;
    }
  } catch {}
  await new Promise(r => setTimeout(r, 200));
}

if (!versionData) {
  console.error('Could not connect to Chrome');
  chromeProc.kill();
  process.exit(1);
}

const target = await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' }).then(r => r.json());
const ws = new WebSocket(target.webSocketDebuggerUrl);

let msgId = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.id && pending.has(data.id)) {
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(data.error.message));
    else resolve(data.result);
  }
};

await new Promise((res, rej) => {
  ws.onopen = res;
  ws.onerror = rej;
});

const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++msgId;
  pending.set(id, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id, method, params }));
});

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });

async function capture(filename, fullPage = false) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: fullPage, fromSurface: true });
  await writeFile(resolve(OUT_DIR, filename), Buffer.from(res.data, 'base64'));
  console.log(`Saved ${filename}`);
}

async function evaluate(code) {
  const r = await send('Runtime.evaluate', { expression: code, awaitPromise: true, returnByValue: true });
  return r.result?.value;
}

try {
  // 1. Landing Page Hero
  console.log('1. Capturing Landing Page...');
  await send('Page.navigate', { url: 'http://localhost:4173/' });
  await new Promise(r => setTimeout(r, 2500));
  await capture('01-landing-hero.png');

  // Scroll to Experiences suite
  console.log('2. Capturing Experiences Suite...');
  await evaluate('document.querySelector("#experiences")?.scrollIntoView({behavior:"instant"})');
  await new Promise(r => setTimeout(r, 1000));
  await capture('02-experiences-suite.png');

  // 3. Prejoin Consultation Setup
  console.log('3. Capturing Prejoin Consultation Screen...');
  await evaluate('document.querySelector("[data-open-prejoin]")?.click()');
  await new Promise(r => setTimeout(r, 1200));
  await capture('03-consultation-prejoin.png');
  await evaluate('document.querySelector(".sheet-close, [data-close-prejoin]")?.click()');
  await new Promise(r => setTimeout(r, 500));

  // 4. Compare Arena View
  console.log('4. Capturing Compare Arena...');
  await send('Page.navigate', { url: 'http://localhost:4173/#compare' });
  await new Promise(r => setTimeout(r, 2000));
  await capture('04-compare-arena-selection.png');

  // Trigger Debate Arena Modal
  console.log('5. Capturing Live Dual-AI Debate Arena Stage...');
  await evaluate(`(() => {
    const cards = document.querySelectorAll(".compare-select-card");
    if (cards.length >= 2) {
      cards[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
      cards[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    }
    const btn = document.querySelector("#start-debate-arena-btn");
    if (btn) {
      btn.disabled = false;
      btn.click();
    }
    const stage = document.querySelector("#debate-arena-stage");
    if (stage) {
      stage.hidden = false;
      stage.setAttribute("aria-hidden", "false");
    }
  })()`);
  await new Promise(r => setTimeout(r, 1500));
  await capture('05-dual-ai-debate-stage.png');

  // 6. Dealer Portal (Step 1 Form & Voice Copilot)
  console.log('6. Capturing Dealer Portal...');
  await send('Page.navigate', { url: 'http://localhost:4173/#for-dealers' });
  await new Promise(r => setTimeout(r, 2000));
  await capture('06-dealer-portal-form.png');

  // Step to Step 5 Certificate
  console.log('7. Capturing Verified Dealer Certificate...');
  await evaluate(`(() => {
    document.querySelectorAll(".dealer-step-pane").forEach(p => p.classList.remove("active"));
    const cert = document.querySelector("#dealer-step-5");
    if (cert) cert.classList.add("active");
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  await capture('07-dealer-verified-certificate.png');

  // 8. Virtual 3D Showroom
  console.log('8. Capturing Virtual 3D Showroom...');
  await send('Page.navigate', { url: 'http://localhost:4173/showroom/' });
  await new Promise(r => setTimeout(r, 3000));
  await capture('08-virtual-showroom-360.png');

  // 9. Specialist Rep Console with active queue
  console.log('9. Capturing Specialist Console (/rep)...');
  await send('Page.navigate', { url: 'http://localhost:4173/rep' });
  await new Promise(r => setTimeout(r, 2000));
  await evaluate(`(() => {
    if (typeof renderQueue === 'function') {
      renderQueue([{
        sessionKey: 'sess-demo-891',
        handoffCode: 'K9XP',
        status: 'requested',
        urgency: 'high',
        reasonLabel: 'Human specialist requested',
        summary: 'Buyer wants advice on Tata Nexon EV vs MG Windsor EV for daily 60 km Noida commute with home 15A socket.',
        requestedAt: new Date(Date.now() - 42000).toISOString(),
        lineCount: 14,
        buyerSaid: 'Can I talk to a real person about home charging installation?',
        facts: [
          'Budget: ₹15L',
          'Daily travel: 60 km',
          'Home socket: 15A',
          'Category: Electric Car',
          'Shortlist: Nexon EV, Windsor EV'
        ]
      }]);
    }
  })()`);
  await new Promise(r => setTimeout(r, 1000));
  await capture('09-specialist-rep-console.png');

  console.log('All screenshots captured successfully!');
} catch (err) {
  console.error('Error during capture:', err);
} finally {
  ws.close();
  chromeProc.kill();
}
