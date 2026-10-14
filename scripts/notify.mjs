// One-off alerts through ntfy.sh (class reminders live in reminders.mjs).
// Install the ntfy app and subscribe to your NTFY_TOPIC. Pick a long random
// topic: anyone who knows it can read it.

import { buckets } from './attendance.mjs';

const pctStr = (p) => `${(p * 100).toFixed(1)}%`;
const label = (b) => `${b.name}${b.type === 'practical' ? ' lab' : ''}`;

/** Only speaks up when something needs you: the first sync, or a subject slipping under 75%. */
export function buildAlert(data, prev = {}) {
  const now = buckets(data.courses, data.threshold);
  const low = now.filter((b) => !b.safe);
  const summary = low.length
    ? low.map((b) => `${label(b)}: ${pctStr(b.pct)}, need ${b.mustAttend}`).join('\n')
    : 'everything is above 75%.';
  if (!prev.courses || prev.demo || prev.preview) {
    return { title: low.length ? `Connected. ${low.length} under 75%` : 'Connected. All good', body: `${summary}\npings 10 min before every class.`, priority: 3, tags: ['white_check_mark'] };
  }
  const was = new Map(buckets(prev.courses, prev.threshold).map((b) => [`${b.code}|${b.type}`, b.safe]));
  const dropped = low.filter((b) => was.get(`${b.code}|${b.type}`) !== false);
  if (!dropped.length) return null;
  return {
    title: `${dropped.map(label).join(' & ')} fell under 75%`,
    body: `${dropped.map((b) => `${label(b)}: ${pctStr(b.pct)} · need ${b.mustAttend}`).join('\n')}`,
    priority: 5,
    tags: ['rotating_light'],
  };
}

export async function notify({ title, body, priority = 3, tags = [] }) {
  const topic = process.env.NTFY_TOPIC;
  if (!topic) return;
  const server = process.env.NTFY_SERVER || 'https://ntfy.sh';
  // JSON publishing (POST to the server root) keeps UTF-8 titles intact.
  const payload = { topic, title, message: body, priority, tags };
  if (process.env.DASHBOARD_URL) payload.click = process.env.DASHBOARD_URL;
  const res = await fetch(server, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) console.error(`ntfy responded ${res.status}`);
}
