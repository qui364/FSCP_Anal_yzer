// страница «Журнал событий»: сводка по загруженному журналу (сама таблица — LogView, дочерний пункт «События»)
const LogInfoView = {
  setup() {
    const ls = computed(() => {
      const L = logData.value;
      if (!L) return null;
      let lo = Infinity, hi = -Infinity;
      const sev = { fire: 0, bad: 0, warn: 0, ok: 0 }, types = { 1: 0, 2: 0, 6: 0 };
      for (const r of L.rows) {
        if (r.t) { if (r.t < lo) lo = r.t; if (r.t > hi) hi = r.t; }
        const s = evSev(r.code); if (s) sev[s]++;
        if (r.type in types) types[r.type]++;
      }
      const d = t => new Date(t).toLocaleString('ru'), n = L.rows.length;
      return {
        n, files: L.files, period: lo <= hi ? `${d(lo)} — ${d(hi)}` : '—',
        sev: [['fire', 'Пожар / тревога', sev.fire], ['bad', 'Неисправности', sev.bad], ['warn', 'Внимание', sev.warn], ['ok', 'Норма', sev.ok]],
        types: [['Устройства', types[1]], ['Зоны', types[2]], ['Сценарии', types[6]]],
      };
    });
    return { ls, fmt, openLog };
  },
  template: `
<div class="icols">
<div v-if="ls" class="info icol">
  <Teleport to="#tbhead"><h2>Журнал событий</h2><span class="m">{{ ls.n }} событий · {{ ls.files.length }} файл.</span></Teleport>
  <h3>По важности</h3>
  <div class="tiles">
    <button v-for="s in ls.sev" :key="s[0]" :class="['tile', 's-' + s[0]]" @click="openLog()">
      <b>{{ s[2] }}</b><span>{{ s[1] }}</span>
    </button>
  </div>
  <div class="icards">
    <div class="card icard">
      <h3>Журнал</h3>
      <dl class="kv"><dt>Событий</dt><dd>{{ ls.n }}</dd><dt>Период</dt><dd>{{ ls.period }}</dd></dl>
    </div>
    <div class="card icard">
      <h3>Объекты</h3>
      <div v-for="t in ls.types" :key="t[0]" class="drow">
        <div class="dtop"><span>{{ t[0] }}</span><small>{{ t[1] }}</small></div>
      </div>
    </div>
    <div class="card icard">
      <h3>Файлы</h3>
      <div v-for="f in ls.files" :key="f.name" class="drow">
        <div class="dtop"><span>{{ f.name }}</span><small>{{ f.n }} событий · {{ fmt(f.blob.size) }}</small></div>
      </div>
    </div>
  </div>
</div>
</div>`,
};

const RawView = {
  setup() {
    const groups = computed(() => {
      const q = rawQ.value.toLowerCase(), root = [], folders = {};
      for (const e of entries.value) {
        if (q && !e.name.toLowerCase().includes(q)) continue;
        if (e.name.includes('/')) (folders[e.name.split('/')[0]] ||= []).push(e);
        else root.push(e);
      }
      return { root, folders: Object.entries(folders) };
    });
    const kind = n => /\.xml$/i.test(n) ? ['📄', 'XML'] : /\.(mp4|webm|avi)$/i.test(n) ? ['🎞️', 'видео'] : /\.(png|jpe?g|gif|bmp)$/i.test(n) || n.startsWith('Content/') ? ['🖼️', 'картинка'] : ['📦', 'файл'];
    return { rawQ, groups, fmt, openFile, kind };
  },
  template: `
<div class="rawv">
<Teleport to="#tbhead"><h2>Сырые данные</h2><span class="m">Файлы архива как есть — клик открывает файл</span></Teleport>
<input type="search" v-model="rawQ" placeholder="Фильтр по имени файла…" style="max-width:380px">
<div class="card rawlist">
  <div v-for="e in groups.root" :key="e.name" class="rentry" @click="openFile(e.name)">
    <span class="rico">{{ kind(e.name)[0] }}</span><span class="rname">{{ e.name }}</span>
    <span class="rbadge">{{ kind(e.name)[1] }}</span><small>{{ fmt(e.size) }}</small><span class="rgo">›</span>
  </div>
  <details v-for="[g, es] in groups.folders" :key="g" class="rfolder" :open="!!rawQ">
    <summary><span class="rchev">▸</span><span class="rico">📁</span><span class="rname">{{ g }}/</span><small class="rcount">{{ es.length }}</small></summary>
    <div class="rkids"><div v-for="e in es" :key="e.name" class="rentry" @click="openFile(e.name)">
      <span class="rico">{{ kind(e.name)[0] }}</span><span class="rname">{{ e.name.slice(g.length + 1) }}</span>
      <span class="rbadge">{{ kind(e.name)[1] }}</span><small>{{ fmt(e.size) }}</small><span class="rgo">›</span>
    </div></div>
  </details>
  <p v-if="!groups.root.length && !groups.folders.length" class="m" style="padding:10px">Ничего не найдено.</p>
</div>
</div>`,
};

// не-XML файл из архива: картинка, видео, текст или hex-дамп + откуда на него ссылаются
const FileView = {
  props: { name: String },
  setup(props) {
    const info = shallowRef(null);
    let url = '', dead = false;
    const err = ref('');
    onMounted(async () => {
      try {
        const f = S.zip.file(props.name);
        if (!f) throw new Error('файла нет в архиве');
        const bytes = await f.async('uint8array');
        const kind = sniff(bytes);
        const guid = props.name.match(/[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}/i)?.[0];
        const o = { kind, guid, refs: guid ? await findRefs(guid) : [] };
        if (dead) return;
        if (/^(image|video)\//.test(kind)) url = o.url = URL.createObjectURL(new Blob([bytes], { type: kind }));
        else if (kind === 'text') o.text = new TextDecoder().decode(bytes.slice(0, 20000));
        else o.hex = hex(bytes.slice(0, 256));
        info.value = o;
      } catch (e) { err.value = 'Не удалось прочитать файл: ' + e.message; }
    });
    onBeforeUnmount(() => { dead = true; url && URL.revokeObjectURL(url); });
    return { info, err, openFile, openSource };
  },
  template: `
<p v-if="err" class="warn">{{ err }}</p>
<file-head :name="name" :extra="info ? 'тип: ' + info.kind : err ? 'ошибка' : 'загрузка…'" />
<template v-if="info">
  <template v-if="info.guid">
    <h3>Ссылки в XML</h3>
    <p v-if="!info.refs.length" class="m">Не найдено.</p>
    <template v-for="r in info.refs" :key="r.file">
      <p><span class="ref" @click="openFile(r.file)">{{ r.file }}</span> — {{ r.n }} раз<template v-if="r.n > 5"> (показаны первые 5)</template></p>
      <template v-for="s in r.shown" :key="s.line">
        <div class="m"><span class="ref" @click="openSource(r.file, s.line)">строка {{ s.line }}</span></div>
        <pre><template v-for="(p, i) in s.parts">{{ p }}<mark v-if="i < s.parts.length - 1">{{ info.guid }}</mark></template></pre>
      </template>
    </template>
  </template>
  <img v-if="info.kind.startsWith('image/')" :src="info.url" style="max-width:100%">
  <video v-else-if="info.kind.startsWith('video/')" :src="info.url" controls style="max-width:100%"></video>
  <pre v-else-if="info.kind === 'text'">{{ info.text }}</pre>
  <template v-else><h3>Первые 256 байт</h3><pre>{{ info.hex }}</pre></template>
</template>`,
};

// режим «Исходник»: сырой текст с номерами строк, рисуются только видимые строки
const SourceView = {
  props: { name: String, line: Number },
  setup(props) {
    const total = ref(0), top = ref(0), vh = ref(600), box = ref(null), err = ref('');
    let t = '', starts = [];
    const lineText = i => t.slice(starts[i], i + 1 < total.value ? starts[i + 1] - 1 : t.length).replace(/\r$/, '');
    const first = computed(() => Math.max(0, Math.floor(top.value / LH) - 5));
    const last = computed(() => Math.min(total.value, first.value + Math.ceil(vh.value / LH) + 10));
    const rows = computed(() => {
      const out = [];
      for (let i = first.value; i < last.value; i++) out.push({ n: i + 1, s: clip(lineText(i), 2000) });
      return out;
    });
    const onScroll = ev => { top.value = ev.target.scrollTop; vh.value = ev.target.clientHeight; };
    onMounted(async () => {
      try { t = await getText(props.name); } catch (e) { err.value = e.message; return; }
      starts = lineIndex(props.name, t);
      total.value = starts.length;
      await nextTick();
      vh.value = box.value.clientHeight;
      box.value.scrollTop = Math.max(0, (props.line - 1) * LH - vh.value / 2);
      top.value = box.value.scrollTop;
    });
    return { err, total, rows, first, box, onScroll, LH, toTree: () => go({ type: 'xml', name: props.name }) };
  },
  template: `
<h2>{{ name }}</h2>
<p v-if="err" class="warn">{{ err }}</p>
<div class="bar"><button @click="toTree">Дерево</button><span class="m">исходник · {{ total.toLocaleString('ru') }} строк · строка {{ line }}</span></div>
<div id="src" ref="box" @scroll="onScroll">
  <div id="spacer" :style="{ height: total * LH + 'px' }"></div>
  <div id="win" :style="{ top: first * LH + 'px' }"><div v-for="r in rows" :key="r.n" :class="['sl', { hit: r.n === line }]"><span class="no">{{ r.n }}</span>{{ r.s }}</div></div>
</div>`,
};

// сырой XML-файл как дерево тегов
const XmlView = {
  props: { name: String, uid: String },
  setup(props) {
    const st = makeTreeState('xml:' + props.name);
    provide('tree', st);
    const err = ref(''), info = shallowRef(null), { query, found } = st;
    let doc;
    onMounted(async () => {
      let text;
      try { text = await getText(props.name); } catch (e) { err.value = e.message; return; }
      await new Promise(r => setTimeout(r, 30));      // дать отрисоваться заголовку перед тяжёлым разбором
      doc = new DOMParser().parseFromString(text, 'application/xml');
      const pe = doc.querySelector('parsererror');
      if (pe) { err.value = pe.textContent.slice(0, 500); return; }
      const root = xmlItem(doc.documentElement, 0);
      info.value = { rootName: doc.documentElement.nodeName, stats: tagStats(doc.documentElement), root };
      if (st.fresh) st.open.add('/0');
      if (props.uid) {
        const uidNode = [...doc.getElementsByTagName('UID')].find(n => n.textContent.trim() === props.uid);
        if (uidNode) revealXml(uidNode.parentElement);
      }
    });
    const expandTo = (item, pk, d) => {
      if (d <= 0 || !item.count) return;
      st.open.add(pk);
      (item._k ||= item.kids()).forEach((k, i) => expandTo(k, pk + '/' + i, d - 1));
    };
    const expand = () => expandTo(info.value.root, '/0', 2);
    const revealXml = node => {
      const path = [];
      for (let n = node; n; n = n.parentElement) path.unshift(n);
      let pk = '/0';
      for (let i = 0; i < path.length - 1; i++) {
        st.open.add(pk);
        pk += '/' + [...path[i].children].indexOf(path[i + 1]);
      }
      st.open.add(pk);
      st.select(pk, null);
      scrollToPk(pk);
    };
    // Поиск: находит первые совпадения и раскрывает путь до них
    const doSearch = () => {
      const q = query.value.toLowerCase();
      if (!q) return;
      const hits = [], queue = [doc.documentElement];
      for (let qi = 0; qi < queue.length && hits.length < 50; qi++) {
        const n = queue[qi];
        const hay = n.nodeName.toLowerCase() + ' ' + [...n.attributes].map(a => a.name + '=' + a.value).join(' ').toLowerCase() + (n.children.length ? '' : ' ' + n.textContent.toLowerCase());
        if (hay.includes(q)) hits.push(n);
        queue.push(...n.children);
      }
      found.value = hits.length ? `найдено: ${hits.length}${hits.length >= 50 ? '+' : ''}, показано первое` : 'ничего';
      if (!hits.length) return;
      revealXml(hits[0]);
    };
    const collapseAll = () => { st.open.clear(); st.select('', null); };
    return { err, info, query, found, expand, collapseAll, doSearch, noAnc: new Set(), toSrc: () => openSource(props.name) };
  },
  template: `
<template v-if="err"><h2>{{ name }}</h2><p>Ошибка XML:</p><pre>{{ err }}</pre></template>
<template v-else-if="info">
  <file-head :name="name" :extra="'корень <' + info.rootName + '>'" />
  <details><summary>Статистика тегов ({{ info.stats.length }})</summary>
    <table class="stat"><tr v-for="[t, c] in info.stats.slice(0, 80)" :key="t"><td class="t">{{ t }}</td><td>{{ c }}</td></tr></table>
  </details>
  <div class="bar">
    <button @click="toSrc">Исходник</button><button @click="expand">Раскрыть 2 уровня</button><button @click="collapseAll" title="Свернуть все узлы и сбросить выбор" aria-label="Свернуть все" class="ib"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2.5l5 4 5-4M3 13.5l5-4 5 4"/></svg></button>
    <input type="search" v-model="query" @keydown.enter="doSearch" placeholder="Поиск по тегу/атрибуту/значению (Enter)" style="max-width:340px;margin:0">
    <span class="m">{{ found }}</span>
  </div>
  <div class="xml"><tree-node :item="info.root" parent-pk="" :anc="noAnc" /></div>
</template>
<file-head v-else :name="name" extra="загрузка…" />`,
};
