/**
 * Hardcoded, template-driven debate scripts.
 *
 * This used to call an LLM to write the script and a cloud TTS API to render
 * it — both metered, both rate-limited, both capable of failing at 2am for a
 * demo. There's no reason a comparison between two vehicles whose specs are
 * already fully known needs a live model call at all: every line here is
 * built synchronously from the same spec data already in
 * explore-evs-catalog.mjs, so there is nothing to generate, nothing to
 * render, nothing to cache, and nothing that can be rate-limited or run out
 * of quota. Voice playback happens entirely in the browser via the Web
 * Speech API (see startStudioDebate in index.html) — this module only ever
 * produces text.
 */

// Rebuttal openers in the same Hinglish register as the rest of the app
// (see the AI consultation transcript style) — Roman-script Hindi function
// words mixed with English EV/spec terms, not literal Hindi translation.
const CONNECTORS = ['Sahi baat hai, lekin', 'Thik hai, par', 'Maana, lekin', 'Fir bhi', 'Chalo theek hai, lekin', 'Yeh sahi hai, par', 'Ek minute,'];

function cap(text) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function pickPro(vehicle, used) {
  const pro = vehicle.pros.find((p) => !used.has(p)) || vehicle.pros[0] || 'sabse better value for money';
  used.add(pro);
  return pro;
}

/**
 * One advocate's seven lines, one per topic, in a fixed order both sides
 * share — which is what makes the pairing below read as a real back-and-forth
 * instead of two unrelated monologues. The second advocate's lines open with
 * a connector ("Sahi baat hai, lekin...") so they read as a rebuttal to
 * whatever the first advocate just said, even though the content itself is
 * independent. Hindi carries the sentence grammar; English stays for the
 * spec terms and numbers, same code-switching pattern the rest of the app
 * already uses for Hinglish.
 */
function buildSide(vehicle, slot) {
  const used = new Set();
  const connect = slot === 'b' ? (i) => `${CONNECTORS[i % CONNECTORS.length]} ` : () => '';
  const topics = [
    `${connect(0)}${vehicle.name} sirf ₹${vehicle.priceMinLakh} lakh mein shuru hota hai, ex-showroom — ek ${vehicle.category.toLowerCase()} ke liye ekdum sahi value hai.`,
    `${connect(1)}range ki baat karein toh, ${vehicle.name} ${vehicle.claimedRangeKm} km ka claim karta hai, aur real-world mein aapko milta hai ${vehicle.realWorldRangeKm}.`,
    `${connect(2)}charging bhi fast hai — ${vehicle.charging}.`,
    `${connect(3)}engine ki baat karein toh ${vehicle.power} hai, ${vehicle.acceleration} — Indian roads ke liye kaafi dum hai.`,
    `${connect(4)}space mein bhi koi kami nahi — ${vehicle.bootSpace}, family trips ke liye perfect.`,
    `${connect(5)}${vehicle.company} isse ${vehicle.warranty} ki warranty deta hai, toh ownership cost predictable rehta hai.`,
    `${connect(6)}sabse badi baat — ${pickPro(vehicle, used)}. Isi liye ${vehicle.name} yeh round jeet leta hai.`,
  ];
  return topics.map((text) => ({ speaker: slot, text: cap(text) }));
}

/** Always exactly 14 lines: 7 topics x 2 advocates, alternating a/b. */
export function buildDebateScript({ vehicleA, vehicleB }) {
  const sideA = buildSide(vehicleA, 'a');
  const sideB = buildSide(vehicleB, 'b');
  const lines = [];
  for (let i = 0; i < sideA.length; i += 1) {
    lines.push(sideA[i]);
    lines.push(sideB[i]);
  }
  return lines;
}
