// Fuzz: run() + toJson() against vendor csv-reader 1.0.0 (the kit's copy), compared as parsed JSON.
// usage: node test/fuzz.mjs <kit dir> [generatedSeeds=20]
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { run, toJson } from '../solve.js';

const kit = process.argv[2];
const seeds = Number(process.argv[3] ?? 20);
const imp = (p) => import(pathToFileURL(kit + '/' + p).href);
const { readCsv } = await imp('baselines/csv-reader/vendor/csv-reader/index.js');
const { streamFor } = await imp('program/generator/rng.ts');
const { generate } = await imp('program/generator/subject/csv-cases.mjs');

let checked = 0;
let failed = 0;
function check(input, label) {
  checked++;
  const want = JSON.stringify(readCsv(input));
  const got = JSON.stringify(JSON.parse(toJson(run(input))));
  if (want !== got) {
    failed++;
    if (failed <= 5) console.log('MISMATCH', label, JSON.stringify(input).slice(0, 300), '\n want', want.slice(0, 400), '\n got ', got.slice(0, 400));
  }
}

// 1. Exhaustive: every string up to length 7 over a small alphabet, both header values.
const ALPHA = ['"', ',', '\r', '\n', 'a'];
function rec(prefix, depth) {
  check({ text: prefix, header: true }, 'exh');
  check({ text: prefix, header: false }, 'exh');
  if (depth === 0) return;
  for (const c of ALPHA) rec(prefix + c, depth - 1);
}
rec('', 7);
rec('﻿', 4);
console.log('exhaustive', checked, 'failed', failed);

// 2. Random longer strings with rarer characters.
const RARE = ['"', '"', ',', ',', '\r', '\n', '\r\n', 'a', 'bc', '\\', '\t', ' ', '﻿', '😀', '\ud800', 'é', '""', '\u0000'];
let seed = 12345;
const rnd = (k) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k);
for (let t = 0; t < 200000; t++) {
  let s = '';
  const len = rnd(40);
  for (let i = 0; i < len; i++) s += RARE[rnd(RARE.length)];
  check({ text: s, header: rnd(2) === 0 }, 'rand');
}
console.log('random', checked, 'failed', failed);

// 3. Full-size files from the kit's own generator, fresh seeds.
for (let k = 0; k < seeds; k++) {
  const sd = createHash('sha256').update('fuzz-' + k).digest('hex');
  for (let i = 0; i < 6; i++) check(generate(streamFor(sd, 'case', i), i), 'gen ' + k + '/' + i);
}
console.log('generated', checked, 'failed', failed);
process.exit(failed ? 1 : 0);
