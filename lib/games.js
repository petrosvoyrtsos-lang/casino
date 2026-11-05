'use strict';
/*
 * Όλη η λογική των παιχνιδιών τρέχει ΜΟΝΟ στον server.
 * Όλα τα ποσά είναι σε cents (ακέραιοι) και οι πολλαπλασιαστές σε "bp" (1.0000x = 10000).
 */

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
const bad = (m) => new HttpError(400, m);

const MIN_BET = 20;             // 0,20 €
const MAX_BET = 100000;         // 1.000 € ανά επιλογή
const MAX_ROUND = 500000;       // 5.000 € ανά γύρο
const MAX_WIN = 20000000;       // 200.000 € ανώτατο κέρδος ανά γύρο

function cents(x) {
  if (typeof x === 'string' && x.trim() !== '') x = Number(x);
  if (typeof x !== 'number' || !Number.isFinite(x)) throw bad('Μη έγκυρο ποσό πονταρίσματος');
  const c = Math.round(x * 100);
  if (Math.abs(x * 100 - c) > 1e-6) throw bad('Το ποντάρισμα έχει μέγιστο 2 δεκαδικά');
  if (c < MIN_BET || c > MAX_BET) throw bad(`Το ποντάρισμα πρέπει να είναι ${(MIN_BET / 100).toFixed(2)}–${MAX_BET / 100} €`);
  return c;
}
const MIN_MULT_BP = 10100; // κανένα στοίχημα δεν πληρώνει λιγότερο από 1,01×
const pay = (stake, bp) => Math.round((stake * bp) / 10000);
const capWin = (v) => Math.min(v, MAX_WIN);

/* ======================================================================
 * 1. TRAFFIC RUSH
 * ==================================================================== */
const N_CARS = 20;
const EDGE = 0.04;
const COLORS = [
  { n: 'Πράσινο', h: '#22c55e' }, { n: 'Κίτρινο', h: '#facc15' }, { n: 'Μαύρο', h: '#1f2937' },
  { n: 'Κόκκινο', h: '#ef4444' }, { n: 'Άσπρο', h: '#f8fafc' },
];
const PC = 1 / COLORS.length;

const lf = [0]; for (let i = 1; i <= 60; i++) lf[i] = lf[i - 1] + Math.log(i);
const pmf = (n, k, p) => (k < 0 || k > n) ? 0 : Math.exp(lf[n] - lf[k] - lf[n - k] + k * Math.log(p) + (n - k) * Math.log(1 - p));
const cdf = (n, k, p) => { let s = 0; for (let i = 0; i <= Math.min(k, n); i++) s += pmf(n, i, p); return s; };

const COMBOS = [];
(function () {
  const c = [0, 0, 0, 0, 0];
  (function rec(i, left) {
    if (i === 4) {
      c[4] = left; let lg = lf[N_CARS]; for (const x of c) lg -= lf[x];
      COMBOS.push({ c: c.slice(), pr: Math.exp(lg + N_CARS * Math.log(PC)) }); return;
    }
    for (let x = 0; x <= left; x++) { c[i] = x; rec(i + 1, left - x); }
  })(0, N_CARS);
})();
const sumCombos = (f) => COMBOS.reduce((s, o) => s + (f(o.c) ? o.pr : 0), 0);

function pNoRun(k) { // P(κανένα σερί ίδιου χρώματος μήκους >= k)
  let dp = new Array(k).fill(0); dp[1] = 1;
  for (let step = 1; step < N_CARS; step++) {
    const nd = new Array(k).fill(0);
    for (let r = 1; r < k; r++) {
      if (!dp[r]) continue;
      nd[1] += dp[r] * (1 - PC);
      if (r + 1 < k) nd[r + 1] += dp[r] * PC;
    }
    dp = nd;
  }
  return dp.reduce((a, b) => a + b, 0);
}

function analyze(cars) {
  const counts = [0, 0, 0, 0, 0]; cars.forEach((c) => counts[c]++);
  let run = 1, maxRun = 1, changes = 0;
  for (let i = 1; i < cars.length; i++) {
    if (cars[i] === cars[i - 1]) { run++; if (run > maxRun) maxRun = run; } else { run = 1; changes++; }
  }
  const mx = Math.max(...counts);
  return { cars, counts, first: cars[0], last: cars[cars.length - 1], maxRun, changes, topColors: counts.map((c, i) => c === mx ? i : -1).filter((i) => i >= 0) };
}

const colorParam = (k, label) => ({ k, label, vals: [0, 1, 2, 3, 4], labels: COLORS.map((c) => c.n) });
const MARKETS = [
  { id: 'ou', title: 'Over / Under χρώματος', desc: 'Πόσα αμάξια του χρώματος θα περάσουν; (Over 5.5 = 6 ή περισσότερα)',
    params: [colorParam('c', 'Χρώμα'), { k: 'l', label: 'Όριο', vals: [1.5, 2.5, 3.5, 4.5, 5.5, 6.5, 7.5], labels: ['1.5', '2.5', '3.5', '4.5', '5.5', '6.5', '7.5'] }],
    opts: (P) => [
      { key: `ou|${P.c}|${P.l}|o`, label: `Over ${P.l}`, p: 1 - cdf(N_CARS, Math.floor(P.l), PC), win: (r) => r.counts[P.c] > P.l, desc: `${COLORS[P.c].n} Over ${P.l}` },
      { key: `ou|${P.c}|${P.l}|u`, label: `Under ${P.l}`, p: cdf(N_CARS, Math.floor(P.l), PC), win: (r) => r.counts[P.c] < P.l, desc: `${COLORS[P.c].n} Under ${P.l}` }] },
  { id: 'ex', title: 'Ακριβής αριθμός', desc: 'Μάντεψε ακριβώς πόσα αμάξια του χρώματος θα περάσουν.',
    params: [colorParam('c', 'Χρώμα'), { k: 'k', label: 'Αριθμός', vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], labels: ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'] }],
    opts: (P) => [{ key: `ex|${P.c}|${P.k}`, label: `Ακριβώς ${P.k}`, p: pmf(N_CARS, P.k, PC), win: (r) => r.counts[P.c] === P.k, desc: `${COLORS[P.c].n} ακριβώς ${P.k}` }] },
  { id: 'most', title: 'Κυρίαρχο χρώμα', desc: 'Ποιο χρώμα θα έχει τα περισσότερα αμάξια; Αν ισοβαθμούν δύο ή περισσότερα κερδίζει η «Ισοβαθμία».',
    params: [],
    opts: () => [...COLORS.map((col, i) => ({ key: `most|${i}`, label: col.n, p: sumCombos((c) => c.every((x, j) => j === i || c[i] > x)), win: (r) => r.topColors.length === 1 && r.topColors[0] === i, desc: `Κυρίαρχο: ${col.n}` })),
      { key: 'most|tie', label: 'Ισοβαθμία', p: sumCombos((c) => c.filter((x) => x === Math.max(...c)).length > 1), win: (r) => r.topColors.length > 1, desc: 'Κυρίαρχο: ισοβαθμία' }] },
  { id: 'fl', title: 'Πρώτο / Τελευταίο αμάξι', desc: 'Τι χρώμα θα έχει το πρώτο ή το τελευταίο αμάξι που θα περάσει;',
    params: [{ k: 'w', label: 'Θέση', vals: ['first', 'last'], labels: ['Πρώτο', 'Τελευταίο'] }],
    opts: (P) => COLORS.map((col, i) => ({ key: `fl|${P.w}|${i}`, label: col.n, p: PC, win: (r) => r[P.w] === i, desc: `${P.w === 'first' ? 'Πρώτο' : 'Τελευταίο'} αμάξι: ${col.n}` })) },
  { id: 'duel', title: 'Μονομαχία χρωμάτων', desc: 'Ποιο από τα δύο χρώματα θα έχει περισσότερα αμάξια;',
    params: [colorParam('a', 'Χρώμα Α'), colorParam('b', 'Χρώμα Β')],
    opts: (P) => { if (P.a >= P.b) return []; const a = P.a, b = P.b; return [
      { key: `duel|${a}|${b}|a`, label: `${COLORS[a].n} περισσότερα`, p: sumCombos((c) => c[a] > c[b]), win: (r) => r.counts[a] > r.counts[b], desc: `${COLORS[a].n} > ${COLORS[b].n}` },
      { key: `duel|${a}|${b}|t`, label: 'Ίσα', p: sumCombos((c) => c[a] === c[b]), win: (r) => r.counts[a] === r.counts[b], desc: `${COLORS[a].n} = ${COLORS[b].n}` },
      { key: `duel|${a}|${b}|b`, label: `${COLORS[b].n} περισσότερα`, p: sumCombos((c) => c[b] > c[a]), win: (r) => r.counts[b] > r.counts[a], desc: `${COLORS[b].n} > ${COLORS[a].n}` }]; } },
  { id: 'streak', title: 'Σερί χρώματος', desc: 'Θα περάσουν τουλάχιστον Κ αμάξια ίδιου χρώματος συνεχόμενα;',
    params: [{ k: 'k', label: 'Σερί από', vals: [3, 4, 5, 6], labels: ['3+', '4+', '5+', '6+'] }],
    opts: (P) => { const no = pNoRun(P.k); return [
      { key: `st|${P.k}|y`, label: 'Ναι', p: 1 - no, win: (r) => r.maxRun >= P.k, desc: `Σερί ${P.k}+: Ναι` },
      { key: `st|${P.k}|n`, label: 'Όχι', p: no, win: (r) => r.maxRun < P.k, desc: `Σερί ${P.k}+: Όχι` }]; } },
  { id: 'rain', title: 'Ουράνιο τόξο', desc: 'Θα περάσουν και τα 5 χρώματα τουλάχιστον μία φορά;',
    params: [],
    opts: () => { const p = sumCombos((c) => c.every((x) => x > 0)); return [
      { key: 'rb|y', label: 'Ναι', p, win: (r) => r.counts.every((x) => x > 0), desc: 'Ουράνιο τόξο: Ναι' },
      { key: 'rb|n', label: 'Όχι', p: 1 - p, win: (r) => r.counts.some((x) => x === 0), desc: 'Ουράνιο τόξο: Όχι' }]; } },
  { id: 'chg', title: 'Αλλαγές χρώματος', desc: 'Πόσες φορές αλλάζει το χρώμα από αμάξι σε αμάξι (19 μεταβάσεις);',
    params: [{ k: 'l', label: 'Όριο', vals: [13.5, 14.5, 15.5, 16.5, 17.5], labels: ['13.5', '14.5', '15.5', '16.5', '17.5'] }],
    opts: (P) => [
      { key: `ch|${P.l}|o`, label: `Over ${P.l}`, p: 1 - cdf(N_CARS - 1, Math.floor(P.l), 1 - PC), win: (r) => r.changes > P.l, desc: `Αλλαγές Over ${P.l}` },
      { key: `ch|${P.l}|u`, label: `Under ${P.l}`, p: cdf(N_CARS - 1, Math.floor(P.l), 1 - PC), win: (r) => r.changes < P.l, desc: `Αλλαγές Under ${P.l}` }] },
];

const MIN_P = 0.0005, MAX_P = 0.95;
function oddsBp(p) {
  if (!(p >= MIN_P && p <= MAX_P)) return 0;
  const raw = Math.floor(((1 - EDGE) / p) * 10000);
  if (raw < MIN_MULT_BP) return 0;
  return Math.min(10000000, raw);
}
const TRAFFIC_OPTS = new Map();
const TRAFFIC_CATALOG = [];
(function build() {
  const combos = (params) => { let cs = [{}]; for (const pr of params) { const nx = []; for (const c of cs) for (const v of pr.vals) nx.push({ ...c, [pr.k]: v }); cs = nx; } return cs; };
  for (const m of MARKETS) for (const P of combos(m.params)) for (const o of m.opts(P)) {
    const bp = oddsBp(o.p); if (!bp || TRAFFIC_OPTS.has(o.key)) continue;
    TRAFFIC_OPTS.set(o.key, { ...o, bp });
    TRAFFIC_CATALOG.push({ key: o.key, market: m.id, pp: P, label: o.label, desc: o.desc, p: o.p, bp });
  }
})();

const traffic = {
  prepare(body) {
    const arr = body && body.bets;
    if (!Array.isArray(arr) || !arr.length || arr.length > 40) throw bad('Βάλε 1–40 επιλογές στο δελτίο');
    const merged = new Map();
    for (const b of arr) {
      if (!b || typeof b.key !== 'string' || !TRAFFIC_OPTS.has(b.key)) throw bad('Άγνωστη επιλογή');
      const s = cents(b.stake);
      const t = (merged.get(b.key) || 0) + s;
      if (t > MAX_BET) throw bad(`Μέγιστο ${MAX_BET / 100} € ανά επιλογή`);
      merged.set(b.key, t);
    }
    const lines = [...merged].map(([key, stake]) => ({ key, stake, o: TRAFFIC_OPTS.get(key) }));
    const stake = lines.reduce((s, l) => s + l.stake, 0);
    if (stake > MAX_ROUND) throw bad(`Μέγιστο σύνολο ${MAX_ROUND / 100} € ανά γύρο`);
    return {
      stake,
      run(st) {
        const cars = Array.from({ length: N_CARS }, () => st.int(5));
        const r = analyze(cars);
        let payout = 0;
        const out = lines.map((l) => { const won = l.o.win(r); const p = won ? pay(l.stake, l.o.bp) : 0; payout += p; return { desc: l.o.desc, stake: l.stake, bp: l.o.bp, won, payout: p }; });
        return { payout: capWin(payout), result: { cars, counts: r.counts, maxRun: r.maxRun, changes: r.changes }, lines: out };
      },
    };
  },
};

/* ======================================================================
 * 2. ΦΡΟΥΤΑΚΙ 5 τροχών · 3 σειρές · 10 γραμμές · Wild · Scatter · Free Spins
 * ==================================================================== */
const SLOT_SYMS = { C: '🍒', L: '🍋', O: '🍊', G: '🍇', B: '🔔', D: '💎', 7: '7️⃣', W: '👑', X: '⭐' };
const SLOT_L = 24;
function buildStrip(counts) { // ισομοιρασμένα σύμβολα γύρω από τον τροχό (stride 7, gcd(7,24)=1)
  const list = []; for (const [s, c] of Object.entries(counts)) for (let i = 0; i < c; i++) list.push(s);
  if (list.length !== SLOT_L) throw new Error('strip length');
  const out = new Array(SLOT_L); list.forEach((s, i) => { out[(i * 7) % SLOT_L] = s; }); return out;
}
const STRIP_EDGE = buildStrip({ C: 5, L: 6, O: 5, G: 3, B: 2, D: 1, 7: 1, X: 1 });
const STRIP_MID = buildStrip({ C: 5, L: 5, O: 4, G: 3, B: 2, D: 1, 7: 1, W: 2, X: 1 });
const SLOT_STRIPS = [STRIP_EDGE, STRIP_MID, STRIP_MID, STRIP_MID, STRIP_EDGE];
const SLOT_LINES = [[1, 1, 1, 1, 1], [0, 0, 0, 0, 0], [2, 2, 2, 2, 2], [0, 1, 2, 1, 0], [2, 1, 0, 1, 2], [0, 0, 1, 2, 2], [2, 2, 1, 0, 0], [1, 0, 0, 0, 1], [1, 2, 2, 2, 1], [0, 1, 1, 1, 0]];
const SLOT_PAY = { C: [4, 10, 40], L: [4, 10, 40], O: [5, 16, 60], G: [8, 26, 100], B: [15, 50, 200], D: [30, 100, 500], 7: [50, 200, 1000] }; // × στοίχημα γραμμής (3/4/5 ίδια)
const SCAT_PAY = { 3: 3, 4: 15, 5: 75 };               // × συνολικό ποντάρισμα
const FS_MULTS = [1, 1, 1, 2, 2, 2, 3, 3, 3, 5];       // 10 δωρεάν γύροι με αυξανόμενο πολλαπλασιαστή
const FS_SPINS = FS_MULTS.length;

function slotGrid(stops) { // grid[reel][row], row0 = πάνω, row1 = μεσαία (stop), row2 = κάτω
  return stops.map((s, r) => [-1, 0, 1].map((d) => SLOT_STRIPS[r][(s + d + SLOT_L) % SLOT_L]));
}
function slotEval(grid) {
  const wins = []; let sumMult = 0;
  SLOT_LINES.forEach((line, li) => {
    let base = null, count = 0;
    for (let r = 0; r < 5; r++) {
      const s = grid[r][line[r]];
      if (s === 'X') break;
      if (s === 'W') { count++; continue; }
      if (base === null) base = s;
      if (s === base) count++; else break;
    }
    if (count >= 3) { const sym = base === null ? '7' : base; const m = SLOT_PAY[sym][count - 3]; wins.push({ line: li, sym, count, mult: m }); sumMult += m; }
  });
  let scat = 0; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (grid[r][k] === 'X') scat++;
  const scatMult = scat >= 3 ? SCAT_PAY[Math.min(5, scat)] || SCAT_PAY[5] : 0;
  return { wins, sumMult, scat, scatMult };
}
/* ακριβής υπολογισμός: L = RTP γραμμών, S = RTP scatter, pTrig = πιθανότητα bonus (απαρίθμηση και των 24^5 συνδυασμών) */
function slotsStats() {
  const code = { C: 0, L: 1, O: 2, G: 3, B: 4, D: 5, 7: 6, W: 7, X: 8 };
  const cols = SLOT_STRIPS.map((strip) => strip.map((_, s) => [-1, 0, 1].map((d) => code[strip[(s + d + SLOT_L) % SLOT_L]])));
  const pay = [0, 1, 2, 3, 4, 5, 6].map((c) => SLOT_PAY[Object.keys(code).find((k) => code[k] === c)]);
  let sumL = 0, sumS = 0, trig = 0, scatCount = new Array(16).fill(0); const g = new Array(5);
  for (let a = 0; a < SLOT_L; a++) { g[0] = cols[0][a];
    for (let b = 0; b < SLOT_L; b++) { g[1] = cols[1][b];
      for (let c = 0; c < SLOT_L; c++) { g[2] = cols[2][c];
        for (let d = 0; d < SLOT_L; d++) { g[3] = cols[3][d];
          for (let e = 0; e < SLOT_L; e++) { g[4] = cols[4][e];
            let sc = 0; for (let r = 0; r < 5; r++) for (let k = 0; k < 3; k++) if (g[r][k] === 8) sc++;
            if (sc >= 3) { sumS += SCAT_PAY[Math.min(5, sc)]; trig++; }
            for (let li = 0; li < 10; li++) { const ln = SLOT_LINES[li]; let base = -1, cnt = 0;
              for (let r = 0; r < 5; r++) { const s = g[r][ln[r]]; if (s === 8) break; if (s === 7) { cnt++; continue; } if (base < 0) base = s; if (s === base) cnt++; else break; }
              if (cnt >= 3) sumL += pay[base < 0 ? 6 : base][cnt - 3] / 10;
            } } } } } }
  const n = Math.pow(SLOT_L, 5), M = FS_MULTS.reduce((s, x) => s + x, 0);
  const L = sumL / n, S = sumS / n, pTrig = trig / n;
  return { L, S, pTrig, M, rtp: (L + S) * (1 + pTrig * M), baseRtp: L + S };
}
const slots = {
  prepare(body) {
    const stake = cents(body && body.stake);
    return {
      stake,
      run(st) {
        const spins = []; let total = 0;
        const doSpin = (mult) => {
          const stops = Array.from({ length: 5 }, () => st.int(SLOT_L));
          const grid = slotGrid(stops), ev = slotEval(grid);
          const pay = Math.round(((stake * ev.sumMult) + stake * ev.scatMult * 10) * mult / 10);
          spins.push({ stops, grid, wins: ev.wins, scat: ev.scat, scatMult: ev.scatMult, mult, pay }); total += pay; return ev;
        };
        const first = doSpin(1);
        if (first.scat >= 3) for (let i = 0; i < FS_SPINS; i++) doSpin(FS_MULTS[i]);
        const payout = capWin(total);
        return { payout, result: { spins, bonus: first.scat >= 3, total: payout }, lines: [{ desc: first.scat >= 3 ? `Φρουτάκι + ${FS_SPINS} Free Spins` : 'Φρουτάκι', stake, bp: Math.round(payout / stake * 10000), won: payout > 0, payout }] };
      },
    };
  },
};

/* ======================================================================
 * 3. ΤΡΟΧΟΣ ΤΗΣ ΤΥΧΗΣ (20 τμήματα, 3 επίπεδα ρίσκου)
 * ==================================================================== */
function spread(list) { // μοιράζει τα τμήματα ομοιόμορφα γύρω από τον τροχό (40 τμήματα, βήμα πρώτο με το 40)
  const n = list.length, out = new Array(n);
  list.forEach((m, i) => { out[(i * 11) % n] = m; });
  return out;
}
const rep = (m, c) => Array(c).fill(m);
const WN = 40, WB = 16, WCHAIN = 4;
// τμήμα: number = πολλαπλασιαστής (0 = χάνεις) · 'B' = ΜΠΟΝΟΥΣ τροχός · 'R' = επανάληψη (respin)
const bonusScale = (shape, sc) => shape.map((x) => Math.max(2, Math.round(x * sc)));
const BSHAPE = [1, 1, 1, 1.5, 1.5, 2, 2, 2.5, 3, 4, 5, 6, 8, 10, 15, 25];
const WHEELS = {
  low: { main: spread([...rep(0, 16), ...rep(1.2, 10), ...rep(1.5, 9), 2, 'B', 'B', 'R', 'R']), bonus: [1.5, 1.5, 1.5, 2, 2, 2, 2, 3, 3, 3, 4, 5, 5, 8, 10, 20] },
  medium: { main: spread([...rep(0, 30), ...rep(1.5, 3), ...rep(2, 3), ...rep(3, 2), 'B', 'R']), bonus: bonusScale(BSHAPE, 3.76) },
  high: { main: spread([...rep(0, 30), ...rep(2, 3), ...rep(3, 2), ...rep(5, 2), 'B', 'R', 'R']), bonus: [2, 2, 2, 2, 2, 3, 3, 4, 5, 5, 8, 10, 15, 25, 50, 100] },
};
const wheelBp = (m) => Math.round(m * 10000);
// Ένα "σπιν" της αλυσίδας: 2 draws (κύριος τροχός 40, bonus τροχός 16 – το δεύτερο χρησιμοποιείται μόνο αν έρθει B)
const wheel = {
  prepare(body) {
    const stake = cents(body && body.stake);
    const risk = body && body.risk;
    if (!WHEELS[risk]) throw bad('Άγνωστο επίπεδο ρίσκου');
    return {
      stake,
      run(st) {
        const W = WHEELS[risk], spins = []; let payout = 0;
        for (let i = 0; i < WCHAIN; i++) {
          const idx = st.int(WN), bidx = st.int(WB), seg = W.main[idx];
          let kind = 'n', mult = 0, pBp = 0;
          if (seg === 'R') kind = i === WCHAIN - 1 ? 'x' : 'r';
          else if (seg === 'B') { kind = 'b'; mult = W.bonus[bidx]; }
          else mult = seg;
          if (mult) pBp = pay(stake, wheelBp(mult));
          payout += pBp;
          spins.push({ idx, bidx: kind === 'b' ? bidx : null, kind, mult, pay: pBp });
          if (kind !== 'r') break;
        }
        payout = capWin(payout);
        const total = spins.reduce((s, x) => s + x.mult, 0);
        return { payout, result: { risk, spins, mult: total, idx: spins[0].idx }, lines: [{ desc: `Τροχός ${risk}${spins.length > 1 ? ' ×' + spins.length : ''}${spins.some((x) => x.kind === 'b') ? ' + BONUS' : ''}`, stake, bp: Math.round((payout / stake) * 10000), won: payout > 0, payout }] };
      },
    };
  },
};
// Ακριβές RTP: E[ένα σπιν] * (1 + pr + pr² + pr³), pr = πιθανότητα respin (το 4ο respin δεν πληρώνει)
function wheelRtp(risk) {
  const W = WHEELS[risk], bm = W.bonus.reduce((s, m) => s + m, 0) / WB;
  const e = W.main.reduce((s, x) => s + (x === 'B' ? bm : typeof x === 'number' ? x : 0), 0) / WN;
  const pr = W.main.filter((x) => x === 'R').length / WN;
  return e * (1 + pr + pr * pr + pr ** 3);
}
const wheelStats = (risk) => { const W = WHEELS[risk]; return { rtp: wheelRtp(risk), hit: W.main.filter((x) => x !== 0).length / WN }; };

/* ======================================================================
 * 4. ΡΟΥΛΕΤΑ (ευρωπαϊκή, ένα μηδέν)
 * ==================================================================== */
const REDS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const ROUL_TYPES = {
  straight: { v: (v) => Number.isInteger(v) && v >= 0 && v <= 36, win: (n, v) => n === v, mult: 36 },
  red: { win: (n) => REDS.has(n), mult: 2 }, black: { win: (n) => n > 0 && !REDS.has(n), mult: 2 },
  odd: { win: (n) => n > 0 && n % 2 === 1, mult: 2 }, even: { win: (n) => n > 0 && n % 2 === 0, mult: 2 },
  low: { win: (n) => n >= 1 && n <= 18, mult: 2 }, high: { win: (n) => n >= 19 && n <= 36, mult: 2 },
  dozen: { v: (v) => [1, 2, 3].includes(v), win: (n, v) => n >= 1 && Math.ceil(n / 12) === v, mult: 3 },
  column: { v: (v) => [1, 2, 3].includes(v), win: (n, v) => n >= 1 && ((n - 1) % 3) + 1 === v, mult: 3 },
};
const INSIDE_TYPES = new Set(['split', 'street', 'corner', 'sixline', 'trio', 'basket']);
/* στοιχήματα πάνω στο ταμπλό: split (2), street (3), corner (4), sixline (6), trio, basket (πρώτα 4) */
const INSIDE = new Map();
(function () {
  const add = (type, nums, mult) => { const n = [...nums].sort((x, y) => x - y); INSIDE.set(`${type}:${n.join(',')}`, { type, numbers: n, mult }); };
  for (let n = 1; n <= 36; n++) { if (n % 3 !== 0) add('split', [n, n + 1], 18); if (n + 3 <= 36) add('split', [n, n + 3], 18); }
  for (const n of [1, 2, 3]) add('split', [0, n], 18);
  for (let k = 0; k < 12; k++) add('street', [3 * k + 1, 3 * k + 2, 3 * k + 3], 12);
  for (let n = 1; n <= 32; n++) if (n % 3 !== 0) add('corner', [n, n + 1, n + 3, n + 4], 9);
  for (let k = 0; k < 11; k++) add('sixline', [3 * k + 1, 3 * k + 2, 3 * k + 3, 3 * k + 4, 3 * k + 5, 3 * k + 6], 6);
  add('trio', [0, 1, 2], 12); add('trio', [0, 2, 3], 12); add('basket', [0, 1, 2, 3], 9);
})();
const roulette = {
  prepare(body) {
    const arr = body && body.bets;
    if (!Array.isArray(arr) || !arr.length || arr.length > 60) throw bad('Βάλε 1–60 στοιχήματα');
    const merged = new Map();
    for (const b of arr) {
      let key, line;
      if (b && INSIDE_TYPES.has(b.type)) {
        if (!Array.isArray(b.numbers) || b.numbers.length > 6 || !b.numbers.every(Number.isInteger)) throw bad('Μη έγκυρο στοίχημα');
        key = `${b.type}:${[...b.numbers].sort((x, y) => x - y).join(',')}`;
        const ins = INSIDE.get(key); if (!ins) throw bad('Μη έγκυρος συνδυασμός αριθμών');
        line = { type: ins.type, numbers: ins.numbers, mult: ins.mult, desc: `${ins.type} ${ins.numbers.join('-')}` };
      } else {
        const t = b && ROUL_TYPES[b.type]; if (!t) throw bad('Άγνωστο στοίχημα');
        if (t.v && !t.v(b.value)) throw bad('Μη έγκυρη τιμή στοιχήματος');
        key = `${b.type}:${t.v ? b.value : ''}`;
        line = { type: b.type, value: t.v ? b.value : null, mult: t.mult, desc: t.v ? `${b.type} ${b.value}` : b.type };
      }
      const prev = merged.get(key);
      const s = (prev ? prev.stake : 0) + cents(b.stake);
      if (s > MAX_BET) throw bad(`Μέγιστο ${MAX_BET / 100} € ανά στοίχημα`);
      merged.set(key, { ...line, stake: s });
    }
    const lines = [...merged.values()];
    const stake = lines.reduce((s, l) => s + l.stake, 0);
    if (stake > MAX_ROUND) throw bad(`Μέγιστο σύνολο ${MAX_ROUND / 100} € ανά γύρο`);
    return {
      stake,
      run(st) {
        const n = st.int(37); let payout = 0;
        const out = lines.map((l) => {
          const won = l.numbers ? l.numbers.includes(n) : ROUL_TYPES[l.type].win(n, l.value);
          const p = won ? l.stake * l.mult : 0; payout += p;
          return { desc: l.desc, stake: l.stake, bp: l.mult * 10000, won, payout: p };
        });
        return { payout: capWin(payout), result: { n, color: n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black' }, lines: out };
      },
    };
  },
};

/* ======================================================================
 * 5. ΖΑΡΙΑ (δύο πραγματικά ζάρια, στοιχήματα στο άθροισμα)
 * ==================================================================== */
const DICE_RTP = 9700; // 97%
const DICE_TYPES = {
  under7: { ok: (a, b) => a + b < 7, label: 'Κάτω από 7' },
  seven: { ok: (a, b) => a + b === 7, label: 'Ακριβώς 7' },
  over7: { ok: (a, b) => a + b > 7, label: 'Πάνω από 7' },
  even: { ok: (a, b) => (a + b) % 2 === 0, label: 'Ζυγό' },
  odd: { ok: (a, b) => (a + b) % 2 === 1, label: 'Μονό' },
  doubles: { ok: (a, b) => a === b, label: 'Διπλά' },
  total: { v: (v) => Number.isInteger(v) && v >= 2 && v <= 12, ok: (a, b, v) => a + b === v, label: 'Άθροισμα' },
};
function diceCount(type, v) { let c = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (DICE_TYPES[type].ok(a, b, v)) c++; return c; }
const diceBp = (type, v) => Math.floor((DICE_RTP * 36) / diceCount(type, v)); // πολλαπλασιαστής σε basis points
const dice = {
  prepare(body) {
    const arr = body && body.bets;
    if (!Array.isArray(arr) || !arr.length || arr.length > 30) throw bad('Βάλε 1–30 στοιχήματα');
    const merged = new Map();
    for (const b of arr) {
      const t = b && Object.prototype.hasOwnProperty.call(DICE_TYPES, b.type) ? DICE_TYPES[b.type] : null; if (!t) throw bad('Άγνωστο στοίχημα');
      if (t.v && !t.v(b.value)) throw bad('Μη έγκυρο άθροισμα (2–12)');
      const key = `${b.type}:${t.v ? b.value : ''}`; const prev = merged.get(key);
      const stake = (prev ? prev.stake : 0) + cents(b.stake);
      if (stake > MAX_BET) throw bad(`Μέγιστο ${MAX_BET / 100} € ανά στοίχημα`);
      merged.set(key, { type: b.type, value: t.v ? b.value : null, stake, bp: diceBp(b.type, b.value), desc: t.v ? `Άθροισμα ${b.value}` : t.label });
    }
    const lines = [...merged.values()]; const stake = lines.reduce((x, l) => x + l.stake, 0);
    if (stake > MAX_ROUND) throw bad(`Μέγιστο σύνολο ${MAX_ROUND / 100} € ανά γύρο`);
    return {
      stake,
      run(st) {
        const d1 = st.int(6) + 1, d2 = st.int(6) + 1; let payout = 0;
        const out = lines.map((l) => { const won = DICE_TYPES[l.type].ok(d1, d2, l.value); const p = won ? pay(l.stake, l.bp) : 0; payout += p; return { desc: l.desc, stake: l.stake, bp: l.bp, won, payout: p }; });
        return { payout: capWin(payout), result: { d1, d2, total: d1 + d2 }, lines: out };
      },
    };
  },
};

/* ======================================================================
 * 6. ΚΟΡΩΝΑ / ΓΡΑΜΜΑΤΑ
 * ==================================================================== */
const COIN_BP = 19400; // 1.94x → RTP 97%
const coin = {
  prepare(body) {
    const stake = cents(body && body.stake); const side = body && body.side;
    if (side !== 'heads' && side !== 'tails') throw bad('Επίλεξε Κορώνα ή Γράμματα');
    return {
      stake,
      run(st) {
        const r = st.int(2) === 0 ? 'heads' : 'tails'; const won = r === side;
        const payout = won ? pay(stake, COIN_BP) : 0;
        return { payout, result: { side: r, pick: side, won }, lines: [{ desc: `${side === 'heads' ? 'Κορώνα' : 'Γράμματα'}`, stake, bp: COIN_BP, won, payout }] };
      },
    };
  },
};

/* ======================================================================
 * 7. SHARK FEEDING (ο καρχαρίας τρώει ψάρια στον βυθό · over/under)
 * 15 ψάρια, το καθένα το τρώει με πιθανότητα 1/3 (ανεξάρτητα) → N ~ Binomial(15, 1/3).
 * Στοιχήματα: Over x.5, Under x.5 (2.5–9.5) και ακριβής αριθμός (1–9).
 * ==================================================================== */
const SHARK_FISH = 15, SHARK_P = 1 / 3, SHARK_LINES = Array.from({ length: 15 }, (_, i) => i + 0.5), SHARK_EXACT = Array.from({ length: 16 }, (_, i) => i);
const SHARK_PMF = (() => { const c = [1]; for (let n = 1; n <= SHARK_FISH; n++) c.push((c[n - 1] * (SHARK_FISH - n + 1)) / n); return c.map((k, n) => k * Math.pow(SHARK_P, n) * Math.pow(1 - SHARK_P, SHARK_FISH - n)); })();
function sharkProb(type, v) {
  let p = 0; for (let n = 0; n <= SHARK_FISH; n++) if (type === 'over' ? n > v : type === 'under' ? n < v : n === v) p += SHARK_PMF[n]; return p;
}
const sharkBp = (type, v) => Math.floor(DICE_RTP / sharkProb(type, v));
const SHARK_MAX_BP = 200000000; // ανώτατο προσφερόμενο 20.000×
const sharkValid = (type, v) => (type === 'exact' ? SHARK_EXACT.includes(v) : (type === 'over' || type === 'under') && SHARK_LINES.includes(v)) && sharkBp(type, v) >= MIN_MULT_BP && sharkBp(type, v) <= SHARK_MAX_BP;  // πολλαπλασιαστής σε basis points (RTP 97%)
const shark = {
  prepare(body) {
    const arr = body && body.bets;
    if (!Array.isArray(arr) || !arr.length || arr.length > 20) throw bad('Βάλε 1–20 στοιχήματα');
    const merged = new Map();
    for (const b of arr) {
      if (!b || !sharkValid(b.type, b.value)) throw bad('Μη έγκυρο στοίχημα');
      const key = `${b.type}:${b.value}`; const prev = merged.get(key); const stake = (prev ? prev.stake : 0) + cents(b.stake);
      if (stake > MAX_BET) throw bad(`Μέγιστο ${MAX_BET / 100} € ανά στοίχημα`);
      merged.set(key, { type: b.type, value: b.value, stake, bp: sharkBp(b.type, b.value), desc: b.type === 'exact' ? `Ακριβώς ${b.value}` : `${b.type === 'over' ? 'Over' : 'Under'} ${b.value}` });
    }
    const lines = [...merged.values()]; const stake = lines.reduce((x, l) => x + l.stake, 0);
    if (stake > MAX_ROUND) throw bad(`Μέγιστο σύνολο ${MAX_ROUND / 100} € ανά γύρο`);
    return {
      stake,
      run(st) {
        const eaten = []; for (let i = 0; i < SHARK_FISH; i++) if (st.int(3) === 0) eaten.push(i);
        const n = eaten.length; let payout = 0;
        const out = lines.map((l) => { const won = l.type === 'over' ? n > l.value : l.type === 'under' ? n < l.value : n === l.value; const p = won ? pay(l.stake, l.bp) : 0; payout += p; return { desc: l.desc, stake: l.stake, bp: l.bp, won, payout: p }; });
        return { payout: capWin(payout), result: { eaten, count: n, fish: SHARK_FISH }, lines: out };
      },
    };
  },
};

/* ======================================================================
 * 8. ΔΙΑΒΑΣΗ (ένας άνθρωπος διασχίζει δρόμο με 15 λωρίδες · cash out οποιαδήποτε στιγμή)
 * Κάθε λωρίδα έχει πιθανότητα χτυπήματος hit%. Μετά από k ασφαλείς λωρίδες ο πολλαπλασιαστής
 * είναι 0.97 / (1-hit)^k. Τα αποτελέσματα και των 15 λωρίδων προκύπτουν από το provably fair
 * stream στην αρχή του γύρου (1 draw των 100 ανά λωρίδα) και δεν αποκαλύπτονται πριν τελειώσει.
 * ==================================================================== */
const CROSS_LANES = 15, CROSS_DEN = 100, CROSS_MAX_BP = 10000000;
const CROSS_DIFFS = { easy: { hit: 8, name: 'Εύκολο' }, medium: { hit: 18, name: 'Μεσαίο' }, hard: { hit: 30, name: 'Δύσκολο' }, extreme: { hit: 45, name: 'Ακραίο' } };
const crossBp = (diff, k) => Math.floor(DICE_RTP * Math.pow(CROSS_DEN / (CROSS_DEN - CROSS_DIFFS[diff].hit), k));
function crossMax(diff) { let k = 0; while (k < CROSS_LANES && crossBp(diff, k + 1) <= CROSS_MAX_BP) k++; return k; }
function crossOutcomes(st, diff) { const h = CROSS_DIFFS[diff].hit; return Array.from({ length: CROSS_LANES }, () => st.int(CROSS_DEN) < h); } // true = χτύπημα

/* ====================================================================== */
const GAMES = { traffic, slots, wheel, roulette, dice, coin, shark };

function catalog() {
  return {
    limits: { min: MIN_BET, max: MAX_BET, round: MAX_ROUND, maxWin: MAX_WIN },
    traffic: {
      cars: N_CARS, edge: EDGE, colors: COLORS,
      markets: MARKETS.map((m) => ({ id: m.id, title: m.title, desc: m.desc, params: m.params })),
      options: TRAFFIC_CATALOG,
    },
    slots: { syms: SLOT_SYMS, strips: SLOT_STRIPS, lines: SLOT_LINES, pay: SLOT_PAY, scat: SCAT_PAY, fsMults: FS_MULTS },
    wheel: { main: Object.fromEntries(Object.keys(WHEELS).map((k) => [k, WHEELS[k].main])), bonus: Object.fromEntries(Object.keys(WHEELS).map((k) => [k, WHEELS[k].bonus])), rtp: Object.fromEntries(Object.keys(WHEELS).map((k) => [k, wheelRtp(k)])), chain: WCHAIN },
    roulette: { reds: [...REDS] },
    dice: { rtp: DICE_RTP / 10000, mult: Object.fromEntries([...Object.keys(DICE_TYPES).filter((k) => !DICE_TYPES[k].v).map((k) => [k, diceBp(k) / 10000]), ...[2,3,4,5,6,7,8,9,10,11,12].map((n) => ['total' + n, diceBp('total', n) / 10000])]) },
    coin: { mult: COIN_BP / 10000 },
    crossing: { lanes: CROSS_LANES, diffs: Object.fromEntries(Object.entries(CROSS_DIFFS).map(([k, d]) => [k, { name: d.name, hit: d.hit, max: crossMax(k), ladder: Array.from({ length: crossMax(k) }, (_, i) => crossBp(k, i + 1) / 10000) }])) },
    shark: { fish: SHARK_FISH, lines: SHARK_LINES, exact: SHARK_EXACT, over: Object.fromEntries(SHARK_LINES.map((l) => [l, { bp: sharkBp('over', l) / 10000, p: sharkProb('over', l), ok: sharkValid('over', l) }])), under: Object.fromEntries(SHARK_LINES.map((l) => [l, { bp: sharkBp('under', l) / 10000, p: sharkProb('under', l), ok: sharkValid('under', l) }])), exactMap: Object.fromEntries(SHARK_EXACT.map((n) => [n, { bp: sharkBp('exact', n) / 10000, p: sharkProb('exact', n), ok: sharkValid('exact', n) }])), pmf: SHARK_PMF },
    draws: { traffic: Array(N_CARS).fill(5), slots: Array(5 * (1 + FS_SPINS)).fill(SLOT_L), wheel: Array(WCHAIN * 2).fill(0).map((_, i) => (i % 2 ? WB : WN)), roulette: [37], dice: [6, 6], coin: [2], shark: Array(SHARK_FISH).fill(3), crossing: Array(CROSS_LANES).fill(CROSS_DEN) },
  };
}

module.exports = { MIN_MULT_BP, wheelStats, GAMES, HttpError, catalog, TRAFFIC_OPTS, slotsStats, wheelRtp, WHEELS, analyze, N_CARS, COLORS, EDGE, DICE_RTP, CROSS_LANES, CROSS_DIFFS, crossBp, crossMax, crossOutcomes, capWin, pay, cents, SHARK_LINES, SHARK_EXACT, SHARK_FISH, sharkBp, sharkProb, DICE_TYPES, diceCount, diceBp, COIN_BP, MAX_WIN, ROUL_TYPES, REDS, INSIDE };
