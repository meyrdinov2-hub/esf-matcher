(() => {
  const deck = document.getElementById('deck');
  const slides = [...deck.querySelectorAll('.slide')];
  const total = slides.length;
  const $ = (id) => document.getElementById(id);
  const mobile = window.matchMedia('(max-width: 820px)');
  let cur = 0;

  /* масштаб кадра 1920×1080 под окно */
  function fit() {
    const k = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    deck.style.setProperty('--k', k);
  }

  function go(i, fromHash) {
    cur = Math.max(0, Math.min(total - 1, i));
    slides.forEach((s, n) => s.classList.toggle('on', n === cur));
    $('hud-n').textContent = `${cur + 1} / ${total}`;
    $('hud-p').style.width = `${((cur + 1) / total) * 100}%`;
    if (!fromHash && location.hash !== `#${cur + 1}`) history.replaceState(null, '', `#${cur + 1}`);
    renderNotes();
  }
  const fromHash = () => {
    const n = parseInt(location.hash.slice(1), 10);
    return Number.isFinite(n) ? n - 1 : 0;
  };

  /* речь докладчика */
  const notesText = (s) => (s && s.querySelector('.notes') ? s.querySelector('.notes').textContent.trim() : '');
  function renderNotes() {
    $('np-title').textContent = `${cur + 1}. ${slides[cur].dataset.title}`;
    $('np-text').textContent = notesText(slides[cur]);
    $('np-next').textContent = slides[cur + 1] ? slides[cur + 1].dataset.title : 'конец';
  }

  /* таймер */
  let t0 = null, tick = null;
  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
  function toggleTimer(reset) {
    if (reset) { t0 = null; clearInterval(tick); tick = null; $('np-timer').textContent = '00:00'; return; }
    if (tick) { clearInterval(tick); tick = null; return; }
    const elapsed = t0 ? Date.now() - t0 : 0;
    t0 = Date.now() - elapsed;
    tick = setInterval(() => { $('np-timer').textContent = fmt(Math.floor((Date.now() - t0) / 1000)); }, 500);
    $('notes').hidden = false;
  }

  /* обзор всех слайдов */
  function openGrid() {
    const g = $('grid');
    g.innerHTML = '';
    slides.forEach((s, n) => {
      const b = document.createElement('button');
      b.className = 'thumb' + (n === cur ? ' cur' : '');
      b.setAttribute('aria-label', `Слайд ${n + 1}: ${s.dataset.title}`);
      const box = document.createElement('div');
      box.className = 'thumb-box';
      const clone = s.cloneNode(true);
      clone.classList.add('on');
      clone.querySelectorAll('[id]').forEach((el) => el.removeAttribute('id'));
      box.appendChild(clone);
      const cap = document.createElement('span');
      cap.textContent = `${n + 1}. ${s.dataset.title}`;
      b.append(box, cap);
      b.addEventListener('click', () => { g.hidden = true; go(n); });
      g.appendChild(b);
    });
    g.hidden = false;
    requestAnimationFrame(() => {
      g.querySelectorAll('.thumb-box').forEach((box) => {
        box.firstChild.style.transform = `scale(${box.clientWidth / 1920})`;
      });
      const c = g.querySelector('.cur');
      if (c) c.focus();
    });
  }

  const toggle = (id) => { $(id).hidden = !$(id).hidden; };
  function fullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
  }

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key;
    const gridOpen = !$('grid').hidden;
    if (k === 'Escape') { ['grid', 'help', 'black'].forEach((id) => { $(id).hidden = true; }); return; }
    if (gridOpen && k !== 'g' && k !== 'G' && k !== 'п' && k !== 'П') return;
    switch (k) {
      case 'ArrowRight': case 'PageDown': case ' ': e.preventDefault(); go(cur + 1); break;
      case 'ArrowLeft': case 'PageUp': e.preventDefault(); go(cur - 1); break;
      case 'Home': go(0); break;
      case 'End': go(total - 1); break;
      default: {
        const map = { f: 'f', 'а': 'f', g: 'g', 'п': 'g', n: 'n', 'т': 'n', t: 't', 'е': 't', b: 'b', 'и': 'b', p: 'p', 'з': 'p', h: 'h', 'р': 'h' };
        const c = map[k.toLowerCase()];
        if (!c) return;
        if (c === 'f') fullscreen();
        if (c === 'g') { gridOpen ? ($('grid').hidden = true) : openGrid(); }
        if (c === 'n') toggle('notes');
        if (c === 't') toggleTimer(e.shiftKey);
        if (c === 'b') toggle('black');
        if (c === 'p') window.print();
        if (c === 'h') toggle('help');
      }
    }
  });

  /* раскрывающиеся карточки */
  deck.querySelectorAll('.card').forEach((c) => c.addEventListener('click', () => {
    c.setAttribute('aria-expanded', c.getAttribute('aria-expanded') === 'true' ? 'false' : 'true');
  }));

  $('prev').addEventListener('click', () => go(cur - 1));
  $('next').addEventListener('click', () => go(cur + 1));
  $('black').addEventListener('click', () => { $('black').hidden = true; });
  $('help').addEventListener('click', () => { $('help').hidden = true; });

  /* свайп */
  let sx = null;
  deck.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
  deck.addEventListener('touchend', (e) => {
    if (sx === null || mobile.matches) return;
    const dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50) go(cur + (dx < 0 ? 1 : -1));
    sx = null;
  });

  window.addEventListener('resize', fit);
  window.addEventListener('hashchange', () => go(fromHash(), true));
  fit();
  go(fromHash(), true);
})();
