const { createApp, watch, ref, shallowRef, reactive, computed, provide, inject, nextTick, onMounted, onBeforeUnmount } = Vue;

const fmt = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : n > 1024 ? (n / 1024).toFixed(1) + ' КБ' : n + ' Б';
const clip = (s, n = 200) => s.length > n ? s.slice(0, n) + '…' : s;
const isXml = name => /\.xml$/i.test(name);
const idle = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1000 }) : setTimeout(f, 30);
const dataLoaded = {};
const loadData = (...names) => Promise.all(names.map(n => dataLoaded[n] ||= new Promise((ok, no) => {
  const s = document.createElement('script');
  s.src = 'data/' + n + '.js?v=' + APP_VERSION; s.onload = ok; s.onerror = () => { delete dataLoaded[n]; no(new Error('Не загружен справочник ' + n)); };
  document.head.appendChild(s);
})));
