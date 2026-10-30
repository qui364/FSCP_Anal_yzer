const S = { zip: null, xmlTexts: {}, lineCache: {}, guidIdx: {}, modelP: null, treeStates: new Map() };
const entries = shallowRef([]);
const archive = ref({ name: 'архив', size: 0 });
const model = shallowRef(null);
const building = ref(''), loading = ref(''),error = ref(''), loaded = ref(false), rawQ = ref('');
const view = shallowRef({ type: 'empty' });

const logData = shallowRef(null);
const logBusy = ref(''), logErr = ref('');
const stage = ref('');
const booting = ref(new URLSearchParams(location.search).get('sample') ? '' : 'Восстанавливаю сохранённое…');
const dlg = shallowRef(null);
const ask = o => new Promise(res => {
  dlg.value = { ok: 'ОК', cancel: 'Отмена', ...o, res };
  setTimeout(() => document.querySelector('.dlg .acts button:last-child')?.focus(), 0);
});
const closeDlg = v => { const d = dlg.value; dlg.value = null; d && d.res(v); };

const NO_ACCEPT = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const acc = list => NO_ACCEPT ? null : list;

const mobileMq = matchMedia('(max-width: 800px)');
const isMobile = ref(mobileMq.matches);
const navOpen = ref(!isMobile.value && (() => { try { return localStorage['fscp.nav'] !== '0'; } catch { return true; } })());
const detOpen = ref(!isMobile.value && (() => { try { return localStorage['fscp.det'] !== '0'; } catch { return true; } })());
mobileMq.addEventListener('change', e => { isMobile.value = e.matches; if (e.matches) { navOpen.value = false; detOpen.value = false; } });
const toggleDet = () => { detOpen.value = !detOpen.value; if (!isMobile.value) try { localStorage['fscp.det'] = detOpen.value ? '1' : '0'; } catch {} };
const toggleNav = () => { navOpen.value = !navOpen.value; if (!isMobile.value) try { localStorage['fscp.nav'] = navOpen.value ? '1' : '0'; } catch {} };

let navId = 0;
const go = v => {
  view.value = { ...v, id: ++navId };
  if (v.type === 'raw' || v.type === 'tree' || v.type === 'log' || v.type === 'loginfo' || v.type === 'logic' || v.type === 'check' || v.type === 'settings' || v.type === 'help') try { localStorage.fscpTab = v.type === 'tree' ? v.kind : v.type; } catch {}
};
const openLog = (uids, title) => go({ type: 'log', uids, title });
const openLogInfo = () => go({ type: 'loginfo' });
const openRaw = () => go({ type: 'raw' });
const openFile = name => go({ type: isXml(name) ? 'xml' : 'file', name });
const openSource = (name, line = 1) => go({ type: 'source', name, line });
