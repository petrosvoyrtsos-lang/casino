'use strict';
/* Core: API, router, σύνδεση/εγγραφή, lobby, προφίλ, provably fair επαλήθευση */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const el = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
const money = (c) => (c / 100).toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const GAME_NAMES = { traffic: 'Traffic Rush', slots: 'Φρουτάκι', wheel: 'Τροχός Τύχης', roulette: 'Ρουλέτα', dice: 'Ζάρια', coin: 'Κορώνα-Γράμματα', shark: 'Καρχαρίας', crossing: 'Διάβαση' };

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), credentials: 'same-origin' });
  let data = {}; try { data = await res.json(); } catch { /* ignore */ }
  if (!res.ok) { const e = new Error(data.error || 'Σφάλμα'); e.status = res.status; throw e; }
  return data;
}
function toast(msg, bad) {
  const t = el(`<div class="toast ${bad ? 'bad' : ''}">${esc(msg)}</div>`); $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 4500);
}

const App = {
  me: null, catalog: null, cleanup: null, shown: 0,
  stake: (() => { try { const v = Number(localStorage.getItem('tr_stake')); return v >= 0.2 && v <= 1000 ? v : 1; } catch { return 1; } })(),
  setStake(v) { this.stake = v; try { localStorage.setItem('tr_stake', String(v)); } catch { /* ignore */ } },

  /* υπόλοιπο στην κεφαλίδα */
  showBalance(c, pop) {
    this.shown = c; const b = $('#bal'); if (!b) return; b.textContent = money(c);
    if (pop) { const bx = $('#balbox'); bx.classList.remove('pop'); void bx.offsetWidth; bx.classList.add('pop'); }
  },
  /* κλήση παιχνιδιού: ο server ξεχωρίζει αμέσως το ποντάρισμα, εμείς δείχνουμε το υπόλοιπο μετά το animation */
  /* το υπόλοιπο του browser μπορεί να είναι παλιό· πριν πούμε "δεν έχεις υπόλοιπο" ρωτάμε τον server */
  async ensure(stakeCents) {
    if (stakeCents <= this.me.balance) return;
    try { const u = (await api('GET', '/api/me')).user; this.me.balance = u.balance; this.showBalance(u.balance); } catch { /* ignore */ }
    if (stakeCents > this.me.balance) { Sound.error(); throw new Error('Δεν έχεις αρκετό υπόλοιπο'); }
  },
  async play(game, body, stakeCents) {
    await this.ensure(stakeCents);
    this.showBalance(this.me.balance - stakeCents);
    try {
      const res = await api('POST', '/api/play/' + game, body);
      this.me.balance = res.balance; this.me.seed.nonce = res.round.nonce + 1; this.updateFair();
      return res;
    } catch (e) { this.showBalance(this.me.balance); Sound.error(); throw e; }
  },
  settle(res) {
    const r = res.round; this.me.balance = res.balance; this.showBalance(res.balance, r.payout > 0);
    const st = this.me.stats; st.rounds++; st.wagered += r.stake; st.won += r.payout; if (r.payout > st.best) { st.best = r.payout; st.bestGame = r.game; }
    this.refreshVip();
    if (r.payout >= r.stake * 15) this.bigWin(r);
    if (r.payout === 0) Sound.lose();
    else if (r.payout < r.stake) Sound.click();
    else { const x = r.payout / r.stake; Sound.win(x >= 20 ? 3 : x >= 4 ? 2 : 1); }
    if (res.balance < 100) toast('Σου τελείωσε το υπόλοιπο! Πάρε το μπόνους από το προφίλ σου.', true);
  },
  fairLine() { const s = this.me.seed; return `<span class="small mute">Provably fair · nonce #${s.nonce} · seed hash <span class="mono" id="fairhash">${esc(s.hash.slice(0, 16))}…</span></span>`; },
  updateFair() { const e = $('#fairline'); if (e) e.innerHTML = this.fairLine(); },
  msg(box, kind, text) { box.className = 'msg ' + kind; box.textContent = text; },
  resultMsg(box, r) {
    const net = r.payout - r.stake;
    this.msg(box, net > 0 ? 'win' : net === 0 && r.payout > 0 ? 'info' : 'lose', net > 0 ? `🎉 Κέρδος ${money(net)} (επιστροφή ${money(r.payout)})` : net === 0 && r.payout > 0 ? 'Πήρες πίσω το ποντάρισμά σου' : `Απώλεια ${money(-net)}`);
  },
};
const Games = {};

/* ---- VIP επίπεδα (με βάση το σύνολο πονταρισμάτων) ---- */
const LEVELS = [{ n: 'Χάλκινος', min: 0, c: '#cd7f32', i: '🥉' }, { n: 'Ασημένιος', min: 200, c: '#c0c7d6', i: '🥈' }, { n: 'Χρυσός', min: 1000, c: '#f6c744', i: '🥇' }, { n: 'Πλατινένιος', min: 5000, c: '#7dd3fc', i: '💎' }, { n: 'Διαμάντι', min: 25000, c: '#c084fc', i: '👑' }];
function vipInfo(wageredCents) {
  const w = wageredCents / 100; let li = 0; LEVELS.forEach((l, i) => { if (w >= l.min) li = i; });
  const lvl = LEVELS[li], next = LEVELS[li + 1] || null;
  return { lvl, next, pct: next ? Math.min(100, (w - lvl.min) / (next.min - lvl.min) * 100) : 100, left: next ? next.min - w : 0 };
}
App.refreshVip = function () { const e = $('#vipchip'); if (e) { const v = vipInfo(this.me.stats.wagered); e.textContent = v.lvl.i + ' ' + v.lvl.n; e.style.color = v.lvl.c; } };
App.claimBonus = async function (after) {
  try { const r = await api('POST', '/api/bonus', {}); Object.assign(App.me, r.user); Sound.bonus(); App.showBalance(App.me.balance, true); toast('Πήρες 50 € demo!'); if (after) after(); }
  catch (er) { toast(er.message, true); }
};
/* ---- επικάλυψη μεγάλης νίκης ---- */
App.bigWin = function (r) {
  const x = r.payout / r.stake, tier = x >= 200 ? ['ΜΕΓΑ ΝΙΚΗ', '#c084fc'] : x >= 50 ? ['ΤΕΡΑΣΤΙΑ ΝΙΚΗ', '#f6c744'] : ['ΜΕΓΑΛΗ ΝΙΚΗ', '#4ade80'];
  const o = el(`<div class="bigwin"><div class="bwbox"><div class="bwtitle" style="color:${tier[1]}">${tier[0]}</div><div class="bwamt" id="bwamt">0,00 €</div><div class="bwx">${x.toFixed(1)}× το ποντάρισμα</div></div></div>`);
  for (let i = 0; i < 46; i++) { const c = el(`<span class="coinfall">🪙</span>`); c.style.left = Math.random() * 100 + '%'; c.style.animationDelay = Math.random() * 1.6 + 's'; c.style.animationDuration = 1.6 + Math.random() * 1.6 + 's'; c.style.fontSize = 20 + Math.random() * 26 + 'px'; o.appendChild(c); }
  document.body.appendChild(o); Sound.coins();
  const t0 = performance.now(); (function tick(now) { const u = Math.min(1, (now - t0) / 2200); const e = $('#bwamt'); if (!e) return; e.textContent = money(Math.round(r.payout * (1 - Math.pow(1 - u, 3)))); if (u < 1) requestAnimationFrame(tick); })(t0);
  const close = () => { o.classList.add('out'); setTimeout(() => o.remove(), 400); };
  o.onclick = close; setTimeout(close, 4800);
};

/* ---- στοιχεία ελέγχου ποσού πονταρίσματος (κοινό σε όλα τα παιχνίδια) ---- */
function stakeBox(extra = '') {
  return `<div class="stake"><div class="f"><label>Ποντάρισμα (€)</label><input type="number" id="stake" min="0.2" max="1000" step="0.1" value="${App.stake}" inputmode="decimal"></div>
    <div class="qs"><button data-q="half">½</button><button data-q="dbl">2×</button>${[0.2, 0.5, 1, 5, 10, 25].map((x) => `<button data-s="${x}">${String(x).replace('.', ',')}</button>`).join('')}<button data-s="max">Max</button></div>${extra}</div>`;
}
function wireStake(root) {
  const inp = $('#stake', root); if (!inp) return () => App.stake;
  const norm = (v) => { v = Number(v); if (!isFinite(v)) v = 1; return Math.max(0.2, Math.min(1000, Math.round(v * 100) / 100)); };
  const set = (v) => { v = norm(v); inp.value = v; App.setStake(v); inp.dispatchEvent(new Event('input')); Sound.click(); };
  inp.addEventListener('change', () => { const v = norm(inp.value); inp.value = v; App.setStake(v); inp.dispatchEvent(new Event('input')); });
  $$('[data-s]', root).forEach((b) => b.onclick = () => set(b.dataset.s === 'max' ? Math.min(1000, Math.floor(App.me.balance) / 100) || 0.2 : Number(b.dataset.s)));
  $$('[data-q]', root).forEach((b) => b.onclick = () => set(b.dataset.q === 'half' ? Number(inp.value) / 2 : Number(inp.value) * 2));
  return () => norm(inp.value);
}

const SV = (d, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`;
const GICO = {
  lobby: SV('<path d="M4 11l8-6.5L20 11v8.5a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>'),
  traffic: SV('<path d="M4.5 15.5l1.6-5a2 2 0 0 1 1.9-1.4h8a2 2 0 0 1 1.9 1.4l1.6 5"/><rect x="3.5" y="15.5" width="17" height="3.5" rx="1"/><path d="M6.5 19v1.5M17.5 19v1.5"/><circle cx="7.5" cy="17.2" r=".6"/><circle cx="16.5" cy="17.2" r=".6"/>'),
  slots: SV('<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M9 5v14M15 5v14"/><circle cx="6" cy="12" r="1.2"/><path d="M11 10.5l1 1.5-1 1.5M16.8 10.8l.9 1.2-.9 1.2"/>'),
  shark: SV('<path d="M2.5 15.5c3.600-4 8.500-5.200 13.200-3.600 1.200-1.800 2.800-2.800 5-3.100-.6 1.800-.8 3.200-.4 4.500.4 1.300 1.200 2.200 2.400 2.900-2.800.6-5 .2-6.600-1.100-3.400 1.800-8.200 1.800-13.600.4z"/><path d="M9.500 11.600 12 6l1.600 5.200M6 14.500h.01"/>'),
  crossing: SV('<circle cx="12" cy="4.8" r="1.9"/><path d="M12 8v6.2M8.6 11.2l3.4-1.4 3.4 1.4M12 14.2l-3 6.3M12 14.2l3 6.3"/><path d="M3 22h3m3 0h3m3 0h3m3 0h0"/>'),
  roulette: SV('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.4"/><path d="M12 3v5.6M12 15.4V21M3 12h5.6M15.4 12H21M5.6 5.6l4 4M14.4 14.4l4 4M18.4 5.6l-4 4M9.6 14.4l-4 4"/>'),
  wheel: SV('<circle cx="12" cy="11" r="8"/><circle cx="12" cy="11" r="2"/><path d="M12 3v6M12 13v6M4 11h6M14 11h6M6.3 5.3l4.3 4.3M13.4 12.4l4.3 4.3M17.7 5.3l-4.3 4.3M10.6 12.4l-4.3 4.3M8 21h8"/>'),
  dice: SV('<rect x="4" y="4" width="16" height="16" rx="3.5"/><circle cx="8.6" cy="8.6" r="1" fill="currentColor"/><circle cx="15.4" cy="8.6" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="8.6" cy="15.4" r="1" fill="currentColor"/><circle cx="15.4" cy="15.4" r="1" fill="currentColor"/>'),
  coin: SV('<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="6"/><path d="M14.3 9.7a2.8 2.8 0 1 0 0 4.6M9 11.3h4.4M9 12.9h4.4"/>'),
  user: SV('<circle cx="12" cy="8" r="3.6"/><path d="M4.8 20c.7-3.6 3.6-5.6 7.2-5.6s6.5 2 7.2 5.6"/>'),
  grid: SV('<rect x="4" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4"/><rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4"/><rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4"/>'),
  check: SV('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  shield: SV('<path d="M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z"/><path d="M8.8 12l2.4 2.4 4-4.5"/>'),
  bolt: SV('<path d="M13 3L5 13.5h6L10 21l8-10.5h-6z"/>'),
  coins: SV('<circle cx="9" cy="9" r="5.5"/><path d="M14.5 6.3A5.5 5.5 0 1 1 9.4 14.5"/>'),
  sound: SV('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.8a7.5 7.5 0 0 1 0 10.4"/>'),
  mute: SV('<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M16 9.5l5 5M21 9.5l-5 5"/>'),
};
/* ======================= Router / Shell ======================= */
const GEMO = { slots: '🍒', traffic: '🚗', wheel: '🎡', roulette: '🎰', dice: '🎲', crossing: '🚶', shark: '🦈', coin: '🪙', lobby: '🏠', user: '👤', grid: '🎮' };
const NAV_NAMES = { wheel: 'Τροχός', coin: 'Κορώνα', traffic: 'Traffic Rush' };
const ROUTES = ['lobby', 'traffic', 'slots', 'wheel', 'roulette', 'dice', 'coin', 'shark', 'crossing', 'profile', 'cashier'];
function route() { const r = (location.hash || '#/lobby').replace('#/', ''); return ROUTES.includes(r) ? r : 'lobby'; }

function renderShell() {
  const u = App.me;
  $('#app').innerHTML = `
  <header class="top">
    <div class="logo" id="logo"><span class="lg-car">🚗</span><b>TRAFFIC <span>RUSH</span></b></div>
    <nav class="nav" id="nav">
      <a href="#/lobby"><i>🏠</i> Αρχική</a>
      ${['slots', 'traffic', 'shark', 'crossing', 'roulette', 'wheel', 'dice', 'coin'].map((g) => `<a href="#/${g}"><i>${GEMO[g]}</i> ${NAV_NAMES[g] || GAME_NAMES[g]}</a>`).join('')}
    </nav>
    <div class="row" style="gap:8px">
      <button class="ghost iconbtn" id="mute" title="Ήχος">${Sound.muted ? '🔇' : '🔊'}</button>
      <input type="range" class="vol" id="vol" min="0" max="1" step="0.05" value="${Sound.volume}" title="Ένταση">
    </div>
    <a class="cashbtn" href="#/cashier" title="Ταμείο">Ταμείο</a>
    <div class="balbox" id="balbox" title="Εικονικά ευρώ: δεν είναι πραγματικά χρήματα">💶 <b id="bal">${money(u.balance)}</b> <span class="demo">DEMO</span></div>
    <a class="userchip" href="#/profile" style="text-decoration:none;color:inherit"><div class="avatar">${esc(u.username[0].toUpperCase())}</div><span>${esc(u.username)}<br><small id="vipchip" class="vip"></small></span></a>
  </header>
  <div class="demobar">DEMO · Παίζεις με εικονικά ευρώ (€) — καμία πραγματική συναλλαγή <span id="sessinfo" class="sess"></span></div>
  <main id="view"></main>
  <nav class="bnav" id="bnav"><a href="#/lobby">🏠<span>Αρχική</span></a><a href="#/slots">🍒<span>Φρουτάκι</span></a><a href="#/traffic">🚗<span>Traffic</span></a><a href="#/shark">🦈<span>Καρχαρίας</span></a><a href="#" id="morebtn">🎮<span>Όλα</span></a><a href="#/profile">👤<span>Προφίλ</span></a></nav>
  <footer><div class="small mute" style="margin-bottom:6px">Έκδοση 8 παιχνιδιών · build ${App.catalog.build || '-'}</div><b>DEMO</b> · Παίζεις με εικονικά ευρώ (€). Δεν γίνονται πραγματικές συναλλαγές και δεν υπάρχει ανάληψη. Μόνο για άτομα άνω των 18. Παίξε υπεύθυνα.</footer>`;
  $('#logo').onclick = () => { location.hash = '#/lobby'; };
  $('#morebtn').onclick = (e) => { e.preventDefault(); Sound.click(); App.gameSheet(); }; App.updateSess();
  $('#mute').onclick = () => { Sound.ensure(); Sound.setMuted(!Sound.muted); $('#mute').textContent = Sound.muted ? '🔇' : '🔊'; Sound.click(); };
  $('#vol').oninput = (e) => { Sound.ensure(); Sound.setVolume(Number(e.target.value)); };
}

function show() {
  if (!App.me) return renderAuth();
  if (!$('#view')) renderShell();
  if (App.cleanup) { try { App.cleanup(); } catch { /* ignore */ } App.cleanup = null; }
  const r = route(); const view = $('#view');
  $$('#nav a, #bnav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#/' + r));
  App.refreshVip(); view.className = ''; void view.offsetWidth; view.className = 'fadein';
  view.innerHTML = '';
  if (r === 'lobby') renderLobby(view);
  else if (r === 'profile') renderProfile(view);
  else if (r === 'cashier') renderCashier(view);
  else App.cleanup = Games[r].mount(view) || null;
  App.showBalance(App.me.balance);
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', () => { if (App.me) show(); });
document.addEventListener('pointerdown', () => Sound.ensure(), { once: true });

/* ======================= Σύνδεση / Εγγραφή ======================= */
const COUNTRIES = ['Ελλάδα', 'Κύπρος', 'Γερμανία', 'Γαλλία', 'Ιταλία', 'Ισπανία', 'Ηνωμένο Βασίλειο', 'ΗΠΑ', 'Καναδάς', 'Αυστραλία', 'Αλβανία', 'Βουλγαρία', 'Ρουμανία', 'Τουρκία', 'Άλλη'];
const eye = (n) => `<button type="button" class="eye" data-eye="${n}" title="Εμφάνιση/απόκρυψη κωδικού" tabindex="-1">👁</button>`;
const lsGet = (k) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };
function renderAuth(mode = 'login', keep = {}) {
  App.cleanup && App.cleanup(); App.cleanup = null;
  const val = (n, d = '') => esc(keep[n] !== undefined ? keep[n] : d);
  const floaters = ['🚗', '🦈', '🎰', '🎲', '🪙', '🍒', '🎡', '💎'].map((e, i) => `<span style="left:${6 + i * 12}%;animation-delay:${-i * 1.7}s;animation-duration:${9 + (i % 4) * 2}s">${e}</span>`).join('');
  $('#app').innerHTML = `
  <div class="auth2">
    <section class="showcase"><div class="floaters">${floaters}</div>
      <div class="sc-in"><div class="sc-logo"><span class="lg-car">🚗</span><b>TRAFFIC <span>RUSH</span></b></div>
        <h1>Παίξε με εικονικά ευρώ, με πραγματική διαφάνεια</h1>
        <p>8 παιχνίδια, provably fair RNG και καμία πραγματική συναλλαγή. Ξεκίνα με <b>100 €</b> δώρο.</p>
        <ul class="sc-list"><li><em>🛡️</em><span><b>Provably fair</b><small>Κάθε γύρος επαληθεύεται με το seed που αποκαλύπτεται</small></span></li><li><em>🎰</em><span><b>Οκτώ παιχνίδια</b><small>Φρουτάκι, Traffic Rush, Καρχαρίας, Διάβαση, Ρουλέτα, Τροχός, Ζάρια, Κορώνα-Γράμματα</small></span></li><li><em>⚡</em><span><b>Μικρά πονταρίσματα</b><small>Από 0,20 € και καθαρό RTP 96–97%</small></span></li></ul>
        <div class="sc-badges"><span>Μόνο για 18+</span><span>Χωρίς πραγματικά χρήματα</span><span>Παίξε υπεύθυνα</span></div></div></section>
    <div class="card authcard" id="acard">
      <div class="tabs"><button type="button" data-m="login" class="${mode === 'login' ? 'on' : ''}">Σύνδεση</button><button type="button" data-m="register" class="${mode === 'register' ? 'on' : ''}">Δημιουργία λογαριασμού</button></div>
      <div class="err" id="ferr" hidden></div>
      ${mode === 'login' ? `
      <h2 class="ah">Καλώς ήρθες ξανά 👋</h2>
      <form id="f" class="form" autocomplete="on" novalidate>
        <div class="full"><label>Όνομα χρήστη</label><input name="username" autocomplete="username" value="${val('username', lsGet('tr_user'))}" required></div>
        <div class="full"><label>Κωδικός</label><div class="pw"><input name="password" type="password" autocomplete="current-password" required>${eye('password')}</div></div>
        <div class="full"><button class="primary" style="width:100%"><span class="bt">Σύνδεση</span></button></div>
        <div class="full small mute" style="text-align:center">Δεν έχεις λογαριασμό; <a href="#" data-m="register" class="lnk">Δημιούργησε έναν δωρεάν</a></div>
      </form>` : `
      <h2 class="ah">Ξεκίνα με 100 € δώρο 🎁</h2>
      <form id="f" class="form" autocomplete="on" novalidate>
        <div><label>Όνομα χρήστη *</label><input name="username" autocomplete="username" value="${val('username')}" placeholder="π.χ. takis_77" required><small class="hint" data-h="username">3–20 γράμματα, αριθμοί ή _</small></div>
        <div><label>Email *</label><input name="email" type="email" autocomplete="email" value="${val('email')}" required><small class="hint" data-h="email"></small></div>
        <div class="full"><label>Ονοματεπώνυμο *</label><input name="fullName" autocomplete="name" value="${val('fullName')}" required></div>
        <div><label>Ημερομηνία γέννησης * (18+)</label><input name="dob" type="date" value="${val('dob')}" required><small class="hint" data-h="dob"></small></div>
        <div><label>Χώρα *</label><input name="country" list="countries" value="${val('country', 'Ελλάδα')}" required><datalist id="countries">${COUNTRIES.map((c) => `<option value="${c}">`).join('')}</datalist></div>
        <div class="full"><label>Τηλέφωνο (προαιρετικό)</label><input name="phone" type="tel" autocomplete="tel" value="${val('phone')}"></div>
        <div><label>Κωδικός * (τουλάχιστον 8)</label><div class="pw"><input name="password" type="password" autocomplete="new-password" value="${val('password')}" required>${eye('password')}</div><div class="meter"><i id="pm"></i></div><small class="hint" data-h="password"></small></div>
        <div><label>Επιβεβαίωση κωδικού *</label><div class="pw"><input name="password2" type="password" autocomplete="new-password" value="${val('password2')}" required>${eye('password2')}</div><small class="hint" data-h="password2"></small></div>
        <label class="chk full"><input type="checkbox" name="terms" ${keep.terms ? 'checked' : ''}> Είμαι άνω των 18 ετών, κατανοώ ότι το παιχνίδι γίνεται με εικονικά ευρώ (demo, χωρίς πραγματικές συναλλαγές ή αναλήψεις) και αποδέχομαι τους όρους χρήσης.</label>
        <div class="full"><button class="primary" style="width:100%"><span class="bt">Δημιουργία λογαριασμού (+100 € demo δώρο)</span></button></div>
        <div class="full small mute" style="text-align:center">Έχεις ήδη λογαριασμό; <a href="#" data-m="login" class="lnk">Σύνδεση</a></div>
      </form>`}
    </div>
  </div>`;
  const form = $('#f'), ferr = $('#ferr'), card = $('#acard');
  const F = (n) => form.elements[n];
  const snapshot = () => Object.fromEntries([...new FormData(form)].filter(([k]) => k !== 'terms').concat(F('terms') ? [['terms', F('terms').checked]] : []));
  $$('[data-m]', card).forEach((b) => b.onclick = (e) => { e.preventDefault(); const s = snapshot(); renderAuth(b.dataset.m, { username: s.username, email: s.email, fullName: s.fullName }); });
  $$('.eye', form).forEach((b) => b.onclick = () => { const i = F(b.dataset.eye); i.type = i.type === 'password' ? 'text' : 'password'; b.classList.toggle('on', i.type === 'text'); });
  const hint = (n, t, bad) => { const h = $(`[data-h="${n}"]`, form); if (!h) return; h.textContent = t; h.classList.toggle('bad', !!bad); h.classList.toggle('okk', !bad && !!t && n !== 'username'); F(n).classList.toggle('invalid', !!bad); };
  const showErr = (msg, field) => {
    ferr.textContent = msg; ferr.hidden = false; card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake');
    if (field && F(field)) { F(field).classList.add('invalid'); F(field).focus(); F(field).select && F(field).type !== 'date' && F(field).select(); }
  };
  form.addEventListener('input', (e) => { ferr.hidden = true; e.target.classList && e.target.classList.remove('invalid'); if (mode === 'register') live(e.target.name); });
  function ageOk(d) { if (!d) return false; const b = new Date(d), n = new Date(); let y = n.getFullYear() - b.getFullYear(); if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) y--; return y >= 18 && y < 120; }
  function live(name) {
    if (name === 'email') hint('email', F('email').value && !/^\S+@\S+\.\S+$/.test(F('email').value) ? 'Μη έγκυρο email' : '', F('email').value && !/^\S+@\S+\.\S+$/.test(F('email').value));
    if (name === 'username') { const ok = !F('username').value || /^[A-Za-z0-9_]{3,20}$/.test(F('username').value); hint('username', ok ? '3–20 γράμματα, αριθμοί ή _' : 'Μόνο λατινικά γράμματα, αριθμοί και _ (3–20)', !ok); }
    if (name === 'dob') { const d = F('dob').value; hint('dob', d && !ageOk(d) ? 'Πρέπει να είσαι άνω των 18' : '', d && !ageOk(d)); }
    if (name === 'password') {
      const p = F('password').value; let sc = 0; if (p.length >= 8) sc++; if (p.length >= 12) sc++; if (/[A-Z]/.test(p) && /[a-z]/.test(p)) sc++; if (/\d/.test(p)) sc++; if (/[^A-Za-z0-9]/.test(p)) sc++;
      const m = $('#pm'); m.style.width = (p ? Math.max(12, sc * 20) : 0) + '%'; m.style.background = ['#ef4444', '#ef4444', '#f59e0b', '#84cc16', '#22c55e', '#22c55e'][sc];
      hint('password', p ? (p.length < 8 ? 'Χρειάζονται τουλάχιστον 8 χαρακτήρες' : ['', 'Αδύναμος', 'Μέτριος', 'Καλός', 'Δυνατός', 'Πολύ δυνατός'][sc]) : '', p && p.length < 8);
    }
    if (name === 'password' || name === 'password2') { const a = F('password').value, b = F('password2').value; hint('password2', b ? (a === b ? 'Οι κωδικοί ταιριάζουν ✔' : 'Οι κωδικοί δεν ταιριάζουν') : '', b && a !== b); }
  }
  if (mode === 'register') ['username', 'email', 'dob', 'password', 'password2'].forEach(live);
  (mode === 'login' && F('username').value ? F('password') : form.elements[0]).focus();
  form.onsubmit = async (e) => {
    e.preventDefault(); ferr.hidden = true; const fd = Object.fromEntries(new FormData(form)); const btn = $('button.primary', form);
    const req = mode === 'login' ? ['username', 'password'] : ['username', 'email', 'fullName', 'dob', 'country', 'password', 'password2'];
    const empty = req.find((n) => !String(fd[n] || '').trim());
    if (empty) return showErr('Συμπλήρωσε όλα τα υποχρεωτικά πεδία (με *).', empty);
    if (mode === 'register') {
      if (!/^[A-Za-z0-9_]{3,20}$/.test(fd.username)) return showErr('Το όνομα χρήστη πρέπει να έχει 3–20 λατινικά γράμματα, αριθμούς ή _.', 'username');
      if (!/^\S+@\S+\.\S+$/.test(fd.email)) return showErr('Το email δεν είναι έγκυρο.', 'email');
      if (!ageOk(fd.dob)) return showErr('Πρέπει να είσαι άνω των 18 ετών.', 'dob');
      if (fd.password.length < 8) return showErr('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.', 'password');
      if (fd.password !== fd.password2) return showErr('Οι κωδικοί δεν ταιριάζουν. Διόρθωσε μόνο την επιβεβαίωση, τα υπόλοιπα στοιχεία έμειναν.', 'password2');
      if (!F('terms').checked) return showErr('Πρέπει να αποδεχτείς τους όρους για να συνεχίσεις.', 'terms');
      fd.terms = true; delete fd.password2;
    }
    btn.disabled = true; btn.classList.add('busy');
    try {
      const r = await api('POST', mode === 'login' ? '/api/login' : '/api/register', fd);
      lsSet('tr_user', fd.username); App.me = r.user; Sound.ensure(); if (mode === 'register') Sound.bonus();
      location.hash = '#/lobby'; show();
    } catch (er) {
      btn.disabled = false; btn.classList.remove('busy'); const m = String(er.message || 'Κάτι πήγε στραβά. Δοκίμασε ξανά.');
      if (mode === 'login') { F('password').value = ''; showErr(m, 'password'); }
      else showErr(m, /χρήστη|username/i.test(m) ? 'username' : /email/i.test(m) ? 'email' : /κωδικ|password/i.test(m) ? 'password' : /γέννησ|18|ηλικ/i.test(m) ? 'dob' : null);
    }
  };
}

/* ======================= Συνεδρία & όρια (υπεύθυνο παιχνίδι) ======================= */
const LIM = { get loss() { return Number(lsGet('tr_loss')) || 0; }, get time() { const t = lsGet('tr_time'); return t === '' ? 30 : Number(t) || 0; } };
App.sess = { t0: Date.now(), net: 0, rounds: 0, warned: false };
(function () {
  const _play = App.play, _settle = App.settle;
  App.guard = function () { if (LIM.loss > 0 && App.sess.net <= -LIM.loss * 100) { Sound.error(); throw new Error(`Έφτασες το όριο απωλειών της συνεδρίας (${LIM.loss} €). Κάνε ένα διάλειμμα ή άλλαξε το όριο από το Προφίλ.`); } };
  App.play = async function (game, body, stakeCents) {
    App.guard();
    return _play.call(App, game, body, stakeCents);
  };
  App.settle = function (res) {
    _settle.call(App, res); const r = res.round; App.sess.net += r.payout - r.stake; App.sess.rounds++; lsSet('tr_last', r.game); App.updateSess();
    if (LIM.loss > 0 && App.sess.net <= -LIM.loss * 100) toast(`Έφτασες το όριο απωλειών (${LIM.loss} €). Τα παιχνίδια σταματούν για αυτή τη συνεδρία.`, true);
  };
})();
App.updateSess = function () {
  const e = $('#sessinfo'); if (!e) return; const m = Math.floor((Date.now() - App.sess.t0) / 60000), n = App.sess.net;
  e.innerHTML = `Συνεδρία: ${m}′ · <b class="${n >= 0 ? 'pos' : 'neg'}">${n >= 0 ? '+' : '−'}${money(Math.abs(n))}</b>`;
  if (LIM.time > 0 && m >= LIM.time && !App.sess.warned) {
    App.sess.warned = true; const d = document.createElement('div'); d.className = 'slotoverlay'; d.style.position = 'fixed'; d.style.zIndex = 200;
    d.innerHTML = `<div class="card" style="max-width:420px;text-align:center"><div style="font-size:44px">⏰</div><h2 style="justify-content:center">Υπενθύμιση παιχνιδιού</h2><p>Παίζεις εδώ και <b>${m} λεπτά</b>. Αποτέλεσμα συνεδρίας: <b>${n >= 0 ? '+' : '−'}${money(Math.abs(n))}</b>.</p><div class="row" style="justify-content:center"><button class="primary" id="rc1">Συνέχεια</button><button id="rc2">Διάλειμμα (αρχική)</button></div></div>`;
    document.body.appendChild(d); $('#rc1', d).onclick = () => { d.remove(); App.sess.warned = false; App.sess.t0 = Date.now(); }; $('#rc2', d).onclick = () => { d.remove(); App.sess.t0 = Date.now(); App.sess.warned = false; location.hash = '#/lobby'; };
  }
};
setInterval(() => App.updateSess(), 20000);
/* μενού όλων των παιχνιδιών (κινητό) */
App.gameSheet = function () {
  const d = document.createElement('div'); d.className = 'sheet';
  d.innerHTML = `<div class="sheetin"><div class="row" style="justify-content:space-between"><h2 style="margin:0">Όλα τα παιχνίδια</h2><button class="ghost" id="shx">✕</button></div><div class="sheetgrid">${['traffic','slots','crossing','shark','roulette','wheel','dice','coin'].map((g) => `<a href="#/${g}"><span>${GEMO[g]}</span>${GAME_NAMES[g]}</a>`).join('')}</div></div>`;
  document.body.appendChild(d); const close = () => d.remove(); d.onclick = (e) => { if (e.target === d || e.target.closest('a') || e.target.id === 'shx') close(); };
};

/* ======================= Lobby ======================= */
const TAGS = { crossing: 'new orig', slots: 'new classic', traffic: 'orig', wheel: 'quick classic', roulette: 'classic', dice: 'quick classic', shark: 'new orig', coin: 'quick' };
function renderLobby(v) {
  const cards = [
    ['slots', '🍒', 'Νέο φρουτάκι 5 τροχών με 10 γραμμές, Wild 👑, Scatter ⭐ και 10 Free Spins με πολλαπλασιαστές έως ×5.', ['🔥 ΝΕΟ', 'Έως 1.000×', 'RTP 95,6%']],
    ['traffic', '🚗', 'Στοιχηματίστε στα χρώματα 20 αμαξιών που περνούν από ραντάρ. Over/Under, ακριβής αριθμός, σερί, ουράνιο τόξο και άλλα.', ['Πρωτότυπο', '8 αγορές', 'RTP 96%']],
    ['wheel', '🎡', 'Τροχός 40 τμημάτων με BONUS τροχό και RESPIN: μέχρι 100× στο μπόνους!', ['3 επίπεδα ρίσκου', 'RTP 96-97%']],
    ['roulette', '🎰', 'Ευρωπαϊκή ρουλέτα με ένα μηδέν. Αριθμοί, χρώματα, ντουζίνες, στήλες.', ['Μέγιστο 36×', 'RTP 97,3%']],
    ['dice', '🎲', 'Δύο πραγματικά ζάρια 3D. Πόνταρε στο άθροισμα, πάνω/κάτω από 7, ζυγό/μονό ή διπλά — και συνδύασε πολλά μαζί.', ['Έως 34,92×', 'RTP 97%']],
    ['crossing', '🚶', 'Πέρασε τον επικίνδυνο δρόμο λωρίδα-λωρίδα και πάρε τα λεφτά όποτε θες, πριν σε χτυπήσει αυτοκίνητο!', ['🔥 ΝΕΟ', 'Cash out οποτεδήποτε', 'Έως 1.000×', 'RTP 97%']],
    ['shark', '🦈', 'Πόσα ψάρια θα φάει ο καρχαρίας στον βυθό; Πόνταρε Over / Under ή τον ακριβή αριθμό και δες τον να κυνηγά.', ['🔥 ΝΕΟ', 'Over / Under', 'RTP 97%']],
    ['coin', '🪙', 'Κορώνα ή γράμματα. Το πιο απλό παιχνίδι με απόδοση 1,94×.', ['1,94×', 'RTP 97%']],
  ];
  const vip = vipInfo(App.me.stats.wagered), left = App.me.nextBonusAt - Date.now();
  v.innerHTML = `
    <section class="hero2">
      <div class="road"><span class="c1">🚗</span><span class="c2">🚕</span><span class="c3">🚙</span><span class="c4">🏎️</span></div>
      <div class="hfloat"><span style="--x:8%;--y:20%;--s:64px">🎰</span><span style="--x:30%;--y:62%;--s:48px;animation-delay:-2s">🪙</span><span style="--x:52%;--y:14%;--s:56px;animation-delay:-4s">🎲</span><span style="--x:72%;--y:58%;--s:72px;animation-delay:-1s">🦈</span><span style="--x:88%;--y:18%;--s:50px;animation-delay:-3s">💎</span></div>
      <div class="hero2in"><div class="demochip">DEMO · εικονικά ευρώ</div>
        <h1>Καλώς ήρθες, <span>${esc(App.me.fullName.split(' ')[0])}</span> 👋</h1>
        <p>8 παιχνίδια, provably fair αποτελέσματα και υπόλοιπο που ελέγχεται μόνο από τον server.</p>
        <div class="row" style="margin-top:14px"><button class="primary" data-go="${lsGet('tr_last') && Games[lsGet('tr_last')] ? lsGet('tr_last') : 'slots'}">${lsGet('tr_last') && Games[lsGet('tr_last')] ? '▶ Συνέχισε: ' + GAME_NAMES[lsGet('tr_last')] : '🍒 Παίξε το Φρουτάκι'}</button><button data-go="shark">🦈 Καρχαρίας</button><button data-go="crossing">🚶 Διάβαση</button><button data-go="cashier">💳 Ταμείο</button></div>
        <div class="h2stats"><span><b>8</b> παιχνίδια</span><span><b>96–97%</b> RTP</span><span><b>0,20 €</b> ελάχιστο</span><span><b>Provably fair</b></span></div>
      </div>
    </section>
    <div class="trio">
      <div class="card"><h2>Πορτοφόλι</h2><div class="bigbal">${money(App.me.balance)}</div>
        <button id="lbonus" class="primary" style="width:100%;margin-top:8px" ${left > 0 ? 'disabled' : ''}>🎁 Μπόνους 50 €</button>
        <div class="small mute" style="margin-top:6px;text-align:center">${left > 0 ? `Διαθέσιμο σε ${Math.floor(left / 3600000)}ω ${Math.floor(left % 3600000 / 60000)}λ` : 'Διαθέσιμο τώρα!'}</div></div>
      <div class="card"><h2>Επίπεδο VIP</h2><div style="font-size:26px;font-weight:800;color:${vip.lvl.c}">${vip.lvl.i} ${vip.lvl.n}</div>
        <div class="pbar"><i style="width:${vip.pct}%;background:${vip.lvl.c}"></i></div>
        <div class="small mute">${vip.next ? `Ακόμα ${money(vip.left * 100)} πονταρίσματα για ${vip.next.i} ${vip.next.n}` : 'Έφτασες το ανώτατο επίπεδο!'}</div></div>
      <div class="card"><h2>🏆 Μεγαλύτερες νίκες</h2><div id="lb" class="small mute">Φόρτωση…</div></div>
    </div>
    <div class="filters" id="flt"><input id="gsearch" placeholder="🔍 Αναζήτηση παιχνιδιού…"><button data-f="all" class="on">Όλα</button><button data-f="new">🔥 Νέα</button><button data-f="quick">⚡ Γρήγορα</button><button data-f="classic">🎩 Κλασικά</button><button data-f="orig">💡 Πρωτότυπα</button></div>
    <div class="games" id="glist">${cards.map(([id, ico, d, badges]) => `<div class="gcard g-${id}${id === 'slots' ? ' feat' : ''}" data-g="${id}" data-tags="${TAGS[id]}" style="--d:${cards.findIndex((c) => c[0] === id) * 70}ms"><div class="gart"><span class="ico">${GEMO[id]}</span></div><div class="gbody"><h3>${GAME_NAMES[id]}</h3><p>${d}</p><div class="gbad">${badges.map((b) => `<span class="badge">${b}</span>`).join('')}</div></div><div class="cta">ΠΑΙΞΕ ▶</div></div>`).join('')}</div>`;
  $$('.gcard', v).forEach((c) => c.onclick = () => { Sound.click(); location.hash = '#/' + c.dataset.g; });
  $$('[data-go]', v).forEach((b) => b.onclick = () => { Sound.click(); location.hash = '#/' + b.dataset.go; });
  const lb = $('#lbonus'); if (lb) lb.onclick = () => App.claimBonus(() => renderLobby(v));
  let ff = 'all'; const applyF = () => { const nz = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); const q = nz($('#gsearch').value.trim()); $$('.gcard', v).forEach((c) => { const ok = (ff === 'all' || c.dataset.tags.split(' ').includes(ff)) && (!q || nz(GAME_NAMES[c.dataset.g] + ' ' + c.textContent).includes(q)); c.style.display = ok ? '' : 'none'; }); };
  $$('#flt button').forEach((b) => b.onclick = () => { ff = b.dataset.f; $$('#flt button').forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); applyF(); });
  $('#gsearch').oninput = applyF;
  api('GET', '/api/leaderboard').then((r) => {
    const medals = ['🥇', '🥈', '🥉'];
    $('#lb').innerHTML = r.top.length ? r.top.slice(0, 5).map((t, i) => `<div class="lbrow"><span>${medals[i] || i + 1 + '.'} ${esc(t.name)}</span><span>${t.game ? GAME_NAMES[t.game] : ''}</span><b class="gold">${money(t.best)}</b></div>`).join('') : '<div class="empty"><span>🏆</span>Ο πίνακας είναι άδειος.<br><b>Γίνε ο πρώτος στη λίστα!</b></div>';
  }).catch(() => { $('#lb').textContent = ''; });
}

/* ======================= Provably fair επαλήθευση (στον browser) ======================= */
const enc = new TextEncoder();
async function drawInts(server, client, nonce, sizes) {
  const key = await crypto.subtle.importKey('raw', enc.encode(server), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  let blk = 0, buf = new Uint8Array(0), pos = 0;
  const byte = async () => { if (pos >= buf.length) { buf = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(`${client}:${nonce}:${blk++}`))); pos = 0; } return buf[pos++]; };
  const out = [];
  for (const n of sizes) {
    if (n <= 256) { const lim = Math.floor(256 / n) * n; for (;;) { const b = await byte(); if (b < lim) { out.push(b % n); break; } } }
    else { const lim = Math.floor(4294967296 / n) * n; for (;;) { const a = await byte(), b = await byte(), c = await byte(), d = await byte(); const val = a * 16777216 + (b << 16) + (c << 8) + d; if (val < lim) { out.push(val % n); break; } } }
  }
  return out;
}
const sha256hex = async (s) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map((b) => b.toString(16).padStart(2, '0')).join('');

function explainDraws(game, ints, risk) {
  const C = App.catalog;
  if (game === 'traffic') return 'Αμάξια: ' + ints.map((i) => `<span style="color:${C.traffic.colors[i].h};text-shadow:0 0 2px #fff">●</span>`).join('') + ` (${ints.map((i) => C.traffic.colors[i].n[0]).join('')})`;
  if (game === 'slots') {
    const g = ints.slice(0, 5).map((s, r) => [-1, 0, 1].map((d) => C.slots.strips[r][(s + d + 24) % 24]));
    const scat = g.flat().filter((x) => x === 'X').length;
    return 'Πρώτη περιστροφή:<br>' + [0, 1, 2].map((row) => g.map((c) => C.slots.syms[c[row]]).join(' ')).join('<br>') + (scat >= 3 ? '<br>⭐ Bonus: οι επόμενοι 10 γύροι προκύπτουν από τα επόμενα draws.' : '');
  }
  if (game === 'wheel') { const parts = []; for (let i = 0; i + 1 < ints.length; i += 2) { const m = C.wheel.main[risk][ints[i]]; if (m === 'R') { parts.push(`σπιν ${i / 2 + 1}: τμήμα #${ints[i]} → RESPIN`); continue; } if (m === 'B') parts.push(`σπιν ${i / 2 + 1}: τμήμα #${ints[i]} → BONUS · bonus τμήμα #${ints[i + 1]} → ${C.wheel.bonus[risk][ints[i + 1]]}×`); else parts.push(`σπιν ${i / 2 + 1}: τμήμα #${ints[i]} → ${m}×`); break; } return parts.join(' · '); }
  if (game === 'roulette') return `Αριθμός ${ints[0]} (${ints[0] === 0 ? 'πράσινο' : C.roulette.reds.includes(ints[0]) ? 'κόκκινο' : 'μαύρο'})`;
  if (game === 'dice') return `Ζάρια: ${ints[0] + 1} και ${ints[1] + 1} (άθροισμα ${ints[0] + ints[1] + 2})`;
  if (game === 'crossing') return [8, 18, 30, 45].map((h) => { const i = ints.findIndex((x) => x < h); return `${h}% ρίσκο → ${i < 0 ? 'κανένα χτύπημα στις 15 λωρίδες' : 'χτύπημα στη λωρίδα ' + (i + 1)}`; }).join('<br>');
  if (game === 'shark') { const e = ints.map((x, k) => (x === 0 ? k + 1 : 0)).filter(Boolean); return `Ο καρχαρίας έφαγε ${e.length} ψάρια${e.length ? ' (ψάρια ' + e.join(', ') + ')' : ''}`; }
  return ints[0] === 0 ? 'Κορώνα' : 'Γράμματα';
}

/* ======================= Προφίλ ======================= */
/* ======================= Ταμείο (ΜΟΝΟ προσομοίωση — δεν γίνεται καμία πραγματική συναλλαγή) ======================= */
const CASH_CATS = [['card', 'Κάρτες'], ['wallet', 'Ηλεκτρονικά πορτοφόλια'], ['bank', 'Τράπεζα'], ['crypto', 'Κρυπτονομίσματα']];
// [id, όνομα, κατηγορία, προμήθεια %, ελάχιστο, μέγιστο, χρόνος κατάθεσης, χρόνος ανάληψης, σύμβολο, ενδεικτική τιμή € (μόνο crypto), δίκτυο]
const CASH_M = [
  ['visa', 'Visa', 'card', 0, 10, 5000, 'Άμεσα', '1–3 εργάσιμες', 'VISA'], ['mc', 'Mastercard', 'card', 0, 10, 5000, 'Άμεσα', '1–3 εργάσιμες', 'MC'],
  ['paypal', 'PayPal', 'wallet', 0, 10, 5000, 'Άμεσα', 'Έως 24 ώρες', 'PP'], ['skrill', 'Skrill', 'wallet', 1, 10, 5000, 'Άμεσα', 'Έως 24 ώρες', 'SK'], ['neteller', 'Neteller', 'wallet', 1, 10, 5000, 'Άμεσα', 'Έως 24 ώρες', 'NT'],
  ['apple', 'Apple Pay', 'wallet', 0, 10, 2000, 'Άμεσα', '—', 'AP'], ['google', 'Google Pay', 'wallet', 0, 10, 2000, 'Άμεσα', '—', 'GP'],
  ['bank', 'Τραπεζική μεταφορά (SEPA)', 'bank', 0, 20, 20000, '1–2 εργάσιμες', '2–3 εργάσιμες', 'SEPA'],
  ['btc', 'Bitcoin', 'crypto', 0, 20, 20000, '~30 λεπτά', '~1 ώρα', 'BTC', 95000, 'Bitcoin'], ['eth', 'Ethereum', 'crypto', 0, 20, 20000, '~5 λεπτά', '~15 λεπτά', 'ETH', 3400, 'ERC-20'],
  ['usdt', 'Tether (USDT)', 'crypto', 0, 20, 20000, '~3 λεπτά', '~10 λεπτά', 'USDT', 0.92, 'TRC-20'], ['usdc', 'USD Coin (USDC)', 'crypto', 0, 20, 20000, '~3 λεπτά', '~10 λεπτά', 'USDC', 0.92, 'ERC-20'], ['ltc', 'Litecoin', 'crypto', 0, 20, 20000, '~10 λεπτά', '~20 λεπτά', 'LTC', 85, 'Litecoin'],
];
const CASH_ICO = {
  card: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="2.5"/><path d="M2.5 10h19M6 15h4"/></svg>',
  wallet: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5A2.5 2.5 0 0 1 6 5h11.5v3"/><rect x="3.5" y="8" width="17" height="11" rx="2.5"/><circle cx="16.5" cy="13.5" r="1.1"/></svg>',
  bank: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9.5 12 4l9 5.5M5 10v7m4-7v7m6-7v7m4-7v7M3 20h18"/></svg>',
  crypto: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M9.5 8h4a2 2 0 0 1 0 4h-4m0 0h4.5a2 2 0 0 1 0 4H9.5M9.5 8v8M11.5 6.5V8m0 8v1.5"/></svg>',
};
function renderCashier(v) {
  let mode = 'dep', cat = 'card', mid = 'visa', ref = 0; const log = [];
  const M = () => CASH_M.find((m) => m[0] === mid), fmtE = (x) => x.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  v.innerHTML = `<div class="cash"><div class="cash-head"><div><div class="cash-t">Ταμείο</div><div class="cash-s">Καταθέσεις και αναλήψεις</div></div><div class="cash-bal"><small>Διαθέσιμο υπόλοιπο</small><b id="cbal">${money(App.me.balance)}</b></div></div>
  <div class="cash-note"><span class="cash-pill">DEMO</span><span><b>Λειτουργία επίδειξης.</b> Δεν υπάρχει online server πληρωμών: καμία πραγματική συναλλαγή και κανένα στοιχείο δεν στέλνεται ή αποθηκεύεται. Γίνονται δεκτά μόνο στοιχεία δοκιμής (οδηγίες σε κάθε μέθοδο).</span></div>
  <div class="cash-body"><div class="cash-main">
    <ol class="cash-prog" id="cprog"><li class="on">Μέθοδος</li><li>Στοιχεία</li><li>Επιβεβαίωση</li><li>Ολοκλήρωση</li></ol>
    <div class="cash-tabs" id="cm"><button data-m="dep" class="on">Κατάθεση</button><button data-m="wd">Ανάληψη</button></div>
    <div class="cash-step"><span>1</span> Επίλεξε μέθοδο</div>
    <div class="cash-cats" id="cc">${CASH_CATS.map(([k, n]) => `<button data-c="${k}" class="${k === 'card' ? 'on' : ''}">${n}</button>`).join('')}</div>
    <div id="cl" class="cash-list"></div>
    <div class="cash-step"><span>2</span> Στοιχεία πληρωμής</div><div id="cf" class="cash-form"></div>
    <div class="cash-step"><span>3</span> Ποσό</div>
    <div class="cash-amt"><div class="cash-inp"><span>€</span><input id="camt" type="number" min="10" step="1" value="50"></div><div class="cash-q" id="cq">${[20, 50, 100, 250, 500, 1000].map((x) => `<button data-a="${x}">${x} €</button>`).join('')}</div></div>
    <div class="cash-lim small" id="clim"></div>
    <button class="cash-go" id="cgo">Συνέχεια στην επιβεβαίωση</button><div class="cash-msg" id="cmsg"></div>
  </div>
  <aside class="cash-side"><div class="cash-card"><h3>Σύνοψη συναλλαγής</h3><div id="csum"></div></div>
    <div class="cash-card"><h3>Πρόσφατες κινήσεις</h3><div id="clog" class="cash-log">Δεν υπάρχουν κινήσεις.</div></div>
    <div class="cash-card cash-trust"><h3>Πληροφορίες</h3><ul><li>Ελάχιστη κατάθεση 10 €, μέγιστη 20.000 € ανά συναλλαγή.</li><li>Οι αναλήψεις γίνονται στην ίδια μέθοδο με την κατάθεση.</li><li>Παίξε υπεύθυνα · Μόνο για άτομα άνω των 18.</li></ul></div></aside></div></div>`;
  const msg = $('#cmsg'), g = (id) => ($('#' + id) ? $('#' + id).value.trim() : '');
  const demoAddr = (m) => 'DEMO-' + m[8] + '-' + 'x7Kp29QwLm4Zr8TcVb3Nd6HsYa1'.slice(0, 22);
  function list() {
    $$('#cc button', v).forEach((b) => b.classList.toggle('on', b.dataset.c === cat));
    const ms = CASH_M.filter((m) => m[2] === cat && !(mode === 'wd' && (m[0] === 'apple' || m[0] === 'google')));
    if (!ms.find((m) => m[0] === mid)) mid = ms[0][0];
    $('#cl').innerHTML = `<div class="cash-th"><span>Μέθοδος</span><span>Χρόνος</span><span>Προμήθεια</span><span>Όρια</span></div>` + ms.map((m) => `<button class="cash-row ${m[0] === mid ? 'on' : ''}" data-k="${m[0]}"><span class="cash-mono" title="${m[8]}">${CASH_ICO[m[2]]}</span><span class="cash-nm"><b>${m[1]}</b>${m[2] === 'crypto' ? `<small>Δίκτυο ${m[10]}</small>` : ''}</span><span>${mode === 'dep' ? m[6] : m[7]}</span><span>${m[3] ? m[3] + '%' : 'Δωρεάν'}</span><span>${m[4]} – ${m[5].toLocaleString('el-GR')} €</span></button>`).join('');
    $$('#cl .cash-row', v).forEach((b) => b.onclick = () => { mid = b.dataset.k; Sound.click(); list(); });
    fields(); sum();
  }
  function fields() {
    const m = M(), f = $('#cf'), dep = mode === 'dep';
    if (m[2] === 'card') f.innerHTML = `<div class="cash-hint">Κάρτα δοκιμής: <code>${m[0] === 'visa' ? '4242 4242 4242 4242' : '5555 5555 5555 4444'}</code> · οποιαδήποτε μελλοντική λήξη και CVV</div><div class="cash-grid"><label class="w2">Όνομα κατόχου<input id="f_name" autocomplete="off" placeholder="ΟΝΟΜΑ ΕΠΩΝΥΜΟ"></label><label class="w2">Αριθμός κάρτας<input id="f_num" inputmode="numeric" autocomplete="off" maxlength="19" placeholder="0000 0000 0000 0000"></label><label>Λήξη (ΜΜ/ΕΕ)<input id="f_exp" autocomplete="off" maxlength="5" placeholder="ΜΜ/ΕΕ"></label><label>CVV<input id="f_cvv" type="password" inputmode="numeric" autocomplete="off" maxlength="4" placeholder="•••"></label></div>`;
    else if (m[2] === 'wallet' && !['apple', 'google'].includes(m[0])) f.innerHTML = `<div class="cash-grid"><label class="w2">Email λογαριασμού ${m[1]}<input id="f_mail" type="email" autocomplete="off" placeholder="onoma@example.com"></label></div>`;
    else if (m[2] === 'wallet') f.innerHTML = `<div class="cash-hint">Η επιβεβαίωση γίνεται στη συσκευή σου (προσομοίωση). Δεν απαιτούνται στοιχεία.</div>`;
    else if (m[2] === 'bank') f.innerHTML = `<div class="cash-hint">Στο demo δέχεται μόνο IBAN που ξεκινά με <code>GR00</code></div><div class="cash-grid"><label class="w2">IBAN ${dep ? 'αποστολέα' : 'παραλήπτη'}<input id="f_iban" autocomplete="off" placeholder="GR00 0000 0000 0000 0000 0000 000"></label><label class="w2">Όνομα δικαιούχου<input id="f_name" autocomplete="off"></label></div>`;
    else if (dep) f.innerHTML = `<div class="cash-crypto"><div class="cash-qr" aria-hidden="true">${Array.from({ length: 49 }, (_, i) => `<i class="${((i * 7 + i % 5 + (i >> 2)) % 3) ? 'k' : ''}"></i>`).join('')}</div><div><div class="cash-hint" style="margin:0 0 8px">Διεύθυνση <b>δοκιμής</b> — δεν είναι πραγματικό πορτοφόλι, μην στείλεις κρυπτονομίσματα.</div><label>Διεύθυνση κατάθεσης (${m[10]})<input id="f_addr" readonly value="${demoAddr(m)}"></label><div class="small" id="ccon" style="margin-top:8px"></div></div></div>`;
    else f.innerHTML = `<div class="cash-hint">Στο demo δέχεται μόνο διεύθυνση που ξεκινά με <code>DEMO-</code></div><div class="cash-grid"><label class="w2">Διεύθυνση πορτοφολιού ${m[1]} (${m[10]})<input id="f_addr" autocomplete="off" placeholder="DEMO-${m[8]}-…"></label></div>`;
    const n = $('#f_num'); if (n) n.oninput = () => { n.value = n.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim(); };
    const e = $('#f_exp'); if (e) e.oninput = () => { let d = e.value.replace(/\D/g, '').slice(0, 4); if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2); e.value = d; };
  }
  function sum() {
    const m = M(), a = Number($('#camt').value) || 0, fee = a * m[3] / 100, tot = mode === 'dep' ? a : a - fee;
    $('#clim').textContent = `Όρια για ${m[1]}: ${m[4]} – ${m[5].toLocaleString('el-GR')} €`;
    $('#csum').innerHTML = `<table><tr><td>Τύπος</td><td>${mode === 'dep' ? 'Κατάθεση' : 'Ανάληψη'}</td></tr><tr><td>Μέθοδος</td><td>${m[1]}</td></tr><tr><td>Ποσό</td><td>${fmtE(a)}</td></tr><tr><td>Προμήθεια</td><td>${fee ? fmtE(fee) : 'Δωρεάν'}</td></tr>${m[2] === 'crypto' && a ? `<tr><td>Ισοδύναμο*</td><td>${(a / m[9]).toLocaleString('el-GR', { maximumFractionDigits: m[9] > 1000 ? 6 : m[9] > 50 ? 4 : 2 })} ${m[8]}</td></tr>` : ''}<tr><td>Εκτιμώμενος χρόνος</td><td>${mode === 'dep' ? m[6] : m[7]}</td></tr><tr class="tot"><td>${mode === 'dep' ? 'Θα πιστωθεί' : 'Θα λάβεις'}</td><td>${fmtE(Math.max(0, tot))}</td></tr></table>${m[2] === 'crypto' ? '<div class="small" style="margin-top:8px;color:var(--c-mute)">* Ενδεικτική τιμή μόνο για επίδειξη.</div>' : ''}`;
  }
  function check() {
    const m = M(), a = Number($('#camt').value);
    if (!(a >= m[4] && a <= m[5])) return `Το ποσό πρέπει να είναι ${m[4]}–${m[5].toLocaleString('el-GR')} €`;
    if (mode === 'wd' && a * 100 > App.me.balance) return 'Δεν έχεις αρκετό υπόλοιπο για ανάληψη';
    if (m[2] === 'card') {
      const num = g('f_num').replace(/\s/g, ''), test = m[0] === 'visa' ? '4242424242424242' : '5555555555554444'; if (g('f_name').length < 3) return 'Γράψε το όνομα του κατόχου';
      if (!/^\d{16}$/.test(num)) return 'Ο αριθμός κάρτας έχει 16 ψηφία';
      if (num !== test) return `Στο demo δεκτή είναι μόνο η κάρτα δοκιμής ${test.replace(/(.{4})/g, '$1 ').trim()} — μην βάζεις πραγματική κάρτα`;
      const q = g('f_exp').match(/^(\d{2})\/(\d{2})$/), now = new Date(); if (!q || +q[1] < 1 || +q[1] > 12 || (2000 + +q[2]) * 12 + +q[1] < now.getFullYear() * 12 + now.getMonth() + 1) return 'Μη έγκυρη ημερομηνία λήξης';
      if (!/^\d{3,4}$/.test(g('f_cvv'))) return 'Το CVV έχει 3–4 ψηφία';
    } else if (m[2] === 'wallet' && !['apple', 'google'].includes(m[0])) { if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(g('f_mail'))) return 'Γράψε έγκυρο email'; }
    else if (m[2] === 'bank') { if (!/^GR00/i.test(g('f_iban').replace(/\s/g, ''))) return 'Στο demo δέχεται μόνο IBAN που ξεκινά με GR00'; if (g('f_name').length < 3) return 'Γράψε το όνομα δικαιούχου'; }
    else if (m[2] === 'crypto' && mode === 'wd' && !/^DEMO-/.test(g('f_addr'))) return 'Στο demo δέχεται μόνο διεύθυνση που ξεκινά με DEMO-';
    return '';
  }
  $$('#cm button', v).forEach((b) => b.onclick = () => { mode = b.dataset.m; $$('#cm button', v).forEach((x) => x.classList.toggle('on', x === b)); $('#cgo').textContent = mode === 'dep' ? 'Συνέχεια στην επιβεβαίωση' : 'Αίτηση ανάληψης'; Sound.click(); list(); });
  $$('#cc button', v).forEach((b) => b.onclick = () => { cat = b.dataset.c; mid = CASH_M.find((m) => m[2] === cat)[0]; Sound.click(); list(); });
  $$('#cq button', v).forEach((b) => b.onclick = () => { $('#camt').value = b.dataset.a; sum(); });
  $('#camt').addEventListener('input', sum);
  const prog = (n) => $$('#cprog li', v).forEach((li, i) => li.classList.toggle('on', i <= n));
  ['input', 'change'].forEach((e) => $('#cf').addEventListener(e, () => prog(1)));
  const overlay = (html) => { const o = document.createElement('div'); o.className = 'cash-ov'; o.innerHTML = `<div class="cash-modal" role="dialog" aria-modal="true">${html}</div>`; document.body.appendChild(o); return o; };
  const rows = (m, a) => { const fee = a * m[3] / 100; return `<table><tr><td>Τύπος</td><td>${mode === 'dep' ? 'Κατάθεση' : 'Ανάληψη'}</td></tr><tr><td>Μέθοδος</td><td>${m[1]}</td></tr><tr><td>Ποσό</td><td>${fmtE(a)}</td></tr><tr><td>Προμήθεια</td><td>${fee ? fmtE(fee) : 'Δωρεάν'}</td></tr><tr><td>Εκτιμώμενος χρόνος</td><td>${mode === 'dep' ? m[6] : m[7]}</td></tr><tr class="tot"><td>${mode === 'dep' ? 'Θα πιστωθεί' : 'Θα λάβεις'}</td><td>${fmtE(mode === 'dep' ? a : a - fee)}</td></tr></table>`; };
  $('#cgo').onclick = () => {
    const bad = check(); if (bad) { msg.className = 'cash-msg err'; msg.textContent = bad; Sound.error(); return; }
    msg.className = 'cash-msg'; msg.textContent = ''; prog(2);
    const m = M(), a = Number($('#camt').value);
    const o = overlay(`<div class="cash-mh"><h3>Έλεγχος και επιβεβαίωση</h3><button class="cash-x" id="mx" aria-label="Κλείσιμο">×</button></div>${rows(m, a)}<div class="cash-hint" style="margin-top:14px">Προσομοίωση: η αίτηση δεν θα σταλεί πουθενά και το υπόλοιπο δεν θα αλλάξει.</div><div class="cash-mb"><button class="cash-sec" id="mc">Ακύρωση</button><button class="cash-go" id="mok" style="margin:0">Επιβεβαίωση ${mode === 'dep' ? 'κατάθεσης' : 'ανάληψης'}</button></div>`);
    const close = () => { o.remove(); prog(1); };
    $('#mx', o).onclick = close; $('#mc', o).onclick = close; o.onclick = (e) => { if (e.target === o) close(); };
    $('#mok', o).onclick = async () => {
      o.querySelector('.cash-modal').innerHTML = '<div class="cash-spin"><i></i><b>Επεξεργασία αίτησης…</b><small>Παρακαλούμε μην κλείσεις τη σελίδα</small></div>'; prog(2); await sleep(1700);
      const id = 'DEMO-' + String(++ref).padStart(6, '0') + '-' + Date.now().toString(36).slice(-4).toUpperCase(), when = new Date().toLocaleString('el-GR');
      log.unshift(`<div class="cash-tx"><div><b>${mode === 'dep' ? 'Κατάθεση' : 'Ανάληψη'} ${fmtE(a)}</b><small>${m[1]} · ${when} · ${id}</small></div><span class="cash-badge">Προσομοίωση</span></div>`);
      $('#clog').innerHTML = log.join(''); prog(3);
      o.querySelector('.cash-modal').innerHTML = `<div class="cash-done"><div class="cash-check"><svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></div><h3>Η αίτηση καταχωρήθηκε</h3><p class="mute">Προσομοίωση — δεν εκτελέστηκε πραγματική συναλλαγή και το υπόλοιπο δεν άλλαξε.</p></div>${rows(m, a)}<table class="cash-ref"><tr><td>Κωδικός αναφοράς</td><td>${id}</td></tr><tr><td>Ημερομηνία</td><td>${when}</td></tr><tr><td>Κατάσταση</td><td><span class="cash-badge">Demo · Δεν εκτελέστηκε</span></td></tr></table><div class="cash-mb"><button class="cash-go" id="mdone" style="margin:0">Κλείσιμο</button></div>`;
      $('#mdone', o).onclick = () => { o.remove(); prog(0); fields(); sum(); };
    };
  };
  list();
}
async function renderProfile(v) {
  const u = App.me;
  v.innerHTML = `<div class="grid2">
    <div class="stack">
      <div class="card"><h2>Τα στοιχεία μου</h2><div id="pmsg"></div>
        <form id="pf" class="form">
          <div><label>Όνομα χρήστη</label><input value="${esc(u.username)}" disabled></div>
          <div><label>Ημ/νία γέννησης</label><input value="${esc(u.dob)}" disabled></div>
          <div class="full"><label>Ονοματεπώνυμο</label><input name="fullName" value="${esc(u.fullName)}" required></div>
          <div><label>Email</label><input name="email" type="email" value="${esc(u.email)}" required></div>
          <div><label>Χώρα</label><input name="country" value="${esc(u.country)}" required></div>
          <div class="full"><label>Τηλέφωνο</label><input name="phone" value="${esc(u.phone || '')}"></div>
          <div class="full"><button class="primary">Αποθήκευση</button></div>
        </form></div>
      <div class="card"><h2>Αλλαγή κωδικού</h2><div id="wmsg"></div>
        <form id="wf" class="form"><div><label>Τρέχων κωδικός</label><input name="current" type="password" autocomplete="current-password" required></div>
        <div><label>Νέος κωδικός (8+)</label><input name="next" type="password" autocomplete="new-password" minlength="8" required></div>
        <div class="full"><button>Αλλαγή κωδικού</button></div></form></div>
      <div class="card"><h2>Ιστορικό παιχνιδιών</h2><div style="overflow-x:auto"><table id="hist"><tr><td class="mute">Φόρτωση…</td></tr></table></div></div>
    </div>
    <div class="stack">
      <div class="card"><h2>Πορτοφόλι & στατιστικά</h2>
        <div class="row" style="justify-content:space-between"><div><div class="mute small">Υπόλοιπο</div><b style="font-size:26px;color:var(--gold)" id="pbal">${money(u.balance)}</b></div>
        <div><button id="bonus" class="primary">Μπόνους 50 €</button><div class="small mute" id="bonusinfo" style="text-align:right;margin-top:4px"></div></div></div>
        <table style="margin-top:10px"><tr><td>Γύροι</td><td class="r">${u.stats.rounds}</td></tr><tr><td>Σύνολο πονταρισμάτων</td><td class="r">${money(u.stats.wagered)}</td></tr>
        <tr><td>Σύνολο κερδών</td><td class="r">${money(u.stats.won)}</td></tr><tr><td>Καθαρό αποτέλεσμα</td><td class="r ${u.stats.won - u.stats.wagered >= 0 ? 'pos' : 'neg'}">${money(u.stats.won - u.stats.wagered)}</td></tr>
        <tr><td>Μεγαλύτερο κέρδος</td><td class="r">${money(u.stats.best)}</td></tr></table></div>
      <div class="card"><h2>Provably fair</h2>
        <div class="small mute">Πριν από κάθε γύρο ξέρεις μόνο το hash του μυστικού seed του server. Όταν πατήσεις «Νέο seed», αποκαλύπτεται το παλιό και μπορείς να ελέγξεις ότι όλα τα αποτελέσματα βγήκαν από αυτό.</div>
        <div class="seedbox"><div class="small mute">Server seed hash (SHA-256)</div><div class="mono small" id="shash">${esc(u.seed.hash)}</div></div>
        <div class="row"><div class="grow"><label>Client seed</label><input id="cseed" value="${esc(u.seed.client)}" maxlength="40"></div><button id="setc" style="align-self:flex-end">Αλλαγή</button></div>
        <div class="small mute" style="margin:8px 0">Επόμενο nonce: <b id="snonce">${u.seed.nonce}</b></div>
        <button id="rotate">Νέο seed (αποκάλυψη του τρέχοντος)</button>
        <div id="revealed" class="small" style="margin-top:8px"></div>
      </div>
      <div class="card"><h2>Επαλήθευση αποτελέσματος</h2>
        <div class="form">
          <div><label>Παιχνίδι</label><select id="vgame">${Object.entries(GAME_NAMES).map(([k, n]) => `<option value="${k}">${n}</option>`).join('')}</select></div>
          <div class="hidden" id="vriskw"><label>Ρίσκο τροχού</label><select id="vrisk"><option>low</option><option>medium</option><option>high</option></select></div>
          <div class="full"><label>Server seed (αποκαλυμμένο)</label><input id="vserver" class="mono"></div>
          <div><label>Client seed</label><input id="vclient"></div><div><label>Nonce</label><input id="vnonce" type="number" min="0"></div>
          <div class="full"><button id="vgo">Επαλήθευση</button></div></div>
        <div id="vout" class="small" style="margin-top:8px"></div></div>
    </div></div>`;

  /* στοιχεία & κωδικός */
  $('#pf').onsubmit = async (e) => { e.preventDefault(); try { const r = await api('PATCH', '/api/me', Object.fromEntries(new FormData(e.target))); App.me = { ...App.me, ...r.user }; $('#pmsg').innerHTML = '<div class="ok">Αποθηκεύτηκε.</div>'; } catch (er) { $('#pmsg').innerHTML = `<div class="err">${esc(er.message)}</div>`; } };
  $('#wf').onsubmit = async (e) => { e.preventDefault(); try { await api('POST', '/api/me/password', Object.fromEntries(new FormData(e.target))); $('#wmsg').innerHTML = '<div class="ok">Ο κωδικός άλλαξε.</div>'; e.target.reset(); } catch (er) { $('#wmsg').innerHTML = `<div class="err">${esc(er.message)}</div>`; } };

  /* μπόνους */
  const bi = $('#bonusinfo'); const tick = () => { const left = u.nextBonusAt - Date.now(); const b = $('#bonus'); if (!b) { clearInterval(iv); return; } b.disabled = left > 0; bi.textContent = left > 0 ? `Διαθέσιμο σε ${Math.floor(left / 3600000)}ω ${Math.floor(left % 3600000 / 60000)}λ` : 'Διαθέσιμο τώρα!'; };
  let iv = 0; tick(); iv = setInterval(tick, 20000);
  $('#bonus').onclick = async () => { try { const r = await api('POST', '/api/bonus', {}); Object.assign(App.me, r.user); Object.assign(u, r.user); Sound.bonus(); App.showBalance(u.balance, true); $('#pbal').textContent = money(u.balance); toast('Πήρες 50 € demo!'); tick(); } catch (er) { toast(er.message, true); } };

  /* seeds */
  const fillSeed = (s) => { $('#shash').textContent = s.hash; $('#snonce').textContent = s.nonce; $('#cseed').value = s.client; };
  $('#setc').onclick = async () => { try { const r = await api('POST', '/api/seed/client', { client: $('#cseed').value }); App.me.seed = r.user.seed; fillSeed(r.user.seed); toast('Το client seed άλλαξε.'); } catch (er) { toast(er.message, true); } };
  const showRevealed = (list) => { $('#revealed').innerHTML = list.length ? '<b>Αποκαλυμμένα seeds</b>' + list.map((s) => `<div class="seedbox"><div class="mono">${esc(s.server)}</div><div class="mute">hash ${esc(s.hash.slice(0, 20))}… · client «${esc(s.client)}» · ${s.rounds} γύροι <button data-use="${esc(s.server)}|${esc(s.client)}" class="x">Χρήση στην επαλήθευση</button></div></div>`).join('') : ''; $$('[data-use]').forEach((b) => b.onclick = () => { const [sv, cl] = b.dataset.use.split('|'); $('#vserver').value = sv; $('#vclient').value = cl; $('#vnonce').value = 0; $('#vserver').scrollIntoView({ behavior: 'smooth', block: 'center' }); }); };
  $('#rotate').onclick = async () => { if (!confirm('Θα αποκαλυφθεί το τρέχον server seed και θα δημιουργηθεί νέο. Συνέχεια;')) return; try { const r = await api('POST', '/api/seed/rotate', {}); App.me.seed = r.user.seed; fillSeed(r.user.seed); const l = await api('GET', '/api/seeds'); showRevealed(l.seeds); Sound.click(); } catch (er) { toast(er.message, true); } };
  api('GET', '/api/seeds').then((l) => showRevealed(l.seeds)).catch(() => {});

  /* επαλήθευση */
  $('#vgame').onchange = () => $('#vriskw').classList.toggle('hidden', $('#vgame').value !== 'wheel');
  $('#vgo').onclick = async () => {
    const out = $('#vout');
    try {
      const sv = $('#vserver').value.trim(), cl = $('#vclient').value, nn = Number($('#vnonce').value), g = $('#vgame').value;
      if (!sv) throw new Error('Βάλε το αποκαλυμμένο server seed'); if (!crypto.subtle) throw new Error('Χρειάζεται localhost ή HTTPS');
      const ints = await drawInts(sv, cl, nn, App.catalog.draws[g]);
      out.innerHTML = `<div>Hash του seed: <span class="mono">${esc(await sha256hex(sv))}</span><br><span class="mute">Πρέπει να ταιριάζει με το hash που έβλεπες πριν παίξεις.</span></div>
      <div class="draws">${ints.map((i) => `<span>${i}</span>`).join('')}</div><div style="margin-top:6px"><b>${explainDraws(g, ints, $('#vrisk').value)}</b></div>`;
    } catch (er) { out.innerHTML = `<div class="err">${esc(er.message)}</div>`; }
  };

  /* ιστορικό */
  try {
    const h = (await api('GET', '/api/history?limit=40')).rounds;
    $('#hist').innerHTML = h.length ? `<tr><th>Ώρα</th><th>Παιχνίδι</th><th class="r">Ποντάρισμα</th><th class="r">Επιστροφή</th><th></th></tr>` + h.map((r) => `<tr><td>${new Date(r.t).toLocaleTimeString('el-GR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</td><td>${GAME_NAMES[r.game]} <span class="mute small">#${r.nonce}</span></td><td class="r">${money(r.stake)}</td><td class="r ${r.payout >= r.stake ? 'pos' : 'neg'}">${money(r.payout)}</td><td><button class="x" data-n="${r.nonce}" data-c="${esc(r.client)}" data-g="${r.game}" data-h="${esc(r.seedHash)}">🔍</button></td></tr>`).join('') : '<tr><td class="mute">Δεν έχεις παίξει ακόμα.</td></tr>';
    $$('#hist [data-n]').forEach((b) => b.onclick = () => { $('#vgame').value = b.dataset.g; $('#vgame').onchange(); $('#vclient').value = b.dataset.c; $('#vnonce').value = b.dataset.n; toast('Συμπλήρωσε το αποκαλυμμένο seed (μετά από «Νέο seed») και πάτα Επαλήθευση.'); $('#vserver').scrollIntoView({ behavior: 'smooth', block: 'center' }); });
    profileExtras(v, h);
  } catch { /* ignore */ }
  return () => clearInterval(iv);
}


function profileExtras(v, h) {
  const stack = $('.stack', v); if (!stack) return;
  const rounds = [...h].reverse(); let cum = 0; const pts = rounds.map((r) => (cum += r.payout - r.stake));
  const by = {}; h.forEach((r) => { const g = by[r.game] || (by[r.game] = { n: 0, st: 0, pay: 0 }); g.n++; g.st += r.stake; g.pay += r.payout; });
  let spark = '<div class="small mute">Παίξε μερικούς γύρους για να δεις το γράφημα.</div>';
  if (pts.length > 1) { const mn = Math.min(0, ...pts), mx = Math.max(0, ...pts), sp = mx - mn || 1, X = (i) => (i / (pts.length - 1)) * 296 + 2, Y = (x) => 62 - ((x - mn) / sp) * 58; spark = `<svg viewBox="0 0 300 64" style="width:100%;height:84px"><line x1="0" x2="300" y1="${Y(0)}" y2="${Y(0)}" stroke="#ffffff33" stroke-dasharray="3 4"/><polyline fill="none" stroke="${cum >= 0 ? '#4ade80' : '#f87171'}" stroke-width="2.2" stroke-linejoin="round" points="${pts.map((x, i) => X(i) + ',' + Y(x)).join(' ')}"/></svg><div class="small mute">Κέρδος/ζημιά των τελευταίων ${pts.length} γύρων: <b class="${cum >= 0 ? 'pos' : 'neg'}">${cum >= 0 ? '+' : '−'}${money(Math.abs(cum))}</b></div>`; }
  const rows = Object.entries(by).map(([g, x]) => `<tr><td>${GAME_NAMES[g]}</td><td class="r">${x.n}</td><td class="r">${money(x.st)}</td><td class="r ${x.pay >= x.st ? 'pos' : 'neg'}">${x.pay >= x.st ? '+' : '−'}${money(Math.abs(x.pay - x.st))}</td></tr>`).join('');
  const c1 = document.createElement('div'); c1.className = 'card'; c1.innerHTML = `<h2>Στατιστικά</h2>${spark}${rows ? `<table class="ptab" style="margin-top:10px"><tr><th>Παιχνίδι</th><th class="r">Γύροι</th><th class="r">Πονταρίσματα</th><th class="r">Αποτέλεσμα</th></tr>${rows}</table>` : ''}`;
  const c2 = document.createElement('div'); c2.className = 'card'; c2.innerHTML = `<h2>Όρια παιχνιδιού</h2><div class="small mute" style="margin-bottom:10px">Βάλε όρια για να παίζεις υπεύθυνα. Ισχύουν για τη συνεδρία σου σε αυτό τον browser.</div>
    <div class="form"><div><label>Όριο απωλειών συνεδρίας (€, 0 = κανένα)</label><input id="lim_loss" type="number" min="0" step="1" value="${LIM.loss}"></div><div><label>Υπενθύμιση κάθε (λεπτά, 0 = καμία)</label><input id="lim_time" type="number" min="0" step="5" value="${LIM.time}"></div>
    <div class="full"><button id="lim_save">Αποθήκευση ορίων</button> <span class="small mute" id="lim_msg"></span></div></div>`;
  stack.prepend(c2); stack.prepend(c1);
  $('#lim_save').onclick = () => { lsSet('tr_loss', String(Math.max(0, Number($('#lim_loss').value) || 0))); lsSet('tr_time', String(Math.max(0, Number($('#lim_time').value) || 0))); App.sess.warned = false; $('#lim_msg').textContent = 'Αποθηκεύτηκε ✔'; Sound.click(); };
}

/* ======================= Εκκίνηση ======================= */
(async function boot() {
  try { App.catalog = await api('GET', '/api/catalog'); } catch { document.body.textContent = 'Δεν υπάρχει σύνδεση με τον server.'; return; }
  try { App.me = (await api('GET', '/api/me')).user; } catch { App.me = null; }
  show();
})();
