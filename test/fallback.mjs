// main.ts's fallbacks: files the byte path refuses, run through main.ts and compared with vendor csv-reader 1.0.0.
// usage: node test/fallback.mjs <kit dir> [node binary]
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const kit = process.argv[2];
const nodeBin = process.argv[3] ?? process.execPath;
const { readCsv } = await import(pathToFileURL(kit + '/baselines/csv-reader/vendor/csv-reader/index.js').href);
const main = fileURLToPath(new URL('../main.ts', import.meta.url));
const BS = String.fromCharCode(92);

const inputs = [{ text: 'a,b\n1,"x,y"\n2\n\uFEFFé,東京\r\n', header: true }, { text: '\uFEFFq,"r""s"\rt\n', header: false }];
const files = {
  // An extra key in a case object: the byte path refuses, the latin1 fallback answers.
  extraKey: JSON.stringify(inputs.map((input, i) => ({ id: 'c' + i, input, note: 1 }))),
  // \u002c (a comma) and \u000a written as escapes: refused by the byte path and by latin1 mode, so plain UTF-8.
  // \u00e9 written as an escape: fine in the byte path; latin1 mode must refuse it.
  latinEscape: JSON.stringify(inputs.map((input, i) => ({ id: 'c' + i, input, note: 1 }))).replaceAll('é', BS + 'u00e9'),
  // Header before text in the first case only: the text-end guess runs into the next case and must be caught.
  mixedOrder: `[{"id":"c0","input":{"header":${inputs[0].header},"text":${JSON.stringify(inputs[0].text)}}},` + JSON.stringify({ id: 'c1', input: inputs[1] }) + ']',
  // Whitespace between tokens, keys reordered.
  spaced: '[ ' + inputs.map((input, i) => `{ "input" : { "header" : ${input.header} , "text" : ${JSON.stringify(input.text)} } , "id" : "c${i}" }`).join(' ,\n') + ' ]',
};
// (The comment above ,'s case applies here: commas only inside the text are escaped.)
files.escapes ='[' + inputs.map((input, i) => `{"id":"c${i}","input":{"text":"${JSON.stringify(input.text).slice(1, -1).replaceAll(',', BS + 'u002c').replaceAll(BS + 'n', BS + 'u000a')}","header":${input.header}}}`).join(',') + ']';

const dir = mkdtempSync(join(tmpdir(), 'csv-fb-'));
let failed = 0;
for (const [name, text] of Object.entries(files)) {
  const parsed = JSON.parse(text);
  writeFileSync(join(dir, 'cases.json'), text);
  const r = spawnSync(nodeBin, [main], { env: { ...process.env, MAKEFUN_INPUT_DIR: dir, MAKEFUN_OUTPUT_DIR: dir }, encoding: 'utf8' });
  if (r.status !== 0) { console.log(name, 'main.ts failed', r.stderr); failed++; continue; }
  const got = JSON.parse(readFileSync(join(dir, 'answers.json'), 'utf8'));
  const want = parsed.map((c) => JSON.parse(JSON.stringify(readCsv(c.input))));
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(name, ok ? 'ok' : 'MISMATCH\n want ' + JSON.stringify(want).slice(0, 300) + '\n got  ' + JSON.stringify(got).slice(0, 300));
}
process.exit(failed ? 1 : 0);
