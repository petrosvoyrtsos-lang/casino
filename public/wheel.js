'use strict';
/* Τροχός Τύχης v3: 40 τμήματα, BONUS τροχός (16 τμήματα) και RESPIN αλυσίδα. */
/* (v2: λαμπάκια, φλιπ δείκτη, ακτίνες φωτός, σπίθες, auto-spin */
Games.wheel = {
  mount(v) {
    const WH = App.catalog.wheel, W = 560, H = 590, CX = 280, CY = 300, R = 222;
    let risk = 'medium', busy = false, dead = false, raf = 0, theta = 0, spinning = false, winIdx = null, hubText = 'SPIN', flap = 0, shake = 0, flashBad = 0, autoLeft = 0, hist = [], cur = null, bonusMode = false, banner = '', bannerT = 0;
    const parts = [];
    const COL = { 0: '#3a3f63', 1.2: '#2f80ff', 1.5: '#00c48c', 2: '#ffa400', 3: '#ff3fa4', 5: '#9b5cff', B: '#d4a017', R: '#14b8a6' };
    const colOf = (m) => COL[m] || (m >= 50 ? '#ff2d55' : m >= 15 ? '#ffd400' : m >= 8 ? '#ff7a2f' : m >= 4 ? '#8b5cf6' : '#ff3fa4');
    const curSeg = () => cur || WH.main[risk];
    const lab = (m) => (m === 'B' ? 'BONUS' : m === 'R' ? 'RESPIN' : m ? m + '×' : '');
    const RISK = { low: ['Χαμηλό', 'Συχνές μικρές νίκες', '#2f80ff'], medium: ['Μεσαίο', 'Ισορροπημένο', '#ffa400'], high: ['Υψηλό', 'Σπάνιες μεγάλες νίκες', '#ff3fa4'] };
    v.innerHTML = `<div class="grid2 wheelgrid"><div class="card wcard"><h2>Τροχός Τύχης <span id="fairline">${App.fairLine()}</span></h2>
      <div class="wheelwrap2"><canvas id="wc" width="${W}" height="${H}"></canvas></div>
      <div class="row" id="whist" style="justify-content:center;min-height:30px;gap:5px"></div>
      <div class="msg" id="msg"></div></div>
      <div class="stack"><div class="card"><h2>Επίπεδο ρίσκου</h2>
        <div class="riskrow" id="risks">${Object.entries(RISK).map(([k, [n, d, c]]) => `<button data-r="${k}" style="--rc:${c}"><b>${n}</b><small>${d}</small></button>`).join('')}</div>
        <div id="sbar" class="segbar"></div><div id="rinfo" class="small mute" style="margin:8px 0"></div>
        ${stakeBox('<button class="primary spinbtn" id="spin">🎡 ΓΥΡΙΣΕ</button>')}
        <div class="row" style="margin-top:10px;gap:10px"><button id="auto">🔁 Auto ×5</button><label style="margin:0"><input type="checkbox" id="turbo" style="width:auto"> Turbo</label><span class="small mute">Space για περιστροφή</span></div></div>
      <div class="card"><h2>Πίνακας κερδών για το ποντάρισμά σου</h2><div id="ptab"></div>
        <div class="small mute" style="margin-top:10px">Τα 40 τμήματα έχουν ίση πιθανότητα (2,5% το καθένα). Στο BONUS γυρίζει δεύτερος τροχός με μεγάλα κέρδη· το RESPIN σε ξαναγυρίζει δωρεάν (μέχρι 4 φορές στη σειρά, τα κέρδη προστίθενται). Το RTP είναι 96–97% και δεν υπάρχει νίκη κάτω από 1,2×.</div></div></div></div>`;
    const getStake = wireStake(v), msg = $('#msg'), cv = $('#wc'), ctx = cv.getContext('2d');

    /* ---------- πληροφορίες / πίνακας ---------- */
    function info() {
      $$('#risks button').forEach((b) => b.classList.toggle('on', b.dataset.r === risk));
      const seg = WH.main[risk], n = seg.length, zero = seg.filter((m) => m === 0).length, bon = WH.bonus[risk], nb = seg.filter((m) => m === 'B').length, nr = seg.filter((m) => m === 'R').length;
      const mx = Math.max(...bon, ...seg.filter((m) => typeof m === 'number'));
      $('#rinfo').innerHTML = `RTP <b>${(WH.rtp[risk] * 100).toFixed(2)}%</b> · χάνεις ${(zero / n * 100).toFixed(1)}% · μέγιστο ${mx}× (στο BONUS)`;
      const sorted = [...seg].sort((a, b) => (typeof a === 'number' ? a : 99) - (typeof b === 'number' ? b : 99)); $('#sbar').innerHTML = sorted.map((m) => `<i style="background:${colOf(m)};flex:1" title="${lab(m) || 'χάνεις'}"></i>`).join('');
      const cnt = {}; seg.forEach((m) => { cnt[m] = (cnt[m] || 0) + 1; }); const st = Math.round(getStake() * 100);
      const keys = Object.keys(cnt).filter((k) => k !== 'B' && k !== 'R').map(Number).sort((a, b) => b - a);
      const row = (name, col, c, val) => `<tr><td><span class="dot" style="background:${col}"></span> ${name}</td><td class="mute small">${c} τμήματα · ${(c / n * 100).toFixed(1)}%</td><td class="r gold">${val}</td></tr>`;
      $('#ptab').innerHTML = `<table>${nb ? row('🎁 BONUS τροχός', COL.B, nb, 'έως ' + money(Math.round(st * Math.max(...bon)))) : ''}${keys.map((m) => row(m ? m + '×' : 'Χάνεις', colOf(m), cnt[m], m ? money(Math.round(st * m)) : money(0))).join('')}${nr ? row('🔁 RESPIN (νέα περιστροφή)', COL.R, nr, 'μέχρι 4 σπιν') : ''}</table>
        <div class="small mute" style="margin-top:8px">Τροχός BONUS (16 τμήματα): ${[...new Set(bon)].sort((a, b) => a - b).map((x) => x + '×').join(' · ')}</div>`;
    }
    $$('#risks button').forEach((b) => b.onclick = () => { if (busy) return; risk = b.dataset.r; winIdx = null; hubText = 'SPIN'; cur = null; bonusMode = false; Sound.click(); info(); });
    $('#stake').addEventListener('input', info); info();
    const renderHist = () => { $('#whist').innerHTML = hist.slice(0, 14).map((h, i) => `<span class="mchip ${i === 0 ? 'first' : ''}" style="background:${colOf(h)}">${h ? h + '×' : '✕'}</span>`).join(''); };
    api('GET', '/api/history?limit=100').then((h) => { hist = h.rounds.filter((r) => r.game === 'wheel').map((r) => r.result.mult); renderHist(); }).catch(() => {});

    /* ---------- ζωγραφική ---------- */
    const mixc = (h, t, a) => { const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); return `rgb(${c.map((x) => Math.round(x + (t - x) * a)).join(',')})`; };
    const under = () => { const n = curSeg().length, a = Math.PI * 2 / n; return Math.floor((((-theta) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / a) % n; };
    function draw(now) {
      const t = now / 1000, seg = curSeg(), n = seg.length, a = Math.PI * 2 / n;
      ctx.clearRect(0, 0, W, H); ctx.save();
      if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - 0.7); }
      // φόντο λάμψης
      const win = winIdx !== null && seg[winIdx] !== 0;
      const glow = ctx.createRadialGradient(CX, CY, 120, CX, CY, 330); glow.addColorStop(0, win || bonusMode ? 'rgba(255,214,0,.32)' : 'rgba(120,90,255,.20)'); glow.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = glow; ctx.fillRect(0, 0, W, H);
      if (spinning || win) { // ακτίνες φωτός
        ctx.save(); ctx.translate(CX, CY); ctx.rotate(t * (win ? 0.5 : 0.25)); ctx.globalAlpha = win ? 0.16 : 0.09; ctx.fillStyle = win ? '#ffd400' : '#9b8cff';
        for (let i = 0; i < 14; i++) { ctx.rotate(Math.PI * 2 / 14); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(380, -34); ctx.lineTo(380, 34); ctx.closePath(); ctx.fill(); }
        ctx.restore();
      }
      ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(CX, CY + 262, 190, 20, 0, 0, 7); ctx.fill();
      // εξωτερικός δακτύλιος
      let g = ctx.createLinearGradient(CX - 260, CY - 260, CX + 260, CY + 260); g.addColorStop(0, '#ffe58a'); g.addColorStop(0.5, '#b97c10'); g.addColorStop(1, '#ffe58a');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 258, 0, 7); ctx.fill();
      ctx.fillStyle = bonusMode ? '#3a1a05' : '#1b0f3a'; ctx.beginPath(); ctx.arc(CX, CY, 246, 0, 7); ctx.fill();
      // λαμπάκια
      const NB = 30; const mode = win ? 2 : (spinning || bonusMode) ? 1 : 0;
      for (let i = 0; i < NB; i++) {
        const ang = i / NB * Math.PI * 2 - Math.PI / 2; let lit;
        if (mode === 2) lit = Math.floor(t * 6) % 2 === 0; else if (mode === 1) lit = (Math.floor(t * 20) + i) % 3 === 0; else lit = (Math.floor(t * 2.5) + i) % 2 === 0;
        const bx = CX + Math.cos(ang) * 236, by = CY + Math.sin(ang) * 236, hue = mode === 2 ? '#ffe14d' : i % 2 ? '#ff5cb8' : '#ffe14d';
        ctx.save(); ctx.fillStyle = lit ? hue : '#4a3a6a'; if (lit) { ctx.shadowColor = hue; ctx.shadowBlur = 16; } ctx.beginPath(); ctx.arc(bx, by, 6.5, 0, 7); ctx.fill(); ctx.restore();
      }
      // τμήματα
      for (let i = 0; i < n; i++) {
        const s = theta + i * a - Math.PI / 2, base = colOf(seg[i]);
        const rg = ctx.createRadialGradient(CX, CY, 50, CX, CY, R); rg.addColorStop(0, mixc(base, 0, 0.45)); rg.addColorStop(0.75, base); rg.addColorStop(1, mixc(base, 255, 0.22));
        ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(CX, CY); ctx.arc(CX, CY, R, s, s + a); ctx.closePath(); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,.07)'; ctx.beginPath(); ctx.moveTo(CX, CY); ctx.arc(CX, CY, R, s, s + a / 2); ctx.closePath(); ctx.fill();
        if (winIdx !== null && i !== winIdx) { ctx.fillStyle = 'rgba(8,4,24,.55)'; ctx.beginPath(); ctx.moveTo(CX, CY); ctx.arc(CX, CY, R, s, s + a); ctx.closePath(); ctx.fill(); }
        ctx.save(); ctx.translate(CX, CY); ctx.rotate(s + a / 2); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
        const sz = n > 20 ? 15 : 22, m = seg[i];
        if (m === 'B' || m === 'R') { ctx.font = `900 ${sz - 1}px system-ui`; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.6)'; const tx = m === 'B' ? '🎁 BONUS' : '🔁 RESPIN'; ctx.strokeText(tx, R - 10, 0); ctx.fillStyle = '#fff'; ctx.fillText(tx, R - 10, 0); }
        else if (m) { ctx.font = `900 ${m >= 10 ? sz + 1 : sz}px system-ui`; ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.strokeText(m + '×', R - 12, 0); ctx.fillStyle = '#fff'; ctx.fillText(m + '×', R - 12, 0); }
        else { ctx.font = `${sz}px system-ui`; ctx.fillStyle = 'rgba(255,255,255,.4)'; ctx.fillText('•', R - 14, 0); }
        ctx.restore();
      }
      if (winIdx !== null) { // φωτεινό περίγραμμα νικητή
        const s = theta + winIdx * a - Math.PI / 2, pulse = 0.5 + 0.5 * Math.sin(t * 9);
        ctx.save(); ctx.shadowColor = win ? '#ffe14d' : '#ff4d6d'; ctx.shadowBlur = 24 + 14 * pulse; ctx.strokeStyle = '#fff'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(CX, CY); ctx.arc(CX, CY, R - 2, s, s + a); ctx.closePath(); ctx.stroke(); ctx.restore();
      }
      // καρφάκια
      for (let i = 0; i < n; i++) { const s = theta + i * a - Math.PI / 2; ctx.save(); ctx.fillStyle = '#ffe9a3'; ctx.shadowColor = '#000'; ctx.shadowBlur = 4; ctx.beginPath(); ctx.arc(CX + Math.cos(s) * (R - 2), CY + Math.sin(s) * (R - 2), 5, 0, 7); ctx.fill(); ctx.restore(); }
      ctx.strokeStyle = '#ffe9a3'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(CX, CY, R, 0, 7); ctx.stroke();
      // κέντρο
      g = ctx.createRadialGradient(CX - 14, CY - 14, 6, CX, CY, 62); g.addColorStop(0, '#fff3b8'); g.addColorStop(0.6, '#e0a817'); g.addColorStop(1, '#7b5208');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 58, 0, 7); ctx.fill(); ctx.strokeStyle = '#fff3b8'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#2a1600'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = hubText.length > 3 ? '900 24px system-ui' : '900 30px system-ui'; ctx.fillText(hubText, CX, CY + 2);
      // δείκτης με φλιπ
      ctx.save(); ctx.translate(CX, CY - R - 12); ctx.rotate(flap * 0.55); ctx.shadowColor = '#000'; ctx.shadowBlur = 10;
      ctx.fillStyle = '#ff2d55'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(-17, -34); ctx.lineTo(17, -34); ctx.lineTo(0, 34); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0, -22, 6, 0, 7); ctx.fill(); ctx.restore();
      flap *= 0.82;
      // σπίθες
      for (let i = parts.length - 1; i >= 0; i--) { const p = parts[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.18; p.life -= 0.016; if (p.life <= 0) { parts.splice(i, 1); continue; } ctx.globalAlpha = Math.min(1, p.life * 1.6); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill(); }
      ctx.globalAlpha = 1;
      if (bannerT > 0) { ctx.save(); ctx.globalAlpha = Math.min(1, bannerT); ctx.font = '900 34px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = '#000'; ctx.strokeText(banner, CX, 62); ctx.fillStyle = '#ffe14d'; ctx.shadowColor = '#ff9d00'; ctx.shadowBlur = 20; ctx.fillText(banner, CX, 62); ctx.restore(); bannerT -= 0.006; }
      if (flashBad > 0) { ctx.fillStyle = `rgba(255,40,70,${flashBad * 0.35})`; ctx.fillRect(0, 0, W, H); flashBad = Math.max(0, flashBad - 0.04); }
      ctx.restore();
    }
    function frame(now) { if (dead) return; if (!spinning && winIdx === null) theta -= 0.0025; draw(now); raf = requestAnimationFrame(frame); }
    raf = requestAnimationFrame(frame);
    const burst = (n, cols) => { for (let i = 0; i < n; i++) { const an = -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 3 + Math.random() * 8; parts.push({ x: CX, y: CY - R + 10, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, r: 2 + Math.random() * 3.5, life: 1 + Math.random() * 0.9, c: cols[i % cols.length] }); } };

    /* ---------- περιστροφή ---------- */
    const mod = (x) => ((x % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    async function rot(idx, turbo) {
      const n = curSeg().length, a = Math.PI * 2 / n, jit = (Math.random() - 0.5) * 0.72 * a, tgt = -((idx + 0.5) * a + jit);
      const th0 = theta, D = (turbo ? 4 : 6) * Math.PI * 2 + mod(th0 - tgt), T = turbo ? 2600 : 5800, t0 = performance.now(); let lastIdx = under(), lastTick = 0;
      spinning = true; winIdx = null; Sound.spin(turbo ? 2 : 4);
      await new Promise((resolve) => (function step(now) {
        if (dead) return resolve(); const u = Math.min(1, (now - t0) / T);
        const e = 1 - Math.pow(1 - u, 4) - 0.04 * Math.sin(Math.min(1, u / 0.09) * Math.PI); theta = th0 - D * e;
        const i = under(); if (i !== lastIdx) { flap = 1; lastIdx = i; if (now - lastTick > 28) { Sound.tick(900 + Math.random() * 500 + (1 - u) * 300); lastTick = now; } }
        if (u < 1) requestAnimationFrame(step); else resolve();
      })(t0));
      spinning = false; winIdx = idx; Sound.thunk();
    }
    const say = (t, ms) => { banner = t; bannerT = 1.4; return sleep(ms); };
    async function spin() {
      if (busy) return; busy = true; $('#spin').disabled = true; msg.className = 'msg'; winIdx = null; hubText = 'SPIN'; cur = null; bonusMode = false;
      const s = getStake(), turbo = $('#turbo').checked, k = turbo ? 0.5 : 1;
      try {
        const res = await App.play('wheel', { stake: s, risk }, Math.round(s * 100)); const sp = res.round.result.spins; let acc = 0;
        for (let i = 0; i < sp.length && !dead; i++) {
          const x = sp[i]; cur = null; bonusMode = false; hubText = i ? `#${i + 1}` : 'SPIN';
          await rot(x.idx, turbo);
          if (x.kind === 'r') { hubText = 'RESPIN'; burst(40, ['#14b8a6', '#fff']); await say('RESPIN! 🔁', 1100 * k); continue; }
          if (x.kind === 'x') { hubText = 'RESPIN'; await say('Τέλος αλυσίδας', 800 * k); break; }
          if (x.kind === 'b') {
            hubText = 'BONUS'; burst(120, ['#ffe14d', '#ff9d00', '#fff']); Sound.bonus && Sound.bonus(); await say('BONUS ΤΡΟΧΟΣ! 🎁', 1500 * k);
            cur = WH.bonus[risk]; bonusMode = true; theta = 0; hubText = 'BONUS'; await sleep(500 * k);
            await rot(x.bidx, turbo); hubText = x.mult + '×'; acc += x.mult; burst(x.mult >= 10 ? 200 : 110, ['#ffe14d', '#ff5cb8', '#7dd3fc', '#fff']); await say(`BONUS ${x.mult}×`, 1400 * k);
            cur = null; bonusMode = false; theta = 0; winIdx = null; break;
          }
          acc += x.mult; hubText = x.mult ? x.mult + '×' : '0×';
          if (x.mult > 0) burst(x.mult >= 3 ? 110 : 60, ['#ffe14d', '#ff5cb8', '#7dd3fc', '#fff']); else { shake = 12; flashBad = 1; }
          break;
        }
        cur = null; bonusMode = false;
        const m = res.round.result.mult; hubText = m ? (Math.round(m * 100) / 100) + '×' : '0×';
        hist.unshift(m); renderHist(); App.settle(res); App.resultMsg(msg, res.round); msg.textContent += sp.length > 1 || sp.some((q) => q.kind === 'b') ? ` · σύνολο ${Math.round(m * 100) / 100}×${sp.some((q) => q.kind === 'b') ? ' (με BONUS)' : ''}` : ` · έπεσε ${m ? m + '×' : '💥 χάνεις'}`;
        if (res.round.payout >= res.round.stake * 15) autoLeft = 0;
      } catch (e) { cur = null; bonusMode = false; App.msg(msg, 'lose', e.message); autoLeft = 0; $('#auto').textContent = '🔁 Auto ×5'; spinning = false; }
      busy = false; $('#spin').disabled = false;
      if (autoLeft > 0 && !dead) { autoLeft--; $('#auto').textContent = autoLeft ? `⏹ Στοπ (${autoLeft})` : '🔁 Auto ×5'; await sleep(1500); if (autoLeft >= 0 && !dead && $('#auto').dataset.on === '1') spin(); else $('#auto').dataset.on = ''; }
      else { $('#auto').dataset.on = ''; $('#auto').textContent = '🔁 Auto ×5'; }
    }
    $('#spin').onclick = () => { autoLeft = 0; $('#auto').dataset.on = ''; spin(); };
    $('#auto').onclick = () => { const b = $('#auto'); if (b.dataset.on === '1') { autoLeft = 0; b.dataset.on = ''; b.textContent = '🔁 Auto ×5'; return; } autoLeft = 4; b.dataset.on = '1'; b.textContent = 'Στοπ (4)'; spin(); };
    const key = (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); spin(); } };
    document.addEventListener('keydown', key);
    return () => { dead = true; autoLeft = 0; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  },
};
