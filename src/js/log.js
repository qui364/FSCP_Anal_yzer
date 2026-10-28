const evName = c => EVENTS[c] || '';
const evSev = c => { const n = EVENTS[c] || '';
  if (/устран|^Норма|восстановлен|соответствует ко|Связь с ГК/i.test(n) && !/не соответствует/i.test(n)) return 'ok';
  if (/Пожар|Тревога|Сработка|Авария/i.test(n)) return 'fire';
  if (/Неисправность|Потеря связи|Нет связи|Ошибка|не соответствует|Зависание/i.test(n)) return 'bad';
  if (/Внимание|Запыленность|Тест/i.test(n)) return 'warn';
  return ''; };
const evDesc = d => d && d !== '0' ? EVENT_DESCS[d] || '' : '';
const FT_EPOCH = 11644473600000;                      // FILETIME (100 нс от 1601) → мс Unix
const ftMs = s => Number(s) / 1e4 - FT_EPOCH;
function parseCsv(text) {
  const lines = text.split(/\r?\n/), out = [];
  for (let i = 0; i < lines.length; i++) {
    let l = lines[i];
    if (!l) continue;
    if (!l.includes('"')) { out.push(l.split(',')); continue; }
    while ((l.split('"').length - 1) % 2 && i + 1 < lines.length) l += '\n' + lines[++i];   // кавычка не закрыта — поле на нескольких строках
    const f = []; let cur = '', q = false;
    for (let k = 0; k < l.length; k++) {
      const c = l[k];
      if (q) { if (c === '"') { if (l[k + 1] === '"') { cur += '"'; k++; } else q = false; } else cur += c; }
      else if (c === '"') q = true;
      else if (c === ',') { f.push(cur); cur = ''; }
      else cur += c;
    }
    f.push(cur); out.push(f);
  }
  return out;
}
// Detalisation: «$%ключ%%значение%$$%…%$» → «ключ: значение; …»
const detText = s => [...s.matchAll(/\$%(.*?)%%(.*?)%\$/g)].map(m => `${m[1]}: ${m[2]}`).join('; ');
// Добавления выполняются по очереди; закрытие/замена отменяет старые задания.
let logQueue = Promise.resolve(), logGen = 0;
function readLogs(files) {
  const gen = logGen, batch = [...files];
  return logQueue = logQueue.then(async () => {
    if (gen !== logGen) return;
    try { await readLogsRun(batch, gen); }
    catch (e) { if (gen === logGen) logErr.value = 'Не удалось прочитать журнал: ' + e.message; }
    finally { logBusy.value = ''; }
  });
}
async function readLogsRun(files, gen) {
  const all = [...(logData.value?.files || [])], seen = new Set((logData.value?.rows || []).map(r => r.uid)), rows = [...(logData.value?.rows || [])];
  logErr.value = '';
  for (const f of files) {
    logBusy.value = 'Читаю ' + f.name + '…';
    await new Promise(r => setTimeout(r, 20));
    if (gen !== logGen) return;
    const text = await f.text();
    if (gen !== logGen) return;
    const t = parseCsv(text.replace(/^﻿/, ''));
    const h = Object.fromEntries((t[0] || []).map((c, i) => [c.trim(), i]));
    if (h.UID == null || h.ObjectUID == null || h.SystemDate == null) { logErr.value = `«${f.name}» не похож на журнал событий (нет колонок UID, ObjectUID, SystemDate)`; continue; }
    let n = 0;
    for (let i = 1; i < t.length; i++) {
      const c = t[i], uid = c[h.UID];
      if (!uid || seen.has(uid)) continue;
      seen.add(uid); n++;
      const ms = ftMs(c[h.SystemDate]);
      rows.push({ uid, t: Number.isFinite(ms) ? ms : 0, code: c[h.Name], desc: c[h.Description], text: c[h.DescriptionText], type: c[h.ObjectType], obj: c[h.ObjectUID], name: c[h.ObjectName], user: c[h.UserName], det: detText(c[h.Detalisation] || '') });
    }
    if (n) all.push({ name: f.name, blob: f, n });
  }
  if (all.length === (logData.value?.files.length || 0)) return;   // ничего нового — индексы не пересчитываем
  rows.sort((a, b) => b.t - a.t);
  const byObj = new Map(), codes = new Map();
  for (const r of rows) { (byObj.get(r.obj) || byObj.set(r.obj, []).get(r.obj)).push(r); codes.set(r.code, (codes.get(r.code) || 0) + 1); }
  logData.value = rows.length ? { files: all, rows, byObj, codes } : null;
  if (rows.length) idbDo('readwrite', s => s.put(all.map(f => ({ name: f.name, blob: f.blob, n: f.n })), 'log')).catch(() => {});
}
function clearLog() { logGen++; logData.value = null; logErr.value = ''; logBusy.value = ''; idbDo('readwrite', s => s.delete('log')).catch(() => {}); }
// ссылка «N событий» в панели деталей: события по списку ObjectUID
function logLink(uids, title) {
  const L = logData.value;
  if (!L) return '';
  const n = uids.reduce((s, u) => s + (L.byObj.get(u)?.length || 0), 0);
  return n ? [link(`${n} событий`, { log: uids, logTitle: title })] : '';
}
