// openclicky website behaviour. No framework, no build step.
// Patterns reverse engineered from the official Clicky site (docs/website-teardown.md): a live menu-bar
// clock, a fixed-size hero artboard scaled to the viewport, draggable faux windows that come to the
// front, videos that only play while on screen, and scroll-lit feature rows. The flying companion is
// ours: it mirrors how the app's triangle flies to whatever it is pointing at.

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- menu-bar clock ----------
const clock = document.querySelector('[data-clock]');
function tick() {
  if (!clock) return;
  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase();
  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
  clock.textContent = `${day} ${time}`;
  clock.dateTime = now.toISOString();
}
tick();
setInterval(tick, 15000);

// ---------- hero artboard scale ----------
// The hero is laid out on a 1440px board, like a design file, and scaled to fit the window.
const root = document.documentElement;
function scaleBoard() {
  const z = Math.max(window.innerWidth / 1440, 0.45);
  root.style.setProperty('--z', z.toFixed(4));
  return z;
}
let boardScale = scaleBoard();
window.addEventListener('resize', () => {
  boardScale = scaleBoard();
});

// ---------- draggable windows and stickers ----------
let topZ = 10;
for (const el of document.querySelectorAll('[data-drag]')) {
  el.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const startX = e.clientX;
    const startY = e.clientY;
    const baseX = parseFloat(getComputedStyle(el).left);
    const baseY = parseFloat(getComputedStyle(el).top);
    el.setPointerCapture(e.pointerId);
    el.classList.add('dragging');
    el.style.zIndex = String(++topZ);
    const move = (ev) => {
      // Pointer deltas are in screen pixels; the board is scaled, so convert back to board pixels.
      el.style.setProperty('--x', `${baseX + (ev.clientX - startX) / boardScale}px`);
      el.style.setProperty('--y', `${baseY + (ev.clientY - startY) / boardScale}px`);
    };
    const up = () => {
      el.classList.remove('dragging');
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  });
}

// ---------- videos only play while visible ----------
const videoObserver = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      if (isIntersecting && !reduceMotion) {
        target.preload = 'auto';
        target.play().catch(() => {});
      } else {
        target.pause();
      }
    }
  },
  { rootMargin: '100px' },
);
document.querySelectorAll('[data-lazy-video]').forEach((v) => videoObserver.observe(v));

// ---------- the flying companion ----------
const hero = document.querySelector('.hero');
const buddy = document.querySelector('[data-buddy]');
const buddyLabel = document.querySelector('[data-buddy-label]');
const TIP = 4.7; // where the triangle's tip sits inside its 30px box

/** Places the buddy so its tip lands on (x, y), in hero coordinates. */
function placeBuddy(x, y) {
  buddy.style.transform = `translate(${x - TIP}px, ${y - TIP}px)`;
}

/** The point the buddy should touch on an element: just inside its top-left area. */
function pointOn(el) {
  const h = hero.getBoundingClientRect();
  const r = el.getBoundingClientRect();
  return { x: r.left - h.left + Math.min(r.width * 0.35, 40), y: r.top - h.top + Math.min(r.height * 0.6, 26) };
}

const stops = [
  { sel: '#t-download', label: 'start here' },
  { sel: '.keycap', label: 'hold this key' },
  { sel: '#t-sound', label: 'sound settings' },
  { sel: '.w-draw .screen', label: 'yes, it draws' },
  { sel: '.sticker.mit', label: 'free, forever' },
  { sel: '.w-notes .screen', label: 'found it' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);

async function fly(from, to) {
  // Arc toward the target along a quadratic curve that bows upward, like the app's cursor.
  const ctrl = { x: (from.x + to.x) / 2, y: Math.min(from.y, to.y) - 80 - Math.abs(to.x - from.x) * 0.12 };
  const ms = Math.min(1100, 450 + Math.hypot(to.x - from.x, to.y - from.y) * 0.6);
  const t0 = performance.now();
  return new Promise((resolve) => {
    const frame = (now) => {
      const t = ease(Math.min(1, (now - t0) / ms));
      const u = 1 - t;
      placeBuddy(
        u * u * from.x + 2 * u * t * ctrl.x + t * t * to.x,
        u * u * from.y + 2 * u * t * ctrl.y + t * t * to.y,
      );
      if (t < 1) requestAnimationFrame(frame);
      else resolve();
    };
    requestAnimationFrame(frame);
  });
}

async function typeInto(el, text, perChar = 28, alive = () => true) {
  el.textContent = '';
  for (const ch of text) {
    if (!alive()) return;
    el.textContent += ch;
    await sleep(perChar);
  }
}

let heroVisible = true;
new IntersectionObserver(([e]) => {
  heroVisible = e.isIntersecting;
}).observe(hero);

function visibleStops() {
  return stops
    .map((s) => ({ ...s, el: document.querySelector(s.sel) }))
    .filter((s) => s.el && s.el.offsetParent !== null && s.el.getClientRects().length > 0);
}

async function runBuddy() {
  const first = visibleStops()[0];
  if (!first) return;
  let at = pointOn(first.el);
  if (reduceMotion) {
    placeBuddy(at.x, at.y);
    buddyLabel.textContent = first.label;
    buddyLabel.classList.add('show');
    return;
  }
  at = { x: at.x + 160, y: at.y + 120 };
  placeBuddy(at.x, at.y);
  await sleep(900);
  for (let i = 0; ; i++) {
    if (!heroVisible || document.hidden) {
      await sleep(500);
      continue;
    }
    const list = visibleStops();
    const stop = list[i % list.length];
    const to = pointOn(stop.el);
    buddyLabel.classList.remove('show');
    await fly(at, to);
    at = to;
    buddyLabel.classList.add('show');
    await typeInto(buddyLabel, stop.label);
    await sleep(1700);
  }
}
if (hero && buddy) runBuddy();

// ---------- feature rows light up as they reach the middle of the screen ----------
const rowRuns = new WeakMap();

async function playRow(row, run) {
  const ask = row.querySelector('[data-typing]');
  const reply = row.querySelector('.pill.reply');
  const streams = row.querySelectorAll('[data-stream]');
  reply?.classList.remove('show');
  streams.forEach((s) => (s.textContent = ''));
  if (ask) {
    ask.classList.add('typing');
    await typeInto(ask, ask.dataset.typing, reduceMotion ? 0 : 32, () => rowRuns.get(row) === run);
    if (rowRuns.get(row) !== run) return;
    ask.classList.remove('typing');
  }
  await sleep(reduceMotion ? 0 : 350);
  reply?.classList.add('show');
  for (const s of streams) {
    // Words arrive in a stream, the way spoken answers start before the whole reply is written.
    for (const word of s.dataset.stream.split(' ')) {
      if (rowRuns.get(row) !== run) return;
      s.textContent += (s.textContent ? ' ' : '') + word;
      await sleep(reduceMotion ? 0 : 70);
    }
  }
}

const rowObserver = new IntersectionObserver(
  (entries) => {
    for (const { target, isIntersecting } of entries) {
      target.classList.toggle('active', isIntersecting);
      if (isIntersecting) {
        const run = {};
        rowRuns.set(target, run);
        playRow(target, run);
      } else {
        rowRuns.delete(target);
      }
    }
  },
  { rootMargin: '-35% 0px -35% 0px' },
);
document.querySelectorAll('[data-row]').forEach((row) => {
  // Show the finished text until a row is first lit, so nothing is blank without JS timing.
  const ask = row.querySelector('[data-typing]');
  if (ask) ask.textContent = ask.dataset.typing;
  row.querySelectorAll('[data-stream]').forEach((s) => (s.textContent = s.dataset.stream));
  rowObserver.observe(row);
});
