let helpSaved = null;
const HelpView = {
  setup() {
    const sv = helpSaved;
    const open = reactive(new Set(sv ? sv.open : ['use']));
    const chOpen = reactive(new Set(sv ? sv.chOpen : [CHANGELOG[0].v]));
    const vopen = ref(sv ? !!sv.vopen : false);
    const chToggle = v => { chOpen.has(v) ? chOpen.delete(v) : chOpen.add(v); };
    const toggle = k => { open.has(k) ? open.delete(k) : open.add(k); };
    onMounted(() => { if (sv) nextTick(() => { const mn = document.getElementById('main'); if (mn) mn.scrollTop = sv.top; }); });
    onBeforeUnmount(() => { helpSaved = { vopen: vopen.value, open: [...open], chOpen: [...chOpen], top: (document.getElementById('main') || {}).scrollTop || 0 }; });
    const secs = [
      ['use', 'Как пользоваться', [
        'Перетащите файл конфигурации <span class="fx">*.fscp</span> в рамку на экране приветствия или нажмите «Открыть» — архив читается в браузере, на сервер ничего не уходит.',
        'Вкладки слева: Устройства, Зоны, Сценарии, Логика, Планы и «Сырые данные» (файлы архива как есть).',
        'Журнал событий (<span class="fx">*.csv</span>) открывается кнопкой «Открыть журнал…»: вкладка «События» показывает записи, «Ложные пуски» — проверку журнала по конфигурации (нужны оба файла).',
        'Щелчок по элементу дерева открывает подробности справа; ссылки в подробностях ведут к связанным объектам.',
        'Открытый архив и журнал сохраняются в браузере и восстанавливаются при следующем запуске. Очистить их можно в «Настройках» → «Удалить данные».',
      ]],
      ['keys', 'Горячие клавиши и жесты', [
        'Esc — закрыть диалог.',
        'Перетаскивание разделителя — изменить ширину левой или правой панели; двойной клик по разделителю — вернуть 350 px; кнопки в верхней панели сворачивают панели.',
        'На телефоне: панели открываются кнопками в верхней панели, двойной тап по элементу — как двойной клик; свайп вправо/влево — открыть или закрыть левую/правую панель.',
        'Состояние страниц (раскрытые блоки, фильтры, «Ещё N», выбор, прокрутка) сохраняется при переходе на другую вкладку и возврате.',
      ]],
      ['fmt', 'О формате и справочниках', [
        '<span class="fx">*.fscp</span> — zip-архив с XML-описанием конфигурации ГК: устройства, зоны, сценарии, логика, планы; связи между объектами заданы GUID.',
        'Журнал — <span class="fx">*.csv</span> с событиями; коды событий расшифровываются по встроенному справочнику, адреса устройств сопоставляются с конфигурацией.',
        'Справочники встроены в просмотрщик: драйверы, значения по умолчанию, перечисления параметров, события, значки.',
        'Ложный пуск — эпизод, в котором по журналу удалось восстановить цепочку причин и включений сценариев.',
      ]],
      ['tech', 'Используемые технологии', [
        'Vue 3 (глобальная сборка, шаблоны строками в JS) — интерфейс.',
        'JSZip — чтение архива <span class="fx">*.fscp</span> (это zip).',
        'DOMParser — разбор больших XML конфигурации.',
        'IndexedDB — хранение открытого архива, журнала и правок планов; localStorage — вкладка и настройки интерфейса.',
        'Обычные скрипты без ES-модулей, HTML и CSS без фреймворков и сборки: работает и через file://, на сервер ничего не уходит.',
        'GitHub Actions и GitHub Pages — публикация папки src/.',
      ]],
      ['store', 'Где что хранится', [
        'Всё хранится только в вашем браузере, на этом устройстве; на сервер ничего не отправляется.',
        'IndexedDB (база FSCPAnalyzer): открытый архив <span class="fx">*.fscp</span>, загруженный журнал событий и правки планов. Архив и правки привязаны к имени, размеру и дате изменения файла.',
        'localStorage: последняя открытая вкладка и настройки интерфейса — тема, значки в деревьях, свёрнутость панелей, ширины панелей, параметры планов.',
        'Состояние страниц (раскрытые блоки, фильтры, прокрутка) живёт только пока открыта страница и после перезагрузки не сохраняется.',
        'Исходные файлы на диске не меняются. Удалить всё сохранённое можно в «Настройках» → «Удалить данные».',
      ]],
    ];
    const SITE = 'https://qui364.github.io/FSCP_Anal_yzer/', eu = encodeURIComponent(SITE);
    const copied = ref(false);
    const copyUrl = async () => {
      try { await navigator.clipboard.writeText(SITE); }
      catch { const t = document.createElement('textarea'); t.value = SITE; document.body.appendChild(t); t.select(); try { document.execCommand('copy'); } catch {} t.remove(); }
      copied.value = true; setTimeout(() => { copied.value = false; }, 1500);
    };
    const checks = [
      { n: 'Webbkoll', i: 'M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0', s: 'Приватность: cookie, трекеры, сторонние запросы, HTTPS и заголовки безопасности.', ok: true, st: 'пройдена · 30.10.2026', d: 'HTTPS по умолчанию и HSTS; 0 cookie, 0 сторонних запросов, трекеров нет.', u: 'https://webbkoll.5july.net/en/check?url=' + eu },
      { n: 'VirusTotal', i: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z', s: 'Проверка адреса десятками антивирусных движков и сервисов репутации.', ok: null, st: 'запустить проверку', d: 'Открывается вкладка URL: вставьте адрес https://qui364.github.io/FSCP_Anal_yzer/ и нажмите Enter.', u: 'https://www.virustotal.com/gui/home/url' },
      { n: 'Blacklight', i: 'M12 12m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M12 2v4 M12 18v4 M2 12h4 M18 12h4', s: 'Поиск трекеров, записи действий пользователя и отпечатков браузера.', ok: null, st: 'запустить проверку', d: 'Поиск трекеров, записи действий и отпечатков браузера.', u: 'https://themarkup.org/blacklight?url=' + eu },
      { n: 'Google Safe Browsing', i: 'M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z M9 12l2 2 4-4', s: 'Проверка адреса по базе опасных и мошеннических сайтов Google.', ok: null, st: 'запустить проверку', d: 'Откроется отчёт Google Safe Browsing по адресу сайта.', u: 'https://transparencyreport.google.com/safe-browsing/search?url=' + eu },
      { n: 'URLScan.io', i: 'M11 11m-6 0a6 6 0 1 0 12 0a6 6 0 1 0-12 0 M20 20l-4.5-4.5', s: 'Открывает страницу в браузере и показывает запросы, скриншот и вердикт.', ok: null, st: 'запустить проверку', d: 'Откроется URLScan.io: вставьте адрес https://qui364.github.io/FSCP_Anal_yzer/ и запустите публичное сканирование.', u: 'https://urlscan.io/' },
      { n: 'Mozilla Observatory', i: 'M4 6h16 M4 12h16 M4 18h10', s: 'Оценка заголовков безопасности: CSP, HSTS, cookie.', ok: null, st: 'запустить проверку', d: 'Откроется Mozilla Observatory: вставьте адрес сайта и запустите проверку (для github.io корень домена даёт 404 — проверяется только заголовок, не страница).', u: 'https://developer.mozilla.org/en-US/observatory' },
    ];
    return { vopen, SITE, copied, copyUrl, checks, ver: APP_VERSION, log: CHANGELOG, chOpen, chToggle, secs, open, toggle };
  },
  template: `<div class="set help">
<Teleport to="#tbhead"><h2>Справка</h2></Teleport>
<div class="card helpintro"><p><b>FSCP <span class="anal">Anal</span>yzer</b> — просмотрщик конфигурации ГК в формате <span class="fx">*.fscp</span> и журналов событий <span class="fx">*.csv</span>. Он позволяет разобраться в чужой или старой установке без родной программы конфигурирования: посмотреть устройства, зоны, сценарии, логику и планы, найти связи между объектами, сопоставить события журнала с конфигурацией и найти причины ложных пусков.</p><p>Всё работает в браузере: файлы никуда не отправляются, конфигурацию просматривать можно, изменить или записать в ГК — нельзя.</p></div>
<div class="card chlog"><div v-for="[k, name, items] in secs" :key="k" class="chrow" :class="{ open: open.has(k) }"><div class="chh" role="button" tabindex="0" :aria-expanded="open.has(k)" @click="toggle(k)" @keydown.enter.space.prevent="toggle(k)"><b>{{ name }}</b></div><div class="chbody"><div><ul><li v-for="t in items" :key="t" v-html="t"></li></ul></div></div></div></div>
<h3>Проверки сайта</h3>
<div class="card vbadges" :class="{ fold: !vopen }"><button type="button" class="vtg" :aria-expanded="vopen" :title="vopen ? 'Свернуть' : 'Развернуть'" @click="vopen = !vopen"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path :d="vopen ? 'M3.5 10l4.5-4.5 4.5 4.5' : 'M3.5 6l4.5 4.5L12.5 6'"/></svg></button><p v-show="vopen" class="vdesc">Сайт открыт публично на GitHub Pages и работает целиком в браузере: файлы не загружаются на сервер. Здесь — результаты независимых проверок адреса сайта на вредоносность, трекинг и приватность; по плашке можно запустить проверку самостоятельно.</p><div v-show="vopen" class="vurl"><span class="fx">{{ SITE }}</span><button type="button" class="ib" @click="copyUrl" :title="copied ? 'Скопировано' : 'Копировать в буфер'" aria-label="Копировать"><svg v-if="!copied" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"><rect x="5.5" y="5.5" width="8" height="8" rx="1.5"/><path d="M10.5 3.5v-.5a1.5 1.5 0 0 0-1.5-1.5H4A1.5 1.5 0 0 0 2.5 3v5A1.5 1.5 0 0 0 4 9.5h.5"/></svg><svg v-else width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8.5l3.2 3.2L13 4.8"/></svg></button></div><a v-for="c in checks" :key="c.n" class="vb" :class="c.ok === true ? 'ok' : 'na'" :href="c.u" target="_blank" rel="noopener noreferrer" :title="c.d"><span class="vbi"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path :d="c.i"/></svg></span><span class="vbt"><b>{{ c.n }}</b><small>{{ c.s }}</small></span><span class="vbs">{{ c.st }}</span></a></div>
<h3>О программе</h3>
<div class="card"><div class="srow"><div><b>Версия</b><small>Номер сборки</small></div><span>{{ ver }}</span></div></div>
<h3>История изменений</h3>
<div class="card chlog"><div v-for="r in log" :key="r.v" class="chrow" :class="{ open: chOpen.has(r.v) }"><div class="chh" role="button" tabindex="0" :aria-expanded="chOpen.has(r.v)" @click="chToggle(r.v)" @keydown.enter.space.prevent="chToggle(r.v)"><b>{{ r.v }}</b><small>{{ r.d }}</small></div><div class="chbody"><div><ul><li v-for="t in r.items" :key="t">{{ t }}</li></ul></div></div></div></div>
</div>`,
};
