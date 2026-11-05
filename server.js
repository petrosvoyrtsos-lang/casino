'use strict';
/*
 * Traffic Rush Casino – server (καμία εξωτερική εξάρτηση, Node 18+)
 * Τρέξιμο:  node server.js   →   http://localhost:3000
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { GAMES, HttpError, catalog, CROSS_LANES, CROSS_DIFFS, crossBp, crossMax, crossOutcomes, capWin, pay, cents } = require('./lib/games');
const { Stream, newSeed, hashSeed } = require('./lib/rng');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const DB_FILE = process.env.DB_FILE || path.join(__dirname, 'data', 'db.json');
const PUBLIC = path.join(__dirname, 'public');
const START_BALANCE = 10000;       // 100 € demo (σε cents)
const BONUS = 5000;                // 50 € demo ανά 24 ώρες
const BONUS_EVERY = 24 * 3600 * 1000;
const SESSION_TTL = 7 * 24 * 3600 * 1000;
const HISTORY_KEEP = 300;

/* ---------------- βάση δεδομένων (JSON αρχείο) ---------------- */
let db = { users: {}, sessions: {} };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { /* νέα βάση */ }
db.users = db.users || {}; db.sessions = db.sessions || {};
let saveTimer = null;
function saveNow() {
  clearTimeout(saveTimer); saveTimer = null;
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
}
const save = () => { if (!saveTimer) saveTimer = setTimeout(saveNow, 150); };
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { try { saveNow(); } catch { /* ignore */ } process.exit(0); });

/* ---------------- βοηθητικά ---------------- */
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');
const err = (status, msg) => new HttpError(status, msg);

function hashPassword(pw, salt = crypto.randomBytes(16).toString('hex')) {
  return { salt, hash: crypto.scryptSync(pw, salt, 64).toString('hex') };
}
function checkPassword(pw, u) {
  const h = crypto.scryptSync(pw, u.salt, 64);
  const ref = Buffer.from(u.pass, 'hex');
  return h.length === ref.length && crypto.timingSafeEqual(h, ref);
}

const fails = new Map(); // rate limit σύνδεσης: ip|user → {n, until}
function checkLock(k) { const f = fails.get(k); if (f && f.until > Date.now() && f.n >= 5) throw err(429, 'Πολλές αποτυχημένες προσπάθειες. Δοκίμασε ξανά σε λίγα λεπτά.'); }
function addFail(k) { const f = fails.get(k); if (!f || f.until < Date.now()) fails.set(k, { n: 1, until: Date.now() + 15 * 60000 }); else f.n++; }

const userKey = (name) => String(name || '').trim().toLowerCase();
function validate(b, forUpdate) {
  const out = {};
  const str = (v, min, max, label) => { v = String(v ?? '').trim(); if (v.length < min || v.length > max) throw err(400, `${label}: ${min}–${max} χαρακτήρες`); return v; };
  if (!forUpdate) {
    out.username = String(b.username || '').trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(out.username)) throw err(400, 'Όνομα χρήστη: 3–20 γράμματα, αριθμοί ή _');
    const pw = String(b.password || '');
    if (pw.length < 8 || pw.length > 100) throw err(400, 'Ο κωδικός πρέπει να έχει 8–100 χαρακτήρες');
    out.password = pw;
    if (!b.terms) throw err(400, 'Πρέπει να αποδεχτείς τους όρους χρήσης');
    const dob = new Date(String(b.dob || '') + 'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(b.dob || '')) || isNaN(dob)) throw err(400, 'Μη έγκυρη ημερομηνία γέννησης');
    const now = new Date(); let age = now.getUTCFullYear() - dob.getUTCFullYear();
    const md = now.getUTCMonth() - dob.getUTCMonth();
    if (md < 0 || (md === 0 && now.getUTCDate() < dob.getUTCDate())) age--;
    if (age < 18) throw err(400, 'Η εγγραφή επιτρέπεται μόνο σε άτομα άνω των 18 ετών');
    if (age > 120) throw err(400, 'Μη έγκυρη ημερομηνία γέννησης');
    out.dob = String(b.dob);
  }
  out.fullName = str(b.fullName, 2, 60, 'Ονοματεπώνυμο');
  out.email = str(b.email, 5, 100, 'Email').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.email)) throw err(400, 'Μη έγκυρο email');
  out.country = str(b.country, 2, 56, 'Χώρα');
  out.phone = String(b.phone ?? '').trim();
  if (out.phone && !/^[+0-9 ()-]{6,20}$/.test(out.phone)) throw err(400, 'Μη έγκυρο τηλέφωνο');
  return out;
}

function pubUser(u) {
  return {
    username: u.display, fullName: u.fullName, email: u.email, country: u.country, phone: u.phone, dob: u.dob,
    balance: u.balance, createdAt: u.createdAt, stats: u.stats,
    nextBonusAt: (u.lastBonus || 0) + BONUS_EVERY,
    seed: { hash: u.seed.hash, client: u.seed.client, nonce: u.seed.nonce },
  };
}

/* ---------------- sessions / cookies ---------------- */
function parseCookies(req) {
  const out = {}; (req.headers.cookie || '').split(';').forEach((p) => { const i = p.indexOf('='); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); });
  return out;
}
function startSession(res, username, req) {
  const token = crypto.randomBytes(32).toString('hex');
  db.sessions[sha(token)] = { u: username, exp: Date.now() + SESSION_TTL };
  const secure = req && (req.headers['x-forwarded-proto'] === 'https') ? '; Secure' : '';
  res.setHeader('Set-Cookie', `sid=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL / 1000}${secure}`);
  save();
}
function getUser(req) {
  const t = parseCookies(req).sid; if (!t) return null;
  const s = db.sessions[sha(t)]; if (!s) return null;
  if (s.exp < Date.now()) { delete db.sessions[sha(t)]; return null; }
  return db.users[s.u] || null;
}

/* ---------------- API ---------------- */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > 50000) { reject(err(413, 'Πολύ μεγάλο αίτημα')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(err(400, 'Μη έγκυρο JSON')); }
    });
    req.on('error', reject);
  });
}

function newUserSeed() { const s = newSeed(); return { server: s, hash: hashSeed(s), client: 'player-' + crypto.randomBytes(3).toString('hex'), nonce: 0 }; }

let roundCounter = 0;
function playRound(u, game, body) {
  const g = GAMES[game]; if (!g) throw err(404, 'Άγνωστο παιχνίδι');
  const p = g.prepare(body);                                // επικύρωση (πετάει σφάλμα πριν αγγίξει υπόλοιπο)
  if (p.stake > u.balance) throw err(400, 'Δεν έχεις αρκετό υπόλοιπο');
  const nonce = u.seed.nonce;
  const out = p.run(new Stream(u.seed.server, u.seed.client, nonce));
  u.seed.nonce++;
  u.balance += out.payout - p.stake;
  u.stats.rounds++; u.stats.wagered += p.stake; u.stats.won += out.payout;
  if (out.payout > u.stats.best) { u.stats.best = out.payout; u.stats.bestGame = game; u.stats.bestAt = Date.now(); }
  const round = { id: ++roundCounter + '-' + Date.now().toString(36), t: Date.now(), game, nonce, client: u.seed.client, seedHash: u.seed.hash, stake: p.stake, payout: out.payout, result: out.result, lines: out.lines };
  u.history.push(round); if (u.history.length > HISTORY_KEEP) u.history.splice(0, u.history.length - HISTORY_KEEP);
  save();
  return { balance: u.balance, round };
}


/* ---------------- Διάβαση (παιχνίδι με κατάσταση: start / step / cashout) ---------------- */
function crossState(u) {
  const c = u.cross; if (!c) return { active: false };
  const max = crossMax(c.diff);
  return { active: true, stake: c.stake, diff: c.diff, step: c.step, max, bp: c.step ? crossBp(c.diff, c.step) : 10000, nextBp: c.step < max ? crossBp(c.diff, c.step + 1) : null, nonce: c.nonce, seedHash: c.seedHash };
}
function crossFinish(u, payout, extra) {
  const c = u.cross; const outcomes = crossOutcomes(new Stream(u.seed.server, c.client, c.nonce), c.diff);
  payout = capWin(payout); u.balance += payout;
  u.stats.rounds++; u.stats.wagered += c.stake; u.stats.won += payout;
  if (payout > u.stats.best) { u.stats.best = payout; u.stats.bestGame = 'crossing'; u.stats.bestAt = Date.now(); }
  const round = { id: ++roundCounter + '-' + Date.now().toString(36), t: Date.now(), game: 'crossing', nonce: c.nonce, client: c.client, seedHash: c.seedHash, stake: c.stake, payout,
    result: { diff: c.diff, steps: c.step, outcomes, ...extra }, lines: [{ desc: `${CROSS_DIFFS[c.diff].name} · ${c.step} λωρίδες`, stake: c.stake, bp: c.step ? crossBp(c.diff, c.step) : 0, won: payout > 0, payout }] };
  u.history.push(round); if (u.history.length > HISTORY_KEEP) u.history.splice(0, u.history.length - HISTORY_KEEP);
  delete u.cross; save(); return { balance: u.balance, round };
}

const routes = {
  'POST /api/register': async (req, res, b, ip) => {
    const v = validate(b, false); const key = userKey(v.username);
    if (db.users[key]) throw err(409, 'Το όνομα χρήστη υπάρχει ήδη');
    if (Object.values(db.users).some((x) => x.email === v.email)) throw err(409, 'Το email χρησιμοποιείται ήδη');
    const { salt, hash } = hashPassword(v.password);
    const u = db.users[key] = {
      display: v.username, salt, pass: hash, fullName: v.fullName, email: v.email, country: v.country, phone: v.phone, dob: v.dob,
      balance: START_BALANCE, createdAt: Date.now(), lastBonus: Date.now(), stats: { rounds: 0, wagered: 0, won: 0, best: 0 },
      seed: newUserSeed(), seedHistory: [], history: [],
    };
    startSession(res, key, req); return { user: pubUser(u) };
  },
  'POST /api/login': async (req, res, b, ip) => {
    const key = userKey(b.username); const lk = ip + '|' + key; checkLock(lk);
    const u = db.users[key];
    if (!u || !checkPassword(String(b.password || ''), u)) { addFail(lk); throw err(401, 'Λάθος όνομα χρήστη ή κωδικός'); }
    fails.delete(lk); startSession(res, key, req); return { user: pubUser(u) };
  },
  'POST /api/logout': async (req, res) => {
    const t = parseCookies(req).sid; if (t) { delete db.sessions[sha(t)]; save(); }
    res.setHeader('Set-Cookie', 'sid=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'); return { ok: true };
  },
  'GET /api/catalog': async () => ({ ...catalog(), build: BUILD }),
  'GET /api/me': async (req, res, b, ip, u) => ({ user: pubUser(u) }),
  'PATCH /api/me': async (req, res, b, ip, u) => {
    const v = validate(b, true);
    if (Object.values(db.users).some((x) => x !== u && x.email === v.email)) throw err(409, 'Το email χρησιμοποιείται ήδη');
    Object.assign(u, { fullName: v.fullName, email: v.email, country: v.country, phone: v.phone }); save(); return { user: pubUser(u) };
  },
  'POST /api/me/password': async (req, res, b, ip, u) => {
    if (!checkPassword(String(b.current || ''), u)) throw err(401, 'Λάθος τρέχων κωδικός');
    const np = String(b.next || ''); if (np.length < 8 || np.length > 100) throw err(400, 'Ο νέος κωδικός πρέπει να έχει 8–100 χαρακτήρες');
    const { salt, hash } = hashPassword(np); u.salt = salt; u.pass = hash;
    const keep = parseCookies(req).sid; for (const [k, s] of Object.entries(db.sessions)) if (s.u === userKey(u.display) && k !== sha(keep)) delete db.sessions[k];
    save(); return { ok: true };
  },
  'POST /api/bonus': async (req, res, b, ip, u) => {
    const left = (u.lastBonus || 0) + BONUS_EVERY - Date.now();
    if (left > 0) throw err(400, `Το επόμενο μπόνους θα είναι διαθέσιμο σε ${Math.ceil(left / 60000)} λεπτά`);
    u.lastBonus = Date.now(); u.balance += BONUS; save(); return { user: pubUser(u) };
  },
  'GET /api/history': async (req, res, b, ip, u, url) => {
    const lim = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
    return { rounds: u.history.slice(-lim).reverse() };
  },
  'POST /api/seed/client': async (req, res, b, ip, u) => {
    const c = String(b.client || '').trim(); if (!/^[\w.\- ]{1,40}$/.test(c)) throw err(400, 'Client seed: 1–40 χαρακτήρες (γράμματα, αριθμοί, . _ -)');
    u.seed.client = c; save(); return { user: pubUser(u) };
  },
  'POST /api/seed/rotate': async (req, res, b, ip, u) => {
    if (u.cross) throw err(409, 'Ολοκλήρωσε πρώτα τον γύρο στη Διάβαση (το seed αποκαλύπτεται μετά το τέλος)');
    u.seedHistory.push({ server: u.seed.server, hash: u.seed.hash, client: u.seed.client, rounds: u.seed.nonce, revealedAt: Date.now() });
    if (u.seedHistory.length > 50) u.seedHistory.shift();
    const keepClient = u.seed.client; u.seed = newUserSeed(); u.seed.client = keepClient; save();
    return { user: pubUser(u), revealed: u.seedHistory[u.seedHistory.length - 1] };
  },
  'GET /api/crossing/state': async (req, res, b, ip, u) => ({ ...crossState(u), balance: u.balance }),
  'POST /api/crossing/start': async (req, res, b, ip, u) => {
    if (u.cross) throw err(409, 'Έχεις ήδη ανοιχτό γύρο στη Διάβαση');
    const diff = b && b.diff; if (!CROSS_DIFFS[diff]) throw err(400, 'Επίλεξε δυσκολία');
    let stake; try { stake = cents(b.stake); } catch (e) { throw err(400, e.message); }
    if (stake > u.balance) throw err(400, 'Δεν έχεις αρκετό υπόλοιπο');
    u.balance -= stake; u.cross = { stake, diff, step: 0, nonce: u.seed.nonce, client: u.seed.client, seedHash: u.seed.hash, t: Date.now() }; u.seed.nonce++; save();
    return { ...crossState(u), balance: u.balance };
  },
  'POST /api/crossing/step': async (req, res, b, ip, u) => {
    const c = u.cross; if (!c) throw err(400, 'Δεν υπάρχει ανοιχτός γύρος');
    const max = crossMax(c.diff); const outcomes = crossOutcomes(new Stream(u.seed.server, c.client, c.nonce), c.diff);
    if (outcomes[c.step]) { const lane = c.step; const out = crossFinish(u, 0, { hitLane: lane, won: false }); return { status: 'hit', lane, ...out }; }
    c.step++;
    if (c.step >= max) { const out = crossFinish(u, pay(c.stake, crossBp(c.diff, c.step)), { won: true, auto: true }); return { status: 'cashed', ...out }; }
    save(); return { status: 'safe', ...crossState(u), balance: u.balance };
  },
  'POST /api/crossing/cashout': async (req, res, b, ip, u) => {
    const c = u.cross; if (!c) throw err(400, 'Δεν υπάρχει ανοιχτός γύρος');
    if (c.step < 1) throw err(400, 'Περπάτησε τουλάχιστον μία λωρίδα πριν πληρωθείς');
    const out = crossFinish(u, pay(c.stake, crossBp(c.diff, c.step)), { won: true }); return { status: 'cashed', ...out };
  },
  'GET /api/leaderboard': async (req, res, b, ip, u) => {
    const mask = (n) => n.length <= 2 ? n[0] + '***' : n.slice(0, 2) + '***' + n.slice(-1);
    const top = Object.values(db.users).filter((x) => x.stats && x.stats.best > 0).sort((a, c) => c.stats.best - a.stats.best).slice(0, 10)
      .map((x) => ({ name: mask(x.display), best: x.stats.best, game: x.stats.bestGame || null, at: x.stats.bestAt || null }));
    return { top };
  },
  'GET /api/seeds': async (req, res, b, ip, u) => ({ seeds: u.seedHistory.slice().reverse() }),
};

async function handleApi(req, res, url) {
  const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '';
  const method = req.method;
  let handler = routes[`${method} ${url.pathname}`]; let game = null;
  const m = url.pathname.match(/^\/api\/play\/(\w+)$/);
  if (!handler && method === 'POST' && m) { game = m[1]; }
  if (!handler && !game) throw err(404, 'Δεν βρέθηκε');
  let body = {};
  if (method === 'POST' || method === 'PATCH') {
    if (!/^application\/json/i.test(req.headers['content-type'] || '')) throw err(415, 'Απαιτείται JSON');
    const origin = req.headers.origin; if (origin && new URL(origin).host !== req.headers.host) throw err(403, 'Μη επιτρεπτή προέλευση');
    body = await readBody(req);
  }
  const open = ['POST /api/register', 'POST /api/login', 'GET /api/catalog', 'POST /api/logout'].includes(`${method} ${url.pathname}`);
  const u = open ? null : getUser(req);
  if (!open && !u) throw err(401, 'Απαιτείται σύνδεση');
  const out = game ? playRound(u, game, body) : await handler(req, res, body, ip, u, url);
  return out;
}

/* ---------------- στατικά αρχεία ---------------- */
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
/* έκδοση = πιο πρόσφατη αλλαγή στα αρχεία του public (για cache busting και για να φαίνεται στη σελίδα ποια έκδοση τρέχει) */
function buildId() { let m = 0; const walk = (d) => { for (const f of fs.readdirSync(d, { withFileTypes: true })) { const fp = path.join(d, f.name); if (f.isDirectory()) walk(fp); else m = Math.max(m, fs.statSync(fp).mtimeMs); } }; try { walk(PUBLIC); } catch { /* ignore */ } return Math.floor(m / 1000).toString(36); }
const BUILD = buildId();
function serveStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname); if (p === '/') p = '/index.html';
  if (p === '/index.html') {
    return fs.readFile(path.join(PUBLIC, 'index.html'), 'utf8', (e, html) => {
      if (e) { res.writeHead(404); return res.end('Δεν βρέθηκε'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html.replace(/(src|href)="([\w.-]+\.(?:js|css))"/g, `$1="$2?v=${BUILD}"`));
    });
  }
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(file, (e, data) => {
    if (e) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('Δεν βρέθηκε'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; script-src 'self'; connect-src 'self'; frame-ancestors 'none'");
  let url; try { url = new URL(req.url, 'http://x'); } catch { res.writeHead(400); return res.end(); }
  if (url.pathname.startsWith('/api/')) {
    try {
      const out = await handleApi(req, res, url);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify(out));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      if (!res.headersSent) res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(JSON.stringify({ error: status === 500 ? 'Σφάλμα server' : e.message }));
    }
    return;
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  serveStatic(req, res, url);
});

if (require.main === module) {
  server.listen(PORT, HOST, () => {
    console.log(`\n  Traffic Rush Casino (DEMO) is running`);
    console.log(`  Games loaded: ${Object.keys(require('./lib/games').GAMES).join(', ')}`);
    console.log(`  Running from folder: ${__dirname}`);
    console.log(`  On this computer:  http://localhost:${PORT}`);
    if (HOST === '0.0.0.0') {
      const ips = Object.values(require('os').networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
      ips.forEach((ip) => console.log(`  On your phone (same Wi-Fi):  http://${ip}:${PORT}`));
    }
    console.log('  Keep this window open while you play.\n');
  });
}
module.exports = { server, db, saveNow };
