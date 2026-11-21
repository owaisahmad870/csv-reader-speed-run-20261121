// A fast reader of broken CSV that answers exactly as csv-reader 1.0.0 does: {columns, rows, errors}.
// One left-to-right pass over char codes; quoted fields jump from quote to quote with indexOf, fields are slices.
// Pure: every bit of state lives inside run(), nothing is kept from one call to the next.

const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const n = text.length;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1;

  let pos = n > 0 && text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recLine = 1;
  let recRow = null;
  let ended = END; // how the last field ended
  let kept = 0; // characters an unquoted read kept
  // Cached "next LF / next CR at or after some earlier point"; valid while pos only moves forward.
  let nextLF = -1;
  let nextCR = -1;
  let nextComma = -1;
  let nextQuote = -1;

  // Unquoted characters from pos onto `prefix`, up to a comma or line break; a CR without LF is dropped (stray_cr).
  function unquoted(prefix) {
    let start = pos;
    let val = prefix;
    kept = 0;
    for (;;) {
      if (nextComma < pos) nextComma = indexOr(text, ',', pos, n);
      if (nextLF < pos) nextLF = indexOr(text, '\n', pos, n);
      if (nextCR < pos) nextCR = indexOr(text, '\r', pos, n);
      let stop = nextComma < nextLF ? nextComma : nextLF;
      if (nextCR < stop) stop = nextCR;
      kept += stop - start;
      val += text.slice(start, stop);
      if (stop === n) {
        pos = n;
        ended = END;
        return val;
      }
      if (stop === nextComma) {
        pos = stop + 1;
        ended = COMMA;
        return val;
      }
      if (stop === nextLF) {
        pos = stop + 1;
        line += 1;
        ended = BREAK;
        return val;
      }
      if (text.charCodeAt(stop + 1) === 10) {
        pos = stop + 2;
        line += 1;
        ended = BREAK;
        return val;
      }
      errors.push({ code: 'stray_cr', line: recLine, row: recRow });
      pos = stop + 1;
      start = pos;
    }
  }

  // A field whose opening quote is at pos.
  function quoted() {
    const open = pos;
    let i = pos + 1;
    let ln = line;
    let val = '';
    let q;
    for (;;) {
      q = text.indexOf('"', i);
      if (q < 0) {
        // Never closes: the quote is literal and what follows is read again, unquoted.
        nextLF = -1;
        nextCR = -1;
        nextComma = -1;
        nextQuote = -1;
        pos = open + 1;
        errors.push({ code: 'unterminated_quote', line: recLine, row: recRow });
        return unquoted('"');
      }
      // The run [i, q): every LF counts a line; each CR (lone or before LF) becomes one LF.
      if (nextLF < i) nextLF = indexOr(text, '\n', i, n);
      while (nextLF < q) {
        ln += 1;
        nextLF = indexOr(text, '\n', nextLF + 1, n);
      }
      if (nextCR < i) nextCR = indexOr(text, '\r', i, n);
      let s = i;
      while (nextCR < q) {
        val += text.slice(s, nextCR) + '\n';
        if (text.charCodeAt(nextCR + 1) === 10) s = nextCR + 2;
        else {
          s = nextCR + 1;
          ln += 1;
        }
        nextCR = indexOr(text, '\r', nextCR + 1, n);
      }
      val += text.slice(s, q);
      if (text.charCodeAt(q + 1) === 34) {
        val += '"';
        i = q + 2;
        continue;
      }
      break;
    }
    line = ln;
    pos = q + 1;
    if (pos >= n) {
      ended = END;
      return val;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      ended = COMMA;
      return val;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      ended = BREAK;
      return val;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      ended = BREAK;
      return val;
    }
    const v = unquoted(val);
    if (kept > 0) errors.push({ code: 'quote_junk', line: recLine, row: recRow });
    return v;
  }

  for (;;) {
    // Blank lines (LF or CRLF alone) are no records.
    while (pos < n) {
      const c = text.charCodeAt(pos);
      if (c === 10) {
        pos += 1;
        line += 1;
      } else if (c === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else break;
    }
    if (pos >= n) break;

    recLine = line;
    recRow = header && columns === null ? null : rows.length;
    let fields = null;
    let wasQuoted = false;
    for (;;) {
      if (text.charCodeAt(pos) === 34) {
        wasQuoted = true;
        const v = quoted();
        if (fields === null) fields = [v];
        else fields.push(v);
        if (ended !== COMMA) break;
        continue;
      }
      wasQuoted = false;
      // A clean stretch: no quote, CR or LF before `lim`; its comma-ended fields come from one native split.
      if (nextLF < pos) nextLF = indexOr(text, '\n', pos, n);
      if (nextCR < pos) nextCR = indexOr(text, '\r', pos, n);
      if (nextQuote < pos) nextQuote = indexOr(text, '"', pos, n);
      let lim = nextLF < nextCR ? nextLF : nextCR;
      if (nextQuote < lim) lim = nextQuote;
      const lastComma = lim > pos ? text.lastIndexOf(',', lim - 1) : -1;
      if (lastComma >= pos) {
        const parts = text.slice(pos, lastComma).split(',');
        if (fields === null) fields = parts;
        else for (let k = 0; k < parts.length; k++) fields.push(parts[k]);
        pos = lastComma + 1;
      }
      // The field from pos holds no comma before lim.
      if (lim === pos && lim === nextQuote && lim < n) continue; // a quoted field opens here
      let v;
      if (lim === n) {
        v = text.slice(pos, n);
        pos = n;
      } else if (lim === nextLF) {
        v = text.slice(pos, lim);
        pos = lim + 1;
        line += 1;
      } else if (lim === nextCR && text.charCodeAt(lim + 1) === 10) {
        v = text.slice(pos, lim);
        pos = lim + 2;
        line += 1;
      } else {
        // A stray CR or a literal quote inside the field: the careful reader.
        v = unquoted('');
        if (fields === null) fields = [v];
        else fields.push(v);
        if (ended !== COMMA) break;
        continue;
      }
      if (fields === null) fields = [v];
      else fields.push(v);
      break;
    }

    // Only stray CRs on the line: no record (their errors stay).
    if (fields.length === 1 && !wasQuoted && fields[0] === '') continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    const len = fields.length;
    if (len < width) {
      errors.push({ code: 'short_row', line: recLine, row: recRow, fields: len });
      for (let k = len; k < width; k++) fields.push('');
    } else if (len > width) {
      errors.push({ code: 'long_row', line: recLine, row: recRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns === null ? [] : columns) : null, rows, errors };
}

function indexOr(text, ch, from, n) {
  const k = text.indexOf(ch, from);
  return k < 0 ? n : k;
}
