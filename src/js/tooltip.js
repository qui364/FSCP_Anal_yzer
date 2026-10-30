(() => {
  const tip = document.createElement('div');
  tip.id = 'tip';
  tip.setAttribute('role', 'tooltip');
  document.body.appendChild(tip);
  let cur = null, timer = 0, hideT = 0;
  const text = el => {
    const t = el.getAttribute('title');
    if (t != null) { el.removeAttribute('title'); if (t) el.dataset.tip = t; else delete el.dataset.tip; }
    return el.dataset.tip || '';
  };
  const find = n => {
    for (let el = n instanceof Element ? n : n?.parentElement; el && el !== document.body; el = el.parentElement)
      if (el.hasAttribute('title') || el.dataset.tip) { if (text(el)) return el; }
    return null;
  };
  const hide = () => { clearTimeout(timer); clearTimeout(hideT); cur = null; tip.classList.remove('on'); };
  const show = el => {
    const t = text(el);
    if (!t || !el.isConnected) return;
    cur = el;
    tip.textContent = t;
    tip.style.left = '0px'; tip.style.top = '0px';
    tip.classList.add('on');
    const r = el.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight, m = 8;
    let x = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), innerWidth - w - m);
    let y = r.bottom + 8;
    if (y + h > innerHeight - m) y = Math.max(m, r.top - h - 8);
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  };
  document.addEventListener('pointerover', e => {
    if (e.pointerType === 'touch') return;
    const el = find(e.target);
    if (el === cur) return;
    hide();
    if (el) timer = setTimeout(() => show(el), 450);
  }, true);
  document.addEventListener('pointerout', e => { if (e.pointerType !== 'touch' && !(e.relatedTarget instanceof Node && cur?.contains(e.relatedTarget))) hide(); }, true);
  document.addEventListener('pointerdown', e => { if (e.pointerType !== 'touch') hide(); }, true);
  document.addEventListener('keydown', hide, true);
  document.addEventListener('wheel', hide, { capture: true, passive: true });
  document.addEventListener('scroll', hide, true);
  let tx = 0, ty = 0;
  document.addEventListener('touchstart', e => {
    hide();
    if (e.touches.length !== 1) return;
    const t = e.touches[0], el = find(e.target);
    tx = t.clientX; ty = t.clientY;
    if (el) timer = setTimeout(() => { show(el); hideT = setTimeout(hide, 3000); }, 500);
  }, { capture: true, passive: true });
  document.addEventListener('touchmove', e => {
    const t = e.touches[0];
    if (Math.abs(t.clientX - tx) > 10 || Math.abs(t.clientY - ty) > 10) clearTimeout(timer);
  }, { capture: true, passive: true });
  document.addEventListener('touchend', () => clearTimeout(timer), true);
})();
