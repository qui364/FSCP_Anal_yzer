// страница «Логика» (дочерний пункт «Сценарии»): граф «устройства зон → зоны → сценарии → исполнители», схлопнутый в группы по шаблону имени
const GK_NAME = { i: 'Устройство зоны', z: 'Зона', d: 'Сценарий', o: 'Исполнитель' };
const gkClass = n => n.kind === 'z' ? 'zone' : n.kind === 'd' ? 'delay' : 'dev';

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
const L3_ND = /\d+(?:[.,]\d+)*/g;
function buildLogicGroups() {
  const m = model.value;
  if (m.lgroups) return m.lgroups;
  const g = buildGraph(), gi = new Map(), groups = [], emap = new Map(), of = new Map();
  // ШУН-В и МДУ делятся на ДП / ДВ / ОЗК: по описанию устройства, иначе по имени сценария, где оно исполнитель
  const SUB = /(?<![А-ЯЁа-яё])(ДП|ДВ|ОЗК)/;
  const subOf = n => {
    const x = SUB.exec((txt(m.dev.get(n.uid), 'Description') || '').toUpperCase());
    if (x) return x[1];
    for (const p of n.in) { const y = SUB.exec(g.nodes[p].label.toUpperCase()); if (y) return y[1]; }
    return '';
  };
  const MVK = /СТРОБ|ШТОР/;
  const mvkOf = n => {
    for (const s of [(txt(m.dev.get(n.uid), 'Description') || ''), ...n.in.map(p => g.nodes[p].label)]) { const x = MVK.exec(s.toUpperCase()); if (x) return x[0] === 'СТРОБ' ? 'стробы' : 'шторы'; }
    return '';
  };
  const devGroup = n => { const r = devName(m.dev.get(n.uid)); if (n.kind === 'o' && r === 'МВК') return ('МВК ' + mvkOf(n)).trim(); return n.kind === 'o' && (r === 'ШУН-В' || /^МДУ/.test(r)) ? (r + ' ' + subOf(n)).trim() : r; };
  const tpl = n => n.label.replace(/^\[[^\]]*\]\s*/, '').replace(L3_ND, '№').replace(/\s+/g, ' ').trim();
  // устройства делятся ещё и по набору связанных сценариев (по шаблону имени): в группу «РМ» попадают только РМ с одинаковыми связями
  const tplN = new Map();
  for (const x of g.nodes) if (x.kind === 'd') { const t = tpl(x); tplN.set(t, (tplN.get(t) || 0) + 1); }
  const real = x => x.label.replace(/^\[[^\]]*\]\s*/, '').trim();   // шаблон с «№» нужен, только если под ним несколько сценариев
  const sig = n => [...new Set((n.kind === 'i' ? n.out : n.in).filter(b => g.nodes[b].kind === 'd').map(b => tplN.get(tpl(g.nodes[b])) === 1 ? real(g.nodes[b]) : tpl(g.nodes[b])))].sort().join('|');
  const grp = n => {
    const dv = n.kind === 'i' || n.kind === 'o', raw = dv ? devGroup(n) : tpl(n);
    const key = n.kind + ':' + n.layer + ':' + raw + (dv ? ':' + sig(n) : '');
    let k = gi.get(key);
    if (k == null) { k = groups.length; gi.set(key, k); groups.push({ id: key, kind: n.kind, layer: n.layer, label: raw || '—', sub: dv ? sig(n).replace(/\|/g, ', ') : '', dup: 0, members: [], out: new Set(), in: new Set(), pos: 0 }); }
    groups[k].members.push(n);
    return k;
  };
  g.nodes.forEach((n, i) => {
    // устройства зон входят в схему только если участвуют в условиях сценариев напрямую
    if (n.kind === 'i' ? n.out.some(b => g.nodes[b].kind === 'd') : n.in.length || n.out.length) of.set(i, grp(n));
  });
  // подпись «← сценарии» нужна только когда в слое несколько групп с одним именем
  // у группы из одного сценария/зоны «№» вместо числа не нужен — показываем настоящее имя
  for (const x of groups) if ((x.kind === 'd' || x.kind === 'z') && x.members.length === 1) x.label = x.members[0].label.replace(/^\[[^\]]*\]\s*/, '').trim() || x.label;
  const same = new Map();
  for (const x of groups) { const k = x.layer + ':' + x.label; same.set(k, (same.get(k) || 0) + 1); }
  for (const x of groups) x.dup = same.get(x.layer + ':' + x.label) > 1 && x.sub ? 1 : 0;
  g.nodes.forEach((n, i) => {
    if (!of.has(i)) return;
    for (const b of n.out) {
      if (!of.has(b)) continue;
      const a = of.get(i), c = of.get(b);
      if (a === c) continue;
      const k = a + '>' + c;
      emap.set(k, (emap.get(k) || 0) + 1);
      groups[a].out.add(c); groups[c].in.add(a);
    }
  });
  const edges = [...emap].map(([k, w]) => { const [a, b] = k.split('>').map(Number); return { a, b, w }; });
  const layers = [...new Set(groups.map(x => x.layer))].sort((p, q) => p - q);
  const cols = layers.map(l => groups.filter(x => x.layer === l));
  const order = (col, dir) => {
    const av = x => { const s = [...x[dir]].map(i => groups[i].pos); return s.length ? s.reduce((u, v) => u + v, 0) / s.length : x.pos; };
    const ks = new Map(col.map(x => [x, av(x)]));
    col.sort((p, q) => ks.get(p) - ks.get(q) || p.label.localeCompare(q.label, 'ru')).forEach((x, i) => { x.pos = i; });
  };
  cols.forEach(c => c.sort((p, q) => p.label.localeCompare(q.label, 'ru')).forEach((x, i) => { x.pos = i; }));
  for (let r = 0; r < 3; r++) { for (let c = 1; c < cols.length; c++) order(cols[c], 'in'); for (let c = cols.length - 2; c >= 0; c--) order(cols[c], 'out'); }
  return (m.lgroups = { groups, edges, cols });
}

const LogicView = {
  setup() {
    const g = buildLogicGroups(), hov = ref(''), pin = ref(''), more = ref(new Set()), openI = ref(new Set()), closing = ref(new Set()), svg = ref(null), v = ref({ k: 1, x: 0, y: 0 });
    const ls = (k, d) => { try { return localStorage.getItem('fscp.l3' + k) || d; } catch (e) { return d; } };
    const animOn = ref(ls('Anim', '1') === '1'), align = ref(ls('Align', 'center'));
    const COLW = 250, NW = 190, NH = 34, GAP = 8, PAD = 16;
    // раскладка: subset (Set индексов групп) или null — все; пустые колонки схлопываются, колонка центрируется по высоте
    const LH = 34, MAXL = 40;
    const descOf = m => m.more || (m.kind !== 'i' && m.kind !== 'o') ? '' : (txt(model.value.dev.get(m.uid), 'Description') || '').trim();
    const listOf = i => { const m = g.groups[i].members; return more.value.has(i) || m.length <= MAXL ? m : [...m.slice(0, MAXL), { more: true, label: '… и ещё ' + (m.length - MAXL) }]; };
    let fs = null;   // текущее подмножество раскладки (фокус)
    const layout = subset => {
      fs = subset;
      const cols = g.cols.map(c => subset ? c.filter(x => subset.has(g.groups.indexOf(x))) : c).filter(c => c.length);
      // раскрытый блок (список состава) сдвигает вниз остальные блоки своего столбца
      const hs = cols.map(c => c.map(x => { const i = g.groups.indexOf(x); return NH + GAP + (openI.value.has(i) ? listOf(i).length * LH + 8 : 0); }));
      const tot = hs.map(h => h.reduce((s, x) => s + x, 0) - GAP), colH = Math.max(NH, ...tot), pos = new Map();
      cols.forEach((c, ci) => { let y = PAD + (colH - tot[ci]) * ({ top: 0, center: 0.5, bottom: 1 }[align.value]); c.forEach((x, i) => { pos.set(g.groups.indexOf(x), { x: PAD + ci * COLW, y }); y += hs[ci][i]; }); });
      const edges = g.edges.filter(e => pos.has(e.a) && pos.has(e.b)).map(e => {
        const A = pos.get(e.a), B = pos.get(e.b), x1 = A.x + NW, y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2, c = Math.max(40, (x2 - x1) / 2);
        return { ...e, d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`, sw: 1 + Math.min(3, Math.log10(e.w)), kind: g.groups[e.a].kind };
      });
      return { pos, edges, shown: [...pos.keys()], W: PAD * 2 + Math.max(0, cols.length - 1) * COLW + NW, H: PAD * 2 + colH };
    };
    const lay = shallowRef(layout(null)), focus = ref(''), anim = shallowRef({ from: lay.value, to: lay.value, t: 1 });
    const ease = x => x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
    // сцена: позиции и прозрачность интерполируются между старой и новой раскладкой (вошедшие проявляются, ушедшие гаснут)
    const scene = computed(() => {
      const { from, to, t } = anim.value, e = ease(t), lerp = (a, b) => a + (b - a) * e;
      const posOf = i => { const a = from.pos.get(i), b = to.pos.get(i); return a && b ? { x: lerp(a.x, b.x), y: lerp(a.y, b.y) } : a || b; };
      const ids = new Set([...from.pos.keys(), ...to.pos.keys()]);
      const nodes = [...ids].map(i => { const a = from.pos.has(i), b = to.pos.has(i), p = posOf(i); return { i, x: p.x, y: p.y, al: a && b ? 1 : b ? e : 1 - e }; });
      const es = new Map();
      for (const e0 of from.edges) es.set(e0.a + '>' + e0.b, { ...e0, inA: true });
      for (const e1 of to.edges) { const k = e1.a + '>' + e1.b, o = es.get(k); es.set(k, o ? { ...o, inB: true } : { ...e1, inB: true }); }
      const edges = [...es].map(([k, x]) => {
        const A = posOf(x.a), B = posOf(x.b), x1 = A.x + NW, y1 = A.y + NH / 2, x2 = B.x, y2 = B.y + NH / 2, c = Math.max(40, (x2 - x1) / 2);
        return { ...x, k, d: `M${x1},${y1} C${x1 + c},${y1} ${x2 - c},${y2} ${x2},${y2}`, al: x.inA && x.inB ? 1 : x.inB ? e : 1 - e };
      });
      return { nodes, edges };
    });
    let raf = 0;
    const animate = (from, to, v0, v1) => {
      cancelAnimationFrame(raf);
      if (!animOn.value) { anim.value = { from: to, to, t: 1 }; v.value = v1; return; }
      const s = performance.now(), D = 400;
      const step = now => {
        const t = Math.min(1, (now - s) / D), e = ease(t);
        anim.value = { from, to, t };
        v.value = { k: v1.k, x: v0.x + (v1.x - v0.x) * e, y: v0.y + (v1.y - v0.y) * e };
        if (t < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    onBeforeUnmount(() => cancelAnimationFrame(raf));
    const sel = computed(() => pin.value !== '' ? pin.value : hov.value);
    const walk = (s, dir) => { const r = new Set([s]), q = [s]; while (q.length) { const x = q.pop(); for (const y of g.groups[x][dir]) if (!r.has(y)) { r.add(y); q.push(y); } } return r; };
    const flow = computed(() => sel.value === '' ? null : { down: walk(sel.value, 'out'), up: walk(sel.value, 'in') });
    const nodeOn = i => !flow.value || flow.value.down.has(i) || flow.value.up.has(i);
    const P = i => lay.value.pos.get(i);
    const edgeOn = e => !flow.value || (flow.value.down.has(e.a) && flow.value.down.has(e.b)) || (flow.value.up.has(e.a) && flow.value.up.has(e.b));
    const onWheel = ev => {
      const r = svg.value.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top, o = v.value;
      const k = Math.min(4, Math.max(0.05, o.k * Math.exp(-ev.deltaY * 0.0015)));
      v.value = { k, x: px - (px - o.x) * k / o.k, y: py - (py - o.y) * k / o.k };
    };
    let drag = null, moved = false;
    const down = ev => { if (ev.button) return; drag = { sx: ev.clientX, sy: ev.clientY, x: v.value.x, y: v.value.y }; moved = false; };
    const move = ev => {
      if (!drag) return;
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) { moved = true; svg.value.setPointerCapture(ev.pointerId); }
      if (moved) v.value = { ...v.value, x: drag.x + dx, y: drag.y + dy };
    };
    const up = () => { drag = null; };
    // двойной клик по блоку — оставить только его путь (вверх и вниз) и выстроить заново; ещё раз — вернуть всё
    const focusOn = i => {
      const was = focus.value !== '', a = was && !lay.value.pos.has(i) ? focus.value : i, from = lay.value, o = from.pos.get(a);
      if (!was) { const f = new Set([...walk(i, 'out'), ...walk(i, 'in')]); focus.value = i; lay.value = layout(f); }
      else { focus.value = ''; lay.value = layout(null); }
      pin.value = was ? '' : i;
      const n = lay.value.pos.get(a), s = v.value.k;   // блок под курсором остаётся на месте экрана
      const v0 = v.value, v1 = o && n ? { k: s, x: v0.x + (o.x - n.x) * s, y: v0.y + (o.y - n.y) * s } : v0;
      animate(from, lay.value, v0, v1);
    };
    // списки состава открываются и закрываются независимо (по клику на число), сами не закрываются; закрытие — с анимацией
    const isOpen = i => openI.value.has(i), leaving = i => closing.value.has(i);
    const setOpen = (i, all) => {
      const from = lay.value, o = new Set(openI.value), mo = new Set(more.value), cl = new Set(closing.value);
      if (all) mo.add(i);
      else if (o.has(i)) {
        o.delete(i);
        if (animOn.value) {
          cl.add(i);
          setTimeout(() => { const c = new Set(closing.value), m2 = new Set(more.value); c.delete(i); if (!openI.value.has(i)) m2.delete(i); closing.value = c; more.value = m2; }, 300);
        } else mo.delete(i);
      } else { o.add(i); cl.delete(i); }
      openI.value = o; more.value = mo; closing.value = cl;
      lay.value = layout(fs); animate(from, lay.value, v.value, v.value);
    };
    const save = () => { try { localStorage.setItem('fscp.l3Anim', animOn.value ? '1' : '0'); localStorage.setItem('fscp.l3Align', align.value); } catch (e) { } };
    const setAlign = a => { align.value = a; save(); const from = lay.value; lay.value = layout(fs); animate(from, lay.value, v.value, v.value); };
    const toggleAnim = () => { animOn.value = !animOn.value; save(); };
    const fit = () => {
      const r = svg.value.getBoundingClientRect(), L = lay.value, k = Math.min(r.width / L.W, r.height / L.H, 1.5);
      animate(lay.value, lay.value, v.value, { k, x: (r.width - L.W * k) / 2, y: (r.height - L.H * k) / 2 });
    };
    const bgClick = ev => { if (focus.value !== '' && !moved && !ev.target.closest('.l3-n')) focusOn(focus.value); };
    const click = i => { if (!moved) focusOn(i); };
    const cur = computed(() => pin.value === '' ? null : g.groups[pin.value]);
    const kindName = k => GK_NAME[k] || k;
    const cls = n => 'k-' + gkClass(n);
    const goto = n => openTree(n.kind === 'z' ? 'zone' : n.kind === 'd' ? 'delay' : 'dev', n.uid);
    return { animOn, align, setAlign, toggleAnim, fit, scene, lay, focus, focusOn, bgClick, P, svg, v, onWheel, down, move, up, g, hov, pin, more, NW, NH, nodeOn, edgeOn, click, isOpen, leaving, setOpen, listOf, descOf, more, LH, cur, kindName, cls, goto, gkClass };
  },
  template: `<div class="l3">
  <div class="l3-bar">
    <button :class="{ on: animOn }" @click="toggleAnim">Анимация: {{ animOn ? 'вкл' : 'выкл' }}</button>
    <button @click="fit">Вписать</button>
    <span class="m">Выравнивание:</span>
    <button v-for="a in [['top', 'Верх'], ['center', 'Центр'], ['bottom', 'Низ']]" :key="a[0]" :class="{ on: align === a[0] }" @click="setAlign(a[0])">{{ a[1] }}</button>
  </div>
  <svg ref="svg" class="l3-svg" @wheel.prevent="onWheel" @pointerdown="down" @pointermove="move" @pointerup="up" @pointercancel="up" @click="bgClick" @mouseleave="hov = ''"><g :transform="'translate(' + v.x + ' ' + v.y + ') scale(' + v.k + ')'">
    <g v-for="e in scene.edges" :key="e.k" :opacity="e.al"><path :d="e.d" :stroke-width="e.sw" :class="['l3-e', cls(e), { off: !edgeOn(e) }]" /></g>
    <g v-for="n in scene.nodes.filter(x => isOpen(x.i) || leaving(x.i))" :key="'l' + n.i" :opacity="n.al" class="l3-lst">
      <g v-for="(m, k) in listOf(n.i)" :key="k" :class="['l3-r', cls(g.groups[n.i]), { more: m.more, out: !isOpen(n.i) }]" :style="{ animationDelay: isOpen(n.i) ? Math.min(k * 30, 600) + 'ms' : '0ms' }" @click.stop="m.more ? setOpen(n.i, true) : goto(m)">
        <rect :x="n.x + 18" :y="n.y + NH + 4 + k * LH" :width="NW - 36" :height="LH - 4" rx="6" />
        <title v-if="descOf(m)">{{ m.label + ' — ' + descOf(m) }}</title>
        <text :x="n.x + 28" :y="n.y + NH + 4 + k * LH + (descOf(m) ? 13 : 19)">{{ m.label.length > 22 ? m.label.slice(0, 21) + '…' : m.label }}</text>
        <text v-if="descOf(m)" class="l3-s" :x="n.x + 28" :y="n.y + NH + 4 + k * LH + 25">{{ descOf(m).length > 26 ? descOf(m).slice(0, 25) + '…' : descOf(m) }}</text>
      </g>
    </g>
    <g v-for="n in scene.nodes" :key="n.i" :opacity="n.al"><g :class="['l3-n', cls(g.groups[n.i]), { off: !nodeOn(n.i), pin: pin === n.i }]" @mouseenter="hov = n.i" @click="click(n.i)">
      <rect :x="n.x" :y="n.y" :width="NW" :height="NH" rx="7" />
      <title v-if="g.groups[n.i].sub">{{ g.groups[n.i].label + ' ← ' + g.groups[n.i].sub }}</title>
      <text :x="n.x + 12" :y="n.y + (g.groups[n.i].dup ? 15 : NH / 2 + 4)">{{ g.groups[n.i].label.length > 20 ? g.groups[n.i].label.slice(0, 19) + '…' : g.groups[n.i].label }}</text>
      <text v-if="g.groups[n.i].dup" class="l3-s" :x="n.x + 12" :y="n.y + 28">{{ (g.groups[n.i].kind === 'i' ? '→ ' : '← ') + (g.groups[n.i].sub.length > 28 ? g.groups[n.i].sub.slice(0, 27) + '…' : g.groups[n.i].sub) }}</text>
      <line class="l3-d" :x1="n.x + NW - 34" :x2="n.x + NW - 34" :y1="n.y" :y2="n.y + NH" />
      <text :x="n.x + NW - 17" :y="n.y + NH / 2 + 4" text-anchor="middle" class="l3-c">{{ g.groups[n.i].members.length }}</text>
      <path class="l3-cb" :d="'M' + (n.x + NW - 34) + ',' + n.y + 'h27a7,7 0 0 1 7,7v' + (NH - 14) + 'a7,7 0 0 1 -7,7h-27z'" @click.stop="setOpen(n.i)" />
    </g></g>
  </g></svg>
</div>`
};

const BMP_DRIVERS = new Set(['d34219d9-3b49-4b12-866c-f75cb2b93845', '8bfbb420-04fb-47fb-b2c7-2ca38561c444']);   // БМП, БМП2 (кольцевая АЛС); e4850e38 — парные БМП2 1.13.x без элементов на планах, не берём
const BmpLogicView = {
  name: 'BmpLogicView',
  setup() {
    const m = model.value;
    const below = (d, out) => { for (const c of subs(d, 'Children', 'GKDevice')) { out.push(txt(c, 'UID'), ...guids(c, 'ZoneUIDs')); below(c, out); } return out; };   // устройства под БМП и их зоны
    const list = [...m.dev.values()].filter(d => BMP_DRIVERS.has(txt(d, 'DriverUID'))).map(d => {
      let plan = '';
      for (const e of guids(d, 'PlanElementUIDs')) { const p = m.planOf.get(e); if (p) { plan = txt(p, 'UID'); break; } }
      return { uid: txt(d, 'UID'), label: devLabel(d), sub: txt(d, 'Description'), plan, box: below(d, []) };
    }).map(x => ({ ...x, n: +(/№\s*(\d+)/.exec(x.sub)?.[1] ?? 1e9) })).sort((a, b) => a.n - b.n || a.label.localeCompare(b.label, 'ru', { numeric: true }));
    const st = makeTreeState('bmp');
    provide('tree', st);
    const roots = list.map(x => ({ ...devItem(m.dev.get(x.uid)), label: x.sub || x.label, sub: '' }));
    const bmpOf = new Map();
    for (const x of list) { bmpOf.set(x.uid, x); for (const u of x.box) bmpOf.set(u, x); }
    const cur = computed(() => bmpOf.get(st.item.value?.key));
    return { roots, cur, onKey: ev => treeOnKey(st, ev), noAnc: new Set() };
  },
  template: `
<div class="bmpwrap">
  <div id="tview" class="xml" tabindex="0" @keydown="onKey"><tree-node v-for="r in roots" :key="r.key" :item="r" parent-pk="" :anc="noAnc" /></div>
  <div class="bmpprev">
    <p v-if="!cur" class="m" style="padding:16px">Выберите БМП</p>
    <p v-else-if="!cur.plan" class="m" style="padding:16px">Этого БМП нет на планах</p>
    <plan-canvas v-else :key="cur.uid" :plan="cur.plan" :box="cur.box" closeup />
  </div>
</div>`
};
