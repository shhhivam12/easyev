import fs from "node:fs/promises";
import path from "node:path";
import { Presentation, PresentationFile } from "@oai/artifact-tool";

const W = 1280;
const H = 720;
const C = {
  bg: "#F8F9FF",
  white: "#FFFFFF",
  navy: "#07143D",
  text: "#1D2948",
  muted: "#5F6B85",
  cyan: "#08B8EA",
  blue: "#168BFF",
  blue2: "#426BFF",
  lavender: "#EEEFFF",
  lavender2: "#E3E3FF",
  border: "#D8DCF2",
  orange: "#E17A00",
  orangeBg: "#FFF7EA",
  green: "#17A673",
  greenBg: "#EAFBF5",
};

const OUT = "C:/Users/mahen/.codex/visualizations/2026/08/29/01a04c6e-cd03-7fe3-8088-3485ae459f0a/easyev-deck/output";
const BUILD = "C:/Users/mahen/.codex/visualizations/2026/08/29/01a04c6e-cd03-7fe3-8088-3485ae459f0a/easyev-deck/rendered";

async function writeBlob(filePath, blob) {
  await fs.writeFile(filePath, new Uint8Array(await blob.arrayBuffer()));
}

function addText(slide, text, x, y, w, h, opts = {}) {
  const box = slide.shapes.add({
    geometry: "textbox",
    name: opts.name,
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  box.text = text;
  box.text.style = {
    fontSize: opts.size ?? 22,
    bold: opts.bold ?? false,
    color: opts.color ?? C.text,
    alignment: opts.align ?? "left",
    verticalAlignment: opts.valign ?? "top",
    typeface: opts.font ?? "Aptos",
    autoFit: "shrinkText",
    insets: opts.insets ?? { top: 0, right: 0, bottom: 0, left: 0 },
  };
  return box;
}

function addBox(slide, x, y, w, h, opts = {}) {
  return slide.shapes.add({
    geometry: opts.geometry ?? "roundRect",
    name: opts.name,
    position: { left: x, top: y, width: w, height: h },
    fill: opts.fill ?? C.white,
    line: { style: "solid", fill: opts.line ?? C.border, width: opts.lineWidth ?? 1 },
    borderRadius: opts.radius ?? "rounded-xl",
    shadow: opts.shadow ?? "shadow-none",
  });
}

function addCircle(slide, x, y, d, fill, line = fill, width = 1) {
  return slide.shapes.add({
    geometry: "ellipse",
    position: { left: x, top: y, width: d, height: d },
    fill,
    line: { style: "solid", fill: line, width },
  });
}

function addPill(slide, text, x, y, w, fill = C.lavender, color = C.blue) {
  addBox(slide, x, y, w, 28, { fill, line: fill, radius: "rounded-full" });
  addText(slide, text, x + 10, y + 5, w - 20, 18, { size: 12, bold: true, color, align: "center", valign: "mid" });
}

function addOrb(slide, x = 1060, y = 72, s = 150) {
  addCircle(slide, x, y, s, "#F1EBFF", "#D7DBFF", 1);
  addCircle(slide, x + s * 0.18, y + s * 0.12, s * 0.68, "#E5F5FF", "#E5F5FF", 0);
  addCircle(slide, x + s * 0.42, y + s * 0.35, s * 0.44, "#FDEEFF", "#FDEEFF", 0);
  const ring = slide.shapes.add({
    geometry: "ellipse",
    position: { left: x + s * 0.12, top: y + s * 0.26, width: s * 0.78, height: s * 0.43, rotation: -16 },
    fill: "none",
    line: { style: "solid", fill: "#FFFFFF", width: 7 },
  });
  ring.bringToFront();
}

function addChrome(slide, opts = {}) {
  slide.background.fill = C.bg;
  // faint background accents inspired by the submitted deck
  addCircle(slide, 0, 592, 128, "#F4F4FF", "#F4F4FF", 0);
  if (opts.orb !== false) addOrb(slide, opts.orbX ?? 1100, opts.orbY ?? 62, opts.orbS ?? 105);
  addText(slide, "agora", 28, 18, 165, 46, { size: 38, bold: true, color: C.cyan, font: "Arial Rounded MT Bold", valign: "mid" });
  addText(slide, "HACKATHON 2026", 1000, 28, 240, 20, { size: 12, bold: true, color: C.navy, align: "right", valign: "mid" });
}

function addFooter(slide) {
  addText(slide, "Echo", 30, 659, 73, 38, { size: 28, bold: true, color: C.navy });
  addText(slide, "Sphere", 96, 659, 98, 38, { size: 28, bold: true, color: C.blue });
  addText(slide, "POWERED BY", 1015, 671, 91, 18, { size: 11, color: C.text, align: "right" });
  addText(slide, "KNOTIC", 1115, 667, 118, 24, { size: 17, bold: true, color: C.blue, align: "right" });
}

function addHeading(slide, eyebrow, title, subtitle = "") {
  addText(slide, eyebrow.toUpperCase(), 96, 82, 520, 24, { size: 14, bold: true, color: C.blue });
  addText(slide, title, 96, 110, 1000, 66, { size: 35, bold: true, color: C.navy });
  if (subtitle) addText(slide, subtitle, 96, 174, 1000, 36, { size: 18, color: C.muted });
}

function addBullet(slide, text, x, y, w, opts = {}) {
  addCircle(slide, x, y + 6, 9, opts.dot ?? C.blue, opts.dot ?? C.blue, 0);
  addText(slide, text, x + 20, y, w - 20, opts.h ?? 46, { size: opts.size ?? 17, color: opts.color ?? C.text, bold: opts.bold ?? false });
}

function setNotes(slide, body, sources) {
  slide.speakerNotes.textFrame.setText(`${body}\n\n[Sources]\n${sources.map(s => `- ${s}`).join("\n")}\n[/Sources]`);
  slide.speakerNotes.setVisible(true);
}

const deck = Presentation.create({ slideSize: { width: W, height: H } });

// Slide 1 — intro
{
  const s = deck.slides.add();
  addChrome(s, { orb: false });
  addOrb(s, 835, 135, 300);
  addPill(s, "ADAPTIVE AI SALES + NEGOTIATION AGENT", 100, 142, 330, C.lavender, C.blue2);
  addText(s, "EasyEV AI", 100, 200, 680, 92, { size: 58, bold: true, color: C.navy });
  addText(s, "An EV sales negotiator and education voice agent for India", 102, 305, 650, 76, { size: 26, color: C.text });
  addBox(s, 100, 420, 650, 90, { fill: C.white, line: C.border, radius: "rounded-xl", shadow: "shadow-sm" });
  addText(s, "TEAM CODEHACKERS", 124, 443, 210, 22, { size: 14, bold: true, color: C.blue });
  addText(s, "Shivam  ·  Jatin  ·  Sathvik", 124, 472, 420, 25, { size: 19, bold: true, color: C.navy });
  addText(s, "Mentor discussion with Kamal Walia", 100, 548, 600, 32, { size: 18, color: C.muted });
  addFooter(s);
  setNotes(s, "Open with the positioning: EasyEV AI is buyer education and decision confidence first, with a measurable sales outcome. Ask Kamal Walia to challenge the technical scope and proof points.", [
    "https://www.commudle.com/communities/knotic/hackathons/echosphere/tracks",
    "https://www.commudle.com/users/KamalWalia",
    "S:/Current projects/Agora Ecosphere Hackathon/PPT.pdf",
  ]);
}

// Slide 2 — idea, problem, impact
{
  const s = deck.slides.add();
  addChrome(s);
  addHeading(s, "Problem + idea + impact", "EV adoption is a decision-confidence problem", "Availability is improving; understanding real-life fit is still fragmented.");

  const painX = 96;
  const painY = 236;
  const painW = 472;
  const pains = [
    ["01", "Scattered facts", "Range, charging, service, financing and incentives live in different places."],
    ["02", "Hard to judge fit", "A buyer cannot easily translate specs into commute, payload, EMI and charging reality."],
    ["03", "Low-trust selling", "Generic claims create objections instead of a transparent path to a decision."],
  ];
  pains.forEach((p, i) => {
    const y = painY + i * 92;
    addBox(s, painX, y, painW, 78, { fill: C.white, line: C.border, radius: "rounded-lg" });
    addCircle(s, painX + 18, y + 18, 42, i === 2 ? C.orangeBg : C.lavender, i === 2 ? "#F1D3A0" : C.lavender2, 1);
    addText(s, p[0], painX + 18, y + 29, 42, 18, { size: 12, bold: true, color: i === 2 ? C.orange : C.blue, align: "center", valign: "mid" });
    addText(s, p[1], painX + 76, y + 13, 200, 24, { size: 17, bold: true, color: C.navy });
    addText(s, p[2], painX + 76, y + 38, 370, 34, { size: 14, color: C.muted });
  });

  addBox(s, 604, 236, 580, 268, { fill: C.white, line: "#C9D6FF", radius: "rounded-xl", shadow: "shadow-sm" });
  addText(s, "EASYEV AI", 632, 260, 160, 22, { size: 14, bold: true, color: C.blue });
  addText(s, "Explain → compare → simulate → negotiate", 632, 292, 500, 44, { size: 27, bold: true, color: C.navy });
  addText(s, "Multilingual voice guidance across scooters, motorcycles, cars, e-rickshaws and small fleets—ending in one verified next action.", 632, 348, 510, 68, { size: 18, color: C.text });
  const flowY = 442;
  const nodes = [
    ["CONFUSION", 632, 110],
    ["LIVE VOICE", 790, 110],
    ["VERIFIED ACTION", 948, 166],
  ];
  const flowShapes = nodes.map((n, i) => {
    const b = addBox(s, n[1], flowY, n[2], 36, { fill: i === 2 ? C.greenBg : C.lavender, line: i === 2 ? "#B4E7D5" : C.lavender2, radius: "rounded-full" });
    addText(s, n[0], n[1] + 8, flowY + 10, n[2] - 16, 16, { size: 11, bold: true, color: i === 2 ? C.green : C.blue, align: "center" });
    return b;
  });
  s.shapes.connect(flowShapes[0], flowShapes[1], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.blue, width: 2 }, tail: { type: "arrow", width: "sm", length: "sm" } });
  s.shapes.connect(flowShapes[1], flowShapes[2], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.blue, width: 2 }, tail: { type: "arrow", width: "sm", length: "sm" } });

  addBox(s, 96, 532, 1088, 79, { fill: C.navy, line: C.navy, radius: "rounded-lg" });
  addText(s, "IMPACT", 126, 551, 90, 20, { size: 13, bold: true, color: "#62C8FF" });
  addText(s, "Confident buyers + explainable choices", 218, 547, 340, 30, { size: 20, bold: true, color: C.white });
  addText(s, "BUSINESS", 644, 551, 90, 20, { size: 13, bold: true, color: "#FFC067" });
  addText(s, "Qualified leads + higher-conviction next actions", 742, 547, 400, 34, { size: 18, bold: true, color: C.white });
  addFooter(s);
  setNotes(s, "The impact pitch is explainability and education; the commercial pitch is qualification and conversion. The prototype will cover a representative EV catalog, not every vehicle in India.", [
    "https://www.commudle.com/communities/knotic/hackathons/echosphere/tracks",
    "https://www.iea.org/reports/global-ev-outlook-2026/trends-in-other-ev-modes",
    "https://niti.gov.in/sites/default/files/2023-07/ADB-EV-Financing-Report_VS_compressed.pdf",
  ]);
}

// Slide 3 — implementation and Agora
{
  const s = deck.slides.add();
  addChrome(s);
  addHeading(s, "Implementation + Agora", "Agora carries the live conversation from voice to action", "The cascade architecture keeps tool use, evidence and handoff observable.");

  const y = 242;
  const buyer = addBox(s, 74, y, 154, 154, { fill: C.white, line: C.border, radius: "rounded-xl" });
  addCircle(s, 119, y + 24, 64, C.lavender, C.lavender2, 1);
  addText(s, "VOICE", 119, y + 48, 64, 18, { size: 12, bold: true, color: C.blue, align: "center" });
  addText(s, "Buyer UI", 92, y + 101, 118, 24, { size: 18, bold: true, color: C.navy, align: "center" });
  addText(s, "Next.js · TS", 92, y + 128, 118, 18, { size: 13, color: C.muted, align: "center" });

  const agora = addBox(s, 282, y - 12, 332, 178, { fill: "#EEF8FF", line: "#85CFFF", lineWidth: 2, radius: "rounded-xl", shadow: "shadow-sm" });
  addText(s, "AGORA REAL-TIME CORE", 308, y + 8, 260, 22, { size: 14, bold: true, color: C.blue });
  addText(s, "RTC + Conversational AI", 308, y + 40, 275, 34, { size: 23, bold: true, color: C.navy });
  const agoraLines = [
    "Natural turns + interruption recovery",
    "RTM live state + transcripts/history",
    "Sarvam ASR/TTS + runtime metrics",
  ];
  agoraLines.forEach((t, i) => addBullet(s, t, 308, y + 86 + i * 25, 280, { size: 14, h: 22, dot: C.cyan }));

  const decision = addBox(s, 669, y, 250, 154, { fill: C.white, line: C.border, radius: "rounded-xl" });
  addText(s, "EASYEV DECISION LAYER", 694, y + 22, 202, 20, { size: 13, bold: true, color: C.blue2, align: "center" });
  addText(s, "Decision Graph", 694, y + 54, 202, 29, { size: 21, bold: true, color: C.navy, align: "center" });
  addText(s, "what-if calculator\nevidence + policy\nnegotiation bounds", 706, y + 89, 178, 57, { size: 14, color: C.muted, align: "center" });

  const actions = addBox(s, 974, y, 228, 154, { fill: C.orangeBg, line: "#F0C47D", radius: "rounded-xl" });
  addText(s, "TOOLS + OUTCOMES", 995, y + 22, 186, 20, { size: 13, bold: true, color: C.orange, align: "center" });
  addText(s, "FastMCP", 995, y + 54, 186, 28, { size: 21, bold: true, color: C.navy, align: "center" });
  addText(s, "catalog · finance\ncharging · booking\nCRM · human handoff", 995, y + 89, 186, 60, { size: 14, color: C.text, align: "center" });

  s.shapes.connect(buyer, agora, { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.blue, width: 3 }, tail: { type: "arrow", width: "med", length: "med" } });
  s.shapes.connect(agora, decision, { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.blue, width: 3 }, tail: { type: "arrow", width: "med", length: "med" } });
  s.shapes.connect(decision, actions, { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.orange, width: 3 }, tail: { type: "arrow", width: "med", length: "med" } });

  addBox(s, 96, 447, 1088, 128, { fill: C.white, line: C.border, radius: "rounded-xl" });
  addText(s, "PROPOSED STACK", 120, 467, 170, 20, { size: 13, bold: true, color: C.blue });
  const stack = [
    ["EXPERIENCE", "Next.js · TypeScript · React Flow"],
    ["AGENT", "FastAPI · FastMCP · Pydantic"],
    ["DATA", "Supabase/Postgres · optional Graphiti"],
    ["QUALITY", "Langfuse · Promptfoo · Presidio"],
  ];
  stack.forEach((item, i) => {
    const x = 120 + i * 262;
    addPill(s, item[0], x, 500, 104, i === 3 ? C.orangeBg : C.lavender, i === 3 ? C.orange : C.blue);
    addText(s, item[1], x, 538, 230, 28, { size: 14, color: C.text });
  });
  addBox(s, 96, 589, 1088, 34, { fill: C.navy, line: C.navy, radius: "rounded-full" });
  addText(s, "interrupt → preserve context → update decision graph → call verified tool → explain → act", 122, 598, 1036, 18, { size: 14, bold: true, color: C.white, align: "center" });
  addFooter(s);
  setNotes(s, "Agora owns the live session. EasyEV owns the domain decision logic and business workflow. The default architecture is ASR → LLM → MCP tools → TTS because it makes retrieval, metrics, and guardrails judge-visible.", [
    "https://docs.agora.io/en/ai/get-started/quickstart",
    "https://docs.agora.io/en/ai/build/shape-the-conversation/interrupt-agent",
    "https://docs.agora.io/en/ai/build/shape-the-conversation/short-term-memory",
    "https://docs.agora.io/en/ai/build/transcripts",
    "https://docs.agora.io/en/ai/models/asr/sarvam",
    "https://docs.agora.io/en/ai/models/tts/sarvam",
    "https://github.com/AgoraIO-Conversational-AI/recipe-agent-rpg",
  ]);
}

// Slide 4 — where we are now
{
  const s = deck.slides.add();
  addChrome(s);
  addHeading(s, "Current status + next build", "We have the direction; now we prove the live loop", "The first milestone is a working Agora conversation that ends in a real action.");

  addBox(s, 96, 238, 392, 310, { fill: C.white, line: C.border, radius: "rounded-xl", shadow: "shadow-sm" });
  addText(s, "WHERE WE ARE NOW", 122, 262, 210, 22, { size: 14, bold: true, color: C.blue });
  const current = [
    "EasyEV positioning and broad EV scope finalized",
    "Demo journey and trust boundaries defined",
    "Agora-first architecture and tool plan complete",
    "Submitted concept deck available as baseline",
  ];
  current.forEach((t, i) => {
    addCircle(s, 122, 296 + i * 50, 24, C.greenBg, "#B6E7D7", 1);
    addText(s, "✓", 122, 299 + i * 50, 24, 17, { size: 13, bold: true, color: C.green, align: "center" });
    addText(s, t, 158, 292 + i * 50, 292, 40, { size: 16, color: C.text });
  });
  addBox(s, 118, 500, 348, 30, { fill: C.lavender, line: C.lavender2, radius: "rounded-full" });
  addText(s, "STATUS: PLANNING COMPLETE · BUILD STARTS NOW", 130, 508, 324, 16, { size: 11, bold: true, color: C.blue2, align: "center" });

  addBox(s, 526, 238, 658, 310, { fill: C.white, line: C.border, radius: "rounded-xl" });
  addText(s, "FOUR IMPLEMENTATION CHECKPOINTS", 552, 262, 330, 22, { size: 14, bold: true, color: C.blue });
  const phases = [
    ["1", "AGORA VERTICAL SLICE", "live call · interruption · transcript"],
    ["2", "DECISION GRAPH + TOOLS", "needs update · evidence · what-if"],
    ["3", "REAL NEXT ACTION", "booking · CRM brief · human handoff"],
    ["4", "PROOF + POLISH", "Hindi/Hinglish · evals · demo rehearsal"],
  ];
  const phaseShapes = phases.map((p, i) => {
    const x = 550 + i * 151;
    const b = addBox(s, x, 314, 126, 168, { fill: i === 0 ? "#EEF8FF" : C.bg, line: i === 0 ? "#7ACBFF" : C.border, lineWidth: i === 0 ? 2 : 1, radius: "rounded-xl" });
    addCircle(s, x + 43, 329, 40, i === 0 ? C.blue : C.lavender, i === 0 ? C.blue : C.lavender2, 1);
    addText(s, p[0], x + 43, 339, 40, 18, { size: 15, bold: true, color: i === 0 ? C.white : C.blue, align: "center" });
    addText(s, p[1], x + 10, 383, 106, 38, { size: 13, bold: true, color: C.navy, align: "center" });
    addText(s, p[2], x + 12, 433, 102, 40, { size: 12, color: C.muted, align: "center" });
    return b;
  });
  for (let i = 0; i < phaseShapes.length - 1; i++) {
    s.shapes.connect(phaseShapes[i], phaseShapes[i + 1], { kind: "straight", fromSide: "right", toSide: "left", line: { style: "solid", fill: C.blue, width: 2 }, tail: { type: "arrow", width: "sm", length: "sm" } });
  }
  addText(s, "Immediate goal: one uninterrupted end-to-end call with a stored lead outcome.", 552, 503, 596, 24, { size: 14, bold: true, color: C.blue2, align: "center" });

  addBox(s, 96, 568, 1088, 61, { fill: C.orangeBg, line: "#F0C47D", radius: "rounded-lg" });
  addText(s, "MENTOR FEEDBACK TODAY", 120, 587, 210, 20, { size: 13, bold: true, color: C.orange });
  addText(s, "Scope right?  ·  Which Agora proof should go deepest?  ·  Is Decision Graph + safe learning loop distinctive enough?", 334, 584, 824, 27, { size: 16, bold: true, color: C.navy, align: "center" });
  addFooter(s);
  setNotes(s, "Be explicit that the product is in planned implementation, not already complete. Use the mentor discussion to validate scope and choose the deepest Agora proof before parallel build work expands.", [
    "S:/Current projects/Agora Ecosphere Hackathon/PPT.pdf",
    "https://docs.agora.io/en/ai/get-started/quickstart",
  ]);
}

// Slide 5 — team ownership
{
  const s = deck.slides.add();
  addChrome(s);
  addHeading(s, "Team ownership", "Three owners, one integration spine", "Each member owns a demo-visible outcome; integration happens at shared checkpoints.");

  const members = [
    {
      name: "SHIVAM",
      role: "Product, intelligence + proof",
      color: C.blue2,
      fill: "#F0F1FF",
      items: ["Conversation + qualification design", "EV evidence and Decision Graph", "Safety, evals, pitch and demo story"],
      output: "OUTPUT: trusted recommendation logic",
    },
    {
      name: "SATHVIK",
      role: "Agora + backend agent runtime",
      color: C.blue,
      fill: "#EDF8FF",
      items: ["RTC, RTM and Conversational AI", "FastAPI/FastMCP agent lifecycle", "Transcripts, CRM brief and handoff"],
      output: "OUTPUT: working live voice loop",
    },
    {
      name: "JATIN",
      role: "Frontend + customer experience",
      color: C.orange,
      fill: C.orangeBg,
      items: ["Buyer and operator Next.js UI", "React Flow live Decision Graph", "Supabase, booking UX and visual QA"],
      output: "OUTPUT: judge-visible product experience",
    },
  ];
  members.forEach((m, i) => {
    const x = 96 + i * 368;
    addBox(s, x, 238, 336, 314, { fill: C.white, line: C.border, radius: "rounded-xl", shadow: "shadow-sm" });
    addBox(s, x, 238, 336, 74, { fill: m.fill, line: m.fill, radius: "rounded-xl" });
    addText(s, m.name, x + 22, 255, 140, 24, { size: 17, bold: true, color: m.color });
    addText(s, m.role, x + 22, 281, 288, 22, { size: 14, bold: true, color: C.navy });
    m.items.forEach((t, j) => addBullet(s, t, x + 24, 337 + j * 54, 286, { size: 16, h: 42, dot: m.color }));
    addBox(s, x + 20, 505, 296, 30, { fill: m.fill, line: m.fill, radius: "rounded-full" });
    addText(s, m.output, x + 28, 514, 280, 15, { size: 11, bold: true, color: m.color, align: "center" });
  });

  addBox(s, 96, 575, 1088, 54, { fill: C.navy, line: C.navy, radius: "rounded-lg" });
  addText(s, "SHARED CHECKPOINTS", 122, 593, 190, 18, { size: 13, bold: true, color: "#62C8FF" });
  addText(s, "1  First live call", 340, 591, 180, 22, { size: 16, bold: true, color: C.white, align: "center" });
  addText(s, "2  End-to-end scenario", 570, 591, 220, 22, { size: 16, bold: true, color: C.white, align: "center" });
  addText(s, "3  Final judge rehearsal", 840, 591, 240, 22, { size: 16, bold: true, color: C.white, align: "center" });
  addFooter(s);
  setNotes(s, "This split keeps ownership clear without isolating components. Everyone joins at the three checkpoints: live audio, end-to-end outcome, and final rehearsal. Adjust names or ownership during the mentor discussion if member strengths differ.", [
    "S:/Current projects/Agora Ecosphere Hackathon/PPT.pdf",
  ]);
}

await fs.mkdir(OUT, { recursive: true });
await fs.mkdir(BUILD, { recursive: true });

for (const [index, slide] of deck.slides.items.entries()) {
  const stem = `slide-${String(index + 1).padStart(2, "0")}`;
  await writeBlob(path.join(BUILD, `${stem}.png`), await deck.export({ slide, format: "png", scale: 1.5 }));
  const layout = await slide.export({ format: "layout" });
  await fs.writeFile(path.join(BUILD, `${stem}.layout.json`), await layout.text());
}

await writeBlob(path.join(BUILD, "deck-montage.webp"), await deck.export({ format: "webp", montage: true, scale: 1 }));
const pptx = await PresentationFile.exportPptx(deck);
await pptx.save(path.join(OUT, "EasyEV_AI_Mentor_Discussion.pptx"));

const inspection = await deck.inspect({ kind: "slide,textbox,shape,notes", maxChars: 12000 });
await fs.writeFile(path.join(BUILD, "inspection.ndjson"), inspection.ndjson ?? "", "utf8");

console.log(`Created ${deck.slides.items.length} slides.`);
