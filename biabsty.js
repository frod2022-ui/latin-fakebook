/* ===== Latin Fake Book — Band-in-a-Box .STY style reader + player =====
   Reads the MIDI patterns from a BIAB style on the device and turns them into the app's own JSON style:
   bass / piano / guitar patterns for each substyle (a, b) and chord length (1, 2, 4 or 8 beats), and the drum
   patterns that are stored as MIDI events. The file layout was worked out by inspecting the user's own files
   (zero-run compression, 1 KB pattern slots, MPU-401-style event streams, pattern lists per instrument).
   Drum patterns stored in BIAB's "drum grid" form are not decoded; those styles use the app's own percussion. */
(function (root) {
  'use strict';
  var H = root.LFChords || (typeof require !== 'undefined' ? require('./chords.js') : null);
  function inflate(a) { // 00 nn = nn zero bytes
    var n = 0, i;
    for (i = 0; i < a.length; i++) { if (a[i] === 0 && i + 1 < a.length) { n += a[i + 1]; i++; } else n++; }
    var o = new Uint8Array(n), p = 0;
    for (i = 0; i < a.length; i++) { if (a[i] === 0 && i + 1 < a.length) { p += a[i + 1]; i++; } else o[p++] = a[i]; }
    return o;
  }
  var SLOT = 1024;
  // block numbers (60-byte lists of 30 slot numbers each, starting at byte 0x3a + 60*block)
  var LAYOUT = {
    drums: { a: 1, b: 2, fa: 3, fb: 4 },
    bass: 5, piano: 14, guitar: 23, strings: 32
  };
  var CLASSES = [8, 4, 2, 1]; // per substyle, then the 9th block holds endings
  function readEvents(s) {
    var kind = s[2], p = kind === 0xb0 ? 16 : kind === 0xc0 ? 20 : -1;
    if (p < 0) return null;
    var t = 0, status = 0x90, notes = [], open = {}, guard = 0, end = 0, sustain = [];
    while (p < SLOT && guard++ < 4000) {
      var b = s[p];
      if (b === 0xf8) { t += 240; p++; continue; }
      if (b >= 0xf0) break;
      t += b; p++;
      if (p >= SLOT) break;
      var d = s[p];
      if (d >= 0x80) {
        if (d === 0xf9 || d === 0xfc) { end = t; break; }
        if (d >= 0xf0) { p++; continue; }
        status = d; p++;
      }
      var hi = status & 0xf0;
      if (hi === 0x90 || hi === 0x80) {
        var note = s[p], vel = s[p + 1]; p += 2;
        if (hi === 0x80) vel = 0;
        if (vel) { if (open[note]) close(note); open[note] = { t: t, v: vel }; }
        else if (open[note]) close(note);
      } else if (hi === 0xb0 || hi === 0xe0 || hi === 0xa0) { if (hi === 0xb0 && s[p] === 64) sustain.push([t, s[p + 1]]); p += 2; }
      else if (hi === 0xc0 || hi === 0xd0) p += 1;
      else break;
      end = t;
    }
    function close(n) { var o = open[n]; notes.push([o.t, Math.max(10, t - o.t), n, o.v]); delete open[n]; }
    Object.keys(open).forEach(function (n) { close(+n); });
    notes.sort(function (x, y) { return x[0] - y[0] || x[2] - y[2]; });
    return { notes: notes, end: end };
  }
  function list(o, block) { var st = 0x3a + block * 60, out = []; for (var i = 0; i < 30; i++) { var w = o[st + 2 * i] | (o[st + 2 * i + 1] << 8); out.push(w); } return out; }
  function weight(o, block, pos) { var v = o[0x9b8 + block * 30 + pos]; return v == null ? 5 : v; }
  function latin1(a, s, n) { var t = ''; for (var k = 0; k < n; k++) t += String.fromCharCode(a[s + k]); return t; }

  function parse(buf, fileName) {
    var raw = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    if (raw[0] !== 0xd4 || raw[1] !== 0x30) throw new Error('not a Band-in-a-Box MIDI style (.STY)');
    var o = inflate(raw), first = 0x30d4;
    if (o.length < first + SLOT || o[first] !== 0xd0) throw new Error('style layout not recognised');
    var nSlots = Math.floor((o.length - first) / SLOT);
    var dl = o[9], desc = dl && dl < 120 ? latin1(o, 10, dl).replace(/\s+$/, '') : '';
    var cache = {};
    function slot(w) {
      if (!w || w >= nSlots) return null;
      if (cache[w] !== undefined) return cache[w];
      var s = o.subarray(first + w * SLOT, first + (w + 1) * SLOT);
      if (s[0] !== 0xd0 || s[1] !== 0xe0) return (cache[w] = null);
      var ev = readEvents(s);
      cache[w] = ev && ev.notes.length ? ev : (s[2] === 0xd0 ? { grid: true } : null);
      return cache[w];
    }
    var style = { file: fileName || '', desc: desc, tempo: o[0x5a] | (o[0x5b] << 8), swing: !!o[0x5c], parts: {}, gridDrums: false };
    // meter from the length of the 2-bar slots
    var lens = {};
    for (var w = 1; w < Math.min(nSlots, 400); w++) { var s = o.subarray(first + w * SLOT, first + (w + 1) * SLOT); if (s[2] !== 0xb0 && s[2] !== 0xc0) continue; var e = readEvents(s); if (e && e.end) lens[e.end] = (lens[e.end] || 0) + 1; }
    var top = Object.keys(lens).sort(function (x, y) { return lens[y] - lens[x]; })[0];
    style.meterKnown = !!top;
    style.meter = +top === 720 ? '3/4' : +top === 1440 ? '12/8' : '4/4';
    style.barTicks = +top === 720 ? 360 : +top === 1440 ? 720 : 480;
    ['bass', 'piano', 'guitar', 'strings'].forEach(function (inst) {
      var b0 = LAYOUT[inst], part = { a: {}, b: {}, end: [] }, any = false;
      ['a', 'b'].forEach(function (sub, si) {
        CLASSES.forEach(function (cls, ci) {
          var blk = b0 + si * 4 + ci, ws = list(o, blk), pats = [];
          ws.forEach(function (w, pos) { var ev = slot(w); if (ev && ev.notes) { var wt = weight(o, blk, pos); if (wt > 0) pats.push({ w: wt, n: trim(ev.notes, cls) }); } });
          if (pats.length) { part[sub][cls] = pats; any = true; }
        });
      });
      list(o, b0 + 8).forEach(function (w) { var ev = slot(w); if (ev && ev.notes) part.end.push({ w: 5, n: ev.notes }); });
      if (any) style.parts[inst] = part;
    });
    var dr = { a: [], b: [], fa: [], fb: [] }, anyD = false, grid = 0;
    Object.keys(LAYOUT.drums).forEach(function (k) {
      var blk = LAYOUT.drums[k];
      list(o, blk).forEach(function (w, pos) { var ev = slot(w); if (!ev) return; if (ev.grid) { grid++; return; } var wt = weight(o, blk, pos); if (wt > 0) { dr[k].push({ w: wt, n: ev.notes }); anyD = true; } });
    });
    if (anyD) style.parts.drums = dr;
    style.gridDrums = grid > 0 && !anyD;
    return style;
  }
  function trim(notes, cls) { return notes; }

  /* ---------- playing a style over the song's chords ---------- */
  function rng(seed) { var x = seed >>> 0 || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
  function pick(list, r) { var tot = 0; list.forEach(function (p) { tot += p.w; }); var v = r() * tot; for (var i = 0; i < list.length; i++) { v -= list[i].w; if (v <= 0) return list[i]; } return list[list.length - 1]; }
  // where a note written over C7 goes on another chord
  function mapper(c) {
    var iv = c.intervals || [0, 4, 7], has = function (x) { return iv.indexOf(x) >= 0 || iv.indexOf(x + 12) >= 0; };
    var third = c.third != null ? c.third : has(3) ? 3 : has(4) ? 4 : has(5) ? 5 : has(2) ? 2 : 4;
    var fifth = has(7) ? 7 : has(6) ? 6 : has(8) ? 8 : 7;
    var seventh = c.seventh != null ? c.seventh : has(10) ? 10 : has(11) ? 11 : has(9) ? 9 : 12;
    if (seventh === 9 && third === 3 && fifth === 6) seventh = 9; // dim7
    var ninth = has(1) ? 1 : has(3) && third !== 3 ? 3 : 2;
    var thirteenth = has(8) && fifth !== 8 ? 8 : 9;
    var m = {}; m[0] = 0; m[4] = third; m[7] = fifth; m[10] = seventh; m[2] = ninth; m[9] = thirteenth; m[5] = third === 5 ? 5 : third === 3 ? 5 : 5;
    if (seventh === 12 && thirteenth === 9 && !has(9)) m[10] = has(9) ? 9 : 12;
    [1, 3, 6, 8, 11].forEach(function (i) { var lo = m[i - 1], hi = m[(i + 1) % 12] + (i === 11 ? 12 : 0); m[i] = lo + 1 < hi ? lo + 1 : hi - 1; });
    return m;
  }
  function transpose(p, c, m, low, high, isBass, isRootNote) {
    var pc = ((p % 12) + 12) % 12, oct = p - pc, to = oct + m[pc];
    var shift = c.root; if (shift > 6) shift -= 12; // move -5..+6 semitones like BIAB
    var out = to + shift;
    if (isBass && pc === 0 && c.bass != null && c.bass !== c.root) { var d = ((c.bass - c.root) % 12 + 12) % 12; if (d > 6) d -= 12; out += d; }
    while (out < low) out += 12; while (out > high) out -= 12;
    return out;
  }
  var GM = { 35: ['drums', 'kick'], 36: ['drums', 'kick'], 37: ['rim', 'rim'], 38: ['rim', 'rim'], 40: ['rim', 'rim'], 39: ['rim', 'rim'], 42: ['shaker', 'shaker'], 44: ['shaker', 'shaker'], 46: ['shaker', 'shakerAcc'],
    54: ['shaker', 'shaker'], 69: ['shaker', 'shaker'], 70: ['shaker', 'shakerAcc'], 82: ['shaker', 'shaker'], 56: ['cowbell', 'bell'], 51: ['cowbell', 'bell'], 53: ['cowbell', 'bellHi'], 59: ['cowbell', 'bell'],
    60: ['bongos', 'bongoHi'], 61: ['bongos', 'bongoLo'], 62: ['congas', 'congaSlap'], 63: ['congas', 'congaOpen'], 64: ['congas', 'tumbaOpen'], 65: ['timbales', 'timbalHi'], 66: ['timbales', 'timbalLo'],
    75: ['clave', 'clave'], 76: ['rim', 'rim'], 77: ['rim', 'rim'], 73: ['guiro', 'guiroShort'], 74: ['guiro', 'guiroLong'], 41: ['drums', 'surdoMute'], 43: ['drums', 'surdoMute'], 45: ['drums', 'surdoOpen'], 47: ['drums', 'tamboraOpen'], 48: ['drums', 'tamboraRim'], 50: ['drums', 'tamboraRim'] };
  var RANGE = { bass: [28, 55], piano: [43, 88], guitar: [40, 84], strings: [48, 88] };

  // bar k of the song -> events in the app's format (t, dur in quarter notes inside the bar)
  function generateBar(tl, sty, k, opt) {
    opt = opt || {};
    var state = opt.state || (opt.state = {}), out = [], barQ = tl.barQ, T = 120;
    var sub = (opt.parts && opt.parts[k]) || 'a';
    var bStart = tl.pickup + k * barQ, r = rng(((opt.seed || 7) * 7919 + k * 104729) >>> 0);
    if (k < 0 || k >= tl.nb) return out;
    // chord segments in this bar, from the (transposed) chord timeline
    function segsOf(kk) {
      var b0 = tl.pickup + kk * barQ, b1 = b0 + barQ, ev = tl.chordEvents || [], res = [], cur = null;
      for (var i = 0; i < ev.length; i++) { if (ev[i].t <= b0 + 1e-6) cur = ev[i]; else if (ev[i].t < b1 - 1e-6) { if (cur) res.push({ st: Math.max(0, cur.t - b0), sym: cur.sym, c: cur.c }); cur = ev[i]; } }
      if (cur) res.push({ st: Math.max(0, cur.t - b0), sym: cur.sym, c: cur.c });
      res.forEach(function (r, i) { r.en = i + 1 < res.length ? res[i + 1].st : barQ; if (!r.c) r.c = H.parseChord(r.sym); });
      return res.filter(function (r) { return r.c && !r.c.nc && r.en - r.st > 1e-6; });
    }
    var segs = segsOf(k);
    var lastBar = opt.ending && k === tl.nb - 1;
    // carried second half of a 2-bar pattern
    var carry = state.carry && state.carry.bar === k ? state.carry : null; state.carry = null;
    ['bass', 'piano', 'guitar', 'strings'].forEach(function (inst) {
      var part = sty.parts[inst]; if (!part) return;
      if (inst === 'strings') return; // no string samples in the app
      if (inst === 'guitar' && sty.parts.piano && !opt.guitarToo) return;
      var lib = part[sub] && Object.keys(part[sub]).length ? part[sub] : part.a;
      var low = RANGE[inst][0], high = RANGE[inst][1], appPart = inst === 'bass' ? 'bass' : 'piano';
      function emit(pat, c, segStart, segLen, offset) {
        var m = mapper(c);
        pat.n.forEach(function (n) {
          var t = n[0] / T - offset;
          if (t < -1e-6 || t >= segLen - 1e-6) return;
          var dur = Math.min(n[1] / T, segLen - t + (inst === 'bass' ? 0 : 0.5));
          var midi = transpose(n[2], c, m, low, high, inst === 'bass');
          out.push({ part: appPart, t: segStart + t, dur: Math.max(0.08, dur), vel: Math.min(1, n[3] / 110), midi: [midi], instr: inst, raw: 1 });
        });
      }
      if (carry && carry[inst]) {
        var cc = carry[inst];
        if (segs.length && segs[0].st < 1e-6 && segs[0].c.sym === cc.c.sym) { emit(cc.pat, segs[0].c, 0, segs.length === 1 ? barQ : segs[1].st, barQ); segs.forEach(function (sg, i) { if (i) fill(sg); }); return; }
      }
      segs.forEach(fill);
      function fill(sg) {
        var len = sg.en - sg.st;
        if (lastBar && sg.st < 1e-6) { // ending: one long chord
          var m = mapper(sg.c), base = inst === 'bass' ? [36] : [52, 55, 58, 64];
          base.forEach(function (p) { out.push({ part: appPart, t: 0, dur: barQ, vel: 0.8, midi: [transpose(p, sg.c, m, low, high, inst === 'bass')], instr: inst, raw: 1 }); });
          return;
        }
        // whole bar chord that also fills the next bar: 2-bar (8-beat) pattern
        var nsg = k + 1 < tl.nb ? segsOf(k + 1) : [], whole = sg.st < 1e-6 && len >= barQ - 1e-6;
        if (whole && lib[8] && nsg.length === 1 && nsg[0].st < 1e-6 && nsg[0].c.sym === sg.c.sym && !(opt.ending && k + 1 === tl.nb - 1) && state['two' + inst] !== k - 1) {
          var p8 = pick(lib[8], r); emit(p8, sg.c, 0, barQ, 0);
          state.carry = state.carry || { bar: k + 1 }; state.carry[inst] = { pat: p8, c: sg.c }; state['two' + inst] = k;
          return;
        }
        var t = sg.st;
        while (t < sg.en - 1e-6) {
          var left = sg.en - t, cls = left >= barQ - 1e-6 && lib[4] ? 4 : left >= 2 - 1e-6 && lib[2] ? 2 : lib[1] ? 1 : lib[2] ? 2 : 4;
          var list = lib[cls] || lib[4] || lib[8]; if (!list) return;
          var take = Math.min(left, cls === 4 ? barQ : cls);
          emit(pick(list, r), sg.c, t, take, 0);
          t += take;
        }
      }
    });
    // drums
    var dr = sty.parts.drums;
    if (dr && !lastBar) {
      var dl = (sub === 'b' && dr.b.length ? dr.b : dr.a);
      var fills = sub === 'b' && dr.fb.length ? dr.fb : dr.fa;
      var nextSub = (opt.parts && opt.parts[k + 1]) || sub, fillBar = fills.length && (k + 1 < tl.nb) && (nextSub !== sub || (k + 1) % 8 === 0) && k % 2 === 1;
      if (!dl.length) dl = dr.a;
      if (dl.length) {
        var half = k % 2, key = 'drum' + (k - half);
        if (!half || !state[key]) state[key] = pick(dl, r);
        var dp = fillBar ? (state.fill = pick(fills, r)) : state[key];
        var off = (fillBar ? 1 : half) * barQ;
        dp.n.forEach(function (n) {
          var t = n[0] / T - off; if (t < -1e-6 || t >= barQ - 1e-6) return;
          var g = GM[n[2]]; if (!g) return;
          out.push({ part: g[0], t: t, dur: 0.2, vel: Math.min(1, n[3] / 110), sound: g[1] });
        });
      }
    }
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }
  function partsUsed(sty) { var u = { piano: !!(sty.parts.piano || sty.parts.guitar), bass: !!sty.parts.bass }; var dr = sty.parts.drums; if (dr) [].concat(dr.a, dr.b).forEach(function (p) { p.n.forEach(function (n) { var g = GM[n[2]]; if (g) u[g[0]] = true; }); }); return u; }
  var api = { parse: parse, generateBar: generateBar, inflate: inflate, mapper: mapper, partsUsed: partsUsed, GM: GM };
  root.LFBiabSty = api;
  if (typeof module !== 'undefined') module.exports = api;
})(typeof window !== 'undefined' ? window : this);
