// прикладное дерево (устройства / зоны / сценарии / планы) + панель деталей
const TreeView = {
  props: { kind: String, sel: String },
  setup(props) {
    const m = model.value, def = TREES[props.kind](m);
    const st = makeTreeState('tree:' + props.kind);
    provide('tree', st);
    const { query, found, mode, search } = st;
    const kidsOf = it => it._k ||= it.kids();
    // плоский список устройств с отличиями от параметров по умолчанию (вместо дерева)
    const diff = st.diff, diffItems = shallowRef(null), diffCount = ref(null);
    const flat = () => diffItems.value ||= [...m.dev.values()].map(d => devItem(d, true)).filter(it => it.paramInfo.changed);
    const base = () => props.kind === 'dev' && diff.value ? flat() : def.roots;
    let gone = false;
    onBeforeUnmount(() => { gone = true; });
    if (props.kind === 'dev') {   // число устройств с отличиями считаем порциями в простое, чтобы не блокировать интерфейс
      const list = [...m.dev.values()], acc = [];
      let i = 0;
      const step = () => {
        if (gone) return;
        if (diffItems.value) { diffCount.value = diffItems.value.length; return; }   // список уже построен целиком (включён режим «только с отличиями»)
        for (const end = Math.min(i + 200, list.length); i < end; i++) { const it = devItem(list[i], true); if (it.paramInfo.changed) acc.push(it); }
        if (i < list.length) idle(step); else { diffItems.value = acc; diffCount.value = acc.length; }
      };
      idle(step);
    }
    if (props.sel && diff.value && !findPaths(flat(), it => it.key === props.sel, 1).length) diff.value = false;

    const reveal = path => {
      for (let i = 1; i < path.length; i++) st.open.add(pkOf(path.slice(0, i)));
      const pk = pkOf(path);
      st.select(pk, path[path.length - 1]);
      scrollToPk(pk);
    };

    if (st.fresh && def.roots.length === 1) st.open.add(pkOf(def.roots));
    if (st.fresh && props.kind === 'dev') {   // РСГК раскрываем сразу (он и сам может быть корнем, и ребёнком раскрытого корня)
      const root = def.roots[0];
      const isRsgk = it => DRIVERS[txt(m.dev.get(it.key), 'DriverUID')]?.[0] === 'РСГК';
      if (isRsgk(root)) st.open.add(pkOf([root]));
      for (const k of kidsOf(root)) if (isRsgk(k)) st.open.add(pkOf([root, k]));
    }
    const doFind = () => {
      const q = query.value.trim().toLowerCase();
      if (!q) return;
      if (q !== search.lastQ) { search.lastQ = q; search.hi = -1; search.hits = findPaths(base(), it => (it.label + ' ' + it.sub).toLowerCase().includes(q), 200); }
      if (!search.hits.length) { found.value = 'ничего'; return; }
      search.hi = (search.hi + 1) % search.hits.length;
      found.value = `${search.hi + 1} из ${search.hits.length}${search.hits.length >= 200 ? '+' : ''}`;
      reveal(search.hits[search.hi]);
    };
    // фильтр: оставляет совпавшие узлы и их предков, предков раскрывает
    const roots = shallowRef(base());
    const filterTree = (items, pred, anc, pk, cnt, expand) => {
      const out = [];
      for (const it of items) {
        if (anc.has(it.key)) continue;
        const p = pk + '/' + it.key;
        const sub = filterTree(kidsOf(it), pred, new Set(anc).add(it.key), p, cnt, expand);
        const own = pred(it);
        if (own) cnt.n++;
        if (own || sub.length) {
          if (expand && sub.length) st.open.add(p);
          out.push({ ...it, _k: sub });
        }
      }
      return out;
    };
    const applyFilter = (expand = true) => {
      const q = mode.value === 'filter' ? query.value.trim().toLowerCase() : '';
      st.hl.value = q;
      if (!q) { roots.value = base(); found.value = ''; return; }
      const cnt = { n: 0 };
      roots.value = filterTree(base(), it => (it.label + ' ' + it.sub).toLowerCase().includes(q), new Set(), '', cnt, expand);
      found.value = cnt.n ? `совпадений: ${cnt.n}` : 'ничего';
    };
    if (mode.value === 'filter') applyFilter(false);
    if (props.sel) {
      const h = findPaths(base(), it => it.key === props.sel, 1)[0];
      if (h) {
        // Явный переход по ссылке должен показать объект, даже если его скрывает сохранённый фильтр.
        if (mode.value === 'filter' && !findPaths(roots.value, it => it.key === props.sel, 1).length) { query.value = ''; applyFilter(); }
        reveal(h);
      }
    }
    const onKey = ev => treeOnKey(st, ev);
    const toggleMode = () => { mode.value = mode.value === 'find' ? 'filter' : 'find'; found.value = ''; search.lastQ = ''; applyFilter(); };
    const toggleDiff = () => {
      const cur = selItem.value;
      diff.value = !diff.value; search.lastQ = '';
      applyFilter(false);
      const h = cur && findPaths(base(), it => it.key === cur.key, 1)[0];
      if (h) reveal(h); else st.select('', null);
    };
    const onEnter = () => mode.value === 'filter' ? applyFilter() : doFind();
    const selItem = st.item;
    const rows = computed(() => selItem.value ? selItem.value.detail() : []);
    const detailBlocks = computed(() => {
      const kind = selItem.value?.k;
      if (kind !== 'dev' && kind !== 'zone') return [];
      const blocks = [];
      let block = null;
      for (const row of rows.value) {
        if (row[1]?.sep) { block = null; continue; }
        if (!block) {
          const title = kind === 'zone'
            ? row[0] === 'UID' ? 'О зоне' : blocks.length === 1 ? 'Параметры' : 'Связи'
            : row[0] === 'Драйвер' ? 'Драйвер' : row[0] === 'Источник' ? 'Связи' : 'Об устройстве';
          block = { title, rows: [] };
          blocks.push(block);
        }
        block.rows.push(row);
      }
      return blocks;
    });
    const logic = computed(() => selItem.value?.logic?.() || null);
    // сценарии, в которых участвует выбранный объект (для сценария — те, в чьих условиях он упомянут)
    const partOf = computed(() => {
      const it = selItem.value, m = model.value;
      if (!it || def.title !== 'Сценарии') return null;
      const list = it.k === 'delay' ? m.delays.filter(d => (m.delayRefs.get(txt(d, 'UID')) || []).some(x => txt(x, 'UID') === it.key))
        : it.k === 'dev' ? m.delaysByDev.get(it.key) || [] : it.k === 'zone' ? m.delaysByZone.get(it.key) || [] : [];
      return list.length ? { items: list.map(x => ({ label: delayLabel(x), goto: 'delay:' + txt(x, 'UID') })) } : null;
    });
    const goLogic = g => { const [kind, ...u] = g.split(':'); openTree(kind, u.join(':')); };
    // хлебные крошки: путь выбранного узла от корня (pk = '/ключ/ключ/...')
    const crumbs = computed(() => {
      const keys = (st.sel.value || '').split('/').slice(1), path = [];
      let level = base();
      for (const k of keys) {
        const it = level.find(x => String(x.key) === k);
        if (!it) break;
        path.push(it);
        level = kidsOf(it);
      }
      return path;
    });
    const goCrumb = i => reveal(crumbs.value.slice(0, i + 1));
    // план для холста: выбранный узел или ближайший план-предок
    const planUid = computed(() => { const c = crumbs.value; for (let i = c.length - 1; i >= 0; i--) if (c[i].k === 'plan') return String(c[i].key); return ''; });
    // клик по элементу холста: выделяем объект в дереве плана (путь через текущий план)
    const onPick = uid => {
      const h = findPaths(def.roots, it => it.key === uid && it.k !== 'plan', 200).find(p => p.some(i => i.key === planUid.value));
      if (h) { if (mode.value === 'filter' && query.value) { query.value = ''; applyFilter(false); } reveal(h); }
    };
    const startRz = e => {
      const x0 = e.clientX, w0 = planW.value, el = e.currentTarget;
      el.setPointerCapture(e.pointerId);
      const mv = ev => { planW.value = Math.max(200, Math.min(innerWidth - 300, w0 + ev.clientX - x0)); };
      const up = () => { try { localStorage.setItem('fscp.planW', String(planW.value)); } catch { /* без storage */ } el.removeEventListener('pointermove', mv); el.removeEventListener('pointerup', up); el.removeEventListener('pointercancel', up); };
      el.addEventListener('pointermove', mv); el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
    };
    const collapseAll = () => { st.open.clear(); st.select('', null); };
    return { collapseAll, startRz, onPick, planUid, detOpen, detW, planW, def, query, found, doFind, mode, roots, toggleMode, toggleDiff, diff, diffCount, onEnter, applyFilter, selItem, rows, detailBlocks, logic, partOf, goLogic, crumbs, goCrumb, onKey, noAnc: new Set() };
  },
  template: `
<Teleport to="#tbhead"><h2>{{ def.title }}</h2><span class="m">{{ def.note }}<template v-if="def.warn"> · <span class="warn">{{ def.warn }}</span></template></span><button v-if="kind === 'dev'" type="button" class="dsw" :class="{ on: diff }" :aria-pressed="diff" title="Плоский список устройств, параметры которых отличаются от параметров по умолчанию" @click="toggleDiff">Только с отличиями<template v-if="diffCount !== null"> <b>{{ diffCount }}</b></template></button></Teleport>
<div class="stk"><div class="bar"><div class="sgrp"><input type="search" v-model="query" @keydown.enter="onEnter" @input="mode === 'filter' && applyFilter()" :placeholder="mode === 'filter' ? 'Фильтр по подписи' : 'Поиск по подписи (Enter — следующее)'"><button @click="toggleMode" :title="mode === 'filter' ? 'Режим: фильтр (только совпадения). Нажмите — переключить на поиск' : 'Режим: поиск (переход к совпадениям). Нажмите — переключить на фильтр'" class="ib"><svg v-if="mode === 'filter'" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><path d="M2 3h12l-4.5 5.5V13l-3-1.5V8.5z"/></svg><svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5L14 14"/></svg></button></div><button @click="collapseAll" title="Свернуть все узлы и сбросить выбор" aria-label="Свернуть все" class="ib"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5l5 4 5-4M3 13.5l5-4 5 4"/></svg></button><span class="m">{{ found }}</span></div>
<div class="crumbs tc m" v-hscroll><template v-if="crumbs.length"><template v-for="(c, i) in crumbs" :key="i"><span :class="[i < crumbs.length - 1 ? 'ref chip chev' : 'chip chev', 'c-' + c.k]" @click="i < crumbs.length - 1 && goCrumb(i)">{{ c.label }}</span></template></template><template v-else>Выберите узел — здесь появится путь</template></div></div>
<div class="split">
  <div id="tview" class="xml" tabindex="0" @keydown="onKey" :style="def.plans ? { width: planW + 'px' } : null"><tree-node v-for="r in roots" :key="r.key" :item="r" parent-pk="" :anc="noAnc" /></div>
  <div v-if="def.plans" id="tprev"><div class="rz" title="Потяните, чтобы изменить ширину дерева" @pointerdown.prevent="startRz"></div><plan-canvas :plan="planUid" :sel="selItem && selItem.k !== 'plan' ? selItem.key : ''" @pick="onPick" /></div>
  <div id="tdet" :class="{ closed: !detOpen }" :inert="!detOpen">
    <p v-if="!selItem" class="m">Выберите узел.</p>
    <template v-else><div class="dhead"><span :class="['chip', 'c-' + selItem.k]">{{ selItem.label }}</span></div><template v-if="detailBlocks.length"><details v-for="block in detailBlocks" :key="block.title" class="detail-block" :open="block.title !== 'Драйвер'"><summary><h3>{{ block.title }}</h3></summary><detail-table :rows="block.rows" /></details></template><detail-table v-else :rows="rows" /><device-parameters v-if="selItem.paramInfo" :data="selItem.paramInfo" /><template v-if="partOf"><h3 class="lgt">В сценариях</h3><logic-node :key="selItem.key" :n="partOf" @pick="goLogic" /></template><template v-if="logic"><h3 class="lgt">Логика</h3><logic-node :n="logic" :top="true" @pick="goLogic" /></template></template>
  </div>
</div>`,
};
