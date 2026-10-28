// модель строится при первом открытии любой вкладки; building — какая вкладка ждёт
async function withModel(tag, v) {
  if (!model.value) {
    building.value = tag;
    try { if (!(await buildModel(true))) return; } finally { building.value = ''; }
  }
  go(v);
}
function openTree(kind, sel) { return withModel(kind, { type: 'tree', kind, sel }); }
function openLogic() { return withModel('logic', { type: 'logic' }); }

// сигнатура архива для привязки сохранённых правок планов (имя, размер, дата изменения)
const planSig = (name, size, mtime) => name + '|' + size + '|' + (mtime || 0);

let loadSeq = 0;
async function load(f, persist = true) {
  const my = ++loadSeq;
  error.value = '';
  loading.value = 'Читаю архив…';
  let z;
  try { z = await JSZip.loadAsync(f); }
  catch (e) { if (my === loadSeq) { error.value = 'Не удалось открыть архив: ' + e.message; loading.value = ''; } return; }
  if (my !== loadSeq) return;   // за время чтения открыли другой архив
  clearPlanCache();
  S.treeStates.clear();
  S.zip = z;
  S.xmlTexts = {}; S.lineCache = {}; S.guidIdx = {}; S.modelP = null;
  model.value = null;
  try {   // сохранённые правки планов (редактор на холсте плана) подменяют PlansConfiguration.xml того же архива
    const r = await idbDo('readonly', s => s.get('plans'));
    if (my !== loadSeq) return;
    if (r && r.sig === planSig(f.name, f.size, f.lastModified)) S.xmlTexts['PlansConfiguration.xml'] = r.text;
  } catch {}
  entries.value = Object.values(S.zip.files).filter(e => !e.dir)
    .map(e => ({ name: e.name, size: e._data?.uncompressedSize ?? 0, z: e }))
    .sort((a, b) => a.name.localeCompare(b.name));
  archive.value = { name: f.name || 'архив', size: f.size, mtime: f.lastModified || 0 };
  loaded.value = true;
  loading.value = '';
  openTree('dev');
  if (persist) saveFile(f);
}

// Закрыть архив: сбросить кэши и забыть файл; журнал остаётся
function closeArchive() {
  loadSeq++;
  clearPlanCache();
  S.treeStates.clear();
  S.zip = null; S.xmlTexts = {}; S.lineCache = {}; S.guidIdx = {}; S.modelP = null;
  model.value = null; entries.value = []; loaded.value = false; loading.value = ''; error.value = '';
  forgetFile();
  idbDo('readwrite', s => s.delete('plans')).catch(() => {});
  logData.value ? openLogInfo() : go({ type: 'empty' });
}

async function getText(name) {
  if (S.xmlTexts[name] != null) return S.xmlTexts[name];
  const f = S.zip.file(name);
  if (!f) throw new Error('в архиве нет файла ' + name);
  return S.xmlTexts[name] = await f.async('string');
}
