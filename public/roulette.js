'use strict';
/* Ρουλέτα (ευρωπαϊκή) με πλήρες ταμπλό: straight, split, street, corner, six line, trio, basket + εξωτερικά στοιχήματα */
Games.roulette = {
  mount(v) {
    const ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    const REDS = new Set(App.catalog.roulette.reds), colorOf = (n) => n === 0 ? 'green' : REDS.has(n) ? 'red' : 'black';
    const HEX = { red: '#c4161c', black: '#15181f', green: '#0f9d4b' };
    const U = 100 / 13, RP = 100 / 3, nAt = (c, ty) => c * 3 + (3 - ty);
    const LABEL = { straight: 'Straight (ένας αριθμός)', split: 'Split (2 αριθμοί)', street: 'Street (3 αριθμοί)', corner: 'Corner (4 αριθμοί)', sixline: 'Six line (6 αριθμοί)', trio: 'Trio (3 αριθμοί)', basket: 'Basket (0-1-2-3)' };
    const PAYS = { straight: 35, split: 17, street: 11, corner: 8, sixline: 5, trio: 11, basket: 8, dozen: 2, column: 2, red: 1, black: 1, odd: 1, even: 1, low: 1, high: 1 };
    const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
    const outsideNums = (t, val) => ({
      red: [...REDS], black: range(1, 36).filter((n) => !REDS.has(n)), odd: range(1, 36).filter((n) => n % 2), even: range(1, 36).filter((n) => n % 2 === 0),
      low: range(1, 18), high: range(19, 36), dozen: range((val - 1) * 12 + 1, val * 12), column: range(1, 36).filter((n) => ((n - 1) % 3) + 1 === val),
    }[t]);
    let bets = new Map(), last = [], chip = 1, busy = false, dead = false, raf = 0, wAng = 0, ball = null, trail = [], lastBets = null, lastN = null, restRel = 0;
    const registry = new Map(), stack = [];

    v.innerHTML = `<div class="grid2 roulgrid"><div class="stack">
      <div class="card"><h2>Ρουλέτα <span id="fairline">${App.fairLine()}</span></h2>
        <div class="wheelwrap"><canvas id="rw" width="460" height="460"></canvas><div class="nmb hidden" id="nmb">ΤΕΛΟΣ ΣΤΟΙΧΗΜΑΤΩΝ</div></div>
        <div class="row" id="lastn" style="margin-top:8px;gap:5px;min-height:30px"></div><div class="msg" id="msg"></div></div>
      <div class="card"><h2>Στατιστικά τελευταίων γύρων</h2><div id="stats" class="small mute">Δεν υπάρχουν ακόμα δεδομένα.</div></div></div>
      <div class="stack">
      <div class="card"><h2>Ταμπλό <span class="small mute" style="text-transform:none;letter-spacing:0">πάτα στα όρια των αριθμών για split, corner, street, six line</span></h2>
        <div id="rtip" class="rtip">Διάλεξε μάρκα και πόνταρε. Πάτα στον αριθμό για straight, στη γραμμή ανάμεσα σε δύο αριθμούς για split, στη γωνία τεσσάρων για corner.</div>
        <div class="rboard" id="rb"></div>
        <div id="routs"></div></div>
      <div class="card"><h2>Μάρκες</h2><div class="row"><div class="chips" id="chips"></div></div>
        <div class="row" style="margin-top:10px"><button id="undo">↩ Αναίρεση</button><button id="clr">Καθάρισμα</button><button id="dbl">2×</button><button id="rep">Επανάληψη</button></div>
        <div class="row" style="margin-top:12px;justify-content:space-between"><div>Σύνολο: <b id="tot" class="gold">0,00 €</b></div><button class="primary spinbtn" id="spin">🎰 ΠΕΡΙΣΤΡΟΦΗ</button></div></div>
      <div class="card"><h2>Αποδόσεις</h2><div class="small" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:4px">${[['straight', 'Αριθμός'], ['split', 'Split'], ['street', 'Street'], ['corner', 'Corner'], ['trio', 'Trio'], ['basket', 'Basket'], ['sixline', 'Six line'], ['dozen', 'Ντουζίνα'], ['column', 'Στήλη'], ['red', 'Χρώμα / μονό-ζυγό / 1-18, 19-36']].map(([k, n]) => `<div style="display:flex;justify-content:space-between;gap:8px;background:var(--bg2);border-radius:8px;padding:4px 8px"><span>${n}</span><b class="gold">${PAYS[k]}:1</b></div>`).join('')}</div>
        <div class="small mute" style="margin-top:10px">Ευρωπαϊκή ρουλέτα με ένα μηδέν. Κάθε στοίχημα έχει RTP 97,3%. Αν ο αριθμός είναι το 0 χάνουν όλα τα εξωτερικά στοιχήματα.</div></div></div></div>`;
    const msg = $('#msg'), cv = $('#rw'), ctx = cv.getContext('2d'), CX = 230, CY = 230, tip = $('#rtip'), rb = $('#rb');

    /* ---------- μάρκες ---------- */
    const CH = [[0.2, '#7dd3fc', '#06283d'], [0.5, '#fbbf24', '#2b1b00'], [1, '#e5e7eb', '#111'], [5, '#ef4444', '#fff'], [25, '#22c55e', '#fff'], [100, '#2563eb', '#fff']];
    $('#chips').innerHTML = CH.map(([c, bg, fg]) => `<button class="chipbtn ${c === chip ? 'on' : ''}" data-c="${c}" style="background:${bg};color:${fg}">${c}</button>`).join('');
    $$('.chipbtn', v).forEach((b) => b.onclick = () => { chip = Number(b.dataset.c); $$('.chipbtn', v).forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); });
    const tokClass = (s) => s < 1 ? 'c02' : s < 5 ? 'c1' : s < 25 ? 'c5' : s < 100 ? 'c25' : s < 500 ? 'c100' : 'c500';
    const short = (s) => s >= 1000 ? (s / 1000).toFixed(s % 1000 ? 1 : 0) + 'k' : String(Math.round(s * 100) / 100);

    /* ---------- ταμπλό ---------- */
    let html = `<div class="rcell green" data-n="0" style="left:0;top:0;width:${U}%;height:100%">0</div>`;
    for (let c = 0; c < 12; c++) for (let ty = 0; ty < 3; ty++) { const n = nAt(c, ty); html += `<div class="rcell ${colorOf(n)}" data-n="${n}" style="left:${(c + 1) * U}%;top:${ty * RP}%;width:${U}%;height:${RP}%">${n}</div>`; }
    rb.innerHTML = html;
    const reg = (key, o, el) => { registry.set(key, { key, ...o, el }); el.dataset.key = key; };
    $$('.rcell', rb).forEach((cell) => { const n = Number(cell.dataset.n); reg('straight:' + n, { type: 'straight', value: n, numbers: [n], pay: 35 }, cell); });
    const hot = (type, nums, x, y) => { const key = `${type}:${[...nums].sort((a, b) => a - b).join(',')}`; const d = el(`<div class="hot" style="left:${x}%;top:${y}%"></div>`); rb.appendChild(d); reg(key, { type, numbers: [...nums].sort((a, b) => a - b), pay: PAYS[type], inside: true }, d); };
    for (let c = 0; c < 12; c++) for (let ty = 0; ty < 3; ty++) {
      const a = nAt(c, ty);
      if (ty < 2) hot('split', [a - 1, a], (c + 1.5) * U, (ty + 1) * RP);              // κάθετο split
      if (c < 11) hot('split', [a, a + 3], (c + 2) * U, (ty + 0.5) * RP);               // οριζόντιο split
      if (c < 11 && ty < 2) hot('corner', [a - 1, a, a + 2, a + 3], (c + 2) * U, (ty + 1) * RP);
    }
    for (let ty = 0; ty < 3; ty++) hot('split', [0, nAt(0, ty)], U, (ty + 0.5) * RP);
    hot('trio', [0, 2, 3], U, RP); hot('trio', [0, 1, 2], U, 2 * RP); hot('basket', [0, 1, 2, 3], U, 100);
    for (let c = 0; c < 12; c++) { hot('street', [3 * c + 1, 3 * c + 2, 3 * c + 3], (c + 1.5) * U, 100); if (c < 11) hot('sixline', range(3 * c + 1, 3 * c + 6), (c + 2) * U, 100); }

    /* εξωτερικά στοιχήματα */
    const outs = [[['column', 3, 'Στήλη 3 · 2:1'], ['column', 2, 'Στήλη 2 · 2:1'], ['column', 1, 'Στήλη 1 · 2:1']], [['dozen', 1, '1η 12άδα'], ['dozen', 2, '2η 12άδα'], ['dozen', 3, '3η 12άδα']],
      [['low', null, '1–18'], ['even', null, 'Ζυγός'], ['red', null, '◆ Κόκκινο'], ['black', null, '◆ Μαύρο'], ['odd', null, 'Μονός'], ['high', null, '19–36']]];
    $('#routs').innerHTML = outs.map((row) => `<div class="routs" style="grid-template-columns:repeat(${row.length},1fr)">${row.map(([t, val, l]) => `<div class="rcell out ${t === 'red' ? 'redtxt' : ''}" data-ot="${t}" data-ov="${val ?? ''}">${l}</div>`).join('')}</div>`).join('');
    $$('[data-ot]').forEach((cell) => { const t = cell.dataset.ot, val = cell.dataset.ov === '' ? null : Number(cell.dataset.ov); reg(`${t}:${val ?? ''}`, { type: t, value: val, numbers: outsideNums(t, val), pay: PAYS[t] }, cell); });

    const anchors = [...registry.values()];
    function paint() {
      $$('.tok', v).forEach((t) => t.remove());
      for (const b of bets.values()) { const a = registry.get(b.key); a.el.appendChild(el(`<span class="tok ${tokClass(b.stake)}">${short(b.stake)}</span>`)); }
      $('#tot').textContent = money([...bets.values()].reduce((s, b) => s + Math.round(b.stake * 100), 0));
    }
    function hl(a, on) {
      $$('.rcell[data-n]', rb).forEach((c) => c.classList.toggle('hl', on && a.numbers.includes(Number(c.dataset.n))));
      if (on) tip.innerHTML = `<b>${LABEL[a.type] || a.type}</b>${a.numbers.length < 37 && a.numbers.length > 1 ? ` · ${a.numbers.join(', ')}` : a.type === 'straight' ? ` · ${a.value}` : ''} · πληρώνει <b class="gold">${a.pay}:1</b>`;
    }
    anchors.forEach((a) => {
      a.el.addEventListener('mouseenter', () => hl(a, true)); a.el.addEventListener('mouseleave', () => hl(a, false));
      a.el.addEventListener('click', (e) => {
        e.stopPropagation(); if (busy) return;
        const b = bets.get(a.key) || { key: a.key, type: a.type, value: a.value, numbers: a.inside ? a.numbers : undefined, stake: 0 };
        if (b.stake + chip > 1000) return toast('Μέγιστο 1.000 € ανά στοίχημα', true);
        b.stake = Math.round((b.stake + chip) * 100) / 100; bets.set(a.key, b); stack.push(a.key); Sound.chip(); paint(); hl(a, true);
      });
    });
    $('#undo').onclick = () => { if (busy || !stack.length) return; const k = stack.pop(), b = bets.get(k); if (b) { b.stake = Math.round((b.stake - Math.min(b.stake, chip)) * 100) / 100; if (b.stake <= 0.004) bets.delete(k); } Sound.click(); paint(); };
    $('#clr').onclick = () => { if (busy) return; bets.clear(); stack.length = 0; Sound.click(); paint(); };
    $('#dbl').onclick = () => { if (busy) return; for (const b of bets.values()) b.stake = Math.min(1000, Math.round(b.stake * 200) / 100); Sound.chip(); paint(); };
    $('#rep').onclick = () => { if (busy || !lastBets) return; bets = new Map(lastBets.map((b) => [b.key, { ...b }])); Sound.chip(); paint(); };

    /* ---------- ιστορικό / στατιστικά ---------- */
    const renderLast = () => {
      $('#lastn').innerHTML = last.slice(0, 16).map((n, i) => `<span class="ln ${i === 0 ? 'first' : ''}" style="background:${HEX[colorOf(n)]}">${n}</span>`).join('');
      const L = last.slice(0, 60); if (!L.length) return; const cnt = new Array(37).fill(0); L.forEach((n) => cnt[n]++);
      const sorted = range(0, 36).sort((a, b) => cnt[b] - cnt[a]), pc = (f) => Math.round(L.filter(f).length / L.length * 100);
      const chipN = (n) => `<span class="ln" style="background:${HEX[colorOf(n)]}">${n}</span>`;
      $('#stats').innerHTML = `<div class="row" style="gap:6px"><b>🔥 Hot:</b> ${sorted.slice(0, 5).map(chipN).join('')} <b style="margin-left:10px">❄ Cold:</b> ${sorted.slice(-5).map(chipN).join('')}</div>
        <div class="sbar"><i style="width:${pc((n) => REDS.has(n))}%;background:#c4161c"></i><i style="width:${pc((n) => n && !REDS.has(n))}%;background:#2a2f3d"></i><i style="width:${pc((n) => n === 0)}%;background:#0f9d4b"></i></div>
        <div class="row small" style="justify-content:space-between"><span>Κόκκινο ${pc((n) => REDS.has(n))}%</span><span>Μαύρο ${pc((n) => n && !REDS.has(n))}%</span><span>Μηδέν ${pc((n) => n === 0)}%</span></div>
        <div class="row small" style="justify-content:space-between;margin-top:4px"><span>Μονά ${pc((n) => n && n % 2)}% · Ζυγά ${pc((n) => n && n % 2 === 0)}%</span><span>1–18 ${pc((n) => n >= 1 && n <= 18)}% · 19–36 ${pc((n) => n >= 19)}%</span></div>
        <div class="small mute" style="margin-top:6px">Βάση: ${L.length === 1 ? "η τελευταία ρίψη σου" : "οι τελευταίες " + L.length + " ρίψεις σου"}. Ο τροχός δεν έχει μνήμη, κάθε ρίψη είναι ανεξάρτητη.</div>`;
    };
    api('GET', '/api/history?limit=100').then((h) => { last = h.rounds.filter((r) => r.game === 'roulette').map((r) => r.result.n); if (last.length) { lastN = last[0]; restRel = (ORDER.indexOf(lastN) + 0.5) * BW; } renderLast(); }).catch(() => {});

    /* ---------- τροχός ---------- */
    const BW = Math.PI * 2 / 37;
    function drawWheel() {
      ctx.clearRect(0, 0, 460, 460);
      // ξύλινο περίβλημα
      let g = ctx.createRadialGradient(CX, CY, 150, CX, CY, 228); g.addColorStop(0, '#5b3a1a'); g.addColorStop(0.7, '#3a2210'); g.addColorStop(1, '#1d0f06');
      ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 24; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 226, 0, 7); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#d9b25a'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(CX, CY, 224, 0, 7); ctx.stroke();
      // τροχιά μπάλας (ασημί)
      g = ctx.createRadialGradient(CX, CY, 176, CX, CY, 212); g.addColorStop(0, '#9aa3b2'); g.addColorStop(0.5, '#e8edf5'); g.addColorStop(1, '#7c8696'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 212, 0, 7); ctx.fill();
      ctx.fillStyle = '#1a1008'; ctx.beginPath(); ctx.arc(CX, CY, 186, 0, 7); ctx.fill();
      // deflectors (σταθεροί)
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + Math.PI / 8; ctx.save(); ctx.translate(CX + Math.cos(a) * 196, CY + Math.sin(a) * 196); ctx.rotate(a + Math.PI / 4); ctx.fillStyle = '#ffd86b'; ctx.shadowColor = '#ffd86b'; ctx.shadowBlur = 8; ctx.fillRect(-4, -4, 8, 8); ctx.restore(); }
      // θέσεις
      for (let k = 0; k < 37; k++) {
        const s = k * BW + wAng - Math.PI / 2, n = ORDER[k];
        ctx.fillStyle = HEX[colorOf(n)]; ctx.beginPath(); ctx.arc(CX, CY, 180, s, s + BW); ctx.arc(CX, CY, 130, s + BW, s, true); ctx.closePath(); ctx.fill();
        ctx.strokeStyle = '#d9b25a'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.save(); ctx.translate(CX, CY); ctx.rotate(s + BW / 2 + Math.PI / 2); ctx.fillStyle = '#fff'; ctx.font = 'bold 12px system-ui'; ctx.textAlign = 'center'; ctx.fillText(n, 0, -160); ctx.restore();
      }
      // εσωτερικός κώνος
      g = ctx.createRadialGradient(CX, CY, 20, CX, CY, 128); g.addColorStop(0, '#6e4a1d'); g.addColorStop(1, '#2a180a'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 128, 0, 7); ctx.fill();
      ctx.strokeStyle = '#d9b25a'; ctx.lineWidth = 3; ctx.stroke();
      for (let i = 0; i < 4; i++) { const a = wAng + i * Math.PI / 2; ctx.strokeStyle = '#c9972d'; ctx.lineWidth = 7; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(CX + Math.cos(a) * 18, CY + Math.sin(a) * 18); ctx.lineTo(CX + Math.cos(a) * 100, CY + Math.sin(a) * 100); ctx.stroke(); ctx.fillStyle = '#ffe9a3'; ctx.beginPath(); ctx.arc(CX + Math.cos(a) * 100, CY + Math.sin(a) * 100, 7, 0, 7); ctx.fill(); }
      g = ctx.createRadialGradient(CX - 8, CY - 8, 3, CX, CY, 34); g.addColorStop(0, '#fff3b8'); g.addColorStop(1, '#b8841f'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(CX, CY, 30, 0, 7); ctx.fill();
      // αριθμός νικητής στο κέντρο
      if (lastN !== null && !busy) { ctx.fillStyle = HEX[colorOf(lastN)]; ctx.beginPath(); ctx.arc(CX, CY, 24, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = 'bold 22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(lastN, CX, CY + 1); ctx.textBaseline = 'alphabetic'; }
      // ίχνος + μπάλα
      for (let i = 0; i < trail.length; i++) { const p = trail[i]; ctx.fillStyle = `rgba(255,255,255,${(i / trail.length) * 0.35})`; ctx.beginPath(); ctx.arc(CX + Math.cos(p.a - Math.PI / 2) * p.r, CY + Math.sin(p.a - Math.PI / 2) * p.r, 3 + i * 0.2, 0, 7); ctx.fill(); }
      const b = ball || (lastN !== null ? { a: restRel + wAng, r: 156 } : null);
      if (b) { const bx = CX + Math.cos(b.a - Math.PI / 2) * b.r, by = CY + Math.sin(b.a - Math.PI / 2) * b.r; ctx.save(); ctx.shadowColor = '#000'; ctx.shadowBlur = 8; const bg = ctx.createRadialGradient(bx - 2.5, by - 2.5, 1, bx, by, 8); bg.addColorStop(0, '#fff'); bg.addColorStop(1, '#b9c2d0'); ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(bx, by, 7.5, 0, 7); ctx.fill(); ctx.restore(); }
    }
    let lastT = performance.now();
    function idle(now) { if (dead) return; wAng += 0.22 * Math.min(0.05, (now - lastT) / 1000); lastT = now; drawWheel(); raf = requestAnimationFrame(idle); }
    raf = requestAnimationFrame(idle);

    function spinAnim(n) {
      return new Promise((resolve) => {
        cancelAnimationFrame(raf); trail = [];
        const kw = ORDER.indexOf(n), T = 7600, w0 = wAng, vw = 1.0, t0 = performance.now(), wEnd = w0 + vw * T / 1000;
        const target = (kw + 0.5) * BW + wEnd; let lastPk = -1, lastHit = 0;
        Sound.spin(3.5);
        (function step(now) {
          if (dead) return resolve();
          const t = now - t0, u = Math.min(1, t / T); wAng = w0 + vw * t / 1000;
          const a = target + Math.PI * 2 * 9 * Math.pow(1 - u, 2.3);
          let r = 199;
          if (u > 0.66) { const q = Math.min(1, (u - 0.66) / 0.34); r = 156 + 43 * Math.pow(1 - q, 1.6) + 7 * Math.abs(Math.sin(q * 26)) * Math.pow(1 - q, 1.5); if (q > 0.35 && q < 0.95 && now - lastHit > 140 + q * 200) { lastHit = now; Sound.ball(); } }
          ball = { a, r }; trail.push({ a, r }); if (trail.length > 14) trail.shift();
          if (u > 0.5) { const pk = Math.floor((((a - wAng) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) / BW); if (pk !== lastPk) { if (lastPk !== -1 && u > 0.84) Sound.ball(); lastPk = pk; } }
          drawWheel(); if (u < 1) requestAnimationFrame(step); else resolve();
        })(t0);
      }).then(() => { ball = null; trail = []; restRel = (ORDER.indexOf(n) + 0.5) * BW; Sound.thunk(); });
    }

    /* ---------- περιστροφή ---------- */
    $('#spin').onclick = async () => {
      if (busy) return; if (!bets.size) return toast('Βάλε πρώτα μάρκες στο ταμπλό.', true);
      busy = true; $('#spin').disabled = true; msg.className = 'msg'; $$('.rcell', v).forEach((c) => c.classList.remove('hit'));
      const list = [...bets.values()].map((b) => b.numbers ? { type: b.type, numbers: b.numbers, stake: b.stake } : { type: b.type, value: b.value, stake: b.stake });
      const total = [...bets.values()].reduce((s, b) => s + Math.round(b.stake * 100), 0);
      try {
        const res = await App.play('roulette', { bets: list }, total); const n = res.round.result.n; lastBets = [...bets.values()].map((b) => ({ ...b }));
        const nm = $('#nmb'); nm.classList.remove('hidden'); Sound.beep(0); await sleep(1100); nm.classList.add('hidden');
        await spinAnim(n); lastN = n;
        const cell = $(`.rcell[data-n="${n}"]`, rb); if (cell) cell.classList.add('hit');
        last.unshift(n); renderLast();
        // αποτέλεσμα στα chips
        const toks = bets.size ? [...bets.values()].map((b) => $('.tok', registry.get(b.key).el)) : [];
        res.round.lines.forEach((l, i) => { const t = toks[i]; if (!t) return; if (l.won) { t.classList.add('win'); t.insertAdjacentHTML('afterend', `<span class="plus">+${money(l.payout)}</span>`); } else t.classList.add('lose'); });
        App.settle(res); App.resultMsg(msg, res.round);
        msg.textContent = `Έπεσε το ${n} (${{ red: 'κόκκινο', black: 'μαύρο', green: 'πράσινο' }[colorOf(n)]}) · ` + msg.textContent;
        await sleep(res.round.payout ? 2600 : 1500);
        bets.clear(); stack.length = 0; $$('.plus', v).forEach((x) => x.remove()); paint();
      } catch (e) { App.msg(msg, 'lose', e.message); $('#nmb').classList.add('hidden'); }
      busy = false; $('#spin').disabled = false; lastT = performance.now(); if (!dead) { ball = null; raf = requestAnimationFrame(idle); }
    };
    paint();
    return () => { dead = true; cancelAnimationFrame(raf); };
  },
};
