// --- модель конфигурации: устройства, зоны, сценарии, планы ---
const ZERO = '00000000-0000-0000-0000-000000000000';
const child = (n, tag) => { for (const c of n.children) if (c.nodeName === tag) return c; return null; };
const txt = (n, tag) => child(n, tag)?.textContent.trim() ?? '';
const subs = (n, wrap, tag) => { const c = child(n, wrap); return c ? [...c.children].filter(k => k.nodeName === tag) : []; };
const guids = (n, wrap) => subs(n, wrap, 'guid').map(g => g.textContent.trim());
const byNo = (a, b) => (+txt(a, 'No') || 0) - (+txt(b, 'No') || 0);

// параллельные вызовы (вкладка и кнопка в «Файле») делят один разбор
function buildModel(silent) {
  if (model.value) return Promise.resolve(model.value);
  if (S.modelP) return S.modelP;
  const p = S.modelP = buildModelRun(silent).finally(() => { if (S.modelP === p) S.modelP = null; });
  return p;
}
async function buildModelRun(silent) {
  if (silent !== true) loading.value = 'Разбираю XML (может занять несколько секунд)…';
  await new Promise(r => setTimeout(r, 30));
  const myZip = S.zip;
  try {
    const parse = async n => {
      const d = new DOMParser().parseFromString(await getText(n), 'application/xml');
      if (d.querySelector('parsererror')) throw new Error(n + ': некорректный XML');
      return d.documentElement;
    };
    const gk = await parse('GKDeviceConfiguration.xml'), pl = await parse('PlansConfiguration.xml');
    if (myZip !== S.zip) return null;   // архив сменили во время разбора
    if (!child(gk, 'RootDevice')) throw new Error('в GKDeviceConfiguration.xml нет RootDevice');
    const m = { dev: new Map(), zone: new Map(), delay: new Map(), plan: new Map(), devByZone: new Map(), delayRefs: new Map(), unknownDrivers: 0 };
    m.root = child(gk, 'RootDevice');
    m.dev.set(txt(m.root, 'UID'), m.root);
    const stack = subs(m.root, 'Children', 'GKDevice').reverse();   // только устройства дерева (GKDevice есть и в ParameterTemplates), в порядке документа
    for (let d; (d = stack.pop()); ) {
      stack.push(...subs(d, 'Children', 'GKDevice').reverse());
      m.dev.set(txt(d, 'UID'), d);
      for (const z of guids(d, 'ZoneUIDs')) (m.devByZone.get(z) || m.devByZone.set(z, []).get(z)).push(d);
      if (!DRIVERS[txt(d, 'DriverUID')]) m.unknownDrivers++;
    }
    m.zones = subs(gk, 'Zones', 'GKZone').sort(byNo);
    m.zones.forEach(z => m.zone.set(txt(z, 'UID'), z));
    m.delays = subs(gk, 'Delays', 'GKDelay').sort(byNo);
    m.delays.forEach(d => m.delay.set(txt(d, 'UID'), d));
    // зоны дымоудаления: сценарии «Зона ДУ N» (корень) и «Зона ДУ N <суффикс>» (Клапаны, ДП, ДВ, УДП, ПОЖАР…); N может быть дробным (12.1)
    const duMap = new Map(); m.duOf = new Map();
    for (const d of m.delays) {
      const mm = /^Зона ДУ (\d+(?:\.\d+)?)(?: (.+))?$/.exec(txt(d, 'Name'));
      if (!mm) continue;
      const z = duMap.get(mm[1]) || duMap.set(mm[1], { no: mm[1], top: null, subs: [], devs: new Set() }).get(mm[1]);
      if (mm[2]) z.subs.push(d); else z.top = d;
      for (const x of subs(d, 'DirectionDevices', 'DirectionDevice')) {
        const u = txt(x, 'DeviceUid');
        if (!m.dev.has(u)) continue;
        z.devs.add(u);
        const dn = DRIVERS[txt(m.dev.get(u), 'DriverUID')]?.[0] || '';
        if (!dn.startsWith('МДУ') && !dn.startsWith('ШУН-В')) continue;   // на планах — МДУ и ШУН-В
        const a = m.duOf.get(u) || m.duOf.set(u, []).get(u);
        if (!a.includes(mm[1])) a.push(mm[1]);
      }
    }
    m.duZones = new Map();                            // UID пожарной зоны -> номера зон ДУ, в чьё условие «Зона ДУ N ПОЖАР» она входит (границы области на плане)
    for (const d of m.delays) {
      const mm = /^Зона ДУ (\d+(?:\.\d+)?) ПОЖАР$/.exec(txt(d, 'Name'));
      if (!mm) continue;
      for (const g of d.querySelectorAll('Logic ZoneUIDs > guid')) {
        const u = g.textContent.trim(), a = m.duZones.get(u) || m.duZones.set(u, []).get(u);
        if (!a.includes(mm[1])) a.push(mm[1]);
      }
    }
    for (const a of m.duZones.values()) a.sort((x, y) => parseFloat(x) - parseFloat(y));
    m.duList = [...duMap.values()].sort((a, b) => parseFloat(a.no) - parseFloat(b.no));
    for (const a of m.duOf.values()) a.sort((x, y) => parseFloat(x) - parseFloat(y));
    for (const d of m.delays) {                       // сценарии, упомянутые в условиях (Logic) другого сценария
      const refs = new Set([...d.querySelectorAll('Logic DelayUIDs > guid')].map(g => g.textContent.trim()).filter(u => m.delay.has(u)));
      m.delayRefs.set(txt(d, 'UID'), [...refs].map(u => m.delay.get(u)).sort(byNo));
    }
    m.delaysByZone = new Map();                       // UID зоны -> сценарии, в чьих условиях (Logic) она участвует
    for (const d of m.delays) for (const g of d.querySelectorAll('Logic ZoneUIDs > guid')) {
      const u = g.textContent.trim(), a = m.delaysByZone.get(u) || m.delaysByZone.set(u, []).get(u);
      if (!a.includes(d)) a.push(d);
    }
    m.delaysByDev = new Map();                        // UID устройства -> сценарии, где оно участвует
    for (const d of m.delays) for (const x of subs(d, 'DirectionDevices', 'DirectionDevice')) {
      const u = txt(x, 'DeviceUid'), a = m.delaysByDev.get(u) || m.delaysByDev.set(u, []).get(u);
      if (!a.includes(d)) a.push(d);
    }
    for (const p of pl.getElementsByTagName('Plan')) m.plan.set(txt(p, 'UID'), p);
    m.planRoots = subs(pl, 'Plans', 'Plan');
    m.planOf = new Map();   // UID элемента плана -> ближайший план
    for (const u of pl.getElementsByTagName('UID')) {
      let p = u.parentElement;
      while (p && p.nodeName !== 'Plan') p = p.parentElement;
      if (p && p !== u.parentElement) m.planOf.set(u.textContent.trim(), p);
    }
    m.planObjs = new Map();  // UID плана -> { dev, zone }: сами объекты, имеющие на нём элементы
    m.planCnt = new Map();   // UID плана -> { dev, zone }: сколько устройств/зон имеют на нём элементы
    for (const [kind, map] of [['dev', m.dev], ['zone', m.zone]]) for (const x of map.values()) {
      const ps = new Set();
      for (const e of guids(x, 'PlanElementUIDs')) { const p = m.planOf.get(e); if (p) ps.add(txt(p, 'UID')); }
      for (const u of ps) { const c = m.planCnt.get(u) || m.planCnt.set(u, {}).get(u); c[kind] = (c[kind] || 0) + 1; }
      for (const u of ps) { const c = m.planObjs.get(u) || m.planObjs.set(u, { dev: [], zone: [] }).get(u); c[kind].push(x); }
    }
    // планы с устройствами зон ДУ: поэтажные, отметка «+15,000» и кровля (без панели ПМИ), подписаны этажом
    const FLOORS = DU_CONFIG.floors;
    m.duPlans = [];
    for (const [u, o] of m.planObjs) {
      const p = m.plan.get(u), name = txt(p, 'Name'), n = o.dev.filter(d => m.duOf.has(txt(d, 'UID'))).length;
      if (n && FLOORS.includes(name)) m.duPlans.push({ uid: u, n, label: name });
    }
    m.duPlans.sort((a, b) => FLOORS.indexOf(a.label) - FLOORS.indexOf(b.label));
    return model.value = m;
  } catch (e) {
    error.value = 'Не удалось разобрать конфигурацию: ' + e.message;
    return null;
  } finally {
    loading.value = '';
  }
}
