// страница настроек
const SettingsView = {
  setup() {
    const theme = ref(document.documentElement.dataset.theme || 'system');
    const set = v => {
      theme.value = v;
      if (v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
      try { v === 'system' ? localStorage.removeItem('fscp.theme') : localStorage.setItem('fscp.theme', v); } catch {}
    };
    const icons = ref(!document.documentElement.classList.contains('no-tic'));
    const setIcons = () => {
      icons.value = !icons.value;
      document.documentElement.classList.toggle('no-tic', !icons.value);
      try { icons.value ? localStorage.removeItem('fscp.icons') : localStorage.setItem('fscp.icons', '0'); } catch {}
    };
    const exit = async () => {
      if (!await ask({ title: 'Удалить сохранённые данные?', text: 'Будет удалено:', items: ['открытый архив .fscp', 'загруженный журнал событий', 'сохранённые настройки: вкладка, тема, ширины панелей'], note: 'Файлы на диске не затрагиваются.', ok: 'Удалить', danger: true })) return;
      try { for (const k of Object.keys(localStorage)) if (k.startsWith('fscp')) localStorage.removeItem(k); } catch {}
      const reload = () => { location.href = location.pathname; };
      try { const r = indexedDB.deleteDatabase('fscp-viewer'); r.onsuccess = r.onerror = r.onblocked = reload; setTimeout(reload, 700); } catch { reload(); }
    };
    return { ver: APP_VERSION, theme, set, icons, setIcons, exit, opts: [['system', 'Система'], ['light', 'Светлая'], ['dark', 'Тёмная']] };
  },
  template: `<div class="set">
<Teleport to="#tbhead"><h2>Настройки</h2></Teleport>
<h3>Оформление</h3>
<div class="card">
  <div class="srow"><div><b>Тема</b><small>Светлая, тёмная или как в системе</small></div><div class="seg"><button v-for="[v, n] in opts" :key="v" :class="{ sel: theme === v }" @click="set(v)">{{ n }}</button></div></div>
  <div class="srow"><div><b>Иконки в деревьях</b><small>Показывать значки устройств, зон, сценариев и планов</small></div><button class="sw" role="switch" :aria-checked="icons" :class="{ on: icons }" @click="setIcons"></button></div>
</div>
<h3>О программе</h3>
<div class="card"><div class="srow"><div><b>Версия</b><small>Номер сборки</small></div><span>{{ ver }}</span></div></div>
<h3>Данные</h3>
<div class="card">
  <div class="srow"><div><b>Очистить сохранённое</b><small>Удалит открытый архив, журнал событий и настройки из браузера. Файлы на диске не затрагиваются</small></div><button class="danger" @click="exit">Удалить данные</button></div>
</div>
</div>`,
};
