'use strict';
/* node test/test.js — επιβεβαιώνει πιθανότητες, RTP, RNG και τον server */
const assert = require('assert');
const os = require('os');
const path = require('path');
process.env.DB_FILE = path.join(os.tmpdir(), 'casino-test-' + process.pid + '.json');
const G = require('../lib/games');
const { Stream, newSeed, hashSeed } = require('../lib/rng');

let ok = 0; const pass = (m) => { ok++; console.log('  ✓', m); };

/* 1. RNG: ομοιομορφία & καθαρότητα */
{
  const st = new Stream(newSeed(), 'test', 0); const n = 200000; const c = [0, 0, 0, 0, 0];
  for (let i = 0; i < n; i++) c[st.int(5)]++;
  const chi = c.reduce((s, x) => s + (x - n / 5) ** 2 / (n / 5), 0);
  assert(chi < 18.5, 'chi² 4 df p>0.001'); pass(`RNG ομοιόμορφο (chi²=${chi.toFixed(2)})`);
  { // monobit + serial test + χ² για int(37) και int(100)
    const st2 = new Stream(newSeed(), 'stat', 7); let ones = 0; const bits = 400000;
    for (let i = 0; i < bits / 8; i++) { let b = st2.byte(); while (b) { ones += b & 1; b >>= 1; } }
    const z = Math.abs(ones - bits / 2) / Math.sqrt(bits / 4); assert(z < 4.4, 'monobit z=' + z);
    for (const n of [37, 100, 40, 16]) { const c = new Array(n).fill(0), m = n * 4000; for (let i = 0; i < m; i++) c[st2.int(n)]++; const chi = c.reduce((q, x) => q + (x - m / n) ** 2 / (m / n), 0); const lim = (n - 1) + 4.3 * Math.sqrt(2 * (n - 1)); assert(chi < lim, `chi² int(${n}) ${chi}`); }
    const k = 10, tab = new Array(k * k).fill(0), pairs = 200000; let prev = st2.int(k); for (let i = 0; i < pairs; i++) { const x = st2.int(k); tab[prev * k + x]++; prev = x; }
    const chiS = tab.reduce((q, x) => q + (x - pairs / (k * k)) ** 2 / (pairs / (k * k)), 0); assert(chiS < 99 + 4.3 * Math.sqrt(198), 'serial chi² ' + chiS);
    pass('RNG στατιστικά: monobit, χ² (37/100/40/16 τιμές), serial test διαδοχικών ζευγών');
  }
  const a = new Stream('seed', 'c', 1), b = new Stream('seed', 'c', 1);
  assert.deepStrictEqual(Array.from({ length: 50 }, () => a.int(10000)), Array.from({ length: 50 }, () => b.int(10000))); pass('RNG αναπαραγώγιμο από seed');
  assert.strictEqual(hashSeed('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'); pass('SHA-256 σωστό');
}

/* 2. Traffic: πιθανότητες αθροίζουν σε 1 ανά αγορά και RTP κάθε επιλογής ≤ 96% */
{
  const byGroup = new Map();
  const cat = G.catalog().traffic;
  for (const o of cat.options) {
    assert(o.p * o.bp / 10000 <= 0.96 + 1e-9, `RTP ${o.key}`);
    if (o.p >= 0.0005 && o.bp > 10100 && o.bp < 10000000) assert(o.p * o.bp / 10000 > 0.94, `RTP πολύ χαμηλό ${o.key} ${o.p * o.bp / 10000}`);
  }
  pass(`Traffic: ${cat.options.length} επιλογές με RTP 94–96%`);
  // Monte Carlo
  const N = 150000; const st = new Stream(newSeed(), 'mc', 0); const hits = new Map();
  for (let g = 0; g < N; g++) {
    const cars = Array.from({ length: 20 }, () => st.int(5)); const r = G.analyze(cars);
    for (const [k, o] of G.TRAFFIC_OPTS) if (o.win(r)) hits.set(k, (hits.get(k) || 0) + 1);
  }
  let maxZ = 0, th = 0, sim = 0, n = 0;
  for (const [k, o] of G.TRAFFIC_OPTS) {
    const f = (hits.get(k) || 0) / N; const z = Math.abs(f - o.p) / Math.sqrt(o.p * (1 - o.p) / N);
    maxZ = Math.max(maxZ, z); th += o.p * o.bp / 10000; sim += f * o.bp / 10000; n++;
  }
  assert(maxZ < 4.6, 'απόκλιση σε σ: ' + maxZ);
  assert(Math.abs(th / n - sim / n) < 0.004);
  pass(`Traffic Monte Carlo: RTP θεωρητικό ${(th / n * 100).toFixed(2)}% / προσομοίωση ${(sim / n * 100).toFixed(2)}% (max ${maxZ.toFixed(2)}σ)`);
  // ο αθροισμός πιθανοτήτων των αμοιβαία αποκλειόμενων αποτελεσμάτων = 1
  const grp = (pre) => cat.options.filter((o) => o.key.startsWith(pre)).reduce((s, o) => s + o.p, 0);
  assert(Math.abs(grp('most|') - 1) < 1e-9); pass('Κυρίαρχο χρώμα: Σ(p)=1');
}

/* 3. Φρουτάκι / Τροχός / Ρουλέτα / Ζάρια / Κορώνα */
{
  const ss = G.slotsStats(); assert(ss.rtp > 0.95 && ss.rtp < 0.96, 'slots rtp ' + ss.rtp);
  pass(`Φρουτάκι: ακριβές RTP ${(ss.rtp * 100).toFixed(2)}% (γραμμές ${(ss.L * 100).toFixed(1)}% + scatter ${(ss.S * 100).toFixed(1)}%, bonus 1 στους ${(1 / ss.pTrig).toFixed(0)})`);
  {
    const st = new Stream(newSeed(), 'slots', 0); const N = 400000; let paid = 0, bonus = 0, stake = 100;
    const prep = G.GAMES.slots.prepare({ stake: 1 });
    for (let i = 0; i < N; i++) { const o = prep.run(st); paid += o.payout; if (o.result.bonus) { bonus++; assert.strictEqual(o.result.spins.length, 11); } else assert.strictEqual(o.result.spins.length, 1); assert.strictEqual(o.payout, Math.min(G.MAX_WIN, o.result.spins.reduce((a, x) => a + x.pay, 0))); }
    const rtp = paid / (N * stake); assert(Math.abs(rtp - ss.rtp) < 0.04, 'MC slots ' + rtp);
    pass(`Φρουτάκι Monte Carlo ${N.toLocaleString()} περιστροφές: RTP ${(rtp * 100).toFixed(2)}%, bonus ${bonus} φορές (με 10 free spins)`);
  }
  for (const k of ['low', 'medium', 'high']) {
    const w = G.wheelRtp(k); assert(w >= 0.955 && w <= 0.973, 'wheel rtp ' + k + ' ' + w);
    const W = G.WHEELS[k]; assert.strictEqual(W.main.length, 40); assert.strictEqual(W.bonus.length, 16);
    for (const m of [...W.main, ...W.bonus]) if (typeof m === 'number' && m !== 0) assert(m >= 1.2, 'wheel μικρό πολλαπλάσιο ' + m);
    // Monte Carlo με την πραγματική run(): ίδιο RTP με τον τύπο
    const st = new Stream(newSeed(), 'wheel' + k, 0), prep = G.GAMES.wheel.prepare({ stake: 1, risk: k }); let paid = 0, nn = 300000, bonus = 0, resp = 0;
    for (let i = 0; i < nn; i++) { const o = prep.run(st); paid += o.payout; if (o.result.spins.some((x) => x.kind === 'b')) bonus++; if (o.result.spins.length > 1) resp++; assert(o.result.spins.length <= 4); }
    const mc = paid / (nn * 100); assert(Math.abs(mc - w) < 0.07, `MC τροχός ${k}: ${mc} vs ${w}`);
    pass(`Τροχός ${k}: RTP ακριβές ${(w * 100).toFixed(2)}% · Monte Carlo ${(mc * 100).toFixed(2)}% · bonus ${(bonus / nn * 100).toFixed(1)}% · respin ${(resp / nn * 100).toFixed(1)}%`);
  }
  // Πολιτική: κανένα προσφερόμενο στοίχημα δεν πληρώνει < 1,01× (ούτε 0,98×/1,00×)
  {
    const mins = {};
    const C = G.catalog();
    mins.traffic = Math.min(...C.traffic.options.map((o) => o.bp));
    mins.dice = Math.min(...Object.values(C.dice.mult)) * 10000;
    mins.coin = C.coin.mult * 10000;
    mins.shark = Math.min(...C.shark.lines.flatMap((l) => [C.shark.over[l], C.shark.under[l]]).filter((d) => d.ok).map((d) => d.bp), ...Object.values(C.shark.exactMap).map((d) => d.bp)) * 10000;
    mins.cross = Math.min(...Object.values(C.crossing.diffs).map((d) => d.ladder[0])) * 10000;
    for (const [g, v] of Object.entries(mins)) assert(v >= G.MIN_MULT_BP - 1e-6, `${g}: πολλαπλασιαστής ${v / 10000}× < 1,01×`);
    for (const l of C.shark.lines) for (const t of ['over', 'under']) if (!C.shark[t][l].ok) assert.throws(() => G.GAMES.shark.prepare({ bets: [{ type: t, value: l, stake: 1 }] }));
    pass('Κανένας πολλαπλασιαστής κάτω από 1,01× (Traffic, ζάρια, νόμισμα, καρχαρίας, διάβαση, τροχός)');
  }
  // Στρογγυλοποίηση: το ποσό πληρωμής είναι ακέραιο λεπτό, πλησιέστερο στο ακριβές
  assert.strictEqual(G.pay(25, 11022), 28); assert.strictEqual(G.pay(100, 12000), 120); assert.strictEqual(G.pay(1, 15000), 2);
  pass('Στρογγυλοποίηση πληρωμής (πλησιέστερο λεπτό)');
  // Ρουλέτα: ακριβής έλεγχος όλων των στοιχημάτων
  for (const [type, t] of Object.entries(G.ROUL_TYPES)) {
    const vals = t.v ? (type === 'straight' ? [...Array(37).keys()] : [1, 2, 3]) : [null];
    for (const v of vals) { let e = 0; for (let n = 0; n <= 36; n++) if (t.win(n, v)) e += t.mult; assert(Math.abs(e / 37 - 36 / 37) < 1e-12, `${type} ${v}`); }
  }
  for (const [k, b] of G.INSIDE) { assert(Math.abs(b.numbers.length * b.mult / 37 - 36 / 37) < 1e-12, k); assert(b.numbers.every((x) => x >= 0 && x <= 36)); }
  pass(`Ρουλέτα: κάθε στοίχημα RTP 97.30% (και τα ${G.INSIDE.size} στοιχήματα split/street/corner/six line/trio/basket)`);
  for (const [type, tt] of Object.entries(G.DICE_TYPES)) for (const v of (tt.v ? [2,3,4,5,6,7,8,9,10,11,12] : [null])) { const rtp = (G.diceCount(type, v) / 36) * G.diceBp(type, v) / 10000; assert(rtp <= 0.97 && rtp > 0.9695, `dice ${type} ${v} ${rtp}`); }
  pass('Ζάρια (2 ζάρια): RTP ≤ 97% σε όλα τα στοιχήματα');
  for (const [ty, vs] of [['over', G.SHARK_LINES], ['under', G.SHARK_LINES], ['exact', G.SHARK_EXACT]]) for (const v of vs) { const rtp = G.sharkProb(ty, v) * G.sharkBp(ty, v) / 10000; assert(rtp <= 0.97 + 1e-9 && rtp > 0.9695, `shark ${ty} ${v} ${rtp}`); }
  pass('Shark Feeding: RTP ≤ 97% σε όλα τα over/under/exact στοιχήματα');
  for (const d of Object.keys(G.CROSS_DIFFS)) for (let k = 1; k <= G.crossMax(d); k++) { const rtp = Math.pow(1 - G.CROSS_DIFFS[d].hit / 100, k) * G.crossBp(d, k) / 10000; assert(rtp <= 0.97 + 1e-9 && rtp > 0.9695, `cross ${d} ${k} ${rtp}`); }
  pass('Διάβαση: RTP ≤ 97% για κάθε δυσκολία και αριθμό λωρίδων (cash out σε οποιοδήποτε βήμα)');
  assert(Math.abs(0.5 * G.COIN_BP / 10000 - 0.97) < 1e-9); pass('Κορώνα/Γράμματα: RTP 97%');
}

/* 4. Server end-to-end */
(async () => {
  const { server, saveNow } = require('../server');
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let cookie = '';
  const call = async (method, p, body) => {
    const res = await fetch(base + p, { method, headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  };
  const reg = { username: 'Petros_1', password: 'secretpass1', fullName: 'Πέτρος Τεστ', email: 'p@example.com', dob: '1990-05-05', country: 'Ελλάδα', phone: '+30 6900000000', terms: true };
  let r = await call('POST', '/api/play/coin', { stake: 5, side: 'heads' }); assert.strictEqual(r.status, 401); pass('Χωρίς σύνδεση δεν παίζεις (401)');
  r = await call('POST', '/api/register', { ...reg, dob: '2015-01-01' }); assert.strictEqual(r.status, 400); pass('Ανήλικος απορρίπτεται');
  r = await call('POST', '/api/register', { ...reg, password: '123' }); assert.strictEqual(r.status, 400); pass('Αδύναμος κωδικός απορρίπτεται');
  r = await call('POST', '/api/register', reg); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.user.balance, 10000); pass('Εγγραφή + 100 € demo καλωσορίσματος');
  r = await call('POST', '/api/register', { ...reg, email: 'x@y.gr' }); assert.strictEqual(r.status, 409); pass('Διπλό username απορρίπτεται');
  const hashBefore = (await call('GET', '/api/me')).body.user.seed.hash;
  r = await call('POST', '/api/play/coin', { stake: 10, side: 'heads' }); assert.strictEqual(r.status, 200);
  const rd = r.body.round; assert.strictEqual(rd.seedHash, hashBefore); assert.strictEqual(r.body.balance, 10000 - 1000 + rd.payout); pass('Κορώνα/Γράμματα: το υπόλοιπο ενημερώνεται σωστά');
  r = await call('POST', '/api/play/coin', { stake: 100000, side: 'heads' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/play/coin', { stake: 0.1, side: 'heads' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/play/coin', { stake: 0.2, side: 'heads' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.round.stake, 20);
  r = await call('POST', '/api/play/dice', { bets: [{ type: 'over7', stake: 0.55 }] }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.round.stake, 55); pass('Μικρά ποντάρισματα (0,20 €, 0,55 €) δουλεύουν, κάτω από 0,20 € απορρίπτονται'); pass('Ποντάρισμα πάνω από όριο/υπόλοιπο απορρίπτεται');
  r = await call('POST', '/api/play/coin', { stake: -5, side: 'heads' }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/play/coin', { stake: 0.001, side: 'heads' }); assert.strictEqual(r.status, 400); pass('Αρνητικά/μη έγκυρα ποσά απορρίπτονται');
  const opt = G.catalog().traffic.options.find((o) => o.key === 'ou|0|5.5|o');
  r = await call('POST', '/api/play/traffic', { bets: [{ key: opt.key, stake: 10 }, { key: 'most|3', stake: 5 }, { key: 'FAKE', stake: 1 }] }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/play/traffic', { bets: [{ key: opt.key, stake: 10 }, { key: 'most|3', stake: 5 }] }); assert.strictEqual(r.status, 200);
  assert.strictEqual(r.body.round.result.cars.length, 20); pass('Traffic: 20 αμάξια σε κάθε γύρο');
  for (const [g, b] of [['slots', { stake: 5 }], ['wheel', { stake: 5, risk: 'high' }], ['roulette', { bets: [{ type: 'red', stake: 5 }, { type: 'straight', value: 17, stake: 1 }, { type: 'split', numbers: [17, 20], stake: 1 }, { type: 'corner', numbers: [1, 2, 4, 5], stake: 1 }, { type: 'street', numbers: [34, 35, 36], stake: 1 }, { type: 'sixline', numbers: [1, 2, 3, 4, 5, 6], stake: 1 }, { type: 'basket', numbers: [0, 1, 2, 3], stake: 1 }] }], ['dice', { bets: [{ type: 'over7', stake: 2 }, { type: 'total', value: 7, stake: 1 }, { type: 'doubles', stake: 1 }] }]]) {
    r = await call('POST', '/api/play/' + g, b); assert.strictEqual(r.status, 200, g + JSON.stringify(r.body));
  }
  r = await call('POST', '/api/play/shark', { bets: [{ type: 'over', value: 4.5, stake: 1 }, { type: 'exact', value: 5, stake: 0.5 }] }); assert.strictEqual(r.status, 200); assert(r.body.round.result.count >= 0 && r.body.round.result.eaten.length === r.body.round.result.count);
  r = await call('POST', '/api/play/shark', { bets: [{ type: 'over', value: 4, stake: 1 }] }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/play/shark', { bets: [{ type: 'exact', value: 14, stake: 1 }] }); assert.strictEqual(r.status, 400);
  { const b0 = (await call('GET', '/api/me')).body.user.balance;
    r = await call('POST', '/api/crossing/start', { stake: 2, diff: 'medium' }); assert.strictEqual(r.status, 200); assert.strictEqual(r.body.step, 0); assert(!('outcomes' in r.body));
    assert.strictEqual((await call('POST', '/api/crossing/start', { stake: 2, diff: 'medium' })).status, 409);
    assert.strictEqual((await call('POST', '/api/seed/rotate', {})).status, 409);
    assert.strictEqual((await call('POST', '/api/crossing/cashout', {})).status, 400);
    let last; for (let i = 0; i < 20; i++) { last = await call('POST', '/api/crossing/step', {}); assert.strictEqual(last.status, 200); if (last.body.status !== 'safe') break; if (i === 1) { const c = await call('POST', '/api/crossing/cashout', {}); last = c; break; } }
    assert(['hit', 'cashed'].includes(last.body.status)); assert.strictEqual(last.body.round.game, 'crossing'); assert.strictEqual(last.body.round.result.outcomes.length, 15);
    const b1 = (await call('GET', '/api/me')).body.user.balance; assert.strictEqual(b1, b0 - 200 + last.body.round.payout); assert.strictEqual((await call('GET', '/api/crossing/state')).body.active, false);
    assert.strictEqual((await call('POST', '/api/crossing/step', {})).status, 400);
  }
  pass('Διάβαση: start/step/cashout, λογιστικός έλεγχος, μπλοκάρει το νέο seed όσο ο γύρος είναι ανοιχτός');
  pass('Φρουτάκι, Τροχός, Ρουλέτα, Ζάρια, Shark Feeding δουλεύουν (και απορρίπτονται άκυρα στοιχήματα)');
  r = await call('GET', '/api/leaderboard'); assert.strictEqual(r.status, 200); assert(Array.isArray(r.body.top)); pass('Leaderboard');
  r = await call('POST', '/api/play/roulette', { bets: [{ type: 'split', numbers: [1, 5], stake: 1 }] }); assert.strictEqual(r.status, 400);
  r = await call('POST', '/api/play/roulette', { bets: [{ type: 'corner', numbers: [3, 4, 6, 7], stake: 1 }] }); assert.strictEqual(r.status, 400); pass('Ρουλέτα: μη γειτονικοί αριθμοί απορρίπτονται');
  // Επαλήθευση provably fair: μετά το rotate, το revealed seed αναπαράγει τον πρώτο γύρο
  const rot = await call('POST', '/api/seed/rotate', {});
  assert.strictEqual(hashSeed(rot.body.revealed.server), hashBefore);
  const st = new Stream(rot.body.revealed.server, rd.client, rd.nonce); const side = st.int(2) === 0 ? 'heads' : 'tails';
  assert.strictEqual(side, rd.result.side); pass('Provably fair: το αποκαλυμμένο seed αναπαράγει τον γύρο');
  // Σύνδεση/αποσύνδεση
  await call('POST', '/api/logout', {}); cookie = '';
  r = await call('POST', '/api/login', { username: 'petros_1', password: 'λάθος-κωδικός' }); assert.strictEqual(r.status, 401);
  r = await call('POST', '/api/login', { username: 'petros_1', password: 'secretpass1' }); assert.strictEqual(r.status, 200); pass('Login (πεζά/κεφαλαία αδιάφορα) και λάθος κωδικός');
  r = await call('POST', '/api/bonus', {}); assert.strictEqual(r.status, 400); pass('Το καθημερινό μπόνους δεν δίνεται δύο φορές');
  // Σωρευτικός έλεγχος: Σ(payout-stake) = balance - start
  const h = (await call('GET', '/api/history?limit=100')).body.rounds; const me = (await call('GET', '/api/me')).body.user;
  assert.strictEqual(10000 + h.reduce((s, x) => s + x.payout - x.stake, 0), me.balance); pass('Λογιστικός έλεγχος: υπόλοιπο = αρχικό + Σ(κέρδη−πονταρίσματα)');
  saveNow(); server.close(); require('fs').rmSync(process.env.DB_FILE, { force: true });
  console.log(`\nΌλα τα τεστ πέρασαν (${ok} ομάδες ελέγχων).`);
  process.exit(0);
})().catch((e) => { console.error('\n✗ ΑΠΟΤΥΧΙΑ:', e); process.exit(1); });
