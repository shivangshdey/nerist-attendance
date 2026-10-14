# NERIST Attendance

Your SymphonyX attendance and the only rule that matters: **every subject needs 75% in theory
and 75% in practical, each on its own.** The dashboard shows what's under 75%, your bunk budget
per subject, and a week calendar where every class is marked *bunk ok*, *no buffer* or *go*
(past ones show *went* / *missed*). Your phone gets a ping 10 minutes before every class. Verdicts are worked out per subject (VLSI theory, VLSI lab, …), not on
your overall totals.

## Where the numbers come from

The same SymphonyX API calls that the NERIST student portal and Cinderac make, with no page
scraping or guessing:

| Call | Used for |
|---|---|
| `POST /login/verify/password` | logging in as you |
| `GET /api/classroom/linked` | your classrooms this semester |
| `GET /api/attendance/studentclassroomStatsTillDate` | theory and practical counts for each course |
| `POST /api/lecturePlan` | every class session, with its date, room and your Present/Absent mark |

Courses are counted the way Cinderac counts them:
- **One row per course.** A lab classroom (e.g. `EC24102-A-A(P)`) is already included in its
  course's numbers, so it isn't counted again.
- **No empty classrooms.** Classrooms with no classes (project, seminar) are left out.

On 13 Oct 2026 that gives 5 courses: theory 81/111 (73.0%) and practical 23/29 (79.3%). The
tests check these numbers.

**The schedule comes from the portal's lecture plan**, so rescheduled and extra classes are
picked up automatically, with no timetable to keep up to date. Back-to-back lab slots
are counted as one class worth that many periods.

## Notifications (ntfy, free)

- **10 minutes before each class**: *Bunk OK*, *Don't bunk* (zero buffer) or *Go to class*
  (already under 75%), with where that subject lands either way. Labs say how many they count as.
- **A subject slips under 75%**: a loud alert.
- **Sync failed**: one alert, then quiet until it works again.

Reminders are queued on ntfy ahead of time, so they arrive on time even when GitHub runs late.
Each hourly sync replaces a queued reminder with fresh numbers, and deletes it if the portal
moved or cancelled that class.

## Setup (about 10 minutes)

1. **Private repo.** Create a private GitHub repo and upload this folder.
2. **Secrets** (Settings → Secrets and variables → Actions):
   - `SX_USER`: your registration number, e.g. `121/010`
   - `SX_PASS`: your portal password
   - `NTFY_TOPIC`: a long random name, e.g. `shivie-att-7f3k9q2m`
3. **Phone.** Install the **ntfy** app and subscribe to that topic.
4. **Hosting, visible only to you** (Cloudflare, free):
   - Workers & Pages → Create → Pages → Connect to Git → this repo. Leave the build command
     empty and set the output directory to `public`.
   - Zero Trust → Access → Applications → Self-hosted → your `*.pages.dev` address, with a
     policy that allows only your email.
   - Optional: add the repo variable `DASHBOARD_URL` set to that address, so tapping a
     notification opens the dashboard.
5. **First run.** Actions → Sync attendance → Run workflow. Your phone gets
   *Attendance connected* and reminders are queued for the next 3 days.

If the first run fails, run it again with **debug** ticked and download `api-shapes`. It lists
the field names of each portal response, never the values, which is enough to see what changed.

## Staying free

Each run takes about 20 seconds (no browser), so 12 runs a day stays well inside GitHub's free
minutes. Cloudflare Pages redeploys only when your numbers change.

## Files

| Path | What |
|---|---|
| `public/` | the dashboard (plain HTML/CSS/JS, no build step) |
| `public/lib/attendance.js` | course counting, the 75% maths and class planning, shared with the sync |
| `scripts/symphonyx.mjs` | the API client |
| `scripts/sync.mjs` | fetch → write `public/data/attendance.json` → queue reminders |
| `scripts/reminders.mjs` | queues, replaces and cancels class reminders on ntfy |
| `state/state.json` | which reminders are queued (written by the workflow) |

`npm test` runs the tests. `npm run dev` serves the dashboard locally.
