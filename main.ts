// Reads every case from /input/cases.json, answers each alone with run() from solve.js, writes /output/answers.json.
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR stand in for /input and /output outside a container.
//
// Byte mode: the file is read as latin1, so each UTF-8 byte is one char and every string stays one-byte (fast to
// decode, parse, slice, stringify and write). CSV syntax is ASCII and UTF-8 multi-byte sequences hold no ASCII byte,
// so run() reads the same records; writing its answer back as latin1 restores exactly the UTF-8 bytes. It needs every
// \u escape in the file to be a control char's, else the file is decoded as UTF-8 and written as UTF-8.
import { readFileSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');
// Maglev alone: each case runs once, so TurboFan's compile time costs more than its faster code saves (8% CPU).
setFlagsFromString('--no-turbofan');

const { run } = await import(new URL('./solve.js', import.meta.url).href);

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const raw = readFileSync(inDir + '/cases.json', 'latin1');
const bytes = escapesAreSafe(raw);
const cases = JSON.parse(bytes ? raw : readFileSync(inDir + '/cases.json', 'utf8'));
let out = '[';
for (let i = 0; i < cases.length; i++) {
  let input = cases[i].input;
  // U+FEFF is the 3 bytes EF BB BF here; dropping them is what reading drops for a leading U+FEFF.
  if (bytes && typeof input.text === 'string' && input.text.startsWith('\xef\xbb\xbf')) {
    input = { text: input.text.slice(3), header: input.header };
  }
  // Serialised at once so only one case's answer is alive at a time.
  out += (i > 0 ? ',' : '') + JSON.stringify(run(input));
  cases[i] = null;
}
writeFileSync(outDir + '/answers.json', out + ']', bytes ? 'latin1' : 'utf8');

function escapesAreSafe(s: string): boolean {
  for (let i = s.indexOf('\\u'); i >= 0; i = s.indexOf('\\u', i + 2)) {
    const c = parseInt(s.slice(i + 2, i + 6), 16);
    // Lone surrogates fall back too: two of them can meet as a pair once a stray CR between them is dropped.
    if (!(c < 0x20)) return false;
  }
  return true;
}
