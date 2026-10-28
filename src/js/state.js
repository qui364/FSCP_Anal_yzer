// --- состояние. Всё тяжёлое (zip, DOM, тексты) лежит вне реактивности: в S или shallowRef ---
// S.zip — открытый архив; xmlTexts/lineCache/guidIdx — кэши по имени файла; modelP — идущий разбор модели
const S = { zip: null, xmlTexts: {}, lineCache: {}, guidIdx: {}, modelP: null, treeStates: new Map() };
const entries = shallowRef([]);
const archive = ref({ name: 'архив', size: 0 });
const model = shallowRef(null);
const building = ref(''), loading = ref(''),error = ref(''), loaded = ref(false), rawQ = ref('');
const view = shallowRef({ type: 'empty' });

// --- журнал событий (CSV из ГК): {files: [{name, blob, n}], rows (новые сверху), byObj: Map<ObjectUID, строки>, codes: Map<код, число>} ---
const logData = shallowRef(null);
const logBusy = ref(''), logErr = ref('');
// Модальное окно: ask({ title, text, items, note, ok, cancel, danger }) -> Promise<boolean>; рендерится один раз в App
const dlg = shallowRef(null);
const ask = o => new Promise(res => {
  dlg.value = { ok: 'ОК', cancel: 'Отмена', ...o, res };
  setTimeout(() => document.querySelector('.dlg .acts button:last-child')?.focus(), 0);
});
const closeDlg = v => { const d = dlg.value; dlg.value = null; d && d.res(v); };

// Левая навигация (бургер в верхней панели); состояние помнится
const navOpen = ref((() => { try { return localStorage['fscp.nav'] !== '0'; } catch { return true; } })());
const detOpen = ref((() => { try { return localStorage['fscp.det'] !== '0'; } catch { return true; } })());
const toggleDet = () => { detOpen.value = !detOpen.value; try { localStorage['fscp.det'] = detOpen.value ? '1' : '0'; } catch {} };
const toggleNav =() => { navOpen.value = !navOpen.value; try { localStorage['fscp.nav'] = navOpen.value ? '1' : '0'; } catch {} };

// --- навигация: каждый переход создаёт новый view с id, по которому компонент пересоздаётся ---
let navId = 0;
const go = v => {
  view.value = { ...v, id: ++navId };
  if (v.type === 'raw' || v.type === 'tree' || v.type === 'log' || v.type === 'loginfo' || v.type === 'logic' || v.type === 'bmp' || v.type === 'settings') try { localStorage.fscpTab = v.type === 'tree' ? v.kind : v.type; } catch {}
};
const openLog = (uids, title) => go({ type: 'log', uids, title });
const openLogInfo = () => go({ type: 'loginfo' });
const openRaw = () => go({ type: 'raw' });
const openFile = name => go({ type: isXml(name) ? 'xml' : 'file', name });
const openSource = (name, line = 1) => go({ type: 'source', name, line });
