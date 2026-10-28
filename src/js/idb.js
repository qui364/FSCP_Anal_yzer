// --- запоминание открытого файла между перезагрузками (IndexedDB) ---
let dbP = null;   // одно общее соединение; при deleteDatabase закрывается само
const idb = () => dbP ||= new Promise((res, rej) => {
  const r = indexedDB.open('fscp-viewer', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onsuccess = () => { r.result.onversionchange = () => { r.result.close(); dbP = null; }; res(r.result); };
  r.onerror = () => { dbP = null; rej(r.error); };
});
const idbDo = (mode, fn) => idb().then(db => new Promise((res, rej) => {
  const q = fn(db.transaction('kv', mode).objectStore('kv'));
  q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error);
}));
const saveFile = f => idbDo('readwrite', s => s.put({ name: f.name, blob: f, mtime: f.lastModified || 0 }, 'file')).catch(() => {});
const forgetFile = () => idbDo('readwrite', s => s.delete('file')).catch(() => {});
