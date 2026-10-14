// Pulls your attendance from the SymphonyX API (the same calls Cinderac makes),
// writes public/data/attendance.json for the dashboard, and keeps the
// 10-minutes-before-class reminders on your phone in step.
//
// Env:
//   SX_USER, SX_PASS   portal login: registration number (e.g. 121/010) and password. GitHub Secrets only.
//   NTFY_TOPIC         ntfy.sh topic for phone notifications
//   DASHBOARD_URL      optional: opened when you tap a notification
//   SYNC_TOKEN         optional: reads the classes you moved from the dashboard's Worker
//   DEBUG_DUMP=1       save the shape of every API response to debug/ (field names only, no values)

import fs from 'node:fs/promises';
import path from 'node:path';
import {
  buildCourses, summarise, normaliseSessions, groupBlocks, planDay, applyMoves, istParts, istInstant, weekStart, THRESHOLD,
} from './attendance.mjs';
import { createClient } from './symphonyx.mjs';
import { notify, buildAlert } from './notify.mjs';
import { syncReminders } from './reminders.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public/data/attendance.json');
const STATE = path.join(ROOT, 'state/state.json');
const DEBUG = process.env.DEBUG_DUMP === '1';
const DAY = 864e5;

const readJson = async (p, fallback) => {
  try { return JSON.parse(await fs.readFile(p, 'utf8')); } catch { return fallback; }
};

// Field names and types only — never values — so a debug artifact holds nothing personal.
const shape = (v, d = 0) => {
  if (d > 5) return '…';
  if (Array.isArray(v)) return v.length ? [`${v.length} items`, shape(v[0], d + 1)] : [];
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).slice(0, 60).map((k) => [k, shape(v[k], d + 1)]));
  return v === null ? 'null' : typeof v;
};

export async function fetchAll(now, { client } = {}) {
  const user = process.env.SX_USER;
  const pass = process.env.SX_PASS;
  if (!user || !pass) throw new Error('SX_USER / SX_PASS are not set');

  const dumps = [];
  const sx = client || createClient({ debug: DEBUG ? (m, p, status, json) => dumps.push({ call: `${m} ${p.split('?')[0]}`, status, shape: shape(json) }) : null });
  try {
    const me = await sx.login(user, pass);
    const classes = await sx.classes();
    if (!classes.length) throw new Error('Logged in, but the portal lists no classrooms for you this semester.');

    const studentId = classes[0]?.classroomStudentLinkingModels?.[0]?.studentId || me.userId || user;
    const sessionId = classes[0].academicSessionId;

    // Same as Cinderac: ask for every linked classroom, keep what answers.
    const settled = await Promise.allSettled(classes.map((c) => sx.stats(studentId, sessionId, c.classroomGeneratedId)));
    const statRows = settled.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value);
    if (!statRows.length) {
      const why = settled.find((r) => r.status === 'rejected')?.reason?.message || 'no data';
      throw new Error(`Couldn’t read attendance stats (${why}).`);
    }
    const courses = buildCourses(classes, statRows);

    // This week (from Monday) through next week, for the calendar and the reminders.
    const gids = classes.map((c) => c.classroomGeneratedId);
    let plan = [];
    try {
      plan = await sx.lecturePlan(gids, istInstant(weekStart(istParts(now).date), 0), new Date(now.getTime() + 9 * DAY));
    } catch (e) {
      console.error(`Lecture plan unavailable: ${e.message}`);
    }
    const sessions = normaliseSessions(plan, classes, studentId);
    return { me: { ...me, studentId }, courses, sessions };
  } finally {
    if (DEBUG) {
      await fs.mkdir(path.join(ROOT, 'debug'), { recursive: true });
      await fs.writeFile(path.join(ROOT, 'debug/api-shapes.json'), JSON.stringify(dumps, null, 2));
    }
  }
}

/** Classes you moved on the dashboard, kept by the Worker. Empty if it can't be reached. */
async function fetchMoves() {
  const base = process.env.DASHBOARD_URL;
  const token = process.env.SYNC_TOKEN;
  if (!base || !token) return {};
  try {
    const res = await fetch(new URL('api/moves', base), { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const moves = await res.json();
    console.log(`Moved classes: ${Object.keys(moves).length}`);
    return moves;
  } catch (e) {
    console.error(`Moved classes unavailable (${e.message}), using the portal's times`);
    return {};
  }
}

async function main() {
  const now = new Date();
  const prev = await readJson(OUT, {});
  const state = await readJson(STATE, { reminders: [] });
  const threshold = Number(process.env.THRESHOLD) || THRESHOLD;

  let fetched = null;
  let error = null;
  try { fetched = await fetchAll(now); } catch (e) { error = e; }

  let data;
  if (fetched) {
    const { me, courses, sessions } = fetched;
    const groups = summarise(courses, threshold);
    const schedule = groupBlocks(sessions);
    data = {
      updatedAt: now.toISOString(),
      threshold,
      student: { name: me.name || prev.student?.name || '', id: me.studentId },
      groups,
      courses: courses.map(({ gid, ...c }) => c),
      schedule: schedule.map(({ ids, gid, ...b }) => b),
    };
    await fs.mkdir(path.dirname(OUT), { recursive: true });
    await fs.writeFile(OUT, JSON.stringify(data, null, 2) + '\n');
    console.log(`${courses.length} courses · Theory ${(groups.theory.pct * 100).toFixed(1)}% (${groups.theory.attended}/${groups.theory.total}) · Practical ${(groups.practical.pct * 100).toFixed(1)}% (${groups.practical.attended}/${groups.practical.total})`);
  } else if (prev.courses) {
    data = prev; // portal down: keep reminders going from the last good numbers
  } else {
    throw error;
  }

  // Reminders: every class from now on that we know about (≤ 3 days, ntfy's limit),
  // at the times you set on the dashboard for classes you moved.
  const moves = await fetchMoves();
  const future = applyMoves(data.schedule, moves).filter((c) => !c.status).filter((c) => Date.parse(c.start) > now.getTime() && Date.parse(c.start) - now.getTime() < 3 * DAY);
  state.reminders = await syncReminders(planDay(future, data.courses, threshold), state.reminders, { now });

  if (fetched) {
    const alert = buildAlert(data, prev);
    if (alert) await notify(alert);
    state.failAlertAt = null;
  } else if (!state.failAlertAt) {
    // alert once, then stay quiet until a sync works again
    await notify({ title: 'Sync broke', body: `${error.message}\nreminders still run on your last numbers.`, priority: 4, tags: ['warning'] }).catch(() => {});
    state.failAlertAt = now.toISOString();
  }
  await fs.mkdir(path.dirname(STATE), { recursive: true });
  await fs.writeFile(STATE, JSON.stringify(state, null, 2) + '\n');
  if (error) { console.error(error.message); process.exitCode = 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(async (err) => {
    console.error(err.message);
    await notify({ title: 'Attendance sync failed', body: err.message, priority: 4, tags: ['warning'] }).catch(() => {});
    process.exit(1);
  });
}
