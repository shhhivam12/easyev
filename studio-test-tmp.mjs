import fs from 'node:fs';
import { getVehicleById } from './explore-evs-catalog.mjs';
import { generateDebateScript, synthesizeDebate, buildWav } from './debate-studio.mjs';

const env = fs.readFileSync('.env', 'utf8');
const GEMINI = (env.match(/^GEMINI_API_KEY=(.*)$/m) || [])[1]?.trim();

const a = getVehicleById('tata-punch-ev');
const b = getVehicleById('tata-nexon-ev');

console.log('--- generating script ---');
let t = Date.now();
const lines = await generateDebateScript({ vehicleA: a, vehicleB: b, language: 'English', apiKey: GEMINI, exchanges: 5 });
console.log(`script: ${lines.length} lines in ${Date.now() - t}ms`);
lines.forEach((l, i) => console.log(`  ${i} [${l.speaker}] ${l.text}`));

console.log('--- synthesizing (single multi-speaker call) ---');
t = Date.now();
const out = await synthesizeDebate({ lines, language: 'English', geminiApiKey: GEMINI, sarvamApiKey: '' });
console.log(`provider=${out.provider}  ${Date.now() - t}ms  pcm=${out.pcm.length}B  audio=${(out.pcm.length/48000).toFixed(1)}s`);
console.log('timeline:');
out.timeline.forEach(s => console.log(`  ${s.index} [${s.speaker}] ${(s.startMs/1000).toFixed(2)}s-${(s.endMs/1000).toFixed(2)}s  ${s.text.slice(0,50)}`));
fs.writeFileSync('C:/Users/jatin/AppData/Local/Temp/claude/c--Users-jatin-easyev-1/68a6fe16-6e60-4a74-b107-f7e4e3fb6f93/scratchpad/studio-debate.wav', buildWav(out.pcm));
console.log('wrote studio-debate.wav');
