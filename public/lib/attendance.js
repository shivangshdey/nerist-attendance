// Pure attendance logic, shared by the dashboard (browser) and the sync job (Node).
// The rule: every subject needs 75% in theory and 75% in practical, each on its own.
// Mirrors how Cinderac reads the SymphonyX API:
//   - one row per course: keep the first classroom per course, drop classrooms with no classes
//   - theory and practical counts come straight from the course's stats row
//     (the course-level classroom already includes its lab classroom)
// No network or file access here, so it is easy to test (see test/).

export const THRESHOLD = 0.75;
export const IST_OFFSET_MIN = 330; // India has no daylight saving
export const REMIND_BEFORE_MIN = 10;

/* ------------------------------------------------------------------ */
/* 75% maths                                                           */
/* ------------------------------------------------------------------ */

/**
 * For a bucket (theory or practical) with `attended` of `total` classes:
 *  - canSkip:    how many more you can miss and still be >= threshold
 *  - mustAttend: how many in a row you must attend to get back to threshold
 */
export function stats(attended, total, t = THRESHOLD) {
  const pct = total > 0 ? attended / total : 1;
  const canSkip = total > 0 ? Math.max(0, Math.floor(attended / t - total + 1e-9)) : 0;
  const mustAttend = pct >= t ? 0 : Math.ceil((t * total - attended) / (1 - t) - 1e-9);
  return { attended, total, pct, canSkip, mustAttend, safe: pct >= t };
}

export function summarise(courses, t = THRESHOLD) {
  const sum = (k, f) => courses.reduce((n, c) => n + (c[k]?.[f] || 0), 0);
  return {
    theory: stats(sum('theory', 'attended'), sum('theory', 'total'), t),
    practical: stats(sum('practical', 'attended'), sum('practical', 'total'), t),
  };
}

/* ------------------------------------------------------------------ */
/* Portal data → courses                                               */
/* ------------------------------------------------------------------ */

const num = (v) => (Number.isFinite(+v) ? +v : 0);

export function titleCase(s = '') {
  const small = new Set(['and', 'of', 'for', 'in', 'the', 'to', 'a', 'an', 'on', 'with']);
  const keep = /^(vlsi|dsp|rf|iot|vhdl|cmos|ai|ml|mems|fpga|ic|ii|iii|iv|vi|vii|viii|ece|cse|it|ee)$/;
  return String(s).toLowerCase().trim().replace(/\s+/g, ' ').split(' ')
    .map((w, i) => (keep.test(w) ? w.toUpperCase() : i > 0 && small.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

/**
 * classes:  /api/classroom/linked → data
 * statRows: every /api/attendance/studentclassroomStatsTillDate → data, flattened, in class order
 */
export function buildCourses(classes = [], statRows = []) {
  const byGid = new Map();
  const byCid = new Map();
  for (const c of classes) {
    if (c.classroomGeneratedId != null) byGid.set(c.classroomGeneratedId, c);
    if (c.classroomId) byCid.set(c.classroomId, c);
  }
  const seenGid = new Set();
  const seenCourse = new Set();
  const out = [];
  for (const r of statRows) {
    const cls = byGid.get(r.classroomGeneratedId) || byCid.get(r.classroomId) || {};
    const courseId = cls.courseId || r.courseId || 'N/A';
    if (seenGid.has(r.classroomGeneratedId) || seenCourse.has(courseId)) continue;
    seenGid.add(r.classroomGeneratedId);
    seenCourse.add(courseId);
    const th = { attended: num(r.attendedTheoryClassCount), total: num(r.theoryClassCount) };
    const pr = { attended: num(r.attendedPracticalClassCount), total: num(r.practicalClassCount) };
    if (!(th.total > 0 || pr.total > 0)) continue;
    out.push({
      code: courseId,
      name: titleCase(cls.courseName || r.courseName || 'Unknown course'),
      gid: r.classroomGeneratedId,
      faculty: r.faculty || '',
      theory: th,
      practical: pr,
    });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Lecture plan → sessions                                             */
/* ------------------------------------------------------------------ */

/** classroomType 2 is a lab classroom (its parent is the course); everything else is theory. */
export function classroomIndex(classes = []) {
  const byGid = new Map(classes.map((c) => [c.classroomGeneratedId, c]));
  const index = new Map();
  for (const c of classes) {
    const practical = Number(c.classroomType) === 2;
    const parent = practical ? byGid.get(c.parentClassroomGeneratedId) || c : c;
    index.set(c.classroomGeneratedId, {
      type: practical ? 'practical' : 'theory',
      code: parent.courseId || c.courseId,
      name: titleCase(parent.courseName || c.courseName || ''),
    });
  }
  return index;
}

/** status 1 = present, 2 = absent, anything else = not marked yet. */
export function sessionStatus(s, studentId) {
  const sa = s?.sessionAttendanceModel?.studentAttendance;
  if (!sa) return null;
  const rec = sa[studentId] || Object.values(sa)[0];
  if (!rec) return null;
  return rec.status === 1 ? 'present' : rec.status === 2 ? 'absent' : null;
}

export function normaliseSessions(plan = [], classes = [], studentId = '') {
  const idx = classroomIndex(classes);
  return plan
    .filter((s) => s && s.dateStartTime && s.activeStatus !== false)
    .map((s) => {
      const info = idx.get(s.classroomGeneratedId) || {
        type: 'theory',
        code: s.courseId || '',
        name: titleCase(s.courseTitle || s.courseName || ''),
      };
      return {
        id: s.lectureSessionsId ?? `${s.classroomGeneratedId}-${s.dateStartTime}`,
        gid: s.classroomGeneratedId,
        code: info.code,
        name: info.name,
        type: info.type,
        start: new Date(s.dateStartTime).toISOString(),
        end: new Date(s.dateEndTime || s.dateStartTime).toISOString(),
        room: s.labRoomName || s.roomName || '',
        faculty: s.sessionAttendanceModel?.facultyName || s.facultyName || '',
        rescheduled: !!s.isSessionRescheduled,
        extra: !!s.isAdditionalSession,
        status: sessionStatus(s, studentId),
      };
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Back-to-back slots of the same classroom (a 3-hour lab) become one class with `periods`. */
export function groupBlocks(sessions) {
  const out = [];
  for (const s of sessions) {
    const last = out.at(-1);
    if (last && last.gid === s.gid && last.status === s.status && Math.abs(Date.parse(s.start) - Date.parse(last.end)) <= 15 * 60000) {
      last.end = s.end;
      last.periods += 1;
      last.ids.push(s.id);
      continue;
    }
    out.push({ ...s, periods: 1, ids: [s.id] });
  }
  return out;
}

/* ------------------------------------------------------------------ */
/* Time helpers (IST)                                                  */
/* ------------------------------------------------------------------ */

export function istParts(instant = new Date()) {
  const d = new Date(new Date(instant).getTime() + IST_OFFSET_MIN * 60000);
  return {
    date: d.toISOString().slice(0, 10),
    weekday: d.getUTCDay(), // 0 = Sunday
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    time: d.toISOString().slice(11, 16),
  };
}

/** The instant a time (minutes after midnight, IST) on an IST date begins. */
export function istInstant(dateStr, minutes = 0) {
  return new Date(Date.parse(`${dateStr}T00:00:00Z`) + (minutes - IST_OFFSET_MIN) * 60000);
}

/** Monday of the week containing an IST date. */
export function weekStart(dateStr) {
  const wd = (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(dateStr, -wd);
}

export function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ------------------------------------------------------------------ */
/* Planning upcoming classes                                           */
/* ------------------------------------------------------------------ */

/** Every subject's theory and practical as its own 75% bucket, worst first. */
export function buckets(courses = [], t = THRESHOLD) {
  const out = [];
  for (const c of courses) {
    for (const type of ['theory', 'practical']) {
      const b = c[type];
      if (!b?.total) continue;
      out.push({ code: c.code, name: c.name, faculty: c.faculty || '', type, ...stats(b.attended, b.total, t) });
    }
  }
  return out.sort((x, y) => x.pct - y.pct);
}

/**
 * Walks classes in order and decides each one against *that subject's* bucket
 * (e.g. VLSI theory), counting every earlier decision in the list. A class is
 * "skip" if missing it keeps that bucket at >= 75%. Greedy, earliest first:
 * attending more than advised only frees up later classes.
 */
export function planDay(classes, courses, t = THRESHOLD) {
  const live = new Map();
  for (const c of courses || []) {
    for (const type of ['theory', 'practical']) {
      live.set(`${c.code}|${type}`, { a: c[type]?.attended || 0, n: c[type]?.total || 0 });
    }
  }
  return classes.map((c) => {
    const type = c.type === 'practical' ? 'practical' : 'theory';
    const p = Math.max(1, Number(c.periods) || 1);
    const key = `${c.code}|${type}`;
    if (!live.has(key)) live.set(key, { a: 0, n: 0 });
    const b = live.get(key);
    const before = stats(b.a, b.n, t);
    const ifSkip = b.n + p > 0 ? b.a / (b.n + p) : 1;
    const ifAttend = (b.a + p) / (b.n + p);
    const verdict = ifSkip >= t ? 'skip' : 'attend';
    if (verdict === 'skip') b.n += p;
    else { b.a += p; b.n += p; }
    const after = stats(b.a, b.n, t);
    return {
      ...c, type, periods: p, verdict, ifSkip, ifAttend,
      nowPct: before.pct, below: !before.safe, skipsLeft: after.canSkip, mustLeft: after.mustAttend,
    };
  });
}

/** Stable id for one class, used to replace or cancel its pending reminder. */
export function reminderId(o) {
  const { date, time } = istParts(o.start);
  const slug = String(o.code || o.name || 'class').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 16);
  return `att-${date.replace(/-/g, '')}-${time.replace(':', '')}-${slug || 'class'}-${o.type === 'practical' ? 'p' : 't'}`;
}

export function reminderAt(o, before = REMIND_BEFORE_MIN) {
  return new Date(Date.parse(o.start) - before * 60000);
}

/* ------------------------------------------------------------------ */
/* Activity heatmap + recent sessions                                  */
/* ------------------------------------------------------------------ */

/** One entry per IST day that had marked classes. */
export function dayBuckets(sessions) {
  const days = new Map();
  for (const s of sessions) {
    if (!s.status) continue;
    const { date } = istParts(s.start);
    const d = days.get(date) || { date, present: 0, absent: 0, classes: [] };
    d[s.status] += 1;
    d.classes.push({ time: istParts(s.start).time, code: s.code, name: s.name, type: s.type, status: s.status });
    days.set(date, d);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function recentSessions(sessions, n = 12) {
  return groupBlocks(sessions.filter((s) => s.status)).slice(-n).reverse()
    .map(({ start, code, name, type, status, room, periods }) => ({ start, code, name, type, status, room, periods }));
}
