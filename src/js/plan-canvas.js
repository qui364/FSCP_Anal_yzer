// холст плана: подложка с зумом колесом (к курсору), панорамой перетаскиванием, двойной клик — вписать
const bmpCache = new Map();   // декодированные подложки (ключ — файл в zip), не больше 6
const planIconImgs = new Map();   // значки устройств (PLAN_ICONS): файл -> Image (готовый — когда complete)
let planIconOnLoad = () => {};
const planIcon = f => {
  let im = planIconImgs.get(f);
  if (!im) { im = new Image(); im.onload = () => planIconOnLoad(); im.src = 'icons/plan/' + f; planIconImgs.set(f, im); }
  return im.complete && im.naturalWidth ? im : null;
};
const planTint = new Map();   // красные копии значков для сработавших элементов имитации
const planIconHot = f => {
  const im = planIcon(f); if (!im) return null;
  let t = planTint.get(f);
  if (!t) { t = document.createElement('canvas'); t.width = im.naturalWidth; t.height = im.naturalHeight; const x = t.getContext('2d'); x.drawImage(im, 0, 0); x.globalCompositeOperation = 'source-atop'; x.fillStyle = 'rgba(224,49,49,.7)'; x.fillRect(0, 0, t.width, t.height); planTint.set(f, t); }
  return t;
};
// цвета сетки из CSS-переменных: читаем при смене темы, а не на каждом кадре
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
// поля XML-элементов плана
const chan = (e, tag) => { const c = child(e, tag); return c && [txt(c, 'R'), txt(c, 'G'), txt(c, 'B'), (+txt(c, 'A') || 0) / 255]; };
const color = (e, tag) => { const c = chan(e, tag); return c ? `rgb(${c[0]},${c[1]},${c[2]})` : '#888'; };
const colorA = (e, tag) => { const c = chan(e, tag); return c ? `rgba(${c[0]},${c[1]},${c[2]},${c[3]})` : 'transparent'; };
const ptsOf = e => subs(e, 'Points', 'Point').map(q => [+txt(q, 'X'), +txt(q, 'Y')]);
const rectOf = e => ({ x: +txt(e, 'Left'), y: +txt(e, 'Top'), w: +txt(e, 'Width'), h: +txt(e, 'Height') });
const layerOf = e => ({ z: +txt(e, 'ZLayer') || 0, zi: +txt(e, 'ZIndex') || 0 });
// порядок отрисовки: точки сверху, текст без фона под остальным, затем слой и индекс
const planOrder = (a, b) => (a.t === 'p') - (b.t === 'p') || (a.t === 'x' && !a.hasBg) - (b.t === 'x' && !b.hasBg) || a.z - b.z || a.zi - b.zi;
const scaleObjs = (list, k) => { for (const o of list) { if (o.pts) o.pts.forEach(q => { q[0] *= k; q[1] *= k; }); else { o.x *= k; o.y *= k; if (o.w) o.w *= k; if (o.h) o.h *= k; if (o.fs) o.fs *= k; } } };
let planView = null;   // {scale, ox, oy} — общий вид холста для всех планов
let planCacheGen = 0;
function clearPlanCache() {
  planCacheGen++;
  for (const bmp of bmpCache.values()) bmp.close();
  bmpCache.clear();
  planView = null;
}
const PlanCanvas = {
  props: { plan: String, plans: { type: Array, default: () => [] }, sel: String, duMode: String, focus: { type: Array, default: () => [] }, closeup: Boolean, box: { type: Array, default: () => [] } },   // duMode 'only' — только устройства зон ДУ (вкладка «Зоны ДУ»)
  emits: ['pick'],
  setup(props, { emit }) {
    const flag = k => ref((() => { try { return localStorage[k] === '1'; } catch { return false; } })());
    const editOn = flag('fscp.planEdit'), simOn = flag('fscp.planSim');
    const cv = ref(null), note = ref(''), zoomPct = ref(0), tip = ref(null);
    const manual = new Set(); let lit = new Set();   // имитация: нажатые вручную UID и все сработавшие (с цепочкой по логике)
    const relit = () => {
      lit = new Set(manual);
      if (!manual.size) return;
      const G = buildGraph(), byUid = new Map();   // у одного UID может быть несколько узлов графа (устройство в условии и в исполнителях)
      G.nodes.forEach((n, i) => (byUid.get(n.uid) || byUid.set(n.uid, []).get(n.uid)).push(i));
      const q = [];
      for (const u of manual) q.push(...(byUid.get(u) || []));
      for (let qi = 0; qi < q.length; qi++) for (const k of G.nodes[q[qi]].out) {
        const u = G.nodes[k].uid;
        if (!lit.has(u)) { lit.add(u); q.push(...byUid.get(u)); }
      }
    };
    let objs = [], iconHalf = 11, hover = null, selObjs = [], picked = '', grid = null;   // grid — пространственная сетка для hit(), строится при первом обращении после любого изменения objs
    const duOn = ref((() => { try { return localStorage['fscp.du'] === '1'; } catch { return false; } })());
    const showDu = computed(() => props.duMode === 'only' || duOn.value);
    let segs = [];   // подложки на холсте: {bmp, oy, h} (на вкладке «Зоны ДУ» — все поэтажные планы друг под другом)
    let duPaths = null;  // зона ДУ -> {path, c}: векторная область (контуры PDF + фигуры пожарных зон из «Зона ДУ N ПОЖАР»), строится при первой отрисовке
    let duOff = null;
    const duBuild = () => duBuildPaths(objs);
    const duPick = document.createElement('canvas').getContext('2d');
    // зона ДУ под точкой плана (х, у — координаты подложки); для «общей» — список номеров по фигурам зон
    const duAt = (ix, iy) => {
      if (!showDu.value || !duPaths) return null;
      const nums = [];
      for (const [z, e] of duPaths) if (duPick.isPointInPath(e.path, ix, iy)) nums.push(z);
      if (!nums.length) return null;
      nums.sort((a, b) => parseFloat(a) - parseFloat(b));
      return (nums.length > 1 ? 'Зоны ДУ ' : 'Зона ДУ ') + nums.join(', ');
    };
    const shown = o => !o.ov && !(props.closeup && !props.box.includes(o.uid)) && !(showDu.value && props.focus.length && o.du && !o.du.some(n => props.focus.includes(n))) && !(props.duMode === 'only' && !o.du && o.t !== 'x');
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
      if (props.duMode !== 'only') {   // сетка позади плана: шаг кратен степени двойки, каждая 5-я линия ярче, подписи координат по краям
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
      const duShow = showDu.value;
      if (duShow) {   // области зон ДУ: слои из PDF + фигуры пожарных зон из «Зона ДУ N ПОЖАР», по зоне одним цветом легенды; вне выбранной зоны — бледнее
        duPaths ||= duBuild();
        g.globalCompositeOperation = 'multiply';   // цвет как в PDF, линии плана просвечивают
        for (const [z, e] of duPaths) { if (props.focus.length && !props.focus.includes(z)) continue; g.fillStyle = e.c; g.fill(e.path); }
        g.globalCompositeOperation = 'source-over';
        g.lineJoin = 'round';
        // рамка вокруг выбранной зоны: один внешний контур — область расширяется на DU_GAP (стены между соседними помещениями смыкаются), внутренняя часть вырезается
        for (const z of props.focus) {
          const e = duPaths.get(z); if (!e) continue;
          duOff ||= document.createElement('canvas');
          if (duOff.width !== c.width || duOff.height !== c.height) { duOff.width = c.width; duOff.height = c.height; }
          const o = duOff.getContext('2d');
          o.setTransform(1, 0, 0, 1, 0, 0); o.clearRect(0, 0, c.width, c.height);
          o.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr); o.lineJoin = 'round';
          const pass = (w, col, op) => { o.globalCompositeOperation = op; o.lineWidth = w; o.fillStyle = o.strokeStyle = col; o.fill(e.path); o.stroke(e.path); };
          pass(DU_GAP + 12 / scale, '#fff', 'source-over'); pass(DU_GAP + 6 / scale, '#d6336c', 'source-over'); pass(DU_GAP, '#000', 'destination-out');
          g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(duOff, 0, 0); g.setTransform(scale * dpr, 0, 0, scale * dpr, ox * dpr, oy * dpr);
        }
      }
      g.globalAlpha = 1;
      for (const o of objs) {
        if (!shown(o)) continue;
        const hv = o === hover, zh = !hv && !props.plans.length && o.kind === 'zone' && hover?.zs?.includes(o.uid);   // зона наведённого извещателя
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
        if (o.t === 'p') { g.arc(o.x, o.y, Math.max(6, 5 / scale) * (hv ? 1.5 : 1), 0, 7); g.fillStyle = on ? '#e03131' : hv ? '#e8590c' : '#2a6fdb'; g.fill(); g.lineWidth = 1.5 / scale; g.strokeStyle = '#fff'; g.stroke(); g.globalAlpha = 1; continue; }
        if (o.t === 'r') g.rect(o.x, o.y, o.w, o.h);
        else { o.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); }
        g.fillStyle = on ? '#e03131' : o.fill; g.globalAlpha = on || hv || zh ? 0.6 : o.sub ? 0.5 : 0.3; g.fill(); g.globalAlpha = 1;
        g.lineWidth = (hv || zh ? 2.5 : 1.2) / scale; g.strokeStyle = hv || zh ? '#e8590c' : o.stroke; g.stroke();
      }
      if (duShow && props.focus.length) {   // МДУ и ШУН выбранной зоны ДУ — красные круги
        g.lineWidth = 2.5 / scale; g.strokeStyle = '#e03131';
        for (const o of objs) if (o.hot && o.du.some(n => props.focus.includes(n))) { g.beginPath(); g.arc(o.x, o.y, Math.max(iconHalf * 1.5, 8 / scale), 0, 7); g.stroke(); }
      }
      if (esel.value && canEdit.value) {   // редактирование: контур и ручки (вершины многоугольника, углы прямоугольника)
        const o = esel.value, hs = 4.5 / scale;
        g.lineWidth = 1.5 / scale; g.strokeStyle = '#1c7ed6'; g.fillStyle = '#fff'; g.setLineDash([5 / scale, 3 / scale]);
        g.beginPath();
        if (o.t === 'p') g.arc(o.x, o.y, Math.max(6, 5 / scale) * 1.4, 0, 7); else if (o.t === 'g') { o.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); } else g.rect(o.x, o.y, o.w, o.h);
        g.stroke(); g.setLineDash([]);
        for (const q of o.t === 'g' ? o.pts : o.t === 'p' ? [] : [[o.x, o.y], [o.x + o.w, o.y], [o.x + o.w, o.y + o.h], [o.x, o.y + o.h]]) { g.beginPath(); g.rect(q[0] - hs, q[1] - hs, hs * 2, hs * 2); g.fill(); g.stroke(); }
      }
      for (const o of selObjs) {   // выбранный в дереве элемент (все его значки/фигуры на плане): контур (белая подложка + пурпурная линия)
        const path = () => { g.beginPath(); if (o.t === 'p') g.arc(o.x, o.y, Math.max(6, 5 / scale) * 1.9, 0, 7); else if (o.t === 'r' || o.t === 'x') g.rect(o.x, o.y, o.w, o.h); else { o.pts.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); } };
        path(); g.lineWidth = 6 / scale; g.strokeStyle = '#fff'; g.stroke();
        path(); g.lineWidth = 3 / scale; g.strokeStyle = '#d6336c'; g.stroke();
      }
    };
    // объект холста из элемента PointObject/RectangleObject/PolygonObject (el — исходный узел XML, правки пишутся в него)
    const mkObj = (e, t) => {
      const m = model.value, uid = txt(e, 'ItemUID'); let kind = '', label = '';
      if (m.dev.has(uid)) { kind = 'dev'; label = devLabel(m.dev.get(uid)); }
      else if (m.zone.has(uid)) { kind = 'zone'; label = zoneLabel(m.zone.get(uid)); }
      else if (m.delay.has(uid)) { kind = 'delay'; label = delayLabel(m.delay.get(uid)); }
      else label = txt(e, 'Name');
      const du = kind === 'dev' && t === 'p' ? m.duOf.get(uid) : null;
      if (du) label += ' · Зона ДУ ' + du.join(', ');
      const desc = kind === 'dev' ? (txt(m.dev.get(uid), 'Description') || '').trim() : '';
      const o = { t, kind, uid, label, desc, du, el: e, duz: kind === 'zone' ? m.duZones.get(uid) : null, ...layerOf(e), fill: color(e, 'BackgroundColor'), stroke: color(e, 'BorderColor') };
      if (t === 'p') { o.x = +txt(e, 'Left'); o.y = +txt(e, 'Top'); if (kind === 'dev') { o.zs = guids(m.dev.get(uid), 'ZoneUIDs'); const du0 = txt(m.dev.get(uid), 'DriverUID'); o.ic = PLAN_ICONS[du0]; o.hot = !!du && /^(МДУ|ШУН)/.test(DRIVERS[du0]?.[0] || ''); } }
      else if (t === 'r') Object.assign(o, rectOf(e));
      else o.pts = ptsOf(e);
      return o;
    };
    const collect = p => {
      const m = model.value, out = [];
      const add = (tag, item, t) => { for (const e of subs(p, tag, item)) out.push(mkObj(e, t)); };
      // ссылки на планы (прямоугольник с подписью) и текстовые блоки; ItemUID у них нет
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
      // пожарные зоны ДУ нарисованы не на плане с устройствами ДУ (АСПЗ), а на одноимённых планах другой системы (СПС) с той же подложкой: берём оттуда только фигуры зон
      const bgp = txt(p, 'BackgroundImageSource'), np = txt(p, 'Name');
      if (bgp) for (const q of m.plan.values()) {
        if (q === p || txt(q, 'Name') !== np || txt(q, 'BackgroundImageSource') !== bgp) continue;
        for (const [tag, item, t] of [['PolygonObjects', 'PolygonObject', 'g'], ['RectangleObjects', 'RectangleObject', 'r']]) for (const e of subs(q, tag, item)) {
          const duz = m.duZones.get(txt(e, 'ItemUID')); if (!duz) continue;
          const o = { t, kind: '', ov: true, duz, z: 0, zi: 0 };
          if (t === 'r') Object.assign(o, rectOf(e)); else o.pts = ptsOf(e);
          out.push(o);
        }
      }
      // размер значка: половина расстояния до ближайшего соседа (25-й перцентиль по плану), в пределах 2.5–11, чтобы в плотных группах не слипались
      const ps = out.filter(o => o.t === 'p'), nn = [], NC = 24, cells = new Map();   // сетка ячеек NC: расстояния больше NC на результат (потолок 11) не влияют
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
    const GC = 80;   // размер ячейки сетки (в координатах подложки)
    const buildGrid = () => {
      const cells = new Map(), big = [];   // big — крупные фигуры, которые проще проверять всегда
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
      for (const o of [...cand].sort((p, q) => q._i - p._i)) {   // сверху вниз по порядку отрисовки
        if (!shown(o) || (o.t === 'x' && !canEdit.value)) continue;   // текстовые блоки вне редактирования неинтерактивны: только рисуются поверх подложки
        if (o.t === 'p' ? Math.hypot(o.x - x, o.y - y) <= pr : (o.t === 'r' || o.t === 'x') ? x >= o.x && x <= o.x + o.w && y >= o.y && y <= o.y + o.h : inPoly(o.pts, x, y)) return o;
      }
      return null;
    };
    const redraw = () => {
      zoomPct.value = Math.round(scale * 100);
      if (img) planView = { scale, ox, oy };
      raf ||= requestAnimationFrame(draw);
    };
    // reset=false — только пересчитать «вписанный» масштаб, не трогая текущий зум и смещение
    const fitView = (reset = true) => {
      if (!img) return;
      const r = css(), pad = 16;
      fit = Math.min((r.width - pad * 2) / iw, (r.height - pad * 2) / ih);
      if (!(fit > 0)) fit = 1;
      if (reset !== false) {
        scale = fit; ox = (r.width - iw * scale) / 2; oy = props.duMode === 'only' ? pad : (r.height - ih * scale) / 2;
      }
      redraw();
    };
    // вырез (вкладка «Логика БМП»): статичный кадр по общей массе объектов из box, без зума/панорамы
    const applyCloseup = () => {
      const r = css(), xs = [], ys = [];
      for (const o of objs) {
        if (o.ov || !o.kind || !props.box.includes(o.uid)) continue;
        if (o.pts) for (const q of o.pts) { xs.push(q[0]); ys.push(q[1]); }
        else { xs.push(o.x, o.x + (o.w || 0)); ys.push(o.y, o.y + (o.h || 0)); }
      }
      if (!xs.length) return;
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      const pad = 50, bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
      scale = Math.min(6, Math.max(fit, Math.min(r.width / bw, r.height / bh)));
      ox = r.width / 2 - (x0 + x1) / 2 * scale; oy = r.height / 2 - (y0 + y1) / 2 * scale; redraw();
    };
    const zoomAt = (px, py, k) => {
      const ns = Math.min(Math.max(scale * k, fit * 0.1), 64);
      k = ns / scale;
      ox = px - (px - ox) * k; oy = py - (py - oy) * k; scale = ns;
      redraw();
    };
    const pos = e => { const r = css(); return [e.clientX - r.left, e.clientY - r.top]; };
    const onWheel = e => { if (props.closeup) return; const [x, y] = pos(e); zoomAt(x, y, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015))); };
    const onDown = e => {
      if (!img || props.closeup) return;
      cv.value.focus(); cv.value.setPointerCapture(e.pointerId);
      if (canEdit.value && e.button === 0) { const d = editDown(...pos(e), e); if (d) { drag = d; return; } }
      drag = { x: e.clientX, y: e.clientY, ox, oy, moved: false };
    };
    const onMove = e => {
      if (drag?.edit) { editMove(e); return; }
      if (drag) {
        if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 4) return;
        if (!drag.moved) { drag.moved = true; cv.value.style.cursor = 'grabbing'; tip.value = null; }
        ox = drag.ox + e.clientX - drag.x; oy = drag.oy + e.clientY - drag.y; redraw(); return;
      }
      const [x, y] = pos(e), h = img ? hit(x, y) : null;
      if (h !== hover) { hover = h; redraw(); cv.value.style.cursor = h?.kind ? 'pointer' : ''; }
      const dz = !h && img ? duAt((x - ox) / scale, (y - oy) / scale) : null;
      tip.value = h ? { x: x + 14, y: y + 14, text: h.desc ? h.label + '\n' + h.desc : h.label } : dz ? { x: x + 14, y: y + 14, text: dz } : null;
    };
    const onUp = e => {
      const d = drag; drag = null; if (cv.value) cv.value.style.cursor = hover?.kind ? 'pointer' : '';
      if (d?.edit) { editUp(d, e); return; }
      if (d && !d.moved && canEdit.value && esel.value) { esel.value = null; redraw(); }
      if (d && !d.moved && e.type === 'pointerup' && simOn.value && hover && /^(dev|zone|delay)$/.test(hover.kind)) {
        manual.has(hover.uid) ? manual.delete(hover.uid) : manual.add(hover.uid); relit(); redraw(); return;
      }
      if (d && !d.moved && e.type === 'pointerup' && hover?.kind) { picked = hover.uid; emit('pick', hover.uid); }
    };
    const onLeave = () => { if (hover) { hover = null; redraw(); } tip.value = null; };
    const syncSel = (center) => {
      selObjs = props.sel ? objs.filter(o => o.kind && o.uid === props.sel) : [];
      if (center && centerOn.value && selObjs.length && img) {
        const o = selObjs[0], r = css();
        const [cx, cy] = o.t === 'p' ? [o.x, o.y] : (o.t === 'r' || o.t === 'x') ? [o.x + o.w / 2, o.y + o.h / 2] : (() => { const xs = o.pts.map(q => q[0]), ys = o.pts.map(q => q[1]); return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2]; })();
        ox = r.width / 2 - cx * scale; oy = r.height / 2 - cy * scale;
      }
      redraw();
    };
    // --- редактирование плана: правки пишутся в XML-узлы (o.el), история отмены — замыкания, сохранение — IndexedDB ---
    const ready = ref(false), esel = shallowRef(null), hver = ref(0), msg = ref(''), addQuery = ref(''), addKind = ref('dev');
    const canEdit = computed(() => editOn.value && ready.value && !props.plans.length && !props.closeup && !props.duMode && !!props.plan);
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
      saveT = setTimeout(() => {   // сериализация всего XML планов тяжёлая: пауза после серии правок и только в простое
        const run = () => {
          const text = '<?xml version="1.0" encoding="utf-8"?>\n' + new XMLSerializer().serializeToString(planRoot());
          S.xmlTexts['PlansConfiguration.xml'] = text; delete S.lineCache['PlansConfiguration.xml'];
          const a = archive.value;
          idbDo('readwrite', s => s.put({ sig: planSig(a.name, a.size, a.mtime), text }, 'plans')).catch(() => {});
        };
        window.requestIdleCallback ? requestIdleCallback(run, { timeout: 5000 }) : run();
      }, 2000);
    };
    const changed = () => { duPaths = null; grid = null; hver.value++; msg.value = ''; saveSoon(); redraw(); };
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
    const editDown = (px, py, e) => {
      const [x, y] = toW(px, py), hr = 8 / scale, o = esel.value;
      if (o?.el && o.t === 'g') {
        const i = o.pts.findIndex(q => Math.hypot(q[0] - x, q[1] - y) <= hr);
        if (i >= 0) {
          if (e.altKey) { if (o.pts.length > 3) { const b = snap(o); o.pts.splice(i, 1); commitEdit(o, b); } return { edit: true, done: true }; }
          return { edit: true, k: 'v', o, i, sx: x, sy: y, before: snap(o), moved: false };
        }
      }
      if (o?.el && (o.t === 'r' || o.t === 'x')) {
        const i = corners(o).findIndex(q => Math.hypot(q[0] - x, q[1] - y) <= hr);
        if (i >= 0) return { edit: true, k: 'c', o, i, sx: x, sy: y, before: snap(o), moved: false };
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
      duPaths = null; grid = null; hver.value++; redraw();
    };
    const editUp = (d, e) => {
      if (d.done) return;
      if (d.moved) commitEdit(d.o, d.before);
      else if (d.k === 'm' && d.o.kind && e.type === 'pointerup') { picked = d.o.uid; emit('pick', d.o.uid); }
    };
    // двойной клик по ребру выбранного многоугольника — новая вершина; иначе — вписать вид
    const onDbl = e => {
      if (props.closeup) return;
      const o = esel.value;
      if (canEdit.value && o?.el && o.t === 'g') {
        const [x, y] = toW(...pos(e)), n = o.pts.length;
        let bi = -1, bd = 8 / scale, bp = null;
        for (let i = 0; i < n; i++) {
          const a = o.pts[i], c = o.pts[(i + 1) % n], vx = c[0] - a[0], vy = c[1] - a[1], l2 = vx * vx + vy * vy;
          const k = l2 ? Math.max(0, Math.min(1, ((x - a[0]) * vx + (y - a[1]) * vy) / l2)) : 0, qx = a[0] + k * vx, qy = a[1] + k * vy, dd = Math.hypot(x - qx, y - qy);
          if (dd < bd) { bd = dd; bi = i; bp = [qx, qy]; }
        }
        if (bi >= 0) { const b = snap(o); o.pts.splice(bi + 1, 0, bp); commitEdit(o, b); return; }
      }
      fitView();
    };
    const onKey = e => {
      if (!canEdit.value) return;
      if (e.key === 'Delete') { e.preventDefault(); delSel(); }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyZ') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
      else if ((e.ctrlKey || e.metaKey) && e.code === 'KeyY') { e.preventDefault(); redo(); }
      else if (e.key === 'Escape') { esel.value = null; redraw(); }
    };
    // свойства выбранного (X/Y/ширина/высота; у многоугольника — габариты)
    const pr = computed(() => { hver.value; const o = esel.value; if (!o) return null; const [x, y, w, h] = bbox(o); return { label: o.label || '', t: o.t, x: +x.toFixed(1), y: +y.toFixed(1), w: +w.toFixed(1), h: +h.toFixed(1) }; });
    const setProp = (k, v) => {
      const o = esel.value, n = parseFloat(v); if (!o || !isFinite(n)) return;
      const b = snap(o), [x, y, w, h] = bbox(o), nb = { x, y, w, h, [k]: n };
      if (o.t === 'g') { const sx = w ? Math.max(nb.w, 1) / w : 1, sy = h ? Math.max(nb.h, 1) / h : 1; o.pts = o.pts.map(q => [nb.x + (q[0] - x) * sx, nb.y + (q[1] - y) * sy]); }
      else { o.x = nb.x; o.y = nb.y; if (o.t !== 'p') { o.w = Math.max(nb.w, 1); o.h = Math.max(nb.h, 1); } }
      commitEdit(o, b);
    };
    // добавление на план: клон существующего узла того же вида (цвета, слой, ModuleData), новые UID/ItemUID, центр видимой области
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
    watch([showDu, () => props.focus], redraw);
    watch(canEdit, () => redraw());
    const toggleDu = () => { duOn.value = !duOn.value; try { localStorage['fscp.du'] = duOn.value ? '1' : '0'; } catch {} };
    watch(() => props.sel, u => { syncSel(u !== picked); picked = ''; });
    const toggleCenter = () => { centerOn.value = !centerOn.value; try { localStorage['fscp.planCenter'] = centerOn.value ? '1' : '0'; } catch {} syncSel(true); };
    const zoomBtn = k => { const r = css(); zoomAt(r.width / 2, r.height / 2, k); };

    // подложка плана: из архива (с кэшем декодированных) или, если подложки нет, холст размера плана с цветом фона
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
    const shiftY = (list, dy) => { if (dy) for (const o of list) { if (o.pts) o.pts.forEach(q => { q[1] += dy; }); else o.y += dy; } };
    const load = async () => {
      const my = ++gen, cacheGen = planCacheGen;
      img = null; segs = []; objs = []; duPaths = null; grid = null; hover = null; selObjs = []; tip.value = null; note.value = ''; ready.value = false; esel.value = null; hist.length = redoS.length = 0; hver.value++; redraw();
      const ps = (props.plans.length ? props.plans : [props.plan]).map(u => u && model.value.plan.get(u)).filter(Boolean);
      if (!ps.length) { note.value = 'Выберите план — здесь появится подложка.'; return; }
      try {
        const sg = [], ob = [];
        const gap = ps.length > 1 ? 60 : 0, ROW = DU_CONFIG.rowPlans;   // эти планы — в одном ряду слева направо
        let y = 0, w = 0, w2 = 0, x = 0, rowH = 0, prevRow = false;
        const bmps = [];
        try {
          for (const p of ps) {
            const bmp = await bmpOf(p, my, cacheGen);
            if (my !== gen) return;
            if (!bmp) return;
            bmps.push(bmp);
          }
        } catch { if (my === gen) note.value = 'Не удалось прочитать подложку как изображение.'; return; }
        const rowMax = Math.max(0, ...ps.map((p, i) => ROW.includes(txt(p, 'Name')) ? bmps[i].height : 0));   // ряд выравниваем по высоте большего плана
        const rowItems = [], topItems = [];   // что лежит в ряду — потом сдвигаем по центру стека
        let wTop = 0;
        ps.forEach((p, i) => {
          const bmp = bmps[i], inRow = ROW.includes(txt(p, 'Name'));
          const k = inRow ? rowMax / bmp.height : 1, bw = bmp.width * k, bh = bmp.height * k;
          if (prevRow && inRow) x = w2 + gap; else { y += rowH ? rowH + gap : 0; x = 0; rowH = 0; }
          const list = collect(p);
          const pw = +txt(p, 'Width'), ph = +txt(p, 'Height'), fx = pw > 0 ? bmp.width / pw : 1, fy = ph > 0 ? bmp.height / ph : 1;   // координаты объектов — в размере плана, подложка может быть крупнее
          if (Math.abs(fx - 1) > 0.02 && Math.abs(fx / fy - 1) < 0.02) scaleObjs(list, fx);
          if (k !== 1) scaleObjs(list, k);
          shiftY(list, y); if (x) for (const o of list) { if (o.pts) o.pts.forEach(q => { q[0] += x; }); else o.x += x; }
          ob.push(...list);
          const s = { bmp, ox: x, oy: y, w: bw, h: bh };
          sg.push(s); rowH = Math.max(rowH, bh); w2 = x + bw; w = Math.max(w, w2); prevRow = inRow;
          (inRow ? rowItems : topItems).push({ s, list }); if (!inRow) wTop = Math.max(wTop, bw);
        });
        const rowW = rowItems.length ? rowItems.reduce((a, it) => Math.max(a, it.s.ox + it.s.w), 0) : 0, d = rowItems.length ? (wTop - rowW) / 2 : 0;   // центр нижнего ряда = центр верхних планов
        const shiftX = (items, dx) => { if (dx) for (const it of items) { it.s.ox += dx; for (const o of it.list) { if (o.pts) o.pts.forEach(q => { q[0] += dx; }); else o.x += dx; } } };
        shiftX(rowItems, Math.max(0, d)); shiftX(topItems, Math.max(0, -d));
        w = Math.max(wTop, rowW);
        y += rowH;
        note.value = '';
        segs = sg; img = sg[0].bmp; iw = w; ih = y; objs = ps.length > 1 ? ob.sort(planOrder) : ob; duPaths = null; grid = null; syncSel(true);
        fitView(props.duMode === 'only' || !planView || props.closeup);
        if (props.closeup) applyCloseup();
        ready.value = true;
        // fitView(false) — только пересчёт fit: зум и смещение общие для всех планов, вписываем только при первом показе
      } catch (e) { console.error(e); if (my === gen) note.value = 'Не удалось построить план: ' + e.message; }
    };
    watch(() => props.plan + '|' + props.plans.join(), load);
    onMounted(() => { ro = new ResizeObserver(() => { if (!img) redraw(); else if (props.closeup) { fitView(false); applyCloseup(); } else fitView(Math.abs(scale - fit) < 1e-9); }); ro.observe(cv.value); planIconOnLoad = redraw; load(); });
    onBeforeUnmount(() => { planIconOnLoad = () => {}; ro?.disconnect(); cancelAnimationFrame(raf); gen++; });
    const toggleEdit = () => { editOn.value = !editOn.value; try { localStorage['fscp.planEdit'] = editOn.value ? '1' : '0'; } catch {} redraw(); };
    const toggleSim = () => { simOn.value = !simOn.value; if (!simOn.value) { manual.clear(); relit(); redraw(); } try { localStorage['fscp.planSim'] = simOn.value ? '1' : '0'; } catch {} };
    return { editOn, simOn, toggleEdit, toggleSim, canEdit, canUndo, canRedo, undo, redo, delSel, esel, pr, setProp, msg, addQuery, addKind, addList, addObj, KINDS, exportFscp, resetEdits, onDbl, onKey, nEdits: computed(() => (hver.value, hist.length)), duOn, toggleDu, centerOn, toggleCenter, cv, note, zoomPct, tip, onWheel, onDown, onMove, onUp, onLeave, fitView, zoomBtn };
  },
  template: `
<canvas ref="cv" tabindex="0" @keydown="onKey" @wheel.prevent="onWheel" @pointerdown="onDown" @pointermove="onMove" @pointerup="onUp" @pointercancel="onUp" @pointerleave="onLeave" @dblclick="onDbl"></canvas>
<div v-if="canEdit" class="ebar">
  <div class="erow"><b>Редактирование</b><span class="m">правок: {{ nEdits }}</span></div>
  <div class="erow"><button class="ib" :disabled="!canUndo" @click="undo" title="Отменить (Ctrl+Z)">↶</button><button class="ib" :disabled="!canRedo" @click="redo" title="Повторить (Ctrl+Y)">↷</button><button class="ib" :disabled="!esel" @click="delSel" title="Удалить выбранное (Del)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button></div>
  <div v-if="pr" class="eprops"><div class="m" :title="pr.label">{{ pr.label || 'Элемент' }}</div>
    <label>X<input type="number" step="1" :value="pr.x" @change="setProp('x', $event.target.value)"></label><label>Y<input type="number" step="1" :value="pr.y" @change="setProp('y', $event.target.value)"></label>
    <template v-if="pr.t !== 'p'"><label>Ш<input type="number" step="1" :value="pr.w" @change="setProp('w', $event.target.value)"></label><label>В<input type="number" step="1" :value="pr.h" @change="setProp('h', $event.target.value)"></label></template></div>
  <p v-else class="m">Кликните элемент: перетаскивание двигает, ручки меняют размер/вершины. Двойной клик по ребру многоугольника — новая вершина, Alt+клик по вершине — удалить.</p>
  <details class="eadd"><summary>Добавить на план</summary>
    <div class="erow"><select v-model="addKind"><option v-for="(v, k) in KINDS" :key="k" :value="k">{{ v[0] }}</option></select><input type="search" v-model="addQuery" placeholder="Поиск"></div>
    <div class="elist"><div v-for="it in addList" :key="it.uid" class="eit" :title="it.label" @click="addObj(it)">{{ it.label }}</div><p v-if="!addList.length" class="m">Ничего нет.</p></div></details>
  <p v-if="msg" class="m warn">{{ msg }}</p>
  <div class="erow"><button @click="exportFscp" title="Скачать архив с изменёнными планами">Скачать .fscp</button><button @click="resetEdits" title="Отменить все правки планов">Сбросить</button></div>
</div>
<div v-if="tip" class="ptip" :style="{ left: tip.x + 'px', top: tip.y + 'px' }">{{ tip.text }}</div>
<p v-if="note" class="m">{{ note }}</p>
<div v-else-if="!closeup" class="zbar"><button class="ib" @click="zoomBtn(1 / 1.25)" title="Уменьшить">−</button><span class="m">{{ zoomPct }}%</span><button class="ib" @click="zoomBtn(1.25)" title="Увеличить">+</button><button class="ib" @click="fitView" title="Вписать (двойной клик)">⤢</button><button v-if="duMode !== 'only'" :class="['ib', { on: duOn }]" @click="toggleDu" title="Зоны ДУ: окрасить устройства по зонам дымоудаления"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 12h15a3 3 0 1 1-3 3"/><path d="M3 16h8a3 3 0 1 1-3 3"/></svg></button><button :class="['ib', { on: centerOn }]" @click="toggleCenter" :title="centerOn ? 'Центрировать на выбранном: вкл' : 'Центрировать на выбранном: выкл'"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="4"/></svg></button><button v-if="duMode !== 'only'" :class="['ib', { on: editOn }]" @click="toggleEdit" title="Режим редактирования"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/></svg></button><button :class="['ib', { on: simOn }]" @click="toggleSim" title="Имитация: клик по устройству, зоне или сценарию вызывает срабатывание по логике (красный цвет)"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4l13 8-13 8z"/></svg></button></div>`,
};
