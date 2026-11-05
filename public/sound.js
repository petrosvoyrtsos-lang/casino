'use strict';
/* Ήχοι συνθετικοί με WebAudio (χωρίς αρχεία ήχου). */
const Sound = (() => {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false, vol = 0.6;
  try { muted = localStorage.getItem('tr_muted') === '1'; const v = parseFloat(localStorage.getItem('tr_vol')); if (!isNaN(v)) vol = v; } catch { /* ignore */ }

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : vol;
      const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1.5, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  const now = () => ctx.currentTime;
  function out(pan) {
    if (pan !== undefined && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan)); p.connect(master); return p; }
    return master;
  }
  function tone(freq, dur, { type = 'sine', gain = 0.25, when = 0, slide = null, attack = 0.005, pan } = {}) {
    if (!ensure() || muted) return;
    const t = now() + when, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t); if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(out(pan)); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, { gain = 0.2, when = 0, type = 'bandpass', f0 = 800, f1 = null, q = 1, pan, attack = 0.01 } = {}) {
    if (!ensure() || muted) return;
    const t = now() + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; s.loop = true; f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(out(pan)); s.start(t, Math.random()); s.stop(t + dur + 0.05);
  }

  const api = {
    ensure,
    get muted() { return muted; }, get volume() { return vol; },
    setMuted(m) { muted = !!m; try { localStorage.setItem('tr_muted', muted ? '1' : '0'); } catch { /* ignore */ } if (master) master.gain.value = muted ? 0 : vol; },
    setVolume(v) { vol = v; try { localStorage.setItem('tr_vol', String(v)); } catch { /* ignore */ } if (master && !muted) master.gain.value = v; },

    click() { tone(900, 0.05, { type: 'square', gain: 0.08 }); },
    chip() { tone(1800, 0.06, { type: 'triangle', gain: 0.18 }); tone(1200, 0.08, { type: 'triangle', gain: 0.12, when: 0.02 }); },
    error() { tone(160, 0.25, { type: 'sawtooth', gain: 0.15, slide: 90 }); },
    /* Αμάξι που περνά: whoosh + κινητήρας με Doppler και panning αριστερά→δεξιά */
    car(pan = 0) {
      noise(0.75, { gain: 0.22, f0: 350, f1: 1400, q: 0.8, pan: pan - 0.4, attack: 0.18 });
      noise(0.6, { gain: 0.14, when: 0.35, f0: 1400, f1: 300, q: 0.8, pan: pan + 0.4, attack: 0.05 });
      tone(140, 0.8, { type: 'sawtooth', gain: 0.07, slide: 80, pan, attack: 0.2 });
    },
    flash() { noise(0.05, { gain: 0.25, type: 'highpass', f0: 3000 }); tone(2600, 0.07, { type: 'square', gain: 0.06 }); },
    beep(n) { tone(n ? 880 : 660, 0.12, { type: 'square', gain: 0.1 }); },
    tick(f = 1400) { tone(f, 0.025, { type: 'square', gain: 0.07 }); },
    thunk() { tone(110, 0.14, { type: 'sine', gain: 0.3, slide: 55 }); noise(0.08, { gain: 0.12, type: 'lowpass', f0: 700 }); },
    spin(dur = 1) { noise(dur, { gain: 0.1, type: 'bandpass', f0: 500, f1: 1200, q: 1.5, attack: 0.1 }); },
    ball() { tone(2400 + Math.random() * 800, 0.04, { type: 'triangle', gain: 0.1 }); },
    coin() { [1760, 2349, 3136].forEach((f, i) => tone(f, 0.9, { type: 'sine', gain: 0.12 / (i + 1), when: 0.01 })); noise(0.04, { gain: 0.15, type: 'highpass', f0: 4000 }); },
    roll() { for (let i = 0; i < 10; i++) tone(300 + Math.random() * 400, 0.04, { type: 'square', gain: 0.05, when: i * 0.07 }); },
    win(level = 1) { // level 1 μικρό … 3 μεγάλο
      const notes = [523, 659, 784, 1047, 1319, 1568];
      const n = 3 + level * 1;
      for (let i = 0; i < n; i++) tone(notes[i % notes.length] * (i >= 6 ? 2 : 1), 0.22 + level * 0.05, { type: 'triangle', gain: 0.2, when: i * (level >= 3 ? 0.07 : 0.1) });
      if (level >= 2) for (let i = 0; i < 8 * level; i++) tone(2000 + Math.random() * 2500, 0.06, { type: 'sine', gain: 0.07, when: 0.25 + i * 0.06 });
    },
    lose() { tone(330, 0.2, { type: 'triangle', gain: 0.14, slide: 247 }); tone(247, 0.3, { type: 'triangle', gain: 0.14, when: 0.18, slide: 196 }); },
    ding(n = 0) { tone(1046 + n * 220, 0.5, { type: 'sine', gain: 0.22 }); tone(2093 + n * 440, 0.4, { type: 'sine', gain: 0.08, when: 0.02 }); },
    coins() { for (let i = 0; i < 26; i++) tone(2400 + Math.random() * 2600, 0.12, { type: 'triangle', gain: 0.06, when: i * 0.085 }); [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.5, { type: 'triangle', gain: 0.16, when: i * 0.12 })); },
    fanfare() { [523, 523, 523, 659, 784, 659, 784, 1047].forEach((f, i) => tone(f, 0.28, { type: 'square', gain: 0.07, when: i * 0.13 })); noise(0.6, { gain: 0.08, f0: 3000, f1: 8000, type: 'bandpass', q: 0.7, when: 0.9 }); },
    bonus() { [784, 988, 1175, 1568].forEach((f, i) => tone(f, 0.25, { type: 'triangle', gain: 0.18, when: i * 0.09 })); },
  };
  return api;
})();
