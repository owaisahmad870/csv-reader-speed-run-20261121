// End to end: write cases.json files as the generator does (JSON.stringify), run main.ts on them in a child node,
// compare answers.json, parsed, with vendor csv-reader 1.0.0 per case.
// usage: node test/e2e.mjs <kit dir> [node binary] [files=40]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const kit = process.argv[2];
const nodeBin = process.argv[3] ?? process.execPath;
const files = Number(process.argv[4] ?? 40);
const imp = (p) => import(pathToFileURL(kit + '/' + p).href);
const { readCsv } = await imp('baselines/csv-reader/vendor/csv-reader/index.js');
const { streamFor } = await imp('program/generator/rng.ts');
const { generate } = await imp('program/generator/subject/csv-cases.mjs');
const main = fileURLToPath(new URL('../main.ts', import.meta.url));

const PIECES = ['"', '"', ',', ',', '\r', '\n', '\r\n', 'a', 'bc', 'é', '東京', '😀', '﻿', ' ', '\\', '\\u0041', '\t', '\u0000', '""', 'ï»¿'];
const RARE = ['\ud800', '\udc00'];
let seed = 7;
const rnd = (k) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) % k);
const BYTE_PIECES = PIECES.filter((p) => p.indexOf(String.fromCharCode(92)) < 0); // no backslash: stays in byte mode
const randText = (rare, pieces) => {
  let s = rnd(3) === 0 ? '﻿' : '';
  const len = rnd(60);
  for (let i = 0; i < len; i++) s += rare && rnd(20) === 0 ? RARE[rnd(2)] : pieces[rnd(pieces.length)];
  return s;
};

const dir = mkdtempSync(join(tmpdir(), 'csv-e2e-'));
let failed = 0;
let total = 0;
for (let f = 0; f < files; f++) {
  const inputs = [];
  if (f % 4 === 0) {
    const sd = createHash('sha256').update('e2e-' + f).digest('hex');
    for (let i = 0; i < 6; i++) inputs.push(generate(streamFor(sd, 'case', i), i));
  } else {
    for (let i = 0; i < 300; i++) inputs.push({ text: randText(f % 4 === 3, f % 4 === 1 ? BYTE_PIECES : PIECES), header: rnd(2) === 0 });
  }
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(inputs.map((input, i) => ({ id: 'c' + i, input }))));
  const r = spawnSync(nodeBin, [main], { env: { ...process.env, MAKEFUN_INPUT_DIR: dir, MAKEFUN_OUTPUT_DIR: dir }, encoding: 'utf8' });
  if (r.status !== 0) {
    console.log('main.ts failed', r.stderr);
    process.exit(1);
  }
  const got = JSON.parse(readFileSync(join(dir, 'answers.json'), 'utf8'));
  for (let i = 0; i < inputs.length; i++) {
    total++;
    // The scorer compares parsed JSON values: so do we (the vendor's answer through JSON too).
    const want = JSON.stringify(JSON.parse(JSON.stringify(readCsv(inputs[i]))));
    if (want !== JSON.stringify(got[i])) {
      failed++;
      if (failed <= 5) console.log('MISMATCH file', f, 'case', i, JSON.stringify(inputs[i]).slice(0, 200), '\n want', want.slice(0, 300), '\n got ', JSON.stringify(got[i]).slice(0, 300));
    }
  }
}
console.log('e2e', nodeBin, 'cases', total, 'failed', failed);
process.exit(failed ? 1 : 0);
