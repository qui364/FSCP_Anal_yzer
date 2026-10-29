const GK_NAME = { i: 'Устройство зоны', z: 'Зона', d: 'Сценарий', o: 'Исполнитель' };
const gkClass = n => n.kind === 'z' ? 'zone' : n.kind === 'd' ? 'delay' : 'dev';

const L3_ND = /\d+(?:[.,]\d+)*/g;
function buildLogicGroups() {
  const m = model.value;
  if (m.lgroups) return m.lgroups;
  const g = buildGraph(), gi = new Map(), groups = [], emap = new Map(), of = new Map();
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
  const tplN = new Map();
  for (const x of g.nodes) if (x.kind === 'd') { const t = tpl(x); tplN.set(t, (tplN.get(t) || 0) + 1); }
  const real = x => x.label.replace(/^\[[^\]]*\]\s*/, '').trim();
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
    if (n.kind === 'i' ? n.out.some(b => g.nodes[b].kind === 'd') : n.in.length || n.out.length) of.set(i, grp(n));
  });
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

let logicSaved = null;
const LogicView = {
  setup() {
    const g = buildLogicGroups(), sv = logicSaved?.g === g ? logicSaved : null;
    const hov = ref(''), pin = ref(sv ? sv.pin : ''), more = ref(new Set(sv?.more)), openI = ref(new Set(sv?.openI)), closing = ref(new Set()), svg = ref(null), v = ref(sv ? sv.v : { k: 1, x: 0, y: 0 });
    const ls = (k, d) => { try { return localStorage.getItem('fscp.l3' + k) || d; } catch (e) { return d; } };
    const animOn = ref(ls('Anim', '1') === '1'), align = ref(ls('Align', 'center'));
    const COLW = 250, NW = 190, NH = 34, GAP = 8, PAD = 16;
    const LH = 34, MAXL = 40;
    const descOf = m => m.more || (m.kind !== 'i' && m.kind !== 'o') ? '' : (txt(model.value.dev.get(m.uid), 'Description') || '').trim();
    const listOf = i => { const m = g.groups[i].members; return more.value.has(i) || m.length <= MAXL ? m : [...m.slice(0, MAXL), { more: true, label: '… и ещё ' + (m.length - MAXL) }]; };
    let fs = null;
    const layout = subset => {
      fs = subset;
      const cols = g.cols.map(c => subset ? c.filter(x => subset.has(g.groups.indexOf(x))) : c).filter(c => c.length);
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
    if (sv && sv.focus !== '') {
      focus.value = sv.focus;
      lay.value = layout(new Set([...walk(sv.focus, 'out'), ...walk(sv.focus, 'in')]));
      anim.value = { from: lay.value, to: lay.value, t: 1 };
    }
    onBeforeUnmount(() => { logicSaved = { g, v: v.value, focus: focus.value, pin: pin.value, more: [...more.value], openI: [...openI.value] }; });
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
    const ptrs = new Map();
    let pinch = null;
    const pinchGeom = () => { const [a, b] = [...ptrs.values()], r = svg.value.getBoundingClientRect(); return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }; };
    const down = ev => {
      if (ev.button) return;
      ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (ptrs.size === 2) { svg.value.setPointerCapture(ev.pointerId); drag = null; moved = true; pinch = { ...pinchGeom(), v: { ...v.value } }; return; }
      drag = { sx: ev.clientX, sy: ev.clientY, x: v.value.x, y: v.value.y }; moved = false;
    };
    const move = ev => {
      if (ptrs.has(ev.pointerId)) ptrs.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (pinch && ptrs.size === 2) {
        const g = pinchGeom(), o = pinch.v, k = Math.min(4, Math.max(0.05, o.k * g.d / pinch.d));
        v.value = { k, x: g.x - (pinch.x - o.x) * k / o.k, y: g.y - (pinch.y - o.y) * k / o.k };
        return;
      }
      if (!drag) return;
      const dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
      if (!moved && Math.abs(dx) + Math.abs(dy) > 3) { moved = true; svg.value.setPointerCapture(ev.pointerId); }
      if (moved) v.value = { ...v.value, x: drag.x + dx, y: drag.y + dy };
    };
    const up = ev => { ptrs.delete(ev.pointerId); if (ptrs.size < 2) pinch = null; drag = null; };
    const focusOn = i => {
      const was = focus.value !== '', a = was && !lay.value.pos.has(i) ? focus.value : i, from = lay.value, o = from.pos.get(a);
      if (!was) { const f = new Set([...walk(i, 'out'), ...walk(i, 'in')]); focus.value = i; lay.value = layout(f); }
      else { focus.value = ''; lay.value = layout(null); }
      pin.value = was ? '' : i;
      const n = lay.value.pos.get(a), s = v.value.k;
      const v0 = v.value, v1 = o && n ? { k: s, x: v0.x + (o.x - n.x) * s, y: v0.y + (o.y - n.y) * s } : v0;
      animate(from, lay.value, v0, v1);
    };
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
    onMounted(() => {
      if (!svg.value || sv) return;
      const r = svg.value.getBoundingClientRect(), L = lay.value, k = Math.min(r.width / L.W, r.height / L.H, 1.5);
      if (k > 0) v.value = { k, x: (r.width - L.W * k) / 2, y: (r.height - L.H * k) / 2 };
    });
    const bgClick = ev => { if (focus.value !== '' && !moved && !ev.target.closest('.l3-n')) focusOn(focus.value); };
    const click = i => { if (!moved) focusOn(i); };
    const cur = computed(() => pin.value === '' ? null : g.groups[pin.value]);
    const kindName = k => GK_NAME[k] || k;
    const cls = n => 'k-' + gkClass(n);
    const goto = n => openTree(n.kind === 'z' ? 'zone' : n.kind === 'd' ? 'delay' : 'dev', n.uid);
    return { animOn, align, setAlign, toggleAnim, fit, scene, lay, focus, focusOn, bgClick, P, svg, v, onWheel, down, move, up, g, hov, pin, more, NW, NH, nodeOn, edgeOn, click, isOpen, leaving, setOpen, listOf, descOf, more, LH, cur, kindName, cls, goto, gkClass };
  },
  template: `<div class="l3">
  <Teleport to="#tbhead"><h2>Логика</h2></Teleport>
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
