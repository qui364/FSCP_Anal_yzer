const bmpCache = new Map();
const planIconImgs = new Map();
let planIconOnLoad = () => {};
const planIcon = f => {
  let im = planIconImgs.get(f);
  if (!im) { im = new Image(); im.onload = () => planIconOnLoad(); im.src = 'icons/plan/' + f; planIconImgs.set(f, im); }
  return im.complete && im.naturalWidth ? im : null;
};
const planTint = new Map();
const planIconHot = f => {
  const im = planIcon(f); if (!im) return null;
  let t = planTint.get(f);
  if (!t) { t = document.createElement('canvas'); t.width = im.naturalWidth; t.height = im.naturalHeight; const x = t.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(255,20,20,.9)'; x.fillRect(0, 0, t.width, t.height); planTint.set(f, t); }
  return t;
};
const darkMq = matchMedia('(prefers-color-scheme: dark)');
let gridKey = '', gridCols = null;
const gridColors = () => {
  const k = (document.documentElement.dataset.theme || '') + '|' + darkMq.matches;
  if (k !== gridKey) {
    const cs = getComputedStyle(document.documentElement);
    gridCols = { line: cs.getPropertyValue('--line').trim() || '#ccc', mut: cs.getPropertyValue('--mut').trim() || '#888' };
    gridKey = k;
  }
  return gridCols;
};
const chan = (e, tag) => { const c = child(e, tag); return c && [txt(c, 'R'), txt(c, 'G'), txt(c, 'B'), (+txt(c, 'A') || 0) / 255]; };
const color = (e, tag) => { const c = chan(e, tag); return c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888'; };
const colorA = (e, tag) => { const c = chan(e, tag); return c ? `rgba(${c[0]},${c[1]},${c[2]},${c[3]})` : 'transparent'; };
const ptsOf = e => subs(e, 'Points', 'Point').map(q => [+txt(q, 'X'), +txt(q, 'Y')]);
const rectOf = e => ({ x: +txt(e, 'Left'), y: +txt(e, 'Top'), w: +txt(e, 'Width'), h: +txt(e, 'Height') });
const layerOf = e => ({ z: +txt(e, 'ZLayer') || 0, zi: +txt(e, 'ZIndex') || 0 });
const planOrder = (a, b) => (a.t === 'p') - (b.t === 'p') || (a.t === 'x' && !a.hasBg) - (b.t === 'x' && !b.hasBg) || a.z - b.z || a.zi - b.zi;
const scaleObjs = (list, k) => { for (const o of list) { if (o.pts) o.pts.forEach(q => { q[0] *= k; q[1] *= k; }); else { o.x *= k; o.y *= k; if (o.w) o.w *= k; if (o.h) o.h *= k; if (o.fs) o.fs *= k; } } };
let planView = null;
let planCacheGen = 0;
function clearPlanCache() {
  planCacheGen++;
  for (const bmp of bmpCache.values()) bmp.close();
  bmpCache.clear();
  planView = null;
}
const PlanCanvas = {
  props: { plan: String, sel: String },
  emits: ['pick'],
  setup(props, { emit }) {
    const flag = k => ref((() => { try { return localStorage[k] === '1'; } catch { return false; } })());
    const editOn = flag('fscp.planEdit'), simOn = flag('fscp.planSim');
    const fitOn = ref(false), addOpen = ref(false), cv = ref(null), note = ref(''), zoomPct = ref(0), tip = ref(null);
    const manual = new Set(); let lit = new Set();
    let zl = new Map();
    const relit = () => { ({ lit, zl } = simRun(manual)); };
    let objs = [], iconHalf = 11, hover = null, selObjs = [], picked = '', grid = null;
    let segs = [];
    const centerOn = ref((() => { try { return localStorage['fscp.planCenter'] === '1'; } catch { return false; } })());
    let img = null, iw = 0, ih = 0, scale = planView?.scale ?? 1, ox = planView?.ox ?? 0, oy = planView?.oy ?? 0, fit = 1, raf = 0, ro = null, gen = 0, drag = null;
    const css = () => cv.value.getBoundingClientRect();
    const draw = () => {
      raf = 0;
      const c = cv.value; if (!c) return;
      const dpr = window.devicePixelRatio || 1, r = css(), w = Math.round(r.width * dpr), h = Math.round(r.height * dpr);
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, w, h);
      if (!img) return;
      g.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
      g.imageSmoothingQuality = 'high';
      {
        const { line, mut } = gridColors();
        let st = 50; while (st * scale < 28) st *= 2; while (st * scale > 70 && st > 1) st /= 2;
        const x0 = -ox / scale, y0 = -oy / scale, x1 = x0 + w / dpr / scale, y1 = y0 + h / dpr / scale, lw = 1 / (scale * dpr);
        g.save(); g.lineWidth = lw; g.beginPath();
        for (let i = Math.floor(x0 / st); i * st <= x1; i++) { if (i % 5) { g.moveTo(i * st, y0); g.lineTo(i * st, y1); } }
        for (let j = Math.floor(y0 / st); j * st <= y1; j++) { if (j % 5) { g.moveTo(x0, j * st); g.lineTo(x1, j * st); } }
        g.strokeStyle = line; g.globalAlpha = 0.45; g.stroke(); g.beginPath();
        for (let i = Math.floor(x0 / st); i * st <= x1; i++) { if (!(i % 5)) { g.moveTo(i * st, y0); g.lineTo(i * st, y1); } }
        for (let j = Math.floor(y0 / st); j * st <= y1; j++) { if (!(j % 5)) { g.moveTo(x0, j * st); g.lineTo(x1, j * st); } }
        g.globalAlpha = 1; g.stroke(); g.restore();
        g.save(); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.font = '10px system-ui, sans-serif'; g.fillStyle = mut; g.textBaseline = 'top'; g.textAlign = 'left';
        for (let i = Math.floor(x0 / st); i * st <= x1; i++) if (!(i % 5)) g.fillText(String(Math.round(i * st)), i * st * scale + ox + 3, 2);
        g.textBaseline = 'bottom';
        for (let j = Math.floor(y0 / st); j * st <= y1; j++) if (!(j % 5) && j) g.fillText(String(Math.round(j * st)), 3, j * st * scale + oy - 2);
        g.restore();
      }
      for (const s of segs) g.drawImage(s.bmp, s.ox, s.oy, s.w ?? s.bmp.width, s.h);
      g.globalAlpha = 1;
      for (const o of objs) {
        const hv = o === hover, zh = !hv && o.kind === 'zone' && hover?.zs?.includes(o.uid);
        if (o.t === 'x') {
          g.fillStyle = o.bg; g.fillRect(o.x, o.y, o.w, o.h);
          if (o.bt > 0) { g.lineWidth = o.bt; g.strokeStyle = o.bc; g.strokeRect(o.x + o.bt / 2, o.y + o.bt / 2, o.w - o.bt, o.h - o.bt); }
          if (!o.text) continue;
          const tx = o.up ? o.text.toUpperCase() : o.text;
          g.font = `${o.ital ? 'italic ' : ''}${o.bold ? 'bold ' : ''}${o.fs}px ${o.ff}`; g.fillStyle = o.fill; g.textBaseline = 'middle';
          g.textAlign = o.ta === 2 ? 'center' : o.ta === 1 ? 'right' : 'left';
          const px = o.ta === 2 ? o.x + o.w / 2 : o.ta === 1 ? o.x + o.w : o.x, py = o.va === 1 ? o.y + o.h / 2 : o.va === 2 ? o.y + o.h - o.fs / 2 : o.y + o.fs / 2;
          g.fillText(tx, px, py, o.w); continue;
        }
        const on = lit.has(o.uid), ic = o.ic && (on ? planIconHot(o.ic) : planIcon(o.ic));
        if (ic) { const s = Math.max(iconHalf, 2 / scale) * (hv ? 1.3 : 1); g.drawImage(ic, o.x - s, o.y - s, s * 2, s * 2); g.globalAlpha = 1; continue; }
        g.beginPath();
        if (o.t === 'p') { g.arc(o.x, o.y, Math.max(6, 5 / scale) * (hv ? 1.5 : 1), 0, 7); g.fillStyle = on ? '#ff1414' : hv ? '#e8590c' : '#2a6fdb'; g.fill(); g.lineWidth = 1.5 / scale; g.strokeStyle = '#fff'; g.stroke(); g.globalAlpha = 1; continue; }
        if (o.t === 'r') g.rect(o.x, o.y, o.w, o.h);
        else { o.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); }
        g.fillStyle = on ? (o.kind === 'zone' ? ['', '#f59f00', '#e8590c', '#e03131'][zl.get(o.uid) || 3] : '#e03131') : o.fill; g.globalAlpha = on || hv || zh ? 0.6 : o.sub ? 0.5 : 0.3; g.fill(); g.globalAlpha = 1;
        g.lineWidth = (hv || zh ? 2.5 : 1.2) / scale; g.strokeStyle = hv || zh ? '#e8590c' : o.stroke; g.stroke();
      }
      if (esel.value && canEdit.value) {
        const o = esel.value, hs = 4.5 / scale;
        g.lineWidth = 1.5 / scale; g.strokeStyle = '#1c7ed6'; g.fillStyle = '#fff'; g.setLineDash([5 / scale, 3 / scale]);
        g.beginPath();
        if (o.t === 'p') g.arc(o.x, o.y, Math.max(6, 5 / scale) * 1.4, 0, 7); else if (o.t === 'g') { o.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); } else g.rect(o.x, o.y, o.w, o.h);
        g.stroke(); g.setLineDash([]);
        for (const q of o.t === 'g' ? o.pts : o.t === 'p' ? [] : [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]) { g.beginPath(); g.rect(q[0] - hs, q[1] - hs, hs * 2, hs * 2); g.fill(); g.stroke(); }
      }
      for (const o of selObjs) {
        const path = () => { g.beginPath(); if (o.t === 'p') g.arc(o.x, o.y, Math.max(6, 5 / scale) * 1.9, 0, 7); else if (o.t === 'r' || o.t === 'x') g.rect(o.x, o.y, o.w, o.h); else { o.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); } };
        path(); g.lineWidth = 6 / scale; g.strokeStyle = '#fff'; g.stroke();
        path(); g.lineWidth = 3 / scale; g.strokeStyle = '#d6336c'; g.stroke();
      }
    };
    const mkObj = (e, t) => {
      const m = model.value, uid = txt(e, 'ItemUID'); let kind = '', label = '';
      if (m.dev.has(uid)) { kind = 'dev'; label = devLabel(m.dev.get(uid)); }
      else if (m.zone.has(uid)) { kind = 'zone'; label = zoneLabel(m.zone.get(uid)); }
      else if (m.delay.has(uid)) { kind = 'delay'; label = delayLabel(m.delay.get(uid)); }
      else label = txt(e, 'Name');
      const desc = kind === 'dev' ? (txt(m.dev.get(uid), 'Description') || '').trim() : '';
      const o = { t, kind, uid, label, desc, el: e, ...layerOf(e), fill: color(e, 'BackgroundColor'), stroke: color(e, 'BorderColor') };
      if (t === 'p') { o.x = +txt(e, 'Left'); o.y = +txt(e, 'Top'); if (kind === 'dev') { o.zs = guids(m.dev.get(uid), 'ZoneUIDs'); o.ic = PLAN_ICONS[txt(m.dev.get(uid), 'DriverUID')]; } }
      else if (t === 'r') Object.assign(o, rectOf(e));
      else o.pts = ptsOf(e);
      return o;
    };
    const collect = p => {
      const m = model.value, out = [];
      const add = (tag, item, t) => { for (const e of subs(p, tag, item)) out.push(mkObj(e, t)); };
      for (const e of subs(p, 'ElementRectangleSubPlans', 'ElementRectangleSubPlan')) {
        out.push({ t: 'r', kind: 'plink', el: e, uid: txt(e, 'UID'), sub: true, label: 'Переход на план: ' + (txt(e, 'Caption') || txt(e, 'Name')), cap: txt(e, 'Caption'), ...layerOf(e), fill: color(e, 'BackgroundColor'), stroke: color(e, 'BorderColor'), ...rectOf(e) });
      }
      for (const e of subs(p, 'ElementPolygonSubPlans', 'ElementPolygonSubPlan')) {
        out.push({ t: 'g', kind: 'plink', el: e, uid: txt(e, 'UID'), sub: true, label: 'Переход на план: ' + (txt(e, 'Caption') || txt(e, 'Name')), ...layerOf(e), fill: color(e, 'BackgroundColor'), stroke: color(e, 'BorderColor'), pts: ptsOf(e) });
      }
      for (const e of subs(p, 'ElementTextBlocks', 'ElementTextBlock')) {
        out.push({ t: 'x', kind: 'ptext', el: e, uid: txt(e, 'UID'), label: 'Текст: ' + txt(e, 'Text'), text: txt(e, 'Text'), ...layerOf(e), fs: +txt(e, 'FontSize') || 12, bold: txt(e, 'FontBold') === 'true', ital: txt(e, 'FontItalic') === 'true', ff: txt(e, 'FontFamilyName') || 'Arial', ta: +txt(e, 'TextAlignment') || 0, va: +txt(e, 'VerticalAlignment') || 0, up: txt(e, 'UpperCase') === 'true', fill: color(e, 'ForegroundColor'), bg: colorA(e, 'BackgroundColor'), bc: colorA(e, 'BorderColor'), bt: +txt(e, 'BorderThickness') || 0, hasBg: (+txt(child(e, 'BackgroundColor'), 'A') || 0) > 0, ...rectOf(e) });
      }
      add('PolygonObjects', 'PolygonObject', 'g'); add('RectangleObjects', 'RectangleObject', 'r'); add('PointObjects', 'PointObject', 'p');
      const ps = out.filter(o => o.t === 'p'), nn = [], NC = 24, cells = new Map();
      for (const a of ps) { const k = Math.floor(a.x / NC) + ',' + Math.floor(a.y / NC); (cells.get(k) || cells.set(k, []).get(k)).push(a); }
      for (const a of ps) {
        let d = NC;
        const cx = Math.floor(a.x / NC), cy = Math.floor(a.y / NC);
        for (let i = cx - 1; i <= cx + 1; i++) for (let j = cy - 1; j <= cy + 1; j++) for (const b of cells.get(i + ',' + j) || []) if (b !== a) { const v = Math.hypot(a.x - b.x, a.y - b.y); if (v > 0.5 && v < d) d = v; }
        nn.push(d);
      }
      nn.sort((a, b) => a - b);
      iconHalf = Math.min(11, Math.max(2.5, (nn[Math.floor(nn.length / 4)] || 22) / 2));
      return out.sort(planOrder);
    };
    const inPoly = (pts, x, y) => { let r = false; for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) if ((pts[i][1] > y) !== (pts[j][1] > y) && x < (pts[j][0] - pts[i][0]) * (y - pts[i][1]) / (pts[j][1] - pts[i][1]) + pts[i][0]) r = !r; return r; };
    const GC = 80;
    const buildGrid = () => {
      const cells = new Map(), big = [];
      objs.forEach((o, i) => {
        o._i = i;
        let x0, y0, x1, y1;
        if (o.t === 'p') { x0 = x1 = o.x; y0 = y1 = o.y; }
        else if (o.pts) { x0 = Math.min(...o.pts.map(q => q[0])); x1 = Math.max(...o.pts.map(q => q[0])); y0 = Math.min(...o.pts.map(q => q[1])); y1 = Math.max(...o.pts.map(q => q[1])); }
        else { x0 = o.x; y0 = o.y; x1 = o.x + o.w; y1 = o.y + o.h; }
        const cx0 = Math.floor(x0 / GC), cx1 = Math.floor(x1 / GC), cy0 = Math.floor(y0 / GC), cy1 = Math.floor(y1 / GC);
        if ((cx1 - cx0 + 1) * (cy1 - cy0 + 1) > 64) { big.push(o); return; }
        for (let a = cx0; a <= cx1; a++) for (let b = cy0; b <= cy1; b++) { const k = a + ',' + b; (cells.get(k) || cells.set(k, []).get(k)).push(o); }
      });
      return { cells, big };
    };
    const hit = (px, py) => {
      const x = (px - ox) / scale, y = (py - oy) / scale, pr = Math.max(6, 5 / scale);
      grid ||= buildGrid();
      const cand = new Set(grid.big);
      for (let a = Math.floor((x - pr) / GC); a <= Math.floor((x + pr) / GC); a++) for (let b = Math.floor((y - pr) / GC); b <= Math.floor((y + pr) / GC); b++) for (const o of grid.cells.get(a + ',' + b) || []) cand.add(o);
      for (const o of [...cand].sort((p, q) => q._i - p._i)) {
        if ((o.t === 'x' && !canEdit.value)) continue;
        if (o.t === 'p' ? Math.hypot(o.x - x, o.y - y) <= pr : (o.t === 'r' || o.t === 'x') ? x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h : inPoly(o.pts, x, y)) return o;
      }
      return null;
    };
    const redraw = () => {
      zoomPct.value = Math.round(scale * 100);
      if (img) planView = { scale, ox, oy };
      raf ||= requestAnimationFrame(draw);
    };
    const fitView = (reset = true) => {
      if (!img) return;
      const r = css(), pad = 16;
      fit = Math.min((r.width - pad * 2) / iw, (r.height - pad * 2) / ih);
      if (!(fit > 0)) fit = 1;
      if (reset !== false) {
        scale = fit; ox = (r.width - iw * scale) / 2; oy = (r.height - ih * scale) / 2; fitOn.value = true;
      }
      redraw();
    };
    const zoomAt = (px, py, k) => {
      const ns = Math.min(Math.max(scale * k, fit * 0.1), 64);
      k = ns / scale;
      ox = px - (px - ox) * k; oy = py - (py - oy) * k; scale = ns; fitOn.value = false;
      redraw();
    };
    const pos = e => { const r = css(); return [e.clientX - r.left, e.clientY - r.top]; };
    const onWheel = e => { const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015))); };
    const ptrs = new Map();
    let pinch = null;
    const pinchGeom = () => { const [a, b] = [...ptrs.values()], r = css(); return { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }; };
    const onDown = e => {
      if (!img) return;
      cv.value.focus(); cv.value.setPointerCapture(e.pointerId);
      ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (ptrs.size === 2) { drag = null; tip.value = null; pinch = { ...pinchGeom(), scale, ox, oy }; return; }
      if (e.pointerType === 'touch') { const [x, y] = pos(e); hover = hit(x, y); }
      if (canEdit.value && e.button === 2) { delVertex(...pos(e)); return; }
      if (canEdit.value && e.button === 0) { const d = editDown(...pos(e), e); if (d) { drag = d; return; } }
      drag = { x: e.clientX, y: e.clientY, ox, oy, moved: false };
    };
    const onCtx = e => { if (canEdit.value) e.preventDefault(); };
    const onMove = e => {
      if (ptrs.has(e.pointerId)) ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && ptrs.size === 2) {
        const g = pinchGeom(), ns = Math.min(Math.max(pinch.scale * g.d / pinch.d, fit * 0.1), 64), k = ns / pinch.scale;
        scale = ns; ox = g.x - (pinch.x - pinch.ox) * k; oy = g.y - (pinch.y - pinch.oy) * k; fitOn.value = false; redraw(); return;
      }
      if (drag?.edit) { editMove(e); return; }
      if (drag) {
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
        if (!drag.moved) { drag.moved = true; cv.value.style.cursor = 'grabbing'; tip.value = null; }
        ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; fitOn.value = false; redraw(); return;
      }
      const [x, y] = pos(e), h = img ? hit(x, y) : null;
      if (h !== hover) { hover = h; redraw(); cv.value.style.cursor = h?.kind ? 'pointer' : ''; }
      tip.value = h ? { x: x + 14, y: y + 14, text: tipText(h) } : null;
    };
    const tipText = h => {
      let t = h.desc ? h.label + '\n' + h.desc : h.label;
      if (simOn.value && /^(dev|zone|delay)$/.test(h.kind)) {
        const L = ['Норма', 'Внимание', 'Пожар 1', 'Пожар 2'];
        t += '\nСостояние: ' + (h.kind === 'zone' ? L[zl.get(h.uid) || 0] : lit.has(h.uid) ? (manual.has(h.uid) ? 'Сработал (нажат)' : 'Включён по логике') : 'Норма');
      }
      return t;
    };
    const onUp = e => {
      ptrs.delete(e.pointerId);
      if (pinch) { if (ptrs.size < 2) pinch = null; drag = null; return; }
      const d = drag; drag = null; if (cv.value) cv.value.style.cursor = hover?.kind ? 'pointer' : '';
      if (d?.edit) { editUp(d, e); return; }
      if (d && !d.moved && canEdit.value && esel.value) { esel.value = null; redraw(); }
      if (d && !d.moved && e.type === 'pointerup' && simOn.value && hover && /^(dev|zone|delay)$/.test(hover.kind)) {
        manual.has(hover.uid) ? manual.delete(hover.uid) : manual.add(hover.uid); relit(); redraw(); if (tip.value) tip.value = { ...tip.value, text: tipText(hover) }; return;
      }
      if (d && !d.moved && e.type === 'pointerup' && hover?.kind) { picked = hover.uid; emit('pick', hover.uid); }
    };
    const onLeave = () => { if (hover) { hover = null; redraw(); } tip.value = null; };
    const syncSel = (center) => {
      selObjs = props.sel ? objs.filter(o => o.kind && o.uid === props.sel) : [];
      if (center && centerOn.value && selObjs.length && img) {
        const o = selObjs[0], r = css();
        const [cx, cy] = o.t === 'p' ? [o.x, o.y] : (o.t === 'r' || o.t === 'x') ? [o.x + o.w / 2, o.y + o.h / 2] : (() => { const xs = o.pts.map(q => q[0]), ys = o.pts.map(q => q[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; })();
        ox = r.width / 2 - cx * scale; oy = r.height / 2 - cy * scale; fitOn.value = false;
      }
      redraw();
    };
    const ready = ref(false), esel = shallowRef(null), hver = ref(0), msg = ref(''), addQuery = ref(''), addKind = ref('dev');
    const canEdit = computed(() => editOn.value && ready.value && !!props.plan);
    const hist = [], redoS = [];
    const canUndo = computed(() => (hver.value, hist.length > 0)), canRedo = computed(() => (hver.value, redoS.length > 0));
    const planRoot = () => model.value.plan.get(props.plan).ownerDocument.documentElement;
    const snap = o => ({ x: o.x, y: o.y, w: o.w, h: o.h, pts: o.pts?.map(q => q.slice()) });
    const bbox = o => {
      if (o.t === 'g') { const xs = o.pts.map(q => q[0]), ys = o.pts.map(q => q[1]), x = Math.min(...xs), y = Math.min(...ys); return [x, y, Math.max(...xs) - x, Math.max(...ys) - y]; }
      return [o.x, o.y, o.w || 0, o.h || 0];
    };
    const setNum = (el, tag, v) => {
      let c = child(el, tag); if (!c) { c = el.ownerDocument.createElementNS(el.namespaceURI, tag); el.appendChild(c); }
      c.textContent = String(v);
    };
    const writeDom = o => {
      if (!o.el) return;
      if (o.t === 'g') {
        let w = child(o.el, 'Points'); if (!w) { w = o.el.ownerDocument.createElementNS(o.el.namespaceURI, 'Points'); o.el.appendChild(w); }
        while (w.firstChild) w.removeChild(w.firstChild);
        for (const q of o.pts) { const pt = o.el.ownerDocument.createElementNS(o.el.namespaceURI, 'Point'); setNum(pt, 'X', q[0]); setNum(pt, 'Y', q[1]); w.appendChild(pt); }
        return;
      }
      setNum(o.el, 'Left', o.x); setNum(o.el, 'Top', o.y);
      if (o.t !== 'p') { setNum(o.el, 'Width', o.w); setNum(o.el, 'Height', o.h); }
    };
    const setState = (o, s) => { Object.assign(o, { x: s.x, y: s.y, w: s.w, h: s.h }); if (s.pts) o.pts = s.pts.map(q => q.slice()); writeDom(o); };
    let saveT = 0;
    const saveSoon = () => {
      clearTimeout(saveT);
      saveT = setTimeout(() => {
        const run = () => {
          const text = '<?xml version="1.0" encoding="utf-8"?>\n' + new XMLSerializer().serializeToString(planRoot());
          S.xmlTexts['PlansConfiguration.xml'] = text; delete S.lineCache['PlansConfiguration.xml'];
          const a = archive.value;
          idbDo('readwrite', s => s.put({ sig: planSig(a.name, a.size, a.mtime), text }, 'plans')).catch(() => {});
        };
        window.requestIdleCallback ? requestIdleCallback(run, { timeout: 5000 }) : run();
      }, 2000);
    };
    const changed = () => { grid = null; hver.value++; msg.value = ''; saveSoon(); redraw(); };
    const push = op => { hist.push(op); redoS.length = 0; changed(); };
    const undo = () => { const op = hist.pop(); if (!op) return; op.undo(); redoS.push(op); changed(); };
    const redo = () => { const op = redoS.pop(); if (!op) return; op.redo(); hist.push(op); changed(); };
    const detach = o => {
      o._par = o.el.parentNode; o._nx = o.el.nextSibling; o.el.remove();
      const i = objs.indexOf(o); if (i >= 0) objs.splice(i, 1);
      grid = null;
      if (esel.value === o) esel.value = null;
      selObjs = selObjs.filter(q => q !== o);
      if (hover === o) hover = null;
    };
    const attach = o => { o._par.insertBefore(o.el, o._nx); objs.push(o); objs.sort(planOrder); grid = null; };
    const delSel = () => { const o = esel.value; if (!o?.el) return; detach(o); push({ undo: () => { attach(o); esel.value = o; }, redo: () => detach(o) }); };
    const commitEdit = (o, before) => { const after = snap(o); writeDom(o); push({ undo: () => setState(o, before), redo: () => setState(o, after) }); };
    const toW = (px, py) => [(px - ox) / scale, (py - oy) / scale];
    const corners = o => [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]];
    const edgeAt = (pts, x, y) => {
      const n = pts.length; let bi = -1, bd = 8 / scale, bp = null;
      for (let i = 0; i < n; i++) {
        const a = pts[i], c = pts[(i + 1) % n], vx = c[0] - a[0], vy = c[1] - a[1], l2 = vx * vx + vy * vy;
        const k = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)) : 0, qx = a[0] + k * vx, qy = a[1] + k * vy, dd = Math.hypot(x - qx, y - qy);
        if (dd < bd) { bd = dd; bi = i; bp = [qx, qy]; }
      }
      return bi >= 0 ? { i: bi, p: bp } : null;
    };
    const newVertex = (o, ed) => {
      const orig = snap(o); o.pts.splice(ed.i + 1, 0, ed.p); grid = null;
      return { edit: true, k: 'v', o, i: ed.i + 1, sx: ed.p[0], sy: ed.p[1], before: snap(o), orig, moved: false };
    };
    const delVertex = (px, py) => {
      const o = esel.value, [x, y] = toW(px, py);
      if (!o?.el || o.t !== 'g' || o.pts.length <= 3) return;
      const i = o.pts.findIndex(q => Math.hypot(q[0] - x, q[1] - y) <= 8 / scale);
      if (i >= 0) { const b = snap(o); o.pts.splice(i, 1); commitEdit(o, b); }
    };
    const toPoly = o => {
      const old = o.el, doc = old.ownerDocument, ns = old.namespaceURI, oldWrap = old.parentNode, plan = oldWrap.parentNode, nx = old.nextSibling;
      const el = doc.createElementNS(ns, old.nodeName.replace('Rectangle', 'Polygon'));
      for (const c of old.childNodes) if (!/^(Left|Top|Width|Height)$/.test(c.nodeName)) el.appendChild(c.cloneNode(true));
      const wn = oldWrap.nodeName.replace('Rectangle', 'Polygon'); let wrap = child(plan, wn); const made = !wrap;
      if (made) wrap = doc.createElementNS(ns, wn);
      const was = { x: o.x, y: o.y, w: o.w, h: o.h }, pts = corners(o);
      const apply = () => {
        oldWrap.removeChild(old); if (made) plan.appendChild(wrap); wrap.appendChild(el);
        o.el = el; o.t = 'g'; o.pts = pts.map(q => q.slice()); writeDom(o); grid = null;
      };
      const revert = () => {
        wrap.removeChild(el); if (made) plan.removeChild(wrap); oldWrap.insertBefore(old, nx);
        o.el = old; o.t = 'r'; delete o.pts; Object.assign(o, was); grid = null;
      };
      apply(); push({ undo: revert, redo: apply });
    };
    const editDown = (px, py, e) => {
      const [x, y] = toW(px, py), hr = 8 / scale, o = esel.value;
      if (o?.el && o.t === 'g') {
        const i = o.pts.findIndex(q => Math.hypot(q[0] - x, q[1] - y) <= hr);
        if (i >= 0) {
          if (e.altKey) { delVertex(px, py); return { edit: true, done: true }; }
          return { edit: true, k: 'v', o, i, sx: x, sy: y, before: snap(o), moved: false };
        }
        const ed = edgeAt(o.pts, x, y);
        if (ed) return newVertex(o, ed);
      }
      if (o?.el && (o.t === 'r' || o.t === 'x')) {
        const i = corners(o).findIndex(q => Math.hypot(q[0] - x, q[1] - y) <= hr);
        if (i >= 0) return { edit: true, k: 'c', o, i, sx: x, sy: y, before: snap(o), moved: false };
        const ed = o.t === 'r' && edgeAt(corners(o), x, y);
        if (ed) { toPoly(o); hver.value++; return newVertex(o, ed); }
      }
      const h = hit(px, py);
      if (h?.el) { esel.value = h; hver.value++; redraw(); return { edit: true, k: 'm', o: h, sx: x, sy: y, before: snap(h), moved: false }; }
      return null;
    };
    const editMove = e => {
      const d = drag; if (d.done) return;
      const [x, y] = toW(...pos(e)), dx = x - d.sx, dy = y - d.sy, o = d.o, b = d.before;
      if (!d.moved && Math.hypot(dx, dy) * scale < 3) return;
      d.moved = true; tip.value = null;
      if (d.k === 'm') { if (o.t === 'g') o.pts = b.pts.map(q => [q[0] + dx, q[1] + dy]); else { o.x = b.x + dx; o.y = b.y + dy; } }
      else if (d.k === 'v') o.pts[d.i] = [b.pts[d.i][0] + dx, b.pts[d.i][1] + dy];
      else {
        let l = b.x, t = b.y, r = b.x + b.w, bt = b.y + b.h;
        if (d.i === 0 || d.i === 3) l += dx; else r += dx;
        if (d.i < 2) t += dy; else bt += dy;
        o.x = Math.min(l, r); o.y = Math.min(t, bt); o.w = Math.max(1, Math.abs(r - l)); o.h = Math.max(1, Math.abs(bt - t));
      }
      grid = null; hver.value++; redraw();
    };
    const editUp = (d, e) => {
      if (d.done) return;
      if (d.orig) commitEdit(d.o, d.orig);
      else if (d.moved) commitEdit(d.o, d.before);
      else if (d.k === 'm' && d.o.kind && e.type === 'pointerup') { picked = d.o.uid; emit('pick', d.o.uid); }
    };
    const onDbl = () => fitView();
    const onKey = e => {
      if (!canEdit.value) return;
      if (e.key === 'Delete') { e.preventDefault(); delSel(); }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') { esel.value = null; redraw(); }
    };
    const pr = computed(() => { hver.value; const o = esel.value; if (!o) return null; const [x, y, w, h] = bbox(o); return { label: o.label || '', t: o.t, x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) }; });
    const setProp = (k, v) => {
      const o = esel.value, n = parseFloat(v); if (!o || !isFinite(n)) return;
      const b = snap(o), [x, y, w, h] = bbox(o), nb = { x, y, w, h, [k]: n };
      if (o.t === 'g') { const sx = w ? Math.max(nb.w, 1) / w : 1, sy = h ? Math.max(nb.h, 1) / h : 1; o.pts = o.pts.map(q => [nb.x + (q[0] - x) * sx, nb.y + (q[1] - y) * sy]); }
      else { o.x = nb.x; o.y = nb.y; if (o.t !== 'p') { o.w = Math.max(nb.w, 1); o.h = Math.max(nb.h, 1); } }
      commitEdit(o, b);
    };
    const KINDS = { dev: ['Устройство', 'PointObject', 'GKDevice'], zone: ['Зона', 'RectangleObject', 'GKZone'], delay: ['Сценарий', 'RectangleObject', 'GKDelay'] };
    const onPlan = () => { hver.value; return new Set(objs.filter(o => o.kind && o.el).map(o => o.uid)); };
    const addList = computed(() => {
      if (!canEdit.value) return [];
      const m = model.value, have = onPlan(), q = addQuery.value.trim().toLowerCase(), k = addKind.value, out = [];
      const map = k === 'dev' ? m.dev : k === 'zone' ? m.zone : m.delay, lab = k === 'dev' ? devLabel : k === 'zone' ? zoneLabel : delayLabel;
      for (const [uid, el] of map) {
        if (have.has(uid) || (k === 'dev' && el === m.root)) continue;
        const l = lab(el); if (q && !l.toLowerCase().includes(q)) continue;
        out.push({ uid, label: l }); if (out.length >= 40) break;
      }
      return out;
    });
    const findTpl = (k, uid) => {
      const m = model.value, [, tag, on] = KINDS[k], drv = k === 'dev' ? txt(m.dev.get(uid), 'DriverUID') : '';
      let any = null, other = null;
      for (const q of m.plan.values()) for (const e of subs(q, tag + 's', tag)) {
        if (txt(e, 'ObjectName') !== on) { other ||= e; continue; }
        if (!drv) return e;
        const d = m.dev.get(txt(e, 'ItemUID')); if (d && txt(d, 'DriverUID') === drv) return e; any ||= e;
      }
      return any || other;
    };
    const addObj = it => {
      const k = addKind.value, [, tag, on] = KINDS[k], tpl = findTpl(k, it.uid), p = model.value.plan.get(props.plan);
      if (!tpl) { msg.value = 'В архиве нет образца элемента для клонирования.'; return; }
      const el = tpl.cloneNode(true), r = css(), cx = (r.width / 2 - ox) / scale, cy = (r.height / 2 - oy) / scale, pt = tag === 'PointObject', sz = 120;
      setNum(el, 'UID', crypto.randomUUID()); setNum(el, 'ItemUID', it.uid); setNum(el, 'ObjectName', on); setNum(el, 'Name', it.label);
      setNum(el, 'Left', pt ? cx : cx - sz / 2); setNum(el, 'Top', pt ? cy : cy - sz / 2);
      if (!pt) { setNum(el, 'Width', sz); setNum(el, 'Height', sz); }
      let wrap = child(p, tag + 's'); if (!wrap) { wrap = p.ownerDocument.createElementNS(p.namespaceURI, tag + 's'); p.appendChild(wrap); }
      const o = mkObj(el, pt ? 'p' : 'r'); o._par = wrap; o._nx = null; attach(o); esel.value = o;
      push({ undo: () => detach(o), redo: () => { attach(o); esel.value = o; } });
    };
    const exportFscp = async () => {
      const text = '<?xml version="1.0" encoding="utf-8"?>\n' + new XMLSerializer().serializeToString(planRoot());
      S.xmlTexts['PlansConfiguration.xml'] = text; delete S.lineCache['PlansConfiguration.xml'];
      S.zip.file('PlansConfiguration.xml', text);
      const blob = await S.zip.generateAsync({ type: 'blob', compression: 'DEFLATE' }), a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = archive.value.name.replace(/(\.fscp)?$/i, '') + ' (правки).fscp';
      a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    };
    const resetEdits = async () => {
      if (!await ask({ title: 'Сбросить правки планов?', text: 'Все изменения планов будут отменены, страница перезагрузится.', ok: 'Сбросить', cancel: 'Отмена', danger: true })) return;
      clearTimeout(saveT);
      try { await idbDo('readwrite', s => s.delete('plans')); } catch {}
      location.reload();
    };
    watch(canEdit, () => redraw());
    watch(() => props.sel, u => { syncSel(u !== picked); picked = ''; });
    const toggleCenter = () => { centerOn.value = !centerOn.value; try { localStorage['fscp.planCenter'] = centerOn.value ? '1' : '0'; } catch {} syncSel(true); };
    const zoomBtn = k => { const r = css(); zoomAt(r.width / 2, r.height / 2, k); };

    const bmpOf = async (p, my, cacheGen) => {
      const bg = txt(p, 'BackgroundImageSource');
      if (!bg) {
        const w = Math.min(Math.max(+txt(p, 'Width') || 0, 1), 8000), h = Math.min(Math.max(+txt(p, 'Height') || 0, 1), 8000);
        if (!(+txt(p, 'Width') > 0 && +txt(p, 'Height') > 0)) { note.value = 'У плана нет подложки и размера.'; return null; }
        const bc = child(p, 'BackgroundColor'), c = document.createElement('canvas');
        c.width = w; c.height = h;
        const g = c.getContext('2d');
        g.fillStyle = bc ? `rgb(${txt(bc, 'R') || 255},${txt(bc, 'G') || 255},${txt(bc, 'B') || 255})` : '#fff';
        g.fillRect(0, 0, w, h);
        return c;
      }
      const f = S.zip?.file('Content/' + bg);
      if (!f) { note.value = 'Файл подложки не найден в архиве.'; return null; }
      let bmp = bmpCache.get(f);
      if (!bmp) {
        note.value = 'Загрузка подложки…';
        bmp = await createImageBitmap(await f.async('blob'));
        if (my !== gen || cacheGen !== planCacheGen) { bmp.close(); return null; }
        bmpCache.set(f, bmp);
        if (bmpCache.size > 6) { const k = bmpCache.keys().next().value; bmpCache.get(k).close(); bmpCache.delete(k); }
      }
      return bmp;
    };
    const load = async () => {
      const my = ++gen, cacheGen = planCacheGen;
      img = null; segs = []; objs = []; grid = null; hover = null; selObjs = []; tip.value = null; note.value = ''; ready.value = false; esel.value = null; hist.length = redoS.length = 0; hver.value++; redraw();
      const p = props.plan && model.value.plan.get(props.plan);
      if (!p) { note.value = 'Выберите план — здесь появится подложка.'; return; }
      try {
        let bmp;
        try {
          bmp = await bmpOf(p, my, cacheGen);
          if (my !== gen || !bmp) return;
        } catch { if (my === gen) note.value = 'Не удалось прочитать подложку как изображение.'; return; }
        note.value = '';
        const list = collect(p);
        const pw = +txt(p, 'Width'), ph = +txt(p, 'Height'), fx = pw > 0 ? bmp.width / pw : 1, fy = ph > 0 ? bmp.height / ph : 1;
        if (Math.abs(fx - 1) > 0.02 && Math.abs(fx / fy - 1) < 0.02) scaleObjs(list, fx);
        const keepFit = fitOn.value;
        segs = [{ bmp, ox: 0, oy: 0, w: bmp.width, h: bmp.height }]; img = bmp; iw = bmp.width; ih = bmp.height; objs = list; grid = null; syncSel(true);
        fitView(keepFit || !planView);
        ready.value = true;
      } catch (e) { console.error(e); if (my === gen) note.value = 'Не удалось построить план: ' + e.message; }
    };
    watch(() => props.plan, load);
    onMounted(() => { ro = new ResizeObserver(() => { if (!img) redraw(); else fitView(fitOn.value); }); ro.observe(cv.value); planIconOnLoad = redraw; load(); });
    onBeforeUnmount(() => { planIconOnLoad = () => {}; ro?.disconnect(); cancelAnimationFrame(raf); gen++; });
    const toggleEdit = () => { editOn.value = !editOn.value; try { localStorage['fscp.planEdit'] = editOn.value ? '1' : '0'; } catch {} redraw(); };
    const toggleFit = () => { if (fitOn.value) fitOn.value = false; else fitView(); };
    const toggleSim = () => { simOn.value = !simOn.value; if (!simOn.value) { manual.clear(); relit(); redraw(); } try { localStorage['fscp.planSim'] = simOn.value ? '1' : '0'; } catch {} };
    return { addOpen, onCtx, fitOn, toggleFit, editOn, simOn, toggleEdit, toggleSim, canEdit, canUndo, canRedo, undo, redo, delSel, esel, pr, setProp, msg, addQuery, addKind, addList, addObj, KINDS, exportFscp, resetEdits, onDbl, onKey, nEdits: computed(() => (hver.value, hist.length)), centerOn, toggleCenter, cv, note, zoomPct, tip, onWheel, onDown, onMove, onUp, onLeave, fitView, zoomBtn };
  },
  template: `
<canvas ref="cv" tabindex="0" @keydown="onKey" @wheel.prevent="onWheel" @pointerdown="onDown" @contextmenu="onCtx" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @pointerleave="onLeave" @dblclick="onDbl"></canvas>
<div v-if="canEdit" class="ebar">
  <div class="erow main">
    <button class="ib" :disabled="!canUndo" @click="undo" title="Отменить (Ctrl+Z)">↶</button><button class="ib" :disabled="!canRedo" @click="redo" title="Повторить (Ctrl+Y)">↷</button><button class="ib" :disabled="!esel" @click="delSel" title="Удалить выбранное (Del)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
    <template v-if="pr"><span class="m elab" :title="pr.label">{{ pr.label || 'Элемент' }}</span>
      <label>X<input type="number" step="1" :value="pr.x" @change="setProp('x', $event.target.value)"></label><label>Y<input type="number" step="1" :value="pr.y" @change="setProp('y', $event.target.value)"></label>
      <template v-if="pr.t !== 'p'"><label>Ш<input type="number" step="1" :value="pr.w" @change="setProp('w', $event.target.value)"></label><label>В<input type="number" step="1" :value="pr.h" @change="setProp('h', $event.target.value)"></label></template></template>
    <span v-else class="m elab">Кликните элемент: перетаскивание двигает, ручки меняют размер и вершины; клик по ребру — новая вершина, правый клик по вершине — удалить.</span>
    <span class="m">правок: {{ nEdits }}</span>
    <button :class="{ on: addOpen }" @click="addOpen = !addOpen">Добавить на план {{ addOpen ? '▴' : '▾' }}</button>
    <button @click="exportFscp" title="Скачать архив с изменёнными планами">Скачать .fscp</button><button @click="resetEdits" title="Отменить все правки планов">Сбросить</button>
  </div>
  <div v-if="addOpen" class="erow add"><select v-model="addKind"><option v-for="(v, k) in KINDS" :key="k" :value="k">{{ v[0] }}</option></select><input type="search" v-model="addQuery" placeholder="Поиск">
    <div class="elist"><div v-for="it in addList" :key="it.uid" class="eit" :title="it.label" @click="addObj(it)">{{ it.label }}</div><p v-if="!addList.length" class="m">Ничего нет.</p></div></div>
  <p v-if="msg" class="m warn">{{ msg }}</p>
</div>
<div v-if="tip" class="ptip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
<p v-if="note" class="m">{{ note }}</p>
<div v-else class="zbar"><button class="ib" @click="zoomBtn(1 / 1.25)" title="Уменьшить"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/></svg></button><span class="m">{{ zoomPct }}%</span><button class="ib" @click="zoomBtn(1.25)" title="Увеличить"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M12 5v14"/></svg></button><button :class="['ib', { on: fitOn }]" @click="toggleFit" :title="fitOn ? 'Вписать в окно: вкл (двойной клик)' : 'Вписать в окно: выкл (двойной клик)'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg></button><button :class="['ib', { on: centerOn }]" @click="toggleCenter" :title="centerOn ? 'Центрировать на выбранном: вкл' : 'Центрировать на выбранном: выкл'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg></button><button :class="['ib', { on: editOn }]" @click="toggleEdit" title="Режим редактирования"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg></button><button :class="['ib', { on: simOn }]" @click="toggleSim" title="Имитация: клик по устройству, зоне или сценарию вызывает срабатывание по логике (красный цвет)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 4l13 8-13 8z"/></svg></button></div>`,
};
