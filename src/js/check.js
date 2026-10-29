const CHK = { before: 3e3, after: 90e3, restore: 120e3, merge: 600e3, gap: 120e3, early: 3600e3, pre: 600e3, loop: 10 };
const CHK_CLS = { ok: 'по сценарию', pwr: 'восстановление после потери питания/связи', man: 'ручной режим устройства', off: 'сценарий отключён', idle: 'сценарий не включался', raw: 'без команды', none: 'нет сценария-исполнителя' };
const CHK_BAD = new Set(['off', 'idle', 'raw']);
const CHK_MODE = { 20020097: 'a', 20020098: 'm', 20020099: 'o' };
const CHK_FAULT = new Set(['20020094', '20020059', '20020060', '20020029']);
const CHK_CTX = { 20020056: 'Пожар‑2', 20020053: 'Пожар‑1', 20020041: 'вход пользователя', 20020036: 'технологический режим' };
const CHK_TL = 3600e3;
const CHK_LANES = [['fire', 'Пожар / Внимание', '#e5484d'], ['fault', 'Неисправности', '#e6c229'], ['mode', 'Режимы', '#9a85d6'], ['scen', 'Сценарии', '#3e8ed0']];
const CHK_FIRE = new Set(['20020053', '20020054', '20020055', '20020056', '20020057', '20020058']);
const chkLine = n => (/(\d+\.\d+\.\d+)\.\d+\s*$/.exec(n) || [])[1] || '';
const chkPush = (m, k, v) => { const a = m.get(k); a ? a.push(v) : m.set(k, [v]); };
let chkCache = null;
const chkCount = ref(null);

function chkRun(m, L) {
  const rows = L.rows.slice().reverse();
  const t0 = rows.length ? rows[0].t : 0;
  const modes = new Map(), faults = new Map(), iv = new Map(), cur = new Map(), ctx = [], tl = [], dst = new Map();
  for (const r of rows) {
    const c = r.code, mo = CHK_MODE[c];
    const ln = CHK_FIRE.has(c) ? 'fire' : CHK_FAULT.has(c) ? 'fault' : m.delay.has(r.obj) && (c === '20020068' || c === '20020069' || c === '20020070') ? 'scen' : '';
    if (ln) tl.push([r.t, ln, c, r.name || '', r.type, r.obj]);
    if (mo) chkPush(modes, r.obj, [r.t, mo]);
    else if (CHK_FAULT.has(c)) chkPush(faults, r.obj, r.t);
    else if (CHK_CTX[c]) ctx.push([r.t, CHK_CTX[c]]);
    if (m.delay.has(r.obj)) {
      if (c === '20020068' || c === '20020069' || c === '20020070') chkPush(dst, r.obj, [r.t, c]);
      if (c === '20020068' || c === '20020070') { if (!cur.has(r.obj)) cur.set(r.obj, r.t); }
      else if (c === '20020069' && cur.has(r.obj)) { chkPush(iv, r.obj, [cur.get(r.obj), r.t]); cur.delete(r.obj); }
    }
  }
  for (const [u, s] of cur) chkPush(iv, u, [s, Infinity]);
  const stAt = (u, t) => { let r = ''; for (const [tt, c] of dst.get(u) || []) { if (tt <= t) r = c; else break; } return r; };
  const modeAt = (u, t) => { let r = 'a'; for (const [tt, mo] of modes.get(u) || []) { if (tt <= t) r = mo; else break; } return r; };
  const active = (u, t) => (iv.get(u) || []).some(([s, e]) => s - CHK.before <= t && t <= e + CHK.after);
  const nearFault = (u, t) => (faults.get(u) || []).some(f => (t - f >= 0 && t - f <= CHK.restore) || (f - t >= 0 && f - t <= CHK.before));
  const duid = new Map(m.delays.map(d => [d, txt(d, 'UID')]));
  const dlab = d => ({ u: duid.get(d), l: `[${txt(d, 'No')}] ${txt(d, 'Name')}` });
  const stats = Object.fromEntries(Object.keys(CHK_CLS).map(k => [k, 0]));
  const cand = [], last = new Map(), openIt = new Map();
  for (const r of rows) {
    const c = r.code;
    if (c !== '20020068' && c !== '20020070' && c !== '20020069' && c !== '20020071') continue;
    const u = r.obj;
    if (!m.dev.has(u)) continue;
    if (c === '20020069' || c === '20020071') { last.set(u, [c, r.t]); continue; }
    const pv = last.get(u);
    if (pv && (pv[0] === '20020068' || pv[0] === '20020070') && r.t - pv[1] < CHK.merge) { const oi = openIt.get(u); if (oi && oi.on === null && c === '20020068') oi.on = r.t; if (c === '20020070') last.set(u, [c, r.t]); continue; }
    last.set(u, [c, r.t]);
    const ds = m.delaysByDev.get(u) || [];
    const cls = !ds.length ? 'none' : ds.some(d => active(duid.get(d), r.t)) ? 'ok' : modeAt(u, r.t) === 'm' ? 'man'
      : c === '20020068' && nearFault(u, r.t) ? 'pwr' : ds.some(d => modeAt(duid.get(d), r.t) === 'o') ? 'off' : c === '20020068' ? 'raw' : 'idle';
    stats[cls]++;
    if (CHK_BAD.has(cls)) { const it = { t: r.t, on: c === '20020068' ? r.t : null, u, name: r.name || u, cls, line: chkLine(r.name || ''), pars: ds.map(dlab), pm: ds.map(d => modeAt(duid.get(d), r.t)), early: r.t - t0 < CHK.early }; cand.push(it); openIt.set(u, it); }
  }
  const items = cand.filter(i => i.on !== null).map(i => ({ ...i, t: i.on })).sort((a, b) => a.t - b.t);
  const eps = [];
  for (const it of items) {
    const e = eps[eps.length - 1];
    if (e && it.t - e.t1 < CHK.gap) { e.items.push(it); e.t1 = it.t; }
    else eps.push({ t0: it.t, t1: it.t, items: [it] });
  }
  for (const e of eps) {
    const lines = new Map(), pars = new Map(), kinds = {}, tags = new Set();
    for (const it of e.items) {
      if (it.line) lines.set(it.line, (lines.get(it.line) || 0) + 1);
      for (const p of it.pars) pars.set(p.l, { u: p.u, n: (pars.get(p.l)?.n || 0) + 1 });
      kinds[it.cls] = (kinds[it.cls] || 0) + 1;
    }
    for (const [t, tag] of ctx) { if (t >= e.t0 - CHK.gap && t <= e.t0 + CHK.before) tags.add(tag); }
    const [ln, lc] = [...lines].sort((a, b) => b[1] - a[1])[0] || ['', 0];
    { let lo = 0, hi = tl.length; while (lo < hi) { const md = (lo + hi) >> 1; tl[md][0] < e.t0 - CHK_TL ? lo = md + 1 : hi = md; } const pre = [], seen = new Map(); for (let i = lo; i < tl.length && tl[i][0] < e.t0; i++) if (tl[i][1] === 'fault' || tl[i][0] >= e.t0 - CHK.pre) { const k = tl[i][1] + tl[i][2] + tl[i][3]; if (seen.has(k) && tl[i][0] - seen.get(k) < 10e3) continue; seen.set(k, tl[i][0]); pre.push(tl[i]); } e.pre = pre; }
    e.sc = [...pars].map(([l, v]) => { const d = m.delay.get(v.u), tot = d ? subs(d, 'DirectionDevices', 'DirectionDevice').length : 0; const on = new Set(e.items.filter(i => i.pars.some(p => p.u === v.u)).map(i => i.u)).size; return { u: v.u, l, tot, on, mode: modeAt(v.u, e.t0), st: stAt(v.u, e.t0), act: active(v.u, e.t0) }; }).sort((a, b) => b.on - a.on);
    const rel = new Set(), par = new Map(), st = e.sc.map(x => x.u);
    while (st.length) { const u = st.pop(); if (rel.has(u)) continue; rel.add(u); const d = m.delay.get(u), lg = d && child(d, 'Logic'), ps = []; if (lg) for (const n of lg.querySelectorAll('DelayUIDs')) for (const g of n.textContent.match(/[0-9a-f]{8}-[0-9a-f-]{27}/gi) || []) { ps.push(g); st.push(g); } par.set(u, ps); }
    for (const x of e.sc) { const seen = new Set([x.u]), q = [...(par.get(x.u) || [])]; x.up = []; while (q.length) { const u = q.shift(); if (seen.has(u)) continue; seen.add(u); const d = m.delay.get(u); if (d) x.up.push({ u, l: delayLabel(d), mode: modeAt(u, e.t0), st: stAt(u, e.t0), act: active(u, e.t0) }); q.push(...(par.get(u) || [])); } }
    const starts = e.pre.filter(x => x[1] === 'scen' && (x[2] === '20020068' || x[2] === '20020070') && rel.has(x[5]));
    const roots = starts.filter(x => !(par.get(x[5]) || []).length);
    const root = (roots.length ? roots : starts)[0];
    let cause = null;
    const rd = root && m.delay.get(root[5]), rl = rd && child(rd, 'Logic');
    if (rl) {
      const ids = new Set(); for (const n of rl.querySelectorAll('ZoneUIDs, DeviceUIDs')) for (const g of n.textContent.match(/[0-9a-f]{8}-[0-9a-f-]{27}/gi) || []) ids.add(g.toLowerCase());
      for (const x of e.pre) if (x[1] === 'fire' && x[0] <= root[0] && root[0] - x[0] <= 60e3 && ids.has(String(x[5]).toLowerCase()) && (!cause || x[0] >= cause[0])) cause = x;
    }
    let trig = [];
    if (cause && String(cause[4]) === '2') {
      const zd = new Set((m.devByZone.get(String(cause[5])) || m.devByZone.get(String(cause[5]).toLowerCase()) || []).map(d => txt(d, 'UID').toLowerCase()));
      trig = e.pre.filter(x => x[1] === 'fire' && String(x[4]) === '1' && x[0] <= cause[0] && zd.has(String(x[5]).toLowerCase())).slice(-8);
    }
    e.pre = e.pre.filter(x => x[1] === 'fault').concat(trig, cause ? [cause] : [], root ? [root] : []);
    e.nFault = e.pre.filter(x => x[1] === 'fault').length;
    e.n = e.items.length; e.kinds = kinds; e.tags = [...tags];
    e.pars = [...pars].sort((a, b) => b[1].n - a[1].n).slice(0, 4).map(([l, v]) => ({ u: v.u, l, n: v.n }));
    e.loop = lc >= CHK.loop && lc >= e.n * 0.7 ? { line: ln, n: lc } : null;
    e.early = e.items.every(i => i.early);
    e.manual = tags.has('вход пользователя') || tags.has('технологический режим');
    e.key = !!e.loop && !e.manual;
  }
  return { t0, t1: rows.length ? rows[rows.length - 1].t : 0, total: rows.length, stats, items, eps };
}

async function chkGet() {
  const L = logData.value;
  if (!L || !model.value) return null;
  if (chkCache && chkCache.L === L && chkCache.m === model.value) return chkCache.res;
  await new Promise(r => setTimeout(r, 30));
  const res = chkRun(model.value, L);
  chkCache = { L, m: model.value, res };
  return res;
}
