// Class reminders, 10 minutes before each class, via ntfy's scheduled delivery.
// The schedule is the portal's own lecture plan, so rescheduled and extra classes
// are picked up automatically. Every sync keeps ntfy in step:
//  - a new or changed verdict replaces the pending reminder (same sequence_id)
//  - a class the portal moved or cancelled has its pending reminder deleted
// So the reminder you get always reflects the latest numbers and timetable.

import { reminderId, reminderAt, REMIND_BEFORE_MIN } from './attendance.mjs';

const pct = (p) => `${(p * 100).toFixed(1)}%`;

const istTime = (iso) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(11, 16);

export function reminderText(o) {
  const what = o.type === 'practical' ? `${o.name} lab` : o.name;
  const at = `${what} · ${istTime(o.start)}${o.room ? ` · ${o.room}` : ''}`;
  const moved = o.rescheduled ? ' (moved)' : o.extra ? ' (extra)' : '';
  const counts = o.periods > 1 ? ` · counts as ${o.periods}` : '';
  if (o.verdict === 'skip') {
    return {
      title: `Bunk OK · ${at}${moved}`,
      message: `skip → ${pct(o.ifSkip)} · ${o.skipsLeft ? `${o.skipsLeft} left after` : 'last bunk'}${counts}`,
      priority: 3,
      tags: ['sleeping'],
    };
  }
  if (o.below) {
    return {
      title: `Go to class · ${at}${moved}`,
      message: `under 75% (${pct(o.nowPct)}) · go → ${pct(o.ifAttend)}${o.mustLeft ? ` · ${o.mustLeft} more after` : ''}${counts}`,
      priority: 4,
      tags: ['rotating_light'],
    };
  }
  return {
    title: `Don't bunk · ${at}${moved}`,
    message: `no buffer · skip → ${pct(o.ifSkip)} · go → ${pct(o.ifAttend)}${counts}`,
    priority: 4,
    tags: ['warning'],
  };
}

const hash = (obj) => {
  const s = JSON.stringify(obj);
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * plan:     planned upcoming occurrences (from planDay(upcoming(...)))
 * previous: what the last run scheduled: [{ id, at, hash }]
 * Returns the new list to remember.
 */
export async function syncReminders(plan, previous = [], {
  now = new Date(),
  topic = process.env.NTFY_TOPIC,
  server = process.env.NTFY_SERVER || 'https://ntfy.sh',
  click = process.env.DASHBOARD_URL,
  before = Number(process.env.REMIND_BEFORE_MIN) || REMIND_BEFORE_MIN,
  fetchImpl = fetch,
} = {}) {
  if (!topic) return previous;
  const prev = new Map(previous.map((r) => [r.id, r]));
  const next = [];
  const stats = { scheduled: 0, kept: 0, cancelled: 0 };

  for (const o of plan) {
    const at = reminderAt(o, before);
    if (at.getTime() - now.getTime() < 20_000) continue; // too late to schedule
    const id = reminderId(o);
    const text = reminderText(o);
    const entry = { id, at: at.toISOString(), hash: hash(text) };
    next.push(entry);
    const old = prev.get(id);
    if (old && old.hash === entry.hash && old.at === entry.at) { stats.kept++; continue; }
    const body = { topic, sequence_id: id, delay: String(Math.floor(at.getTime() / 1000)), ...text };
    if (click) body.click = click;
    const res = await fetchImpl(server, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`ntfy rejected reminder ${id}: ${res.status}`);
    stats.scheduled++;
  }

  const keep = new Set(next.map((r) => r.id));
  for (const old of previous) {
    if (keep.has(old.id) || Date.parse(old.at) <= now.getTime() + 5_000) continue;
    // class moved or cancelled: pull the pending reminder
    const res = await fetchImpl(`${server}/${encodeURIComponent(topic)}/${old.id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 404) console.error(`could not cancel ${old.id}: ${res.status}`);
    stats.cancelled++;
  }

  console.log(`Reminders: ${stats.scheduled} scheduled/updated, ${stats.kept} unchanged, ${stats.cancelled} cancelled`);
  return next;
}
