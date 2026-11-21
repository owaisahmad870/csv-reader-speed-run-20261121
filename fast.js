// Byte path: cases.json bytes in, answers.json bytes out, with no JSON.parse, no strings and no answer objects.
// A case's text is read in its escaped JSON form: the CSV syntax is ',' (a raw byte), '\"' (a quote), '\n' and '\r';
// every other byte or escape is copied as it stands, so each field's JSON text is the escaped input it came from
// (a "" pair written as \", a CR inside quotes as \n, a stray CR dropped). The answer is the same JSON value
// csv-reader 1.0.0 returns (run() in solve.js); anything this reader does not expect throws, and main.ts then
// answers with run().

const BS = 0x5c; // backslash
const QT = 0x22; // "
const CM = 0x2c; // ,
const LB = 0x5b; // [
const RB = 0x5d; // ]
const N = 0x6e; // n
const R = 0x72; // r
const U = 0x75; // u

let out;
let o;

/** answers.json's bytes for cases.json's bytes `b`. Throws on anything unexpected. */
export function answersFromBytes(b) {
  out = Buffer.allocUnsafe(3 * b.length + 65536);
  o = 0;
  let i = ws(b, 0);
  if (b[i] !== LB) throw new Error('not an array');
  i = ws(b, i + 1);
  put('[');
  let first = true;
  if (b[i] === RB) i++;
  else
    for (;;) {
      // One case: {"id": "...", "input": {"text": "...", "header": true|false}} with keys in any order.
      if (b[i] !== 0x7b) throw new Error('case is not an object');
      let ts = -1;
      let te = -1;
      let header = null;
      i = ws(b, i + 1);
      for (;;) {
        const [key, k1] = keyAt(b, i);
        i = k1;
        if (key === 'id') i = ws(b, skipString(b, i) + 1);
        else if (key === 'input') {
          if (b[i] !== 0x7b) throw new Error('input is not an object');
          i = ws(b, i + 1);
          for (;;) {
            const [k2, k3] = keyAt(b, i);
            i = k3;
            if (k2 === 'text') {
              if (b[i] !== QT) throw new Error('text is not a string');
              ts = i + 1;
              te = textEnd(b, ts);
              i = ws(b, te + 1);
            } else if (k2 === 'header') {
              if (b[i] === 0x74 && b[i + 1] === 0x72 && b[i + 2] === U && b[i + 3] === 0x65) header = true, (i += 4);
              else if (b[i] === 0x66 && b[i + 1] === 0x61 && b[i + 2] === 0x6c && b[i + 3] === 0x73 && b[i + 4] === 0x65) header = false, (i += 5);
              else throw new Error('header is not a boolean');
              i = ws(b, i);
            } else throw new Error('unexpected input key');
            if (b[i] === CM) i = ws(b, i + 1);
            else if (b[i] === 0x7d) break;
            else throw new Error('bad input object');
          }
          i = ws(b, i + 1);
        } else throw new Error('unexpected case key');
        if (b[i] === CM) i = ws(b, i + 1);
        else if (b[i] === 0x7d) break;
        else throw new Error('bad case object');
      }
      if (ts < 0 || header === null) throw new Error('case without text or header');
      if (!first) out[o++] = CM;
      first = false;
      transcode(b, ts, te, header);
      i = ws(b, i + 1);
      if (b[i] === CM) i = ws(b, i + 1);
      else if (b[i] === RB) {
        i++;
        break;
      } else throw new Error('bad array');
    }
  if (ws(b, i) !== b.length) throw new Error('trailing bytes');
  put(']');
  return out.subarray(0, o);
}

/**
 * Runs the reader once on a tiny file that takes every branch (its answer is thrown away), so the optimizing compiler
 * sees feedback for the rare paths too: without it, each case's first error deoptimizes the hot loop, a recompile each.
 */
export function warmUp() {
  const t = '﻿h,"q"\r\na,"b""c","d\r\ne\rf\ng"x,\\u0041\r\n\n\r\n1\r2\n"j"kg,"k"\rz,3,4,5\n1\n"u,v\n';
  const t2 = 'x,"y"\n"m",n\n\n"p","q"';
  const cases = [];
  for (const text of [t, t2]) for (const header of [true, false]) cases.push({ id: 'w', input: { text, header } });
  // Several passes: V8 allocates a function's feedback vector only after its first few calls.
  const bytes = Buffer.from(JSON.stringify(cases));
  for (let k = 0; k < 4; k++) answersFromBytes(bytes);
}

function ws(b, i) {
  while (b[i] === 0x20 || b[i] === 0x0a || b[i] === 0x0d || b[i] === 0x09) i++;
  return i;
}

// A plain key (no escapes) and the index after its ':'.
function keyAt(b, i) {
  if (b[i] !== QT) throw new Error('key expected');
  const e = b.indexOf(QT, i + 1);
  if (e < 0) throw new Error('unterminated key');
  const key = b.latin1Slice(i + 1, e);
  if (key.indexOf('\\') >= 0) throw new Error('escaped key');
  i = ws(b, e + 1);
  if (b[i] !== 0x3a) throw new Error('colon expected');
  return [key, ws(b, i + 1)];
}

// Where a text string ends, in one native search: the raw bytes `","header":` cannot occur inside a JSON string (its
// quotes would be escaped), so their first match after ts closes the text when header is the next key. If it is not,
// the span runs past the real end, and the reader meets that end's raw quote and throws (rawQuote).
const HEADER_KEY = Buffer.from('","header":');
function textEnd(b, ts) {
  const q = b.indexOf(HEADER_KEY, ts);
  return q >= 0 ? q : stringEnd(b, ts);
}

function skipString(b, i) {
  if (b[i] !== QT) throw new Error('string expected');
  return stringEnd(b, i + 1);
}

// The index of the quote closing a JSON string whose content starts at s (a quote after an even run of backslashes).
function stringEnd(b, s) {
  for (let i = s; ; ) {
    const q = b.indexOf(QT, i);
    if (q < 0) throw new Error('unterminated string');
    let k = q - 1;
    while (k >= s && b[k] === BS) k--;
    if (((q - 1 - k) & 1) === 0) return q;
    i = q + 1;
  }
}

function put(s) {
  ensure(s.length);
  o += out.latin1Write(s, o);
}

function ensure(n) {
  if (o + n > out.length) out = grow(out, o, n);
}

function grow(ob, p, n) {
  const bigger = Buffer.allocUnsafe(Math.max(2 * ob.length, p + n + 65536));
  ob.copy(bigger, 0, 0, p);
  return bigger;
}

// A \uXXXX escape at j stands for one ordinary character, unless it is one of CSV's own (then we cannot read it here).
function checkU(b, j) {
  const c = parseInt(b.latin1Slice(j + 2, j + 6), 16);
  if (!(c >= 0) || c === 0x0a || c === 0x0d || c === 0x22 || c === 0x2c || c === 0xfeff) throw new Error('special \\u escape');
}

// A raw quote can only end a JSON string: met inside a text span, the span was guessed wrong.
function rawQuote() {
  throw new Error('raw quote inside text');
}

// Errors of the case being read, as JSON objects each led by a comma; rare, so a string.
let errs = '';
function addErr(code, line, row) {
  errs += ',{"code":"' + code + '","line":' + line + ',"row":' + (row < 0 ? 'null' : row) + '}';
}

// The high bit of each zero byte of the 32-bit word x. Bytes above the first zero byte may be flagged falsely (a borrow),
// but the lowest flag is always exact: it marks the first zero byte, and the mask is 0 only when there is none.
// Stepping to the lowest flag of (word ^ repeated special byte) finds the first special byte of the word.
function zeroBytes(x) {
  return (x - 0x01010101) & ~x & 0x80808080;
}

// record()'s results: [i, p, line, count, flags (1 last field quoted, 2 last field empty), extraStart].
const ST = new Int32Array(6);

// One case's answer, {"columns":...,"rows":[...],"errors":[...]}, for the escaped text b[s, e).
// A small driver: the per-record work is record(), a function called per record, so the optimizing compiler
// takes it whole once (no on-stack replacement and recompile of one big loop).
function transcode(b, s, e, header) {
  let ob = out;
  let ov = new DataView(ob.buffer, ob.byteOffset, ob.length);
  const bv = new DataView(b.buffer, b.byteOffset, b.length);
  let p = o;
  let i = s;
  if (b[i] === 0xef && b[i + 1] === 0xbb && b[i + 2] === 0xbf && i + 3 <= e) i += 3; // U+FEFF as UTF-8
  if (b[i] === BS && b[i + 1] === U && i + 6 <= e) checkU(b, i); // an escaped U+FEFF is not read here
  let line = 1;
  let width = -1;
  let rowsN = 0;
  let colsDone = !header;
  errs = '';
  p += ob.latin1Write(header ? '{"columns":' : '{"columns":null,"rows":[', p); // room: answersFromBytes keeps 64 KiB spare

  for (;;) {
    // Blank lines (LF or CRLF alone) are no records.
    while (i < e && b[i] === BS) {
      if (b[i + 1] === N) i += 2;
      else if (b[i + 1] === R && b[i + 2] === BS && b[i + 3] === N) i += 4;
      else break;
      line++;
    }
    if (i >= e) break;

    // A record's JSON is at most 3 bytes per byte of text left (padding is checked apart).
    if (p + 3 * (e - i) + 1024 > ob.length) {
      ob = grow(ob, p, 3 * (e - i) + 1024);
      ov = new DataView(ob.buffer, ob.byteOffset, ob.length);
    }
    const recLine = line;
    const recRow = colsDone ? rowsN : -1;
    const recStart = p;
    if (colsDone && rowsN > 0) ob[p++] = CM;
    ob[p++] = LB;
    record(b, bv, i, e, ob, ov, p, line, recRow, colsDone ? width : -1);
    i = ST[0];
    p = ST[1];
    line = ST[2];
    const count = ST[3];
    const flags = ST[4];

    // Only stray CRs on the line: no record (their errors stay).
    if (count === 1 && flags === 2) {
      p = recStart;
      continue;
    }
    if (width < 0) width = count;
    if (!colsDone) {
      ob[p++] = RB;
      p += ob.latin1Write(',"rows":[', p); // within the record's 1024 spare bytes
      colsDone = true;
      continue;
    }
    if (count < width) {
      if (p + 3 * (width - count) + 16 > ob.length) ob = grow(ob, p, 3 * (width - count) + 16);
      for (let k = count; k < width; k++) {
        ob[p++] = CM;
        ob[p++] = QT;
        ob[p++] = QT;
      }
      errs += ',{"code":"short_row","line":' + recLine + ',"row":' + recRow + ',"fields":' + count + '}';
    } else if (count > width) {
      const extraStart = ST[5];
      const extra = ob.latin1Slice(extraStart + 1, p);
      p = extraStart;
      errs += ',{"code":"long_row","line":' + recLine + ',"row":' + recRow + ',"extra":[' + extra + ']}';
    }
    ob[p++] = RB;
    rowsN++;
  }
  const tail = (colsDone ? '' : '[],"rows":[') + '],"errors":[' + errs.slice(1) + ']}';
  if (p + tail.length + 64 > ob.length) ob = grow(ob, p, tail.length + 64);
  p += ob.latin1Write(tail, p);
  out = ob;
  o = p;
}

// The fields of one record from b[i] (not a blank line) into ob[p], as JSON strings joined by commas. The field at
// index `cut` and after are long-row extras: ST[5] marks where the comma before them was written. Results in ST.
function record(b, bv, i, e, ob, ov, p, line, recRow, cut) {
  const recLine = line;
  let count = 0;
  let flags = 0;
  let extraStart = -1;
  for (;;) {
    if (count === cut) extraStart = p;
    if (count > 0) ob[p++] = CM;
    ob[p++] = QT;
    const fieldStart = p;
    let ended = 2; // 0 comma, 1 line break, 2 end of text
    let scanUnquoted = true;
    let junk = false;
    const quoted = i < e && b[i] === BS && b[i + 1] === QT;

    if (quoted) {
      let j = i + 2;
      let ln = line;
      let closed = false;
      while (j < e) {
        // Four bytes at a time: copy the word, then step to its first backslash or quote (or past it, if none).
        if (j + 4 <= e) {
          const v = bv.getUint32(j, true);
          const m = zeroBytes(v ^ 0x5c5c5c5c) | zeroBytes(v ^ 0x22222222);
          ov.setUint32(p, v, true);
          if (m === 0) {
            p += 4;
            j += 4;
            continue;
          }
          const k = (31 - Math.clz32(m & -m)) >> 3;
          p += k;
          j += k;
        }
        const c = b[j];
        if (c !== BS) {
          if (c === QT) rawQuote();
          ob[p++] = c;
          j++;
          continue;
        }
        const d = b[j + 1];
        if (d === QT) {
          if (b[j + 2] === BS && b[j + 3] === QT) {
            ob[p++] = BS;
            ob[p++] = QT;
            j += 4;
            continue;
          }
          j += 2;
          closed = true;
          break;
        }
        if (d === R) {
          ob[p++] = BS;
          ob[p++] = N;
          ln++;
          j += b[j + 2] === BS && b[j + 3] === N ? 4 : 2;
          continue;
        }
        if (d === N) ln++;
        else if (d === U) {
          checkU(b, j);
          ob[p++] = BS;
          ob[p++] = U;
          ob[p++] = b[j + 2];
          ob[p++] = b[j + 3];
          ob[p++] = b[j + 4];
          ob[p++] = b[j + 5];
          j += 6;
          continue;
        }
        ob[p++] = BS;
        ob[p++] = d;
        j += 2;
      }
      if (!closed) {
        // Never closes: the quote is literal and what follows is read again, unquoted.
        p = fieldStart;
        ob[p++] = BS;
        ob[p++] = QT;
        addErr('unterminated_quote', recLine, recRow);
        i += 2;
      } else {
        line = ln;
        i = j;
        scanUnquoted = false;
        if (i >= e) ended = 2;
        else if (b[i] === CM) {
          i++;
          ended = 0;
        } else if (b[i] === BS && b[i + 1] === N) {
          i += 2;
          line++;
          ended = 1;
        } else if (b[i] === BS && b[i + 1] === R && b[i + 2] === BS && b[i + 3] === N) {
          i += 4;
          line++;
          ended = 1;
        } else {
          scanUnquoted = true;
          junk = true;
        }
      }
    }

    if (scanUnquoted) {
      const keptFrom = p;
      while (i < e) {
        // Four bytes at a time: copy the word, then step to its first comma, backslash or quote (or past it, if none).
        if (i + 4 <= e) {
          const v = bv.getUint32(i, true);
          const m = zeroBytes(v ^ 0x2c2c2c2c) | zeroBytes(v ^ 0x5c5c5c5c) | zeroBytes(v ^ 0x22222222);
          ov.setUint32(p, v, true);
          if (m === 0) {
            p += 4;
            i += 4;
            continue;
          }
          const k = (31 - Math.clz32(m & -m)) >> 3;
          p += k;
          i += k;
        }
        const c = b[i];
        if (c > BS) {
          // Lower-case letters and the like: the common case, one test.
          ob[p++] = c;
          i++;
          continue;
        }
        if (c === CM) {
          i++;
          ended = 0;
          break;
        }
        if (c !== BS) {
          if (c === QT) rawQuote();
          ob[p++] = c;
          i++;
          continue;
        }
        const d = b[i + 1];
        if (d === N) {
          i += 2;
          line++;
          ended = 1;
          break;
        }
        if (d === R) {
          if (b[i + 2] === BS && b[i + 3] === N) {
            i += 4;
            line++;
            ended = 1;
            break;
          }
          addErr('stray_cr', recLine, recRow);
          i += 2;
          continue;
        }
        if (d === U) {
          checkU(b, i);
          ob[p++] = BS;
          ob[p++] = U;
          ob[p++] = b[i + 2];
          ob[p++] = b[i + 3];
          ob[p++] = b[i + 4];
          ob[p++] = b[i + 5];
          i += 6;
          continue;
        }
        ob[p++] = BS;
        ob[p++] = d;
        i += 2;
      }
      if (junk && p > keptFrom) addErr('quote_junk', recLine, recRow);
    }
    flags = (quoted ? 1 : 0) | (p === fieldStart ? 2 : 0);
    ob[p++] = QT;
    count++;
    if (ended !== 0) break;
  }
  ST[0] = i;
  ST[1] = p;
  ST[2] = line;
  ST[3] = count;
  ST[4] = flags;
  ST[5] = extraStart;
}

