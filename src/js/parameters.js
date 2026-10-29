// Сопоставление по Name, как в GKDevice.InitializeDefaultProperties; No не уникален.
const deviceParamCache = new WeakMap();
// Подписи параметров из Rubezh.GKModule.Common.dll: DriverUID -> Name -> подпись.
function paramText(uid, name, v) {
  const t = PARAM_ENUMS[uid]?.[name]?.[v === '' ? NaN : Number(v)];
  return t ?? (v === '' ? 'пусто' : v);
}
const PARAM_LABELS = {
  '57c45124-9300-49bc-a268-68f3d929927b': { Mode: 'Линия', 'Parameter 0': 'Порог питания, В', 'Parameter 1': 'Яркость, %',
    ConnectionLostCount: 'Число неответов адресных устройств', 'Parameter 3': 'Интервал опроса шлейфов, мс',
    als12: 'АЛС 1-2', als34: 'АЛС 3-4', als56: 'АЛС 5-6', als78: 'АЛС 7-8' },
  '72b08282-457d-4e7b-b86f-ebcc0cc4ef03': { Mode: 'Линия', NoPassword: 'Вход без пароля', 'Parameter 0': 'Засыпание, мин', 'Parameter 1': 'Яркость, %' },
  'c052395d-043f-4590-a0b8-bc49867adc6a': { IPAddress: 'IP адрес', ReservedIPAddress: 'Резервный IP адрес', PollInterval: 'Интервал опроса, мс', ConnectionLostCount: 'Неответы' },
  '200eed4b-3402-45b4-8122-ae51a4841e18': { Mode: 'Режим работы' },
  '1ac85436-61bc-441b-b6bf-c6a0fa62748b': { Mode: 'Режим работы' },
  '17a2b7d1-cb62-4af7-940e-bc30b004b0d0': { Mode: 'Режим работы', OnDuration: 'Продолжительность горения для режима Мерцает, мс',
    OffDuration: 'Продолжительность гашения для режима Мерцает, мс' },
};
function deviceParameters(d) {
  if (deviceParamCache.has(d)) return deviceParamCache.get(d);
  const uid = txt(d, 'DriverUID').toLowerCase();
  const catalog = DEVICE_DEFAULTS.drivers[uid];
  const byName = new Map();
  for (const p of catalog?.properties || []) {
    if (p.Name == null) continue;
    const list = byName.get(p.Name) || byName.set(p.Name, []).get(p.Name);
    list.push(p);
  }
  const rows = [], seen = new Set();
  for (const source of ['Properties', 'DeviceProperties']) for (const p of subs(d, source, 'GKProperty')) {
    const name = txt(p, 'Name'), raw = txt(p, 'Value'), str = child(p, 'StringValue')?.textContent;
    // Одинаковые копии в двух контейнерах показываем один раз; расхождения сохраняем.
    const key = JSON.stringify([name, raw, str ?? '']);
    if (source === 'DeviceProperties' && seen.has(key)) continue;
    seen.add(key);
    const matches = byName.get(name) || [];
    const stringProperty = matches.length && matches.every(x => x.DriverPropertyType === 1);
    const value = stringProperty ? str ?? '' : matches.length ? raw : str ?? raw;
    const defaults = matches.map(x => stringProperty ? x.StringDefault ?? '' : String(x.Default));
    const known = defaults.length > 0 && defaults.every(x => x === defaults[0]) &&
      (stringProperty || (raw !== '' && Number.isFinite(Number(raw)) && defaults[0] !== 'undefined'));
    // Пустые сообщения (норма/сработка) отличием не считаем.
    const emptyMessage = value === '' && /^Сообщение для (нормы|сработки [12])$/.test(name);
    const equal = known && (emptyMessage || (stringProperty ? value === defaults[0] : Number(value) === Number(defaults[0])));
    rows.push({ name: name || 'Без имени', label: PARAM_LABELS[uid]?.[name] || name || 'Без имени', value, valueText: paramText(uid, name, value), baselineText: known ? paramText(uid, name, defaults[0]) : '', baseline: known ? defaults[0] : null,
      status: known ? equal ? 'same' : 'diff' : 'unknown', source });
  }
  // Одно имя в обоих контейнерах с разными значениями — помечаем источник.
  const names = new Map();
  for (const r of rows) names.set(r.name, (names.get(r.name) || 0) + 1);
  for (const r of rows) if (names.get(r.name) > 1) r.label += r.source === 'Properties' ? ' (конфигурация)' : ' (устройство)';
  const result = { rows, changed: rows.filter(p => p.status === 'diff').length,
    unknown: rows.filter(p => p.status === 'unknown').length, catalog: !!catalog };
  deviceParamCache.set(d, result);
  return result;
}

const DeviceParameters = {
  props: { data: Object },
  template: `
<details v-if="data.rows.length" class="detail-block device-params" open>
  <summary><h3>Параметры</h3><span v-if="data.changed" class="param-badge">Отличий: {{ data.changed }}</span></summary>
    <table class="param-table">
      <thead v-if="data.changed"><tr><th>Параметр</th><th>Текущее</th><th>По умолчанию</th></tr></thead>
      <tbody><tr v-for="(p, i) in data.rows" :key="i" :class="{ 'param-diff': p.status === 'diff' }" :title="p.label !== p.name ? p.name + ' · ' + p.source : p.source">
        <td>{{ p.label }}</td>
        <td>{{ p.valueText }}</td>
        <td v-if="data.changed"><template v-if="p.status === 'diff'">{{ p.baselineText }}</template></td>
      </tr></tbody>
    </table>
    <p v-if="!data.catalog || data.unknown" class="m param-summary"><template v-if="!data.catalog">Для этого драйвера нет значений по умолчанию.</template><template v-else-if="data.unknown === data.rows.length">Нет эталона для сравнения параметров.</template><template v-if="data.unknown && data.catalog"> Не сравнено: {{ data.unknown }}.</template></p>
</details>`,
};
