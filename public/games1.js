'use strict';
/* Traffic Rush + Φρουτάκι */

const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const mix = (h, t, amt) => { const c = hexRgb(h); return `rgb(${c.map((v) => Math.round(v + (t - v) * amt)).join(',')})`; };
const lighten = (h, a) => mix(h, 255, a), darken = (h, a) => mix(h, 0, a);
const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

/* ============================== TRAFFIC RUSH ============================== */
Games.traffic = {
  mount(v) {
    const C = App.catalog.traffic, colors = C.colors;
    let slip = [], busy = false, dead = false, raf = 0, timeScale = 1, rounds = [];
    const sel = {};
    v.innerHTML = `<div class="grid2">
      <div class="stack">
        <div class="card"><h2>Ο δρόμος · ραντάρ μέτρησης <span id="fairline" style="float:right;text-transform:none;letter-spacing:0">${App.fairLine()}</span></h2>
          <canvas id="road" width="960" height="320"></canvas>
          <div class="counts" id="counts"></div>
          <div class="row" style="margin-top:10px;justify-content:space-between">
            <div>Πέρασαν: <b id="passed">0</b> / 20</div>
            <div class="row"><label style="margin:0"><input type="checkbox" id="fast" style="width:auto"> Γρήγορη κίνηση</label><button id="skip" disabled>⏭ Παράλειψη</button></div>
          </div>
          <div class="msg" id="msg"></div>
          <div style="margin-top:12px"><div class="small mute">Τελευταίοι γύροι (σειρά διέλευσης των αμαξιών →)</div><div id="hist"></div></div>
        </div>
        <div class="card"><h2>Το δελτίο σου</h2>
          ${stakeBox()}
          <table id="slip" style="margin-top:10px"></table>
          <div class="row" style="margin-top:12px;justify-content:space-between">
            <div>Σύνολο: <b id="tot" class="gold">0,00 €</b></div>
            <div class="row"><button id="clear">Καθάρισμα</button><button class="primary" id="go">▶ ΞΕΚΙΝΑ ΓΥΡΟ</button></div>
          </div>
        </div>
      </div>
      <div class="card"><h2>Αγορές</h2>
        <div class="small mute" style="margin-bottom:10px">Σε κάθε γύρο περνούν πάντα 20 αμάξια. Κάθε αμάξι έχει ίση πιθανότητα (20%) για καθένα από τα 5 χρώματα. Αποδόσεις με προβάδισμα καζίνο ${(C.edge * 100).toFixed(0)}%.</div>
        <div id="markets"></div></div></div>`;
    const getStake = wireStake(v);
    const cv = $('#road'), ctx = cv.getContext('2d'), W = cv.width, H = cv.height;
    const msg = $('#msg');

    /* ---------- μετρητές ---------- */
    $('#counts').innerHTML = colors.map((c, i) => `<div class="cnt" id="cnt${i}"><div class="sw" style="background:${c.h}"></div><b>0</b><small class="mute">${c.n}</small></div>`).join('');
    const setCounts = (arr, bump) => { arr.forEach((n, i) => { const e = $('#cnt' + i); $('b', e).textContent = n; if (bump === i) { e.classList.remove('bump'); void e.offsetWidth; e.classList.add('bump'); } }); };
    const renderHist = () => { $('#hist').innerHTML = rounds.slice(0, 6).map((cars) => `<div class="hist">${cars.map((c) => `<i style="background:${colors[c].h}"></i>`).join('')}</div>`).join('') || '<span class="small mute">Κανένας γύρος ακόμα.</span>'; };
    api('GET', '/api/history?limit=100').then((h) => { rounds = h.rounds.filter((r) => r.game === 'traffic').map((r) => r.result.cars).slice(0, 6); if (!dead) renderHist(); }).catch(() => {});
    renderHist();

    /* ---------- σκηνή ---------- */
    const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    const PERIOD = 1500; const bld = []; for (let x = 0; x < PERIOD;) { const w = 50 + rnd() * 70, h = 40 + rnd() * 70; bld.push({ x, w, h, tone: 0.5 + rnd() * 0.5, win: Array.from({ length: 30 }, () => rnd() > 0.55) }); x += w + 4 + rnd() * 8; }
    const LANES = [{ y: 202, s: 0.86 }, { y: 262, s: 1 }];
    let scroll = 0, flash = 0, state = { x: [] };
    function drawScene() {
      // ουρανός (σούρουπο)
      const sky = ctx.createLinearGradient(0, 0, 0, 130); sky.addColorStop(0, '#0b1230'); sky.addColorStop(0.7, '#3b2a63'); sky.addColorStop(1, '#e0745a'); ctx.fillStyle = sky; ctx.fillRect(0, 0, W, 130);
      // πόλη
      const off = (scroll * 0.08) % PERIOD;
      for (let rep = -1; rep < 2; rep++) for (const b of bld) {
        const x = b.x - off + rep * PERIOD; if (x > W || x + b.w < 0) continue;
        ctx.fillStyle = `rgb(${20 * b.tone | 0},${24 * b.tone | 0},${48 * b.tone | 0})`; ctx.fillRect(x, 128 - b.h, b.w, b.h);
        let k = 0; for (let wy = 128 - b.h + 6; wy < 120; wy += 11) for (let wx = x + 5; wx < x + b.w - 6; wx += 10) { if (b.win[k++ % 30]) { ctx.fillStyle = '#ffd77a'; ctx.fillRect(wx, wy, 4, 5); } }
      }
      // πεζοδρόμιο + γρασίδι
      ctx.fillStyle = '#1c3a2a'; ctx.fillRect(0, 128, W, 22); ctx.fillStyle = '#7b7f8c'; ctx.fillRect(0, 146, W, 6);
      // φανοστάτες
      const lo = (scroll * 0.4) % 300;
      for (let x = -lo; x < W + 300; x += 300) {
        ctx.fillStyle = '#2a2f3a'; ctx.fillRect(x - 2, 60, 4, 90); ctx.fillRect(x - 2, 60, 24, 4);
        const g = ctx.createRadialGradient(x + 20, 70, 2, x + 20, 70, 60); g.addColorStop(0, 'rgba(255,226,140,.55)'); g.addColorStop(1, 'rgba(255,226,140,0)'); ctx.fillStyle = g; ctx.fillRect(x - 40, 20, 120, 120);
        ctx.fillStyle = '#ffe9a8'; ctx.fillRect(x + 14, 64, 12, 4);
      }
      // ασφαλτος
      const road = ctx.createLinearGradient(0, 152, 0, H); road.addColorStop(0, '#2a2e38'); road.addColorStop(1, '#16181f'); ctx.fillStyle = road; ctx.fillRect(0, 152, W, H - 152);
      ctx.fillStyle = '#e7e7e7'; ctx.fillRect(0, 156, W, 3); ctx.fillRect(0, H - 22, W, 3);
      ctx.strokeStyle = '#f6c744'; ctx.lineWidth = 3; ctx.setLineDash([36, 28]); ctx.lineDashOffset = (scroll % 64); ctx.beginPath(); ctx.moveTo(0, 233); ctx.lineTo(W, 233); ctx.stroke(); ctx.setLineDash([]);
      // κράσπεδο/μπάρα
      ctx.fillStyle = '#3d4350'; ctx.fillRect(0, H - 18, W, 18); ctx.fillStyle = '#d93a3a'; for (let x = -((scroll * 1) % 60); x < W; x += 60) ctx.fillRect(x, H - 14, 30, 8);
      // ραντάρ
      const cx = W / 2;
      ctx.fillStyle = '#9aa3b5'; ctx.fillRect(cx - 4, 44, 8, 110);
      ctx.fillStyle = '#20242e'; ctx.fillRect(cx - 28, 28, 56, 28); ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 2; ctx.strokeRect(cx - 28, 28, 56, 28);
      ctx.fillStyle = flash > 0 ? '#fff' : '#ff3b3b'; ctx.beginPath(); ctx.arc(cx, 42, 8, 0, 7); ctx.fill();
      ctx.fillStyle = '#f6c744'; ctx.font = 'bold 11px system-ui'; ctx.textAlign = 'center'; ctx.fillText('ΡΑΝΤΑΡ', cx, 22);
      ctx.strokeStyle = 'rgba(255,60,60,.45)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.beginPath(); ctx.moveTo(cx, 58); ctx.lineTo(cx, H - 22); ctx.stroke(); ctx.setLineDash([]);
    }
    function drawCar(x, lane, color, n, ang) {
      const { y, s } = LANES[lane]; ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
      ctx.fillStyle = 'rgba(0,0,0,.45)'; ctx.beginPath(); ctx.ellipse(0, 25, 64, 7, 0, 0, 7); ctx.fill();
      const bg = ctx.createLinearGradient(56, 0, 210, 0); bg.addColorStop(0, 'rgba(255,244,190,.55)'); bg.addColorStop(1, 'rgba(255,244,190,0)');
      ctx.fillStyle = bg; ctx.beginPath(); ctx.moveTo(54, 4); ctx.lineTo(210, -14); ctx.lineTo(210, 36); ctx.lineTo(54, 14); ctx.fill();
      const body = ctx.createLinearGradient(0, -24, 0, 26); body.addColorStop(0, lighten(color, 0.3)); body.addColorStop(0.45, color); body.addColorStop(1, darken(color, 0.4));
      ctx.fillStyle = body; ctx.strokeStyle = color === '#1f2937' ? 'rgba(180,200,255,.55)' : 'rgba(0,0,0,.35)'; ctx.lineWidth = 1.6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-34, -4); ctx.lineTo(-20, -25); ctx.lineTo(20, -25); ctx.lineTo(38, -4); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.roundRect(-60, -5, 120, 30, 11); ctx.fill(); ctx.stroke();
      const gl = ctx.createLinearGradient(0, -22, 0, -5); gl.addColorStop(0, '#d8efff'); gl.addColorStop(1, '#5c7fa8'); ctx.fillStyle = gl;
      ctx.beginPath(); ctx.moveTo(-28, -6); ctx.lineTo(-17, -22); ctx.lineTo(-3, -22); ctx.lineTo(-3, -6); ctx.closePath(); ctx.fill();
      ctx.beginPath(); ctx.moveTo(2, -6); ctx.lineTo(2, -22); ctx.lineTo(18, -22); ctx.lineTo(32, -6); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff4b0'; ctx.beginPath(); ctx.roundRect(54, 2, 7, 8, 3); ctx.fill();
      ctx.fillStyle = '#ff2b2b'; ctx.beginPath(); ctx.roundRect(-61, 2, 6, 8, 3); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(-60, 14, 120, 3);
      ctx.fillStyle = color === '#f8fafc' || color === '#facc15' ? '#1b1f28' : '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(n, 0, 12);
      for (const wx of [-36, 36]) {
        ctx.fillStyle = '#0a0a0c'; ctx.beginPath(); ctx.arc(wx, 25, 12, 0, 7); ctx.fill();
        ctx.fillStyle = '#c9ced8'; ctx.beginPath(); ctx.arc(wx, 25, 7, 0, 7); ctx.fill();
        ctx.strokeStyle = '#5a6070'; ctx.lineWidth = 1.5; for (let k = 0; k < 4; k++) { const a = ang + k * Math.PI / 2; ctx.beginPath(); ctx.moveTo(wx, 25); ctx.lineTo(wx + Math.cos(a) * 7, 25 + Math.sin(a) * 7); ctx.stroke(); }
      }
      ctx.restore();
    }
    let active = null; // τρέχων γύρος
    let lastT = performance.now();
    function frame(now) {
      if (dead) return;
      const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now; const dts = dt * timeScale;
      flash = Math.max(0, flash - dts);
      if (!active) scroll += 40 * dt; else scroll += active.speed * 0.5 * dts;
      drawScene();
      if (active) stepRound(dts);
      if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${Math.min(0.3, flash * 1.6)})`; ctx.fillRect(0, 0, W, H); }
      raf = requestAnimationFrame(frame);
    }
    function stepRound(dts) {
      const a = active; a.sim += dts;
      let done = 0; const lanes = [[], []];
      for (let i = 0; i < a.cars.length; i++) {
        const ti = a.sim - i * a.gap; if (ti < 0) continue;
        const x = -150 + ti * a.speed;
        if (x > W + 200) { done++; continue; }
        lanes[i % 2].push({ i, x });
        if (!a.sounded.has(i) && x > W * 0.3) { a.sounded.add(i); if (timeScale < 3 && (timeScale < 2 || i % 3 === 0)) Sound.car(); }
        if (!a.counted.has(i) && x >= W / 2) {
          a.counted.add(i); a.counts[a.cars[i]]++; setCounts(a.counts, a.cars[i]); $('#passed').textContent = a.counted.size; flash = 0.18;
          if (timeScale < 3) { Sound.flash(); Sound.tick(900 + a.cars[i] * 160); }
        }
      }
      for (const l of [0, 1]) for (const c of lanes[l]) drawCar(c.x, l, colors[a.cars[c.i]].h, c.i + 1, c.x / 11);
      if (done >= a.cars.length) { const r = a.res; active = null; r(); }
    }
    function animateRound(cars) {
      return new Promise((res) => { setCounts([0, 0, 0, 0, 0]); $('#passed').textContent = 0; active = { cars, sim: -0.6, gap: 0.55, speed: 560, counts: [0, 0, 0, 0, 0], counted: new Set(), sounded: new Set(), res }; });
    }
    $('#fast').onchange = () => { timeScale = $('#fast').checked ? 2.2 : 1; };
    $('#skip').onclick = () => { timeScale = 30; };
    raf = requestAnimationFrame(frame);

    /* ---------- αγορές ---------- */
    function renderMarkets() {
      const root = $('#markets'); root.innerHTML = '';
      for (const m of C.markets) {
        const st = sel[m.id] || (sel[m.id] = Object.fromEntries(m.params.map((p, j) => [p.k, m.id === 'duel' && p.k === 'b' ? 1 : 0])));
        const div = el(`<div class="market"><h3>${esc(m.title)}</h3><p>${esc(m.desc)}</p></div>`);
        if (m.params.length) {
          const row = el('<div class="mselect"></div>');
          for (const p of m.params) {
            const d = el(`<div><label>${esc(p.label)}</label><select>${p.vals.map((val, idx) => `<option value="${idx}" ${st[p.k] === idx ? 'selected' : ''}>${esc(p.labels[idx])}</option>`).join('')}</select></div>`);
            $('select', d).onchange = (e) => { st[p.k] = Number(e.target.value); renderMarkets(); };
            row.appendChild(d);
          }
          div.appendChild(row);
        }
        const opts = el('<div class="opts"></div>');
        let list = C.options.filter((o) => o.market === m.id && m.params.every((p) => { const val = p.vals[st[p.k]]; if (m.id === 'duel') return true; return o.pp[p.k] === val; }));
        if (m.id === 'duel') { const a = Math.min(st.a, st.b), b = Math.max(st.a, st.b); list = a === b ? [] : C.options.filter((o) => o.market === 'duel' && o.pp.a === a && o.pp.b === b); }
        if (!list.length) opts.innerHTML = '<span class="small mute">Διάλεξε δύο διαφορετικά χρώματα, ή δεν υπάρχει διαθέσιμη επιλογή.</span>';
        for (const o of list) {
          const b = el(`<button class="opt">${esc(o.label)}<b>${(o.bp / 10000).toFixed(2)}×</b><small>${(o.p * 100).toFixed(2)}%</small></button>`);
          b.disabled = busy; b.onclick = () => { Sound.chip(); addBet(o); }; opts.appendChild(b);
        }
        div.appendChild(opts); root.appendChild(div);
      }
    }
    function addBet(o) {
      const s = getStake(); const ex = slip.find((b) => b.key === o.key);
      if (ex) ex.stake = Math.round((ex.stake + s) * 100) / 100; else slip.push({ key: o.key, desc: o.desc, bp: o.bp, stake: s });
      renderSlip();
    }
    let marks = null;
    function renderSlip(results) {
      const t = $('#slip');
      t.innerHTML = slip.length ? slip.map((b, i) => `<tr><td>${results ? (results[i].won ? '✅' : '❌') : ''} ${esc(b.desc)}<br><small class="mute">${(b.bp / 10000).toFixed(2)}×</small></td><td class="r">${b.stake} €</td><td class="r gold">→ ${money(Math.floor(b.stake * 100 * b.bp / 10000))}</td><td class="r"><button class="x" data-i="${i}" ${busy ? 'disabled' : ''}>✕</button></td></tr>`).join('')
        : '<tr><td class="mute">Πάτα μια απόδοση στις αγορές για να προσθέσεις επιλογή.</td></tr>';
      $('#tot').textContent = money(slip.reduce((s, b) => s + Math.round(b.stake * 100), 0));
      $('#go').disabled = busy || !slip.length; $('#clear').disabled = busy;
      $$('.x', t).forEach((x) => x.onclick = () => { slip.splice(Number(x.dataset.i), 1); Sound.click(); renderSlip(); });
    }
    $('#clear').onclick = () => { slip = []; Sound.click(); renderSlip(); };
    $('#go').onclick = async () => {
      if (busy || !slip.length) return;
      const total = slip.reduce((s, b) => s + Math.round(b.stake * 100), 0);
      busy = true; msg.className = 'msg'; renderSlip(); renderMarkets(); $('#skip').disabled = false;
      try {
        const res = await App.play('traffic', { bets: slip.map((b) => ({ key: b.key, stake: b.stake })) }, total);
        const r = res.round;
        Sound.beep(0); await sleep(350); Sound.beep(0); await sleep(350); Sound.beep(1); await sleep(300);
        await animateRound(r.result.cars);
        timeScale = $('#fast').checked ? 2.2 : 1;
        rounds.unshift(r.result.cars); renderHist();
        App.settle(res); App.resultMsg(msg, r);
        msg.textContent += ` · Μέγ. σερί ${r.result.maxRun}, αλλαγές χρώματος ${r.result.changes}`;
        busy = false; renderSlip(r.lines); renderMarkets();
      } catch (e) { busy = false; timeScale = 1; App.msg(msg, 'lose', e.message); renderSlip(); renderMarkets(); }
      $('#skip').disabled = true;
    };
    renderMarkets(); renderSlip();
    return () => { dead = true; cancelAnimationFrame(raf); };
  },
};
