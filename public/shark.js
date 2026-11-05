'use strict';
/* Καρχαρίας στον βυθό: πόσα ψάρια θα φάει; Over / Under / ακριβής αριθμός */
Games.shark = {
  mount(v) {
    const C = App.catalog.shark, W = 900, H = 460, NF = C.fish;
    const CH = [[0.2, '#7dd3fc', '#06283d'], [0.5, '#fbbf24', '#2b1b00'], [1, '#e5e7eb', '#111'], [5, '#ef4444', '#fff'], [25, '#22c55e', '#fff'], [100, '#2563eb', '#fff']];
    let line = 4.5, chip = 1, bets = new Map(), last = null, busy = false, dead = false, raf = 0, lastCount = null;
    const stack = [];
    v.innerHTML = `<div class="grid2 sharkgrid"><div class="stack"><div class="card"><h2>Καρχαρίας στον βυθό <span id="fairline">${App.fairLine()}</span></h2>
      <div class="sharkstage"><canvas id="sc" width="${W}" height="${H}"></canvas></div>
      <div class="msg" id="msg"></div></div>
      <div class="card"><h2>Πιθανότητες <span class="small mute" style="text-transform:none;letter-spacing:0">πόσα ψάρια θα φάει από τα ${NF}</span></h2><div class="hbars" id="hb"></div><div class="small mute" style="margin-top:8px">Κάθε ψάρι το τρώει με πιθανότητα 1/3, οπότε κατά μέσο όρο τρώει 5 ψάρια.</div></div></div>
      <div class="card"><h2>Στοιχήματα</h2>
        <div class="small mute" style="margin-bottom:6px">Πόσα ψάρια θα φάει ο καρχαρίας; Διάλεξε όριο:</div>
        <div class="lines" id="lines">${C.lines.filter((l) => C.over[l].ok || C.under[l].ok).map((l) => `<button data-l="${l}">${l}</button>`).join('')}</div>
        <div class="dgrid two" style="margin-top:10px"><button class="dtile under" id="tu"><b></b><span></span><i></i><em></em></button><button class="dtile over" id="to"><b></b><span></span><i></i><em></em></button></div>
        <div class="small mute" style="margin:12px 0 6px">Ακριβής αριθμός ψαριών</div>
        <div class="dgrid sums" id="dex">${C.exact.filter((n) => C.exactMap[n].ok).map((n) => `<button class="dtile ${C.exactMap[n].ok ? '' : 'off'}" ${C.exactMap[n].ok ? '' : 'disabled'} data-k="exact:${n}"><b>${n}</b><span>${!C.exactMap[n].ok ? 'μη διαθέσιμο' : C.exactMap[n].bp >= 100 ? Math.round(C.exactMap[n].bp) + '×' : C.exactMap[n].bp.toFixed(1) + '×'}</span><em></em></button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><div class="chips" id="chips">${CH.map(([c, bg, fg]) => `<button class="chipbtn ${c === chip ? 'on' : ''}" data-c="${c}" style="background:${bg};color:${fg}">${c}</button>`).join('')}</div></div>
        <div class="row" style="margin-top:10px"><button id="undo">↩ Αναίρεση</button><button id="clr">Καθάρισμα</button><button id="dbl">2×</button><button id="rep">Επανάληψη</button></div>
        <div class="betlist" id="bl"></div>
        <div class="row" style="margin-top:12px;justify-content:space-between"><div>Σύνολο: <b id="tot" class="gold">0,00 €</b></div><button class="primary spinbtn" id="go">🦈 ΑΦΗΣΕ ΤΟΝ ΚΑΡΧΑΡΙΑ</button></div>
        <div class="row" style="margin-top:8px"><label class="small mute" style="display:flex;gap:6px;align-items:center"><input type="checkbox" id="turbo"> Turbo</label><span class="small mute">· Space για έναρξη · RTP 97%</span></div></div></div>`;
    const msg = $('#msg'), cv = $('#sc'), ctx = cv.getContext('2d');
    const R2 = (x) => Math.round(x * 100) / 100, total = () => [...bets.values()].reduce((a, b) => a + b, 0);
    const pct = (p) => (p * 100 < 10 ? (p * 100).toFixed(1) : Math.round(p * 100)) + '%';
    const lbl = (k) => { const [t, x] = k.split(':'); return t === 'exact' ? `Ακριβώς ${x}` : `${t === 'over' ? 'Over' : 'Under'} ${x}`; };
    const need = (k) => { const [t, x] = k.split(':'); return t === 'exact' ? `${x} ψάρια` : t === 'over' ? `${Math.ceil(Number(x))}+ ψάρια` : `έως ${Math.floor(Number(x))} ψάρια`; };
    function refresh() {
      $$('#lines button').forEach((b) => b.classList.toggle('on', Number(b.dataset.l) === line));
      const U = C.under[line], O = C.over[line];
      const set = (el, key, name, d) => { el.dataset.k = key; el.querySelector('b').textContent = name; el.querySelector('span').textContent = d.bp.toFixed(2) + '×'; el.querySelector('i').textContent = need(key) + ' · ' + pct(d.p); el.classList.toggle('hidden', !d.ok); el.parentNode.classList.toggle('one', !(U.ok && O.ok)); };
      set($('#tu'), 'under:' + line, 'Under ' + line, U); set($('#to'), 'over:' + line, 'Over ' + line, O);
      $$('.dtile', v).forEach((b) => { const a = bets.get(b.dataset.k) || 0; b.classList.toggle('on', a > 0); b.querySelector('em').textContent = a > 0 ? a.toLocaleString('el-GR', { maximumFractionDigits: 2 }) : ''; });
      $('#tot').textContent = money(Math.round(total() * 100));
      $('#bl').innerHTML = bets.size ? [...bets].map(([k, a]) => `<span class="bchip">${lbl(k)} · ${a.toLocaleString('el-GR', { maximumFractionDigits: 2 })} € <a data-r="${k}">×</a></span>`).join('') : '<span class="small mute">Δεν έχεις βάλει στοίχημα ακόμα.</span>';
      $$('#bl [data-r]').forEach((a) => a.onclick = () => { if (busy) return; bets.delete(a.dataset.r); refresh(); });
      hbars();
    }
    function hbars() {
      const mx = Math.max(...C.pmf); const cover = new Set();
      for (const k of bets.keys()) { const [t, x] = k.split(':'); const xv = Number(x); for (let n = 0; n <= NF; n++) if (t === 'exact' ? n === xv : t === 'over' ? n > xv : n < xv) cover.add(n); }
      $('#hb').innerHTML = C.pmf.map((p, n) => `<div class="hb ${cover.has(n) ? 'cov' : ''} ${lastCount === n ? 'res' : ''}"><div style="height:${Math.max(3, p / mx * 100)}%"></div><span>${n}</span></div>`).join('');
    }
    const add = (k) => { if (busy) return; const [tt, xx] = k.split(':'); if (!(tt === 'exact' ? C.exactMap[xx] : C[tt][xx]).ok) return; if ((bets.get(k) || 0) + chip > 1000) return toast('Μέγιστο 1.000 € ανά στοίχημα', true); bets.set(k, R2((bets.get(k) || 0) + chip)); stack.push([k, chip]); Sound.click(); refresh(); };
    $$('.chipbtn', v).forEach((b) => b.onclick = () => { chip = Number(b.dataset.c); $$('.chipbtn', v).forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); });
    $$('#lines button').forEach((b) => b.onclick = () => { line = Number(b.dataset.l); Sound.click(); refresh(); });
    ['tu', 'to'].forEach((id) => $('#' + id).onclick = () => add($('#' + id).dataset.k));
    $$('#dex .dtile').forEach((b) => b.onclick = () => add(b.dataset.k));
    $('#undo').onclick = () => { if (busy || !stack.length) return; const [k, c] = stack.pop(); const n = R2((bets.get(k) || 0) - c); n > 0 ? bets.set(k, n) : bets.delete(k); refresh(); };
    $('#clr').onclick = () => { if (busy) return; bets.clear(); stack.length = 0; refresh(); };
    $('#dbl').onclick = () => { if (busy) return; for (const [k, a] of bets) bets.set(k, Math.min(1000, R2(a * 2))); refresh(); };
    $('#rep').onclick = () => { if (busy || !last) return; bets = new Map(last); refresh(); };

    /* ============ σκηνή βυθού ============ */
    const rnd = (a, b) => a + Math.random() * (b - a);
    const bubbles = Array.from({ length: 36 }, () => ({ x: rnd(0, W), y: rnd(0, H), r: rnd(1.5, 6), s: rnd(0.3, 1.3) }));
    const weeds = Array.from({ length: 14 }, (_, i) => ({ x: 20 + i * 66 + rnd(-14, 14), h: rnd(70, 140), p: rnd(0, 6), c: ['#1f9d55', '#2bb673', '#178a4a'][i % 3] }));
    const corals = [{ x: 150, c: '#ff6b81' }, { x: 430, c: '#ff9f43' }, { x: 700, c: '#c56cf0' }, { x: 840, c: '#ff6b81' }];
    const farFish = Array.from({ length: 12 }, () => ({ x: rnd(0, W), y: rnd(60, 230), s: rnd(0.3, 0.8) }));
    const FISH = ['🐟', '🐠', '🐡', '🐟', '🐠'];
    let fish = [], shark = null, hud = { n: 0, big: 0 }, floats = [], puffs = [], flashT = 0, shakeT = 0;
    function newFish() { fish = Array.from({ length: NF }, (_, i) => ({ i, x: 90 + i * (W - 180) / (NF - 1), y: rnd(120, 300), e: FISH[i % 5], ph: rnd(0, 6), dir: 1, born: performance.now(), gone: false, eatAt: 0, flee: 0, fy: 0 })); }
    newFish();
    function drawShark(x, y, o) {
      const { jaw = 0, wag = 0, sc = 1, a = 1, dark = 0 } = o; ctx.save(); ctx.translate(x, y); ctx.scale(sc, sc); ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, -46, 0, 36); g.addColorStop(0, dark ? '#243b4f' : '#5f7f9c'); g.addColorStop(0.55, dark ? '#2b4a60' : '#8fb0c8'); g.addColorStop(0.56, dark ? '#556' : '#e8f1f7'); g.addColorStop(1, dark ? '#889' : '#cfe0ec');
      // ουρά
      ctx.fillStyle = dark ? '#1d3345' : '#4a6783'; ctx.beginPath(); ctx.moveTo(-88, -4); ctx.lineTo(-134, -50 + wag); ctx.quadraticCurveTo(-118, -10, -112, 2); ctx.quadraticCurveTo(-120, 22, -136, 44 + wag); ctx.lineTo(-88, 8); ctx.fill();
      // πτερύγια
      ctx.beginPath(); ctx.moveTo(14, -40); ctx.lineTo(-34, -90); ctx.lineTo(-40, -26); ctx.fill();
      ctx.beginPath(); ctx.moveTo(44, 22); ctx.lineTo(-12, 66 + wag * 0.3); ctx.lineTo(-4, 24); ctx.fill();
      // σώμα
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(124, 6); ctx.bezierCurveTo(100, -34, 20, -48, -60, -22); ctx.lineTo(-92, -4); ctx.lineTo(-92, 8); ctx.bezierCurveTo(-30, 34, 70, 36, 104, 20); ctx.closePath(); ctx.fill();
      // στόμα
      if (jaw > 0.02) {
        ctx.fillStyle = '#7a1020'; ctx.beginPath(); ctx.moveTo(64, 14); ctx.lineTo(122, 8); ctx.lineTo(112 + Math.sin(jaw) * 4, 8 + Math.sin(jaw) * 64); ctx.lineTo(58, 16 + Math.sin(jaw) * 30); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; for (let k = 0; k < 7; k++) { const tx = 70 + k * 7.5; ctx.beginPath(); ctx.moveTo(tx, 13); ctx.lineTo(tx + 3.5, 13 + 9); ctx.lineTo(tx + 7, 12); ctx.fill(); }
        ctx.save(); ctx.translate(64, 16); ctx.rotate(jaw * 0.35); ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(56, -4); ctx.quadraticCurveTo(40, 18, 0, 14); ctx.fill(); ctx.fillStyle = '#fff'; for (let k = 0; k < 6; k++) { ctx.beginPath(); ctx.moveTo(8 + k * 8, 0); ctx.lineTo(11 + k * 8, -8); ctx.lineTo(15 + k * 8, 0); ctx.fill(); } ctx.restore();
      } else { ctx.strokeStyle = '#33495d'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(122, 9); ctx.quadraticCurveTo(90, 20, 62, 14); ctx.stroke(); }
      // μάτι και βράγχια
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(82, -6, 6, 0, 7); ctx.fill(); ctx.fillStyle = '#000'; ctx.beginPath(); ctx.arc(84, -6, 3.2, 0, 7); ctx.fill();
      ctx.strokeStyle = 'rgba(30,50,70,.55)'; ctx.lineWidth = 2; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.moveTo(44 - k * 7, -14); ctx.quadraticCurveTo(40 - k * 7, 0, 44 - k * 7, 12); ctx.stroke(); }
      ctx.restore();
    }
    function coral(x, c, t) { ctx.save(); ctx.strokeStyle = c; ctx.lineCap = 'round'; ctx.lineWidth = 7; const br = (bx, by, len, ang, d) => { if (d > 3) return; const ex = bx + Math.cos(ang) * len, ey = by + Math.sin(ang) * len; ctx.lineWidth = 8 - d * 2; ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke(); br(ex, ey, len * 0.7, ang - 0.5 + Math.sin(t + d) * 0.04, d + 1); br(ex, ey, len * 0.7, ang + 0.5, d + 1); }; br(x, H - 50, 46, -Math.PI / 2, 0); ctx.restore(); }
    function scene(t) {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#34c3e6'); g.addColorStop(0.4, '#0b78b4'); g.addColorStop(1, '#04203f'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 6; i++) { ctx.save(); ctx.globalAlpha = 0.06 + 0.03 * Math.sin(t * 0.8 + i); ctx.fillStyle = '#fff'; const x = 40 + i * 160 + Math.sin(t * 0.4 + i) * 30; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + 60, 0); ctx.lineTo(x + 190, H); ctx.lineTo(x - 30, H); ctx.fill(); ctx.restore(); }
      ctx.font = '22px sans-serif'; ctx.globalAlpha = 0.25; for (const f of farFish) { f.x += f.s; if (f.x > W + 30) f.x = -30; ctx.save(); ctx.translate(f.x, f.y + Math.sin(t + f.x / 50) * 4); ctx.scale(-1, 1); ctx.fillText('🐟', 0, 0); ctx.restore(); } ctx.globalAlpha = 1;
      if (!shark) { const ix = ((t * 38) % (W + 500)) - 250; drawShark(ix, 70 + Math.sin(t) * 10, { sc: 0.45, a: 0.28, dark: 1, wag: Math.sin(t * 3) * 6 }); }
      // πυθμένας
      const sg = ctx.createLinearGradient(0, H - 90, 0, H); sg.addColorStop(0, '#d9b873'); sg.addColorStop(1, '#8a6a36'); ctx.fillStyle = sg; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W; x += 30) ctx.lineTo(x, H - 56 + Math.sin(x / 90) * 10 + Math.sin(x / 33) * 3); ctx.lineTo(W, H); ctx.fill();
      ctx.fillStyle = '#6b5b4a'; [[60, H - 38, 34, 16], [330, H - 34, 26, 12], [610, H - 40, 40, 18], [790, H - 30, 22, 10]].forEach(([x, y, rx, ry]) => { ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, 7); ctx.fill(); });
      corals.forEach((c) => coral(c.x, c.c, t));
      for (const w of weeds) { ctx.strokeStyle = w.c; ctx.lineWidth = 6; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(w.x, H - 46); for (let k = 1; k <= 6; k++) ctx.lineTo(w.x + Math.sin(t * 1.2 + w.p + k * 0.6) * (4 + k * 3), H - 46 - (w.h / 6) * k); ctx.stroke(); }
      ctx.font = '34px sans-serif'; ctx.fillText('⭐', 250, H - 24); ctx.fillText('🐚', 560, H - 20); ctx.font = '44px sans-serif'; ctx.fillText('🧰', 480, H - 36);
    }
    function frame(now) {
      if (dead) return; const t = now / 1000;
      ctx.save(); if (shakeT > 0) { ctx.translate(rnd(-4, 4), rnd(-3, 3)); shakeT--; }
      scene(t);
      for (const b of bubbles) { b.y -= b.s; if (b.y < -10) { b.y = H + 10; b.x = rnd(0, W); } ctx.strokeStyle = 'rgba(255,255,255,.4)'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(b.x + Math.sin(t + b.y / 30) * 4, b.y, b.r, 0, 7); ctx.stroke(); }
      // ψάρια
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.font = '40px sans-serif';
      for (const f of fish) {
        if (f.gone) continue; const age = Math.min(1, (now - f.born) / 600);
        let x = f.x, y = f.y + Math.sin(t * 2 + f.ph) * 9 + f.fy;
        if (f.flee) { f.fy += f.flee * 3; f.x += 3; f.flee *= 0.985; }
        ctx.save(); ctx.globalAlpha = age; ctx.translate(x, y); ctx.scale(-1, 1); ctx.rotate(f.flee ? f.flee * 0.1 : 0); ctx.shadowColor = '#00000066'; ctx.shadowBlur = 8; ctx.fillText(f.e, 0, 0); ctx.restore();
      }
      if (shark) {
        const s = shark; s.jaw = Math.max(0, s.jaw - 0.045); const open = s.jaw > 0.02 ? Math.sin(Math.min(1, s.jaw) * Math.PI / 2) : 0;
        drawShark(s.x, s.y, { jaw: open * 1.0, wag: Math.sin(t * 9) * 12 });
      }
      for (let i = puffs.length - 1; i >= 0; i--) { const p = puffs[i]; p.x += p.vx; p.y += p.vy; p.vy -= 0.02; p.l -= 0.025; if (p.l <= 0) { puffs.splice(i, 1); continue; } ctx.globalAlpha = p.l; ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r * (2 - p.l), 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
      ctx.font = 'bold 30px sans-serif'; ctx.textAlign = 'center';
      for (let i = floats.length - 1; i >= 0; i--) { const f = floats[i]; f.y -= 1.2; f.l -= 0.018; if (f.l <= 0) { floats.splice(i, 1); continue; } ctx.globalAlpha = f.l; ctx.fillStyle = '#ffe14d'; ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = 4; ctx.strokeText(f.t, f.x, f.y); ctx.fillText(f.t, f.x, f.y); ctx.globalAlpha = 1; }
      if (flashT > 0) { ctx.fillStyle = `rgba(255,255,255,${flashT * 0.25})`; ctx.fillRect(0, 0, W, H); flashT = Math.max(0, flashT - 0.08); }
      // HUD
      ctx.textAlign = 'left'; ctx.fillStyle = '#031a3acc'; ctx.beginPath(); ctx.roundRect(14, 12, 300, 56, 16); ctx.fill(); ctx.strokeStyle = '#ffd34d'; ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = '#cfe9ff'; ctx.font = '12px sans-serif'; ctx.fillText('ΨΑΡΙΑ ΠΟΥ ΕΦΑΓΕ Ο ΚΑΡΧΑΡΙΑΣ', 28, 30); ctx.fillStyle = '#ffd34d'; ctx.font = 'bold 28px sans-serif'; ctx.fillText(`🐟 ${hud.n} / ${NF}`, 28, 54);
      if (hud.big > 0) { hud.big -= 0.012; ctx.textAlign = 'center'; ctx.globalAlpha = Math.min(1, hud.big * 2); ctx.font = 'bold 74px sans-serif'; ctx.fillStyle = '#fff'; ctx.strokeStyle = '#7a1020'; ctx.lineWidth = 10; const txt = `ΕΦΑΓΕ ${hud.n}!`; ctx.strokeText(txt, W / 2, H / 2 + 20); ctx.fillText(txt, W / 2, H / 2 + 20); ctx.globalAlpha = 1; }
      ctx.restore();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    const sleepT = (ms) => new Promise((r) => setTimeout(r, ms));
    function puff(x, y, n, c) { for (let i = 0; i < n; i++) puffs.push({ x, y, vx: rnd(-2, 2), vy: rnd(-2.5, 0.5), r: rnd(3, 8), l: 1, c: c || (Math.random() < 0.5 ? '#ff8a8a' : '#fff') }); }
    async function hunt(eaten, turbo) {
      const E = new Set(eaten); newFish(); hud.n = 0; hud.big = 0; await sleepT(450);
      const wps = fish.filter((f) => E.has(f.i)).map((f) => ({ x: f.x, y: f.y })); const T = turbo ? 2300 : 4600, x0 = -170, x1 = W + 190, MOUTH = 124;
      shark = { x: x0, y: wps.length ? wps[0].y : 200, jaw: 0 }; const t0 = performance.now(); Sound.spin(T / 1000);
      await new Promise((resolve) => (function step(now) {
        if (dead) return resolve(); const u = Math.min(1, (now - t0) / T), e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2; const ue = 0.15 * u + 0.85 * e;
        shark.x = x0 + (x1 - x0) * ue;
        // ύψος: κατευθύνεται προς το επόμενο ψάρι που θα φάει
        const nxt = wps.find((w) => w.x > shark.x + MOUTH - 10); const tgt = nxt ? nxt.y : shark.y; shark.y += (tgt - shark.y) * 0.07 + Math.sin(now / 300) * 0.4;
        for (const f of fish) {
          if (f.gone) continue; const mx = shark.x + MOUTH;
          if (E.has(f.i)) { if (mx >= f.x - 8) { f.gone = true; hud.n++; shark.jaw = 1.4; puff(f.x, f.y, 14); floats.push({ x: f.x, y: f.y - 10, t: '+1', l: 1 }); Sound.thunk(); Sound.ding(Math.min(hud.n, 8)); flashT = 0.6; shakeT = 5; } }
          else if (!f.flee && mx >= f.x - 150) f.flee = (f.y < shark.y ? -1 : 1) * 2.2;
        }
        if (u < 1) requestAnimationFrame(step); else resolve();
      })(t0));
      await sleepT(250); shark = null; hud.big = 1.3;
      for (const f of fish) f.flee = 0;
    }
    async function go() {
      if (busy) return; if (!bets.size) return toast('Βάλε πρώτα ένα στοίχημα', true);
      busy = true; $('#go').disabled = true; msg.className = 'msg'; lastCount = null; hbars();
      const list = [...bets].map(([k, st]) => { const [t, x] = k.split(':'); return { type: t, value: Number(x), stake: st }; }); const snap = new Map(bets), tot = Math.round(total() * 100);
      try {
        const res = await App.play('shark', { bets: list }, tot); const r = res.round.result; last = snap;
        await hunt(r.eaten, $('#turbo').checked); if (dead) return;
        lastCount = r.count; hbars(); await sleepT(300);
        App.settle(res); App.resultMsg(msg, res.round); msg.textContent = `Ο καρχαρίας έφαγε ${r.count} ψάρια · ` + msg.textContent;
        bets.clear(); stack.length = 0; refresh();
      } catch (e) { App.msg(msg, 'lose', e.message); }
      busy = false; $('#go').disabled = false;
    }
    $('#go').onclick = go;
    const key = (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); go(); } };
    document.addEventListener('keydown', key); refresh();
    return () => { dead = true; cancelAnimationFrame(raf); document.removeEventListener('keydown', key); };
  },
};
