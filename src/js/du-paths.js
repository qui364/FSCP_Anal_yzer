// области зон ДУ на плане: один Path2D на зону (фигуры пожарных зон из «Зона ДУ N ПОЖАР»)
const DU_GAP = 14;   // толщина «стены» между помещениями (в пикселях подложки), которую рамка зоны перекрывает
function duBuildPaths(objs) {
  const m = new Map();
  const colOf = z => DU_COLORS[z] || '#999';
  const get = z => { let e = m.get(z); if (!e) { e = { path: new Path2D(), c: colOf(z) }; m.set(z, e); } return e; };
  const ring = (p, pts, dy, dx = 0, k = 1) => { for (let i = 0; i < pts.length; i += 2) i ? p.lineTo(pts[i] * k + dx, pts[i + 1] * k + dy) : p.moveTo(pts[i] * k + dx, pts[i + 1] * k + dy); p.closePath(); };
  for (const o of objs) {
    if (!o.duz || o.duz.length > 1) continue;   // фигуры, общие для нескольких зон, не рисуются
    const e = get(o.duz[0]);
    if (o.t === 'r') ring(e.path, [o.x, o.y, o.x + o.w, o.y, o.x + o.w, o.y + o.h, o.x, o.y + o.h], 0);
    else {
      let a = 0; for (let i = 0, j = o.pts.length - 1; i < o.pts.length; j = i++) a += o.pts[j][0] * o.pts[i][1] - o.pts[i][0] * o.pts[j][1];
      const f = o.pts.flat(); if (a < 0) { f.length = 0; for (let i = o.pts.length - 1; i >= 0; i--) f.push(o.pts[i][0], o.pts[i][1]); }   // положительная ориентация, чтобы не вычитать дырки PDF
      ring(e.path, f, 0);
    }
  }
  return m;
}
