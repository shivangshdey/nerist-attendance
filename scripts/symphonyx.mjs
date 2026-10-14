// Minimal client for the SymphonyX API behind nerist.symphonyx.in, making the
// same calls the NERIST student portal and Cinderac make:
//
//   GET  /api/slmCore/getServiceUrls                    → service token (response header "authorization")
//   POST /login/verify/password                         → your token
//   GET  /api/classroom/linked                          → your classrooms this semester
//   GET  /api/attendance/studentclassroomStatsTillDate  → theory/practical counts per course
//   POST /api/lecturePlan?getOtherSchedules=true        → every class session, with your status
//
// The token goes in a bare `Authorization` header (no "Bearer"), and any response
// may hand back a fresh one, which we keep using.

const BASE = process.env.SX_API || 'https://nerist.symphonyx.in';
const INSTITUTE_ID = 1;
const CAMPUS_ID = 3;

export class PortalError extends Error {}

// iv (12 bytes) + AES-GCM ciphertext/tag, base64url; the challengeId is the additional authenticated data.
async function encryptPassword({ key, challengeId }, password) {
  const k = await crypto.subtle.importKey('raw', Buffer.from(key, 'base64'), 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(challengeId), tagLength: 128 }, k, enc.encode(password));
  return Buffer.concat([iv, new Uint8Array(ct)]).toString('base64url');
}

export function createClient({ base = BASE, fetchImpl = fetch, debug = null } = {}) {
  let token = '';
  const cookies = new Map();

  async function call(method, path, body) {
    const headers = {
      Accept: 'application/json, text/plain, */*',
      Origin: base,
      Referer: `${base}/student/`,
      'User-Agent': 'Mozilla/5.0 (attendance-sync)',
    };
    headers.Authorization = token; // the portal answers 400 to /login/challenge without the header, even when empty
    if (cookies.size) headers.Cookie = [...cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetchImpl(base + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

    const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : [];
    for (const c of setCookies) {
      const [pair] = c.split(';');
      const i = pair.indexOf('=');
      if (i > 0) cookies.set(pair.slice(0, i).trim(), pair.slice(i + 1).trim());
    }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    const fresh = res.headers.get('authorization') || json?.token || json?.data?.token;
    if (typeof fresh === 'string' && fresh.length > 20) token = fresh;
    debug?.(method, path, res.status, json);
    if (!res.ok) {
      const msg = json?.message || json?.error || text.slice(0, 120) || res.statusText;
      throw new PortalError(`${method} ${path.split('?')[0]} → ${res.status} ${msg}`.trim());
    }
    return json;
  }

  const list = (json) => [json?.data, json?.data?.data, json].find(Array.isArray) || [];

  return {
    get token() { return token; },

    async login(loginId, password) {
      try { await call('GET', '/api/slmCore/getServiceUrls'); } catch { /* the portal tolerates a missing service token */ }
      // The portal no longer takes a plain password: it hands out a one-off key (/login/challenge)
      // and expects the password AES-GCM encrypted with it, as its own login page does.
      const ch = (await call('GET', '/login/challenge'))?.data;
      if (!ch?.challengeId || !ch?.key) throw new PortalError('The portal did not issue a login challenge.');
      let res;
      try {
        res = await call('POST', '/login/verify/password', {
          instituteId: INSTITUTE_ID, campusId: CAMPUS_ID, loginId,
          password: await encryptPassword(ch, password), challengeId: ch.challengeId,
        });
      } catch (e) {
        if (/→ (400|401|403)/.test(e.message)) throw new PortalError('The portal rejected the login. Check SX_USER (your registration number, e.g. 121/010) and SX_PASS.');
        throw e;
      }
      if (!token) throw new PortalError('Logged in, but the portal sent no session token.');
      const user = res?.data?.user || res?.data || res?.user || {};
      return { userId: user.userId || user.studentId || user.loginId || loginId, name: user.name || user.userName || user.fullName || '' };
    },

    async classes() {
      return list(await call('GET', '/api/classroom/linked'));
    },

    async stats(studentId, academicSessionId, classroomGeneratedId) {
      const q = new URLSearchParams({ studentIds: studentId, academicSessionId, classroomGeneratedIds: classroomGeneratedId });
      return list(await call('GET', `/api/attendance/studentclassroomStatsTillDate?${q}`));
    },

    async lecturePlan(classroomGeneratedIds, from, to) {
      const json = await call('POST', '/api/lecturePlan?getOtherSchedules=true', {
        collegeIds: [CAMPUS_ID],
        classroomGeneratedIds,
        dateStartTimeFrom: from.toISOString(),
        dateEndTimeTo: to.toISOString(),
        fetchAttendance: true,
        fetchCurrentStudentAttendance: true,
        filterParamModel: { multiSearch: [], sortAsc: true, sortField: 6 },
        forStudent: true,
      });
      // Cinderac reads response.data.data (axios), i.e. body.data.data
      return [json?.data?.data, json?.data, json, json?.data?.data?.data].find(Array.isArray) || [];
    },
  };
}
