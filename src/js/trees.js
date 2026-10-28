const devName = d => txt(d, 'PredefinedName') || DRIVERS[txt(d, 'DriverUID')]?.[0] || 'Неизвестный тип ' + txt(d, 'DriverUID').slice(0, 8);
const devLabel = d => {
  const full = devAddr(d);
  return full ? `[${full}] ${devName(d)}` : devName(d);
};
const zoneLabel = z => `[${txt(z, 'No')}] ${txt(z, 'Name')}`;
const delayLabel = d => `[${txt(d, 'No')}] ${txt(d, 'Name')}`;

// Значки-заглушки для драйверов без записи в PLAN_ICONS: DriverUID -> ключ TREE_ICONS (только дерево)
const TREE_DRV_ICONS = {
  'c1c19c8d-6462-4d5c-a9ec-56e2222ac245': 'drv-zp.png',
  '4d5647df-a278-48f6-9f89-19e4d51b7711': 'drv-als.png',
  '33d7122b-0898-433a-ba1c-212231e5c211': 'drv-bmp.png',
  '848642dd-be2f-443b-9739-ff6c7c06dc4c': 'drv-ind.png',
  '77980273-4b1d-4acc-915e-95ffdcd1dd02': 'drv-rel.png',
  '938947c5-4624-4a1a-939c-60aeebf7b65c': 'drv-lan.png'
};

const devItem = (d, leaf) => {
  return { k: 'dev', paramInfo: deviceParameters(d), key: txt(d, 'UID'), label: devLabel(d), ic: PLAN_ICONS[txt(d, 'DriverUID')] || TREE_DRV_ICONS[txt(d, 'DriverUID')], sub: txt(d, 'Description'), off: txt(d, 'IsDisabled') === 'true', kids: () => leaf ? [] : subs(d, 'Children', 'GKDevice').map(c => devItem(c)), detail: () => devDetail(d) };
};
const zoneItem = z => ({ k: 'zone', key: txt(z, 'UID'), label: zoneLabel(z), sub: '', kids: () => (model.value.devByZone.get(txt(z, 'UID')) || []).map(d => devItem(d, true)), detail: () => zoneDetail(z) });
const delayItem = d => ({ k: 'delay', logic: () => delayLogic(d), key: txt(d, 'UID'), label: delayLabel(d), sub: '', kids: () => subs(d, 'DirectionDevices', 'DirectionDevice').map(x => model.value.dev.get(txt(x, 'DeviceUid'))).filter(Boolean).map(x => devItem(x, true)), detail: () => delayDetail(d) });
const isPlanFolder = p => subs(p, 'Children', 'Plan').length > 0;
const planItem = p => isPlanFolder(p)
  ? { k: 'folder', key: txt(p, 'UID'), label: txt(p, 'Name'), sub: '', count: subs(p, 'Children', 'Plan').filter(c => !isPlanFolder(c)).length, kids: () => subs(p, 'Children', 'Plan').map(planItem), detail: () => folderDetail(p) }
  : { k: 'plan', key: txt(p, 'UID'), label: txt(p, 'Name'), sub: '', kids: () => [...planElemItems(p), ...planObjItems(p)], detail: () => planDetail(p) };
// переходы на планы и текстовые блоки плана (в просмотрщике — только отрисовка)
function planElemItems(p) {
  const f = (e, extra) => ['Left', 'Top', 'Width', 'Height'].map(k => txt(e, k)).every(Boolean) ? [['Положение', `${Math.round(+txt(e, 'Left'))}, ${Math.round(+txt(e, 'Top'))}; ${Math.round(+txt(e, 'Width'))} × ${Math.round(+txt(e, 'Height'))}`], ...extra] : extra;
  const links = subs(p, 'ElementRectangleSubPlans', 'ElementRectangleSubPlan').concat(subs(p, 'ElementPolygonSubPlans', 'ElementPolygonSubPlan')).map(e => {
    const uid = txt(e, 'UID'), to = model.value.plan.get(txt(e, 'PlanUID'));
    return { k: 'plink', key: uid, label: 'Переход на план: ' + (txt(e, 'Caption') || txt(e, 'Name')), sub: '', kids: () => [], detail: () => kv([['UID', uid], ['Подпись', txt(e, 'Caption')], ['Целевой план', to ? txt(to, 'Name') : txt(e, 'PlanUID')], ['UID плана', txt(e, 'PlanUID')], ...f(e, []), ['Источник', srcRef('PlansConfiguration.xml', uid)]]) };
  });
  const texts = subs(p, 'ElementTextBlocks', 'ElementTextBlock').map(e => {
    const uid = txt(e, 'UID');
    return { k: 'ptext', key: uid, label: 'Текст: ' + (txt(e, 'Text') || '—'), sub: '', kids: () => [], detail: () => kv([['UID', uid], ['Текст', txt(e, 'Text')], ['Шрифт', `${txt(e, 'FontFamilyName')}, ${txt(e, 'FontSize')}`], ...f(e, []), ['Источник', srcRef('PlansConfiguration.xml', uid)]]) };
  });
  return [...links, ...texts];
}
// зоны плана (с их устройствами, стоящими на этом же плане) и устройства вне этих зон
function planObjItems(p) {
  const o = model.value.planObjs.get(txt(p, 'UID'));
  if (!o) return [];
  const onPlan = new Set(o.dev), inZone = new Set();
  const zones = o.zone.map(z => {
    const ds = (model.value.devByZone.get(txt(z, 'UID')) || []).filter(d => onPlan.has(d));
    ds.forEach(d => inZone.add(d));
    return { ...zoneItem(z), kids: () => ds.map(d => devItem(d, true)) };
  });
  return [...zones, ...o.dev.filter(d => !inZone.has(d)).map(d => devItem(d, true))];
}

const TREES = {
  dev:   m => ({ title: 'Устройства', roots: [devItem(m.root)], note: `${m.dev.size - 1} устройств`, warn: m.unknownDrivers ? `неизвестных драйверов: ${m.unknownDrivers}` : '' }),
  zone:  m => ({ title: 'Зоны', roots: m.zones.map(zoneItem), note: `${m.zones.length} зон` }),
  delay: m => ({ title: 'Сценарии', roots: m.delays.map(delayItem), note: `${m.delays.length} сценариев` }),
  plan:  m => ({ title: 'Планы', plans: true, roots: m.planRoots.map(planItem), note: `${[...m.plan.values()].filter(p => !isPlanFolder(p)).length} планов` }),
};

// Панель деталей: строки [подпись, значение]. Значение — строка/число, {warn}, либо массив {label, goto|src+line|open, note} / {more}
const link = (label, a) => ({ label, ...a });
// SEP — разделитель блоков в таблице деталей; лишние (в начале, в конце, подряд) отбрасываются
const SEP = ['', { sep: 1 }];
const kv = rows => rows.filter(r => r === SEP || (r[1] !== '' && r[1] != null && !(Array.isArray(r[1]) && !r[1].length)))
  .filter((r, i, a) => r !== SEP || (i > 0 && i < a.length - 1 && a[i - 1] !== SEP));
function srcRef(file, uid) {
  const t = S.xmlTexts[file], i = t ? uidIndex(file, t).get(uid) ?? -1 : -1;
  if (i < 0) return '';
  const ln = lineOf(lineIndex(file, t), i);
  return [link(`${file}:${ln}`, { xml: file, uid })];
}
// смещение первого <UID>…</UID> каждого объекта; один проход по файлу вместо indexOf на каждый клик
function uidIndex(file, t) {
  const key = file + '#uid';
  if (S.guidIdx[key]) return S.guidIdx[key];
  const m = new Map();
  for (const x of t.matchAll(/<UID>([^<]+)<\/UID>/g)) if (!m.has(x[1])) m.set(x[1], x.index);
  return S.guidIdx[key] = m;
}
const more = (arr, n = 100) => !arr.length ? '' : arr.length > n ? [...arr.slice(0, n), { more: arr.length - n }] : arr;

// цепочка устройств от верхнего (без корня RootDevice) до d
function devChain(d) {
  const chain = [];
  for (let n = d; n && n !== model.value.root; n = n.parentElement?.parentElement) chain.unshift(n);
  return chain;
}
// Групповой драйвер (hasChildrens: МВК4, РМ2…) собственного адреса не имеет: его дети адресуются в обход него,
// а сам он подписывается диапазоном адресов детей, например 1.8.3.1-4
const isGroup = d => !!DRIVERS[txt(d, 'DriverUID')]?.[4];
// драйверы с noAddress (ГК, линии, группы индикаторов/реле…) в адресации не участвуют
const noAddr = d => isGroup(d) || !!DRIVERS[txt(d, 'DriverUID')]?.[3];
const addrCache = new WeakMap();
function devAddr(d) {
  let a = addrCache.get(d);
  if (a == null) addrCache.set(d, a = devAddrCalc(d));
  return a;
}
function devAddrCalc(d) {
  if (!isGroup(d) && noAddr(d)) return '';
  const parts = devChain(d).filter(n => !noAddr(n)).map(n => txt(n, 'IntAddress'));
  if (isGroup(d)) {
    const nums = subs(d, 'Children', 'GKDevice').map(c => +txt(c, 'IntAddress')).filter(Number.isFinite);
    if (nums.length) { const a = Math.min(...nums), b = Math.max(...nums); parts.push(a === b ? a : `${a}-${b}`); }
  }
  return parts.join('.');
}
// планы, на которых стоят элементы объекта (PlanElementUIDs); число элементов — в примечании
function onPlans(x) {
  const m = model.value, by = new Map(), els = guids(x, 'PlanElementUIDs');
  for (const e of els) { const p = m.planOf.get(e); const k = p ? txt(p, 'UID') : ''; by.set(k, (by.get(k) || 0) + 1); }
  return [...by].map(([k, n]) => link(k ? txt(m.plan.get(k), 'Name') || k : 'план не найден', { ...(k ? { goto: 'plan:' + k } : {}), note: n > 1 ? `× ${n}` : '' }));
}
function devDetail(d) {
  const m = model.value, chain = devChain(d), full = devAddr(d);
  const uid = txt(d, 'UID'), drvId = txt(d, 'DriverUID'), drv = DRIVERS[drvId];
  const zones = guids(d, 'ZoneUIDs').map(z => link(m.zone.has(z) ? zoneLabel(m.zone.get(z)) : z, { goto: 'zone:' + z }));
  const ez = txt(d, 'EnterZoneUID'), xz = txt(d, 'ExitZoneUID');
  return kv([
    ['Драйвер', drv ? `${drv[0]} — ${drv[1]}` : { warn: 'неизвестен' }],
    ['Категория драйвера', drv ? drv[5] : ''], ['DriverUID', drvId], ['UID', uid], SEP,
    ['Номер', txt(d, 'No')], ['Адрес', txt(d, 'IntAddress')], ['Полный адрес', full], ['Серийный номер', txt(d, 'SerialNo')],
    ['Описание', txt(d, 'Description') || ' '], ['PredefinedName', txt(d, 'PredefinedName')], ['Адрес проекта', txt(d, 'ProjectAddress')],
    ['Отключено', txt(d, 'IsDisabled') === 'true' ? 'да' : ''], SEP,
    ['Источник', srcRef('GKDeviceConfiguration.xml', uid)],
    ['Путь', { crumbs: chain.map(n => link(devLabel(n), { goto: 'dev:' + txt(n, 'UID') })) }], ['Зоны', more(zones)],
    ['Зона входа', ez && ez !== ZERO ? ez : ''], ['Зона выхода', xz && xz !== ZERO ? xz : ''],
    ['Сценарии', more((m.delaysByDev.get(uid) || []).map(x => link(delayLabel(x), { goto: 'delay:' + txt(x, 'UID') })))],
    ['Планы', onPlans(d)], ['События', logLink([uid], devLabel(d))],
  ]);
}
function zoneDetail(z) {
  const uid = txt(z, 'UID');
  return kv([['UID', uid], ['Номер', txt(z, 'No')], ['Имя', txt(z, 'Name')], ['Описание', txt(z, 'Description')],
    ['Устройств', (model.value.devByZone.get(uid) || []).length], SEP,
    ['Пожар Б', txt(z, 'IsFireB')], ['Задержка Пожар Б', txt(z, 'FireBDelayTime')],
    ['Датчиков «Пожар 1»', txt(z, 'Fire1Count')], ['Датчиков «Пожар 2»', txt(z, 'Fire2Count')], SEP,
    ['Источник', srcRef('GKDeviceConfiguration.xml', uid)],
    ['Сценарии', more((model.value.delaysByZone.get(uid) || []).map(x => link(delayLabel(x), { goto: 'delay:' + txt(x, 'UID') })))],
    ['Планы', onPlans(z)], ['События зоны', logLink([uid], zoneLabel(z))],
    ['События устройств зоны', logLink((model.value.devByZone.get(uid) || []).map(d => txt(d, 'UID')), 'устройства зоны ' + zoneLabel(z))]]);
}
const ST = { On: 'Включено', Off: 'Выключено', Fire1: 'Пожар 1', Fire2: 'Пожар 2', Attention: 'Внимание', Failure: 'Неисправность' };
const CLOP = { AnyDevice: 'Любое из устройств', AnyZone: 'Любая из зон', AnyDelay: 'Любой из сценариев', AllDelays: 'Все сценарии' };
// группа условий -> { join, kids: [clause | group] }; clause: { op, state, items: [{label, goto}] }
function logicGroup(g) {
  const m = model.value, one = (kind, map, lab) => u => { const x = map.get(u); return { label: x ? lab(x) : u, goto: kind + ':' + u }; };
  const kids = [];
  for (const c of subs(g, 'Clauses', 'GKClause')) {
    const items = [...guids(c, 'DeviceUIDs').map(one('dev', m.dev, devLabel)), ...guids(c, 'ZoneUIDs').map(one('zone', m.zone, zoneLabel)), ...guids(c, 'DelayUIDs').map(one('delay', m.delay, delayLabel))];
    const op = txt(c, 'ClauseOperationType'), st = txt(c, 'StateType');
    kids.push({ op: CLOP[op] || op, state: ST[st] || st, sk: st, items });
  }
  for (const x of subs(g, 'ClauseGroups', 'ClauseGroup')) kids.push(logicGroup(x));
  return { join: txt(g, 'ClauseJoinOperationType') === 'And' ? 'И' : 'ИЛИ', kids };
}
const delayLogic = d => { const g = child(child(d, 'Logic') || d, 'OnClausesGroup'); return g && (g.querySelector('GKClause') ? logicGroup(g) : null); };
function delayDetail(d) {
  const uid = txt(d, 'UID');
  return kv([['UID', uid], ['No', txt(d, 'No')], ['Имя', txt(d, 'Name')], ['Описание', txt(d, 'Description')],
    ['Задержка', txt(d, 'DelayTime')], ['Удержание', txt(d, 'Hold')], ['Режим', txt(d, 'DelayRegime')],
    ['Автосоздан', txt(d, 'IsAutoGenerated') === 'true' ? 'да' : ''],
    ['Источник', srcRef('GKDeviceConfiguration.xml', uid)], ['События', logLink([uid], delayLabel(d))]]);
}
function folderDetail(p) {
  const uid = txt(p, 'UID');
  return kv([['UID', uid], ['Имя', txt(p, 'Name')], ['Описание', txt(p, 'Description')], ['Планов', subs(p, 'Children', 'Plan').filter(c => !isPlanFolder(c)).length], ['Источник', srcRef('PlansConfiguration.xml', uid)]]);
}
function planDetail(p) {
  const uid = txt(p, 'UID'), bg = txt(p, 'BackgroundImageSource'), file = 'Content/' + bg;
  return kv([['UID', uid], ['No', txt(p, 'No')], ['Имя', txt(p, 'Name')], ['Описание', txt(p, 'Description')],
    ['Размер', `${txt(p, 'Width')} × ${txt(p, 'Height')}`], ['Вложенных планов', subs(p, 'Children', 'Plan').length || ''],
    ['Подложка', bg ? (entries.value.some(e => e.name === file) ? [link(file, { open: file })] : bg) : ''],
    ['Исходное имя', txt(p, 'BackgroundSourceName')], ['Источник', srcRef('PlansConfiguration.xml', uid)]]);
}

// обход в ширину по ленивым детям; возвращает цепочки узлов от корня до совпадения
function findPaths(roots, pred, limit) {
  const hits = [], queue = roots.map(r => [r]);
  for (let qi = 0; qi < queue.length && hits.length < limit; qi++) {
    const path = queue[qi], it = path[path.length - 1];
    if (pred(it)) hits.push(path);
    if (path.some((p, i) => i < path.length - 1 && p.key === it.key)) continue;   // цикл по предкам
    for (const k of (it._k ||= it.kids())) queue.push([...path, k]);
  }
  return hits;
}
