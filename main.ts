// Reads every case from /input/cases.json, answers each alone with run() from solve.js, writes /output/answers.json.
// MAKEFUN_INPUT_DIR / MAKEFUN_OUTPUT_DIR stand in for /input and /output outside a container.
import { readFileSync, writeFileSync } from 'node:fs';
import { setFlagsFromString } from 'node:v8';

setFlagsFromString('--no-incremental-marking');

const { run, toJson } = await import(new URL('./solve.js', import.meta.url).href);

const inDir = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(inDir + '/cases.json', 'utf8'));
let out = '[';
for (let i = 0; i < cases.length; i++) {
  if (i > 0) out += ',';
  out += toJson(run(cases[i].input));
  cases[i] = null;
}
writeFileSync(outDir + '/answers.json', out + ']');
