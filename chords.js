/* ===== Latin Fake Book: chord symbols, spelling, voicings and text chord charts ===== */
(function (root) {
  'use strict';
  var NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var LINE = 'FCGDAEB';

  /* ---------- note names ---------- */
  function pcOf(letter, acc) { return (NAT[letter] + (acc || 0) + 120) % 12; }
  function accVal(s) { if (!s) return 0; var v = 0; for (var i = 0; i < s.length; i++) v += (s[i] === '#' || s[i] === '♯') ? 1 : -1; return v; }
  /* spell a pitch class for a key given in fifths (-7..7). Window keeps chord roots readable: in C you get Db Eb F# Ab Bb. */
  function nameOfPc(pc, keyFifths) {
    keyFifths = keyFifths || 0;
    var f = ((pc * 7) % 12 + 12) % 12; // fifths position of pc, 0..11 (C=0, G=1 ...)
    var lo = keyFifths - 5, hi = keyFifths + 6;
    while (f > hi) f -= 12; while (f < lo) f += 12;
    var idx = f + 1, letter = LINE[((idx % 7) + 7) % 7], acc = Math.floor(idx / 7);
    return letter + (acc > 0 ? new Array(acc + 1).join('#') : acc < 0 ? new Array(-acc + 1).join('b') : '');
  }
  function pretty(s) { return String(s).replace(/([A-G])bb/g, '$1𝄫').replace(/([A-G])b/g, '$1♭').replace(/([A-G])#/g, '$1♯').replace(/b(\d)/g, '♭$1').replace(/#(\d)/g, '♯$1'); }

  /* ---------- chord parsing ---------- */
  function parseChord(sym) {
    if (sym == null) return null;
    var s = String(sym).trim();
    if (/^\(.*\)$/.test(s)) s = s.slice(1, -1).trim();
    if (/^(N\.?C\.?|NC|n\.c\.)$/i.test(s)) return { nc: true, sym: 'N.C.', intervals: [] };
    s = s.replace(/♭/g, 'b').replace(/♯/g, '#').replace(/−/g, '-').replace(/º/g, 'o').replace(/\s+/g, '');
    var m = s.match(/^([A-Ga-g])(##|bb|#|b)?(.*)$/);
    if (!m) return null;
    var rootL = m[1].toUpperCase(), rootAcc = accVal(m[2]), rest = m[3], bass = null, bassName = null;
    rest = rest.replace(/6\/9/g, '69');
    var sl = rest.match(/^(.*)\/([A-Ga-g])(##|bb|#|b)?$/);
    if (sl) { rest = sl[1]; bass = pcOf(sl[2].toUpperCase(), accVal(sl[3])); bassName = sl[2].toUpperCase() + (sl[3] || ''); }
    var q = parseQuality(rest);
    if (!q) return null;
    var rpc = pcOf(rootL, rootAcc);
    return { root: rpc, rootName: rootL + (m[2] || ''), quality: rest, intervals: q.iv, family: q.family, bass: bass, bassName: bassName, sym: String(sym).trim(),
      third: q.third, seventh: q.seventh, fifth: q.fifth };
  }
  function parseQuality(t) {
    var i = 0, minor = false, dim = false, aug = false, half = false, maj7 = false, majWord = false, sus = null, num = 0, six = false, power = false;
    var adds = [], alts = { b5: 0, s5: 0, b9: 0, s9: 0, s11: 0, b13: 0 }, alt = false, no3 = false, no5 = false;
    t = t.replace(/[(),]/g, '');
    function eat(re) { var mm = t.slice(i).match(re); if (mm) { i += mm[0].length; return mm[0]; } return null; }
    if (eat(/^(mmaj|mMaj|mMA|mM|m\^|-maj|-Maj|-Δ|minmaj|minMaj|mΔ|-\^)/)) { minor = true; maj7 = true; }
    else if (eat(/^(maj|Maj|MAJ|MA|Ma|M|Δ|\^)/)) majWord = true;
    else if (eat(/^(min|mi|m|-)/)) minor = true;
    else if (eat(/^(dim|o|°)/)) dim = true;
    else if (eat(/^(ø|Ø|halfdim|half-dim)/)) half = true;
    else if (eat(/^(aug|\+)/)) aug = true;
    var n = eat(/^(69|13|11|9|7|6|5|4|2)/);
    if (n === '69') { six = true; adds.push(14); }
    else if (n === '6') six = true;
    else if (n === '5') power = true;
    else if (n === '2') sus = 2;
    else if (n === '4') sus = 4;
    else if (n) num = +n;
    var guard = 0;
    while (i < t.length && guard++ < 20) {
      if (eat(/^sus4|^sus/)) { sus = /2$/.test(t.slice(i, i + 1)) ? 2 : 4; if (eat(/^2/)) sus = 2; continue; }
      if (eat(/^sus2/)) { sus = 2; continue; }
      if (eat(/^(add9|add2)/)) { adds.push(14); continue; }
      if (eat(/^add11|^add4/)) { adds.push(17); continue; }
      if (eat(/^add13|^add6/)) { adds.push(21); continue; }
      if (eat(/^alt/)) { alt = true; continue; }
      if (eat(/^(b5|-5)/)) { alts.b5 = 1; continue; }
      if (eat(/^(#5|\+5|\+)/)) { alts.s5 = 1; continue; }
      if (eat(/^(b9|-9)/)) { alts.b9 = 1; continue; }
      if (eat(/^(#9|\+9)/)) { alts.s9 = 1; continue; }
      if (eat(/^(#11|\+11)/)) { alts.s11 = 1; continue; }
      if (eat(/^(b13|-13)/)) { alts.b13 = 1; continue; }
      if (eat(/^(maj7|Maj7|M7|Δ7|Δ|ma7|\^7)/)) { maj7 = true; if (!num) num = 7; continue; }
      if (eat(/^no3/)) { no3 = true; continue; }
      if (eat(/^no5/)) { no5 = true; continue; }
      var nn = eat(/^(13|11|9|7|6)/); if (nn) { if (nn === '6') six = true; else num = Math.max(num, +nn); continue; }
      if (eat(/^(dim|o)/)) { dim = true; continue; }
      return null;
    }
    if (majWord) { if (num) maj7 = true; else if (/Δ|\^/.test(t[0]) ) { maj7 = true; num = 7; } }
    var third = minor || dim || half ? 3 : 4, fifth = dim || half ? 6 : aug ? 8 : 7, seventh = null;
    if (sus === 4) third = 5; if (sus === 2) third = 2;
    if (alts.b5) fifth = 6; if (alts.s5) fifth = 8;
    if (half && !num) num = 7;
    if (num >= 7) seventh = dim && !half ? 9 : maj7 ? 11 : 10;
    else if (maj7) { seventh = 11; num = 7; }
    var iv = [0];
    if (!power && !no3) iv.push(third);
    if (!no5) iv.push(fifth);
    if (six) iv.push(9);
    if (seventh !== null) iv.push(seventh);
    if (num >= 9) iv.push(alts.b9 ? 13 : alts.s9 ? 15 : 14);
    if (num === 11) { if (third === 4 && !minor) { /* dominant 11 = 9sus4 sound */ iv = iv.filter(function (x) { return x !== 4; }); iv.push(17); third = 5; } else iv.push(17); }
    if (num === 13) iv.push(21);
    if (alts.b9 && num < 9) iv.push(13); if (alts.s9 && num < 9) iv.push(15); if (alts.s9 && alts.b9 && num >= 9) iv.push(15);
    if (alts.s11) iv.push(18); if (alts.b13) iv.push(20);
    if (alt) { iv = iv.filter(function (x) { return x !== 7; }); iv.push(13, 15, 20); if (seventh === null) { seventh = 10; iv.push(10); } }
    adds.forEach(function (a) { iv.push(a); });
    var uniq = []; iv.forEach(function (x) { if (uniq.indexOf(x) < 0) uniq.push(x); }); uniq.sort(function (a, b) { return a - b; });
    var family = dim && seventh === 9 ? 'dim7' : (half || (minor && fifth === 6 && seventh === 10)) ? 'm7b5' : dim ? 'dim' : aug ? 'aug' : power ? '5' : sus ? 'sus' : minor ? (seventh === 11 ? 'mMaj7' : seventh ? 'm7' : six ? 'm6' : 'm') : (seventh === 11 ? 'maj7' : seventh === 10 ? '7' : six ? '6' : 'maj');
    return { iv: uniq, family: family, third: third, seventh: seventh, fifth: fifth };
  }

  /* transpose and re-spell a chord symbol for a key (fifths) */
  function transposeChord(sym, semis, keyFifths) {
    var c = parseChord(sym); if (!c) return sym; if (c.nc) return 'N.C.';
    var name = nameOfPc((c.root + semis + 120) % 12, keyFifths) + c.quality;
    if (c.bass !== null) name += '/' + nameOfPc((c.bass + semis + 120) % 12, keyFifths);
    return name;
  }
  function displayChord(sym, semis, keyFifths) { return pretty(transposeChord(sym, semis || 0, keyFifths || 0)).replace(/69/, '6/9'); }

  /* ---------- voicings ---------- */
  /* pick pitch classes for comping (rootless-ish for 7th chords, triads keep root) */
  function compTones(c, n) {
    n = n || 4;
    var iv = c.intervals, has = function (x) { return iv.indexOf(x) >= 0; }, out = [];
    var third = iv.filter(function (x) { return x >= 2 && x <= 5; })[0];
    var sev = iv.filter(function (x) { return x === 9 && (c.family === 'dim7' || c.family === '6' || c.family === 'm6') || x === 10 || x === 11; });
    var ext = iv.filter(function (x) { return x > 12; });
    var fifth = iv.filter(function (x) { return x >= 6 && x <= 8; })[0];
    if (third !== undefined) out.push(third);
    sev.forEach(function (x) { out.push(x); });
    if (has(9) && out.indexOf(9) < 0) out.push(9);
    ext.forEach(function (x) { out.push(x % 12); });
    if (fifth !== undefined && (fifth !== 7 || out.length < 3)) out.splice(fifth === 7 ? out.length : 1, 0, fifth);
    if (out.length < 3 || (!sev.length && !ext.length)) out.unshift(0);
    var u = []; out.forEach(function (x) { x %= 12; if (u.indexOf(x) < 0) u.push(x); });
    // altered fifths and alterations are essential; drop plain 5th first, then root
    while (u.length > n) { var k = u.indexOf(7); if (k < 0) k = u.indexOf(0); if (k < 0) k = u.length - 1; u.splice(k, 1); }
    return u.map(function (x) { return (x + c.root) % 12; });
  }
  /* choose octave placement close to the previous voicing (smooth voice leading) */
  function voice(c, prev, opt) {
    opt = opt || {}; var lo = opt.low || 53, hi = opt.high || 76, center = opt.center || 64, n = opt.n || 4;
    var pcs = opt.pcs || compTones(c, n), best = null;
    var opts = pcs.map(function (pc) { var a = []; for (var m = lo; m <= hi; m++) if (m % 12 === pc) a.push(m); return a.length ? a : [lo + ((pc - lo % 12 + 12) % 12)]; });
    function rec(k, cur) {
      if (k === opts.length) {
        var s = cur.slice().sort(function (a, b) { return a - b; }), spread = s[s.length - 1] - s[0];
        if (spread > (opt.maxSpread || 13)) return;
        for (var j = 1; j < s.length; j++) if (s[j] === s[j - 1]) return;
        if (s[0] < 57 && s[1] - s[0] < 3) return; // muddy low seconds
        var cen = s.reduce(function (a, b) { return a + b; }, 0) / s.length, cost = Math.abs(cen - center) * 0.6 + spread * 0.15;
        if (prev && prev.length) { var p = prev.slice().sort(function (a, b) { return a - b; }); for (var q = 0; q < Math.min(p.length, s.length); q++) cost += Math.abs(p[q] - s[q]) * 0.5; }
        if (!best || cost < best.cost) best = { cost: cost, v: s };
        return;
      }
      opts[k].forEach(function (m) { cur.push(m); rec(k + 1, cur); cur.pop(); });
    }
    rec(0, []);
    if (!best) { var base = []; pcs.forEach(function (pc) { var m = lo; while (m % 12 !== pc) m++; base.push(m); }); return base.sort(function (a, b) { return a - b; }); }
    return best.v;
  }
  function bassNote(c, degree, lo, hi, prevNote) {
    lo = lo || 28; hi = hi || 52;
    var pc;
    if (degree === 'R') pc = c.bass !== null ? c.bass : c.root;
    else if (degree === 'r') pc = c.root;
    else if (degree === '5') { var f = c.intervals.filter(function (x) { return x >= 6 && x <= 8; })[0]; pc = (c.root + (f === undefined ? 7 : f)) % 12; }
    else if (degree === '3') { var t = c.intervals.filter(function (x) { return x >= 2 && x <= 5; })[0]; pc = (c.root + (t === undefined ? 4 : t)) % 12; }
    else if (degree === '7') { var s = c.seventh; pc = (c.root + (s == null ? 12 : s)) % 12; }
    else pc = c.bass !== null ? c.bass : c.root;
    // closest octave to previous note, kept in range; roots favour the lower octave
    var cands = []; for (var m = lo; m <= hi; m++) if (m % 12 === pc) cands.push(m);
    if (!cands.length) return lo;
    var target = prevNote || (degree === 'R' ? 36 : 40);
    cands.sort(function (a, b) { return Math.abs(a - target) - Math.abs(b - target) || a - b; });
    var pick = cands[0];
    if ((degree === 'R' || degree === 'r') && pick > 47 && cands.some(function (x) { return x <= 47; })) pick = cands.filter(function (x) { return x <= 47; }).pop();
    return pick;
  }

  /* ---------- text chord charts ---------- */
  /* Accepts e.g.
       Title: My Tune
       Style: Bossa Nova
       Time: 4/4   Key: C   Tempo: 120
       | Am7 | D7 | Gmaj7 | % |
       |: Cm7 F7 | Bbmaj7 / / / :|
     Several chords in a bar share it evenly; "/" or "." holds the previous chord for one beat. */
  function parseChart(text, defMeter) {
    var out = { title: '', style: '', key: '', meter: null, tempo: null, clave: '', composer: '', bars: [], errors: [], warnings: [], labels: [] };
    var lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    var seq = []; // tokens: {t:'bar'|'rs'|'re'|'end'|'chords', ...}
    var label = null;
    lines.forEach(function (raw, ln) {
      var line = raw.replace(/(^|\s)#.*$/, '').replace(/(^|\s)\/\/.*$/, '').trim(); // comments start with # or // (a # right after a chord letter is a sharp)
      if (!line) return;
      var hm = line.match(/^(title|t|style|time|meter|m|key|k|tempo|q|bpm|clave|composer|c|by)\s*[:=]\s*(.*)$/i);
      if (hm && line.indexOf('|') < 0) {
        var k = hm[1].toLowerCase(), v = hm[2].trim();
        if (k === 'title' || k === 't') out.title = v;
        else if (k === 'style') out.style = v;
        else if (k === 'time' || k === 'meter' || k === 'm') { var mm = v.match(/(\d+)\s*\/\s*(\d+)/); if (mm) out.meter = { num: +mm[1], den: +mm[2] }; else out.errors.push({ line: ln + 1, message: 'The time "' + v + '" should look like 4/4 or 3/4.' }); }
        else if (k === 'key' || k === 'k') out.key = v;
        else if (k === 'tempo' || k === 'q' || k === 'bpm') { var tm = v.match(/(\d+)\s*$/); if (tm) out.tempo = +tm[1]; }
        else if (k === 'clave') out.clave = /3\s*-\s*2/.test(v) ? '3-2' : '2-3';
        else out.composer = v;
        return;
      }
      var lm = line.match(/^\[?([A-Z][A-Za-z0-9 ]{0,14})\]?\s*:\s*(?=\|)/) || line.match(/^\[([^\]|]{1,16})\]\s*/);
      if (lm) { label = lm[1].trim(); line = line.slice(lm[0].length); }
      if (line.indexOf('|') < 0) { line = '| ' + line + ' |'; }
      line = line.replace(/(\|)\s*\[?(\d)\.?(?=\s|[A-G])/g, '$1 [$2 ');
      var re = /(\|\|?:?|:\|\|?|\|\]|\[\d|\b\d\.(?=\s)|[^\s|:\[]+|:)/g, mt, buf = [];
      while ((mt = re.exec(line))) {
        var tok = mt[1];
        if (/^:\|/.test(tok)) { flush(); seq.push({ t: 're' }); continue; }
        if (/^\|\|?:$/.test(tok)) { flush(); seq.push({ t: 'rs' }); continue; }
        if (/^(\|\||\||\|\])$/.test(tok)) { flush(); continue; }
        if (/^\[\d$/.test(tok) || /^\d\.$/.test(tok)) { flush(); seq.push({ t: 'end', n: +tok.replace(/\D/g, '') }); continue; }
        if (tok === ':') continue;
        buf.push({ tok: tok, ln: ln });
      }
      flush();
      function flush() { if (buf.length) { seq.push({ t: 'chords', items: buf, label: label }); label = null; buf = []; } }
    });
    var meter = out.meter || defMeter || { num: 4, den: 4 };
    var beats = Math.max(1, Math.round(meter.num * (meter.den === 8 && meter.num % 3 === 0 ? 1 / 3 : 1))), barQ = meter.num / meter.den * 4;
    // build source bars
    var src = [], prevBar = null;
    seq.forEach(function (s) {
      if (s.t !== 'chords') { src.push(s); return; }
      var items = s.items, chords = [];
      if (items.length === 1 && /^(%|x|-|\.\/\.)$/.test(items[0].tok)) { if (prevBar) src.push({ t: 'bar', chords: prevBar.chords.map(function (c) { return Object.assign({}, c); }), label: s.label, repeatSign: true }); else out.errors.push({ line: items[0].ln + 1, message: 'A "%" (repeat the bar) needs a bar before it.' }); return; }
      var slots = [], bad = null;
      items.forEach(function (it) {
        if (/^[\/.]$/.test(it.tok)) { slots.push(null); return; }
        var nm = it.tok.replace(/^\((.*)\)$/, '$1');
        var c = parseChord(nm);
        if (!c) { bad = it; return; }
        slots.push(nm);
      });
      if (bad) { out.errors.push({ line: bad.ln + 1, message: 'I don\'t recognise the chord "' + bad.tok + '". Chords look like C, Am7, D7, Gmaj7, F#m7b5, Bb7#11 or C/E.' }); return; }
      var hasHold = slots.some(function (x) { return x === null; });
      var unit = hasHold ? barQ / slots.length : barQ / slots.length;
      var last = null;
      slots.forEach(function (sym, k) {
        if (sym === null) { if (!chords.length && prevBar) { var pc = prevBar.chords[prevBar.chords.length - 1]; chords.push({ sym: pc.sym, beat: 0, dur: unit }); } else if (chords.length) chords[chords.length - 1].dur += unit; return; }
        chords.push({ sym: sym, beat: k * unit, dur: unit });
      });
      if (!hasHold && slots.length === 3 && beats === 4) { chords[0].dur = 2; chords[1].beat = 2; chords[1].dur = 1; chords[2].beat = 3; chords[2].dur = 1; }
      var bar = { t: 'bar', chords: chords, label: s.label };
      src.push(bar); prevBar = bar;
    });
    // unfold repeats & endings
    var bars = [], i = 0, repStart = 0, pass = 1, guard = 0, ending = 0, done = {};
    var startIdx = 0;
    while (i < src.length && guard++ < 5000) {
      var e = src[i];
      if (e.t === 'rs') { pass = 1; ending = 0; repStart = i + 1; i++; continue; }
      if (e.t === 'end') { ending = e.n; i++; continue; }
      if (e.t === 're') {
        if (!done[i]) { done[i] = true; pass = 2; i = repStart; ending = 0; continue; }
        ending = 0; i++; repStart = i; continue;
      }
      if (ending && ending !== pass) { i++; continue; }
      bars.push({ chords: e.chords, label: e.label || null });
      i++;
    }
    out.bars = bars; out.meter = meter;
    if (!bars.length && !out.errors.length) out.errors.push({ line: 1, message: 'I couldn\'t find any chords. Type bars like  | Am7 | D7 | Gmaj7 | % |' });
    return out;
  }

  var API = { parseChord: parseChord, nameOfPc: nameOfPc, transposeChord: transposeChord, displayChord: displayChord, pretty: pretty,
    compTones: compTones, voice: voice, bassNote: bassNote, parseChart: parseChart, pcOf: pcOf };
  root.LFChords = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
