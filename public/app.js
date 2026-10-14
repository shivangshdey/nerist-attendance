// Dashboard. Reads data/attendance.json (written by the sync job) and renders.

import { planDay, buckets, applyMoves, istParts, istInstant, addDays, weekStart, REMIND_BEFORE_MIN } from './lib/attendance.js';

const DATA_URL = 'data/attendance.json';
const MOVES_URL = 'api/moves';
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
let moves = {};        // classes you moved: { [id]: { from, start, end } }
let canSave = false;   // the Worker answered /api/moves, so moves can be saved

/* ------------------------------------------------------------------ plan */

/** Every class with a kind: skip / edge / go (upcoming) or went / missed / unmarked (past). */
function classify(d) {
  const now = Date.now();
  const all = applyMoves(d.schedule, moves);
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
    <polyline points="${tick(21)} ${tick(31)}" class="mr-tick"/>
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
  const meta = [next.room, next.periods > 1 ? `counts as ${next.periods}` : '', next.moved ? 'moved by you' : next.rescheduled ? 'rescheduled' : next.extra ? 'extra class' : ''].filter(Boolean);
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
  const thisWeek = weekOf === weekStart(today);
  $('#calTitle').innerHTML = `${thisWeek ? 'This week' : weekOf > weekStart(today) ? 'Next week' : 'Earlier'} <span>${dateLabel(days[0], { day: 'numeric', month: 'short' })} – ${dateLabel(days[5], { day: 'numeric', month: 'short' })}</span>`;
  if (view === 'week') renderWeek(days, inWeek, today);
  else renderDay(days, inWeek, today);
  $('#calToday').hidden = weekOf === weekStart(today) && (view === 'week' || dayOf === today);
}

/** Upcoming classes can be moved; past ones are what the portal says they were. */
const movable = (c) => canSave && c.id != null && !c.status && Date.parse(c.start) > Date.now();

function evButton(c, extra = '', style = '') {
  return `<button type="button" class="ev" data-k="${c.kind}" data-i="${c.i}"${c.moved ? ' data-moved' : ''}${movable(c) ? ' data-movable' : ''}${extra}${style ? ` style="${style}"` : ''}
    aria-label="${esc(label(c))}, ${t(c.start)} to ${t(c.end)}, ${TAG[c.kind]}${c.moved ? ', moved by you' : ''}">`;
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
  geom = { h0, h1, H, cols };

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
    return `<div class="wk-col" data-date="${d}"${d === today ? ' data-today' : ''}>${evs}</div>`;
  }).join('');
  const nowM = istParts().minutes;
  const showNow = cols.includes(today) && nowM > h0 * 60 && nowM < h1 * 60;

  const box = $('#calBody .week');
  const keep = box && shown === `${view}|${weekOf}` ? box.scrollLeft : null;
  $('#calBody').innerHTML = `<div class="week"><div class="wk" style="--cols:${cols.length}">
    <div class="wk-head"><span class="wk-tz">IST</span>${head}</div>
    <div class="wk-grid" style="height:${(h1 - h0) * H}px"><div class="wk-times">${times}</div>${rules}${colsHtml}
      ${showNow ? `<i class="now" style="top:${y(nowM)}px"><span>${istParts().time}</span></i>` : ''}</div>
  </div></div>`;
  scrollWeek(keep);
}

/**
 * Narrow screens can't fit the whole week, so open it on today (or on the first
 * day still to come) instead of Monday. A refresh of the same week keeps your scroll.
 */
let shown = null;
function scrollWeek(keep) {
  const box = $('#calBody .week');
  shown = `${view}|${weekOf}`;
  if (keep != null) { box.scrollLeft = keep; return; }
  if (box.scrollWidth <= box.clientWidth) return;
  const today = istParts().date;
  const cols = [...box.querySelectorAll('.wk-col')];
  const col = cols.find((c) => c.dataset.date >= today) || cols[0];
  const timeCol = $('.wk-times', box).offsetWidth;
  box.scrollLeft = col === cols[0] ? 0 : col.offsetLeft - timeCol;
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
  const chip = $('.chip[aria-pressed="true"]');
  const strip = chip?.parentElement;
  if (strip && (chip.offsetLeft < strip.scrollLeft || chip.offsetLeft + chip.offsetWidth > strip.scrollLeft + strip.clientWidth)) {
    strip.scrollLeft = chip.offsetLeft - (strip.clientWidth - chip.offsetWidth) / 2;
  }
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
    c.moved && ['Portal says', `${dateLabel(istParts(c.portalStart).date, { weekday: 'short', day: 'numeric' })}, ${t(c.portalStart)}`],
  ].filter(Boolean);
  const actions = movable(c)
    ? `<div class="pop-actions">${c.moved ? '<button type="button" class="btn ghost" data-act="reset">Back to portal time</button>' : ''}<button type="button" class="btn" data-act="move">Move class</button></div>`
    : '';
  return `${popTop(c)}
    <p class="pop-title">${esc(label(c))}${c.moved ? '<em>moved</em>' : c.rescheduled ? '<em>rescheduled</em>' : c.extra ? '<em>extra</em>' : ''}</p>
    <dl>${rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('')}</dl>${actions}`;
}

const popTop = (c) => `<div class="pop-head">
    <span class="ev-tag" data-k="${c.kind}">${TAG[c.kind]}</span>
    <button type="button" class="pop-x" data-act="close" aria-label="Close"><svg viewBox="0 0 16 16"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/></svg></button>
  </div>`;

/** Pick a new day and start time; the class keeps its length. */
function moveFormHtml(c) {
  const today = istParts().date;
  const date = istParts(c.start).date;
  const dates = Array.from({ length: 14 }, (_, k) => addDays(today, k))
    .filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0 || d === date);
  const mins = Math.round((Date.parse(c.end) - Date.parse(c.start)) / 60000);
  const len = mins % 60 ? `${mins} min` : `${mins / 60} hour${mins === 60 ? '' : 's'}`;
  return `${popTop(c)}
    <p class="pop-title">Move ${esc(label(c))}</p>
    <form class="mv" data-act="save">
      <label>Day
        <select name="date">${dates.map((d) => `<option value="${d}"${d === date ? ' selected' : ''}>${d === today ? 'Today' : d === addDays(today, 1) ? 'Tomorrow' : dateLabel(d, { weekday: 'short', day: 'numeric', month: 'short' })}</option>`).join('')}</select>
      </label>
      <label>Starts
        <input type="time" name="time" step="300" value="${t(c.start)}" required />
      </label>
      <p class="mv-hint">Keeps its ${len}. Changes your dashboard and reminders, not the portal.</p>
      <div class="pop-actions">
        <button type="button" class="btn ghost" data-act="back">Cancel</button>
        <button type="submit" class="btn">Move</button>
      </div>
    </form>`;
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
}

/** Swap the popover's contents, keeping it inside the calendar. */
function swapPop(html) {
  const pop = $('#pop');
  const cal = $('.cal');
  pop.innerHTML = html;
  const top = parseFloat(pop.style.top) || 0;
  pop.style.top = `${Math.max(8, Math.min(cal.offsetHeight - pop.offsetHeight - 8, top))}px`;
}

function onPopAction(e) {
  const act = e.target.closest('[data-act]')?.dataset.act;
  if (!act || !popFor) return;
  const c = list[Number(popFor.dataset.i)];
  if (act === 'close') { const b = popFor; closePop(); b.focus(); }
  else if (act === 'move') { swapPop(moveFormHtml(c)); $('#pop select').focus(); }
  else if (act === 'back') swapPop(popHtml(c));
  else if (act === 'reset') { closePop(); saveMove(c, null); }
}

function onMoveSubmit(e) {
  e.preventDefault();
  const c = list[Number(popFor?.dataset.i)];
  const f = new FormData(e.target);
  const [hh, mm] = String(f.get('time')).split(':').map(Number);
  if (!c || !Number.isFinite(hh)) return;
  const start = istInstant(String(f.get('date')), hh * 60 + mm);
  closePop();
  saveMove(c, start);
}

function closePop() {
  const pop = $('#pop');
  if (!pop || pop.hidden) return;
  pop.hidden = true;
  pop.classList.remove('in');
  popFor?.setAttribute('aria-expanded', 'false');
  popFor = null;
}

/* ------------------------------------------------------------------ moving classes */

/** Move a class to `start` (a Date), keeping its length; null puts it back at the portal's time. */
async function saveMove(c, start) {
  const from = c.portalStart || c.start;
  const len = Date.parse(c.end) - Date.parse(c.start);
  const s = start ? start.toISOString() : from;
  const body = { id: c.id, from, start: s, end: new Date(Date.parse(s) + len).toISOString() };
  if (s === c.start) return renderCal();
  const before = moves;
  moves = { ...moves };
  if (s === from) delete moves[c.id]; else moves[c.id] = { from, start: body.start, end: body.end };
  const d = istParts(s).date;
  weekOf = weekStart(d);
  dayOf = d;
  rerender();
  try {
    const res = await fetch(MOVES_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (res.status === 401) { location.reload(); return; }
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    moves = await res.json();
    rerender();
    const when = `${dateLabel(d, { weekday: 'short', day: 'numeric' })}, ${t(s)}`;
    toast(s === from ? `Back at ${when}` : `Moved to ${when}`, () => saveMove(list.find((x) => x.id === c.id) || c, new Date(c.start)));
  } catch (err) {
    console.error(err);
    moves = before;
    rerender();
    toast('Couldn’t save that move. Try again.');
  }
}

let toastTimer = null;
function toast(text, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(text)}</span>${undo ? '<button type="button" class="link">Undo</button>' : ''}`;
  el.hidden = false;
  el.classList.remove('in');
  void el.offsetWidth;
  el.classList.add('in');
  if (undo) $('button', el).addEventListener('click', () => { el.hidden = true; undo(); }, { once: true });
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

/*
 * Drag a class in the week view to a new day or time (15-minute steps).
 * Mouse: press and drag. Touch: hold for a moment, then drag, so scrolling still works.
 */
let geom = null;       // week grid layout from renderWeek
let drag = null;
let dragged = false;   // swallow the click that ends a drag

function initDrag() {
  const body = $('#calBody');
  body.addEventListener('pointerdown', (e) => {
    const ev = e.target.closest('.wk .ev[data-movable]');
    if (!ev || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const c = list[Number(ev.dataset.i)];
    const r = ev.getBoundingClientRect();
    drag = { ev, c, x: e.clientX, y: e.clientY, grabY: e.clientY - r.top, on: false, id: e.pointerId, touch: e.pointerType !== 'mouse' };
    if (drag.touch) drag.timer = setTimeout(() => startDrag(e), 380);
  });
  addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const far = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
    if (!drag.on) {
      if (drag.touch && far > 8) { clearTimeout(drag.timer); drag = null; } // it's a scroll
      else if (!drag.touch && far > 5) startDrag(e);
      return;
    }
    e.preventDefault();
    dragTo(e.clientX, e.clientY);
  });
  // Once a touch drag starts, stop the page from scrolling under the finger.
  addEventListener('touchmove', (e) => { if (drag?.on) e.preventDefault(); }, { passive: false });
  addEventListener('pointerup', (e) => endDrag(e, true));
  addEventListener('pointercancel', (e) => endDrag(e, false));
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && drag?.on) endDrag(e, false); });
  body.addEventListener('click', (e) => { if (dragged) { e.stopPropagation(); e.preventDefault(); dragged = false; } }, true);
  body.addEventListener('contextmenu', (e) => { if (drag) e.preventDefault(); });
}

function startDrag(e) {
  if (!drag || drag.on) return;
  closePop();
  drag.on = true;
  drag.ev.dataset.dragging = '';
  document.body.dataset.dragging = '';
  navigator.vibrate?.(12);
  dragTo(e.clientX, e.clientY);
}

function dragTo(x, y) {
  const { h0, h1, H } = geom;
  const colsEls = [...document.querySelectorAll('.wk-col')];
  const col = colsEls.reduce((best, el) => {
    const r = el.getBoundingClientRect();
    const dist = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
    return dist < best.dist ? { el, dist } : best;
  }, { el: colsEls[0], dist: Infinity }).el;
  const len = (Date.parse(drag.c.end) - Date.parse(drag.c.start)) / 60000;
  const top = y - col.getBoundingClientRect().top - drag.grabY;
  const mins = Math.max(h0 * 60, Math.min(h1 * 60 - len, Math.round((h0 * 60 + (top / H) * 60) / 15) * 15));
  if (drag.ev.parentElement !== col) col.append(drag.ev);
  drag.ev.style.top = `${((mins - h0 * 60) / 60) * H + 3}px`;
  drag.target = { date: col.dataset.date, mins };
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  $('.ev-time', drag.ev).textContent = `${hhmm(mins)} – ${hhmm(mins + len)}`;
}

function endDrag(e, drop) {
  if (!drag || (e.pointerId != null && e.pointerId !== drag.id)) return;
  clearTimeout(drag.timer);
  const d = drag;
  drag = null;
  if (!d.on) return;
  dragged = e.type === 'pointerup';
  setTimeout(() => { dragged = false; }, 0);
  delete document.body.dataset.dragging;
  if (drop && d.target) saveMove(d.c, istInstant(d.target.date, d.target.mins));
  else renderCal();
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
  $('#pop').addEventListener('click', onPopAction);
  $('#pop').addEventListener('submit', onMoveSubmit);
  initDrag();
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

function rerender() {
  refresh();
  renderNext();
  renderCal();
}

function render() {
  refresh();
  renderHead(data);
  renderNext();
  renderLists(data);
  renderCal();
  document.body.removeAttribute('data-loading');
}

async function loadMoves() {
  try {
    const res = await fetch(`${MOVES_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const next = await res.json();
    const changed = JSON.stringify(next) !== JSON.stringify(moves);
    moves = next;
    canSave = true;
    return changed;
  } catch {
    return false; // couldn't reach the Worker: show classes, but don't offer moving
  }
}

async function load() {
  try {
    const movesChanged = drag?.on ? false : await loadMoves();
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (res.status === 401) { location.reload(); return; } // signed out elsewhere: show the sign-in page
    const next = await res.json();
    if (!next?.courses) throw new Error('no data');
    if (data && next.updatedAt === data.updatedAt) {
      renderSync(data.updatedAt);
      if (movesChanged && !popFor) rerender();
      return;
    }
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
  if (!data || popFor || drag?.on) return;
  renderSync(data.updatedAt);
  refresh();
  renderNext();
  renderCal();
}, 60_000);
if (reduceMotion.matches) document.documentElement.dataset.reduce = '';
