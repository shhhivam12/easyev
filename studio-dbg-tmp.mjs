import fs from 'node:fs';
import { getVehicleById } from './explore-evs-catalog.mjs';
import { buildScriptPrompt } from './debate-studio.mjs';
const env = fs.readFileSync('.env', 'utf8');
const KEY = (env.match(/^GEMINI_API_KEY=(.*)$/m) || [])[1]?.trim();
const a = getVehicleById('tata-punch-ev'), b = getVehicleById('tata-nexon-ev');
const prompt = buildScriptPrompt({ vehicleA: a, vehicleB: b, language: 'English', exchanges: 5 });
for (const cfg of [
  { label: 'current (2048, no thinkingConfig)', gen: { temperature: 0.8, maxOutputTokens: 2048 } },
  { label: 'thinkingLevel low + 4096', gen: { temperature: 0.8, maxOutputTokens: 4096, thinkingConfig: { thinkingLevel: 'low' } } },
]) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: cfg.gen })
  });
  const j = await r.json();
  const c = j?.candidates?.[0];
  const text = (c?.content?.parts || []).map(p => p.text || '').join('');
  console.log(`\n=== ${cfg.label} ===`);
  console.log('finishReason:', c?.finishReason, '| usage:', JSON.stringify(j.usageMetadata));
  console.log('lines returned:', text.split('\n').filter(l => /^\s*[AB]\s*:/i.test(l)).length);
  if (j.error) console.log('ERR', JSON.stringify(j.error).slice(0,200));
}
