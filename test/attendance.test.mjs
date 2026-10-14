import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  stats, summarise, buckets, buildCourses, classroomIndex, normaliseSessions, groupBlocks, planDay,
  dayBuckets, recentSessions, reminderId, reminderAt, istParts,
} from '../scripts/attendance.mjs';
import { syncReminders, reminderText } from '../scripts/reminders.mjs';

// Your linked classrooms as the portal returns them (13 Oct 2026, from Cinderac).
const classes = [
  [19696, 'EC24179-A', 'EC24179', 'PROJECT', 1, 0],
  [19697, 'EC24199-A', 'EC24199', 'SEMINAR', 1, 0],
  [19698, 'EC24199-A-A(P)', 'EC24199', 'SEMINAR', 2, 19697],
  [19706, 'EC24102-A', 'EC24102', 'VLSI DESIGN', 1, 0],
  [19707, 'EC24102-A-A(P)', 'EC24102', 'VLSI DESIGN', 2, 19706],
  [19710, 'EC24101-A', 'EC24101', 'ANTENNA AND RADAR ENGINEERING', 1, 0],
  [19711, 'EC24101-A-A(P)', 'EC24101', 'ANTENNA AND RADAR ENGINEERING', 2, 19710],
  [19762, 'EC24012-A', 'EC24012', 'SEMICONDUCTOR DEVICE MODELLING', 1, 0],
  [19763, 'EC24004-A', 'EC24004', 'WIRELESS COMMUNICATION', 1, 0],
  [20327, 'HS24041-A', 'HS24041', 'MANAGING STRESS', 1, 0],
].map(([g, cid, course, name, type, parent]) => ({
  classroomGeneratedId: g, classroomId: cid, courseId: course, courseName: name, classroomType: type,
  parentClassroomGeneratedId: parent, academicSessionId: 2611,
  classroomStudentLinkingModels: [{ studentId: '121/010' }],
}));

const row = (g, cid, ta, tn, pa, pn) => ({
  classroomGeneratedId: g, classroomId: cid, studentId: '121/010',
  attendedTheoryClassCount: ta, theoryClassCount: tn, attendedPracticalClassCount: pa, practicalClassCount: pn,
});
// Stats rows in class order; the lab classrooms repeat their course, the project/seminar have nothing.
const statRows = [
  row(19696, 'EC24179-A', 0, 0, 0, 0),
  row(19697, 'EC24199-A', 0, 0, 0, 0),
  row(19706, 'EC24102-A', 15, 23, 11, 15),
  row(19707, 'EC24102-A-A(P)', 15, 23, 11, 15),
  row(19710, 'EC24101-A', 20, 27, 12, 14),
  row(19711, 'EC24101-A-A(P)', 20, 27, 12, 14),
  row(19762, 'EC24012-A', 15, 20, 0, 0),
  row(19763, 'EC24004-A', 13, 17, 0, 0),
  row(20327, 'HS24041-A', 18, 24, 0, 0),
];

test('courses match Cinderac: 5 courses, labs not double-counted, empty ones dropped', () => {
  const c = buildCourses(classes, statRows);
  assert.deepEqual(c.map((x) => x.code), ['EC24102', 'EC24101', 'EC24012', 'EC24004', 'HS24041']);
  assert.equal(c[1].name, 'Antenna and Radar Engineering');
  const g = summarise(c);
  assert.deepEqual([g.theory.attended, g.theory.total], [81, 111]); // 73.0%
  assert.deepEqual([g.practical.attended, g.practical.total], [23, 29]); // 79.3%
  assert.equal(g.theory.pct.toFixed(3), '0.730');
  assert.equal(g.theory.mustAttend, 9);
  assert.equal(g.practical.canSkip, 1);
});

test('75% maths edges', () => {
  assert.deepEqual([stats(30, 40).canSkip, stats(30, 40).mustAttend], [0, 0]);
  for (const [a, n] of [[40, 45], [12, 12], [31, 40], [0, 4], [70, 95]]) {
    const s = stats(a, n);
    if (s.safe) assert.ok(a / (n + s.canSkip) >= 0.75 && a / (n + s.canSkip + 1) < 0.75);
    assert.ok((a + s.mustAttend) / (n + s.mustAttend) >= 0.75);
  }
  assert.equal(stats(0, 0).safe, true);
});

test('lab classrooms are practical and named after their course', () => {
  const idx = classroomIndex(classes);
  assert.deepEqual(idx.get(19707), { type: 'practical', code: 'EC24102', name: 'VLSI Design' });
  assert.equal(idx.get(19706).type, 'theory');
});

const plan = [
  // a 3-slot VLSI lab today 15:00–18:00 IST, then theory tomorrow, plus one rescheduled class
  { lectureSessionsId: 1, classroomGeneratedId: 19707, dateStartTime: '2026-10-13T09:30:00.000+00:00', dateEndTime: '2026-10-13T10:30:00.000+00:00', roomName: 'R-14', activeStatus: true },
  { lectureSessionsId: 2, classroomGeneratedId: 19707, dateStartTime: '2026-10-13T10:30:00.000+00:00', dateEndTime: '2026-10-13T11:30:00.000+00:00', roomName: 'R-14', activeStatus: true },
  { lectureSessionsId: 3, classroomGeneratedId: 19707, dateStartTime: '2026-10-13T11:30:00.000+00:00', dateEndTime: '2026-10-13T12:30:00.000+00:00', roomName: 'R-14', activeStatus: true },
  { lectureSessionsId: 4, classroomGeneratedId: 19763, dateStartTime: '2026-10-14T03:30:00.000+00:00', dateEndTime: '2026-10-14T04:30:00.000+00:00', roomName: 'R-01', activeStatus: true, isSessionRescheduled: true },
  { lectureSessionsId: 5, classroomGeneratedId: 19706, dateStartTime: '2026-10-14T04:30:00.000+00:00', dateEndTime: '2026-10-14T05:30:00.000+00:00', activeStatus: true },
  { lectureSessionsId: 6, classroomGeneratedId: 19706, dateStartTime: '2026-10-12T04:30:00.000+00:00', dateEndTime: '2026-10-12T05:30:00.000+00:00', activeStatus: true,
    sessionAttendanceModel: { facultyName: 'BHABESH DEORI', studentAttendance: { '121/010': { status: 1 } } } },
  { lectureSessionsId: 7, classroomGeneratedId: 19763, dateStartTime: '2026-10-12T05:30:00.000+00:00', dateEndTime: '2026-10-12T06:30:00.000+00:00', activeStatus: true,
    sessionAttendanceModel: { studentAttendance: { '121/010': { status: 2 } } } },
  { lectureSessionsId: 8, classroomGeneratedId: 19762, dateStartTime: '2026-10-14T06:30:00.000+00:00', activeStatus: false },
];

test('sessions: types, statuses, cancelled ones dropped, labs grouped into one class', () => {
  const s = normaliseSessions(plan, classes, '121/010');
  assert.equal(s.length, 7);
  assert.deepEqual(s.filter((x) => x.status).map((x) => x.status), ['present', 'absent']);
  const blocks = groupBlocks(s.filter((x) => Date.parse(x.start) > Date.parse('2026-10-13T00:00:00Z')));
  assert.deepEqual(blocks.map((b) => [b.code, b.type, b.periods]), [['EC24102', 'practical', 3], ['EC24004', 'theory', 1], ['EC24102', 'theory', 1]]);
  assert.equal(blocks[1].rescheduled, true);
  const days = dayBuckets(s);
  assert.deepEqual(days, [{ date: '2026-10-12', present: 1, absent: 1, classes: [
    { time: '10:00', code: 'EC24102', name: 'VLSI Design', type: 'theory', status: 'present' },
    { time: '11:00', code: 'EC24004', name: 'Wireless Communication', type: 'theory', status: 'absent' },
  ] }]);
  assert.equal(recentSessions(s)[0].status, 'absent');
});

test('per-subject buckets match Cinderac (need / buffer)', () => {
  const b = buckets(buildCourses(classes, statRows));
  const view = Object.fromEntries(b.map((x) => [`${x.code} ${x.type}`, x.safe ? `buffer ${x.canSkip}` : `need ${x.mustAttend}`]));
  assert.deepEqual(view, {
    'EC24102 theory': 'need 9', 'EC24102 practical': 'need 1', 'EC24101 theory': 'need 1',
    'EC24101 practical': 'buffer 2', 'EC24012 theory': 'buffer 0', 'EC24004 theory': 'buffer 0', 'HS24041 theory': 'buffer 0',
  });
  assert.equal(b[0].code, 'EC24102'); // worst first: VLSI theory 65.2%
});

test('plan decides per subject, not on the totals', () => {
  const courses = buildCourses(classes, statRows);
  const s = normaliseSessions(plan, classes, '121/010');
  const p = planDay(groupBlocks(s.filter((x) => !x.status)), courses);
  assert.deepEqual(p.map((x) => [x.code, x.type, x.verdict, x.below]), [
    ['EC24102', 'practical', 'attend', true], // VLSI lab 11/15
    ['EC24004', 'theory', 'attend', false], // Wireless 13/17, zero buffer
    ['EC24102', 'theory', 'attend', true],
  ]);
  assert.match(reminderText(p[0]).title, /^Go to class · VLSI Design lab · 15:00 · R-14/);
  assert.match(reminderText(p[0]).message, /counts as 3/);
  assert.match(reminderText(p[1]).title, /^Don't bunk · Wireless Communication · 09:00 · R-01 \(moved\)$/);
  // Antenna lab has 2 bunks: a 1-slot lab is fine, a 3-slot one isn't
  const lab = (periods) => planDay([{ code: 'EC24101', type: 'practical', periods, start: '2026-10-16T08:30:00Z' }], courses)[0];
  assert.equal(lab(1).verdict, 'skip');
  assert.equal(lab(1).skipsLeft, 1);
  assert.match(reminderText({ ...lab(1), name: 'Antenna and Radar Engineering' }).title, /^Bunk OK/);
  assert.equal(lab(3).verdict, 'attend');
});

test('reminder ids and times', () => {
  const o = { start: '2026-10-13T09:30:00.000Z', code: 'EC24102', type: 'practical' };
  assert.equal(reminderId(o), 'att-20261013-1500-ec24102-p');
  assert.equal(reminderAt(o).toISOString(), '2026-10-13T09:20:00.000Z');
  assert.deepEqual(istParts(new Date('2026-10-13T03:25:00Z')), { date: '2026-10-13', weekday: 2, minutes: 535, time: '08:55' });
});

test('syncReminders: schedule, keep unchanged, replace, cancel', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => { calls.push({ url, method: init.method, body: init.body && JSON.parse(init.body) }); return { ok: true, status: 200 }; };
  const groups = buildCourses(classes, statRows);
  const now = new Date('2026-10-13T06:00:00Z');
  const opts = { now, topic: 't', server: 'https://ntfy.example', fetchImpl };
  const blocks = groupBlocks(normaliseSessions(plan, classes, '121/010').filter((x) => Date.parse(x.start) > now.getTime()));
  const s1 = await syncReminders(planDay(blocks, groups), [], opts);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].body.delay, String(Date.parse('2026-10-13T09:20:00Z') / 1000));
  calls.length = 0;
  await syncReminders(planDay(blocks, groups), s1, opts);
  assert.equal(calls.length, 0);
  calls.length = 0;
  await syncReminders(planDay(blocks.slice(1), groups), s1, opts); // portal cancelled the lab
  assert.ok(calls.some((c) => c.method === 'DELETE' && c.url.endsWith('/t/att-20261013-1500-ec24102-p')));
});
