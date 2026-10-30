function makeTreeState(key) {
  const fresh = !S.treeStates.has(key);
  if (fresh) {
    const sel = ref(''), item = shallowRef(null);
    S.treeStates.set(key, {
      open: reactive(new Set()), sel, item, hl: ref(''), reg: new Map(),
      query: ref(''), found: ref(''), mode: ref('find'), diff: ref(false),
      search: { hits: [], hi: -1, lastQ: '' },
      select(pk, it) { sel.value = pk; item.value = it; },
    });
  }
  return { ...S.treeStates.get(key), fresh };
}
const pkOf = path => path.map(i => '/' + i.key).join('');
async function scrollToPk(pk) {
  await nextTick();
  document.querySelector(`[data-pk="${pk}"]`)?.scrollIntoView({ block: 'center' });
}

let tapPk = '', tapT = 0;
const TreeNode = {
  name: 'TreeNode',
  props: { item: Object, parentPk: String, anc: Object },
  setup(props) {
    const st = inject('tree');
    const pk = computed(() => props.parentPk + '/' + props.item.key);
    const cyc = computed(() => !props.item.xml && props.anc.has(props.item.key));
    const isOpen = computed(() => st.open.has(pk.value));
    const kids = computed(() => cyc.value || (props.item.count != null && !isOpen.value) ? [] : (props.item._k ||= props.item.kids()));
    const count = computed(() => cyc.value ? 0 : props.item.count ?? kids.value.length);
    const next = computed(() => new Set(props.anc).add(props.item.key));
    const toggle = () => {
      if (!count.value) return;
      if (isOpen.value) st.open.delete(pk.value); else st.open.add(pk.value);
    };
    const me = { item: props.item, toggle, count: () => count.value, isOpen: () => isOpen.value };
    st.reg.set(pk.value, me);
    onBeforeUnmount(() => { if (st.reg.get(pk.value) === me) st.reg.delete(pk.value); });
    const dbl = () => {
      if (isMobile.value) { if (view.value.kind !== 'plan') detOpen.value = true; return; }
      if (!props.item.xml) toggle();
    };
    const click = ev => {
      st.select(pk.value, props.item);
      if (isMobile.value) {
        const t = Date.now();
        if (tapPk === pk.value && t - tapT < 400) { tapPk = ''; dbl(); return; }
        tapPk = pk.value; tapT = t;
      }
      if (props.item.xml || (ev.target === ev.currentTarget && ev.offsetX < (isMobile.value ? 34 : 22))) toggle();
    };
    const md = ev => {
      if (ev.button !== 0) return;
      ev.preventDefault();
      ev.currentTarget.closest('#tview')?.focus({ preventScroll: true });
      st.select(pk.value, props.item);
    };
    const enter = ev => { if (ev.buttons & 1) st.select(pk.value, props.item); };
    const rowCls = computed(() => ['row', count.value ? 'tg' : 'leaf', { ctr: !props.item.xml, open: isOpen.value, sel: st.sel.value === pk.value }]);
    const parts = s => {
      const q = st.hl.value, out = [];
      if (!q) return [[s, false]];
      const low = s.toLowerCase();
      let i = 0;
      for (let j; (j = low.indexOf(q, i)) >= 0; i = j + q.length) {
        if (j > i) out.push([s.slice(i, j), false]);
        out.push([s.slice(j, j + q.length), true]);
      }
      if (i < s.length) out.push([s.slice(i), false]);
      return out;
    };
    return { TREE_ICONS, parts, pk, cyc, isOpen, kids, count, next, click, dbl, md, enter, rowCls };
  },
  template: `
<div>
  <div :class="rowCls" :data-pk="pk" @click="click" @dblclick="dbl" @mousedown="md" @mouseenter="enter">
    <template v-if="item.xml">&lt;<span class="t">{{ item.label }}</span><span v-for="a in item.attrs">{{ ' ' }}<span class="a">{{ a.n }}</span>=<span class="v">"{{ a.v }}"</span></span><template v-if="count">{{ ' ' }}<span class="m">({{ count }})</span>&gt;</template><template v-else-if="item.text">&gt;<span class="v">{{ item.text }}</span>&lt;/<span class="t">{{ item.label }}</span>&gt;</template><template v-else>{{ ' ' }}/&gt;</template></template>
    <template v-else><span v-if="item.ic && TREE_ICONS[item.ic]" class="tic" :style="{ '--m': 'url(' + TREE_ICONS[item.ic] + ')' }"></span><span v-else-if="['dev', 'zone', 'delay', 'plan', 'folder'].includes(item.k)" class="tic" :style="{ '--m': 'url(' + (TREE_ICONS['t-' + item.k + '.png'] || TREE_ICONS.sq) + ')', '--ck': item.k === 'dev' ? null : 'var(--c-' + (item.k === 'folder' ? 'plan' : item.k) + ')' }"></span><span :title="item.label" :class="['t', 'chip', 'c-' + item.k, { off: item.off }]"><template v-for="p in parts(item.label)"><mark v-if="p[1]">{{ p[0] }}</mark><template v-else>{{ p[0] }}</template></template></span><template v-if="item.sub">{{ ' ' }}<span class="m"><template v-for="p in parts(item.sub)"><mark v-if="p[1]">{{ p[0] }}</mark><template v-else>{{ p[0] }}</template></template></span></template><template v-if="count">{{ ' ' }}<span class="m">({{ count }})</span></template><template v-if="cyc">{{ ' ' }}<span class="warn">↺ цикл</span></template><span v-if="item.paramInfo?.changed" class="param-badge" :title="'Параметров, отличающихся от значений по умолчанию: ' + item.paramInfo.changed">≠ {{ item.paramInfo.changed }}</span></template>
  </div>
  <div v-if="isOpen && kids.length" class="n"><tree-node v-for="k in kids" :key="k.key" :item="k" :parent-pk="pk" :anc="next" /></div>
</div>`,
};

const DetailTable = {
  props: { rows: Array },
  setup() {
    const act = it => {
      if (it.goto) { const [kind, ...uid] = it.goto.split(':'); openTree(kind, uid.join(':')); }
      else if (it.xml) go({ type: 'xml', name: it.xml, uid: it.uid });
      else if (it.src) openSource(it.src, it.line);
      else if (it.open) openFile(it.open);
      else if (it.log) openLog(it.log, it.logTitle);
    };
    const split = l => { const i = l.lastIndexOf(':'); return i > 0 ? [l.slice(0, i), l.slice(i)] : [l, '']; };
    return { act, split };
  },
  template: `
<table class="stat">
  <tr v-for="(r, n) in rows" :key="n" :class="{ sep: r[1].sep }">
    <td v-if="r[1].sep" colspan="2"></td>
    <template v-else>
    <td>{{ r[0] }}</td>
    <td>
      <template v-if="Array.isArray(r[1])"><div v-for="(it, i) in r[1]" :key="i"><span v-if="it.more" class="m">… и ещё {{ it.more }}</span><template v-else><span v-if="it.goto || it.xml || it.src || it.open || it.log" :class="['ref', 'chip', it.goto ? 'c-' + it.goto.split(':')[0] : '', { mid: it.xml || it.src }]" @click="act(it)"><template v-if="it.xml || it.src"><span class="mh">{{ split(it.label)[0] }}</span><span class="mt">{{ split(it.label)[1] }}</span></template><template v-else>{{ it.label }}</template></span><template v-else>{{ it.label }}</template><template v-if="it.note">{{ ' ' }}<span class="m">{{ it.note }}</span></template></template></div></template>
      <span v-else-if="r[1].warn" class="warn">{{ r[1].warn }}</span>
      <template v-else-if="r[1].icon"><span class="mdl">{{ String.fromCodePoint(parseInt(r[1].icon, 16)) }}</span> <span class="m">{{ r[1].icon }}</span></template>
      <div v-else-if="r[1].crumbs" class="chevrow" v-hscroll><template v-for="(it, i) in r[1].crumbs" :key="i"><span v-if="it.goto" :class="['ref', 'chip', 'chev', 'c-' + it.goto.split(':')[0]]" @click="act(it)">{{ it.label }}</span><span v-else class="chip chev">{{ it.label }}</span></template></div>
      <template v-else>{{ r[1] }}</template>
    </td>
    </template>
  </tr>
</table>`,
};

const LogicNode = {
  name: 'LogicNode',
  props: { n: Object, top: Boolean },
  emits: ['pick'],
  setup() { return { open: ref(false) }; },
  template: `
<div v-if="n.kids" :class="['lg-g', { top }]">
  <template v-for="(k, i) in n.kids" :key="i">
    <div v-if="i" class="lg-j">{{ n.join }}</div>
    <logic-node :n="k" @pick="$emit('pick', $event)" />
  </template>
</div>
<div v-else class="lg-c">
  <div v-if="n.op" class="lg-h"><span class="chip lg-op">{{ n.op }}</span> в состоянии <span :class="['chip', 'lg-st', 'st-' + n.sk]">{{ n.state }}</span></div>
  <div class="lg-i"><span v-for="(it, i) in (open ? n.items : n.items.slice(0, 2))" :key="i" :class="['ref', 'chip', 'c-' + it.goto.split(':')[0]]" @click="$emit('pick', it.goto)">{{ it.label }}</span><span v-if="!n.items.length" class="m">нет объектов</span><span v-if="n.items.length > 2" class="m lg-m" @click="open = !open">{{ open ? 'свернуть' : '… и ещё ' + (n.items.length - 2) }}</span></div>
</div>`,
};

const FileHead = {
  props: { name: String, extra: String },
  setup(props) {
    const base = computed(() => props.name.slice(props.name.lastIndexOf('/') + 1));
    const parts = computed(() => {
      const i = props.name.lastIndexOf('/');
      const size = entries.value.find(e => e.name === props.name)?.size;
      return [`папка: ${i < 0 ? '/ (корень)' : props.name.slice(0, i + 1)}`, size != null ? `размер: ${fmt(size)}` : '', props.extra].filter(Boolean);
    });
    return { base, parts };
  },
  template: `<h2>{{ base }}</h2><p class="m">{{ parts.join(' · ') }}</p>`,
};


const defW = () => Math.round(innerWidth / 4);
const PANEL_W = 350;
const savedW = k => { try { const v = +localStorage.getItem(k); if (v >= 200 && v <= innerWidth / 2) return v; } catch {  } return PANEL_W; };
const sideW = ref(savedW('fscp.sideW')), detW = ref(savedW('fscp.detW')), planW = ref(defW());
const startPanelRz = (e, w, key, sign, collapse) => {
  const x0 = e.clientX, w0 = w.value, el = e.currentTarget;
  el.setPointerCapture(e.pointerId);
  document.body.classList.add('rzing');
  const mv = ev => { w.value = Math.max(0, Math.min(innerWidth / 2, w0 + sign * (ev.clientX - x0))); };
  const up = () => { document.body.classList.remove('rzing'); if (w.value < 120) { w.value = w0; collapse(); } else w.value = Math.max(200, w.value); try { localStorage.setItem(key, String(w.value)); } catch {  } el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
  el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
};
const resetW = (w, key, def) => { w.value = def; try { localStorage.removeItem(key); } catch {  } };
const sideDbl = () => resetW(sideW, 'fscp.sideW', PANEL_W), detDbl = () => resetW(detW, 'fscp.detW', PANEL_W);
const planDbl = () => { resetW(planW, 'fscp.planW', defW()); planWSet = false; };
const sideRz = e => startPanelRz(e, sideW, 'fscp.sideW', 1, toggleNav), detRz = e => startPanelRz(e, detW, 'fscp.detW', -1, toggleDet);
let planWSet = false;
try { const v = +localStorage.getItem('fscp.planW'); if (v >= 200 && v <= innerWidth - 300) { planW.value = v; planWSet = true; } } catch {  }
addEventListener('resize', () => { if (!planWSet) planW.value = defW(); });

const hscroll = {
  mounted(el) {
    const edge = () => { el.classList.toggle('fl', el.scrollLeft > 1); el.classList.toggle('fr', el.scrollLeft + el.clientWidth < el.scrollWidth - 1); };
    let x0 = 0, s0 = 0, down = false, moved = false;
    el.addEventListener('pointerdown', e => { if (e.button === 0) { down = true; moved = false; x0 = e.clientX; s0 = el.scrollLeft; } });
    addEventListener('pointermove', el._pm = e => { if (!down) return; const d = e.clientX - x0; if (!moved && Math.abs(d) > 4) { moved = true; el.classList.add('drag'); } if (moved) el.scrollLeft = s0 - d; });
    addEventListener('pointerup', el._pu = () => { down = false; el.classList.remove('drag'); });
    el.addEventListener('click', e => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
    el.addEventListener('wheel', e => { if (el.scrollWidth > el.clientWidth) { el.scrollLeft += e.deltaY || e.deltaX; e.preventDefault(); } }, { passive: false });
    el.addEventListener('scroll', edge);
    el._ro = new ResizeObserver(edge); el._ro.observe(el);
    el._edge = edge; el.scrollLeft = el.scrollWidth; edge();
  },
  updated(el) { el.scrollLeft = el.scrollWidth; el._edge(); },
  unmounted(el) { removeEventListener('pointermove', el._pm); removeEventListener('pointerup', el._pu); el._ro.disconnect(); }
};

function treeOnKey(st, ev) {
  if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
  const el = ev.currentTarget, rows = [...el.querySelectorAll('.row[data-pk]')];
  if (!rows.length) return;
  const pks = rows.map(r => r.dataset.pk), cur = pks.indexOf(st.sel.value), key = ev.key;
  const go = i => {
    i = Math.max(0, Math.min(pks.length - 1, i));
    const e = st.reg.get(pks[i]);
    if (e) { st.select(pks[i], e.item); rows[i].scrollIntoView({ block: 'nearest' }); }
  };
  const e = st.reg.get(st.sel.value), page = Math.max(1, Math.floor(el.clientHeight / (rows[0].offsetHeight || 20)) - 1);
  if (key === 'ArrowDown') go(cur + 1);
  else if (key === 'ArrowUp') go(cur < 0 ? 0 : cur - 1);
  else if (key === 'Home') go(0);
  else if (key === 'End') go(pks.length - 1);
  else if (key === 'PageDown') go(cur + page);
  else if (key === 'PageUp') go(cur - page);
  else if (key === 'ArrowRight') {
    if (!e) go(0); else if (e.count() && !e.isOpen()) e.toggle(); else if (e.isOpen()) go(cur + 1);
  } else if (key === 'ArrowLeft') {
    if (!e) return;
    if (e.isOpen() && e.count()) e.toggle();
    else { const p = st.sel.value.slice(0, st.sel.value.lastIndexOf('/')); if (st.reg.has(p)) go(pks.indexOf(p)); }
  } else if (key === 'Enter' || key === ' ') { if (e) e.toggle(); }
  else return;
  ev.preventDefault();
}
