'use strict';
/*
 * Provably fair RNG.
 *  - Ο server κρατά ένα server seed (μυστικό) και δείχνει στον παίκτη μόνο το SHA-256 hash του.
 *  - Κάθε γύρος: stream = HMAC-SHA256(key = serverSeed, msg = `${clientSeed}:${nonce}:${block}`)
 *  - Οι ακέραιοι βγαίνουν με rejection sampling → καμία μεροληψία (modulo bias).
 *  - Όταν ο παίκτης αλλάξει seed, αποκαλύπτεται το παλιό και ελέγχει τα πάντα εκ των υστέρων.
 */
const crypto = require('crypto');

class Stream {
  constructor(serverSeed, clientSeed, nonce) {
    this.key = serverSeed;
    this.msg = `${clientSeed}:${nonce}`;
    this.block = 0;
    this.buf = Buffer.alloc(0);
    this.pos = 0;
  }
  _fill() {
    this.buf = crypto.createHmac('sha256', this.key).update(`${this.msg}:${this.block++}`).digest();
    this.pos = 0;
  }
  byte() {
    if (this.pos >= this.buf.length) this._fill();
    return this.buf[this.pos++];
  }
  u32() {
    return this.byte() * 16777216 + (this.byte() << 16) + (this.byte() << 8) + this.byte();
  }
  /** Ομοιόμορφος ακέραιος στο [0, n) */
  int(n) {
    if (!Number.isInteger(n) || n < 1 || n > 4294967296) throw new Error('bad range');
    if (n <= 256) {
      const lim = Math.floor(256 / n) * n;
      for (;;) { const b = this.byte(); if (b < lim) return b % n; }
    }
    const lim = Math.floor(4294967296 / n) * n;
    for (;;) { const v = this.u32(); if (v < lim) return v % n; }
  }
}

const newSeed = () => crypto.randomBytes(32).toString('hex');
const hashSeed = (s) => crypto.createHash('sha256').update(s).digest('hex');

module.exports = { Stream, newSeed, hashSeed };
