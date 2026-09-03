# EasyEV AI — MVP 0 Coding-Agent Handoff

**Status:** implementation-ready  
**Primary output:** `index.html` in the repository root  
**Implementation mode:** frontend vertical slice with a deterministic demo adapter  
**Brand:** EasyEV AI  
**Team:** Team CodeHackers  
**Hackathon track:** Adaptive AI Sales and Negotiation Agent

---

## 0. Instructions to the implementing agent

You are implementing this specification, not reopening product strategy. Make reasonable visual decisions only where this document is silent. Do not reduce the result to a generic chatbot, a vehicle-listing grid, or a static landing page.

Build one standalone `index.html` with all CSS and JavaScript inline. Do not add frameworks, a build step, a package manager, or additional source files for this milestone. A Google Fonts stylesheet is allowed. Use inline SVG and CSS-created visuals; do not hotlink the Quantum reference video or copy its brand assets.

The finished artifact must:

1. Immediately position EasyEV as an EV discovery and action platform for all major Indian consumer categories: electric cars, scooters and 3-wheelers.
2. Make a live AI consultation the primary conversion action.
3. Open a beautiful Google Meet-like AI consultation room from the landing page.
4. Demonstrate interruption, memory, dynamic presentation and a concrete next action through deterministic frontend interactions.
5. Be honest: this milestone is a demo-mode frontend. Do not claim that the simulated transcript or tools are already connected to Agora.
6. Be structured so the demo adapter can later be replaced with Agora RTC, RTM and Conversational AI without redesigning the interface.

Before finishing, test the page at 1440×900, 1280×800, 768×1024 and 390×844. Verify every control described in the acceptance checklist. There must be no console errors and no horizontal scrolling.

---

## 1. Product decision

### Product category

EasyEV is **India's AI-guided EV discovery and action platform**.

It is not positioned to consumers as a sales negotiator. The buyer-facing promise is impartial-seeming decision support: EasyEV helps people understand trade-offs, compare choices and take a verified next step. The business-facing engine can still qualify leads, handle objections and progress a sale for the hackathon track.

### Primary promise

> From the first question to a test drive, EasyEV makes choosing an EV easier to understand and easier to act on.

### Who it serves

- Family and personal electric-car buyers
- Electric-scooter commuters
- Auto-rickshaw and electric 3-wheeler buyers
- Buyers who do not yet know which category fits their usage
- Dealers and marketplaces receiving qualified, context-rich leads

### The differentiator that must be visible

EasyEV is not just a voice bot attached to a catalog. The visible moat is a connected loop:

```text
Natural conversation
        ↓
Persistent Buyer Decision Passport
        ↓
AI-controlled visual Deal Room
        ↓
Evidence, comparison and what-if tools
        ↓
Booking, follow-up or contextual human handoff
```

The first MVP proves this interaction model even though its content is deterministic.

---

## 2. Why this milestone is intentionally a standalone prototype

This is the fastest way to validate brand positioning, interaction design and the judge demo without consuming Conversational AI trial minutes during frontend iteration.

MVP 0 includes:

- Conversion-focused landing screen
- Pre-call category and language setup
- Google Meet-like AI consultation room
- AI listening/thinking/speaking visual states
- Interactive smart presentation stage
- Visible Buyer Decision Passport
- Transcript, interruption and booking demonstration
- Outcome summary after the call

MVP 0 does not include:

- Real Agora connection
- Real speech recognition or text-to-speech
- Real web search
- Real price, finance, insurance or range claims
- Real calendar, CRM or WhatsApp writes
- Photorealistic avatar
- WebXR or real 3D vehicle assets

Never place Agora credentials, provider keys or server secrets in this standalone file. Real integration requires a server/token endpoint and is defined later in this handoff.

---

## 3. Visual direction

### Reference translation

Use the supplied Quantum Lucid reference only for these high-level qualities:

- Restrained white hero with excellent typography
- Compact black pill navigation
- A strong two-line headline
- One primary conversion button
- Full-width motion band in the lower part of the first screen
- A premium product experience floating on the motion band
- Precise spacing and calm entrance motion

Do not recreate the Quantum brand, copy its wording, use its exact card, or reuse its third-party CloudFront video. EasyEV needs an original EV identity.

### EasyEV art direction

The page should feel like **clean mobility intelligence**, not a cyberpunk gaming site.

- Background: warm white
- Ink: near-black with a subtle green undertone
- Accent: electric neon green used sparingly
- Motion band: dark forest-to-electric-green energy field
- Product surfaces: white, graphite and pale mint
- Corners: confident and rounded, not excessively bubbly
- Shadows: broad and soft, with a controlled green glow only around active AI elements
- Imagery: abstract road lanes, energy flow, charge pulses and simple vehicle silhouettes
- Avoid: blue gradients, excessive glassmorphism, floating 3D blobs, random AI sparkles, stock photos, cryptocurrency styling and a wall of feature cards

### Required design tokens

Use Figtree variable font from Google Fonts, weights 100–900.

```css
:root {
  --font-sans: 'Figtree', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;

  --ink: #07110b;
  --ink-2: #162019;
  --muted: #647067;
  --muted-2: #8d9990;
  --paper: #fbfdfb;
  --white: #ffffff;
  --panel: #f3f8f4;
  --line: #dce7df;
  --line-dark: rgba(255,255,255,.14);

  --green: #55f27b;
  --green-bright: #83ff9d;
  --green-deep: #16bf53;
  --mint: #dfffe7;
  --forest: #071c10;
  --forest-2: #0d351b;
  --amber: #ffbf47;
  --danger: #ff6b6b;

  --shadow-card: 0 30px 90px rgba(4, 35, 15, .22);
  --shadow-soft: 0 14px 40px rgba(4, 24, 12, .10);
  --glow: 0 0 42px rgba(85, 242, 123, .28);

  --radius-pill: 999px;
  --radius-xl: 28px;
  --radius-lg: 20px;
  --radius-md: 14px;

  --ease-out: cubic-bezier(.22, 1, .36, 1);
  --ease-settle: cubic-bezier(.16, 1, .3, 1);
}
```

Desktop typography targets:

- Hero headline: `clamp(54px, 5.25vw, 78px)`, weight 470–520, line-height .98, letter-spacing about `-.055em`
- Hero copy: `17px`, weight 430, line-height 1.45
- Navigation and buttons: `14–15px`, weight 560
- Room title: `18px`, weight 620
- Panel labels: `11–12px`, uppercase, tracked
- Body UI: `13–15px`

### Motion band

Create an original CSS-only animated EV energy field. Use layered radial/linear gradients and two pseudo-elements:

- one slowly moving charge glow;
- one road/charging-grid pattern made with repeating linear gradients.

The movement should be slow and premium. No rapid pulsing. Disable it under `prefers-reduced-motion: reduce`.

The floating product mockup on this band is not a generic analytics card. It must visibly be the EasyEV Live consultation room.

---

## 4. Exact landing-page content

### Page title and metadata

```html
<html lang="en">
<title>EasyEV AI — Your easiest way to choose an EV</title>
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="description" content="Compare electric cars, scooters and 3-wheelers with a multilingual AI EV guide, then take the next verified step.">
```

### Navigation

Left:

- Original inline EasyEV symbol: a simplified `E` formed by a road/charging path
- Wordmark: `EasyEV` with a small luminous `AI` capsule

Center links:

- `How it works`
- `Explore EVs`
- `For dealers`

Right CTA:

- `Talk to EasyEV`

The nav is a centered black/forest pill on desktop. On mobile, retain the pill and use an accessible menu button. Do not stretch it edge to edge.

### Hero copy — use exactly

Eyebrow:

> INDIA'S AI EV MARKETPLACE

Headline with an intentional desktop line break:

> Every EV choice,  
> made easier.

Subcopy:

> Compare electric cars, scooters and 3-wheelers with a multilingual AI guide that explains range, charging, finance and real ownership—then helps you take the next step.

Primary CTA:

> Start a live AI consultation

Secondary text link:

> See how the live room works

Category proof line:

> CARS · SCOOTERS · 3-WHEELERS · CHARGING · FINANCE

Do not use claims such as “every EV in India,” “best price guaranteed,” “unbiased,” “verified live prices,” or “instant loan approval.”

### Hero behavior

- Clicking either main nav CTA or the primary hero CTA opens the pre-call setup sheet.
- Clicking the secondary link scrolls/focuses the floating room mockup and briefly animates its border.
- The room mockup contains enough live-looking content to explain the product before the visitor starts.
- At desktop widths, the hero and upper portion of the room mockup should fit in the first viewport.

---

## 5. Application views and state machine

Keep all views in one document and switch them with classes/`hidden`; do not navigate or reload.

```text
LANDING
   ↓ Start consultation
PREJOIN
   ↓ Join demo room
ROOM_CONNECTING
   ↓ 700–1000 ms deterministic transition
ROOM_LIVE
   ↓ End call / complete booking
OUTCOME
   ↓ Back to home / reopen room
LANDING
```

Required top-level sections:

```html
<main id="app">
  <section id="landing-view">...</section>
  <section id="prejoin-view" hidden>...</section>
  <section id="room-view" hidden>...</section>
  <section id="outcome-view" hidden>...</section>
</main>
```

Use a single state object as the source of truth:

```js
const state = {
  view: 'landing',
  callStatus: 'idle', // idle | connecting | live | ended
  agentMode: 'idle',  // idle | listening | thinking | speaking | interrupted
  muted: false,
  cameraEnabled: false,
  language: 'Hinglish',
  category: 'Not sure',
  elapsedSeconds: 0,
  stage: { type: 'welcome', payload: {} },
  profile: {
    category: 'Not selected',
    useCase: 'Discovering',
    dailyDistance: 'Not shared',
    budget: 'Not shared',
    charging: 'Not shared',
    priority: 'Not shared'
  },
  transcript: [],
  actions: [],
  activeTurnId: 0
};
```

Required functions:

```text
setView(view)
renderApp()
openPrejoin()
joinDemoRoom()
leaveRoom()
setAgentMode(mode)
appendTranscript(speaker, text, meta)
patchProfile(partialProfile)
showStage(type, payload)
runDemoTurn(turnName)
interruptAgent(nextTurnName)
completeBooking()
clearActiveTurn()
formatElapsedTime(seconds)
```

Use a timer registry or `AbortController` pattern so interruption reliably cancels the pending simulated agent response. Increment `activeTurnId` for every new turn and ignore callbacks belonging to an older turn.

---

## 6. Pre-call setup

The pre-call view is a centered modal/sheet over a dimmed version of the landing page.

Heading:

> Start your EasyEV consultation

Supporting copy:

> Choose what you are exploring. You can change your mind during the conversation.

### Vehicle-category selector

Four large selectable tiles, each with an original inline SVG outline:

- `Electric car`
- `Electric scooter`
- `Electric 3-wheeler`
- `I'm not sure`

Default: `I'm not sure`.

### Language selector

Segmented control:

- `English`
- `हिंदी`
- `Hinglish`

Default: `Hinglish`.

### Camera preview

- Show a compact dark preview tile with the user's initials/neutral silhouette by default.
- Button: `Enable camera preview`.
- Only call `navigator.mediaDevices.getUserMedia({ video: true, audio: false })` from that explicit click.
- If allowed, attach the stream to the preview and later reuse it in the room self-view.
- If denied or unavailable, display a friendly inline fallback and continue without blocking.
- Stop local tracks when leaving the room or returning home.

Primary button:

> Join demo consultation

Footnote:

> Demo mode uses illustrative vehicle content. Current prices and specifications must be verified before purchase.

---

## 7. EasyEV Live consultation room

### Overall composition

This must feel like a premium call room, not a dashboard page.

Desktop:

- Full-viewport graphite/forest background
- Compact top bar
- Main content uses about 72% width
- Context sidebar uses about 28% width
- Smart stage is the dominant surface
- AI and customer video tiles sit above or partially overlap the stage
- Floating bottom call controls

Mobile:

- AI/customer tiles become a horizontal compact row
- Smart stage occupies the next block
- Sidebar becomes tabs: `Passport`, `Transcript`, `Actions`
- Controls remain sticky at the bottom

### Top bar

Left:

- EasyEV logo
- `EasyEV Live`
- green live dot
- elapsed time

Center:

- `AI EV consultation`

Right:

- selected language chip
- `Demo mode` chip, visually subtle but always visible

### Participant tiles

#### AI tile

Label: `EasyEV AI Guide`

Build an original CSS AI presence:

- dark circular core;
- two or three luminous green rings;
- soft waveform or radial bars;
- state label below the orb.

States:

- Listening: rings expand slowly, microphone glyph active
- Thinking: orbiting dot, label `Checking the best next view…`
- Speaking: waveform moves and border glows
- Interrupted: animation stops quickly and label changes to `Listening to you`

Do not use a human stock avatar.

#### Customer tile

Label: `You`

- Reuse camera stream if enabled.
- Otherwise show a tasteful initials/silhouette tile.
- Mirror local camera with CSS.
- Show muted/camera-off indicators.

### Smart stage

The stage is an AI-controlled visual surface. Its header contains:

- current stage title;
- source/status badge;
- expand control;
- a subtle `Presented by EasyEV AI` label.

Required stage types:

1. `welcome`
2. `category-map`
3. `comparison`
4. `charging-demo`
5. `ownership-cost`
6. `booking`

#### Welcome stage

Title:

> Let's find what fits your life

Show three category cards with inline SVG silhouettes for car, scooter and 3-wheeler. Include the line:

> The recommendation changes as your requirements change.

#### Category map stage

Show the three categories on a horizontal decision path. Highlight the category selected in prejoin. If `Not sure`, show all three equally and state that the AI is still qualifying.

#### Comparison stage

Use three polished illustrative option cards, one per relevant category or all from the selected category. Each card displays decision dimensions rather than unsafe current numeric claims:

- `Family fit`
- `Daily-distance fit`
- `Charging fit`
- `Upfront-cost band`
- `Best for`

Use fictional neutral option labels such as `City Compact`, `Family Tourer`, and `Utility Pro`, or mark real models as `illustrative demo data`. Do not hardcode current ex-showroom prices, subsidies, insurance prices or claimed range as verified facts.

Add a small visible note:

> Illustrative comparison. Live catalog sources will be connected in the Agora integration milestone.

#### Charging demo stage

Create a CSS/SVG animated explainer, not a remote video. Show:

- home socket/wallbox;
- vehicle battery;
- moving charge line;
- three questions the buyer should verify: parking access, sanctioned load, installation feasibility.

Include a play/pause control and progress bar so it demonstrates how a future retrieved video would behave.

#### Ownership-cost stage

Show a simple interactive calculator with three sliders/inputs:

- daily kilometres;
- electricity cost per unit;
- expected ownership years.

Results should be explicitly labelled `illustrative estimate`. Use deterministic formulas and show assumptions. Do not compare against petrol using an unlabelled or unexplained fixed price.

#### Booking stage

Show three illustrative time slots and a dealership/demo choice. Clicking a slot selects it but does not create an external event. Button:

> Confirm demo booking

When clicked, call `completeBooking()` and label the result:

> Demo booking saved locally

Never say that a Google Calendar event, dealer booking or WhatsApp message was actually sent in MVP 0.

### Context sidebar

Three tabs:

#### Buyer Passport

Heading:

> Buyer Decision Passport

Show the six `state.profile` fields. Every update should animate only the changed value and show a small `Updated from conversation` label. This is the most important differentiator, so it should remain visible on desktop.

#### Transcript

- Speaker labels: `You` and `EasyEV AI`
- Timestamp on each turn
- Current partial/active turn can use lower opacity
- Auto-scroll within the transcript container only
- `aria-live="polite"`

#### Actions

Show a timeline:

- `Requirements captured`
- `Comparison prepared`
- `Charging questions identified`
- `Demo slot selected`
- future items appear as pending

### Bottom controls

Required controls with tooltips and accessible labels:

- Toggle microphone
- Toggle camera
- `Interrupt AI` — only prominent while the agent is speaking
- Open text prompt
- End call

The microphone control in MVP 0 changes UI state only; it does not record or transmit audio. The text-prompt drawer is the deterministic way to drive demo turns.

### Prompt chips

Show these four chips above the bottom controls or in the text drawer:

- `Compare options for my usage`
- `Show how home charging works`
- `Estimate ownership cost`
- `Book a test drive`

Each triggers the corresponding scripted turn below.

---

## 8. Deterministic demo conversation

Do not call an LLM. The demo must always work offline after the font is loaded.

### Room greeting

After joining, use this sequence:

1. `connecting` for 700–1000 ms.
2. AI enters `speaking`.
3. Append:

> Namaste! I'm your EasyEV guide. I can help you compare cars, scooters and 3-wheelers around how you actually travel—not just a brochure. What are you trying to solve?

4. After the simulated utterance duration, enter `listening`.

Use the selected category and language only as visible context. It is acceptable for the fixed transcript to remain Hinglish-friendly English for MVP 0; do not pretend it is translated dynamically.

### Turn: compare

Append user text:

> I travel about 70 km daily and need something comfortable for my family. Compare the options.

Immediately patch:

```js
{
  useCase: 'Family + daily commute',
  dailyDistance: '70 km/day',
  priority: 'Comfort and running cost'
}
```

Agent thinking: about 650 ms. Then show `comparison` and speak:

> I have updated your Decision Passport. For 70 kilometres a day, I would compare real-world range margin, home-charging access and family comfort before price. I am showing three fit profiles rather than pushing one model.

### Interruption demonstration

While the comparison response is in `speaking`, show a small suggested interruption:

> Try interrupting: “Wait—charging is not available at home.”

Clicking it or the `Interrupt AI` control must:

1. Cancel the active speaking timer immediately.
2. Set `agentMode = 'interrupted'`, then `thinking`.
3. Append user text:

> Wait—charging is not available at home.

4. Patch:

```js
{ charging: 'No dedicated home charging' }
```

5. After about 500 ms, show `charging-demo` and speak:

> That changes the recommendation. I will not assume home charging. Let's check workplace and nearby public charging, and I will show the installation questions in case your parking situation changes.

This interaction is the judge-visible proof that the conversation is not a fixed linear form.

### Turn: charging

If launched directly from the prompt chip, show `charging-demo`, patch `charging: 'Needs assessment'`, and speak:

> Home charging depends on parking access, electrical load and installation feasibility. I am showing the three checks you should confirm before choosing a vehicle around charging convenience.

### Turn: ownership cost

Show `ownership-cost`, patch `priority: 'Total ownership cost'`, and speak:

> I have opened an illustrative cost model. Change the assumptions and the estimate will update. In the live version, current tariffs, finance and vehicle data will carry their source and date.

### Turn: booking

Show `booking` and speak:

> You can choose a demo type and time. This prototype saves the selection locally; the integrated version will create the calendar or dealer workflow only after confirmation.

### Text prompt mapping

The user can type into a text input. Use keyword matching:

- contains `compare`, `option`, `which` → compare turn
- contains `charge`, `charging`, `battery` → charging turn
- contains `cost`, `price`, `emi`, `finance` → ownership-cost turn
- contains `book`, `test drive`, `demo`, `meeting` → booking turn
- anything else → append user text and respond:

> I have noted that. In this first prototype, try comparison, charging, ownership cost or booking to see the full EasyEV journey.

Sanitize by assigning user text with `textContent`; never inject typed input through `innerHTML`.

---

## 9. Outcome screen

Ending the call opens an outcome view rather than dropping back to the homepage.

Heading:

> Your EV decision journey is ready

Subcopy:

> EasyEV has preserved what changed during the conversation and the next action you selected.

Show:

- Decision Passport summary
- Consultation duration
- Last visual explored
- Selected demo slot, if any
- Completed and pending action timeline

Primary button:

> Return to EasyEV

Secondary button:

> Reopen demo room

Add this honest status card:

> MVP status: consultation logic and actions are simulated locally. Agora voice, verified catalog retrieval and real workflow integrations are the next milestone.

---

## 10. Component and DOM blueprint

Use semantic HTML. A suggested structure follows; exact class names may differ, IDs for top-level views must remain stable.

```text
#app
├── #landing-view
│   ├── .site-nav
│   ├── .hero
│   │   ├── .hero__eyebrow
│   │   ├── .hero__title
│   │   ├── .hero__copy
│   │   ├── .hero__actions
│   │   └── .hero__categories
│   └── .energy-band
│       └── .room-preview
├── #prejoin-view
│   └── .prejoin-sheet
│       ├── .category-selector
│       ├── .language-selector
│       ├── .camera-preview
│       └── .prejoin-actions
├── #room-view
│   ├── .room-topbar
│   ├── .room-layout
│   │   ├── .room-main
│   │   │   ├── .participant-strip
│   │   │   └── .smart-stage
│   │   └── .context-sidebar
│   ├── .prompt-drawer
│   └── .call-controls
└── #outcome-view
    └── .outcome-card
```

Do not produce a separate marketing site below the hero in MVP 0. The interactive room is the product proof.

---

## 11. Entrance and interaction motion

On first load, run once:

- nav drops/fades in;
- eyebrow fades in;
- headline reveals by clipped upward motion;
- copy and buttons rise gently;
- energy band is already present and does not flash;
- room preview rises into the band last.

Keep the full sequence under 1.4 seconds. Use independent `translate` where possible so animations do not overwrite layout transforms.

Room transitions:

- stage content cross-fades and moves 8–12 px;
- profile updates flash pale mint for about 800 ms;
- AI interruption stops the speaking animation within 150 ms;
- opening/closing prejoin respects focus management.

Under reduced motion:

- remove entrance and looping animations;
- retain state changes using color and labels;
- no auto-scrolling that moves the entire page.

---

## 12. Accessibility and safety requirements

- All controls are real `<button>` or `<a>` elements.
- Every icon-only control has `aria-label` and a visible tooltip on hover/focus.
- Keyboard focus rings use electric green with sufficient contrast.
- Escape closes the mobile nav, prejoin sheet or text-prompt drawer in that order.
- Opening the prejoin sheet moves focus to its heading/first selector; closing returns focus to the trigger.
- Use `aria-live="polite"` for agent state and transcript updates.
- Use `aria-pressed` for mic, camera, category and language controls where appropriate.
- Do not rely on green alone to communicate live/completed state; include text or icons.
- Never autoplay audio.
- Camera access occurs only after the explicit preview button.
- Typed text is never inserted as HTML.
- No external action is implied as complete unless it truly occurred.

---

## 13. Responsive rules

### Desktop: 940 px and above

- One-screen landing composition.
- Navigation width capped around 900 px.
- Hero text centered, maximum copy width around 720 px.
- Energy band begins around 54–58% of viewport height.
- Room preview width `min(940px, calc(100vw - 80px))`.
- Allow the lower part of the preview to be cropped by the viewport on the landing view; this is intentional.

### Tablet: 640–939 px

- Hero remains centered.
- Navigation uses mobile menu.
- Room preview remains wide but its internal sidebar may collapse to a narrow decision strip.
- In the actual room, sidebar becomes bottom tabs if needed.

### Mobile: below 640 px

- Allow vertical scrolling on landing; do not compress text until illegible.
- Release the authored headline line break and balance naturally.
- Primary and secondary CTA stack.
- Energy band has at least 420 px height.
- Room preview becomes a simplified vertical mockup.
- Actual room is scroll-contained above sticky call controls.
- Touch targets are at least 44×44 px.

### Short landscape screens

- Permit vertical scroll.
- Do not hide call controls.
- Avoid fixed-height content that clips the prompt drawer.

---

## 14. Real Agora integration boundary for MVP 1

The UI state and stage events created now must map cleanly to a real integration later.

### Stable event envelope

Use this internal shape even in demo mode:

```js
{
  id: crypto.randomUUID?.() || String(Date.now()),
  type: 'STAGE_SHOW',
  timestamp: Date.now(),
  payload: {}
}
```

Supported future event types:

```text
AGENT_STATE
TRANSCRIPT_ADD
PROFILE_PATCH
STAGE_SHOW
ACTION_STARTED
ACTION_COMPLETED
HUMAN_HANDOFF_REQUESTED
SESSION_ENDED
```

### Adapter interface

Keep UI logic separate from the deterministic sequence. Define a small object such as:

```js
const demoAdapter = {
  async join(context) {},
  async leave() {},
  async sendText(text) {},
  interrupt() {},
  onEvent(handler) {}
};
```

All UI changes caused by the agent should flow through `onEvent`. For MVP 0 the adapter emits local timed events. MVP 1 will replace it with:

- Agora RTC for participant audio/video
- Agora Conversational AI for the voice agent
- Agora RTM/signaling for transcript, agent state, Buyer Passport patches and smart-stage commands
- MCP tools for comparisons, calculators and booking workflows
- A server endpoint for tokens and agent lifecycle

### Smart-stage payloads

Design stage rendering around structured payloads rather than model-generated HTML:

```js
{
  type: 'STAGE_SHOW',
  payload: {
    stageType: 'comparison',
    title: 'Options for 70 km daily family use',
    sourceStatus: 'illustrative',
    data: { options: [] }
  }
}
```

The future LLM/tool layer may choose a stage type and provide validated data, but the browser owns rendering. Never allow an LLM response to inject arbitrary HTML or JavaScript.

### Secrets and lifecycle

When MVP 1 begins:

- migrate to a server-backed application such as Next.js plus FastAPI;
- mint Agora tokens server-side;
- start and stop the agent server-side;
- never expose provider secrets to the browser;
- enforce a server TTL so abandoned agents stop automatically;
- stop the agent when the final participant leaves;
- retain a manual kill control for rehearsals.

### Free-trial protection

- Keep this deterministic demo mode available permanently.
- Make real-agent mode an explicit switch, not the default during UI work.
- Cap rehearsals at five minutes.
- Display elapsed time.
- Reserve at least 60–90 Conversational AI minutes for final testing and judging.
- Confirm agent termination from the server rather than relying only on `beforeunload`.

### Official implementation references

- Agora start guide: <https://docs.agora.io/en/introduction/start-with-ai>
- Conversational AI quickstart: <https://docs.agora.io/en/ai/get-started/quickstart>
- Official Next.js quickstart: <https://github.com/AgoraIO-Conversational-AI/agent-quickstart-nextjs>
- Vision agent recipe: <https://github.com/AgoraIO-Conversational-AI/recipe-agent-vision>
- MCP tools recipe: <https://recipes.agora.io/recipes/mcp-tools>
- Interruption documentation: <https://docs.agora.io/en/ai/build/shape-the-conversation/interrupt-agent>
- Agent handoff recipe: <https://recipes.agora.io/recipes/agent-handoff>

---

## 15. WebXR and advanced AI direction — not part of MVP 0

WebXR can strengthen the EV journey later only when it solves a visible buyer problem. Do not add a WebXR badge with no working experience.

Recommended future experience:

> `Parking Fit`: the buyer opens their phone camera and places a correctly scaled 3D vehicle footprint or model in the parking space. EasyEV explains clearance, charging-cable reach and questions to verify with the property/electrician.

Potential implementation:

- `<model-viewer>` or Three.js/WebXR for supported devices;
- GLB models optimized for mobile;
- non-AR 3D fallback;
- explicit measurement disclaimer;
- camera/vision context passed to the agent only with consent.

Do not claim that camera vision can safely certify electrical installation, parking legality, physical clearance or vehicle fit. It can guide questions and visual exploration; final measurements and electrical work require verification.

Other future AI capabilities:

- camera-aware sales consultation;
- source-backed live research cards;
- cross-session Decision Passport;
- specialist handoff for financing/charging/insurance;
- human dealer joining the same room with an AI-generated context brief;
- post-call follow-up and calendar workflow after user confirmation.

---

## 16. Acceptance checklist

### Positioning

- [ ] The first viewport says EasyEV covers cars, scooters and 3-wheelers.
- [ ] Live AI consultation is the primary CTA.
- [ ] The product reads as an aggregator/decision platform, not an EV manufacturer.
- [ ] The consumer message emphasizes clarity and action, not aggressive selling.

### Visual quality

- [ ] Original white + graphite + neon-green design; no blue theme.
- [ ] Black/forest pill navigation.
- [ ] Premium two-line headline and disciplined spacing.
- [ ] Original animated energy band; no copied/hotlinked Quantum media.
- [ ] Floating product proof is visibly an AI video-call room.
- [ ] No generic stock photography or excessive glass cards.
- [ ] Entrance motion is under 1.4 seconds and reduced-motion safe.

### Functionality

- [ ] All CTA buttons work.
- [ ] Mobile navigation opens, closes on outside click/Escape and restores focus.
- [ ] Prejoin category and language selections update state.
- [ ] Camera preview requests permission only after its button is clicked.
- [ ] Room connects and starts deterministic greeting.
- [ ] All four prompt chips change transcript, stage and Passport.
- [ ] Interruption cancels the current simulated response and changes direction.
- [ ] Ownership-cost inputs update a labelled illustrative result.
- [ ] Booking selection saves locally and does not claim an external write.
- [ ] End call opens the outcome summary.
- [ ] Reopen and return-home paths work.
- [ ] Local camera tracks stop when no longer needed.

### Engineering

- [ ] Only one new implementation file: `index.html`.
- [ ] No framework/build dependency.
- [ ] No credentials or API keys.
- [ ] No untrusted user text inserted via `innerHTML`.
- [ ] Agent-timed events cannot update the UI after interruption or leaving.
- [ ] No console errors.
- [ ] No horizontal scrolling at required viewports.
- [ ] Keyboard navigation and focus indicators work.
- [ ] Page remains usable with animations disabled.

### Verification evidence to provide on completion

The implementing agent's final handoff must include:

1. Absolute path to `index.html`.
2. Brief list of implemented interactions.
3. Viewports tested.
4. Any limitations still present.
5. Confirmation that there are no embedded credentials and that all external actions are simulated.
6. Desktop and mobile screenshots if the environment supports them.

---

## 17. Demo script for the team

Use this exact 75–90 second walkthrough after the implementation passes QA:

1. **Positioning:** “EasyEV is an AI EV marketplace for cars, scooters and 3-wheelers. Instead of opening dozens of tabs, the buyer starts a live consultation.”
2. Click **Start a live AI consultation**.
3. Select `Electric car` and `Hinglish`; join.
4. Let the AI greeting finish and point out the Decision Passport.
5. Click **Compare options for my usage**.
6. While the AI is speaking, click the suggested interruption about unavailable home charging.
7. Point out that the response stops, the Passport changes and the smart stage switches from a comparison to charging guidance.
8. Open **Estimate ownership cost** and change a slider.
9. Click **Book a test drive**, select a slot and confirm locally.
10. End the call and show the preserved outcome and pending actions.
11. State honestly: “This first frontend milestone proves the interaction contract. Agora RTC, Conversational AI, vision, MCP tools and real booking are the next vertical slice.”

---

## 18. Definition of done

This task is done only when a user can open `index.html`, understand EasyEV within five seconds, start a demo consultation, interrupt the simulated AI, watch the visual stage and Buyer Passport adapt, complete a local booking selection, end the call and see a coherent outcome—on both desktop and mobile, without errors or credentials.

