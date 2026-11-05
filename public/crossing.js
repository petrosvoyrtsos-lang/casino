'use strict';
/* Διάβαση: ένας άνθρωπος διασχίζει δρόμο με αυτοκίνητα. Βήμα-βήμα και cash out όποτε θες */
Games.crossing = {
  mount(v) {
    const C = App.catalog.crossing, W = 900, H = 440, LW = 110, SW = 150, MY = 292, KEYS = Object.keys(C.diffs);
    let diff = 'medium', st = { active: false }, busy = false, dead = false, raf = 0, camX = 0;
    const man = { x: 100, state: 'stand', t0: 0, fromX: 100, toX: 100, vx: 0, vy: 0, y: 0, rot: 0, flash: 0, cheer: 0, ph: 0, look: 0, lookUp: 0, scared: 0, sq: 0, lastStep: 0, dur: 650 };
    let cars = [], decor = [], parts = [], floats = [], hitLane = -1, finalBadge = null, ts = 1, shake = 0, lastT = 0, bamT = 0, hitLaneFlash = 0;
    const rnd = (a, b) => a + Math.random() * (b - a);
    const bx = (k) => (k === 0 ? 100 : SW + k * LW);          // θέση ανθρώπου μετά από k ασφαλείς λωρίδες
    const maxN = () => C.diffs[diff].max, ladder = () => C.diffs[diff].ladder;
    const fmt = (m) => m.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '×';

    v.innerHTML = `<div class="grid2 crossgrid"><div class="stack"><div class="card"><h2>Διάβαση <span id="fairline">${App.fairLine()}</span></h2>
      <div class="crossstage"><canvas id="cc" width="${W}" height="${H}"></canvas></div>
      <div class="crossbar"><div><span class="small mute">Πολλαπλασιαστής</span><b id="cmul">1,00×</b></div><div><span class="small mute">Κέρδος τώρα</span><b id="cwin" class="gold">0,00 €</b></div><div><span class="small mute">Επόμενο βήμα</span><b id="cnext">–</b></div></div>
      <div class="msg" id="msg"></div></div></div>
      <div class="card"><h2>Ο δρόμος</h2>
        <div class="small mute" style="margin-bottom:6px">Δυσκολία (πιθανότητα να σε χτυπήσει αυτοκίνητο σε κάθε λωρίδα):</div>
        <div class="diffs" id="diffs">${KEYS.map((k) => `<button data-d="${k}"><b>${C.diffs[k].name}</b><span>${C.diffs[k].hit}% ρίσκο</span><em>έως ${C.diffs[k].ladder[C.diffs[k].ladder.length - 1].toLocaleString('el-GR', { maximumFractionDigits: 0 })}×</em></button>`).join('')}</div>
        <div id="setup" style="margin-top:14px">${stakeBox('<button class="primary spinbtn" id="start">🚶 ΞΕΚΙΝΑ</button>')}</div>
        <div id="live" class="hidden" style="margin-top:14px"><div class="row"><button class="primary grow" id="stepb" style="font-size:18px">ΠΕΡΠΑΤΑ ▶</button></div>
          <div class="row" style="margin-top:10px"><button class="grow cashb" id="cash">ΠΑΡΕ <span id="cashv">0,00 €</span></button></div>
          <div class="small mute" style="margin-top:8px" id="chance"></div></div>
        <div class="ladder cladder" id="lad" style="margin-top:14px"></div>
        <div class="small mute" style="margin-top:10px">Κάθε φορά που περνάς μια λωρίδα ανεβαίνει ο πολλαπλασιαστής. Μπορείς να πληρωθείς όποτε θες, αλλά αν σε χτυπήσει αυτοκίνητο χάνεις το ποντάρισμα. RTP 97% σε κάθε βήμα. Space = βήμα · C = cash out.</div></div></div>`;
    const getStake = wireStake(v), msg = $('#msg'), cv = $('#cc'), ctx = cv.getContext('2d');

    function refresh() {
      $$('#diffs button').forEach((b) => { b.classList.toggle('on', b.dataset.d === diff); b.disabled = st.active; });
      $('#setup').classList.toggle('hidden', !!st.active); $('#live').classList.toggle('hidden', !st.active);
      const k = st.active ? st.step : 0, L = ladder();
      $('#cmul').textContent = k ? fmt(L[k - 1]) : '1,00×';
      $('#cwin').textContent = st.active && k ? money(Math.floor(st.stake * L[k - 1] * 10000 / 10000)) : '0,00 €';
      $('#cnext').textContent = st.active && k < L.length ? fmt(L[k]) : st.active ? 'ΤΕΛΟΣ' : fmt(L[0]);
      $('#cash').disabled = busy || !st.active || k < 1; $('#stepb').disabled = busy || !st.active; $('#cashv').textContent = st.active && k ? money(Math.floor(st.stake * L[k - 1])) : '0,00 €';
      const safe = 100 - C.diffs[diff].hit; $('#chance').textContent = st.active ? `Πιθανότητα να περάσεις την επόμενη λωρίδα: ${safe}%` : '';
      $('#lad').innerHTML = L.map((m, i) => `<div class="${st.active && k === i + 1 ? 'cur' : ''} ${st.active && i < k ? 'done' : ''}"><span>Λωρίδα ${i + 1}</span><b>${fmt(m)}</b></div>`).join('');
    }
    $$('#diffs button').forEach((b) => b.onclick = () => { if (st.active || busy) return; diff = b.dataset.d; Sound.click(); resetScene(); refresh(); });

    /* ---------------- σκηνή ---------------- */
    function resetScene() { man.x = bx(0); man.state = 'stand'; man.rot = 0; man.y = 0; man.flash = 0; cars = []; parts = []; floats = []; hitLane = -1; finalBadge = null; decor = []; for (let i = 0; i < maxN(); i++) if (Math.random() < 0.8) spawnDecor(i, true); }
    function spawnDecor(lane, init) { const dir = lane % 2 ? -1 : 1, col = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#8d5fd3', '#f1faee', '#ffb703'][Math.floor(rnd(0, 7))]; decor.push({ lane, y: init ? rnd(-100, H) : dir > 0 ? -90 : H + 90, dir, v: rnd(0.25, 0.55), col }); }
    function drawCar(cx, cy, col, dir, glow) {
      ctx.save(); ctx.translate(cx, cy); if (dir < 0) ctx.rotate(Math.PI); ctx.shadowColor = '#0008'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 6;
      ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(-22, -46, 44, 92, 12); ctx.fill(); ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
      ctx.fillStyle = '#ffffff30'; ctx.beginPath(); ctx.roundRect(-18, -40, 36, 40, 8); ctx.fill();
      ctx.fillStyle = '#16202e'; ctx.beginPath(); ctx.roundRect(-16, -22, 32, 14, 4); ctx.fill(); ctx.beginPath(); ctx.roundRect(-16, 16, 32, 12, 4); ctx.fill();
      ctx.fillStyle = '#0003'; ctx.fillRect(-16, -6, 32, 22);
      ctx.fillStyle = glow ? '#fff7a8' : '#ffe9a0'; ctx.beginPath(); ctx.arc(-14, 44, 4, 0, 7); ctx.arc(14, 44, 4, 0, 7); ctx.fill();
      if (glow) { ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.moveTo(-18, 46); ctx.lineTo(-34, 120); ctx.lineTo(34, 120); ctx.lineTo(18, 46); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.fillStyle = '#ff2b2b'; ctx.fillRect(-18, -46, 8, 4); ctx.fillRect(10, -46, 8, 4); ctx.restore();
    }
    /* άνθρωπος με σκελετό: μηρός+κνήμη, βραχίονας+πήχης, κεφάλι που γυρίζει */
    function limb(x0, y0, a1, l1, a2, l2, w, col) { const x1 = x0 + Math.sin(a1) * l1, y1 = y0 + Math.cos(a1) * l1, x2 = x1 + Math.sin(a2) * l2, y2 = y1 + Math.cos(a2) * l2; ctx.strokeStyle = col; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); return [x2, y2]; }
    function drawMan(x, y, t, o) {
      const { state, ph = 0, rot = 0, look = 0, lookUp = 0, scared = 0, cheer = 0, sq = 0 } = o; const run = state === 'run', ragdoll = state === 'dead';
      const sw = run ? Math.sin(ph) : 0, bob = run ? -Math.abs(Math.sin(ph)) * 7 : Math.sin(t * 2.2) * 1.2, lean = run ? 0.16 : scared ? -0.12 : 0;
      ctx.save(); ctx.translate(x, y); ctx.fillStyle = '#0006'; ctx.beginPath(); ctx.ellipse(0, 5, 26 - (ragdoll ? 0 : -bob * 0.4), 8, 0, 0, 7); ctx.fill();
      ctx.translate(0, bob + sq * 6); ctx.rotate(rot + lean); ctx.scale(1 + sq * 0.08, 1 - sq * 0.1); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      const T = t * 14;
      // πόδια (γόνατο: κάμψη στην ανύψωση)
      const la = ragdoll ? Math.sin(T) * 1.0 + 0.3 : sw * 0.85, ra = ragdoll ? -Math.sin(T) * 1.0 - 0.3 : -sw * 0.85;
      const kneeL = run ? Math.max(0, -Math.cos(ph)) * 0.9 : 0, kneeR = run ? Math.max(0, Math.cos(ph)) * 0.9 : 0;
      const fL = limb(-6, -40, la, 20, la - kneeL, 20, 12, '#27406e'), fR = limb(6, -40, ra, 20, ra - kneeR, 20, 12, '#2f4c82');
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.ellipse(fL[0] + 3, fL[1], 9, 5, 0, 0, 7); ctx.ellipse(fR[0] + 3, fR[1], 9, 5, 0, 0, 7); ctx.fill();
      // πίσω χέρι
      const aa = cheer ? -2.7 + Math.sin(t * 14) * 0.25 : ragdoll ? 2.4 + Math.sin(T * 1.3) : scared ? -2.4 : -sw * 1.0;
      const aa2 = cheer ? -2.7 - Math.sin(t * 14) * 0.25 : ragdoll ? -2.0 - Math.sin(T) : scared ? -2.4 : sw * 1.0;
      limb(-17, -80, aa2 * 0.9, 17, aa2 * 0.9 + (run ? 0.7 : 0.2), 17, 9, '#e8b98c');
      // κορμός
      const g = ctx.createLinearGradient(-16, -90, 16, -36); g.addColorStop(0, '#ff5a5f'); g.addColorStop(1, '#bf2a33'); ctx.fillStyle = g; ctx.beginPath(); ctx.roundRect(-18, -90, 36, 54, 11); ctx.fill();
      ctx.fillStyle = '#ffffff40'; ctx.beginPath(); ctx.roundRect(-6, -90, 12, 14, 4); ctx.fill(); ctx.fillStyle = '#7a1018'; ctx.fillRect(-18, -42, 36, 6);
      // μπροστινό χέρι
      limb(17, -80, aa * 0.9, 17, aa * 0.9 + (run ? -0.7 : -0.2), 17, 9, '#ffd1a1');
      // κεφάλι
      ctx.save(); ctx.translate(0, -98); ctx.rotate(look * 0.12 - lookUp * 0.05 + (ragdoll ? Math.sin(T) * 0.3 : 0));
      ctx.fillStyle = '#ffd1a1'; ctx.beginPath(); ctx.arc(0, -7, 17, 0, 7); ctx.fill(); ctx.fillStyle = '#3b2314'; ctx.beginPath(); ctx.arc(0, -11, 17, Math.PI, 0); ctx.fill(); ctx.fillRect(-17, -13, 34, 5);
      const ex = 3 + look * 5, blink = (Math.floor(t * 2.3) % 7 === 0 && (t * 2.3) % 1 < 0.18) ? 0.5 : 4;
      ctx.fillStyle = '#fff'; if (!ragdoll) { ctx.beginPath(); ctx.ellipse(ex, -6, 4.4, scared ? 5.5 : blink, 0, 0, 7); ctx.ellipse(ex + 9, -6, 4.4, scared ? 5.5 : blink, 0, 0, 7); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex + look * 1.5 + 1, -6 - lookUp * 2, 2.1, 0, 7); ctx.arc(ex + 9 + look * 1.5 + 1, -6 - lookUp * 2, 2.1, 0, 7); ctx.fill(); }
      else { ctx.strokeStyle = '#111'; ctx.lineWidth = 2.4; for (const dx of [ex, ex + 9]) { ctx.beginPath(); ctx.moveTo(dx - 3, -9); ctx.lineTo(dx + 3, -3); ctx.moveTo(dx + 3, -9); ctx.lineTo(dx - 3, -3); ctx.stroke(); } }
      ctx.strokeStyle = '#8a4b2a'; ctx.lineWidth = 2; ctx.fillStyle = '#6b2b18'; ctx.beginPath();
      if (scared || ragdoll) { ctx.ellipse(ex + 4, 4, 3.5, 5, 0, 0, 7); ctx.fill(); } else if (cheer) { ctx.arc(ex + 4, 1, 6, 0.1, Math.PI - 0.1); ctx.fill(); } else { ctx.arc(ex + 4, 0, 4, 0.1, Math.PI - 0.1); ctx.stroke(); }
      ctx.restore(); ctx.restore();
    }
    function frame(now) {
      if (dead) return; const t = now / 1000; const f = Math.min(3, (now - (lastT || now)) / 16.67) || 1; lastT = now; ts += (1 - ts) * 0.04 * f;
      // κάμερα
      const wl = SW + maxN() * LW + 220; const target = Math.max(0, Math.min(wl - W, man.x - 300)); camX += (target - camX) * 0.08;
      ctx.save(); ctx.clearRect(0, 0, W, H); ctx.translate(-camX + (shake > 0 ? rnd(-shake, shake) : 0), shake > 0 ? rnd(-shake, shake) * 0.6 : 0); shake = Math.max(0, shake - 0.5 * f);
      const x0 = 0;
      // πεζοδρόμιο έναρξης
      const sg = ctx.createLinearGradient(0, 0, 0, H); sg.addColorStop(0, '#b9bfcc'); sg.addColorStop(1, '#8e95a6'); ctx.fillStyle = sg; ctx.fillRect(x0 - 400, 0, SW + 400, H);
      ctx.strokeStyle = '#ffffff44'; ctx.lineWidth = 2; for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(-400, y); ctx.lineTo(SW, y); ctx.stroke(); }
      // δρόμος
      const N = maxN(); const ag = ctx.createLinearGradient(0, 0, 0, H); ag.addColorStop(0, '#2b2f3a'); ag.addColorStop(1, '#1b1e27'); ctx.fillStyle = ag; ctx.fillRect(SW, 0, N * LW, H);
      for (let i = 0; i < N; i++) {
        const x = SW + i * LW, done = st.active && i < st.step, nxt = st.active && i === st.step;
        if (done) { ctx.fillStyle = '#22c55e14'; ctx.fillRect(x, 0, LW, H); } if (nxt) { ctx.fillStyle = '#ffd34d12'; ctx.fillRect(x, 0, LW, H); }
        if (i > 0) { ctx.strokeStyle = '#e9e9e9aa'; ctx.lineWidth = 3; ctx.setLineDash([26, 22]); ctx.lineDashOffset = 0; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); ctx.setLineDash([]); }
        // πινακίδα λωρίδας
        const bad = hitLane === i, m = ladder()[i]; ctx.save(); ctx.translate(x + LW / 2, 36); ctx.fillStyle = bad ? '#7f1d1d' : done ? '#14532d' : nxt ? '#7a5a00' : '#1e293b'; ctx.strokeStyle = bad ? '#ef4444' : done ? '#4ade80' : nxt ? '#ffd34d' : '#475569'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(-40, -17, 80, 34, 10); ctx.fill(); ctx.stroke();
        ctx.fillStyle = bad ? '#fecaca' : done ? '#bbf7d0' : nxt ? '#fde68a' : '#cbd5e1'; ctx.font = 'bold 17px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText((done ? '✔ ' : bad ? '✖ ' : '') + fmt(m), 0, 1); ctx.restore();
      }
      // τέλος: πεζοδρόμιο + θησαυρός
      const ex = SW + N * LW; ctx.fillStyle = sg; ctx.fillRect(ex, 0, 700, H); ctx.strokeStyle = '#ffffff44'; for (let y = 0; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(ex, y); ctx.lineTo(ex + 700, y); ctx.stroke(); }
      ctx.font = '60px sans-serif'; ctx.textAlign = 'center'; ctx.fillText('💰', ex + 80, MY - 30); ctx.font = 'bold 15px sans-serif'; ctx.fillStyle = '#1b2433'; ctx.fillText('ΤΕΡΜΑ', ex + 80, MY + 36);
      ctx.font = '48px sans-serif'; ctx.fillText('🌳', -60, 120); ctx.fillText('🏢', 20, 90); ctx.fillText('🌳', ex + 190, 130);
      // νησίδες ασφαλείας (θέσεις ανθρώπου)
      for (let k = 1; k < N; k++) { ctx.fillStyle = '#a7adbb'; ctx.beginPath(); ctx.roundRect(bx(k) - 9, MY - 20, 18, 26, 6); ctx.fill(); }
      // αυτοκίνητα διακόσμησης
      for (let i = decor.length - 1; i >= 0; i--) { const c = decor[i]; c.y += c.dir * c.v * 16 * f; if ((c.dir > 0 && c.y > H + 100) || (c.dir < 0 && c.y < -100)) { decor.splice(i, 1); if (Math.random() < 0.9) setTimeout(() => !dead && decor.push && spawnDecor(c.lane), rnd(300, 2500)); continue; } if (c.lane === (cars.length ? cars[0].lane : -9)) continue; drawCar(SW + c.lane * LW + LW / 2, c.y, c.col, c.dir, true); }
      // κινούμενα αντικείμενα
      stepMan(now, f); for (const c of cars) { c.y += c.v * 16 * f * (c.slow ? ts : 1); if (c.brake) { ctx.fillStyle = '#ff2b2b'; ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 40); ctx.beginPath(); ctx.arc(SW + c.lane * LW + LW / 2, c.y - 46, 22, 0, 7); ctx.fill(); ctx.globalAlpha = 1; } drawCar(SW + c.lane * LW + LW / 2, c.y, c.col, 1, true); if (c.speedLines) { ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 2; for (let q = 0; q < 4; q++) { const lx = SW + c.lane * LW + LW / 2 + (q - 1.5) * 12; ctx.beginPath(); ctx.moveTo(lx, c.y - 60 - q * 10); ctx.lineTo(lx, c.y - 120 - q * 14); ctx.stroke(); } } }
      cars = cars.filter((c) => c.y < H + 140);
      drawMan(man.x, MY + man.y, t, { state: man.state === 'walk' ? 'run' : man.state, ph: man.ph, rot: man.rot, look: man.look, lookUp: man.lookUp, scared: man.scared, cheer: man.state === 'cheer' ? 1 : 0, sq: man.sq });
      if (man.state === 'cheer') { man.y = -Math.abs(Math.sin(t * 7)) * 22; }
      if (man.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${man.flash})`; ctx.fillRect(camX, 0, W, H); man.flash = Math.max(0, man.flash - 0.06); }
      for (let i = parts.length - 1; i >= 0; i--) { const q = parts[i]; q.x += q.vx; q.y += q.vy; q.vy += 0.3; q.l -= 0.018; if (q.l <= 0) { parts.splice(i, 1); continue; } ctx.globalAlpha = q.l; ctx.fillStyle = q.c; ctx.beginPath(); ctx.arc(q.x, q.y, q.r, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.font = 'bold 26px sans-serif'; ctx.textAlign = 'center';
      for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.y -= 1; f.l -= 0.014; if (f.l <= 0) { floats.splice(i, 1); continue; } ctx.globalAlpha = Math.min(1, f.l * 2); ctx.fillStyle = f.c || '#ffe14d'; ctx.strokeStyle = '#000a'; ctx.lineWidth = 4; ctx.strokeText(f.t, f.x, f.y); ctx.fillText(f.t, f.x, f.y); ctx.globalAlpha = 1; }
      if (bamT > 0) { bamT -= 0.02 * f; ctx.save(); ctx.translate(man.x + 20, MY - 150); ctx.rotate(-0.15); const sc = 1 + (1 - Math.min(1, bamT)) * 0.0 + Math.sin(bamT * 30) * 0.05; ctx.scale(sc, sc); ctx.font = '900 64px sans-serif'; ctx.textAlign = 'center'; ctx.lineWidth = 9; ctx.strokeStyle = '#7a1018'; ctx.fillStyle = '#ffd34d'; ctx.strokeText('ΜΠΑΜ!', 0, 0); ctx.fillText('ΜΠΑΜ!', 0, 0); ctx.restore(); }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    }
    function stepMan(now, f) {
      if (man.state === 'walk') {
        const u = Math.min(1, (now - man.t0) / man.dur); const e = u * u * (3 - 2 * u); man.x = man.fromX + (man.toX - man.fromX) * e; man.ph += 0.55 * f; man.look *= 0.8; man.lookUp *= 0.8; man.scared = 0;
        if (Math.floor(man.ph / Math.PI) !== man.lastStep) { man.lastStep = Math.floor(man.ph / Math.PI); Sound.tick(260 + (man.lastStep % 2) * 40); if (Math.random() < 0.6) parts.push({ x: man.x - 6, y: MY + 2, vx: rnd(-1.2, -0.2), vy: rnd(-2, -0.5), r: rnd(2, 4), l: 0.7, c: '#c9c2b2' }); }
        if (u >= 1) { man.x = man.toX; man.state = 'stand'; man.sq = 1; }
      } else if (man.state === 'dead') {
        man.x += man.vx * f * ts; man.y += man.vy * f * ts; man.vy += 0.9 * f * ts; man.rot += 0.16 * f * ts * (man.vx > 0 ? 1 : -1);
        if (man.y > 0 && man.vy > 0) { man.y = 0; man.vy *= -0.38; man.vx *= 0.55; shake = Math.max(shake, 4); if (Math.abs(man.vy) < 1.6) { man.vy = 0; man.vx = 0; man.rot = Math.PI / 2 * (man.rot > 0 ? 1 : -1); } }
      } else if (man.state === 'look') { man.look = Math.sin(performance.now() / 110) * 1.0; man.lookUp = 0.8; }
      man.sq *= 0.86; if (man.state !== 'dead' && man.state !== 'scared') man.rot *= 0.8;
    }
    const burst = (x, y, n, cols) => { for (let i = 0; i < n; i++) parts.push({ x, y, vx: rnd(-5, 5), vy: rnd(-9, -1), r: rnd(3, 7), l: 1, c: cols[i % cols.length] }); };
    const sleepT = (ms) => new Promise((r) => setTimeout(r, ms));
    resetScene(); raf = requestAnimationFrame(frame);

    /* ---------------- ενέργειες ---------------- */
    async function start() {
      if (busy || st.active) return; busy = true; $('#start').disabled = true; msg.className = 'msg'; const s = getStake();
      try {
        App.guard(); await App.ensure(Math.round(s * 100));
        const r = await api('POST', '/api/crossing/start', { stake: s, diff }); st = r; App.me.balance = r.balance; App.me.seed.nonce = r.nonce + 1; App.updateFair(); App.showBalance(r.balance);
        resetScene(); Sound.click(); floats.push({ x: man.x, y: MY - 140, t: 'Καλή τύχη!', l: 1.6, c: '#fff' });
      } catch (e) { App.msg(msg, 'lose', e.message); Sound.error(); }
      busy = false; $('#start').disabled = false; refresh();
    }
    async function stepGo() {
      if (busy || !st.active) return; busy = true; refresh(); msg.className = 'msg';
      try {
        const r = await api('POST', '/api/crossing/step', {}); const lane = st.step, hit = r.status === 'hit';
        const SPD = 0.8 * 16 * 60, tA = hit ? 1.0 : 0.5, mc = ['#e63946', '#2a9d8f', '#f4a261', '#457b9d', '#8d5fd3'][lane % 5];
        decor = decor.filter((c) => c.lane !== lane); const car = { lane, y: MY - SPD * tA, v: 0.8, col: hit ? '#e63946' : mc, slow: true, speedLines: true, brake: false }; cars = [car];
        // 1) ο άνθρωπος κοιτάζει γύρω και ακούγεται κόρνα
        man.state = 'look'; Sound.car(); await sleepT(420); if (dead) return; Sound.beep && Sound.beep();
        // 2) τρέχει στη λωρίδα
        man.state = 'walk'; man.fromX = bx(st.step); man.toX = bx(st.step + 1); man.t0 = performance.now(); man.dur = hit ? 620 : 700; man.lastStep = 0;
        if (hit) {
          man.toX = SW + lane * LW + LW / 2 - 4; const wait = (tA * 1000) - 420 - 30; await sleepT(Math.max(80, wait)); if (dead) return;
          man.state = 'dead'; man.vx = 8; man.vy = -14; man.rot = 0.1; man.flash = 0.8; hitLane = lane; shake = 14; ts = 0.25; bamT = 1; burst(man.x, MY - 50, 34, ['#ffd34d', '#ff6b6b', '#fff']); Sound.thunk(); Sound.lose();
          await sleepT(1700); st = { active: false }; $('#cmul').textContent = '0,00×'; App.settle(r); App.resultMsg(msg, r.round); msg.textContent = `Σε χτύπησε αυτοκίνητο στη λωρίδα ${lane + 1}. ` + msg.textContent;
        } else {
          car.brake = true; await sleepT(man.dur + 120); if (dead) return; car.brake = false; Sound.ding(Math.min(st.step + 1, 8)); burst(man.x, MY - 60, 12, ['#ffd34d', '#fff']); man.sq = 1;
          if (r.status === 'cashed') { st.step++; await finishWin(r, true); } else { st = r; floats.push({ x: man.x, y: MY - 150, t: fmt(ladder()[st.step - 1]), l: 1.3 }); }
        }
      } catch (e) {
        App.msg(msg, 'lose', e.message); Sound.error(); man.state = 'stand';
        try { const r2 = await api('GET', '/api/crossing/state'); st = r2.active ? r2 : { active: false }; if (r2.active) { man.x = bx(r2.step); } App.me.balance = r2.balance; App.showBalance(r2.balance); } catch { /* ignore */ }
      }
      busy = false; refresh();
    }
    async function finishWin(r, auto) {
      man.state = 'cheer'; Sound.coins(); burst(man.x, MY - 80, 60, ['#ffd34d', '#fff', '#ffb703', '#ff6b6b']); for (let i = 0; i < 5; i++) setTimeout(() => !dead && burst(man.x + rnd(-80, 80), MY - 140, 16, ['#ffd34d', '#fff']), i * 250); floats.push({ x: man.x, y: MY - 170, t: '+' + money(r.round.payout), l: 1.8 });
      await sleepT(900); st = { active: false }; App.settle(r); App.resultMsg(msg, r.round); if (auto) msg.textContent = 'Έφτασες στο τέρμα! ' + msg.textContent;
      await sleepT(500); man.state = 'stand'; man.y = 0;
    }
    async function cashout() {
      if (busy || !st.active || st.step < 1) return; busy = true; refresh();
      try { const r = await api('POST', '/api/crossing/cashout', {}); await finishWin(r, false); } catch (e) { App.msg(msg, 'lose', e.message); }
      busy = false; refresh();
    }
    $('#start').onclick = start; $('#stepb').onclick = stepGo; $('#cash').onclick = cashout;
    const key = (e) => { if (/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) return; if (e.code === 'Space') { e.preventDefault(); st.active ? stepGo() : start(); } else if (e.code === 'KeyC') cashout(); };
    document.addEventListener('keydown', key);
    // επαναφορά ανοιχτού γύρου (π.χ. μετά από refresh)
    api('GET', '/api/crossing/state').then((r) => { if (dead || !r.active) { refresh(); return; } st = r; diff = r.diff; resetScene(); man.x = bx(r.step); camX = Math.max(0, man.x - 300); App.me.balance = r.balance; App.showBalance(r.balance); refresh(); toast('Συνεχίζεις τον γύρο που είχες ανοιχτό στη Διάβαση', false); }).catch(() => refresh());
    refresh();
    return () => { dead = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  },
};
