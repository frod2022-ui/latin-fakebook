/* ===== Latin Fake Book — Band-in-a-Box .SGU/.MGU reader =====
   Runs entirely on the device. Written from the publicly documented reverse-engineering notes of the
   open-source JJazzLab (LGPL, BiabFileReader / Findings.txt) and MuseScore (GPL, importbb) importers.
   No code is copied from them; only the file-layout facts are used. */
(function (root) {
  'use strict';
  var ROOTS = [null, 'C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B', 'C#', 'D#', 'F#', 'G#', 'A#'];
  var ROOT_PC = [null, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 3, 6, 8, 10];
  var FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'], SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  // BIAB chord-type number -> chord suffix the app understands
  var T = {
    1: '', 2: '', 3: '(b5)', 4: 'aug', 5: '6', 6: 'maj7', 7: 'maj9', 8: 'maj9#11', 9: 'maj13#11', 10: 'maj13', 11: 'add9', 12: '+', 13: 'maj7#5', 14: '69', 15: '2',
    16: 'm', 17: 'm#5', 18: 'mMaj7', 19: 'm7', 20: 'm9', 21: 'm11', 22: 'm13', 23: 'm6', 24: 'm#5', 25: 'm7#5', 26: 'm69', 27: 'maj7#11', 28: 'maj7#11', 29: 'maj7b5',
    32: 'm7b5', 33: 'dim', 34: 'm9b5', 35: 'dim', 40: '5', 41: 'add9', 42: 'madd9', 56: '7#5', 57: '9#5', 58: '13#5', 60: '7#9',
    64: '7', 65: '13', 66: '7b13', 67: '7#11', 68: '13#11', 69: '7#11', 70: '9', 72: '9b13', 73: '9#11', 74: '13#11', 75: '9#11', 76: '7b9', 77: '13b9', 78: '7b9b13',
    79: '7b9#11', 80: '13b9#11', 81: '7b9#11', 82: '7#9', 83: '13#9', 84: '7#9b13', 85: '9#11', 86: '13#9', 87: '7#9#11', 88: '7b5', 89: '13b5', 90: '7alt', 91: '9b5',
    92: '9b5', 93: '7b5b9', 94: '13b9', 95: '7b5b9', 96: '7b5#9', 97: '13#9', 98: '7b5#9', 99: '7#5', 100: '13#5', 101: '7#5', 102: '13#5', 103: '9#5', 104: '9#5',
    105: '9#5', 106: '7#5b9', 107: '7#5b9', 108: '7#5b9', 109: '7#5#9', 110: '7#5#9', 111: '7#5#9', 112: '7#5#9', 113: '7alt',
    128: '7sus', 129: '13sus', 130: '7sus', 131: '7sus', 132: '13sus', 133: '7sus', 134: '9sus', 136: '9sus', 137: '9sus', 138: '13sus', 139: '9sus', 140: '7susb9',
    141: '13susb9', 142: '7susb9', 143: '7susb9', 144: '13susb9', 145: '7susb9', 146: '7sus', 147: '13sus', 148: '7sus', 149: '9sus', 150: '13sus', 151: '7sus',
    152: '7sus', 153: '13sus', 154: '7sus', 155: '9sus', 156: '9sus', 157: '7susb9', 158: '13susb9', 159: '7susb9', 160: '7sus', 161: '13sus', 162: '7sus',
    163: '7sus', 164: '13sus', 165: '7sus', 166: '13sus', 167: '9sus', 168: '9sus', 169: '7susb9', 170: '13susb9', 171: '7susb9', 172: '13susb9', 173: '7sus',
    174: '13sus', 175: '7sus', 176: '13sus', 177: 'sus4', 184: 'sus4'
  };
  function chordSuffix(t) {
    if (T[t] != null) return T[t];
    if (t < 32) return ''; if (t < 64) return 'm'; if (t < 128) return '7'; if (t < 192) return '7sus'; return '';
  }
  function chordName(type, base) {
    var r = base % 18, extra = Math.floor(base / 18); if (!r) return null;
    var name = ROOTS[r] + chordSuffix(type);
    if (extra) {
      var pc = (ROOT_PC[r] + extra) % 12, flat = /b/.test(ROOTS[r]) || r === 1 || r === 6;
      name += '/' + (flat ? FLAT : SHARP)[pc];
    }
    return name;
  }
  // BIAB key number: 1-17 = the major roots above, 18-34 = the same roots in minor
  function keyName(k) { if (k >= 1 && k <= 17) return ROOTS[k]; if (k >= 18 && k <= 34) return ROOTS[k - 17] + 'm'; return ''; }
  // the 24 built-in style families (used only when the .STY name gives no clue)
  var FAMILY = [null, 'Jazz Swing', 'Country 12/8', 'Country 4/4', 'Bossa Nova', 'Ethnic', 'Blues Shuffle', 'Blues Straight', 'Waltz', 'Pop Ballad', 'Rock Shuffle',
    'Lite Rock', 'Medium Rock', 'Heavy Rock', 'Miami Rock', 'Milly Pop', 'Funk', 'Jazz Waltz', 'Rhumba', 'Cha Cha', 'Bouncy', 'Irish', 'Pop Ballad 12/8', 'Country 12/8', 'Reggae'];
  var FAMILY_METER = { 2: '12/8', 8: '3/4', 17: '3/4', 22: '12/8', 23: '12/8' };

  function Reader(u8) { this.a = u8; this.i = 0; }
  Reader.prototype.u8 = function () { if (this.i >= this.a.length) throw new Error('the file ended early'); return this.a[this.i++]; };
  // run-length "suite": a non-zero byte is a value for the current index, 00 nn skips nn indexes
  Reader.prototype.suite = function (start, max, fn) {
    var idx = start;
    while (idx <= max) {
      var v = this.u8();
      if (v === 0) { var skip = this.u8(); if (!skip) throw new Error('bad data at byte ' + (this.i - 1)); idx += skip; }
      else { if (fn) fn(idx, v); idx++; }
    }
    return idx;
  };

  function latin1(a, s, n) { var t = ''; for (var k = 0; k < n; k++) t += String.fromCharCode(a[s + k]); return t; }

  function parse(buf, fileName) {
    var a = buf instanceof Uint8Array ? buf : new Uint8Array(buf), r = new Reader(a), out = { fileName: fileName || '', warnings: [] };
    var ver = r.u8(); out.version = ver;
    if (ver < 0x43 || ver > 0x49) throw new Error('this Band-in-a-Box file version (' + ver.toString(16) + ') is not supported');
    var tl = r.u8(); out.title = latin1(a, r.i, tl).replace(/\s+$/, ''); r.i += tl;
    r.suite(r.i, 0x3d);
    out.family = r.u8(); out.keyId = r.u8(); out.tempo = r.u8() + (r.u8() << 8);
    if (out.tempo < 20 || out.tempo > 500) { out.warnings.push('unusual tempo ' + out.tempo); out.tempo = Math.max(30, Math.min(300, out.tempo || 120)); }
    out.key = keyName(out.keyId);
    var startBar = r.u8(), markers = {};
    r.suite(startBar, 254, function (bar, v) { markers[bar - 1] = v; });
    out.markers = markers;
    var types = {}, bases = {};
    r.suite(0, 1019, function (k, v) { types[k] = v; });
    var next = r.suite(0, 1019, function (k, v) { bases[k] = v; });
    var hdr = [];
    r.suite(next - 1020, 8, function (k, v) { hdr[k] = v; });
    out.chorusStart = hdr[1] || 1; out.chorusEnd = hdr[2] || 0; out.repeats = hdr[3] || 1;
    out.tagJump = !!hdr[5]; out.tagAfter = hdr[6] || 0; out.tagBegin = hdr[7] || 0; out.tagEnd = hdr[8] || 0;
    var slots = [];
    Object.keys(types).forEach(function (k) {
      var nm = bases[k] ? chordName(types[k], bases[k]) : null;
      if (nm) slots.push({ slot: +k, name: nm });
    });
    slots.sort(function (x, y) { return x.slot - y.slot; });
    out.slots = slots;
    // style file name: "<len>NAME.STY" somewhere after the chord data
    out.style = '';
    var from = r.i;
    for (var p = from; p < a.length - 4; p++) {
      if (a[p] === 0x2e && (a[p + 1] | 32) === 0x73 && (a[p + 2] | 32) === 0x74 && (a[p + 3] | 32) === 0x79) {
        for (var L = 1; L <= 40 && p + 4 - L - 1 >= from; L++) if (a[p + 4 - L - 1] === L) { out.style = latin1(a, p + 4 - L, L); out.styleEnd = p + 4; break; }
        if (out.style) break;
      }
    }
    if (!out.style && FAMILY[out.family]) out.style = FAMILY[out.family];
    out.melody = readMelody(a, out);
    return out;
  }

  // melody track (.MGU): 12-byte events, table location in the last 4 bytes (start, count, little-endian 16-bit)
  function readMelody(a, out) {
    var n = a.length; if (n < 20) return [];
    var start = a[n - 4] | (a[n - 3] << 8), count = a[n - 2] | (a[n - 1] << 8);
    // files over 64 KB: the table start wraps; find the 64 KB page that makes the table end just before the trailer
    if (count) {
      var want = n - 4 - count * 12;
      if (want >= 0 && (want & 0xffff) === start) start = want;
      else if (start + count * 12 > n - 4) { out.warnings.push('melody table out of range'); return []; }
    }
    var notes = [], lastLen = 0;
    for (var k = 0, i = start; k < count; k++, i += 12) {
      var type = a[i + 4] & 0xf0;
      if (type === 0) break;
      if (type !== 0x90) continue;
      var tick = (a[i] | (a[i + 1] << 8) | (a[i + 2] << 16)) + a[i + 3] * 16777216;
      var len = (a[i + 8] | (a[i + 9] << 8) | (a[i + 10] << 16)) + a[i + 11] * 16777216;
      if (!a[i + 6]) continue;
      if (!len) len = lastLen; if (!len) continue; lastLen = len;
      notes.push({ tick: tick, pitch: a[i + 5], vel: a[i + 6], ch: a[i + 7], len: len });
    }
    return notes;
  }

  /* ---------- style mapping ---------- */
  var MAP = [
    [/bossa|bosa|jobim|ipanema|_?bos\d|brazil.*ballad/i, 'bossa'],
    [/samba|sambo|partido|batucada|pagode|baiao|baião|frevo|_sam/i, 'samba'],
    [/cha.?cha|chacha|chasal|_cha/i, 'chacha'],
    [/mambo|_mam/i, 'mambo'],
    [/merengue|mereng|_mer|bachat/i, 'merengue'],
    [/cumbia|cumb|vallenato|_cmb/i, 'cumbia'],
    [/tango|milonga|_tng/i, 'tango'],
    [/bolero|bolro|_bol|beguine|ballad.*latin|latin.*ballad/i, 'bolero'],
    [/rumba|rhumba|guaguanc|_rmb/i, 'rumba'],
    [/salsa|son.?mont|montuno|timba|songo|guajira|_sal|latjaz|latin.?jazz|afro.?cub|cubop|descarga/i, 'salsa'],
    [/habanera|danz[oó]n|_hab/i, 'habanera'],
    [/6.?8|12.?8|bembe|nanigo|afro/i, 'afro68'],
    [/waltz|walz|wlz|vals|ranchera|mazurka|_wz|3.?4/i, 'vals'],
    [/latin|lat\d|calypso|soca|reggae|ska|zouk|rhumba|tropical|caribbean/i, 'salsa']
  ];
  function mapStyle(name, meter, family) {
    var s = String(name || '').replace(/\.sty$/i, '');
    for (var k = 0; k < MAP.length; k++) if (MAP[k][0].test(s)) return { id: MAP[k][1], exact: k < MAP.length - 1 };
    var fam = { 4: 'bossa', 8: 'vals', 17: 'vals', 18: 'rumba', 19: 'chacha', 24: 'salsa' }[family];
    if (fam) return { id: fam, exact: false };
    if (meter === '3/4') return { id: 'vals', exact: false };
    if (meter === '12/8') return { id: 'bolero', exact: false };
    return { id: 'bolero', exact: false };
  }
  function guessMeter(info) {
    var nm = (info.style + ' ' + info.title).toLowerCase();
    if (/waltz|walz|wlz|vals|mazurka|jzwz|jazwal|_wz|3.?4|\bwz\b/.test(nm)) return '3/4';
    if (/12.?8|6.?8/.test(nm)) return '12/8';
    if (FAMILY_METER[info.family] && !info.styleFromFile) return FAMILY_METER[info.family];
    // no chord ever on the 4th slot, and melody notes repeat every 3 beats: a 3/4 song
    var s4 = info.slots.filter(function (s) { return s.slot % 4 === 3; }).length;
    if (!s4 && info.melody.length > 10) {
      var sc = function (bpb) { var hit = 0, tot = 0; info.slots.forEach(function (s) { var k = s.slot % 4; if (k >= bpb) return; var t = ((Math.floor(s.slot / 4) + 2) * bpb + k) * 120; tot++; if (info.melody.some(function (n) { return Math.abs(n.tick - t) <= 20; })) hit++; }); return tot ? hit / tot : 0; };
      var s3 = sc(3), s4b = sc(4);
      if (s3 >= 0.6 && s3 - s4b >= 0.2) return '3/4';
    }
    return '4/4';
  }

  /* ---------- melody -> ABC ---------- */
  var SCALE_SIG = { C: 0, G: 1, D: 2, A: 3, E: 4, B: 5, 'F#': 6, 'C#': 7, F: -1, Bb: -2, Eb: -3, Ab: -4, Db: -5, Gb: -6, Cb: -7 };
  var REL_MAJ = { Cm: 'Eb', 'C#m': 'E', Dbm: 'E', Dm: 'F', 'D#m': 'F#', Ebm: 'Gb', Em: 'G', Fm: 'Ab', 'F#m': 'A', Gbm: 'A', Gm: 'Bb', 'G#m': 'B', Abm: 'B', Am: 'C', 'A#m': 'C#', Bbm: 'Db', Bm: 'D' };
  var LET = ['C', 'D', 'E', 'F', 'G', 'A', 'B'], LET_PC = [0, 2, 4, 5, 7, 9, 11];
  function keySig(key) { var maj = /m$/.test(key) ? REL_MAJ[key] : key; var f = SCALE_SIG[maj]; return f == null ? 0 : f; }
  function sigAcc(fifths) { // accidental per letter index
    var acc = [0, 0, 0, 0, 0, 0, 0], sh = [3, 0, 4, 1, 5, 2, 6], fl = [6, 2, 5, 1, 4, 0, 3];
    for (var k = 0; k < Math.abs(fifths); k++) acc[(fifths > 0 ? sh : fl)[k]] = fifths > 0 ? 1 : -1;
    return acc;
  }
  function spell(midi, fifths, acc) {
    var pc = midi % 12, cands = [];
    for (var l = 0; l < 7; l++) for (var d = -1; d <= 1; d++) if ((LET_PC[l] + d + 12) % 12 === pc) cands.push({ l: l, d: d });
    cands.sort(function (x, y) {
      var sx = (x.d === acc[x.l] ? 0 : x.d === 0 ? 1 : (fifths >= 0 ? x.d < 0 : x.d > 0) ? 3 : 2), sy = (y.d === acc[y.l] ? 0 : y.d === 0 ? 1 : (fifths >= 0 ? y.d < 0 : y.d > 0) ? 3 : 2);
      return sx - sy;
    });
    var c = cands[0], oct = Math.floor((midi - c.d) / 12) - 1; // octave of the letter
    if (LET_PC[c.l] + c.d < 0) oct = Math.floor((midi + 1) / 12) - 1;
    if (LET_PC[c.l] + c.d > 11) oct = Math.floor((midi - 1) / 12) - 1;
    return { l: c.l, d: c.d, oct: oct };
  }
  function abcPitch(sp) {
    var ch = LET[sp.l], s;
    if (sp.oct >= 5) { s = ch.toLowerCase(); for (var k = 5; k < sp.oct; k++) s += "'"; }
    else { s = ch; for (var j = sp.oct; j < 4; j++) s += ','; }
    return s;
  }
  var OK_LEN = [16, 12, 8, 6, 4, 3, 2, 1];
  function splitLen(n) { var out = []; while (n > 0) { for (var k = 0; k < OK_LEN.length; k++) if (OK_LEN[k] <= n) { out.push(OK_LEN[k]); n -= OK_LEN[k]; break; } } return out; }
  function lenTxt(n) { return n === 1 ? '' : String(n); }

  // returns ABC text (L:1/16) for bars [0, nBars) and an optional pickup taken from the lead-in bar
  function melodyABC(info, meter, nBars, key, opts) {
    var notes = info.melody; if (!notes.length) return '';
    var chs = {}; notes.forEach(function (n) { chs[n.ch] = (chs[n.ch] || 0) + 1; });
    var ch = +Object.keys(chs).sort(function (x, y) { return chs[y] - chs[x]; })[0];
    var bpb = meter === '3/4' ? 3 : meter === '12/8' ? 6 : 4; // quarter beats per bar
    var leadTicks = 2 * bpb * 120; // melody events are stored with BIAB's two-bar lead-in
    var G = 30, barG = bpb * 4; // 16th-note grid
    var swing = !!(opts && opts.swing), Q = swing ? 2 : 1; // swung styles: onsets snap to 8ths
    var mel = notes.filter(function (n) { return n.ch === ch; }).map(function (n) {
      var on = Math.round((n.tick - leadTicks) / G / Q) * Q, off = Math.round((n.tick - leadTicks + n.len) / G / Q) * Q;
      return { on: on, off: Math.max(on + Q, off), p: n.pitch };
    }).filter(function (n) { return n.on < nBars * barG; });
    if (!mel.length) return '';
    mel.sort(function (x, y) { return x.on - y.on || y.p - x.p; });
    // one voice: keep the top note of anything starting together, cut overlaps
    var mono = [];
    mel.forEach(function (n) { var last = mono[mono.length - 1]; if (last && last.on === n.on) return; if (last && last.off > n.on) last.off = n.on; mono.push(n); });
    mono.forEach(function (n, i) {
      var nx = mono[i + 1];
      // short gaps (a detached or swung note) read better as one held note in a fake book
      if (nx && nx.on > n.off && nx.on - n.off <= 2 && nx.on - n.off < n.off - n.on + 1) n.off = nx.on;
      if (n.off > nBars * barG) n.off = nBars * barG;
    });
    var pick = 0;
    if (mono[0].on < 0) { mono = mono.filter(function (n) { return n.on >= -barG; }); pick = -mono[0].on; if (pick >= barG) pick = 0; if (!pick) mono = mono.filter(function (n) { return n.on >= 0; }); }
    if (!mono.length) return '';
    var fifths = keySig(key), sig = sigAcc(fifths);
    var t0 = -pick, body = '', barAcc = {}, barNo = pick ? -1 : 0, posInBar = 0, barLen = pick || barG, barsOnLine = 0;
    function emit(pitchSp, len, tieOut) {
      // split a note at the bar line
      while (len > 0) {
        var room = barLen - posInBar, take = Math.min(len, room), parts = splitLen(take);
        parts.forEach(function (pl, k) {
          var txt;
          if (!pitchSp) txt = 'z' + lenTxt(pl);
          else {
            var keyk = pitchSp.l + ':' + pitchSp.oct, cur = barAcc[keyk] != null ? barAcc[keyk] : sig[pitchSp.l], pre = '';
            if (cur !== pitchSp.d) { pre = pitchSp.d === 1 ? '^' : pitchSp.d === -1 ? '_' : '='; barAcc[keyk] = pitchSp.d; }
            txt = pre + abcPitch(pitchSp) + lenTxt(pl);
            var more = (k < parts.length - 1) || (len - take > 0) || tieOut;
            if (more) txt += '-';
          }
          body += txt + ' ';
        });
        posInBar += take; len -= take;
        if (posInBar >= barLen) { barNo++; body += '| '; barsOnLine++; if (barsOnLine >= 4) { body += '\n'; barsOnLine = 0; } barAcc = {}; posInBar = 0; barLen = barG; }
      }
    }
    var t = t0;
    mono.forEach(function (n) {
      if (n.on > t) emit(null, n.on - t);
      emit(spell(n.p, fifths, sig), n.off - n.on);
      t = n.off;
    });
    if (t < nBars * barG) emit(null, nBars * barG - t);
    var M = meter === '12/8' ? '12/8' : meter;
    return 'X:1\nT:' + info.title + '\nM:' + M + '\nL:1/16\nK:' + (key || 'C') + '\n' + body.replace(/\|\s*$/, '|]') + '\n';
  }

  /* ---------- whole song -> Latin Fake Book song ---------- */
  function styleKey(name) { return String(name || '').toUpperCase().replace(/\.STY$/, '').trim(); }
  function toSong(info, opts) {
    opts = opts || {};
    var meter = opts.styleMeter || guessMeter(info);
    var slotsPerBar = meter === '3/4' ? 3 : 4;
    var lastSlot = info.slots.length ? info.slots[info.slots.length - 1].slot : -1;
    var lastBarWithChord = Math.floor(lastSlot / 4) + 1; // 1-based
    var end = info.chorusEnd && info.chorusEnd >= info.chorusStart ? info.chorusEnd : lastBarWithChord;
    if (info.tagJump && info.tagEnd > end) end = info.tagEnd;
    if (end < 1) throw new Error('no chords were found');
    // chords per bar (bars are 1-based in BIAB, slot/4 is 0-based)
    var bySlot = {}; info.slots.forEach(function (s) { bySlot[s.slot] = s.name; });
    var lines = [], line = [], cur = null, lastLabel = null;
    var label = function (b) {
      if (b === 1 && info.chorusStart > 1) return 'Intro';
      if (b === info.chorusStart && info.chorusStart > 1) return 'Chorus';
      if (info.tagJump && b === info.tagBegin && info.tagBegin > info.chorusEnd) return 'Coda';
      var m = info.markers[b - 1]; if (m && b > 1) return m === 1 ? 'A' : m === 2 ? 'B' : null;
      return null;
    };
    for (var b = 1; b <= end; b++) {
      var lab = label(b);
      if (lab && line.length) { lines.push(line); line = []; }
      var cells = [], any = false;
      for (var s = 0; s < slotsPerBar; s++) { var nm = bySlot[(b - 1) * 4 + s]; if (nm && (nm !== cur || s === 0)) { cells.push(nm); any = true; cur = nm; } else cells.push(s === 0 ? (cur || 'N.C.') : '/'); }
      var txt = cells.every(function (c, k) { return k === 0 || c === '/'; }) ? cells[0] : cells.join(' ');
      if (txt === 'N.C.') txt = '%'; 
      line.push({ txt: txt, lab: lab });
      if (line.length === 4) { lines.push(line); line = []; }
    }
    if (line.length) lines.push(line);
    // the first bars before any chord: use the first chord
    var first = info.slots.length ? info.slots[0].name : 'C';
    var chart = lines.map(function (ln, li) {
      var lab = ln[0].lab;
      return (lab ? '[' + lab + '] ' : '') + '| ' + ln.map(function (c) { return c.txt === '%' && li === 0 && ln.indexOf(c) === 0 ? first : c.txt; }).join(' | ') + ' |';
    }).join('\n');
    var parts = '', curP = 'a';
    for (var pb = 1; pb <= end; pb++) { var mk = info.markers[pb - 1]; if (mk === 1) curP = 'a'; else if (mk === 2) curP = 'b'; parts += curP; }
    var map = mapStyle(info.style + ' ' + (opts.styleDesc || ''), meter, info.family);
    var key = info.key || '';
    var abc = '';
    try { abc = melodyABC(info, meter, end, key, { swing: opts.swing }); } catch (e) { info.warnings.push('melody skipped: ' + e.message); }
    var rel = (opts.path || info.fileName || '').replace(/^.*Band-in-a-Box\//, '');
    return {
      id: 'bib-' + (opts.idSeed || hash(rel + '|' + info.title)),
      title: info.title || (info.fileName || 'Song').replace(/\.[^.]+$/, ''),
      style: map.id, meter: meter, key: key, tempo: info.tempo, clave: '', credit: '',
      chart: chart, abc: abc, bib: { file: rel, style: info.style, styleKey: styleKey(info.style), parts: parts, meterFrom: opts.styleMeter ? 'style' : 'guess', choruses: info.repeats, chorusStart: info.chorusStart, chorusEnd: info.chorusEnd, exact: map.exact },
      section: 'My Band-in-a-Box',
      source: 'Band-in-a-Box file ' + (rel || info.fileName) + ' (style ' + (info.style || '?') + ', ' + info.repeats + ' chorus' + (info.repeats === 1 ? '' : 'es') + ' in BIAB' + (info.chorusStart > 1 ? ', chorus bars ' + info.chorusStart + '–' + info.chorusEnd : '') + ')'
    };
  }
  function hash(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); }

  var api = { styleKey: styleKey, parse: parse, toSong: toSong, mapStyle: mapStyle, chordName: chordName, keyName: keyName, guessMeter: guessMeter, melodyABC: melodyABC, isBiabName: function (n) { return /\.(sgu|mgu|sg\d|mg\d)$/i.test(n) && !/^\._/.test(n.split('/').pop()); } };
  root.LFBiab = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : this);
