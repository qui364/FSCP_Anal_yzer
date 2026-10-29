// граф «устройства зон → зоны → сценарии → исполнители» по условиям сценариев (для имитации на плане)
// узлы: i:<uid> (устройство в зоне / в условии), z:<uid>, d:<uid>, o:<uid> (устройство в DirectionDevices); связи идут слева направо
function buildGraph() {
  const m = model.value;
  if (m.graph) return m.graph;
  const nodes = [], idx = new Map(), emap = new Map();
  const add = (kind, uid, lab, no = 0) => {
    const id = kind + ':' + uid;
    let i = idx.get(id);
    if (i == null) { i = nodes.length; idx.set(id, i); nodes.push({ id, kind, uid, label: lab(), no, in: [], out: [], layer: 0, pos: 0.5, placed: false }); }
    return i;
  };
  const link = (a, b, st, raw) => {
    const k = a + '>' + b;
    let e = emap.get(k);
    if (!e) { e = { a, b, st: new Set(), raw: new Set() }; emap.set(k, e); nodes[a].out.push(b); nodes[b].in.push(a); }
    if (st) e.st.add(st);
    if (raw) e.raw.add(raw);
  };
  const dlab = u => () => devLabel(m.dev.get(u));
  for (const d of m.delays) add('d', txt(d, 'UID'), () => delayLabel(d), +txt(d, 'No') || 0);
  const zoneDone = new Set();
  const zone = u => {
    const z = m.zone.get(u), zi = add('z', u, () => zoneLabel(z), +txt(z, 'No') || 0);
    nodes[zi].f1 = +txt(z, 'Fire1Count') || 1;   // сколько датчиков зоны нужно для «Пожар 1» / «Пожар 2»
    nodes[zi].f2 = +txt(z, 'Fire2Count') || 2;
    if (!zoneDone.has(u)) {
      zoneDone.add(u);
      for (const dv of m.devByZone.get(u) || []) { const x = txt(dv, 'UID'); link(add('i', x, dlab(x)), zi, ''); }
    }
    return zi;
  };
  for (const d of m.delays) {
    const du = txt(d, 'UID'), di = idx.get('d:' + du);
    for (const c of d.querySelectorAll('Logic GKClause')) {
      const s = txt(c, 'StateType'), st = ST[s] || s;
      for (const u of guids(c, 'ZoneUIDs')) if (m.zone.has(u)) link(zone(u), di, st, s);
      for (const u of guids(c, 'DeviceUIDs')) if (m.dev.has(u)) link(add('i', u, dlab(u)), di, st, s);
      for (const u of guids(c, 'DelayUIDs')) if (m.delay.has(u) && u !== du) link(idx.get('d:' + u), di, st, s);
    }
    for (const x of subs(d, 'DirectionDevices', 'DirectionDevice')) {
      const u = txt(x, 'DeviceUid');
      if (m.dev.has(u)) link(di, add('o', u, dlab(u)), '');
    }
  }
  // слои: 0 — устройства зон, 1 — зоны, 2+глубина — сценарии (цепочки «сценарий → сценарий»), последний — исполнители
  const dep = new Map();
  const depth = i => {
    if (dep.has(i)) return dep.get(i);
    dep.set(i, 0);   // защита от циклов
    let b = 0;
    for (const p of nodes[i].in) if (nodes[p].kind === 'd') b = Math.max(b, depth(p) + 1);
    dep.set(i, b);
    return b;
  };
  let maxD = 0;
  nodes.forEach((n, i) => { if (n.kind === 'd') { n.layer = 2 + depth(i); maxD = Math.max(maxD, n.layer - 2); } });
  const L = 4 + maxD;
  nodes.forEach(n => { if (n.kind === 'z') n.layer = 1; else if (n.kind === 'o') n.layer = L - 1; });
  const byLayer = Array.from({ length: L }, () => []);
  nodes.forEach((n, i) => byLayer[n.layer].push(i));
  // порядок внутри слоя — по среднему положению связанных узлов предыдущих слоёв (меньше пересечений)
  const place = (l, key) => {
    const a = byLayer[l], ks = new Map(a.map(i => [i, key(i)]));
    a.sort((p, q) => ks.get(p) - ks.get(q) || nodes[p].no - nodes[q].no || nodes[p].label.localeCompare(nodes[q].label, 'ru'));
    a.forEach((i, k) => { nodes[i].pos = a.length > 1 ? k / (a.length - 1) : 0.5; nodes[i].placed = true; });
  };
  const avg = (i, dir) => { const ps = nodes[i][dir].filter(p => nodes[p].placed).map(p => nodes[p].pos); return ps.length ? ps.reduce((s, x) => s + x, 0) / ps.length : 0.5; };
  place(1, i => nodes[i].no);
  place(0, i => avg(i, 'out'));
  for (let l = 2; l < L; l++) place(l, i => avg(i, 'in'));
  // сетка в плоскости YZ каждого слоя, слои расставлены по X
  const GAP = 45, P = new Float32Array(nodes.length * 3);
  byLayer.forEach((a, l) => {
    const n = a.length;
    if (!n) return;
    const cols = Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols), s = Math.min(6, 80 / cols);
    a.forEach((i, k) => {
      P[i * 3] = l * GAP;
      P[i * 3 + 1] = ((rows - 1) / 2 - ((k / cols) | 0)) * s;
      P[i * 3 + 2] = ((k % cols) - (cols - 1) / 2) * s;
    });
  });
  return m.graph = { nodes, idx, emap, edges: [...emap.values()], P, P0: P.slice(), L };
}

// схема строится автоматически: узлы графа схлопываются в группы по шаблону имени (числа → №; устройства — по типу драйвера), слои — как выше

// модель имитации: сценарии с условиями (GKClause, И/ИЛИ) и зоны с порогами Fire1Count/Fire2Count; кэш model.sim
function buildSim() {
  const m = model.value;
  if (m.sim) return m.sim;
  const zones = new Map(), delays = [];
  for (const [u, z] of m.zone) zones.set(u, { devs: (m.devByZone.get(u) || []).map(d => txt(d, 'UID')), f1: +txt(z, 'Fire1Count') || 1, f2: +txt(z, 'Fire2Count') || 2 });
  for (const d of m.delays) {
    const grp = d.querySelector('Logic OnClausesGroup');
    const clauses = [...d.querySelectorAll('Logic OnClausesGroup > Clauses > GKClause')].map(c => ({
      st: txt(c, 'StateType'), all: /^All/.test(txt(c, 'ClauseOperationType')),
      devs: guids(c, 'DeviceUIDs'), zones: guids(c, 'ZoneUIDs'), delays: guids(c, 'DelayUIDs'),
    }));
    delays.push({ uid: txt(d, 'UID'), and: grp ? txt(grp, 'ClauseJoinOperationType') === 'And' : false, clauses, out: subs(d, 'DirectionDevices', 'DirectionDevice').map(x => txt(x, 'DeviceUid')) });
  }
  return (m.sim = { zones, delays });
}
// manual — UID, нажатые вручную; результат: lit — сработавшие UID, zl — уровень зоны (1 Внимание, 2 Пожар 1, 3 Пожар 2)
function simRun(manual) {
  const S = buildSim(), lit = new Set(manual), zl = new Map(), done = new Set();
  const zlev = u => {
    const z = S.zones.get(u);
    if (manual.has(u)) return 3;
    if (!z) return 0;
    const n = z.devs.reduce((a, d) => a + (manual.has(d) ? 1 : 0), 0);   // считаются только нажатые датчики, не включённые исполнители
    return n >= z.f2 ? 3 : n >= z.f1 ? 2 : n ? 1 : 0;
  };
  const need = { Attention: 1, Fire1: 2, Fire2: 3 };
  const ok = c => {
    const t = [];
    if (c.st === 'Failure' || c.st === 'Off') return false;   // неисправности и «Выключено» не имитируются
    for (const u of c.devs) t.push(c.st === 'On' ? lit.has(u) : manual.has(u));   // Пожар/Внимание — только нажатое устройство, «Включено» — ещё и включённое сценарием
    for (const u of c.delays) t.push(lit.has(u));
    for (const u of c.zones) t.push(zlev(u) >= (need[c.st] || 1));
    if (!t.length) return false;
    return c.all ? t.every(Boolean) : t.some(Boolean);
  };
  for (let ch = true; ch;) {
    ch = false;
    for (const d of S.delays) {
      if (done.has(d.uid)) continue;
      const r = lit.has(d.uid) || (d.clauses.length && (d.and ? d.clauses.every(ok) : d.clauses.some(ok)));   // нажатый вручную сценарий тоже включает исполнителей
      if (r) { done.add(d.uid); lit.add(d.uid); for (const o of d.out) lit.add(o); ch = true; }
    }
  }
  for (const u of S.zones.keys()) { const l = zlev(u); if (l) { zl.set(u, l); lit.add(u); } }
  return { lit, zl };
}
