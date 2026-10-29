function sniff(b) {
  const s = (...a) => a.every((x, i) => b[i] === x);
  if (s(0x50, 0x4b, 3, 4)) return 'ZIP';
  if (s(0x89, 0x50, 0x4e, 0x47)) return 'image/png';
  if (s(0xff, 0xd8, 0xff)) return 'image/jpeg';
  if (s(0x47, 0x49, 0x46)) return 'image/gif';
  if (s(0x42, 0x4d) && b.length > 17 && !b[6] && !b[7] && !b[8] && !b[9] && b[14] >= 12 && !b[15] && !b[16] && !b[17]) return 'image/bmp';
  if (s(0x1f, 0x8b)) return 'gzip';
  if (s(0x25, 0x50, 0x44, 0x46)) return 'PDF';
  if (b.length > 8 && String.fromCharCode(...b.slice(4, 8)) === 'ftyp') return 'video/mp4';
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(b.slice(0, 2048), { stream: true });
    if (!/[\x00-\x08\x0e-\x1f]/.test(s)) return 'text';
  } catch {}
  return 'binary';
}

function hex(b) {
  let out = '';
  for (let i = 0; i < b.length; i += 16) {
    const r = b.slice(i, i + 16);
    out += i.toString(16).padStart(6, '0') + '  ' + [...r].map(x => x.toString(16).padStart(2, '0')).join(' ').padEnd(48) +
      ' ' + [...r].map(x => x >= 32 && x < 127 ? String.fromCharCode(x) : '.').join('') + '\n';
  }
  return out;
}

function context(t, i) {
  let a = i;
  for (let k = 0; k < 4 && a > 0; k++) a = a > 1 ? t.lastIndexOf('\n', a - 2) + 1 : 0;
  let b = i;
  for (let k = 0; k < 3 && b !== -1; k++) b = t.indexOf('\n', b + 1);
  if (b === -1) b = t.length;
  const lines = t.slice(a, b).split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return '';
  const ind = Math.min(...lines.map(l => l.match(/^\s*/)[0].length));
  return lines.map(l => l.slice(ind).slice(0, 200)).join('\n');
}

async function findRefs(guid) {
  const out = [];
  const key = guid.toLowerCase();
  for (const e of entries.value.filter(e => isXml(e.name))) {
    const cached = S.xmlTexts[e.name] != null, t = await getText(e.name), pos = guidIndex(e.name, t).get(key);
    if (!pos) { if (!cached && t.length > 1e6) dropText(e.name); continue; }
    const starts = lineIndex(e.name, t), shown = [];
    for (const i of pos.slice(0, 5)) shown.push({ line: lineOf(starts, i), parts: context(t, i).split(t.substr(i, guid.length)) });
    out.push({ file: e.name, n: pos.length, shown });
    if (!cached && t.length > 1e6) dropText(e.name);
  }
  return out;
}
function dropText(name) { delete S.xmlTexts[name]; delete S.guidIdx[name]; delete S.lineCache[name]; }
function guidIndex(name, t) {
  if (S.guidIdx[name]) return S.guidIdx[name];
  const m = new Map();
  for (const x of t.matchAll(/[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}/gi)) {
    const k = x[0].toLowerCase(), a = m.get(k);
    if (a) a.push(x.index); else m.set(k, [x.index]);
  }
  return S.guidIdx[name] = m;
}

const LH = 18;
function lineIndex(name, t) {
  if (S.lineCache[name]) return S.lineCache[name];
  const a = [0];
  let i = -1;
  while ((i = t.indexOf('\n', i + 1)) !== -1) a.push(i + 1);
  return S.lineCache[name] = a;
}
function lineOf(starts, pos) {
  let lo = 0, hi = starts.length - 1;
  while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= pos) lo = m; else hi = m - 1; }
  return lo + 1;
}

function xmlItem(n, i) {
  const count = n.childElementCount;
  return {
    key: i, xml: true, label: n.nodeName, count,
    attrs: [...n.attributes].map(a => ({ n: a.name, v: clip(a.value) })),
    text: count ? '' : clip(n.textContent.trim()),
    kids: () => [...n.children].map(xmlItem),
  };
}

function tagStats(root) {
  const m = new Map(), stack = [root];
  while (stack.length) { const n = stack.pop(); m.set(n.nodeName, (m.get(n.nodeName) || 0) + 1); for (const c of n.children) stack.push(c); }
  return [...m].sort((a, b) => b[1] - a[1]);
}
