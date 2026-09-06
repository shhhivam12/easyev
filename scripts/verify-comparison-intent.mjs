import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { EasyEVToolEngine } from '../decision-tools.mjs';

// Exercise the shipped browser shortcut, then feed its arguments to the real
// comparison engine. Only media lookup is stubbed; no live calls or writes.
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const source = html.slice(html.indexOf('      const SPOKEN_VEHICLES = ['), html.indexOf('      const fastDecisionIntent ='));
assert.ok(source.includes('const fastVisualIntent ='));
const defaults = ['Tata Punch.ev', 'MG Comet EV'];
const engine = new EasyEVToolEngine();
engine.resolveLicensedMedia = async () => null;
const cases = [
  ['compare', defaults, 'comparison'],
  ['कंपेयर', defaults, 'comparison'],
  ['कम्पेयर करके दिखाओ', defaults, 'comparison'],
  ['तुलना दिखाओ', defaults, 'comparison'],
  ['compare karke dikhao', defaults, 'comparison'],
  ['dono ka fark batao', defaults, 'comparison'],
  ['दोनों में फ़र्क बताओ', defaults, 'comparison'],
  ['टाटा पंच और एमजी कॉमेट कंपेयर करके दिखाओ', ['Tata Punch EV', 'MG Comet EV'], 'comparison'],
  ['पंच और नेक्सन कम्पेयर करो', ['Tata Punch EV', 'Tata Nexon EV'], 'comparison'],
  ['नेक्सोन और कोमेट की तुलना दिखाओ', ['Tata Nexon EV', 'MG Comet EV'], 'comparison'],
  ['Punch aur Nexon compare karke dikhao', ['Tata Punch EV', 'Tata Nexon EV'], 'comparison'],
  ['रिज्टा और आई क्यूब की तुलना करो', ['Ather Rizta', 'TVS iQube'], 'comparison'],
  ['एथर ४५०x और ओला एस १ प्रो कंपेयर करो', ['Ather 450X', 'Ola S1 Pro'], 'comparison'],
  ['show a comparison between Tata Punch EV and MG Comet EV models', ['Tata Punch EV', 'MG Comet EV'], 'comparison'],
  ['टाटा पंच की फोटो दिखाओ', ['Tata Punch EV'], 'photo'],
  ['Punch dikhao', ['Tata Punch EV'], 'photo'],
  ['टाटा पंच का ३६० व्यू दिखाओ', ['Tata Punch EV'], '3d'],
  ['show both Tata Punch EV and MG Comet EV in 3d', ['Tata Punch EV', 'MG Comet EV'], '3d'],
  ['show photos of both', defaults, 'photo'],
  ['show me a picture of Tata Punch EV', ['Tata Punch EV'], 'photo'],
  ['show Tata Punch EV in 3d', ['Tata Punch EV'], '3d'],
  ['पास के चार्जिंग स्टेशन कहाँ हैं', null],
  ['running cost calculate karo', null],
];
for (const [text, names, presentation] of cases) {
  const calls = [];
  const state = { integrationMode: 'live', callStatus: 'live', decisionPassport: { shortlist: [] }, handledFastIntentIds: new Set() };
  const context = vm.createContext({ state, defaultCompareNames: () => defaults, scheduleLifecycle: () => {}, runDirectTool: (tool, args) => calls.push({tool,args}) });
  vm.runInContext(`${source}\nglobalThis.route = fastVisualIntent;`, context);
  assert.equal(context.route(text, 'turn-1'), !!names, text);
  if (!names) { assert.equal(calls.length, 0, text); continue; }
  assert.equal(calls.length, 1, text);
  const call = JSON.parse(JSON.stringify(calls[0]));
  assert.equal(call.tool, 'compare_vehicles', text);
  assert.deepEqual(call.args.vehicles, names, text);
  assert.equal(call.args.presentation, presentation, text);
  context.route(text, 'turn-1');
  context.route(text, 'echo-1');
  assert.equal(calls.length, 1, `Duplicate transcript: ${text}`);
  const record = { category: 'Electric car', passport: engine.createPassport('Electric car', 'Hinglish') };
  const result = await engine.compareVehicles(record, call.args, new AbortController().signal);
  assert.equal(result.payload.vehicles.length, names.length, text);
  assert.equal(result.stage, names.length > 1 || presentation === 'comparison' ? 'comparison' : 'vehicle-visual', text);
  assert.deepEqual(result.payload.ambiguous, [], text);
}
// A context-only comparison must retain the shopper's current pair.
const shortlist = [{ name: 'Ather Rizta' }, { name: 'TVS iQube' }];
const calls = [];
const context = vm.createContext({ state: { integrationMode: 'live', callStatus: 'live', decisionPassport: { shortlist }, handledFastIntentIds: new Set() }, defaultCompareNames: () => defaults, scheduleLifecycle: () => {}, runDirectTool: (tool, args) => calls.push(args) });
vm.runInContext(`${source}\nglobalThis.route = fastVisualIntent;`, context);
context.route('दोनों को कंपेयर करके दिखाओ');
assert.deepEqual(Array.from(calls[0].vehicles), shortlist.map(v => v.name));
assert.equal(calls[0].presentation, 'comparison');
console.log(`Passed ${cases.length + 1} multilingual comparison scenarios (routing, duplicate transcripts, shortlist context and real comparison engine).`);
