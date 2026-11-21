// fast.js against vendor csv-reader 1.0.0: cases.json bytes as the generator writes them (JSON.stringify), the answers'
// bytes parsed back and compared per case. Counts files the fast path refuses (main.ts answers those with run()).
// usage: node test/fastfuzz.mjs <kit dir> [files=60]
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { answersFromBytes } from '../fast.js';

const kit = process.argv[2];
const files = Number(process.argv[3] ?? 60);
const imp = (p) => import(pathToFileURL(kit + '/' + p).href);
const { readCsv } = await imp('baselines/csv-reader/vendor/csv-reader/index.js');
const { streamFor } = await imp('program/generator/rng.ts');
const { generate } = await imp('program/generator/subject/csv-cases.mjs');

const PIECES = ['"', '"', ',', ',', '\r', '\n', '\r\n', 'a', 'bc', 'é', '東京', '\u{1F600}', '﻿', ' ', '\\', '\\u0041', '\t', '\u0000', '\u001f', '""', 'ï»¿', '/'];
const RARE = ['\ud800', '\udc00'];
let seed = 99;
const rnd = (k) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k);
const randText = (rare, len) => {
  let s = rnd(3) === 0 ? '﻿' : '';
  for (let i = 0; i < len; i++) s += rare && rnd(15) === 0 ? RARE[rnd(2)] : PIECES[rnd(PIECES.length)];
  return s;
};

let failed = 0, total = 0, refused = 0;
function file(inputs, label) {
  const bytes = Buffer.from(JSON.stringify(inputs.map((input, i) => ({ id: 'c' + i, input }))), 'utf8');
  let got;
  try {
    got = JSON.parse(Buffer.from(answersFromBytes(bytes)).toString('utf8'));
  } catch (e) {
    refused++;
    if (refused <= 3) console.log('refused', label, e.message);
    return;
  }
  for (let i = 0; i < inputs.length; i++) {
    total++;
    const want = JSON.stringify(JSON.parse(JSON.stringify(readCsv(inputs[i]))));
    const g = JSON.stringify(got[i]);
    if (want !== g) {
      failed++;
      if (failed <= 5) console.log('MISMATCH', label, i, JSON.stringify(inputs[i]).slice(0, 200), '\n want', want.slice(0, 300), '\n got ', g.slice(0, 300));
    }
  }
}

// Exhaustive short strings (one file per length), then random files, then generated files.
const ALPHA = ['"', ',', '\r', '\n', 'a'];
for (let L = 0; L <= 6; L++) {
  const inputs = [];
  const rec = (p, d) => { if (d === 0) { inputs.push({ text: p, header: true }, { text: p, header: false }, { text: '﻿' + p, header: false }); return; } for (const c of ALPHA) rec(p + c, d - 1); };
  rec('', L);
  file(inputs, 'exhaustive ' + L);
}
for (let f = 0; f < files; f++) {
  const inputs = [];
  for (let i = 0; i < 200; i++) inputs.push({ text: randText(f % 5 === 4, rnd(80)), header: rnd(2) === 0 });
  file(inputs, 'random ' + f);
}
for (let k = 0; k < 6; k++) {
  const sd = createHash('sha256').update('fast-' + k).digest('hex');
  const inputs = [];
  for (let i = 0; i < 6; i++) inputs.push(generate(streamFor(sd, 'case', i), i));
  file(inputs, 'generated ' + k);
}
file([], 'empty set');
console.log('cases', total, 'failed', failed, 'files refused', refused);
process.exit(failed ? 1 : 0);
