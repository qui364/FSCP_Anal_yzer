let logSaved = null;
const LogView = {
  props: { uids: Array, title: String },
  setup(props) {
    const sv = !props.uids && logSaved && logSaved.L === logData.value ? logSaved : null;
    const q = ref(sv ? sv.q : ''), code = ref(sv ? sv.code : ''), lim = ref(sv ? sv.lim : 500), objSet = ref(props.uids ? new Set(props.uids) : sv ? sv.objSet : null), objTitle = ref(props.title || (sv ? sv.objTitle : ''));
    const picker = ref(null);
    const base = computed(() => {
      const L = logData.value;
      if (!L) return [];
      if (!objSet.value) return L.rows;
      return objSet.value.size === 1 ? (L.byObj.get([...objSet.value][0]) || []) : L.rows.filter(r => objSet.value.has(r.obj));
    });
    const objDesc = r => { if (r.type !== '1' && r.type !== 1) return ''; const d = model.value && model.value.dev.get(r.obj); return d ? txt(d, 'Description') : ''; };
    const hay = r => r.hay ||= (r.name + ' ' + objDesc(r) + ' ' + r.text + ' ' + r.det + ' ' + evName(r.code) + ' ' + evDesc(r.desc) + ' ' + r.code + ' ' + r.desc + ' ' + r.user).toLowerCase();
    const qd = ref(sv ? sv.q : '');
    let qt = 0;
    Vue.watch(q, v => { clearTimeout(qt); qt = setTimeout(() => { qd.value = v; }, 200); });
    onMounted(() => { if (sv) nextTick(() => { const mn = document.getElementById('main'); if (mn) mn.scrollTop = sv.top; }); });
    onBeforeUnmount(() => { clearTimeout(qt); logSaved = { L: logData.value, q: q.value, code: code.value, lim: lim.value, objSet: objSet.value, objTitle: objTitle.value, top: document.getElementById('main')?.scrollTop || 0 }; });
    const list = computed(() => {
      const s = qd.value.trim().toLowerCase(), c = code.value;
      return base.value.filter(r => (!c || r.code === c) && (!s || hay(r).includes(s)));
    });
    const shown = computed(() => list.value.slice(0, lim.value));
    const codes = computed(() => {
      const m = new Map();
      for (const r of base.value) m.set(r.code, (m.get(r.code) || 0) + 1);
      return [...m].sort((a, b) => b[1] - a[1]);
    });
    watchReset(q, code, lim);
    const date = t => t ? new Date(t).toLocaleString('ru') : '—';
    const kindOf = r => ({ 1: 'dev', 2: 'zone', 6: 'delay' })[r.type] || '';
    const onPick = () => { const fs = [...picker.value.files]; picker.value.value = ''; readLogs(fs); };
    return { acc, evName, evSev, evDesc, logData, logBusy, logErr, q, code, lim, objSet, objTitle, picker, list, shown, codes, date, kindOf, objDesc, onPick, clearLog, openTree, all: () => { objSet.value = null; objTitle.value = ''; }, fmt };
  },
  template: `
<Teleport to="#tbhead"><h2>Журнал событий</h2><span v-if="logData" class="m">{{ logData.rows.length }} событий из {{ logData.files.length }} файл.</span></Teleport>
<p v-if="logBusy" class="m">{{ logBusy }}</p>
<p v-if="logErr" class="warn">{{ logErr }}</p>
<div class="bar">
  <button class="buildbtn" :disabled="!!logBusy" @click="picker.click()">Загрузить журнал (.csv)</button>
  <input ref="picker" type="file" :accept="acc('.csv')" multiple hidden @change="onPick"></div>
<div v-if="!logData" class="skel" aria-hidden="true" :title="logBusy ? '' : 'Журнал из ГК (CSV): выберите файлы или перетащите их в рамку слева'">
  <div class="bar"><i class="sk" style="width:300px;height:var(--ctl,32px)"></i><i class="sk" style="width:180px;height:var(--ctl,32px)"></i><i class="sk" style="width:90px"></i></div>
  <div v-for="n in 9" :key="n" class="skr"><i class="sk" style="width:130px"></i><i class="sk" :style="{ width: (30 + n * 37 % 30) + '%' }"></i><i class="sk" style="width:110px"></i></div>
</div>
<template v-if="logData">
<div class="stk"><div class="bar">
  <input type="search" v-model="q" placeholder="Поиск: объект, описание, код, пользователь" style="max-width:380px;margin:0">
  <select v-model="code"><option value="">все коды событий</option><option v-for="[c, n] in codes" :key="c" :value="c">{{ c }}{{ evName(c) ? ' ' + evName(c) : '' }} ({{ n }})</option></select>
  <span v-if="objSet" class="m">Объект: {{ objTitle || 'выбранный' }} · <span class="ref" @click="all">показать все события</span></span>
  <span class="m">найдено: {{ list.length }}</span>
</div></div>
<table class="lg">
  <thead><tr><th>Время</th><th>Событие</th><th>Объект</th></tr></thead>
  <tbody>
  <tr v-for="r in shown" :key="r.uid" :class="evSev(r.code)">
    <td class="tm">{{ date(r.t) }}</td>
    <td class="ev"><i></i>{{ evName(r.code) || r.code }}<template v-if="evDesc(r.desc)"><span class="m">: {{ evDesc(r.desc) }}</span></template></td>
    <td class="ob"><span v-if="kindOf(r)" :class="['chip', 'ref', 'c-' + kindOf(r)]" @click="openTree(kindOf(r), r.obj)">{{ r.name || r.obj }}</span><template v-else>{{ r.name || r.obj }}</template><span v-if="objDesc(r)" class="m"> · {{ objDesc(r) }}</span></td>
  </tr>
  </tbody>
</table>
<p v-if="list.length > shown.length"><button @click="lim += 1000">Ещё 1000 (осталось {{ list.length - shown.length }})</button></p>
</template>`,
};
function watchReset(q, code, lim) { Vue.watch([q, code], () => { lim.value = 500; }); }
