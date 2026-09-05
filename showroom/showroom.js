import { VEHICLES, CATEGORIES, SHOWROOM_ACTIONS } from "./vehicle-catalog.js";

const $ = (selector, root = document) => root.querySelector(selector);
const cleanText = (value) => String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const state = {
  selectedId: VEHICLES[0].id, category: "All", view: "exterior", color: "white",
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
      <!-- State 1: Form Input -->
      <div id="td-form-state">
        <div class="td-intro-box">
          <span class="td-intro-icon">⚡</span>
          <div>
            <strong>Instant AI Voice Scheduling</strong><br>
            Aarav, your EasyEV AI specialist, will call you immediately to confirm your preferred location and time.
          </div>
        </div>

        <div class="td-error-banner" id="td-error-banner"></div>

        <form id="td-booking-form">
          <div class="td-form-group">
            <label for="td-phone-input">Mobile Phone Number</label>
            <div class="td-input-wrapper">
              <span class="td-input-prefix">🇮🇳 +91</span>
              <input type="tel" id="td-phone-input" class="td-input" placeholder="98765 43210" maxlength="14" required autocomplete="tel" />
            </div>
          </div>

          <div class="td-form-group">
            <label for="td-email-input">Email Address (for confirmation)</label>
            <div class="td-input-wrapper">
              <input type="email" id="td-email-input" class="td-input" placeholder="you@example.com" required autocomplete="email" />
            </div>
          </div>

          <button type="submit" class="td-submit-btn" id="td-submit-btn">
            <span>📞 Request Instant Voice Call</span>
          </button>
          <p class="td-trust-note">🔒 Zero spam. Live automated outbound call powered by Bland AI & EasyEV.</p>
        </form>
      </div>

      <!-- State 2: Calling / In Progress -->
      <div id="td-calling-state" hidden class="td-calling-card">
        <div class="td-pulse-ring">📞</div>
        <h4 id="td-calling-title">Calling your phone...</h4>
        <p id="td-calling-subtitle">Please answer the incoming call from EasyEV to select your preferred location and test drive slot.</p>
        
        <div class="td-steps-list">
          <div class="td-step-item is-done" id="td-step-1">
            <i>✓</i><span>1. Outbound Call Initiated</span>
          </div>
          <div class="td-step-item is-active" id="td-step-2">
            <i>●</i><span>2. Voice Conversation & Slot Matching</span>
          </div>
          <div class="td-step-item is-pending" id="td-step-3">
            <i>○</i><span>3. Atomic Reservation & Email Sent</span>
          </div>
        </div>
      </div>

      <!-- State 3: Confirmed -->
      <div id="td-confirmed-state" hidden class="td-confirmed-card">
        <div class="td-success-icon">✓</div>
        <h4>Test Drive Confirmed!</h4>
        <p>Your test drive slot has been locked in the dealership system.</p>

        <div class="td-booking-ref-box">
          <div class="td-booking-ref-id" id="td-confirmed-id">Ref: EEV-TD-10482</div>
          <div class="td-booking-row"><span>Vehicle</span><strong id="td-confirmed-vehicle">Tata Punch.ev</strong></div>
          <div class="td-booking-row"><span>Date & Time</span><strong id="td-confirmed-datetime">Saturday at 5:00 PM</strong></div>
          <div class="td-booking-row"><span>Location</span><strong id="td-confirmed-location">Noida Sector 62</strong></div>
        </div>

        <button type="button" class="td-done-btn" id="td-confirmed-done-btn">Back to Virtual Showroom</button>
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
  tdFormState: $("#td-form-state"),
  tdCallingState: $("#td-calling-state"),
  tdConfirmedState: $("#td-confirmed-state"),
  tdBookingForm: $("#td-booking-form"),
  tdPhoneInput: $("#td-phone-input"),
  tdEmailInput: $("#td-email-input"),
  tdSubmitBtn: $("#td-submit-btn"),
  tdErrorBanner: $("#td-error-banner"),
  tdCallingTitle: $("#td-calling-title"),
  tdCallingSubtitle: $("#td-calling-subtitle"),
  tdStep1: $("#td-step-1"),
  tdStep2: $("#td-step-2"),
  tdStep3: $("#td-step-3"),
  tdConfirmedId: $("#td-confirmed-id"),
  tdConfirmedVehicle: $("#td-confirmed-vehicle"),
  tdConfirmedDatetime: $("#td-confirmed-datetime"),
  tdConfirmedLocation: $("#td-confirmed-location"),
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
/* ----------------- Test Drive Booking Modal Controller ----------------- */
let tdActiveSessionId = null;
let tdPollInterval = null;

function openTestDriveModal() {
  const vehicle = selectedVehicle();
  ui.tdModalThumb.src = vehicle.thumbnail;
  ui.tdModalVehicleName.textContent = vehicle.name;
  
  // Reset form & states
  ui.tdErrorBanner.classList.remove("is-visible");
  ui.tdErrorBanner.textContent = "";
  ui.tdFormState.hidden = false;
  ui.tdCallingState.hidden = true;
  ui.tdConfirmedState.hidden = true;
  ui.tdSubmitBtn.disabled = false;
  ui.tdSubmitBtn.innerHTML = '<span>📞 Request Instant Voice Call</span>';
  
  ui.tdModal.hidden = false;
  ui.tdPhoneInput.focus();
}

function closeTestDriveModal() {
  ui.tdModal.hidden = true;
  if (tdPollInterval) {
    clearInterval(tdPollInterval);
    tdPollInterval = null;
  }
}

// Auto-format Indian phone number in input
ui.tdPhoneInput.addEventListener("input", (e) => {
  let val = e.target.value.replace(/\D/g, "");
  if (val.startsWith("91") && val.length > 10) val = val.slice(2);
  if (val.startsWith("0")) val = val.slice(1);
  if (val.length > 10) val = val.slice(0, 10);
  
  if (val.length > 5) {
    e.target.value = `${val.slice(0, 5)} ${val.slice(5)}`;
  } else {
    e.target.value = val;
  }
});

ui.bookTestDriveBtn.addEventListener("click", openTestDriveModal);
ui.tdModalClose.addEventListener("click", closeTestDriveModal);
ui.tdConfirmedDoneBtn.addEventListener("click", closeTestDriveModal);
ui.tdModal.addEventListener("click", (e) => {
  if (e.target === ui.tdModal) closeTestDriveModal();
});

ui.tdBookingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  ui.tdErrorBanner.classList.remove("is-visible");
  ui.tdErrorBanner.textContent = "";

  const vehicle = selectedVehicle();
  const rawPhone = ui.tdPhoneInput.value.replace(/\D/g, "");
  const email = ui.tdEmailInput.value.trim();

  if (rawPhone.length !== 10) {
    ui.tdErrorBanner.textContent = "Please enter a valid 10-digit mobile number.";
    ui.tdErrorBanner.classList.add("is-visible");
    ui.tdPhoneInput.focus();
    return;
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    ui.tdErrorBanner.textContent = "Please enter a valid email address for confirmation.";
    ui.tdErrorBanner.classList.add("is-visible");
    ui.tdEmailInput.focus();
    return;
  }

  ui.tdSubmitBtn.disabled = true;
  ui.tdSubmitBtn.innerHTML = '<span>⏳ Preparing Voice Call...</span>';

  const idempotencyKey = `td_cli_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    const res = await fetch('/api/test-drive/initiate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vehicleId: vehicle.id,
        phone: `+91${rawPhone}`,
        email,
        idempotencyKey,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to initiate call. Please try again.');
    }

    tdActiveSessionId = data.sessionId;

    // Transition modal to Calling state
    ui.tdFormState.hidden = true;
    ui.tdCallingState.hidden = false;
    ui.tdCallingTitle.textContent = `Calling +91 ${rawPhone.slice(0, 5)} ${rawPhone.slice(5)}...`;
    ui.tdCallingSubtitle.textContent = `Aarav, your EasyEV AI specialist, is on the line to confirm your location and test drive slot for the ${vehicle.name}.`;

    // Start polling status
    startTestDrivePolling(tdActiveSessionId, vehicle.name);
  } catch (err) {
    ui.tdSubmitBtn.disabled = false;
    ui.tdSubmitBtn.innerHTML = '<span>📞 Request Instant Voice Call</span>';
    ui.tdErrorBanner.textContent = err.message || 'Network error initiating test drive call.';
    ui.tdErrorBanner.classList.add("is-visible");
  }
});

function startTestDrivePolling(sessionId, vehicleName) {
  if (tdPollInterval) clearInterval(tdPollInterval);

  tdPollInterval = setInterval(async () => {
    try {
      const res = await fetch(`/api/test-drive/status/${encodeURIComponent(sessionId)}`);
      if (!res.ok) return;
      const data = await res.json();

      if (data.status === 'IN_PROGRESS' || data.status === 'COLLECTING_DETAILS' || data.status === 'SLOT_CHECKED') {
        ui.tdStep1.className = 'td-step-item is-done';
        ui.tdStep2.className = 'td-step-item is-active';
        ui.tdStep3.className = 'td-step-item is-pending';
      } else if (data.status === 'AWAITING_CONFIRMATION' || data.status === 'BOOKING') {
        ui.tdStep1.className = 'td-step-item is-done';
        ui.tdStep2.className = 'td-step-item is-done';
        ui.tdStep3.className = 'td-step-item is-active';
      } else if (data.status === 'BOOKED' && data.booking) {
        clearInterval(tdPollInterval);
        tdPollInterval = null;

        // Transition to Confirmed state
        ui.tdCallingState.hidden = true;
        ui.tdConfirmedState.hidden = false;
        ui.tdConfirmedId.textContent = `Ref ID: ${data.booking.id}`;
        ui.tdConfirmedVehicle.textContent = data.vehicleName || vehicleName;
        ui.tdConfirmedDatetime.textContent = `${data.booking.date} · ${data.booking.time}`;
        ui.tdConfirmedLocation.textContent = data.booking.location || 'Dealership Hub';
      } else if (data.status === 'FAILED' || data.status === 'NO_ANSWER' || data.status === 'BUSY') {
        clearInterval(tdPollInterval);
        tdPollInterval = null;
        ui.tdCallingTitle.textContent = 'Call could not be completed';
        ui.tdCallingSubtitle.textContent = `Status: ${data.status.replace('_', ' ')}. You can try again or arrange directly with our team.`;
      }
    } catch (e) {
      console.warn('[TD Polling]', e);
    }
  }, 2500);
}

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
