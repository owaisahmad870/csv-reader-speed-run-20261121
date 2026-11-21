// Reads every case from /input/cases.json and writes each one's answer to /output/answers.json.
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR stand in for /input and /output outside a container.
//
// Fast path (fast.js): the answers' JSON bytes are written straight from the cases' JSON bytes, one case at a time.
// Fallback, for any file the fast path does not expect: each case answered with run() (solve.js), in byte mode.
// Byte mode: the file is read as latin1, so each UTF-8 byte is one char and every string stays one-byte. CSV syntax is
// ASCII and UTF-8 multi-byte sequences hold no ASCII byte, so run() reads the same records; writing its answer back as
// latin1 restores exactly the UTF-8 bytes. It needs every \u escape in the file to be a control char's, else the file
// is decoded and written as UTF-8.
import { readFileSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const buf = readFileSync(inDir + '/cases.json');
let answers = null;
try {
  const { answersFromBytes, warmUp } = await import(new URL('./fast.js', import.meta.url).href);
  warmUp();
  answers = answersFromBytes(buf);
} catch {
  answers = null;
}
if (answers !== null) writeFileSync(outDir + '/answers.json', answers);
else {
  const { run } = await import(new URL('./solve.js', import.meta.url).href);
  const raw = buf.latin1Slice(0, buf.length);
  const bytes = escapesAreSafe(raw);
  const cases = JSON.parse(bytes ? raw : buf.toString('utf8'));
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
}

function escapesAreSafe(s: string): boolean {
  for (let i = s.indexOf('\\u'); i >= 0; i = s.indexOf('\\u', i + 2)) {
    const c = parseInt(s.slice(i + 2, i + 6), 16);
    // Lone surrogates fall back too: two of them can meet as a pair once a stray CR between them is dropped.
    if (!(c < 0x20)) return false;
  }
  return true;
}
