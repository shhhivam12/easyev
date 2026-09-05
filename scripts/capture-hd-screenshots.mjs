import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT_DIR = resolve(ROOT, 'images');
await mkdir(OUT_DIR, { recursive: true });

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = 9223;

console.log('Launching headless Chrome on port', DEBUG_PORT);
const chrome = spawn(CHROME_PATH, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-sandbox',
  `--remote-debugging-port=${DEBUG_PORT}`,
  '--window-size=1920,1080',
  '--force-device-scale-factor=2'
], { stdio: 'ignore' });

// Ensure Chrome process cleanup
const cleanup = () => {
  try { chrome.kill(); } catch (_) {}
};
process.on('exit', cleanup);
process.on('SIGINT', () => { cleanup(); process.exit(); });
process.on('SIGTERM', () => { cleanup(); process.exit(); });

// Wait for Chrome to be ready
let versionData;
for (let i = 0; i < 20; i++) {
  await new Promise((r) => setTimeout(r, 500));
  try {
    const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
    if (res.ok) {
      versionData = await res.json();
      break;
    }
  } catch (_) {}
}

if (!versionData) {
  console.error('Failed to connect to Chrome on port', DEBUG_PORT);
  cleanup();
  process.exit(1);
}

console.log('Connected to Chrome:', versionData.Browser);

// Helper for CDP session
async function createCdpSession(targetUrl) {
  const targetRes = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent(targetUrl)}`, { method: 'PUT' });
  const target = await targetRes.json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);

  await new Promise((res) => ws.addEventListener('open', res));

  let reqId = 1;
  const pending = new Map();

  ws.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    }
  });

  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const id = reqId++;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  };

  const close = async () => {
    try { ws.close(); } catch (_) {}
    try {
      await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/close/${target.id}`);
    } catch (_) {}
  };

  return { send, close };
}

async function captureScreenshot(url, filename, { scrollSelector = null, fullPage = false, delayMs = 1500 } = {}) {
  console.log(`Navigating to ${url} -> ${filename}...`);
  const session = await createCdpSession(url);
  const { send, close } = session;

  try {
    await send('Page.enable');
    await send('DOM.enable');
    await send('Emulation.setDeviceMetricsOverride', {
      width: 1920,
      height: 1080,
      deviceScaleFactor: 2,
      mobile: false
    });

    await new Promise((r) => setTimeout(r, delayMs));

    if (scrollSelector) {
      await send('Runtime.evaluate', {
        expression: `
          (() => {
            const el = document.querySelector(${JSON.stringify(scrollSelector)});
            if (el) {
              el.scrollIntoView({ behavior: 'instant', block: 'start' });
            }
          })()
        `
      });
      await new Promise((r) => setTimeout(r, 800));
    }

    let clip;
    if (fullPage) {
      const layoutMetrics = await send('Page.getLayoutMetrics');
      const { width, height } = layoutMetrics.contentSize;
      clip = { x: 0, y: 0, width, height, scale: 1 };
    }

    const screenshotResult = await send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: fullPage,
      clip: clip
    });

    const buffer = Buffer.from(screenshotResult.data, 'base64');
    const filePath = resolve(OUT_DIR, filename);
    await writeFile(filePath, buffer);
    console.log(`Saved: ${filePath} (${Math.round(buffer.length / 1024)} KB)`);
  } finally {
    await close();
  }
}

try {
  // 1. Landing Page Hero
  await captureScreenshot('http://localhost:4173/', '01-landing-hero-home.png', { delayMs: 2000 });

  // 2. Landing Page Voice Agent Consultation Interface
  await captureScreenshot('http://localhost:4173/', '02-landing-voice-agent-consultation.png', {
    scrollSelector: '#consultation-mount, .consultation-section, .hero-consultation, [id*="consult"]',
    delayMs: 2000
  });

  // 3. Landing Page EV Comparison / Debate Arena
  await captureScreenshot('http://localhost:4173/#compare', '03-landing-ev-comparison-arena.png', {
    scrollSelector: '#compare, .compare-section, [id*="compare"]',
    delayMs: 2000
  });

  // 4. Landing Page Featured EVs / Catalog Preview
  await captureScreenshot('http://localhost:4173/', '04-landing-featured-evs.png', {
    scrollSelector: '#explore, .explore-section, .featured-evs, [id*="explore"]',
    delayMs: 2000
  });

  // 5. Landing Page Dealership Network
  await captureScreenshot('http://localhost:4173/#for-dealers', '05-landing-dealership-network.png', {
    scrollSelector: '#for-dealers, .dealers-section, [id*="dealer"]',
    delayMs: 2000
  });

  // 6. Landing Page Full Page
  await captureScreenshot('http://localhost:4173/', '06-landing-page-full-overview.png', {
    fullPage: true,
    delayMs: 2500
  });

  // 7. Showroom Catalog Page (Hero / Filters)
  await captureScreenshot('http://localhost:4173/showroom/', '07-showroom-catalog-hero.png', { delayMs: 2000 });

  // 8. Showroom Catalog Vehicles Grid
  await captureScreenshot('http://localhost:4173/showroom/', '08-showroom-catalog-vehicles-grid.png', {
    scrollSelector: '.catalog-grid, .vehicle-grid, #vehicle-grid, .catalog-section',
    delayMs: 2000
  });

  // 9. Showroom Full Page
  await captureScreenshot('http://localhost:4173/showroom/', '09-showroom-catalog-full-overview.png', {
    fullPage: true,
    delayMs: 2500
  });

  // 10. Human Specialist Escalation Desk (Rep Portal)
  await captureScreenshot('http://localhost:4173/rep.html', '10-dealership-rep-escalation-desk.png', { delayMs: 2000 });

  console.log('\nAll Full HD screenshots captured successfully in images/ folder!');
} catch (err) {
  console.error('Error during capture:', err);
} finally {
  cleanup();
}
