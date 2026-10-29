// проверка журнала по конфигурации: «лишние» включения исполнителей, эпизоды, повторы (расчёт — check.js)
let chkSaved = null;   // состояние страницы между заходами: раскрытые эпизоды, «Ещё 200», прокрутка; действует, пока те же журнал и конфигурация
const CheckView = {
  setup() {
    const res = shallowRef(null), busy = ref(''), open = ref(new Set()), lim = ref(200);
    const run = async () => {
      if (!logData.value || !loaded.value) return;
      busy.value = 'Проверяю журнал по конфигурации…';
      try {
        await buildModel(true); res.value = await chkGet();
        const sv = chkSaved && chkSaved.res === res.value ? chkSaved : null;
        if (sv) { open.value = new Set(sv.open); lim.value = sv.lim; await nextTick(); const mn = document.getElementById('main'); if (mn) { mn.scrollTop = sv.top; setTimeout(() => { mn.scrollTop = sv.top; }, 120); } }
      }
      catch (e) { error.value = 'Не удалось выполнить проверку: ' + e.message; }
      finally { busy.value = ''; }
    };
    onMounted(run);
    onBeforeUnmount(() => { if (res.value) chkSaved = { res: res.value, open: [...open.value], lim: lim.value, top: document.getElementById('main')?.scrollTop || 0 }; });
    const date = t => new Date(t).toLocaleString('ru'), time = t => new Date(t).toLocaleTimeString('ru');
    const toggle = i => { const s = new Set(open.value); s.has(i) ? s.delete(i) : s.add(i); open.value = s; };
    const eps = computed(() => res.value ? res.value.eps.filter(e => e.key).reverse() : []);
    const kinds = e => 'Включено ' + e.n + ': ' + Object.entries(e.kinds).map(([k, v]) => `${CHK_CLS[k]} — ${v}`).join('; ');
    const objDesc = u => { const d = model.value && model.value.dev.get(u); return d ? txt(d, 'Description') : ''; };
    const lineFaults = e => { const re = new RegExp('(^|[^\\d.])' + e.loop.line.replace(/\./g, '\\.') + '\\.'); return e.pre.filter(x => x[1] === 'fault' && re.test(x[3])); };
    const laneCol = Object.fromEntries(CHK_LANES.map(l => [l[0], l[2]]));
    const MD = { a: 'авто', m: 'ручной', o: 'отключён' };
    const tlText = p => { const [, ln, c, n, ty] = p, nm = n || '', ev = EVENTS[c] || c;
      if (ln === 'fire') return (ty == 2 ? 'Сработала зона' : 'Сработал датчик') + ' · ' + nm + ' (' + ev + ')';
      if (ln === 'scen') return (c === '20020069' ? 'Сценарий выключен' : 'Запуск сценария') + ' · ' + nm;
      if (ln === 'mode') return 'Режим · ' + nm + ' — ' + MD[CHK_MODE[c]];
      return 'Неисправность · ' + nm + ' (' + ev + ')'; };
    const scState = x => x.mode === 'm' ? 'был в ручном режиме' : x.act ? 'был в состоянии «Включено»' : x.mode !== 'o' && x.st ? 'был в состоянии «' + (EVENTS[x.st] || x.st) + '»' : x.mode === 'o' ? 'был в состоянии «Отключено»' : 'был в состоянии «Выключено»';
    const stOf = (e, u) => { const x = e.sc.find(y => y.u === u); return x ? scState(x).replace('был ', '') : ''; };
    const scOn = x => 'исполнители включились: ' + x.on + ' из ' + x.tot + (x.mode !== 'a' || !x.act ? ' — по сценарию так не бывает' : '');
    const als = line => { if (!model.value) return null; for (const d of model.value.dev.values()) if (txt(d, 'DriverUID') === '4d5647df-a278-48f6-9f89-19e4d51b7711' && devAddr(d) === line) return { u: txt(d, 'UID'), l: devLabel(d) }; return null; };   // линия АЛС из дерева
    const objLabel = (k, u, n) => { const el = model.value && model.value[k].get(u); return el ? (k === 'dev' ? devLabel(el) : k === 'zone' ? zoneLabel(el) : delayLabel(el)) : n; };   // подпись как в дереве
    const timeline = e => {
      const out = [], dis = new Map();
      for (const x of e.sc) for (const u of x.up || []) if (u.mode === 'o') dis.set(u.u, u);
      for (const u of dis.values()) out.push({ t: 0, col: '#e5484d', up: u });   // отключённый старший сценарий — выше всех
      for (const x of e.sc.slice(0, 4)) out.push({ t: 0, col: '#e5484d', sc: x, res: true });
      const lf = e.loop ? lineFaults(e) : [];
      if (e.loop && !lf.length) out.push({ t: 0, col: '#8a8f98', mut: true, text: 'Неисправностей линии ' + e.loop.line + ' за час до эпизода не было' });
      const ev = lf.map(p => ({ t: p[0], col: laneCol.fault, text: tlText(p), o: String(p[4]) === '1' ? { k: 'dev', u: p[5], n: objLabel('dev', p[5], p[3]), pre: 'Неисправность ·', post: '(' + (EVENTS[p[2]] || p[2]) + ')' } : null }));
      const g = [];
      for (const p of e.pre.filter(x => x[1] !== 'fault')) {
        const l = g[g.length - 1];
        if (l && l.p[1] === p[1] && l.p[2] === p[2] && l.p[4] === p[4] && p[0] - l.last <= 2000) { l.names.push(p[3]); l.last = p[0]; }
        else g.push({ p, names: [p[3]], last: p[0] });
      }
      for (const x of g) {
        const t0 = tlText(x.p);
        if (x.names.length < 2) { const q = x.p, k = ({ 1: 'dev', 2: 'zone', 6: 'delay' })[q[4]]; ev.push({ t: q[0], col: laneCol[q[1]], text: t0, o: k && q[1] !== 'fault' ? { k, u: q[5], n: objLabel(k, q[5], q[3]), pre: t0.split(' · ')[0] + ' ·', post: (/\(([^()]*)\)\s*$/.exec(t0) || [])[1] ? '(' + /\(([^()]*)\)\s*$/.exec(t0)[1] + ')' : '' } : null }); continue; }
        const head = t0.split(' · ')[0], pl = { 'Сработал датчик': 'Сработали датчики', 'Сработала зона': 'Сработали зоны', 'Запуск сценария': 'Запуск сценариев', 'Сценарий выключен': 'Сценарии выключены', 'Неисправность': 'Неисправности' }[head] || head;
        ev.push({ t: x.p[0], col: laneCol[x.p[1]], text: pl + ' (' + x.names.length + '): ' + x.names.slice(0, 3).join(', ') + (x.names.length > 3 ? ' и ещё ' + (x.names.length - 3) : '') });
      }
      ev.sort((a, b) => a.t - b.t);
      const fl = ev.filter(x => x.col === laneCol.fault), rest = ev.filter(x => x.col !== laneCol.fault);
      out.push(...fl);
      out.push(...rest);
      const grp = x => x.sc || x.up ? 0 : x.mut || x.col === laneCol.fault ? 1 : 2;
      out.forEach((x, i) => { x.gap = i > 0 && grp(x) !== grp(out[i - 1]); });   // пустое место между блоками
      return out;
    };
    return { als, objLabel, stOf, scState, scOn, timeline, lineFaults, laneCol, tlText, res, busy, open, lim, eps, logData, loaded, CHK_CLS, date, time, objDesc, toggle, kinds, openTree };
  },
  template: `
<Teleport to="#tbhead"><h2>Ложные пуски</h2><span class="m">включения шлейфов без команды в конфигурации</span></Teleport>
<p v-if="busy" class="m">{{ busy }}</p>
<p v-if="!loaded || !logData" class="m">Для проверки нужны конфигурация (.fscp) и журнал событий (.csv).</p>
<template v-if="res">
<p v-if="!eps.length" class="m">Несанкционированных пусков шлейфа не найдено.</p>
<div v-else class="ecards">
  <div v-for="e in eps" :key="e.t0" :class="['ecard', { warn: !e.loop && e.early }]">
    <div class="ec-h">
      <span class="cnt">{{ e.n }}</span>
      <span class="ttl"><template v-if="e.loop">Несанкционированный пуск шлейфа</template><template v-else>{{ kinds(e) }}</template></span>
      <template v-if="e.loop"><span v-if="als(e.loop.line)" class="chip ref c-dev" @click="openTree('dev', als(e.loop.line).u)">{{ als(e.loop.line).l }}</span><span v-else class="chip t" style="--ck:#e5484d">АЛС {{ e.loop.line }}</span></template>
      <span v-if="e.early" class="m">начало журнала — состояние неизвестно</span>
      <span class="when">{{ date(e.t0) }}<template v-if="e.t1 - e.t0 > 1000"> – {{ time(e.t1) }}</template></span>
    </div>
    <div class="ec-b">
      <div class="tl2">
        <div v-for="(x, k) in timeline(e)" :key="k" :class="['tl2-i', { gap: x.gap }]">
          <span class="tm">{{ x.t ? time(x.t) : '' }}</span><i :style="{ background: x.col }"></i>
          <div v-if="x.up"><span class="chip ref c-delay" @click="openTree('delay', x.up.u)">{{ x.up.l }}</span> старший сценарий был в состоянии «Отключено» — нижестоящие не должны включаться</div>
          <div v-else-if="x.sc"><span class="chip ref c-delay" @click="openTree('delay', x.sc.u)">{{ x.sc.l }}</span> {{ scState(x.sc) }}, {{ scOn(x.sc) }}
          </div>
          <div v-else-if="x.o">{{ x.o.pre }} <span :class="['chip', 'ref', 'c-' + x.o.k]" @click="openTree(x.o.k, x.o.u)">{{ x.o.n }}</span><template v-if="x.o.post"> {{ x.o.post }}</template></div>
          <div v-else :class="{ m: x.mut }">{{ x.text }}</div>
        </div>
          <div v-for="(it, j) in e.items.slice(0, lim)" :key="it.u + it.t" :class="['tl2-i', { gap: !j }]">
            <span class="tm">{{ time(it.t) }}</span><i style="background:#e5484d"></i>
            <div>Включено <span class="chip ref c-dev" @click="openTree('dev', it.u)">{{ objLabel('dev', it.u, it.name) }}</span><span v-if="objDesc(it.u)" class="m"> · {{ objDesc(it.u) }}</span><template v-for="p in it.pars" :key="p.u"><span class="chip ref c-delay" style="margin:0 4px 0 8px" @click="openTree('delay', p.u)">{{ p.l }}</span><span v-if="stOf(e, p.u)" class="m">{{ stOf(e, p.u) }}</span></template><span v-if="!it.pars.length" class="m"> · {{ CHK_CLS[it.cls] }}</span></div>
          </div>
          <div v-if="e.items.length > lim" class="tl2-i"><i style="background:var(--mut)"></i><button @click="lim += 200">Ещё 200 (осталось {{ e.items.length - lim }})</button></div>
      </div>
    </div>
  </div>
</div>
</template>`,
};
