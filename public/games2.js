'use strict';
/* Τροχός Τύχης · Ρουλέτα · Ζάρια · Κορώνα-Γράμματα */

/* ============================== ΖΑΡΙΑ (2 ζάρια 3D) ============================== */
Games.dice = {
  mount(v) {
    const M = App.catalog.dice.mult, PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
    const FACE = { 1: 'rotateY(0deg)', 2: 'rotateX(90deg)', 3: 'rotateY(90deg)', 4: 'rotateY(-90deg)', 5: 'rotateX(-90deg)', 6: 'rotateY(180deg)' };
    const SHOW = { 1: [0, 0], 2: [-90, 0], 3: [0, -90], 4: [0, 90], 5: [90, 0], 6: [0, 180] };
    const face = (n) => `<div class="df" style="transform:${FACE[n]} translateZ(46px)">${[...Array(9).keys()].map((i) => `<i class="${PIPS[n].includes(i) ? 'p' : ''}${n === 1 ? ' r' : ''}"></i>`).join('')}</div>`;
    const cube = (id) => `<div class="dscene"><div class="dshadow" id="sh${id}"></div><div class="dwrap" id="w${id}"><div class="dcube" id="c${id}">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div></div></div>`;
    const TILES = [['under7', 'Κάτω από 7', 'under7'], ['seven', 'Ακριβώς 7', 'seven'], ['over7', 'Πάνω από 7', 'over7'], ['even', 'Ζυγό', 'even'], ['odd', 'Μονό', 'odd'], ['doubles', 'Διπλά', 'doubles']];
    const tiles = [...TILES.map(([t, n, m]) => ({ key: t, type: t, name: n, mult: M[m] })), ...[2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ({ key: 'total:' + n, type: 'total', value: n, name: String(n), mult: M['total' + n], sum: true }))];
    const CH = [[0.2, '#7dd3fc', '#06283d'], [0.5, '#fbbf24', '#2b1b00'], [1, '#e5e7eb', '#111'], [5, '#ef4444', '#fff'], [25, '#22c55e', '#fff'], [100, '#2563eb', '#fff']];
    let bets = new Map(), chip = 1, busy = false, dead = false, last = null, rx = [0, 0], ry = [0, 0]; const hist = [];
    v.innerHTML = `<div class="grid2"><div class="card"><h2>Ζάρια <span id="fairline">${App.fairLine()}</span></h2>
      <div class="dtable" id="dtable"><div class="dfelt">${cube(1)}${cube(2)}</div><div class="dtotal" id="dtot"><span>ΑΘΡΟΙΣΜΑ</span><b id="dsum">–</b></div></div>
      <div class="row" id="dhist" style="justify-content:center;gap:5px;margin-top:8px;min-height:30px"></div><div class="msg" id="msg"></div></div>
      <div class="card"><h2>Στοιχήματα <span class="small mute" style="text-transform:none;letter-spacing:0">πάτα για να βάλεις τη μάρκα</span></h2>
        <div class="dgrid" id="dg1">${tiles.filter((t) => !t.sum).map((t) => `<button class="dtile" data-k="${t.key}"><b>${t.name}</b><span>${t.mult.toFixed(2)}×</span><em></em></button>`).join('')}</div>
        <div class="small mute" style="margin:10px 0 6px">Ακριβές άθροισμα</div>
        <div class="dgrid sums" id="dg2">${tiles.filter((t) => t.sum).map((t) => `<button class="dtile" data-k="${t.key}"><b>${t.name}</b><span>${t.mult.toFixed(1)}×</span><em></em></button>`).join('')}</div>
        <div class="row" style="margin-top:12px"><div class="chips" id="chips">${CH.map(([c, bg, fg]) => `<button class="chipbtn ${c === chip ? 'on' : ''}" data-c="${c}" style="background:${bg};color:${fg}">${c}</button>`).join('')}</div></div>
        <div class="row" style="margin-top:10px"><button id="undo">↩ Αναίρεση</button><button id="clr">Καθάρισμα</button><button id="dbl">2×</button><button id="rep">Επανάληψη</button></div>
        <div class="row" style="margin-top:12px;justify-content:space-between"><div>Σύνολο: <b id="tot" class="gold">0,00 €</b></div><button class="primary spinbtn" id="roll">🎲 ΡΙΞΕ</button></div>
        <div class="small mute" style="margin-top:10px">Δύο ζάρια, 36 πιθανοί συνδυασμοί. Κάθε στοίχημα έχει RTP 97%. Μπορείς να παίξεις πολλά μαζί. Space για ρίψη.</div></div></div>`;
    const msg = $('#msg'), stack = [];
    const total = () => [...bets.values()].reduce((a, b) => a + b, 0);
    const R = (x) => Math.round(x * 100) / 100;
    function draw() {
      $$('.dtile', v).forEach((b) => { const a = bets.get(b.dataset.k) || 0; b.classList.toggle('on', a > 0); b.querySelector('em').textContent = a > 0 ? a.toLocaleString('el-GR', { maximumFractionDigits: 2 }) : ''; });
      $('#tot').textContent = money(Math.round(total() * 100));
    }
    $$('.chipbtn', v).forEach((b) => b.onclick = () => { chip = Number(b.dataset.c); $$('.chipbtn', v).forEach((x) => x.classList.toggle('on', x === b)); Sound.click(); });
    $$('.dtile', v).forEach((b) => b.onclick = () => { if (busy) return; const k = b.dataset.k; if ((bets.get(k) || 0) + chip > 1000) return toast('Μέγιστο 1.000 € ανά στοίχημα', true); bets.set(k, R((bets.get(k) || 0) + chip)); stack.push([k, chip]); Sound.click(); draw(); });
    $('#undo').onclick = () => { if (busy || !stack.length) return; const [k, c] = stack.pop(); const n = R((bets.get(k) || 0) - c); n > 0 ? bets.set(k, n) : bets.delete(k); draw(); };
    $('#clr').onclick = () => { if (busy) return; bets.clear(); stack.length = 0; draw(); };
    $('#dbl').onclick = () => { if (busy) return; for (const [k, a] of bets) bets.set(k, Math.min(1000, R(a * 2))); draw(); };
    $('#rep').onclick = () => { if (busy || !last) return; bets = new Map(last); draw(); };
    const cubeEl = [null, $('#c1'), $('#c2')], wrapEl = [null, $('#w1'), $('#w2')], shEl = [null, $('#sh1'), $('#sh2')];
    function setFace(i, n, spin, ms) {
      const [ax, ay] = SHOW[n]; rx[i - 1] = Math.ceil(rx[i - 1] / 360) * 360 + (spin ? 360 * (2 + i) : 0); ry[i - 1] = Math.ceil(ry[i - 1] / 360) * 360 + (spin ? 360 * (3 - i + 2) : 0);
      cubeEl[i].style.transition = spin ? `transform ${ms}ms cubic-bezier(.15,.7,.2,1)` : 'none';
      cubeEl[i].style.transform = `rotateX(${rx[i - 1] + ax}deg) rotateY(${ry[i - 1] + ay}deg) rotateZ(0deg)`;
    }
    setFace(1, 5, false); setFace(2, 3, false);
    const sleepT = (ms) => new Promise((r) => setTimeout(r, ms));
    function renderH() { $('#dhist').innerHTML = hist.slice(0, 14).map((t) => `<span class="dh ${t === 7 ? 's7' : ''}">${t}</span>`).join(''); }
    async function roll() {
      if (busy) return; if (!bets.size) return toast('Βάλε πρώτα ένα στοίχημα', true);
      busy = true; $('#roll').disabled = true; msg.className = 'msg'; $('#dsum').textContent = '…'; $('#dtable').classList.remove('won', 'lost');
      const list = [...bets].map(([k, st]) => { const [t, val] = k.split(':'); return val ? { type: t, value: Number(val), stake: st } : { type: t, stake: st }; });
      const snapshot = new Map(bets), tot = Math.round(total() * 100);
      try {
        const res = await App.play('dice', { bets: list }, tot); const r = res.round.result; const turbo = false;
        last = snapshot; Sound.roll();
        const T = 1700; [1, 2].forEach((i) => { wrapEl[i].classList.remove('land'); wrapEl[i].classList.add('toss'); shEl[i].classList.add('toss'); setFace(i, i === 1 ? r.d1 : r.d2, true, T + i * 150); });
        await sleepT(T + 450); if (dead) return;
        [1, 2].forEach((i) => { wrapEl[i].classList.remove('toss'); shEl[i].classList.remove('toss'); wrapEl[i].classList.add('land'); });
        Sound.click(); $('#dsum').textContent = r.total; hist.unshift(r.total); renderH();
        const won = res.round.payout > 0; $('#dtable').classList.add(res.round.payout >= tot ? 'won' : 'lost');
        $$('.dtile', v).forEach((b) => { b.classList.remove('hit'); });
        res.round.lines.forEach((l) => { if (l.won) { const t = tiles.find((x) => (x.type === 'total' ? 'Άθροισμα ' + x.value : x.name) === l.desc); const el = t && $(`.dtile[data-k="${t.key}"]`, v); if (el) { el.classList.add('hit'); setTimeout(() => el.classList.remove('hit'), 2500); } } });
        await sleepT(250); App.settle(res); App.resultMsg(msg, res.round); msg.textContent = `Έπεσε ${r.d1} + ${r.d2} = ${r.total}${r.d1 === r.d2 ? ' (διπλά)' : ''} · ` + msg.textContent;
        bets.clear(); stack.length = 0; draw();
      } catch (e) { App.msg(msg, 'lose', e.message); }
      busy = false; $('#roll').disabled = false;
    }
    $('#roll').onclick = roll;
    const key = (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); roll(); } };
    document.addEventListener('keydown', key);
    api('GET', '/api/history?limit=100').then((h) => { hist.push(...h.rounds.filter((r) => r.game === 'dice' && r.result && r.result.total).map((r) => r.result.total)); renderH(); }).catch(() => {});
    draw();
    return () => { dead = true; document.removeEventListener('keydown', key); };
  },
};

/* ============================== ΚΟΡΩΝΑ / ΓΡΑΜΜΑΤΑ (3D νόμισμα) ============================== */
Games.coin = {
  mount(v) {
    let pick = 'heads', busy = false, dead = false, rot = 0, streak = 0, auto = 0, wins = 0, total = 0; const hist = [];
    const layers = Array.from({ length: 11 }, (_, i) => `<div class="cl" style="transform:translateZ(${(i - 5) * 2}px)"></div>`).join('');
    v.innerHTML = `<div class="grid2"><div class="card"><h2>Κορώνα – Γράμματα <span id="fairline">${App.fairLine()}</span></h2>
      <div class="coinarena" id="arena"><div class="coinglow" id="cglow"></div><div class="coinstage"><div class="cwrap" id="cwrap"><div class="coin3" id="coin">${layers}<div class="cf cfront"><span>Κ</span><small>ΚΟΡΩΝΑ</small></div><div class="cf cback"><span>Γ</span><small>ΓΡΑΜΜΑΤΑ</small></div></div></div><div class="cshadow" id="cshadow"></div></div><div class="sparks" id="sparks"></div></div>
      <div class="row" style="justify-content:space-between;margin-top:6px"><div class="small mute">Σερί: <b id="streak" class="gold">0</b></div><div class="small mute">Νίκες: <b id="wl" class="gold">0/0</b></div></div>
      <div class="row" id="hist" style="justify-content:center;margin-top:8px;min-height:30px;gap:5px"></div><div class="msg" id="msg"></div></div>
      <div class="card"><h2>Ποντάρισμα</h2>
        <div class="row" id="sides" style="margin-bottom:14px"><button data-p="heads" class="grow cside"><i>Κ</i>Κορώνα</button><button data-p="tails" class="grow cside"><i class="sil">Γ</i>Γράμματα</button></div>
        ${stakeBox('<button class="primary" id="flip">🪙 ΡΙΞΕ</button>')}
        <div class="row" style="margin-top:12px"><button id="auto">Auto ×5</button><label class="small mute" style="display:flex;align-items:center;gap:6px"><input type="checkbox" id="turbo"> Turbo</label></div>
        <div class="small mute" style="margin-top:12px">Ίση πιθανότητα 50%. Απόδοση ${App.catalog.coin.mult.toFixed(2)}× (RTP 97%). Πλήκτρο Space για ρίψη.</div></div></div>`;
    const getStake = wireStake(v), msg = $('#msg'), coin = $('#coin'), wrap = $('#cwrap'), sh = $('#cshadow');
    const sides = () => $$('#sides button').forEach((b) => b.classList.toggle('on', b.dataset.p === pick));
    $$('#sides button').forEach((b) => b.onclick = () => { if (busy) return; pick = b.dataset.p; Sound.click(); sides(); }); sides();
    const renderH = () => { $('#hist').innerHTML = hist.slice(0, 15).map((s) => `<span class="ch ${s === 'heads' ? 'h' : 't'}">${s === 'heads' ? 'Κ' : 'Γ'}</span>`).join(''); };
    api('GET', '/api/history?limit=100').then((h) => { hist.push(...h.rounds.filter((r) => r.game === 'coin').map((r) => r.result.side)); renderH(); }).catch(() => {});
    function spark(win) {
      const box = $('#sparks'); box.innerHTML = '';
      for (let i = 0; i < (win ? 28 : 0); i++) { const e = document.createElement('i'); const a = Math.random() * 6.283, d = 70 + Math.random() * 120; e.style.setProperty('--x', Math.cos(a) * d + 'px'); e.style.setProperty('--y', Math.sin(a) * d - 30 + 'px'); e.style.background = ['#ffd34d', '#fff', '#ff9ad5', '#7dffa6'][i % 4]; box.appendChild(e); }
    }
    async function flip() {
      if (busy) return; busy = true; $('#flip').disabled = true; msg.className = 'msg'; const s = getStake(); const turbo = $('#turbo').checked; const T = turbo ? 900 : 1900; spark(false);
      try {
        const res = await App.play('coin', { stake: s, side: pick }, Math.round(s * 100)); const side = res.round.result.side, won = res.round.result.won;
        rot = Math.ceil(rot / 360) * 360 + 360 * (turbo ? 4 : 7) + (side === 'tails' ? 180 : 0);
        coin.style.transition = `transform ${T}ms cubic-bezier(.18,.6,.25,1)`; coin.style.transform = `rotateX(${rot}deg)`;
        wrap.style.setProperty('--T', T + 'ms'); wrap.classList.remove('land'); wrap.classList.add('toss'); sh.classList.add('toss'); sh.style.setProperty('--T', T + 'ms'); Sound.coin();
        await sleep(T + 50); if (dead) return;
        wrap.classList.remove('toss'); sh.classList.remove('toss'); wrap.classList.add('land'); Sound.click();
        hist.unshift(side); renderH(); total++; if (won) { wins++; streak++; } else streak = 0; $('#streak').textContent = streak; $('#wl').textContent = wins + '/' + total;
        $('#arena').classList.toggle('won', won); $('#arena').classList.toggle('lost', !won); spark(won);
        await sleep(turbo ? 150 : 350); App.settle(res); App.resultMsg(msg, res.round); msg.textContent = `Έπεσε ${side === 'heads' ? 'Κορώνα' : 'Γράμματα'} · ` + msg.textContent;
      } catch (e) { App.msg(msg, 'lose', e.message); auto = 0; $('#auto').textContent = '🔁 Auto ×5'; }
      busy = false; $('#flip').disabled = false;
    }
    async function runAuto() {
      if (auto) { auto = 0; $('#auto').textContent = '🔁 Auto ×5'; return; }
      auto = 5;
      while (auto > 0 && !dead) { $('#auto').textContent = '⏹ Στοπ (' + auto + ')'; await flip(); if (!auto) break; auto--; await sleep(500); }
      auto = 0; if (!dead) $('#auto').textContent = '🔁 Auto ×5';
    }
    $('#flip').onclick = flip; $('#auto').onclick = runAuto;
    const key = (e) => { if (e.code === 'Space' && !/INPUT|SELECT|TEXTAREA|BUTTON/.test(document.activeElement.tagName)) { e.preventDefault(); flip(); } };
    document.addEventListener('keydown', key);
    return () => { dead = true; auto = 0; document.removeEventListener('keydown', key); };
  },
};
