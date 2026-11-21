// Runs main.ts with --trace-deopt on fresh generated sets (the scored distribution) and counts bailouts: each one is
// a recompile in the timed run. usage: node test/deopts.mjs <kit dir> <node binary> [sets=10]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const [kit, nodeBin] = process.argv.slice(2);
const sets = Number(process.argv[4] ?? 10);
const imp = (p) => import(pathToFileURL(kit + '/' + p).href);
const { streamFor } = await imp('program/generator/rng.ts');
const { generate } = await imp('program/generator/subject/csv-cases.mjs');
const main = fileURLToPath(new URL('../main.ts', import.meta.url));
const dir = mkdtempSync(join(tmpdir(), 'csv-deopt-'));
let total = 0;
for (let k = 0; k < sets; k++) {
  const sd = createHash('sha256').update('deopt-' + k).digest('hex');
  const cases = [];
  for (let i = 0; i < 6; i++) cases.push({ id: 'g-' + i, input: generate(streamFor(sd, 'case', i), i) });
  writeFileSync(join(dir, 'cases.json'), JSON.stringify(cases));
  const r = spawnSync(nodeBin, ['--trace-deopt', main], { env: { ...process.env, MAKEFUN_INPUT_DIR: dir, MAKEFUN_OUTPUT_DIR: dir }, encoding: 'utf8', maxBuffer: 1 << 26 });
  const n = (r.stdout.match(/bailout \(kind/g) || []).length;
  total += n;
  if (n) console.log('set', k, 'deopts', n, (r.stdout.match(/reason: [^)]*\)/g) || []).slice(0, 3).join(' | '));
}
console.log('sets', sets, 'deopts', total);
