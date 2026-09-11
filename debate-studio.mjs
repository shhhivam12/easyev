/**
 * Studio debate generation.
 *
 * The live two-advocate version had to hand a turn from one Agora agent to the
 * other, and since Agora exposes no reliable "finished speaking" signal the
 * server could only estimate each turn's length and sleep — which is where the
 * 4-5s gaps came from. Here the whole debate is written once and rendered to a
 * single continuous PCM buffer, so there is no handover to be late for: the
 * gap between speakers is whatever the synthesiser put there, and nothing else.
 *
 * Voice switching is per speaker line rather than per session, which is what
 * lets one stream carry two distinct advocates. Agora's agent TTS cannot do
 * this — MicrosoftTTSOptions takes a single voiceName and AgentConfigUpdate
 * cannot change it mid-session — so synthesis happens here instead.
 */

const SAMPLE_RATE = 24000;
const BYTES_PER_SAMPLE = 2;

// Gemini's free tier allows only 3 requests per minute per model, so the Gemini
// path has to render the entire debate in ONE request; per-line synthesis would
// need 10-20 and be rate-limited instantly. Sarvam has no such cap and no
// multi-speaker mode, so it renders line by line instead. Both return the same
// shape, which is what lets the key alone decide which one runs.
export const STUDIO_VOICES = {
  a: { geminiVoice: 'Charon', sarvamSpeaker: 'aditya' },
  b: { geminiVoice: 'Puck', sarvamSpeaker: 'rahul' },
};

const SPEAKER_TAG = { a: 'Advocate1', b: 'Advocate2' };

function pcmDurationMs(byteLength) {
  return (byteLength / (SAMPLE_RATE * BYTES_PER_SAMPLE)) * 1000;
}

export function buildWav(pcm, sampleRate = SAMPLE_RATE) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * BYTES_PER_SAMPLE, 28);
  header.writeUInt16LE(BYTES_PER_SAMPLE, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

/** Sarvam hands back a WAV; everything downstream wants bare samples. */
function pcmFromWav(buffer) {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF') return buffer;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'data') return buffer.subarray(offset + 8, Math.min(offset + 8 + size, buffer.length));
    offset += 8 + size + (size % 2);
  }
  return buffer;
}

// Free-tier quota is counted per model and per day (as low as 20/day on some),
// so a single exhausted model must not end the demo. Each of these can write a
// scripted debate; the chain simply moves to the next one on a 429.
const SCRIPT_MODELS = ['gemini-3.5-flash', 'gemini-3.1-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.6-flash'];
const TTS_MODELS = ['gemini-3.1-flash-tts-preview', 'gemini-2.5-flash-preview-tts', 'gemini-2.5-pro-preview-tts'];

function geminiUrl(model, apiKey) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
}

/**
 * Walks the model chain, then — only once everything is rate limited — waits out
 * the shortest delay the API asked for and tries the chain again. A cold render
 * is two calls (script, then audio), so a second debate started too quickly
 * would otherwise fail outright instead of just being slow.
 */
async function geminiFetch(models, apiKey, init, { retryOnceAfterWait = true, maxWaitMs = 65_000 } = {}) {
  let shortestWaitMs = Infinity;
  let lastResponse = null;
  for (const model of models) {
    const response = await fetch(geminiUrl(model, apiKey), init);
    if (response.status !== 429) return { response, model };
    lastResponse = response;
    const body = await response.clone().json().catch(() => ({}));
    const delay = (body?.error?.details || []).find((d) => d.retryDelay)?.retryDelay;
    const waitMs = (Number(String(delay || '').replace(/[^0-9.]/g, '')) || 30) * 1000 + 1500;
    shortestWaitMs = Math.min(shortestWaitMs, waitMs);
    console.warn(`Gemini model ${model} is rate limited; trying the next one.`);
  }
  if (!retryOnceAfterWait) return { response: lastResponse, model: models[models.length - 1] };
  const waitMs = Math.min(maxWaitMs, shortestWaitMs);
  console.warn(`All Gemini models rate limited; waiting ${Math.round(waitMs / 1000)}s before one more attempt.`);
  await new Promise((r) => setTimeout(r, waitMs));
  return geminiFetch(models, apiKey, init, { retryOnceAfterWait: false });
}

function speakerPrompt(language) {
  if (language === 'Hindi') return 'Speak natural conversational Hindi. Fast, punchy, energetic — a live televised debate.';
  if (language === 'Hinglish') return 'Speak natural Hinglish, English for EV and spec terms. Fast, punchy, energetic — a live televised debate.';
  return 'Speak crisp Indian English. Fast, punchy, energetic — a live televised debate.';
}

export function buildScriptPrompt({ vehicleA, vehicleB, language, exchanges = 5 }) {
  const facts = (v) => `- Price: ₹${v.priceMinLakh}L – ₹${v.priceMaxLakh}L ex-showroom
- Claimed range: ${v.claimedRangeKm} km (ARAI); real-world: ${v.realWorldRangeKm}
- Battery: ${v.battery}
- Fast charging: ${v.charging}
- Power/Torque: ${v.power}
- Acceleration: 0-100 in ${v.acceleration}; top speed ${v.topSpeed}
- Boot & space: ${v.bootSpace}
- Warranty: ${v.warranty}
- Strengths: ${v.pros.join(', ')}
- Weak points: ${v.cons.join(', ')}`;

  const languageRule = language === 'Hindi'
    ? 'Write every spoken line in natural conversational Hindi (Devanagari).'
    : language === 'Hinglish'
      ? 'Write every spoken line in natural Hinglish — Devanagari for Hindi words, plain English for EV/spec terms.'
      : 'Write every spoken line in crisp, articulate Indian English.';

  return `Write a complete, fast-paced live debate between two EV advocates.

ADVOCATE 1 defends the ${vehicleA.name} by ${vehicleA.company}:
${facts(vehicleA)}

ADVOCATE 2 defends the ${vehicleB.name} by ${vehicleB.company}:
${facts(vehicleB)}

RULES:
1. Exactly ${exchanges * 2} lines, strictly alternating, starting with Advocate 1.
2. Cover these topics in order, one exchange each: price and value; real-world range and battery; fast-charging speed and network; cabin comfort, ride and boot space; running cost, warranty and resale.
3. Each line must directly rebut what the other advocate just said, then land one fresh strength of its own vehicle.
4. Each line is ONE punchy spoken sentence, under 22 words. This is rapid-fire television, not an essay.
5. Ground every claim in the verified facts above. Never invent a number.
6. Never say "Advocate", "Option 1", "Option 2", or any stage direction. Speak only the argument.
7. Write numbers as words a presenter would say aloud (for example "nine point nine nine lakh", "three hundred kilometres").
${languageRule}

OUTPUT FORMAT — return ONLY these lines, nothing else, no markdown:
A: <advocate 1 line>
B: <advocate 2 line>
A: <advocate 1 line>
B: <advocate 2 line>
(continue for all ${exchanges * 2} lines)`;
}

export function parseScript(raw, expectedLines = 10) {
  const lines = [];
  for (const rawLine of String(raw || '').split(/\r?\n/)) {
    const match = rawLine.match(/^\s*(?:\[)?\s*(A|B|Option\s*1|Option\s*2|Advocate\s*1|Advocate\s*2)\s*(?:[^:\]]*)?\]?\s*:\s*(.+)$/i);
    if (!match) continue;
    const tag = match[1].toLowerCase().replace(/\s+/g, '');
    const speaker = tag === 'a' || tag === 'option1' || tag === 'advocate1' ? 'a' : 'b';
    const text = match[2].trim().replace(/^["“”']|["“”']$/g, '').trim();
    if (text) lines.push({ speaker, text });
  }
  return lines.slice(0, expectedLines);
}

export async function generateDebateScript({ vehicleA, vehicleB, language, apiKey, model = '', exchanges = 5, signal }) {
  if (!apiKey) throw new Error('GEMINI_API_KEY is required to write the debate script.');
  const models = model ? [model, ...SCRIPT_MODELS.filter((m) => m !== model)] : SCRIPT_MODELS;
  const { response } = await geminiFetch(models, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: buildScriptPrompt({ vehicleA, vehicleB, language, exchanges }) }] }],
      // Left to itself this model spends ~3.6k tokens thinking before it
      // writes anything, which swallowed the whole budget and returned a
      // three-line debate. Capping the thinking is what makes all ten lines
      // come back — and it is a scripted format, not a reasoning problem.
      generationConfig: {
        temperature: 0.8,
        maxOutputTokens: 4096,
        thinkingConfig: { thinkingLevel: 'low' },
      },
    }),
    signal,
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`Debate script generation failed (${response.status}): ${JSON.stringify(body).slice(0, 200)}`);
  const text = (body?.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  const lines = parseScript(text, exchanges * 2);
  if (lines.length < 2) throw new Error('The model did not return a parseable debate script.');
  return lines;
}

/**
 * Split one multi-speaker render into per-line spans.
 *
 * Gemini returns the whole debate as a single opaque buffer with no timings, so
 * boundaries are estimated from how much text each line has and then snapped to
 * the quietest point nearby — speakers pause when they hand over, so the real
 * boundary is almost always the deepest silence close to the estimate. Anchoring
 * to the exact total duration keeps the error from accumulating down the track.
 */
function timelineBySilence(pcm, lines) {
  const totalMs = pcmDurationMs(pcm.length);
  const weights = lines.map((l) => Math.max(l.text.length, 1));
  const weightTotal = weights.reduce((sum, w) => sum + w, 0);

  const frameMs = 20;
  const frameSamples = Math.floor((SAMPLE_RATE * frameMs) / 1000);
  const frameCount = Math.floor(pcm.length / BYTES_PER_SAMPLE / frameSamples);
  const energy = new Float32Array(Math.max(frameCount, 1));
  for (let f = 0; f < frameCount; f += 1) {
    let sum = 0;
    const base = f * frameSamples * BYTES_PER_SAMPLE;
    for (let s = 0; s < frameSamples; s += 1) {
      const v = pcm.readInt16LE(base + s * BYTES_PER_SAMPLE) / 32768;
      sum += v * v;
    }
    energy[f] = Math.sqrt(sum / frameSamples);
  }

  const boundaries = [];
  let cursor = 0;
  for (let i = 0; i < lines.length - 1; i += 1) {
    cursor += weights[i];
    const estimateMs = (cursor / weightTotal) * totalMs;
    const windowMs = 1200;
    const from = Math.max(0, Math.floor((estimateMs - windowMs) / frameMs));
    const to = Math.min(frameCount - 1, Math.ceil((estimateMs + windowMs) / frameMs));
    let quietestFrame = Math.round(estimateMs / frameMs);
    let quietest = Infinity;
    for (let f = from; f <= to; f += 1) {
      if (energy[f] < quietest) {
        quietest = energy[f];
        quietestFrame = f;
      }
    }
    const snapped = quietestFrame * frameMs;
    const previous = boundaries.length ? boundaries[boundaries.length - 1] : 0;
    boundaries.push(Math.max(previous + 120, snapped));
  }

  return lines.map((line, index) => ({
    index,
    speaker: line.speaker,
    text: line.text,
    startMs: Math.round(index === 0 ? 0 : boundaries[index - 1]),
    endMs: Math.round(index === lines.length - 1 ? totalMs : boundaries[index]),
  }));
}

async function synthesizeWithGemini({ lines, language, apiKey, model, signal }) {
  const script = lines.map((l) => `${SPEAKER_TAG[l.speaker]}: ${l.text}`).join('\n');
  const models = model ? [model, ...TTS_MODELS.filter((m) => m !== model)] : TTS_MODELS;
  const { response } = await geminiFetch(models, apiKey, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${speakerPrompt(language)}\nRead this debate:\n${script}` }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          multiSpeakerVoiceConfig: {
            speakerVoiceConfigs: [
              { speaker: SPEAKER_TAG.a, voiceConfig: { prebuiltVoiceConfig: { voiceName: STUDIO_VOICES.a.geminiVoice } } },
              { speaker: SPEAKER_TAG.b, voiceConfig: { prebuiltVoiceConfig: { voiceName: STUDIO_VOICES.b.geminiVoice } } },
            ],
          },
        },
      },
    }),
    signal,
  });
  const body = await response.json();
  if (!response.ok) {
    const retry = (body?.error?.details || []).find((d) => d.retryDelay)?.retryDelay;
    throw new Error(`Gemini TTS failed (${response.status})${retry ? `, retry in ${retry}` : ''}: ${body?.error?.message?.slice(0, 160) || ''}`);
  }
  const encoded = body?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData?.data;
  if (!encoded) throw new Error('Gemini TTS returned no audio.');
  const pcm = Buffer.from(encoded, 'base64');
  return { pcm, timeline: timelineBySilence(pcm, lines), provider: 'gemini' };
}

async function synthesizeWithSarvam({ lines, language, apiKey, signal }) {
  const languageCode = language === 'English' ? 'en-IN' : 'hi-IN';
  // Sarvam renders one line per request, which is the case where each line's
  // exact byte length is known — so these timings are measured, not estimated.
  const rendered = await Promise.all(lines.map(async (line) => {
    const response = await fetch('https://api.sarvam.ai/text-to-speech', {
      method: 'POST',
      headers: { 'api-subscription-key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: line.text,
        language_code: languageCode,
        speaker: STUDIO_VOICES[line.speaker].sarvamSpeaker,
        pace: 1.05,
        speech_sample_rate: SAMPLE_RATE,
        model: 'bulbul:v3',
      }),
      signal,
    });
    if (!response.ok) throw new Error(`Sarvam TTS failed (${response.status})`);
    const body = await response.json();
    const encoded = Array.isArray(body?.audios) ? body.audios[0] : body?.audio;
    if (!encoded) throw new Error('Sarvam TTS returned no audio.');
    return pcmFromWav(Buffer.from(encoded, 'base64'));
  }));

  const timeline = [];
  let offsetMs = 0;
  rendered.forEach((chunk, index) => {
    const durationMs = pcmDurationMs(chunk.length);
    timeline.push({
      index,
      speaker: lines[index].speaker,
      text: lines[index].text,
      startMs: Math.round(offsetMs),
      endMs: Math.round(offsetMs + durationMs),
    });
    offsetMs += durationMs;
  });
  return { pcm: Buffer.concat(rendered), timeline, provider: 'sarvam' };
}

/**
 * Renders the debate with whichever provider is configured. Adding
 * SARVAM_API_KEY is all it takes to switch — the per-speaker voice mapping in
 * STUDIO_VOICES already carries a Sarvam speaker for each advocate, so the two
 * voices keep alternating correctly without touching this call site.
 */
export async function synthesizeDebate({ lines, language, geminiApiKey, sarvamApiKey, ttsModel = 'gemini-3.1-flash-tts-preview', signal }) {
  if (sarvamApiKey) {
    try {
      return await synthesizeWithSarvam({ lines, language, apiKey: sarvamApiKey, signal });
    } catch (error) {
      console.warn('Sarvam studio TTS failed, falling back to Gemini:', error.message);
    }
  }
  return synthesizeWithGemini({ lines, language, apiKey: geminiApiKey, model: ttsModel, signal });
}

export { SAMPLE_RATE };
