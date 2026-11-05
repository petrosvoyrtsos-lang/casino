'use strict';
/* Φρουτάκι "Fruit Fiesta": 5 τροχοί · 3 σειρές · 10 γραμμές · Wild · Scatter · Free Spins */
Games.slots = {
  mount(v) {
    const S = App.catalog.slots, N = 24, RW = 158, GAP = 10, RH = 124, Y0 = 36, W = 900, H = 450;
    const X0 = (W - (5 * RW + 4 * GAP)) / 2;
    const GLOW = { C: '#ff3b5c', L: '#fff200', O: '#ff9a1f', G: '#c27bff', B: '#ffd23f', D: '#35e0ff', 7: '#ff3030', W: '#ffcf33', X: '#ffe14d' };
    const NAMES = { C: 'Κεράσια', L: 'Λεμόνια', O: 'Πορτοκάλια', G: 'Σταφύλια', B: 'Καμπάνες', D: 'Διαμάντια', 7: 'Εφτάρια' };
    let busy = false, dead = false, raf = 0, bonusMode = false, hl = null, shake = 0, lastTick = 0, quick = false, spinning = false, auto = 0, fsTotal = 0;
    let banner = null, fsMult = 0, fsPulse = 0; const bounce = [0, 0, 0, 0, 0], tease = [false, false, false, false, false], parts = [];
    const pos = [0, 0, 0, 0, 0], moving = [false, false, false, false, false];
    const stars = Array.from({ length: 46 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2.5, p: Math.random() * 6.28, s: 0.5 + Math.random() * 1.5 }));

    v.innerHTML = `<div class="grid2 slotgrid"><div class="stack">
      <div class="card slotcard"><h2>Fruit Fiesta <span id="fairline" style="float:right;text-transform:none;letter-spacing:0">${App.fairLine()}</span></h2>
        <div class="fsbanner hidden" id="fsb"></div>
        <div class="slotstage" id="stage"><canvas id="reels" width="${W}" height="${H}"></canvas><div class="slotoverlay hidden" id="ovl"></div></div>
        <div class="winbar"><div>Κέρδος: <b id="winbox">0,00 €</b></div><div class="small" id="winline">Καλή τύχη!</div></div>
        <div class="row" id="shist" style="gap:5px;margin-top:8px;min-height:26px"></div>
        <div class="msg" id="msg"></div>
        <div style="margin-top:12px">${stakeBox('<button class="primary spinbtn" id="spin">🍒 ΠΕΡΙΣΤΡΟΦΗ</button><label style="margin:0 0 0 6px"><input type="checkbox" id="turbo" style="width:auto"> Turbo</label>')}
          <div class="row" style="margin-top:10px;gap:8px"><button id="auto">Auto</button><select id="autoN" style="width:auto"><option>10</option><option>25</option><option>50</option><option>100</option></select><span class="small mute" id="autoinfo">Σταματά σε bonus, μεγάλο κέρδος ή έλλειψη υπολοίπου.</span></div>
          <div class="small mute" style="margin-top:6px">10 γραμμές · κάθε γραμμή = ποντάρισμα ÷ 10 · Space για περιστροφή</div></div></div></div>
      <div class="card"><h2>Πίνακας πληρωμών</h2>
        <div class="small mute" style="margin-bottom:8px">Πολλαπλασιαστές στο ποντάρισμα της γραμμής (3 / 4 / 5 ίδια σύμβολα από αριστερά):</div>
        <table class="ptab"><tr><th></th><th></th><th class="r">×3</th><th class="r">×4</th><th class="r">×5</th></tr>
        ${['7', 'D', 'B', 'G', 'O', 'L', 'C'].map((k) => `<tr><td style="font-size:22px">${S.syms[k]}</td><td class="mute small">${NAMES[k]}</td>${S.pay[k].map((m) => `<td class="r gold">${m}×</td>`).join('')}</tr>`).join('')}</table>
        <div class="feat"><b>Πότε πληρώνει μια γραμμή;</b> Χρειάζονται <b>3, 4 ή 5 ίδια σύμβολα συνεχόμενα, ξεκινώντας από τον 1ο τροχό αριστερά</b>, πάνω σε μία από τις 10 γραμμές. Τρία ίδια σύμβολα που δεν ξεκινούν από τον 1ο τροχό, ή που έχουν κενό ανάμεσά τους, δεν πληρώνουν.</div>
        <div class="plines">${S.lines.map((ln, i) => `<div><svg viewBox="0 0 50 30"><rect x="0.5" y="0.5" width="49" height="29" rx="4" fill="#0d1424" stroke="#25335a"/>${[0, 1, 2, 3, 4].map((r) => [0, 1, 2].map((k) => `<rect x="${3 + r * 9}" y="${3 + k * 9}" width="7" height="7" rx="1.5" fill="${ln[r] === k ? '#ffd34d' : '#1b2548'}"/>`).join('')).join('')}</svg><span>${i + 1}</span></div>`).join('')}</div>
        <div class="feat"><b>👑 Wild</b> (τροχοί 2, 3, 4): αντικαθιστά όλα τα σύμβολα εκτός από το ⭐.</div>
        <div class="feat"><b>⭐ Scatter</b>: 3 / 4 / 5 οπουδήποτε πληρώνουν ${S.scat[3]}× / ${S.scat[4]}× / ${S.scat[5]}× το <u>συνολικό</u> ποντάρισμα και ξεκινούν <b>10 Free Spins</b>.</div>
        <div class="feat"><b>🎁 Free Spins</b>: 10 δωρεάν γύροι με πολλαπλασιαστές <b>${S.fsMults.map((m) => '×' + m).join(' ')}</b>. Όλα τα κέρδη (γραμμές και scatter) πολλαπλασιάζονται.</div>
        <div class="small mute" style="margin-top:10px">RTP 95,6% (υπολογισμένο με πλήρη απαρίθμηση και των 7,9 εκατομμυρίων συνδυασμών). Το bonus έρχεται περίπου μία φορά στους 62 γύρους.</div></div></div>`;
    const getStake = wireStake(v), msg = $('#msg'), cv = $('#reels'), ctx = cv.getContext('2d');
    const winbox = $('#winbox'), winline = $('#winline'), ovl = $('#ovl'), fsb = $('#fsb');
    const lineY = (li, r) => Y0 + (S.lines[li][r] + 0.5) * RH;
    const cellX = (r) => X0 + r * (RW + GAP) + RW / 2;
    const hsl = (h, l = 60) => `hsl(${h},100%,${l}%)`;

    /* ----------- ζωγραφική ----------- */
    function draw(now) {
      if (dead) return;
      const t = now / 1000;
      const bg = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.7);
      if (bonusMode) { bg.addColorStop(0, '#00d4b0'); bg.addColorStop(0.5, '#0a5a8a'); bg.addColorStop(1, '#06122e'); } else { bg.addColorStop(0, '#ff3fa4'); bg.addColorStop(0.45, '#7a1fd6'); bg.addColorStop(1, '#14083a'); }
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
      for (const s of stars) { const a = 0.35 + 0.65 * Math.abs(Math.sin(t * s.s + s.p)); ctx.fillStyle = `rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(s.x, (s.y + t * 6 * s.s) % H, s.r, 0, 7); ctx.fill(); }
      ctx.save(); if (shake > 0) { ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake); shake = Math.max(0, shake - 0.8); }
      // ταμπλό
      const gx = X0 - 10, gy = Y0 - 8, gw = 5 * RW + 4 * GAP + 20, gh = 3 * RH + 16;
      ctx.shadowColor = hsl((t * 40) % 360); ctx.shadowBlur = 28; ctx.fillStyle = '#12062e'; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 22); ctx.fill(); ctx.shadowBlur = 0;
      for (let r = 0; r < 5; r++) drawReel(r);
      // πλαίσιο με νέον
      const fg = ctx.createLinearGradient(gx, gy, gx + gw, gy + gh); fg.addColorStop(0, '#ffe27a'); fg.addColorStop(0.5, '#ff9a3c'); fg.addColorStop(1, '#ffe27a');
      ctx.strokeStyle = fg; ctx.lineWidth = 7; ctx.shadowColor = '#ffcf33'; ctx.shadowBlur = 18; ctx.beginPath(); ctx.roundRect(gx, gy, gw, gh, 22); ctx.stroke(); ctx.shadowBlur = 0;
      { const per = 2 * (gw + gh - 44), n = 46, fast = !!hl || spinning; for (let i = 0; i < n; i++) { let d = (i / n) * per, bxp, byp; const w = gw - 44, h = gh - 44;
          if (d < w) { bxp = gx + 22 + d; byp = gy; } else if ((d -= w) < h) { bxp = gx + gw; byp = gy + 22 + d; } else if ((d -= h) < w) { bxp = gx + gw - 22 - d; byp = gy + gh; } else { d -= w; bxp = gx; byp = gy + gh - 22 - d; }
          const on = (Math.floor(t * (fast ? 14 : 5)) + i) % 3 === 0; ctx.save(); ctx.fillStyle = on ? hsl((i * 8 + t * 60) % 360, 70) : '#5a4a1a'; ctx.shadowColor = on ? '#ffe27a' : 'transparent'; ctx.shadowBlur = on ? 14 : 0; ctx.beginPath(); ctx.arc(bxp, byp, on ? 5.5 : 4, 0, 7); ctx.fill(); ctx.restore(); } }
      if (hl) drawHighlight(now);
      drawParts();
      if (bonusMode && fsMult) { const pu = 1 + 0.12 * Math.sin(now / 160) + fsPulse; fsPulse *= 0.9; ctx.save(); ctx.translate(W - 62, 52); ctx.scale(pu, pu); ctx.shadowColor = '#00ffd0'; ctx.shadowBlur = 24; const gg = ctx.createRadialGradient(0, 0, 4, 0, 0, 40); gg.addColorStop(0, '#fff'); gg.addColorStop(0.35, '#ffe14d'); gg.addColorStop(1, '#ff7a18'); ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(0, 0, 38, 0, 7); ctx.fill(); ctx.fillStyle = '#4a1a00'; ctx.font = 'bold 34px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('×' + fsMult, 0, 2); ctx.restore(); }
      if (banner) { const bt = (now - banner.t0) / 1000; if (bt > 2.6) banner = null; else { const sc = Math.min(1, bt * 4) * (1 + 0.04 * Math.sin(bt * 12)), al = bt > 2.1 ? (2.6 - bt) / 0.5 : 1; ctx.save(); ctx.globalAlpha = al; ctx.fillStyle = '#000a'; ctx.fillRect(0, 0, W, H); ctx.translate(W / 2, H / 2); for (let r = 0; r < 14; r++) { ctx.save(); ctx.rotate(r * Math.PI / 7 + bt * 0.5); const rg = ctx.createLinearGradient(0, 0, 0, -260); rg.addColorStop(0, '#ffd34d88'); rg.addColorStop(1, 'transparent'); ctx.fillStyle = rg; ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(0, -260); ctx.fill(); ctx.restore(); }
          ctx.scale(sc, sc); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round'; ctx.font = '900 84px sans-serif'; ctx.lineWidth = 12; ctx.strokeStyle = '#7a1a4a'; ctx.strokeText(banner.title, 0, -30); const tg = ctx.createLinearGradient(0, -80, 0, 20); tg.addColorStop(0, '#fff7b0'); tg.addColorStop(1, '#ff9a1f'); ctx.fillStyle = tg; ctx.fillText(banner.title, 0, -30);
          ctx.font = '900 54px sans-serif'; ctx.lineWidth = 9; ctx.strokeStyle = '#3a1060'; ctx.strokeText(banner.text, 0, 54); ctx.fillStyle = '#fff'; ctx.fillText(banner.text, 0, 54); ctx.restore(); } }
      ctx.restore();
      raf = requestAnimationFrame(draw);
    }
    function drawReel(r) {
      const x = X0 + r * (RW + GAP), y = Y0;
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, y, RW, 3 * RH, 14); ctx.clip();
      const pg = ctx.createLinearGradient(0, y, 0, y + 3 * RH); pg.addColorStop(0, '#2d1070'); pg.addColorStop(0.5, '#5a22c9'); pg.addColorStop(1, '#2d1070'); ctx.fillStyle = pg; ctx.fillRect(x, y, RW, 3 * RH);
      const bt = (performance.now() - bounce[r]) / 1000, bo = bounce[r] && bt < 0.5 ? 0.16 * Math.exp(-bt * 9) * Math.sin(bt * 22) : 0;
      const strip = S.strips[r], p = pos[r] + bo, base = Math.floor(p), pulse = 0.5 + 0.5 * Math.sin(performance.now() / 120);
      ctx.font = `80px ${EMOJI_FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      for (let idx = base - 2; idx <= base + 2; idx++) {
        const sym = strip[((idx % N) + N) % N], cy = Y0 + 1.5 * RH + (idx - p) * RH + 4;
        ctx.shadowColor = GLOW[sym]; ctx.shadowBlur = 22;
        if (moving[r]) { ctx.globalAlpha = 0.35; ctx.fillText(S.syms[sym], x + RW / 2, cy - 16); ctx.fillText(S.syms[sym], x + RW / 2, cy + 16); ctx.globalAlpha = 0.85; }
        const row = Math.round(idx - pos[r] + 1), hit = !moving[r] && hl && Math.abs(bo) < 0.02 && hl.cells.has(r + ',' + row);
        if (hit) { ctx.save(); ctx.translate(x + RW / 2, cy); const sc = 1.08 + 0.14 * pulse; ctx.scale(sc, sc); ctx.rotate(Math.sin(performance.now() / 140 + r) * 0.07); ctx.shadowBlur = 36; ctx.fillText(S.syms[sym], 0, 0); ctx.restore(); }
        else ctx.fillText(S.syms[sym], x + RW / 2, cy);
        ctx.globalAlpha = 1;
      }
      ctx.shadowBlur = 0; ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 2; for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x, y + k * RH); ctx.lineTo(x + RW, y + k * RH); ctx.stroke(); }
      const sh = ctx.createLinearGradient(0, y, 0, y + 3 * RH); sh.addColorStop(0, 'rgba(10,0,30,.6)'); sh.addColorStop(0.2, 'rgba(10,0,30,0)'); sh.addColorStop(0.8, 'rgba(10,0,30,0)'); sh.addColorStop(1, 'rgba(10,0,30,.6)'); ctx.fillStyle = sh; ctx.fillRect(x, y, RW, 3 * RH);
      ctx.restore();
      if (tease[r] && moving[r]) { const pu = 0.5 + 0.5 * Math.sin(performance.now() / 70); ctx.save(); ctx.strokeStyle = '#ffe14d'; ctx.shadowColor = '#ff9a1f'; ctx.shadowBlur = 30 + 20 * pu; ctx.lineWidth = 5 + 3 * pu; ctx.beginPath(); ctx.roundRect(x - 2, y - 2, RW + 4, 3 * RH + 4, 16); ctx.stroke(); ctx.restore(); }
    }
    function burst(cx, cy, n, big) {
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * (big ? 3.4 : 2.4), v = (big ? 7 : 4) + Math.random() * (big ? 8 : 5); parts.push({ x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, r: 4 + Math.random() * 5, c: Math.random() < 0.65 ? 0 : 1, rot: Math.random() * 6 }); }
    }
    function drawParts() {
      for (let i = parts.length - 1; i >= 0; i--) {
        const q = parts[i]; q.x += q.vx; q.y += q.vy; q.vy += 0.32; q.vx *= 0.99; q.life -= 0.012; q.rot += 0.2;
        if (q.life <= 0 || q.y > H + 20) { parts.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = Math.min(1, q.life * 1.6); ctx.translate(q.x, q.y);
        if (q.c === 0) { ctx.scale(Math.abs(Math.cos(q.rot)) * 0.8 + 0.2, 1); ctx.fillStyle = '#ffd34d'; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, q.r + 2, 0, 7); ctx.fill(); ctx.stroke(); }
        else { ctx.fillStyle = '#fff'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 8; ctx.beginPath(); ctx.arc(0, 0, q.r * 0.5, 0, 7); ctx.fill(); }
        ctx.restore();
      }
    }
    function drawHighlight(now) {
      const pulse = 0.5 + 0.5 * Math.sin(now / 110); hl.t0 = hl.t0 || now;
      ctx.save(); ctx.fillStyle = 'rgba(8,0,24,.55)'; for (let r = 0; r < 5; r++) for (let row = 0; row < 3; row++) if (!hl.cells.has(r + ',' + row)) { ctx.beginPath(); ctx.roundRect(X0 + r * (RW + GAP) + 2, Y0 + row * RH + 2, RW - 4, RH - 4, 12); ctx.fill(); } ctx.restore();
      for (const key of hl.cells) {
        const [r, row] = key.split(',').map(Number), x = X0 + r * (RW + GAP), y = Y0 + row * RH;
        ctx.save(); ctx.shadowColor = hl.color; ctx.shadowBlur = 20 + 16 * pulse; ctx.strokeStyle = hl.color; ctx.lineWidth = 5; ctx.fillStyle = `rgba(255,255,255,${0.10 + 0.14 * pulse})`;
        ctx.beginPath(); ctx.roundRect(x + 4, y + 4, RW - 8, RH - 8, 14); ctx.fill(); ctx.stroke(); ctx.restore();
      }
      if (hl.line !== undefined) {
        ctx.save(); ctx.strokeStyle = hl.color; ctx.lineWidth = 7; ctx.lineJoin = 'round'; ctx.shadowColor = hl.color; ctx.shadowBlur = 16; ctx.globalAlpha = 0.9; ctx.beginPath();
        const prog = Math.min(1, (now - hl.t0) / 420) * (hl.count - 1);
        for (let r = 0; r < hl.count; r++) { if (r > Math.ceil(prog)) break; let px = cellX(r), py = lineY(hl.line, r); if (r > prog) { const f = prog - (r - 1), qx = cellX(r - 1), qy = lineY(hl.line, r - 1); px = qx + (px - qx) * f; py = qy + (py - qy) * f; } if (r === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
        ctx.stroke(); ctx.restore();
        const by = lineY(hl.line, 0); ctx.save(); ctx.fillStyle = hl.color; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(X0 - 2, by, 15, 0, 7); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#1a0a3a'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(hl.line + 1, X0 - 2, by + 1); ctx.restore();
      }
    }
    raf = requestAnimationFrame(draw);

    /* ----------- περιστροφή ----------- */
    function spinTo(stops, turbo) {
      return new Promise((resolve) => {
        const start = pos.slice(), k = turbo ? 0.4 : 1, dur = [1.0, 1.3, 1.6, 1.9, 2.2].map((d) => d * k);
        const nScat = (r) => [-1, 0, 1].filter((d) => S.strips[r][(stops[r] + d + N) % N] === 'X').length;
        let seen = 0, extra = 0; tease.fill(false);
        for (let r = 0; r < 5; r++) { if (r >= 2 && seen >= 2) { tease[r] = true; extra += 0.9 * k; } dur[r] += extra; seen += nScat(r); }
        const dist = stops.map((s, r) => (((s - start[r]) % N) + N) % N + (3 + r * (turbo ? 1 : 2) + (tease[r] ? Math.ceil(extra / k * 2) : 0)) * N);
        const t0 = performance.now(), last = start.map((p) => Math.floor(p)), done = [false, false, false, false, false];
        stops.forEach((_, r) => { moving[r] = true; }); Sound.spin(dur[4]); spinning = true; quick = false; let vt = 0, prev = t0; const rise = tease.some(Boolean);
        let scatSeen = 0;
        (function step(now) {
          if (dead) { spinning = false; return resolve(); }
          vt += ((now - prev) / 1000) * (quick ? 5 : 1); prev = now; const t = vt; let all = true;
          for (let r = 0; r < 5; r++) {
            if (done[r]) continue;
            const u = Math.min(1, t / dur[r]); pos[r] = start[r] + dist[r] * (1 - Math.pow(1 - u, 3)); moving[r] = u < 0.92;
            const f = Math.floor(pos[r]); if (f !== last[r] && now - lastTick > 60) { Sound.tick(800 + r * 130); lastTick = now; } last[r] = f;
            if (u >= 1) {
              done[r] = true; moving[r] = false; pos[r] = stops[r]; bounce[r] = now; tease[r] = false; Sound.thunk(); shake = 5;
              const sy = S.strips[r]; if ([-1, 0, 1].some((d) => sy[(stops[r] + d + N) % N] === 'X')) { Sound.ding(scatSeen++); }
            } else all = false;
          }
          if (all) { spinning = false; tease.fill(false); resolve(); } else requestAnimationFrame(step);
        })(t0);
      });
    }
    const animNum = (from, to, ms = 700) => new Promise((res) => { const t0 = performance.now(); (function s(now) { const u = Math.min(1, (now - t0) / ms); winbox.textContent = money(Math.round(from + (to - from) * u)); if (u < 1 && !dead) requestAnimationFrame(s); else res(); })(t0); });
    let winTotal = 0; const hist = []; const rndX = () => 120 + Math.random() * (W - 240);
    function drawHist() { $('#shist').innerHTML = hist.map((x) => `<span class="sh ${x === 0 ? 'z' : x < 1 ? 'l' : x >= 10 ? 'b' : 'w'}">${x === 0 ? '0' : x >= 10 ? Math.round(x) + '×' : x.toFixed(1) + '×'}</span>`).join(''); }
    async function present(sp, quick) {
      const hasWin = sp.wins.length > 0 || sp.scatMult > 0;
      if (!hasWin) return;
      const stakeC = Math.round(getStake() * 100);
      const all = new Set(); sp.wins.forEach((w) => { for (let r = 0; r < w.count; r++) all.add(r + ',' + S.lines[w.line][r]); });
      if (sp.scat >= 3) S.strips.forEach((strip, r) => [0, 1, 2].forEach((row) => { if (sp.grid[r][row] === 'X') all.add(r + ',' + row); }));
      hl = { cells: all, color: '#ffe14d' }; const big = sp.pay >= stakeC * 10; all.forEach((k) => { const [r, row] = k.split(',').map(Number); burst(X0 + r * (RW + GAP) + RW / 2, Y0 + row * RH + RH / 2, big ? 9 : 4, big); }); if (big) shake = 14; Sound.win(sp.pay >= stakeC * 10 ? 3 : sp.pay >= stakeC * 3 ? 2 : 1);
      const before = winTotal; winTotal += sp.pay; animNum(before, winTotal);
      winline.textContent = `${sp.wins.length === 0 ? "Scatter" : sp.wins.length + " " + (sp.wins.length === 1 ? "γραμμή κερδίζει" : "γραμμές κερδίζουν")}${sp.mult > 1 ? ` · πολλαπλασιαστής ×${sp.mult}` : ''}${sp.scatMult ? ` · scatter ${sp.scatMult}×` : ''} = ${money(sp.pay)}`;
      await sleep(quick ? 700 : 1000);
      if (!quick) for (const w of sp.wins.slice(0, 6)) {
        if (dead) return; hl = { cells: new Set(Array.from({ length: w.count }, (_, r) => r + ',' + S.lines[w.line][r])), color: hsl(w.line * 36), line: w.line, count: w.count };
        winline.textContent = `Γραμμή ${w.line + 1}: ${S.syms[w.sym]} ×${w.count} = ${w.mult}× στη γραμμή`; await sleep(650);
      }
      hl = null;
    }
    function overlay(html, ms) { ovl.innerHTML = html; ovl.classList.remove('hidden'); return sleep(ms).then(() => ovl.classList.add('hidden')); }

    async function spin() {
      if (busy) return; busy = true; $('#spin').disabled = true; msg.className = 'msg'; hl = null; winTotal = 0; winbox.textContent = money(0); winline.textContent = '…';
      const s = getStake(), turbo = $('#turbo').checked; let out = null; fsTotal = 0;
      try {
        const res = await App.play('slots', { stake: s }, Math.round(s * 100)); const R = res.round.result, sp = R.spins; out = res.round;
        for (let r = 0; r < 5; r++) pos[r] = ((pos[r] % N) + N) % N;
        $('#spin').disabled = false; $('#spin').textContent = '⏩ ΣΤΟΠ';
        await spinTo(sp[0].stops, turbo); $('#spin').disabled = true; $('#spin').textContent = '🎰 ΠΕΡΙΣΤΡΟΦΗ'; await present(sp[0], turbo);
        if (R.bonus) {
          Sound.fanfare(); await overlay(`<div class="fsintro">${sp.length - 1} FREE SPINS!<small>Πολλαπλασιαστές ×1 → ×5</small></div>`, 2300);
          bonusMode = true; fsb.classList.remove('hidden');
          for (let i = 1; i < sp.length; i++) {
            if (dead) return; fsb.innerHTML = `FREE SPINS <b>${i}/${sp.length - 1}</b> · πολλαπλασιαστής <b>×${sp[i].mult}</b> · σύνολο <b>${money(fsTotal)}</b><div class="pbar" style="margin-top:6px"><i style="width:${(i - 1) / (sp.length - 1) * 100}%;background:#ffe14d"></i></div>`; if (fsMult !== sp[i].mult) fsPulse = 0.5; fsMult = sp[i].mult;
            await sleep(300); await spinTo(sp[i].stops, true); fsTotal += sp[i].pay; await present(sp[i], true);
          }
          await overlay(`<div class="fsintro">🏆<br>Κέρδος Free Spins<br><b>${money(sp.slice(1).reduce((a, x) => a + x.pay, 0))}</b></div>`, 2300);
          bonusMode = false; fsMult = 0; fsb.classList.add('hidden');
        }
        winline.textContent = res.round.payout ? `Συνολικό κέρδος ${money(res.round.payout)}` : 'Καμία νίκη αυτή τη φορά';
        await animNum(winTotal, res.round.payout, 300);
        { const x = res.round.payout / res.round.stake; hist.unshift(x); hist.length = Math.min(hist.length, 14); drawHist();
          if (x >= 5 && x < 15) { banner = { t0: performance.now(), title: x >= 10 ? 'BIG WIN!' : 'NICE WIN!', text: money(res.round.payout) }; shake = 12; for (let k = 0; k < 6; k++) setTimeout(() => !dead && burst(rndX(), 40, 14, true), k * 220); await sleep(1800); } }
        App.settle(res); App.resultMsg(msg, res.round);
      } catch (e) { App.msg(msg, 'lose', e.message); bonusMode = false; fsb.classList.add('hidden'); auto = 0; out = null; }
      busy = false; $('#spin').disabled = false; $('#spin').textContent = '🎰 ΠΕΡΙΣΤΡΟΦΗ';
      return out;
    }
    const press = () => { if (busy) { if (spinning) quick = true; return; } spin(); };
    $('#spin').onclick = press;
    async function runAuto() {
      const btn = $('#auto'), info = $('#autoinfo');
      if (auto) { auto = 0; return; }
      auto = Number($('#autoN').value); btn.textContent = '⏹ Στοπ';
      while (auto > 0 && !dead) {
        info.textContent = `Απομένουν ${auto} περιστροφές`; const r = await spin(); if (!r || dead) break;
        auto--; if (r.result.bonus || r.payout >= r.stake * 15) { info.textContent = 'Το Auto σταμάτησε: μεγάλο κέρδος!'; auto = 0; break; }
        await sleep(450);
      }
      auto = 0; if (!dead) { btn.textContent = '🔁 Auto'; if (!/σταμάτησε/.test(info.textContent)) info.textContent = 'Σταματά σε bonus, μεγάλο κέρδος ή έλλειψη υπολοίπου.'; }
    }
    $('#auto').onclick = runAuto;
    const key = (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); press(); } };
    document.addEventListener('keydown', key);
    return () => { dead = true; auto = 0; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  },
};
