// Preview data for the dashboard before the first sync.
// Subject numbers are your real ones as Cinderac showed them on 13 Oct 2026.
// The week's schedule and the Present/Absent marks on it are made up.
import fs from 'node:fs/promises';
import { summarise, planDay } from './attendance.mjs';

const course = (code, name, faculty, ta, tn, pa = 0, pn = 0) => ({ code, name, faculty, theory: { attended: ta, total: tn }, practical: { attended: pa, total: pn } });
const courses = [
  course('EC24102', 'VLSI Design', 'Bhabesh Deori', 15, 23, 11, 15),
  course('EC24101', 'Antenna and Radar Engineering', 'M. Edison Singh', 20, 27, 12, 14),
  course('EC24012', 'Semiconductor Device Modelling', 'Ashok Kumar Ray', 15, 20),
  course('EC24004', 'Wireless Communication', 'Rajesh Kumar', 13, 17),
  course('HS24041', 'Managing Stress', 'Yuma Narah', 18, 24),
];
const nameOf = Object.fromEntries(courses.map((c) => [c.code, c.name]));

// [weekday (1 = Mon), start, code, type, periods, room]
const week = [
  [1, '09:30', 'EC24102', 'theory', 1, 'R-14'], [1, '10:30', 'EC24004', 'theory', 1, 'R-01'], [1, '14:00', 'EC24101', 'practical', 3, 'DB-R-15'],
  [2, '09:30', 'EC24012', 'theory', 1, 'R-03'], [2, '11:30', 'HS24041', 'theory', 1, 'R-01'], [2, '15:00', 'EC24102', 'practical', 3, 'R-14'],
  [3, '09:30', 'EC24101', 'theory', 1, 'R-11'], [3, '10:30', 'EC24102', 'theory', 1, 'R-14'], [3, '12:00', 'EC24004', 'theory', 1, 'R-01'],
  [4, '09:30', 'EC24012', 'theory', 1, 'R-03'], [4, '10:30', 'EC24101', 'theory', 1, 'R-11'], [4, '11:30', 'HS24041', 'theory', 1, 'R-01'],
  [5, '09:30', 'EC24102', 'theory', 1, 'R-14'], [5, '10:30', 'EC24012', 'theory', 1, 'R-03'], [5, '12:00', 'EC24101', 'theory', 1, 'R-11'],
];
const ist = (date, hhmm) => new Date(`${date}T${hhmm}:00+05:30`).toISOString();
const addDays = (d, n) => { const x = new Date(`${d}T00:00:00Z`); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

const marks = { '2026-10-12': ['present', 'absent', 'present'], '2026-10-13': ['present', 'present', 'present'] };
const schedule = [];
for (const monday of ['2026-10-12', '2026-10-19']) {
  for (const [wd, time, code, type, periods, room] of week) {
    const date = addDays(monday, wd - 1);
    const start = ist(date, time);
    const i = schedule.filter((s) => s.start.slice(0, 10) === start.slice(0, 10)).length;
    schedule.push({
      start,
      end: new Date(Date.parse(start) + periods * 3600e3).toISOString(),
      code, name: nameOf[code], type, periods, room, faculty: '',
      rescheduled: date === '2026-10-15' && time === '11:30', extra: false,
      status: marks[date]?.[i] ?? null,
    });
  }
}
schedule.sort((a, b) => a.start.localeCompare(b.start));

const data = {
  preview: true,
  updatedAt: new Date('2026-10-13T13:30:00Z').toISOString(),
  threshold: 0.75,
  student: { name: 'Shivangsh Dey', id: '121/010' },
  groups: summarise(courses),
  courses,
  schedule,
};
await fs.writeFile(new URL('../public/data/attendance.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
console.log('preview data written:', schedule.length, 'classes;',
  planDay(schedule.filter((s) => !s.status), courses).map((c) => `${c.code.slice(-3)}${c.type[0]}:${c.verdict}`).join(' '));
