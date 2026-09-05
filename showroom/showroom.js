import { VEHICLES, CATEGORIES, SHOWROOM_ACTIONS } from "./vehicle-catalog.js";

const $ = (selector, root = document) => root.querySelector(selector);
const cleanText = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const requestedVehicleId = new URLSearchParams(window.location.search).get("vehicle");
const initialVehicle = VEHICLES.find((vehicle) => vehicle.id === requestedVehicleId) || VEHICLES[0];
const state = {
  selectedId: initialVehicle.id, category: "All", view: "exterior", color: "white",
  variant: "fixed-side-deck", spin: null, pano: null, voiceLive: false, muted: false,
  adapter: null, unsubscribe: null, tourTimer: null, sceneTimer: null,
  orientation: "front", transcriptKeys: new Set()
};
const selectedVehicle = () => VEHICLES.find((vehicle) => vehicle.id === state.selectedId) || VEHICLES[0];

const app = $("#showroom-app");
app.innerHTML = `
<section class="showroom">
  <div class="nav-area">
    <header class="site-nav" id="showroom-site-nav">
      <a class="brand" href="/" aria-label="EasyEV AI home">
        <span class="brand__symbol" aria-hidden="true"><img src="/assets/icon.png" alt="" /></span>
        <span class="brand__wordmark">EasyEV</span><span class="brand__ai">AI</span>
      </a>
      <nav class="primary-nav" id="showroom-primary-navigation" aria-label="Primary navigation">
        <a href="/#consultation-process">How it works</a>
        <a class="is-active" href="/showroom/" aria-current="page">Virtual Showroom</a>
        <a href="/#compare">Compare EVs</a>
        <a href="/#for-dealers">For dealers</a>
      </nav>
      <button class="mobile-menu-button" id="showroom-mobile-menu" type="button" aria-label="Open navigation" aria-expanded="false">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
      <a class="nav-cta" href="/#consultation-process">Talk to EasyEV</a>
    </header>
  </div>
  <div class="workspace">
    <aside class="catalog-panel" aria-label="Vehicle catalogue">
      <div class="catalog-heading"><p>Digital collection</p><h2>Explore the range</h2><span>Real 360° vehicle photography</span></div>
      <div class="category-tabs" id="category-tabs"></div>
      <div class="vehicle-list" id="vehicle-list"></div>
    </aside>
    <main class="experience">
      <div class="stage-heading">
        <div><span id="stage-badge"></span><h1 id="stage-name"></h1><p id="stage-company"></p></div>
      </div>
      <section class="viewer-shell" id="viewer-shell" aria-label="Interactive 360 degree vehicle view">
        <div class="studio-lines" aria-hidden="true"></div>
        <div class="view-tabs" id="view-tabs" aria-label="Vehicle views"></div>
        <div class="scene-action" id="scene-action" aria-hidden="true"><i>✓</i><span></span></div>
        <aside class="virtual-salesman" id="virtual-salesman" data-mode="idle" tabindex="0" aria-label="EasyEV, your virtual vehicle salesperson">
          <div class="thinking-dots" aria-hidden="true"><i></i><i></i><i></i></div>
          <img id="guide-portrait" src="/assets/clay-guide-presenting.webp" alt="EasyEV virtual salesperson presenting the vehicle" />
          <div class="salesman-bubble" aria-live="polite">
            <div><strong>EasyEV</strong><span id="guide-state">Ready</span></div>
            <p id="guide-message">Ask me to open the doors, show the interior, switch vehicles, or explain a specification.</p>
            <button class="guide-expand" id="guide-expand" type="button" aria-expanded="false" hidden>Read more…</button>
          </div>
          <div class="salesman-controls" aria-label="EasyEV controls">
            <div class="voice-status" id="voice-status" data-state="idle"><i></i><span id="voice-status-text">Voice ready</span></div>
            <button class="voice-button" id="voice-toggle">Start voice</button>
            <button class="subtle-button" id="mute-toggle" hidden>Mute</button>
            <button class="subtle-button" id="pause-agent" hidden>Pause</button>
          </div>
        </aside>
        <div class="spin-stage" id="spin-stage">
          <img class="spin-frame" alt="" draggable="false" />
          <div class="spin-loader"><div class="loader-fill"></div></div>
          <div class="spin-pct">0%</div><div class="spin-hint">Drag to rotate 360°</div>
        </div>
        <div class="pano-stage" id="pano-stage"><div id="pano"></div><div class="pano-hint">Drag to look around · scroll to zoom</div></div>
        <div class="toolbar" id="spin-toolbar">
          <button data-spin="prev" aria-label="Previous angle">←</button>
          <button data-spin="play" class="primary" aria-pressed="true">Pause spin</button>
          <button data-spin="next" aria-label="Next angle">→</button>
          <button data-spin="fs" class="fullscreen">Full screen</button>
        </div>
      </section>
      <div class="configuration" id="configuration"></div>
      <div class="command-dock">
        <span>Ask EasyEV</span>
        <form id="command-form"><label class="sr-only" for="command-input">Type a showroom request</label><input id="command-input" placeholder="Try “show the Nexon interior”" autocomplete="off" /><button>Send</button></form>
      </div>
    </main>
    <aside class="detail-panel" aria-label="Vehicle details">
      <div class="detail-top"><div><p>Now presenting</p><h2 id="detail-name"></h2><span id="detail-kind"></span></div><span class="energy-badge" id="energy-badge"></span></div>
      <div class="price-card"><div><span>Starting price</span><strong id="detail-price"></strong></div><small id="price-note"></small></div>
      <div class="spec-grid" id="spec-grid"></div>
      <div class="detail-section"><h3>Highlights</h3><div class="feature-list" id="feature-list"></div></div>
      <button class="book-test-drive-button" type="button">Book test drive</button>
      <p class="spec-note" id="spec-note"></p>
      <a class="source-link" id="source-link" target="_blank" rel="noreferrer">View official model page ↗</a>
    </aside>
  </div>
</section>
<div class="test-drive-modal-overlay" id="test-drive-modal" hidden>
  <div class="test-drive-modal-card" role="dialog" aria-modal="true" aria-labelledby="td-modal-heading">
    <div class="td-modal-header">
      <div class="td-modal-header-info">
        <img class="td-modal-thumb" id="td-modal-thumb" src="" alt="" />
        <div class="td-modal-title">
          <h3 id="td-modal-heading">Book Test Drive</h3>
          <span id="td-modal-vehicle-name">Tata Punch.ev</span>
        </div>
      </div>
      <button class="td-modal-close" id="td-modal-close" type="button" aria-label="Close dialog">✕</button>
    </div>
    
    <div class="td-modal-body">
      <!-- Voice Agent Interactive Session -->
      <div id="td-voice-state" class="td-voice-layout">
        <!-- Agent Identity & Audio Visualizer -->
        <div class="td-agent-card" id="td-agent-card">
          <div class="td-agent-avatar-wrap">
            <div class="td-avatar-pulse-ring" id="td-avatar-ring"></div>
            <div class="td-agent-avatar" id="td-agent-avatar">
              <img src="/images/guide-portrait.webp" alt="Aarav" class="td-avatar-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='grid'" />
              <div class="td-avatar-fallback" style="display:none">🎙️</div>
            </div>
            <span class="td-live-badge"><span class="td-live-dot"></span> LIVE</span>
          </div>
          <div class="td-agent-meta">
            <div class="td-agent-name-row">
              <span class="td-agent-name">Aarav</span>
              <span class="td-agent-badge">Voice Specialist</span>
            </div>
            <div class="td-agent-status-pill" id="td-agent-status" data-state="speaking">
              <span class="td-status-dot"></span>
              <span id="td-status-text">Speaking...</span>
            </div>
          </div>
        </div>

        <!-- Live Agent Dialogue Box -->
        <div class="td-speech-bubble" id="td-speech-bubble">
          <div class="td-speech-quote-icon">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M14.017 21v-7.391c0-5.704 3.731-9.57 8.983-10.609l.995 2.151c-2.432.917-3.995 3.638-3.995 5.849h4v10h-9.983zm-14.017 0v-7.391c0-5.704 3.748-9.57 9-10.609l.996 2.151c-2.433.917-3.996 3.638-3.996 5.849h3.983v10h-9.983z"/></svg>
          </div>
          <p id="td-agent-speech">Connecting to Aarav...</p>
        </div>

        <!-- Realtime Suggested Chips -->
        <div class="td-chips-container" id="td-chips-container"></div>

        <!-- Voice & Text Dual-Modality Controls -->
        <div class="td-controls-row">
          <button type="button" class="td-mic-btn" id="td-mic-toggle" aria-label="Microphone" title="Toggle Voice Input">
            <svg class="td-mic-svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
              <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
              <line x1="12" y1="19" x2="12" y2="23"></line>
              <line x1="8" y1="23" x2="16" y2="23"></line>
            </svg>
            <span class="td-mic-tooltip" id="td-mic-label">Listening...</span>
          </button>
          
          <form class="td-text-form" id="td-voice-text-form">
            <input type="text" id="td-voice-text-input" class="td-text-input" placeholder="Or type reply (e.g. Saturday 5 PM)..." autocomplete="off" />
            <button type="submit" class="td-text-send-btn" id="td-text-send-btn" aria-label="Send">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            </button>
          </form>
        </div>
      </div>

      <!-- State 2: Confirmed Pass -->
      <div id="td-confirmed-state" hidden class="td-confirmed-card">
        <div class="td-success-icon-wrap">
          <div class="td-success-check">✓</div>
        </div>
        <h4>Test Drive Confirmed!</h4>
        <p class="td-confirmed-subtitle">Your slot has been locked in the dealership network & official pass sent to your Gmail.</p>

        <div class="td-booking-pass-card">
          <div class="td-booking-pass-header">
            <span class="td-booking-pass-tag">OFFICIAL TEST DRIVE PASS</span>
            <span class="td-booking-pass-id" id="td-confirmed-id">EEV-TD-10482</span>
          </div>
          <div class="td-booking-pass-body">
            <div class="td-pass-row"><span class="td-pass-label">Vehicle</span><strong class="td-pass-val" id="td-confirmed-vehicle">Tata Nexon.ev</strong></div>
            <div class="td-pass-row"><span class="td-pass-label">Date & Time</span><strong class="td-pass-val" id="td-confirmed-datetime">Saturday, Nov 21 · 5:00 PM</strong></div>
            <div class="td-pass-row"><span class="td-pass-label">Location</span><strong class="td-pass-val" id="td-confirmed-location">EasyEV Superhub CyberCity, Gurgaon</strong></div>
            <div class="td-pass-row"><span class="td-pass-label">Email Dispatched</span><strong class="td-pass-val td-email-val" id="td-confirmed-email">satvikk005@gmail.com</strong></div>
          </div>
        </div>

        <button type="button" class="td-done-btn" id="td-confirmed-done-btn">Back to Showroom</button>
      </div>
    </div>
  </div>
</div>
<div class="loading-screen" id="loading-screen"><div class="loading-orbit"></div><strong>Preparing the showroom</strong><span>Loading real vehicle views</span></div>`;

const ui = {
  categories: $("#category-tabs"), list: $("#vehicle-list"), stageName: $("#stage-name"),
  stageBadge: $("#stage-badge"), stageCompany: $("#stage-company"), views: $("#view-tabs"),
  viewer: $("#viewer-shell"), spinStage: $("#spin-stage"), panoStage: $("#pano-stage"),
  toolbar: $("#spin-toolbar"), config: $("#configuration"), detailName: $("#detail-name"),
  detailKind: $("#detail-kind"), energyBadge: $("#energy-badge"), specs: $("#spec-grid"),
  detailPrice: $("#detail-price"), priceNote: $("#price-note"),
  features: $("#feature-list"), note: $("#spec-note"), source: $("#source-link"),
  salesman: $("#virtual-salesman"), guidePortrait: $("#guide-portrait"), guideMessage: $("#guide-message"), guideState: $("#guide-state"),
  guideBubble: $(".salesman-bubble"), guideExpand: $("#guide-expand"), sceneAction: $("#scene-action"),
  voiceToggle: $("#voice-toggle"), muteToggle: $("#mute-toggle"), pauseAgent: $("#pause-agent"), voiceStatus: $("#voice-status"),
  voiceStatusText: $("#voice-status-text"), commandForm: $("#command-form"),
  commandInput: $("#command-input"), loading: $("#loading-screen"), mobileMenu: $("#showroom-mobile-menu"),
  primaryNav: $("#showroom-primary-navigation"),
  bookTestDriveBtn: $(".book-test-drive-button"),
  tdModal: $("#test-drive-modal"),
  tdModalThumb: $("#td-modal-thumb"),
  tdModalVehicleName: $("#td-modal-vehicle-name"),
  tdModalClose: $("#td-modal-close"),
  tdVoiceState: $("#td-voice-state"),
  tdAgentCard: $("#td-agent-card"),
  tdAgentAvatar: $("#td-agent-avatar"),
  tdAvatarRing: $("#td-avatar-ring"),
  tdAgentStatus: $("#td-agent-status"),
  tdStatusText: $("#td-status-text"),
  tdSpeechBubble: $("#td-speech-bubble"),
  tdAgentSpeech: $("#td-agent-speech"),
  tdChipsContainer: $("#td-chips-container"),
  tdMicToggle: $("#td-mic-toggle"),
  tdMicLabel: $("#td-mic-label"),
  tdVoiceTextForm: $("#td-voice-text-form"),
  tdVoiceTextInput: $("#td-voice-text-input"),
  tdConfirmedState: $("#td-confirmed-state"),
  tdConfirmedId: $("#td-confirmed-id"),
  tdConfirmedVehicle: $("#td-confirmed-vehicle"),
  tdConfirmedDatetime: $("#td-confirmed-datetime"),
  tdConfirmedLocation: $("#td-confirmed-location"),
  tdConfirmedEmail: $("#td-confirmed-email"),
  tdConfirmedDoneBtn: $("#td-confirmed-done-btn")
};

function renderCategories() {
  ui.categories.innerHTML = CATEGORIES.map((category) =>
    '<button data-category="' + category + '" aria-pressed="' + (category === state.category) + '">' + category + '</button>'
  ).join("");
}

function renderCatalog() {
  const vehicles = state.category === "All" ? VEHICLES : VEHICLES.filter((vehicle) => vehicle.category === state.category);
  ui.list.innerHTML = vehicles.map((vehicle) =>
    '<button class="vehicle-card" data-vehicle-id="' + vehicle.id + '" aria-pressed="' + (vehicle.id === state.selectedId) + '">' +
      '<img src="' + vehicle.thumbnail + '" alt="" loading="lazy" />' +
      '<span><strong>' + vehicle.name + '</strong><small>' + vehicle.badge + '</small></span><b>›</b>' +
    '</button>'
  ).join("");
}

function renderDetails() {
  const vehicle = selectedVehicle();
  ui.stageName.textContent = vehicle.name;
  ui.stageBadge.textContent = vehicle.badge;
  ui.stageCompany.textContent = vehicle.company;
  ui.detailName.textContent = vehicle.name;
  ui.detailKind.textContent = vehicle.badge;
  ui.energyBadge.textContent = vehicle.powertrain;
  ui.energyBadge.dataset.kind = vehicle.powertrain.toLowerCase();
  ui.detailPrice.textContent = vehicle.price;
  ui.priceNote.textContent = vehicle.priceNote || "Indicative ex-showroom · verify locally";
  ui.specs.innerHTML = vehicle.specs.map(([label, value]) =>
    '<div class="spec-item"><strong>' + value + '</strong><span>' + label + '</span></div>'
  ).join("");
  ui.features.innerHTML = vehicle.features.map((feature) =>
    '<div class="feature-row"><i>✓</i><span>' + feature + '</span></div>'
  ).join("");
  ui.note.textContent = vehicle.specNote;
  ui.source.href = vehicle.sourceUrl;
}

function getViews(vehicle) {
  if (vehicle.makeView) return { configuration: vehicle.makeView(state.color, state.variant) };
  return vehicle.views;
}

function renderViewTabs() {
  const views = getViews(selectedVehicle());
  const keys = Object.keys(views);
  const icons = { exterior:"↻", open:"◇", interior:"⌾", configuration:"▦" };
  if (!keys.includes(state.view)) state.view = keys[0];
  ui.views.innerHTML = keys.map((key) =>
    '<button data-view="' + key + '" aria-pressed="' + (key === state.view) + '"><i aria-hidden="true">' + (icons[key] || "•") + '</i>' + views[key].label + '</button>'
  ).join("");
}

function renderConfiguration() {
  const vehicle = selectedVehicle();
  if (!vehicle.makeView) { ui.config.innerHTML = ""; ui.config.hidden = true; return; }
  ui.config.hidden = false;
  ui.config.innerHTML =
    '<div><span>Body style</span>' + Object.entries(vehicle.variants).map(([id, label]) =>
      '<button data-variant="' + id + '" aria-pressed="' + (id === state.variant) + '">' + label + '</button>'
    ).join("") + '</div><div><span>Colour</span>' + Object.entries(vehicle.colors).map(([id, label]) =>
      '<button class="paint-option ' + id + '" data-color="' + id + '" aria-pressed="' + (id === state.color) + '"><i></i>' + label + '</button>'
    ).join("") + '</div>';
}

function teardownViewer() {
  state.spin?.destroy();
  state.spin = null;
  if (state.pano) { try { state.pano.destroy(); } catch {} state.pano = null; $("#pano").innerHTML = ""; }
}

function showCurrentView() {
  teardownViewer();
  const view = getViews(selectedVehicle())[state.view];
  ui.spinStage.style.display = view.type === "spin" ? "" : "none";
  ui.toolbar.style.display = view.type === "spin" ? "" : "none";
  ui.panoStage.classList.toggle("show", view.type === "cubemap");
  if (view.type === "spin") {
    state.orientation = "front";
    $(".spin-frame", ui.viewer).removeAttribute("src");
    $(".spin-frame", ui.viewer).alt = selectedVehicle().name + " " + view.label;
    $(".spin-loader", ui.viewer).classList.remove("done");
    $(".loader-fill", ui.viewer).style.width = "0%";
    $(".spin-pct", ui.viewer).textContent = "0%";
    $(".spin-hint", ui.viewer).classList.remove("hide");
    $("[data-spin='play']", ui.viewer).textContent = "Pause spin";
    state.spin = new window.SpinViewer(ui.viewer, { ...view, autoRotate:true, autoRotateDelay:2200 });
  } else {
    const base = view.folder + "/";
    state.pano = window.pannellum.viewer("pano", {
      type:"cubemap", cubeMap:view.faces.map((face) => base + face), autoLoad:true,
      autoRotate:-2, autoRotateInactivityDelay:2800, showControls:true, compass:false
    });
  }
}

const guideImages = {
  idle:"/assets/clay-guide-presenting.webp", listening:"/assets/clay-guide-presenting.webp",
  thinking:"/assets/clay-guide-thinking.webp", speaking:"/assets/clay-guide-presenting.webp",
  success:"/assets/clay-guide-success-v2.webp"
};
function syncGuideExpansion() {
  ui.guideBubble.classList.remove("is-expanded");
  ui.guideExpand.setAttribute("aria-expanded", "false");
  ui.guideExpand.textContent = "Read more…";
  ui.guideExpand.hidden = true;
  requestAnimationFrame(() => {
    ui.guideExpand.hidden = ui.guideMessage.scrollHeight <= ui.guideMessage.clientHeight + 1;
  });
}
function setGuide(mode, message) {
  ui.salesman.dataset.mode = mode;
  ui.guidePortrait.src = guideImages[mode] || guideImages.idle;
  ui.guideState.textContent = ({idle:"Ready",listening:"Listening",thinking:"Thinking",speaking:"Speaking",success:"Done"})[mode] || "Ready";
  ui.voiceStatus.dataset.state = mode;
  ui.voiceStatusText.textContent = ({idle:"Voice guide ready",listening:"Listening",thinking:"Thinking",speaking:"EasyEV is speaking",success:"Ready"})[mode] || "Voice guide ready";
  if (message) {
    ui.guideMessage.textContent = message;
    syncGuideExpansion();
  }
}

function stopTour() {
  if (state.tourTimer) clearInterval(state.tourTimer);
  state.tourTimer = null;
}
function startTour() {
  stopTour();
  const vehicle = selectedVehicle();
  const viewKeys = Object.keys(getViews(vehicle));
  let step = 0;
  const advance = () => {
    if (viewKeys.length > 1) {
      state.view = viewKeys[step % viewKeys.length];
      renderViewTabs(); showCurrentView();
      setGuide("speaking", "Now showing " + getViews(vehicle)[state.view].label.toLowerCase() + ".");
    } else if (state.spin) {
      state.spin.target += Math.max(4, Math.round(state.spin.N / 8));
      state.spin.kick();
      setGuide("speaking", step % 2 ? vehicle.features[step % vehicle.features.length] : vehicle.greeting);
    }
    step++;
  };
  advance();
  state.tourTimer = setInterval(advance, 5200);
}

async function selectVehicle(id, silent = false) {
  const vehicle = VEHICLES.find((item) => item.id === id);
  if (!vehicle || vehicle.id === state.selectedId) return;
  stopTour();
  state.selectedId = vehicle.id;
  state.view = vehicle.makeView ? "configuration" : Object.keys(vehicle.views)[0];
  state.color = "white";
  state.variant = "fixed-side-deck";
  state.orientation = "front";
  renderCatalog(); renderDetails(); renderViewTabs(); renderConfiguration(); showCurrentView();
  if (!silent) setGuide("speaking", vehicle.greeting);
  if (state.voiceLive) { await stopVoice({ skipStop:false }, true); await startVoice(); }
}

function selectView(view) {
  if (!getViews(selectedVehicle())[view]) return false;
  stopTour(); state.view = view; renderViewTabs(); showCurrentView();
  setGuide("success", "Showing " + getViews(selectedVehicle())[view].label.toLowerCase() + ".");
  showSceneAction(getViews(selectedVehicle())[view].label);
  return true;
}
function changeConfiguration(kind, value) {
  const vehicle = selectedVehicle();
  if (!vehicle.makeView) return false;
  if (kind === "color") {
    if (!vehicle.colors[value]) return false;
    state.color = value;
  }
  if (kind === "variant") {
    if (!vehicle.variants[value]) return false;
    state.variant = value;
  }
  state.view = "configuration";
  renderConfiguration(); renderViewTabs(); showCurrentView();
  setGuide("success", "Showing " + vehicle.variants[state.variant] + " in " + vehicle.colors[state.color] + ".");
  showSceneAction(kind === "color" ? vehicle.colors[state.color] : vehicle.variants[state.variant]);
  return true;
}
function rotate(direction) {
  if (!state.spin) return false;
  state.orientation = null;
  state.spin.target += direction * Math.max(2, Math.round(state.spin.N / 12));
  state.spin.kick();
  return true;
}

function showSceneAction(label) {
  window.clearTimeout(state.sceneTimer);
  $("span", ui.sceneAction).textContent = cleanText(label);
  ui.sceneAction.classList.add("is-visible");
  ui.sceneAction.setAttribute("aria-hidden", "false");
  state.sceneTimer = window.setTimeout(() => {
    ui.sceneAction.classList.remove("is-visible");
    ui.sceneAction.setAttribute("aria-hidden", "true");
  }, 1600);
}

function messageFor(input, english, hinglish, hindi) {
  const value = String(input || "");
  if (/[\u0900-\u097f]/.test(value)) return hindi;
  if (/\b(dikha|dikhao|mujhe|andar|bahar|peeche|piche|samne|saamne|gaadi|gadi|karo|kar do)\b/i.test(value)) return hinglish;
  return english;
}

function unavailableMessage(input, subject, alternatives) {
  const vehicle = selectedVehicle();
  const fallback = alternatives || "front, rear, left, or right side";
  const text = messageFor(
    input,
    subject + " is not available for " + vehicle.name + ". I can show " + fallback + ".",
    vehicle.name + " mein " + subject.toLowerCase() + " available nahi hai. Main " + fallback + " dikha sakta hoon.",
    vehicle.name + " में " + subject + " उपलब्ध नहीं है। मैं " + fallback + " दिखा सकता हूँ।"
  );
  setGuide("speaking", text);
  showSceneAction("View unavailable");
  return true;
}

function focusOrientation(orientation, input = "") {
  const vehicle = selectedVehicle();
  let views = getViews(vehicle);
  let viewKey = state.view;
  if (views[viewKey]?.type !== "spin") {
    viewKey = ["exterior", "configuration", "open"].find((key) => views[key]?.type === "spin")
      || Object.keys(views).find((key) => views[key]?.type === "spin");
    if (!viewKey) return unavailableMessage(input, "Directional views");
    state.view = viewKey;
    renderViewTabs();
    showCurrentView();
    views = getViews(vehicle);
  }
  const sourceFrame = views[viewKey]?.angleFrames?.[orientation];
  if (!Number.isFinite(sourceFrame) || !state.spin?.focusSourceFrame) {
    return unavailableMessage(input, "That angle");
  }
  state.spin.focusSourceFrame(sourceFrame);
  state.orientation = orientation;
  const labels = { front:"front", back:"rear", left:"left side", right:"right side" };
  const hindiLabels = { front:"सामने का हिस्सा", back:"पिछला हिस्सा", left:"बाईं साइड", right:"दाईं साइड" };
  const label = labels[orientation];
  showSceneAction(label.charAt(0).toUpperCase() + label.slice(1) + " view");
  setGuide("speaking", messageFor(
    input,
    "I am showing you the " + label + " of " + vehicle.name + ".",
    "Main aapko " + vehicle.name + " ka " + label + " dikha raha hoon.",
    "मैं आपको " + vehicle.name + " का " + hindiLabels[orientation] + " दिखा रहा हूँ।"
  ));
  return true;
}

function dispatch(action) {
  switch (action.type) {
    case SHOWROOM_ACTIONS.SELECT_VEHICLE: return selectVehicle(action.vehicleId, action.silent);
    case SHOWROOM_ACTIONS.SELECT_VIEW: return selectView(action.view);
    case SHOWROOM_ACTIONS.SELECT_COLOR: return changeConfiguration("color", action.color);
    case SHOWROOM_ACTIONS.SELECT_VARIANT: return changeConfiguration("variant", action.variant);
    case SHOWROOM_ACTIONS.ROTATE_LEFT: return rotate(-1);
    case SHOWROOM_ACTIONS.ROTATE_RIGHT: return rotate(1);
    case SHOWROOM_ACTIONS.FOCUS_ORIENTATION: return focusOrientation(action.orientation, action.input);
    case SHOWROOM_ACTIONS.START_TOUR: return startTour();
    case SHOWROOM_ACTIONS.STOP_TOUR: return stopTour();
  }
}

function actionRequested(text) {
  return /\b(show|switch|change|open|close|take|turn|rotate|spin|view|look|display|make|dikha|dikhao|khol|kholo|badlo|ghumao)\b|दिखा|खोल|बदल|घुमा/i.test(text)
    || text.split(/\s+/).length <= 4;
}

function orientationFromText(text) {
  if (/\b(back|rear|behind|peeche|piche)\b|पीछे|बैक|रीयर/i.test(text)) return "back";
  if (/\b(left|baayi|baye)\b|बाईं|बायीं|लेफ्ट/i.test(text)) return "left";
  if (/\b(right|daayi|daye)\b|दाईं|दायीं|राइट/i.test(text)) return "right";
  if (/\b(front|ahead|samne|saamne|aage)\b|सामने|आगे|फ्रंट/i.test(text)) return "front";
  if (/\b(side|profile)\b|साइड/i.test(text)) return state.orientation === "right" ? "left" : "right";
  return null;
}

function interpretCommand(input) {
  const original = cleanText(input);
  const text = original.toLowerCase();
  if (!text) return false;
  const directAction = actionRequested(text);
  let vehicleChanged = false;
  const vehicleMatchers = [
    [/punch/,"tata-punch-ev"],[/nexon/,"tata-nexon-ev"],[/comet|\bmg\b/,"mg-comet-ev"],
    [/citro|\bc3\b/,"citroen-c3"],[/rizta|ather/,"ather-rizta"],[/king|kargo|three.?wheeler|3.?wheeler/,"tvs-king-kargo-ev-hd"]
  ];
  for (const [pattern, id] of vehicleMatchers) {
    if (pattern.test(text) && id !== state.selectedId) {
      selectVehicle(id, true);
      vehicleChanged = true;
      break;
    }
  }

  const vehicle = selectedVehicle();
  let views = getViews(vehicle);
  if (directAction && (/\b(top|roof|overhead|bird.?s.?eye|underbody|bottom|underneath)\b|ऊपर|छत|नीचे/i.test(text))) {
    return unavailableMessage(original, "Top or underbody view");
  }

  if (directAction && (/\b(inside|interior|cabin|andar)\b|अंदर|इंटीरियर|केबिन/i.test(text))) {
    if (!views.interior) return unavailableMessage(original, "Interior view", "the available exterior angles");
    selectView("interior");
    setGuide("speaking", messageFor(
      original,
      "I am taking you inside the " + vehicle.name + ". Drag to look around the cabin.",
      "Main aapko " + vehicle.name + " ke andar le ja raha hoon. Cabin dekhne ke liye drag kijiye.",
      "मैं आपको " + vehicle.name + " के अंदर ले जा रहा हूँ। केबिन देखने के लिए ड्रैग कीजिए।"
    ));
    return true;
  }

  let changedView = null;
  if (directAction && (/(\bopen\b|\bkhol\w*\b).{0,16}(\bdoor|\bdarwa\w*\b)|doors?\s+open|दरवाज़|दरवाज/i.test(text))) {
    if (!views.open) return unavailableMessage(original, "Open-door view", "the available exterior angles");
    selectView("open");
    changedView = "open-door view";
    views = getViews(vehicle);
  } else if (directAction && (/\b(exterior|outside|bahar)\b|बाहर|एक्सटीरियर|close.{0,16}door/i.test(text))) {
    const exteriorKey = views.exterior ? "exterior" : views.configuration ? "configuration" : null;
    if (!exteriorKey) return unavailableMessage(original, "Exterior view");
    selectView(exteriorKey);
    changedView = "exterior view";
    views = getViews(vehicle);
  }

  const orientation = directAction ? orientationFromText(text) : null;
  if (orientation) return focusOrientation(orientation, original);

  if (changedView) {
    setGuide("speaking", messageFor(
      original,
      "I am showing the " + changedView + " for " + vehicle.name + ".",
      "Main aapko " + vehicle.name + " ka " + changedView + " dikha raha hoon.",
      "मैं आपको " + vehicle.name + " का " + changedView + " दिखा रहा हूँ।"
    ));
    return true;
  }

  const colorIntents = [
    ["blue", /\b(blue|neptune)\b|नीला|नीली/i],
    ["white", /\b(white|pristine)\b|सफेद/i],
    ["red", /\bred\b|लाल/i],
    ["black", /\bblack\b|काला|काली/i],
    ["green", /\bgreen\b|हरा|हरी/i]
  ];
  const requestedColor = directAction ? colorIntents.find(([, pattern]) => pattern.test(text))?.[0] : null;
  if (requestedColor) {
    if (!vehicle.colors?.[requestedColor]) {
      const available = vehicle.colors ? Object.values(vehicle.colors).join(" or ") : "the supplied exterior";
      return unavailableMessage(original, "That colour", available);
    }
    changeConfiguration("color", requestedColor);
    setGuide("speaking", messageFor(
      original,
      "I have changed the " + vehicle.name + " to " + vehicle.colors[requestedColor] + ".",
      "Maine " + vehicle.name + " ko " + vehicle.colors[requestedColor] + " mein change kar diya hai.",
      "मैंने " + vehicle.name + " को " + vehicle.colors[requestedColor] + " में बदल दिया है।"
    ));
    return true;
  }

  const variantIntents = [
    ["container", /\bcontainer\b/i],
    ["platform", /\bplatform\b/i],
    ["cab-chassis", /\b(chassis|cab chassis)\b/i],
    ["fixed-side-deck", /\b(deck|fixed side)\b/i]
  ];
  const requestedVariant = directAction ? variantIntents.find(([, pattern]) => pattern.test(text))?.[0] : null;
  if (requestedVariant) {
    if (!vehicle.variants?.[requestedVariant]) return unavailableMessage(original, "That body configuration");
    changeConfiguration("variant", requestedVariant);
    return true;
  }

  if (/\b(rotate|spin|turn|ghumao)\b|घुमा/i.test(text)) {
    rotate(/\b(left|anti)\b|बाईं|लेफ्ट/i.test(text) ? -1 : 1);
    showSceneAction("Rotating vehicle");
    return true;
  }
  if (/\b(start|guided|full|show)\b.*\b(tour|everything)\b/i.test(text)) { startTour(); return true; }
  if (/\b(stop|pause|end)\b.*\btour\b/i.test(text)) { stopTour(); return true; }
  if (vehicleChanged) {
    setGuide("speaking", vehicle.greeting);
    return true;
  }
  setGuide("speaking", vehicle.specs.slice(0, 3).map(([label,value]) => label + ": " + value).join(" · "));
  return false;
}

function transcriptEntries(payload) {
  return Array.isArray(payload) ? payload : payload?.entries || payload?.transcripts || payload?.items || [];
}
function isFinalTranscript(entry) {
  if (entry?.isFinal === true || entry?.final === true) return true;
  const status = String(entry?.status ?? entry?.turn_status ?? entry?.metadata?.turn_status ?? "").toLowerCase();
  return ["1","2","end","ended","final","complete","completed","interrupted","done"].includes(status);
}
function handleTranscript(payload) {
  const entries = transcriptEntries(payload);
  if (!entries.length) return;
  let executedAction = false;
  for (const [index, entry] of entries.entries()) {
    const role = String(entry.role || entry.speaker || entry.uid || "").toLowerCase();
    const text = cleanText(entry.text || entry.transcript || entry.content || entry.message);
    const isAgent = /agent|assistant|ai/.test(role) || entry.isAgent === true;
    if (!text || isAgent || !isFinalTranscript(entry)) continue;
    const turnId = entry.turnId || entry.turn_id || entry.id || entry.timestamp || index;
    const key = String(turnId) + ":" + role + ":" + text;
    if (state.transcriptKeys.has(key)) continue;
    state.transcriptKeys.add(key);
    if (state.transcriptKeys.size > 100) state.transcriptKeys.delete(state.transcriptKeys.values().next().value);
    executedAction = interpretCommand(text) || executedAction;
  }
  const latest = entries[entries.length - 1];
  const latestRole = String(latest.role || latest.speaker || latest.uid || "").toLowerCase();
  const latestText = cleanText(latest.text || latest.transcript || latest.content || latest.message);
  const latestIsAgent = /agent|assistant|ai/.test(latestRole) || latest.isAgent === true;
  if (latestText && latestIsAgent) setGuide("speaking", latestText);
  else if (latestText && !executedAction) setGuide("thinking", "You: “" + latestText + "”");
}

function handleAgoraEvent(event) {
  const payload = event?.payload;
  if (event?.type === "TRANSCRIPT_SYNC") return handleTranscript(payload);
  if (event?.type === "CALL_STATUS") {
    state.voiceLive = payload?.status === "live" || payload === "live";
    ui.voiceToggle.textContent = state.voiceLive ? "End voice" : "Start voice";
    ui.muteToggle.hidden = !state.voiceLive;
    ui.pauseAgent.hidden = !state.voiceLive;
    if (state.voiceLive) setGuide("listening", "I’m listening. Ask me to switch vehicles, open a view, or explain a specification.");
  }
  if (event?.type === "AGENT_STATE") {
    const mode = String(payload?.mode || payload?.state || payload || "idle").toLowerCase();
    if (/listen/.test(mode)) setGuide("listening");
    else if (/think|tool/.test(mode)) setGuide("thinking");
    else if (/speak/.test(mode)) setGuide("speaking");
    else setGuide("idle");
  }
  if (event?.type === "ERROR") setGuide("idle", cleanText(payload?.message || "Voice could not connect. The 360° showroom remains available."));
}
function createAdapter() {
  const factory = window.EasyEVAgoraBundle?.createVehicleAgoraAdapter;
  if (typeof factory !== "function") throw new Error("Agora vehicle adapter unavailable");
  const adapter = factory();
  state.unsubscribe = adapter.onEvent(handleAgoraEvent);
  return adapter;
}
async function startVoice() {
  try {
    if (!state.adapter) state.adapter = createAdapter();
    setGuide("thinking", "Connecting your private Agora showroom conversation…");
    await state.adapter.joinVehicle({ vehicleId:state.selectedId, language:"Hinglish", voice:"madhur" });
  } catch (error) {
    console.error(error);
    setGuide("idle", "Voice is unavailable right now. You can still type requests and explore every 360° view.");
  }
}
async function stopVoice(options = {}, quiet = false) {
  try { await state.adapter?.leave?.(options); } catch (error) { console.warn(error); }
  state.unsubscribe?.(); state.unsubscribe = null; state.adapter = null; state.voiceLive = false;
  ui.voiceToggle.textContent = "Start voice"; ui.muteToggle.hidden = true; ui.pauseAgent.hidden = true;
  if (!quiet) setGuide("idle", "Voice tour ended. Start again whenever you’re ready.");
}

ui.guideExpand.addEventListener("click", () => {
  const expanded = !ui.guideBubble.classList.contains("is-expanded");
  ui.guideBubble.classList.toggle("is-expanded", expanded);
  ui.guideExpand.setAttribute("aria-expanded", String(expanded));
  ui.guideExpand.textContent = expanded ? "Read less…" : "Read more…";
});
ui.categories.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = button.dataset.category; renderCategories(); renderCatalog();
});
ui.list.addEventListener("click", (event) => {
  const button = event.target.closest("[data-vehicle-id]");
  if (button) dispatch({ type:SHOWROOM_ACTIONS.SELECT_VEHICLE, vehicleId:button.dataset.vehicleId });
});
ui.views.addEventListener("click", (event) => {
  const button = event.target.closest("[data-view]");
  if (button) dispatch({ type:SHOWROOM_ACTIONS.SELECT_VIEW, view:button.dataset.view });
});
ui.config.addEventListener("click", (event) => {
  const color = event.target.closest("[data-color]");
  const variant = event.target.closest("[data-variant]");
  if (color) dispatch({ type:SHOWROOM_ACTIONS.SELECT_COLOR, color:color.dataset.color });
  if (variant) dispatch({ type:SHOWROOM_ACTIONS.SELECT_VARIANT, variant:variant.dataset.variant });
});
ui.voiceToggle.addEventListener("click", () => state.voiceLive ? stopVoice() : startVoice());
ui.muteToggle.addEventListener("click", async () => {
  state.muted = !state.muted; await state.adapter?.setMuted?.(state.muted);
  ui.muteToggle.textContent = state.muted ? "Unmute" : "Mute";
});
ui.pauseAgent.addEventListener("click", async () => {
  try {
    await state.adapter?.interrupt?.();
    setGuide("idle", "Paused. Ask your next question whenever you’re ready.");
  } catch (error) {
    console.warn(error);
  }
});
ui.mobileMenu.addEventListener("click", () => {
  const open = !ui.primaryNav.classList.contains("is-open");
  ui.primaryNav.classList.toggle("is-open", open);
  ui.mobileMenu.setAttribute("aria-expanded", String(open));
  ui.mobileMenu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
});
ui.primaryNav.addEventListener("click", () => {
  ui.primaryNav.classList.remove("is-open");
  ui.mobileMenu.setAttribute("aria-expanded", "false");
});
/* ----------------- Test Drive In-Browser Voice Agent Controller ----------------- */
let tdSessionId = null;
let tdSpeechRec = null;
let tdIsListening = false;
let tdSpeechSynth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let tdCurrentUtterance = null;
let tdIsMuted = false;

function setTdAgentState(state, text) {
  if (!ui.tdAgentStatus) return;
  ui.tdAgentStatus.dataset.state = state;
  ui.tdStatusText.textContent = text || (state === 'speaking' ? 'Aarav is speaking...' : state === 'listening' ? 'Listening...' : state === 'thinking' ? 'Thinking...' : 'Ready');
  if (ui.tdAvatarRing) {
    ui.tdAvatarRing.className = `td-avatar-pulse-ring is-${state}`;
  }
}

function speakTdAgent(text, onEnd) {
  if (tdSpeechSynth) {
    try { tdSpeechSynth.cancel(); } catch {}
  }
  if (!text || tdIsMuted) {
    if (onEnd) onEnd();
    return;
  }

  setTdAgentState('speaking', 'Aarav is speaking...');
  
  if (typeof SpeechSynthesisUtterance !== 'undefined' && tdSpeechSynth) {
    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 1.05;
    utter.pitch = 1.0;
    
    // Pick an Indian English or Hindi voice if available
    const voices = tdSpeechSynth.getVoices() || [];
    const inVoice = voices.find(v => v.lang === 'en-IN' || v.lang === 'hi-IN' || v.name.includes('India'));
    if (inVoice) utter.voice = inVoice;

    utter.onend = () => {
      setTdAgentState('listening', 'Listening to you...');
      if (!tdIsMuted) startTdListening();
      if (onEnd) onEnd();
    };
    utter.onerror = () => {
      setTdAgentState('listening', 'Ready for response');
      if (!tdIsMuted) startTdListening();
      if (onEnd) onEnd();
    };

    tdCurrentUtterance = utter;
    tdSpeechSynth.speak(utter);
  } else {
    setTimeout(() => {
      setTdAgentState('listening', 'Listening to you...');
      if (!tdIsMuted) startTdListening();
      if (onEnd) onEnd();
    }, 1200);
  }
}

function startTdListening() {
  if (tdIsMuted) return;
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    if (ui.tdMicLabel) ui.tdMicLabel.textContent = 'Speak or type below';
    return;
  }

  try {
    if (tdSpeechRec) {
      try { tdSpeechRec.abort(); } catch {}
    }

    tdSpeechRec = new SpeechRec();
    tdSpeechRec.continuous = false;
    tdSpeechRec.interimResults = false;
    tdSpeechRec.lang = 'en-IN';

    tdSpeechRec.onstart = () => {
      tdIsListening = true;
      if (ui.tdMicToggle) ui.tdMicToggle.classList.add('is-listening');
      if (ui.tdMicLabel) ui.tdMicLabel.textContent = 'Listening... (Speak now)';
      setTdAgentState('listening', 'Listening to you...');
    };

    tdSpeechRec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join(' ').trim();
      if (transcript) {
        processTdUserTurn(transcript);
      }
    };

    tdSpeechRec.onerror = () => {
      tdIsListening = false;
      if (ui.tdMicToggle) ui.tdMicToggle.classList.remove('is-listening');
      if (ui.tdMicLabel) ui.tdMicLabel.textContent = 'Tap to Speak';
      setTdAgentState('idle', 'Ready for reply');
    };

    tdSpeechRec.onend = () => {
      tdIsListening = false;
      if (ui.tdMicToggle) ui.tdMicToggle.classList.remove('is-listening');
      if (ui.tdMicLabel) ui.tdMicLabel.textContent = 'Tap to Speak';
    };

    tdSpeechRec.start();
  } catch (err) {
    console.warn('[TD SpeechRec]', err);
  }
}

function stopTdListening() {
  if (tdSpeechRec) {
    try { tdSpeechRec.abort(); } catch {}
    tdSpeechRec = null;
  }
  tdIsListening = false;
  if (ui.tdMicToggle) {
    ui.tdMicToggle.classList.remove('is-listening');
    if (ui.tdMicLabel) ui.tdMicLabel.textContent = 'Tap to Speak';
  }
}

function renderTdChips(step, vehicleName) {
  if (!ui.tdChipsContainer) return;
  let chips = [];

  if (step === 'LOCATION' || step === 'GREETING') {
    chips = ['DLF CyberCity, Gurgaon', 'Sector 62, Noida', 'Connaught Place, Delhi', 'Indiranagar, Bengaluru'];
  } else if (step === 'DATE_TIME') {
    chips = ['This Saturday at 5 PM', 'Sunday at 11 AM', 'Tomorrow afternoon at 3 PM'];
  } else if (step === 'SLOT_VERIFY') {
    chips = ['Yes, confirm slot', 'Choose different time'];
  } else if (step === 'EMAIL') {
    chips = ['satvikk005@gmail.com', 'satvik005@gmail.com', 'buyer@gmail.com'];
  }

  ui.tdChipsContainer.innerHTML = chips.map(c => `<button type="button" class="td-chip-btn">${c}</button>`).join('');

  ui.tdChipsContainer.querySelectorAll('.td-chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      processTdUserTurn(btn.textContent.trim());
    });
  });
}

async function openTestDriveModal() {
  const vehicle = selectedVehicle();
  ui.tdModalThumb.src = vehicle.thumbnail;
  ui.tdModalVehicleName.textContent = vehicle.name;

  ui.tdVoiceState.hidden = false;
  ui.tdConfirmedState.hidden = true;
  ui.tdModal.hidden = false;
  ui.tdAgentSpeech.textContent = 'Connecting with Aarav...';
  setTdAgentState('thinking', 'Connecting...');

  try {
    const res = await fetch('/api/test-drive-session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId: vehicle.id,
        vehicleName: vehicle.name,
        language: 'Hinglish',
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Failed to start session');

    tdSessionId = data.sessionId;
    const initialTurn = data.initialTurn;

    ui.tdAgentSpeech.textContent = initialTurn.spoken;
    renderTdChips(initialTurn.step, vehicle.name);
    speakTdAgent(initialTurn.spoken);
  } catch (err) {
    ui.tdAgentSpeech.textContent = `Hello! Which dealership or city location would you like to schedule your ${vehicle.name} test drive in?`;
    renderTdChips('LOCATION', vehicle.name);
    setTdAgentState('listening', 'Ready for response');
  }
}

function closeTestDriveModal() {
  ui.tdModal.hidden = true;
  stopTdListening();
  if (tdSpeechSynth) {
    try { tdSpeechSynth.cancel(); } catch {}
  }
  if (tdSessionId) {
    fetch('/api/test-drive-session/stop', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: tdSessionId }),
    }).catch(() => {});
    tdSessionId = null;
  }
}

async function processTdUserTurn(text) {
  if (!text) return;
  stopTdListening();
  if (tdSpeechSynth) {
    try { tdSpeechSynth.cancel(); } catch {}
  }

  setTdAgentState('thinking', 'Aarav is thinking...');
  ui.tdAgentSpeech.innerHTML = `<span class="td-user-echo">You: “${text}”</span><br/><span class="td-typing-dots">Aarav is processing...</span>`;

  try {
    const res = await fetch('/api/test-drive-session/process-turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: tdSessionId,
        text,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.error || 'Turn failed');

    ui.tdAgentSpeech.textContent = data.spoken;
    renderTdChips(data.step, data.vehicleName || selectedVehicle().name);

    if (ui.tdVoiceTextInput) {
      if (data.step === 'EMAIL') {
        ui.tdVoiceTextInput.placeholder = 'Enter your Gmail (e.g. satvik005@gmail.com)...';
      } else if (data.step === 'DATE_TIME') {
        ui.tdVoiceTextInput.placeholder = 'Type preferred day & time (e.g. Tomorrow 4 PM)...';
      } else if (data.step === 'LOCATION') {
        ui.tdVoiceTextInput.placeholder = 'Type your city or dealership (e.g. Gurgaon)...';
      } else if (data.step === 'SLOT_VERIFY') {
        ui.tdVoiceTextInput.placeholder = 'Type yes to confirm or suggest another time...';
      }
    }

    if (data.isCompleted && data.booking) {
      speakTdAgent(data.spoken, () => {
        setTimeout(() => {
          ui.tdVoiceState.hidden = true;
          ui.tdConfirmedState.hidden = false;
          ui.tdConfirmedId.textContent = data.booking.id || 'EEV-TD-CONFIRMED';
          ui.tdConfirmedVehicle.textContent = data.vehicleName || selectedVehicle().name;
          ui.tdConfirmedDatetime.textContent = `${data.booking.date} · ${data.booking.time || '5:00 PM'}`;
          ui.tdConfirmedLocation.textContent = data.booking.location || 'EasyEV Superhub CyberCity, Gurgaon';
          if (ui.tdConfirmedEmail) {
            ui.tdConfirmedEmail.textContent = data.values?.customerEmail || 'Your Gmail';
          }
        }, 1200);
      });
    } else {
      speakTdAgent(data.spoken);
    }
  } catch (err) {
    ui.tdAgentSpeech.textContent = 'Sorry, could you please repeat that?';
    setTdAgentState('listening', 'Ready for response');
    startTdListening();
  }
}

ui.bookTestDriveBtn.addEventListener("click", openTestDriveModal);
ui.tdModalClose.addEventListener("click", closeTestDriveModal);
ui.tdConfirmedDoneBtn.addEventListener("click", closeTestDriveModal);
ui.tdModal.addEventListener("click", (e) => {
  if (e.target === ui.tdModal) closeTestDriveModal();
});

ui.tdMicToggle.addEventListener("click", () => {
  if (tdIsListening) {
    stopTdListening();
    tdIsMuted = true;
    ui.tdMicLabel.textContent = 'Muted (Tap to Speak)';
    setTdAgentState('idle', 'Microphone muted');
  } else {
    tdIsMuted = false;
    startTdListening();
  }
});

ui.tdVoiceTextForm.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = ui.tdVoiceTextInput.value.trim();
  if (!text) return;
  ui.tdVoiceTextInput.value = '';
  processTdUserTurn(text);
});

ui.commandForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const text = cleanText(ui.commandInput.value);
  if (!text) return;
  ui.commandInput.value = ""; setGuide("thinking", "You: “" + text + "”"); interpretCommand(text);
  if (state.voiceLive && state.adapter?.sendText) {
    try { await state.adapter.sendText(text); } catch (error) { console.warn(error); }
  }
});

window.addEventListener("pagehide", () => {
  stopTour(); window.clearTimeout(state.sceneTimer); teardownViewer(); state.adapter?.stopWithBeacon?.(); state.unsubscribe?.();
});
window.EVShowroom = Object.freeze({
  dispatch, execute:interpretCommand, receiveTranscript:handleTranscript, actions:SHOWROOM_ACTIONS,
  getState:() => ({ vehicleId:state.selectedId, view:state.view, orientation:state.orientation, color:state.color, variant:state.variant, voiceLive:state.voiceLive })
});

renderCategories(); renderCatalog(); renderDetails(); renderViewTabs(); renderConfiguration(); showCurrentView();
setGuide("idle", selectedVehicle().greeting);
setTimeout(() => ui.loading.remove(), 500);
