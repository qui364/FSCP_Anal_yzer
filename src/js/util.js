const { createApp, watch, ref, shallowRef, reactive, computed, provide, inject, nextTick, onMounted, onBeforeUnmount } = Vue;

const fmt = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : n > 1024 ? (n / 1024).toFixed(1) + ' КБ' : n + ' Б';
const clip = (s, n = 200) => s.length > n ? s.slice(0, n) + '…' : s;
const isXml = name => /\.xml$/i.test(name);
const idle = f => window.requestIdleCallback ? requestIdleCallback(f, { timeout: 1000 }) : setTimeout(f, 30);
