// Small shared helpers.

export function escHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function formatDate(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

export function csvField(val) {
  const s = String(val ?? '');
  return s.includes(',') || s.includes('"') || s.includes('\n') ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function parseCSVRow(line) {
  const fields = [];
  let cur = '',
    inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuote) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') inQuote = false;
      else cur += ch;
    } else {
      if (ch === '"') inQuote = true;
      else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else cur += ch;
    }
  }
  fields.push(cur);
  return fields;
}

export function triggerDownload(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function escAttr(str) {
  return String(str || '')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// A value as a JavaScript literal for an argument in an inline on*= handler, written as
// `fn(${jsArg(name)})` with no quotes around it. escAttr() isn't enough there: the browser decodes
// &#39; back to ' before it runs the handler, so a name with an apostrophe would break out of a
// '…' string.
export function jsArg(value) {
  return escHtml(JSON.stringify(value ?? null));
}

export function showSaved(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('visible');
  setTimeout(() => el.classList.remove('visible'), 2200);
}
