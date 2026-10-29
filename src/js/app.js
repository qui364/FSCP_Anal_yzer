const TABS = [['dev', 'Устройства'], ['zone', 'Зоны'], ['delay', 'Сценарии'], ['logic', 'Логика'], ['plan', 'Планы']];

const NAV_IC = {
  open: 'M5 19l2.757 -7.351a1 1 0 0 1 .936 -.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1 -1.964 1.625h-14.026a2 2 0 0 1 -2 -2v-11a2 2 0 0 1 2 -2h4l3 3h7a2 2 0 0 1 2 2v2',
  dev: 'M5 5m0 1a1 1 0 0 1 1 -1h12a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-12a1 1 0 0 1 -1 -1z M9 9h6v6h-6z M3 10h2 M3 14h2 M10 3v2 M14 3v2 M21 10h-2 M21 14h-2 M14 21v-2 M10 21v-2',
  zone: 'M4 4h6v6h-6z M14 4h6v6h-6z M4 14h6v6h-6z M14 14h6v6h-6z',
  delay: 'M3.5 5.5l1.5 1.5l2.5 -2.5 M3.5 11.5l1.5 1.5l2.5 -2.5 M3.5 17.5l1.5 1.5l2.5 -2.5 M11 6h9 M11 12h9 M11 18h9',
  logic: 'M6 5m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M6 19m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M18 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0 -4 0 M6 7v2a3 3 0 0 0 3 3h7 M6 17v-2a3 3 0 0 1 3 -3',
  plan: 'M3 7l6 -3l6 3l6 -3v13l-6 3l-6 -3l-6 3v-13 M9 4v13 M15 7v13',
  raw: 'M7 8l-4 4l4 4 M17 8l4 4l-4 4 M14 4l-4 16',
  jr: 'M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-11a1 1 0 0 1 -1 -1v-14a1 1 0 0 1 1 -1 M9 4v16 M13 8h3 M13 12h3',
  log: 'M13 5h8 M13 9h5 M13 15h8 M13 19h5 M3 4m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z M3 14m0 1a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1z',
  set: 'M10.325 4.317c.426 -1.756 2.924 -1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543 -.94 3.31 .826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756 .426 1.756 2.924 0 3.35a1.724 1.724 0 0 0 -1.066 2.573c.94 1.543 -.826 3.31 -2.37 2.37a1.724 1.724 0 0 0 -2.572 1.065c-.426 1.756 -2.924 1.756 -3.35 0a1.724 1.724 0 0 0 -2.573 -1.066c-1.543 .94 -3.31 -.826 -2.37 -2.37a1.724 1.724 0 0 0 -1.065 -2.572c-1.756 -.426 -1.756 -2.924 0 -3.35a1.724 1.724 0 0 0 1.066 -2.573c-.94 -1.543 .826 -3.31 2.37 -2.37c1 .608 2.296 .07 2.572 -1.065z M9 12a3 3 0 1 0 6 0a3 3 0 0 0 -6 0'
};
const navIc = k => '<svg class="ni" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + NAV_IC[k] + '"/></svg>';

const App = {
  setup() {
    const active = computed(() => {
      if (building.value) return building.value;
      const t = view.value.type;
      return t === 'empty' ? '' : t === 'tree' ? view.value.kind : t === 'log' ? 'log' : t === 'loginfo' ? 'loginfo' : t === 'logic' ? 'logic' : t === 'settings' ? 'settings' : 'raw';
    });
    const tab = t => t === 'raw' ? openRaw() : t === 'settings' ? go({ type: 'settings' }) : t === 'log' ? openLog() : t === 'loginfo' ? openLogInfo() : t === 'logic' ? openLogic() : openTree(t);
    const counts = computed(() => { const m = model.value; return m ? { dev: m.dev.size - 1, zone: m.zones.length, delay: m.delays.length, plan: [...m.plan.values()].filter(p => !isPlanFolder(p)).length } : {}; });
    const welcome = computed(() => !loaded.value && !loading.value && !error.value && !logData.value && !['log', 'loginfo', 'settings'].includes(view.value.type));
    const onEsc = e => { if (e.key === 'Escape' && dlg.value) closeDlg(false); };
    onMounted(() => window.addEventListener('keydown', onEsc));
    onBeforeUnmount(() => window.removeEventListener('keydown', onEsc));
    const fpick = ref(null), lpick = ref(null);
    const logName = computed(() => { const f = logData.value?.files; return f ? f[0].name + (f.length > 1 ? ` (+${f.length - 1})` : '') : ''; });
    const logTip = computed(() => (logData.value?.files || []).map(f => f.name).join('\n'));
    const onFile = () => { const f = fpick.value.files[0]; fpick.value.value = ''; if (f) load(f); };
    const onLog = async () => {
      const fs = [...lpick.value.files]; lpick.value.value = '';
      if (!fs.length) return;
      clearLog(); await readLogs(fs);
      if (view.value.type === 'log') openLog(); else if (view.value.type === 'loginfo') openLogInfo();
    };
    const closeFile = async () => {
      if (await ask({ title: 'Закрыть файл?', text: archive.value.name, note: 'Файл пропадёт из просмотрщика и из памяти браузера. Сам файл на диске не изменится — чтобы открыть его снова, перетащите его в окно.', ok: 'Закрыть файл', cancel: 'Отмена', danger: true })) closeArchive();
    };
    const closeLog = async () => {
      if (!(await ask({ title: 'Закрыть журнал?', text: 'События этого журнала исчезнут из просмотрщика:', items: (logData.value?.files || []).map(f => f.n ? `${f.name} — ${f.n.toLocaleString('ru')} событий` : f.name), note: 'Файлы на диске не изменятся — чтобы вернуть журнал, откройте CSV снова.', ok: 'Закрыть журнал', cancel: 'Отмена', danger: true }))) return;
      clearLog();
      if (view.value.type === 'log' || view.value.type === 'loginfo') loaded.value ? openTree('dev') : go({ type: 'empty' });
    };
    // полноэкранный загрузчик: чтение архива, разбор XML, построение дерева, чтение журнала
    const loaderText = computed(() => loading.value || (building.value ? 'Строю дерево…' : '') || logBusy.value);
    const sideClick = e => { if (isMobile.value && e.target.closest('button')) navOpen.value = false; };
    return { APP_VERSION, loaderText, acc, sideClick, isMobile, navIc, counts, logBusy, dlg, closeDlg, sideW, detW, active, tab, TABS, view, loading, error, loaded, welcome, building, navOpen, toggleNav, detOpen, toggleDet, archive, logData, logName, logTip, fpick, lpick, onFile, onLog, closeFile, closeLog };
  },
  template: `
<div id="topbar" v-if="!welcome">
  <button class="iconbtn" :class="{ sel: navOpen }" title="Навигация" @click="toggleNav"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4h14M2 9h14M2 14h14"/></svg></button>
  <span id="apptitle">FSCP Analyzer <small class="ver">v{{ APP_VERSION }}</small></span>
  <span id="tbhead"></span>
  <span class="tbsp"></span>
  <button v-if="view.type === 'tree'" class="iconbtn tbright" :class="{ sel: detOpen }" title="Панель деталей" @click="toggleDet"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M2 4h14M2 9h14M2 14h14"/></svg></button>
  <input ref="fpick" type="file" :accept="acc('.fscp,.zip')" hidden @change="onFile">
  <input ref="lpick" type="file" :accept="acc('.csv')" multiple hidden @change="onLog">
</div>
<div id="shell" :style="{ '--sw': sideW + 'px', '--dw0': detW + 'px', '--dw': (view.type !== 'tree' || !detOpen ? 0 : detW) + 'px' }">
<welcome-view v-if="welcome" />
<div id="side" v-else :class="{ closed: !navOpen }" :inert="!navOpen" @click="sideClick">
  <div id="trees">
    <button class="buildbtn nm" :disabled="!!building" :title="loaded ? archive.name : ''" @click="fpick.click()"><span class="nmt"><span v-html="navIc('open')"></span>{{ loaded ? archive.name : 'Открыть файл…' }}</span><span v-if="loaded" class="nx" role="button" title="Закрыть файл" @click.stop="closeFile"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg></span></button>
    <button v-for="[t, name] in TABS" :key="t" class="buildbtn child tint" :disabled="!loaded || !!building" :class="['c-' + t, { sel: active === t, sub: t === 'logic' }]" @click="tab(t)"><span class="nmt"><span v-html="navIc(t)"></span>{{ name }}</span><span v-if="counts[t] != null" class="cnt">{{ counts[t].toLocaleString('ru') }}</span></button>
    <button class="buildbtn child" :disabled="!loaded || !!building" :class="{ sel: active === 'raw' }" @click="tab('raw')"><span class="nmt"><span v-html="navIc('raw')"></span>Сырые данные</span></button>
    <div class="gap"></div>
    <button class="buildbtn nm" :disabled="!!building" :class="{ sel: active === 'loginfo' }" :title="logData ? logTip : ''" @click="logData ? tab('loginfo') : lpick.click()"><span class="nmt"><span v-html="navIc('jr')"></span>{{ logData ? logName : 'Открыть журнал…' }}</span><span v-if="logData" class="nx" role="button" title="Закрыть журнал" @click.stop="closeLog"><svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M1.5 1.5l7 7M8.5 1.5l-7 7"/></svg></span></button>
    <button v-if="logData" class="buildbtn child" :disabled="!!building" :class="{ sel: active === 'log' }" @click="tab('log')"><span class="nmt"><span v-html="navIc('log')"></span>События</span></button>
  </div>
  <div id="sidebot">
    <button class="buildbtn" :class="{ sel: active === 'settings' }" @click="tab('settings')"><span class="nmt"><span v-html="navIc('set')"></span>Настройки</span></button>  </div>
</div>
<div id="loader" v-if="loaderText" role="status" aria-live="polite"><div class="ld"><i class="spin"></i><p>{{ loaderText }}</p></div></div>
<div id="scrim" v-if="isMobile && navOpen && !welcome" @click="toggleNav"></div>
<div v-if="dlg" class="modal" @click.self="closeDlg(false)">
  <div class="dlg" role="dialog" aria-modal="true">
    <h3>{{ dlg.title }}</h3>
    <p v-if="dlg.text">{{ dlg.text }}</p>
    <ul v-if="dlg.items" class="del"><li v-for="it in dlg.items" :key="it">{{ it }}</li></ul>
    <p v-if="dlg.note" class="note">{{ dlg.note }}</p>
    <div class="acts"><button v-if="dlg.cancel" @click="closeDlg(false)">{{ dlg.cancel }}</button><button :class="{ danger: dlg.danger }" @click="closeDlg(true)">{{ dlg.ok }}</button></div>
  </div>
</div>
<div id="main" v-if="!welcome">
  <p v-if="error" class="warn">{{ error }}</p>
  <p v-if="loading" class="m">{{ loading }}</p>
  <log-info-view v-else-if="view.type === 'loginfo'" />
  <raw-view v-else-if="view.type === 'raw'" />
  <settings-view v-else-if="view.type === 'settings'" />
  <file-view v-else-if="view.type === 'file'" :key="view.id" :name="view.name" />
  <xml-view v-else-if="view.type === 'xml'" :key="view.id" :name="view.name" :uid="view.uid" />
  <source-view v-else-if="view.type === 'source'" :key="view.id" :name="view.name" :line="view.line" />
  <tree-view v-else-if="view.type === 'tree'" :key="view.id" :kind="view.kind" :sel="view.sel" />
  <logic-view v-else-if="view.type === 'logic'" :key="view.id" />
  <log-view v-else-if="view.type === 'log'" :key="view.id" :uids="view.uids" :title="view.title" />
</div>
</div>`,
};

createApp(App)
  .directive('hscroll', hscroll)
  .component('DeviceParameters', DeviceParameters)
  .component('LogicNode', LogicNode).component('TreeNode', TreeNode).component('DetailTable', DetailTable).component('FileHead', FileHead)
  .component('LogInfoView', LogInfoView).component('RawView', RawView).component('FileView', FileView)
  .component('SourceView', SourceView).component('XmlView', XmlView).component('TreeView', TreeView).component('LogView', LogView).component('SettingsView', SettingsView).component('LogicView', LogicView).component('WelcomeView', WelcomeView).component('PlanCanvas', PlanCanvas)
  .mount('#app');

// Отладка: ?sample=<url> грузит архив по адресу
const sample = new URLSearchParams(location.search).get('sample'), sampleLog = new URLSearchParams(location.search).get('log');
if (sampleLog) fetch(sampleLog).then(r => r.blob()).then(b => readLogs([new File([b], decodeURIComponent(sampleLog.split('/').pop()))]));
if (sample) fetch(sample).then(r => r.blob()).then(b => load(Object.assign(b, { name: decodeURIComponent(sample.split('/').pop()) }), false));
else idbDo('readonly', s => s.get('log')).then(recs => recs && readLogs(recs.map(r => new File([r.blob], r.name)))).catch(() => {}).then(() => idbDo('readonly', s => s.get('file'))).then(async rec => {
  let tab = ''; try { tab = localStorage.fscpTab || ''; } catch {}
  if (!rec) { if (tab === 'settings') go({ type: 'settings' }); else if (tab === 'log' && logData.value) openLog(); else if (tab === 'loginfo' && logData.value) openLogInfo(); return; }
  await load(new File([rec.blob], rec.name, { lastModified: rec.mtime || 0 }), false);
  if (!loaded.value) { forgetFile(); return; }
  if (tab === 'raw') openRaw(); else if (tab === 'log') openLog(); else if (tab === 'loginfo') openLogInfo(); else if (tab === 'logic') openLogic(); else if (['dev', 'zone', 'delay', 'plan'].includes(tab)) openTree(tab); else if (tab === 'settings') go({ type: 'settings' });
}).catch(() => {});

// Mini App Telegram: официальный скрипт грузим только внутри Telegram (по хэшу запуска), в обычном браузере внешних зависимостей нет
if (/tgWebApp/.test(location.hash)) {
  const sc = document.createElement('script');
  sc.src = 'https://telegram.org/js/telegram-web-app.js';
  sc.onload = () => {
    const w = window.Telegram && Telegram.WebApp;
    if (!w) return;
    try { w.ready(); w.expand(); if (w.isVersionAtLeast('8.0')) w.requestFullscreen(); } catch { /* старый клиент — остаётся обычное окно */ }
  };
  document.head.appendChild(sc);
}
