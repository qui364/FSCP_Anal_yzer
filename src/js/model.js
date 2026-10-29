const ZERO = '00000000-0000-0000-0000-000000000000';
const child = (n, tag) => { for (const c of n.children) if (c.nodeName === tag) return c; return null; };
const txt = (n, tag) => child(n, tag)?.textContent.trim() ?? '';
const subs = (n, wrap, tag) => { const c = child(n, wrap); return c ? [...c.children].filter(k => k.nodeName === tag) : []; };
const guids = (n, wrap) => subs(n, wrap, 'guid').map(g => g.textContent.trim());
const byNo = (a, b) => (+txt(a, 'No') || 0) - (+txt(b, 'No') || 0);

function buildModel(silent) {
  if (model.value) return Promise.resolve(model.value);
  if (S.modelP) return S.modelP;
  const p = S.modelP = buildModelRun(silent).finally(() => { if (S.modelP === p) S.modelP = null; });
  return p;
}
const step = t => { stage.value = t; return new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))); };

async function buildModelRun(silent) {
  if (silent !== true) loading.value = 'Разбираю XML (может занять несколько секунд)…';
  await loadData('device-defaults', 'param-enums');
  await new Promise(r => setTimeout(r, 30));
  const myZip = S.zip;
  try {
    const parse = async n => {
      const d = new DOMParser().parseFromString(await getText(n), 'application/xml');
      if (d.querySelector('parsererror')) throw new Error(n + ': некорректный XML');
      return d.documentElement;
    };
    await step('Разбираю файл устройств…');
    const gk = await parse('GKDeviceConfiguration.xml');
    await step('Разбираю планы…');
    const pl = await parse('PlansConfiguration.xml');
    if (myZip !== S.zip) return null;
    if (!child(gk, 'RootDevice')) throw new Error('в GKDeviceConfiguration.xml нет RootDevice');
    const m = { dev: new Map(), zone: new Map(), delay: new Map(), plan: new Map(), devByZone: new Map(), delayRefs: new Map(), unknownDrivers: 0 };
    m.root = child(gk, 'RootDevice');
    m.dev.set(txt(m.root, 'UID'), m.root);
    await step('Собираю дерево устройств…');
    const stack = subs(m.root, 'Children', 'GKDevice').reverse();
    for (let d; (d = stack.pop()); ) {
      stack.push(...subs(d, 'Children', 'GKDevice').reverse());
      m.dev.set(txt(d, 'UID'), d);
      for (const z of guids(d, 'ZoneUIDs')) (m.devByZone.get(z) || m.devByZone.set(z, []).get(z)).push(d);
      if (!DRIVERS[txt(d, 'DriverUID')]) m.unknownDrivers++;
    }
    await step('Собираю зоны и сценарии…');
    m.zones = subs(gk, 'Zones', 'GKZone').sort(byNo);
    m.zones.forEach(z => m.zone.set(txt(z, 'UID'), z));
    m.delays = subs(gk, 'Delays', 'GKDelay').sort(byNo);
    m.delays.forEach(d => m.delay.set(txt(d, 'UID'), d));
    for (const d of m.delays) {
      const refs = new Set([...d.querySelectorAll('Logic DelayUIDs > guid')].map(g => g.textContent.trim()).filter(u => m.delay.has(u)));
      m.delayRefs.set(txt(d, 'UID'), [...refs].map(u => m.delay.get(u)).sort(byNo));
    }
    m.delaysByZone = new Map();
    for (const d of m.delays) for (const g of d.querySelectorAll('Logic ZoneUIDs > guid')) {
      const u = g.textContent.trim(), a = m.delaysByZone.get(u) || m.delaysByZone.set(u, []).get(u);
      if (!a.includes(d)) a.push(d);
    }
    await step('Связываю устройства со сценариями…');
    m.delaysByDev = new Map();
    for (const d of m.delays) for (const x of subs(d, 'DirectionDevices', 'DirectionDevice')) {
      const u = txt(x, 'DeviceUid'), a = m.delaysByDev.get(u) || m.delaysByDev.set(u, []).get(u);
      if (!a.includes(d)) a.push(d);
    }
    await step('Раскладываю объекты по планам…');
    for (const p of pl.getElementsByTagName('Plan')) m.plan.set(txt(p, 'UID'), p);
    m.planRoots = subs(pl, 'Plans', 'Plan');
    m.planOf = new Map();
    for (const u of pl.getElementsByTagName('UID')) {
      let p = u.parentElement;
      while (p && p.nodeName !== 'Plan') p = p.parentElement;
      if (p && p !== u.parentElement) m.planOf.set(u.textContent.trim(), p);
    }
    m.planObjs = new Map();
    m.planCnt = new Map();
    for (const [kind, map] of [['dev', m.dev], ['zone', m.zone]]) for (const x of map.values()) {
      const ps = new Set();
      for (const e of guids(x, 'PlanElementUIDs')) { const p = m.planOf.get(e); if (p) ps.add(txt(p, 'UID')); }
      for (const u of ps) { const c = m.planCnt.get(u) || m.planCnt.set(u, {}).get(u); c[kind] = (c[kind] || 0) + 1; }
      for (const u of ps) { const c = m.planObjs.get(u) || m.planObjs.set(u, { dev: [], zone: [] }).get(u); c[kind].push(x); }
    }
    return model.value = m;
  } catch (e) {
    error.value = 'Не удалось разобрать конфигурацию: ' + e.message;
    return null;
  } finally {
    loading.value = ''; stage.value = '';
  }
}
