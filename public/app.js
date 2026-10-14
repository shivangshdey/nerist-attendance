// Dashboard. Reads data/attendance.json (written by the sync job) and renders.

import { planDay, buckets, istParts, addDays, weekStart, REMIND_BEFORE_MIN } from './lib/attendance.js';

const DATA_URL = 'data/attendance.json';
const $ = (s, r = document) => r.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const pct1 = (p) => `${(p * 100).toFixed(1)}%`;
const short = (name) => name.replace(/\band\b/g, '&');
const label = (c) => `${short(c.name)}${c.type === 'practical' ? ' lab' : ''}`;
const kindWord = (type) => (type === 'practical' ? 'lab' : 'theory');
const minsOf = (iso) => istParts(iso).minutes;
const t = (iso) => istParts(iso).time;
const dateLabel = (d, o) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { timeZone: 'UTC', ...o });
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

let data = null;
let list = [];         // every class this week + next, classified
let bucketMap = new Map();
let view = null;       // 'day' | 'week'
let weekOf = null;     // Monday (IST date) shown in the calendar
let dayOf = null;      // date shown in day view

/* ------------------------------------------------------------------ plan */

/** Every class with a kind: skip / edge / go (upcoming) or went / missed / unmarked (past). */
function classify(d) {
  const now = Date.now();
  const all = (d.schedule || []).slice().sort((a, b) => a.start.localeCompare(b.start));
  const ahead = all.filter((c) => !c.status && Date.parse(c.end || c.start) > now);
  const planned = new Map(planDay(ahead, d.courses, d.threshold).map((c) => [c.start + c.code + c.type, c]));
  return all.map((c, i) => {
    const p = planned.get(c.start + c.code + c.type);
    const base = p ? { ...p, kind: p.verdict === 'skip' ? 'skip' : p.below ? 'go' : 'edge', live: Date.parse(c.start) <= now }
      : { ...c, kind: c.status === 'present' ? 'went' : c.status === 'absent' ? 'missed' : 'unmarked' };
    return { ...base, i };
  });
}
const TAG = { skip: 'bunk ok', edge: 'no buffer', go: 'go', went: 'went', missed: 'missed', unmarked: 'not marked' };
const upcomingKinds = new Set(['skip', 'edge', 'go']);

function countdown(iso) {
  const m = Math.round((Date.parse(iso) - Date.now()) / 60000);
  if (m <= 0) return 'now';
  if (m < 60) return `in ${m}m`;
  if (m < 24 * 60) return `in ${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m` : ''}`.trim();
  const d = Math.round(m / 1440);
  return `in ${d} day${d === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ header */

function renderHead(d) {
  const low = buckets(d.courses, d.threshold).filter((b) => !b.safe).length;
  const today = dateLabel(istParts().date, { weekday: 'short', day: 'numeric', month: 'short' });
  $('#sub').textContent = `${today} · ${low ? `${low} ${low === 1 ? 'subject' : 'subjects'} under 75%` : 'everything above 75%'}`;
  const g = d.groups || {};
  const stat = (k, b) => (b?.total ? `<div><dt>${k} overall</dt><dd>${(b.pct * 100).toFixed(1)}<small>%</small></dd></div>` : '');
  $('#stats').innerHTML = stat('Theory', g.theory) + stat('Practical', g.practical);
  const n = (d.student?.name || '').split(/\s+/).filter(Boolean);
  $('#avatar').textContent = n.slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '·';
  $('#avatar').title = d.student?.name || '';
  $('#previewNote').hidden = !d.preview;
  renderSync(d.updatedAt);
}

function renderSync(updatedAt) {
  const mins = Math.round((Date.now() - Date.parse(updatedAt)) / 60000);
  const ago = mins < 1 ? 'just now' : mins < 60 ? `${mins}m ago` : mins < 1440 ? `${Math.round(mins / 60)}h ago` : `${Math.round(mins / 1440)}d ago`;
  $('#sync').dataset.state = mins > 26 * 60 ? 'stale' : 'ok';
  $('#syncText').textContent = `synced ${ago}`;
}

/* ------------------------------------------------------------------ up next */

/** Small ring: where this subject is now, with the 75% mark. */
function ring(pct, size = 64) {
  const r = 26, c = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  const a = 0.75 * 2 * Math.PI - Math.PI / 2;
  const tick = (rad) => `${32 + rad * Math.cos(a)},${32 + rad * Math.sin(a)}`;
  return `<svg class="mini-ring" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <circle cx="32" cy="32" r="${r}" class="mr-track"/>
    <circle cx="32" cy="32" r="${r}" class="mr-bar${p < 0.75 ? ' low' : ''}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p)}" transform="rotate(-90 32 32)"/>
    <polyline points="${tick(19)} ${tick(33)}" class="mr-tick"/>
  </svg>`;
}

function renderNext() {
  const el = $('#next');
  const next = list.find((c) => upcomingKinds.has(c.kind));
  if (!next) {
    el.innerHTML = `<div class="next-top"><span class="next-label" id="nextTitle">Up next</span></div>
      <p class="next-empty">No classes on the portal yet.</p>`;
    return;
  }
  const date = istParts(next.start).date;
  const today = istParts().date;
  const when = date === today ? 'Today' : date === addDays(today, 1) ? 'Tomorrow' : dateLabel(date, { weekday: 'short', day: 'numeric' });
  const word = next.kind === 'skip' ? 'Bunk it' : 'Go';
  const why = next.kind === 'edge' ? 'no buffer' : next.kind === 'go' ? 'under 75%' : `${next.skipsLeft} left after`;
  const meta = [next.room, next.periods > 1 ? `counts as ${next.periods}` : '', next.rescheduled ? 'rescheduled' : next.extra ? 'extra class' : ''].filter(Boolean);
  const remind = new Date(Date.parse(next.start) - REMIND_BEFORE_MIN * 60000).toISOString();
  el.innerHTML = `
    <div class="next-top">
      <span class="next-label" id="nextTitle">Up next</span>
      <span class="next-when">${next.live ? 'Happening now' : `${when} · ${t(next.start)}`}</span>
    </div>
    <div class="next-main">
      <div class="next-text">
        <h2 class="next-name">${esc(label(next))}</h2>
        <p class="next-meta">${meta.map(esc).join(' · ') || '&nbsp;'}</p>
      </div>
      <div class="next-ring" title="${kindWord(next.type)} now ${pct1(next.nowPct)}">${ring(next.nowPct)}<span>${Math.round(next.nowPct * 100)}</span></div>
    </div>
    <div class="verdict" data-v="${next.kind}">
      <span class="verdict-word">${word}</span>
      <span class="verdict-nums">${why}<br />skip <b>${pct1(next.ifSkip)}</b> · go <b>${pct1(next.ifAttend)}</b></span>
    </div>
    <p class="next-foot"><span>${next.live ? 'started' : countdown(next.start)}</span>${next.live || Date.parse(remind) < Date.now() ? '' : `<span>ping at ${t(remind)}</span>`}</p>`;
}

/* ------------------------------------------------------------------ lists */

function bar(pct) {
  return `<span class="mini-bar" aria-hidden="true"><i style="--p:${Math.min(1, pct)}"></i><b></b></span>`;
}

function renderLists(d) {
  const all = buckets(d.courses, d.threshold);
  const low = all.filter((b) => !b.safe);
  const ok = all.filter((b) => b.safe).sort((a, b) => b.canSkip - a.canSkip || a.pct - b.pct);
  const count = $('#lowCount');
  count.textContent = low.length;
  if (low.length) delete count.dataset.zero; else count.dataset.zero = '';

  $('#lowList').innerHTML = low.map((b) => `<li>
      <span class="ring" aria-hidden="true"></span>
      <span class="li-main">
        <span class="li-name">${esc(short(b.name))}</span>
        <span class="li-sub">${kindWord(b.type)} · ${b.attended}/${b.total} · ${pct1(b.pct)}</span>
        ${bar(b.pct)}
      </span>
      <span class="val" data-s="need">need ${b.mustAttend}</span>
    </li>`).join('') || '<li class="empty">Nothing under 75%. Nice.</li>';

  $('#budgetList').innerHTML = ok.map((b) => {
    const dots = b.canSkip
      ? `<span class="dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(b.canSkip, 5))}${b.canSkip > 5 ? '<em>+</em>' : ''}</span>`
      : '<span class="dots none" aria-hidden="true"></span>';
    return `<li>
      <span class="ring" data-s="${b.canSkip ? 'good' : 'edge'}" aria-hidden="true"></span>
      <span class="li-main">
        <span class="li-name">${esc(short(b.name))}</span>
        <span class="li-sub">${kindWord(b.type)} · ${b.attended}/${b.total} · ${pct1(b.pct)}</span>
      </span>
      <span class="budget-val" aria-label="${b.canSkip} bunks left">${dots}<b>${b.canSkip}</b></span>
    </li>`;
  }).join('') || '<li class="empty">No bunks anywhere yet.</li>';
}

/* ------------------------------------------------------------------ calendar */

function weeksAvailable() {
  const thisWeek = weekStart(istParts().date);
  return [...new Set([thisWeek, ...list.map((c) => weekStart(istParts(c.start).date))])].sort();
}

function renderCal() {
  closePop();
  const weeks = weeksAvailable();
  if (!weeks.includes(weekOf)) weekOf = weekStart(istParts().date);
  const i = weeks.indexOf(weekOf);
  $('#calPrev').disabled = i <= 0;
  $('#calNext').disabled = i >= weeks.length - 1;
  const days = Array.from({ length: 6 }, (_, k) => addDays(weekOf, k));
  const inWeek = list.filter((c) => days.includes(istParts(c.start).date));
  const today = istParts().date;
  $('#calToday').hidden = weekOf === weekStart(today) && (view === 'week' || dayOf === today);
  const thisWeek = weekOf === weekStart(today);
  $('#calTitle').innerHTML = `${thisWeek ? 'This week' : weekOf > weekStart(today) ? 'Next week' : 'Earlier'} <span>${dateLabel(days[0], { day: 'numeric', month: 'short' })} – ${dateLabel(days[5], { day: 'numeric', month: 'short' })}</span>`;
  if (view === 'week') renderWeek(days, inWeek, today);
  else renderDay(days, inWeek, today);
}

function evButton(c, extra = '', style = '') {
  return `<button type="button" class="ev" data-k="${c.kind}" data-i="${c.i}"${extra}${style ? ` style="${style}"` : ''}
    aria-label="${esc(label(c))}, ${t(c.start)} to ${t(c.end)}, ${TAG[c.kind]}">`;
}

function renderWeek(days, items, today) {
  const hasSat = items.some((c) => istParts(c.start).date === days[5]);
  const cols = hasSat ? days : days.slice(0, 5);
  const starts = items.map((c) => minsOf(c.start));
  const ends = items.map((c) => minsOf(c.end || c.start) || minsOf(c.start) + 60);
  const h0 = Math.min(9, ...starts.map((m) => Math.floor(m / 60)));
  const h1 = Math.max(17, ...ends.map((m) => Math.ceil(m / 60)));
  const H = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hour')) || 74;
  const y = (m) => ((m - h0 * 60) / 60) * H;

  const head = cols.map((d) => `<div class="wk-day"${d === today ? ' data-today' : ''}>
      <b>${dateLabel(d, { day: '2-digit' })}</b><span>${dateLabel(d, { weekday: 'short' })}</span></div>`).join('');
  const times = Array.from({ length: h1 - h0 - 1 }, (_, k) => h0 + k + 1)
    .map((h) => `<span style="top:${(h - h0) * H}px">${h <= 12 ? h : h - 12} ${h < 12 ? 'am' : 'pm'}</span>`).join('');
  const rules = Array.from({ length: h1 - h0 - 1 }, (_, k) => `<i class="wk-rule" style="top:${(k + 1) * H}px"></i>`).join('');
  const colsHtml = cols.map((d) => {
    const evs = items.filter((c) => istParts(c.start).date === d).map((c) => {
      const s = minsOf(c.start);
      const e = Math.max(s + 45, minsOf(c.end || c.start) || s + 60);
      const h = y(e) - y(s) - 6;
      return `${evButton(c, h < 64 ? ' data-short' : '', `top:${y(s) + 3}px;height:${h}px`)}
        <span class="ev-name">${esc(short(c.name))}</span>
        <span class="ev-time">${t(c.start)} – ${t(c.end)}</span>
        <span class="ev-tag">${c.type === 'practical' ? 'lab · ' : ''}${c.live ? 'now · ' : ''}${TAG[c.kind]}</span>
      </button>`;
    }).join('');
    return `<div class="wk-col"${d === today ? ' data-today' : ''}>${evs}</div>`;
  }).join('');
  const nowM = istParts().minutes;
  const showNow = cols.includes(today) && nowM > h0 * 60 && nowM < h1 * 60;

  $('#calBody').innerHTML = `<div class="week"><div class="wk" style="--cols:${cols.length}">
    <div class="wk-head"><span class="wk-tz">IST</span>${head}</div>
    <div class="wk-grid" style="height:${(h1 - h0) * H}px"><div class="wk-times">${times}</div>${rules}${colsHtml}
      ${showNow ? `<i class="now" style="top:${y(nowM)}px"><span>${istParts().time}</span></i>` : ''}</div>
  </div></div>`;
}

function renderDay(days, items, today) {
  if (!days.includes(dayOf)) dayOf = days.includes(today) ? today : days.find((d) => items.some((c) => istParts(c.start).date === d)) || days[0];
  const chips = days.map((d) => {
    const n = items.filter((c) => istParts(c.start).date === d).length;
    return `<button type="button" class="chip" data-date="${d}" aria-pressed="${d === dayOf}"${d === today ? ' data-today' : ''}>
      <b>${dateLabel(d, { day: '2-digit' })}</b><span>${d === today ? 'Today' : dateLabel(d, { weekday: 'short' })}</span>${n ? `<i>${n}</i>` : ''}</button>`;
  }).join('');
  const rows = items.filter((c) => istParts(c.start).date === dayOf).map((c) => `
    ${evButton(c)}
      <span class="ev-start">${t(c.start)}</span>
      <span class="ev-name">${esc(label(c))}</span>
      <span class="ev-time">${upcomingKinds.has(c.kind) ? `skip ${pct1(c.ifSkip)} · go ${pct1(c.ifAttend)}` : `${t(c.start)} – ${t(c.end)}`}${c.room ? ` · ${esc(c.room)}` : ''}</span>
      <span class="ev-tag">${c.live ? 'now · ' : ''}${TAG[c.kind]}</span>
    </button>`).join('');
  $('#calBody').innerHTML = `<div class="day"><div class="chips">${chips}</div>
    <div class="dl">${rows || '<p class="empty">No classes.</p>'}</div></div>`;
}

/* ------------------------------------------------------------------ class popover */

let popFor = null;

function popHtml(c) {
  const b = bucketMap.get(`${c.code}|${c.type}`);
  const date = istParts(c.start).date;
  const rows = [
    ['When', `${dateLabel(date, { weekday: 'short', day: 'numeric', month: 'short' })}, ${t(c.start)} – ${t(c.end)}`],
    c.room && ['Room', esc(c.room)],
    c.faculty && ['Faculty', esc(c.faculty)],
    c.periods > 1 && ['Counts as', `${c.periods} classes`],
    b && ['Subject now', `${b.attended}/${b.total} · ${pct1(b.pct)}`],
    upcomingKinds.has(c.kind) && ['If you skip', `<b>${pct1(c.ifSkip)}</b>`],
    upcomingKinds.has(c.kind) && ['If you go', `<b>${pct1(c.ifAttend)}</b>`],
  ].filter(Boolean);
  return `<div class="pop-head">
      <span class="ev-tag" data-k="${c.kind}">${TAG[c.kind]}</span>
      <button type="button" class="pop-x" aria-label="Close"><svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></button>
    </div>
    <p class="pop-title">${esc(label(c))}${c.rescheduled ? '<em>rescheduled</em>' : c.extra ? '<em>extra</em>' : ''}</p>
    <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>`;
}

function openPop(btn) {
  const c = list[Number(btn.dataset.i)];
  if (!c) return;
  const pop = $('#pop');
  const cal = $('.cal');
  if (popFor === btn && !pop.hidden) return closePop();
  popFor = btn;
  pop.innerHTML = popHtml(c);
  pop.hidden = false;
  const cr = cal.getBoundingClientRect();
  const br = btn.getBoundingClientRect();
  const pw = pop.offsetWidth, ph = pop.offsetHeight;
  const roomRight = cr.right - br.right;
  let left, top, origin;
  if (roomRight >= pw + 12) { left = br.right - cr.left + 8; origin = 'left'; }
  else if (br.left - cr.left >= pw + 12) { left = br.left - cr.left - pw - 8; origin = 'right'; }
  else { left = Math.max(8, Math.min(cr.width - pw - 8, br.left - cr.left + br.width / 2 - pw / 2)); origin = 'center'; }
  top = br.top - cr.top;
  if (origin === 'center') {
    // phones: below the class if it fits, otherwise above it, never on top of it
    top = br.bottom - cr.top + 8;
    if (top + ph > cal.offsetHeight - 8) top = br.top - cr.top - ph - 8;
  }
  if (origin !== 'center') top = Math.max(8, Math.min(cal.offsetHeight - ph - 8, top));
  pop.style.left = `${left}px`;
  pop.style.top = `${top}px`;
  pop.style.transformOrigin = origin === 'left' ? 'left top' : origin === 'right' ? 'right top' : 'center top';
  pop.classList.remove('in');
  void pop.offsetWidth;
  pop.classList.add('in');
  btn.setAttribute('aria-expanded', 'true');
  $('.pop-x', pop).addEventListener('click', () => { closePop(); btn.focus(); });
}

function closePop() {
  const pop = $('#pop');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  pop.classList.remove('in');
  popFor?.setAttribute('aria-expanded', 'false');
  popFor = null;
}

/* ------------------------------------------------------------------ controls */

function setView(v, save = true) {
  view = v;
  document.querySelectorAll('#views button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.view === v)));
  if (save) try { localStorage.setItem('att.view', v); } catch { /* storage blocked */ }
  if (data) renderCal();
}

function initControls() {
  let saved = null;
  try { saved = localStorage.getItem('att.view'); } catch { /* storage blocked */ }
  setView(saved === 'day' || saved === 'week' ? saved : matchMedia('(max-width: 760px)').matches ? 'day' : 'week', false);
  $('#views').addEventListener('click', (e) => { const b = e.target.closest('[data-view]'); if (b) setView(b.dataset.view); });
  const step = (n) => {
    const weeks = weeksAvailable();
    weekOf = weeks[Math.max(0, Math.min(weeks.length - 1, weeks.indexOf(weekOf) + n))];
    dayOf = null;
    renderCal();
  };
  $('#calPrev').addEventListener('click', () => data && step(-1));
  $('#calNext').addEventListener('click', () => data && step(1));
  $('#calToday').addEventListener('click', () => {
    weekOf = weekStart(istParts().date);
    dayOf = istParts().date;
    if (data) renderCal();
  });
  $('#calBody').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) { dayOf = chip.dataset.date; renderCal(); return; }
    const ev = e.target.closest('.ev');
    if (ev) openPop(ev);
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && popFor) { const b = popFor; closePop(); b.focus(); } });
  document.addEventListener('pointerdown', (e) => {
    if (!popFor || e.target.closest('#pop') || e.target.closest('.ev')) return;
    closePop();
  });
  addEventListener('resize', closePop);
  $('#calBody').addEventListener('scroll', closePop, true);
}

/* ------------------------------------------------------------------ boot */

function refresh() {
  list = classify(data);
  bucketMap = new Map(buckets(data.courses, data.threshold).map((b) => [`${b.code}|${b.type}`, b]));
}

function render() {
  refresh();
  renderHead(data);
  renderNext();
  renderLists(data);
  renderCal();
  document.body.removeAttribute('data-loading');
}

async function load() {
  try {
    const embedded = document.getElementById('embedded-data');
    const next = embedded ? JSON.parse(embedded.textContent) : await (await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' })).json();
    if (!next?.courses) throw new Error('no data');
    if (data && next.updatedAt === data.updatedAt) { renderSync(data.updatedAt); return; }
    data = next;
    render();
  } catch (err) {
    console.error(err);
    document.body.removeAttribute('data-loading');
    $('#sync').dataset.state = 'error';
    $('#syncText').textContent = 'no data yet';
    if (!data) $('#next').innerHTML = '<span class="next-label">Not synced yet</span><p class="next-empty">Run “Sync attendance” in GitHub Actions, then refresh.</p>';
  }
}

weekOf = weekStart(istParts().date);
initControls();
load();
setInterval(() => document.visibilityState === 'visible' && load(), 5 * 60 * 1000);
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && load());
// keep "now", countdowns and verdicts current without a reload; never while a popover is open
setInterval(() => {
  if (!data || popFor) return;
  renderSync(data.updatedAt);
  refresh();
  renderNext();
  renderCal();
}, 60_000);
if (reduceMotion.matches) document.documentElement.dataset.reduce = '';
