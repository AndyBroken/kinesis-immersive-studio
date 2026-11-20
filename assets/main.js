/* Kinesis — immersive studio concept
   Scroll drives a camera along a spline through a WebGL world.
   UI (chapters, rail, cursor, forms) works even without WebGL. */

const params = new URLSearchParams(location.search);
const SHOT = params.has('shot');
const isCoarse = matchMedia('(pointer: coarse)').matches;
const isNarrow = () => innerWidth < 760;
const MOBILE = isCoarse || innerWidth < 760;
const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a)); return t * t * (3 - 2 * t); };

/* ---------------- Projects ---------------- */
const PROJECTS = [
  { id: 'ember', title: 'Ember Coffee Co.', type: 'Landing page', tier: 'Basic', url: 'https://andybroken.github.io/ember-coffee-landing/' },
  { id: 'northbound', title: 'Northbound Roasters', type: 'Multi-page business site', tier: 'Standard', url: 'https://andybroken.github.io/northbound-roasters/' },
  { id: 'obsidian', title: 'Obsidian Coffee', type: 'E-commerce store', tier: 'Premium', url: 'https://andybroken.github.io/obsidian-coffee-store/' },
  { id: 'fernleaf', title: 'Fernleaf Cleaning', type: 'Service landing page', tier: 'Basic', url: 'https://andybroken.github.io/fernleaf-cleaning/' },
  { id: 'ironside', title: 'Ironside HVAC & Plumbing', type: 'Local services site', tier: 'Standard', url: 'https://andybroken.github.io/ironside-hvac-plumbing/' },
  { id: 'lumen', title: 'Lumen Dental Studio', type: 'Clinic site + booking', tier: 'Premium', url: 'https://andybroken.github.io/lumen-dental-studio/' },
];

/* ---------------- DOM refs ---------------- */
const flightEl = document.getElementById('flight');
const loader = document.getElementById('loader');
const loaderBar = document.getElementById('loaderBar');
const loaderPct = document.getElementById('loaderPct');
const hint = document.getElementById('hint');
const readout = document.getElementById('readout');
const rail = document.getElementById('rail');
const cursorEl = document.getElementById('cursor');
const cursorText = document.getElementById('cursorText');

const state = {
  p: 0, pTarget: 0, vel: 0, post: 0, postT: 0,
  mx: 0, my: 0, smx: 0, smy: 0,
  cx: innerWidth / 2, cy: innerHeight / 2,
  hoverScreen: null,
};

const flightMax = () => Math.max(1, flightEl.offsetHeight - innerHeight);
const scrollToP = (p) => window.scrollTo({ top: p * flightMax(), behavior: REDUCED ? 'auto' : 'smooth' });

/* ---------------- Chapters ---------------- */
const chapters = [...document.querySelectorAll('.chapter')].map((el) => ({
  el,
  from: parseFloat(el.dataset.from),
  to: parseFloat(el.dataset.to),
  name: el.dataset.name,
  last: el.hasAttribute('data-last'),
  active: false,
  o: -1,
}));

chapters.forEach((c, i) => {
  const b = document.createElement('button');
  b.type = 'button';
  b.setAttribute('aria-label', `Go to ${c.name}`);
  b.innerHTML = `<span>${String(i).padStart(2, '0')} ${c.name}</span>`;
  const target = c.from < 0 ? 0 : c.to > 1 ? 1 : (c.from + c.to) / 2;
  b.addEventListener('click', () => scrollToP(target));
  rail.appendChild(b);
  c.dot = b;
});

/* text scramble for eyebrows */
const GLYPHS = '!<>-_\\/[]{}—=+*^?#ABCDEFXYZ0123456789';
function scramble(el) {
  if (REDUCED || SHOT) return;
  const final = el.dataset.text || (el.dataset.text = el.textContent);
  let frame = 0;
  const total = 26;
  cancelAnimationFrame(el._raf);
  const tick = () => {
    frame++;
    const reveal = Math.floor((frame / total) * final.length);
    let out = '';
    for (let i = 0; i < final.length; i++) {
      out += i < reveal || final[i] === ' ' ? final[i] : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }
    el.textContent = out;
    if (frame < total) el._raf = requestAnimationFrame(tick);
    else el.textContent = final;
  };
  tick();
}

function updateChapters() {
  const p = state.p;
  const postFade = 1 - clamp(state.post / (innerHeight * 0.55));
  let current = null;
  for (const c of chapters) {
    const fin = c.from < 0 ? 1 : smooth(c.from, c.from + 0.03, p);
    const fout = c.to > 1 ? 1 : 1 - smooth(c.to - 0.03, c.to, p);
    let o = fin * fout;
    if (c.last) o *= postFade;
    if (Math.abs(o - c.o) > 0.002) {
      c.o = o;
      const y = (1 - fin) * 60 - (1 - fout) * 60 - (c.last ? (1 - postFade) * 80 : 0);
      const s = c.el.style;
      s.opacity = o.toFixed(3);
      s.setProperty('--y', `${y.toFixed(1)}px`);
      const blur = (1 - o) * 10;
      s.filter = blur > 0.3 ? `blur(${blur.toFixed(1)}px)` : '';
      s.visibility = o < 0.01 ? 'hidden' : 'visible';
    }
    const isActive = o > 0.55;
    if (isActive && !c.active) c.el.querySelectorAll('.scramble').forEach(scramble);
    c.active = isActive;
    if (o > 0.3) current = c;
  }
  for (const c of chapters) c.dot.classList.toggle('on', c === current);
  rail.style.opacity = postFade;
  hint.style.opacity = p > 0.015 ? 0 : 1;
  readout.style.opacity = postFade;
}

/* ---------------- Scroll & pointer ---------------- */
function readScroll() {
  const max = flightMax();
  state.pTarget = clamp(scrollY / max);
  state.post = Math.max(0, scrollY - max);
  const rest = Math.max(1, document.documentElement.scrollHeight - innerHeight - max);
  state.postT = clamp(state.post / rest);
}
addEventListener('scroll', readScroll, { passive: true });
addEventListener('resize', readScroll);
readScroll();

addEventListener('pointermove', (e) => {
  state.mx = (e.clientX / innerWidth) * 2 - 1;
  state.my = (e.clientY / innerHeight) * 2 - 1;
  state.cx = e.clientX; state.cy = e.clientY;
}, { passive: true });

document.querySelectorAll('[data-goto]').forEach((a) => {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToP(parseFloat(a.dataset.goto));
  });
});

/* ---------------- Project grid ---------------- */
const grid = document.getElementById('projectGrid');
grid.innerHTML = PROJECTS.map((p, i) => `
  <a class="card tilt reveal" href="${p.url}" target="_blank" rel="noopener" data-cursor="Open ↗" style="transition-delay:${(i % 3) * 80}ms">
    <div class="card-img"><img src="assets/work/${p.id}.jpg" alt="${p.title} — ${p.type} demo website" loading="lazy" width="1024" height="768"></div>
    <div class="card-body">
      <div><h3>${p.title}</h3><p>${p.type}</p></div>
      <span class="card-tag">${p.tier}</span>
    </div>
  </a>`).join('');

/* reveal on scroll */
document.querySelectorAll('.block-head, .plan, .contact').forEach((el) => el.classList.add('reveal'));
const io = new IntersectionObserver((entries) => {
  for (const en of entries) if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
}, { threshold: 0.12 });
document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

/* tilt cards */
if (!isCoarse) {
  document.querySelectorAll('.tilt').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
      el.style.setProperty('--ry', `${(x - 0.5) * 10}deg`);
      el.style.setProperty('--rx', `${(0.5 - y) * 8}deg`);
      el.style.setProperty('--gx', `${x * 100}%`);
      el.style.setProperty('--gy', `${y * 100}%`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); });
  });

  /* magnetic buttons */
  document.querySelectorAll('.magnetic').forEach((el) => {
    el.addEventListener('pointermove', (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty('--bx', `${(e.clientX - r.left - r.width / 2) * 0.25}px`);
      el.style.setProperty('--by', `${(e.clientY - r.top - r.height / 2) * 0.35}px`);
    });
    el.addEventListener('pointerleave', () => { el.style.setProperty('--bx', '0px'); el.style.setProperty('--by', '0px'); });
  });
}

/* ---------------- Cursor ---------------- */
const cursor = { x: innerWidth / 2, y: innerHeight / 2, rx: innerWidth / 2, ry: innerHeight / 2 };
const dot = cursorEl.querySelector('.cursor-dot');
const ring = cursorEl.querySelector('.cursor-ring');
if (!isCoarse && !SHOT) document.documentElement.classList.add('has-cursor');
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('a, button, input, select, textarea, label, [data-cursor]');
  const label = t && t.dataset ? t.dataset.cursor : null;
  cursorEl.classList.toggle('hover', !!t && !label);
  cursorEl.classList.toggle('text', !!label);
  cursorText.textContent = label || '';
});
function updateCursor(dt) {
  cursor.rx = lerp(cursor.rx, state.cx, 1 - Math.exp(-dt * 14));
  cursor.ry = lerp(cursor.ry, state.cy, 1 - Math.exp(-dt * 14));
  dot.style.transform = `translate3d(${state.cx}px,${state.cy}px,0)`;
  ring.style.transform = `translate3d(${cursor.rx}px,${cursor.ry}px,0)`;
}
let screenCursor = false;
function setScreenCursor(on) {
  if (on === screenCursor) return;
  screenCursor = on;
  const overUI = document.querySelector('.cursor.hover');
  if (overUI && on) return;
  cursorEl.classList.toggle('text', on);
  cursorText.textContent = on ? 'Live demo ↗' : '';
}

/* ---------------- Contact form ---------------- */
const form = document.getElementById('contactForm');
const note = document.getElementById('formNote');
const planSelect = document.getElementById('planSelect');
document.querySelectorAll('[data-plan]').forEach((a) => a.addEventListener('click', () => { planSelect.value = a.dataset.plan; }));
form.addEventListener('submit', (e) => {
  e.preventDefault();
  let ok = true;
  form.querySelectorAll('[required]').forEach((f) => {
    const bad = !f.value.trim() || (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.value));
    f.classList.toggle('invalid', bad);
    if (bad) ok = false;
  });
  if (!ok) { note.style.color = '#ff8aa0'; note.textContent = 'Please fill in your name, a valid email and project details.'; return; }
  note.style.color = '';
  const name = form.name.value.trim().split(' ')[0];
  note.textContent = `Thanks, ${name}! This is a concept demo — no message was actually sent.`;
  form.reset();
});
form.addEventListener('input', (e) => e.target.classList.remove('invalid'));

/* ---------------- Loader ---------------- */
let loaderDone = false;
function setLoad(v) {
  const pct = Math.round(v * 100);
  loaderBar.style.width = pct + '%';
  loaderPct.textContent = pct;
}
function finishLoader() {
  if (loaderDone) return;
  loaderDone = true;
  setLoad(1);
  setTimeout(() => loader.classList.add('done'), SHOT ? 0 : 350);
  chapters[0].el.querySelectorAll('.scramble').forEach(scramble);
}
if (SHOT) loader.style.transition = 'none';
setTimeout(finishLoader, 9000);

/* initial position via ?p=0.5 */
if (params.has('p')) {
  history.scrollRestoration = 'manual';
  requestAnimationFrame(() => { window.scrollTo(0, parseFloat(params.get('p')) * flightMax()); readScroll(); state.p = state.pTarget; });
}

/* ---------------- 3D world ---------------- */
let world = null;
try {
  const c = document.createElement('canvas');
  const gl = c.getContext('webgl2') || c.getContext('webgl');
  if (!gl) throw new Error('no webgl');
  const mod = await import('./world.js');
  world = await mod.createWorld({
    canvas: document.getElementById('scene'),
    labels: document.getElementById('labels'),
    projects: PROJECTS,
    mobile: MOBILE,
    reduced: REDUCED,
    onProgress: (v) => setLoad(v * 0.95),
    onReady: finishLoader,
  });
} catch (err) {
  console.warn('WebGL disabled:', err);
  document.documentElement.classList.add('no-webgl');
  finishLoader();
}

/* click on floating screens */
addEventListener('click', (e) => {
  if (!world) return;
  if (e.target.closest('a, button, input, select, textarea, label, form, .content')) return;
  const hit = world.pick(e.clientX, e.clientY);
  if (hit) window.open(hit.url, '_blank', 'noopener');
});

/* ---------------- Loop ---------------- */
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  const prev = state.p;
  const k = REDUCED ? 12 : 3.2;
  state.p = lerp(state.p, state.pTarget, 1 - Math.exp(-dt * k));
  if (Math.abs(state.p - state.pTarget) < 1e-5) state.p = state.pTarget;
  const v = dt > 0 ? (state.p - prev) / dt : 0;
  state.vel = lerp(state.vel, v, 1 - Math.exp(-dt * 6));
  state.smx = lerp(state.smx, state.mx, 1 - Math.exp(-dt * 3));
  state.smy = lerp(state.smy, state.my, 1 - Math.exp(-dt * 3));

  updateChapters();
  if (!isCoarse) updateCursor(dt);

  if (world) {
    const info = world.update(dt, state);
    if (info) {
      readout.textContent = `X ${info.x.toFixed(1)} · Y ${info.y.toFixed(1)} · Z ${info.z.toFixed(1)} — ${String(Math.round(state.p * 100)).padStart(3, '0')}%`;
      if (!isCoarse) {
        const h = (state.p > 0.45 && state.p < 0.8 && state.post === 0) ? world.pick(state.cx, state.cy) : null;
        world.setHover(h);
        setScreenCursor(!!h);
      }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
