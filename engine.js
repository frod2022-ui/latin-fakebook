/* ===== Latin Fake Book engine: song timeline + style patterns -> backing events (no audio here, testable in node) ===== */
(function (root) {
  'use strict';
  var C = root.LFCore || (typeof require !== 'undefined' ? require('./core.js') : null);
  var H = root.LFChords || (typeof require !== 'undefined' ? require('./chords.js') : null);

  var PARTS = [
    { id: 'melody', name: 'Melody', perc: false },
    { id: 'piano', name: 'Piano', perc: false },
    { id: 'bass', name: 'Bass', perc: false },
    { id: 'clave', name: 'Clave', perc: true },
    { id: 'congas', name: 'Congas', perc: true },
    { id: 'bongos', name: 'Bongos', perc: true },
    { id: 'shaker', name: 'Shaker / Maracas', perc: true },
    { id: 'cowbell', name: 'Cowbell / Bell', perc: true },
    { id: 'timbales', name: 'Timbales', perc: true },
    { id: 'guiro', name: 'Güiro', perc: true },
    { id: 'rim', name: 'Rim / Tamborim', perc: true },
    { id: 'drums', name: 'Low drum (bombo, surdo, tambora)', perc: true }
  ];

  /* ---------- patterns ----------
     piano hits: [pos, token, dur, vel, ant]  token: B block, b soft low block, M tango marcato, O5/O3/O1/O7 montuno octave, I inner dyad, a0..a5 arpeggio note
     bass hits:  [pos, degree, dur, vel]      degree: R root(or slash bass) 5 3 8 7, N next chord's root (anticipation), A approach to next root
     percussion: string over the cycle; '.' = rest                                                                           */
  function bars2(bar, cyc) { var o = []; for (var k = 0; k < (cyc || 8) / 4; k++) bar.forEach(function (h) { var c = h.slice(); c[0] += 4 * k; o.push(c); }); return o; }
  var TUMBAO = [[1.5, '5', 1.4, 0.85], [3, 'N', 1.9, 1], [5.5, '5', 1.4, 0.85], [7, 'N', 1.9, 1]];
  var MONTUNO = [[0, 'O5', .42, 1], [0.5, 'I', .38, .7], [1, 'O3', .42, .9], [1.5, 'I', .38, .7], [2.5, 'O5', .42, .95], [3, 'I', .38, .7], [3.5, 'O3', .9, .95, 1],
                 [4.5, 'I', .38, .7], [5, 'O5', .42, .95], [5.5, 'I', .38, .7], [6, 'O3', .42, .9], [6.5, 'I', .38, .7], [7, 'O1', .42, .95], [7.5, 'I', .9, .8, 1]];
  var VALS3 = { cycle: 6, piano: [[1, 'b', .7, .75], [2, 'b', .7, .7], [4, 'b', .7, .75], [5, 'b', .7, .7]], bass: [[0, 'R', 0.95, 1], [3, '5', 0.95, .95]],
    perc: { shaker: 'XxXxXxXxXxXx', guiro: 'L...s.L...s.' } };

  var STYLES = {
    bossa: { name: 'Bossa Nova', short: 'Bossa', tempo: 132, clave: true, claveName: 'bossa clave (rim)',
      p4: { cycle: 8, piano: [[0, 'B', 1.3, .8], [1.5, 'B', 1.3, .72], [3, 'B', .9, .68], [5, 'B', 1.3, .74], [6.5, 'B', 1.3, .7]],
        bass: bars2([[0, 'R', 1.45, 1], [1.5, 'R', .45, .7], [2, '5', 1.45, .92], [3.5, '5', .45, .7]]),
        perc: { rim: 'x..x..x...x..x..', shaker: 'XxxxXxxxXxxxXxxxXxxxXxxxXxxxXxxx', drums: 'k..kk..kk..kk..k' } },
      p3: { cycle: 6, piano: [[0, 'B', 1.2, .8], [1.5, 'B', 1.2, .7], [3.5, 'B', 1.2, .72], [5, 'B', .9, .66]], bass: [[0, 'R', 1.45, 1], [1.5, '5', 1.4, .85], [3, 'R', 1.45, .95], [4.5, '5', 1.4, .85]],
        perc: { rim: 'x..x..x...x.', shaker: 'XxxxXxxxXxxxXxxxXxxxXxxx' } } },
    samba: { name: 'Samba', short: 'Samba', tempo: 104, beatName: 'half-bar',
      p4: { cycle: 8, piano: [[0, 'B', .4, .85], [0.75, 'B', .4, .75], [1.5, 'B', .4, .8], [2.5, 'B', .4, .8], [3.25, 'B', .6, .8, 1], [4.5, 'B', .4, .8], [5.25, 'B', .4, .75], [6, 'B', .4, .85], [6.75, 'B', .4, .75], [7.5, 'B', .45, .8, 1]],
        bass: bars2([[0, 'R', .6, .9], [0.75, 'R', .22, .65], [1, '5', .9, 1], [2, 'R', .6, .9], [2.75, 'R', .22, .65], [3, '5', .9, 1]]),
        perc: { drums: 'm.K.m.K.m.K.m.K.', shaker: 'XxxxXxxxXxxxXxxxXxxxXxxxXxxxXxxx', rim: 'x.x..x.x.x..x.x.x.x..x.x.x..x.x.', cowbell: 'X.x.Xx.xX.x.Xx.x' } } },
    salsa: { name: 'Salsa / Son Montuno', short: 'Salsa', tempo: 180, clave: true, claveName: 'son clave',
      p4: { cycle: 8, piano: MONTUNO, bass: TUMBAO,
        perc: { clave: 'x..x..x...x.x...', congas: 'htsthtoohtsthtoo', bongos: 'htmthtlthtmthtlt', cowbell: 'X.x.X.xxX.x.X.xx', timbales: 'x.xx.x.xx.x.xx.x', guiro: 'L.ssL.ssL.ssL.ss', shaker: 'XxXxXxXxXxXxXxXx' } } },
    chacha: { name: 'Cha-Cha-Chá', short: 'Cha-cha', tempo: 116, clave: true, claveName: 'son clave',
      p4: { cycle: 8, piano: bars2([[0, 'B', .9, .85], [1.5, 'B', .4, .75], [2, 'b', .9, .75], [3, 'B', .4, .82], [3.5, 'B', .4, .8, 1]]),
        bass: bars2([[0, 'R', .9, 1], [2, '5', .9, .9], [3, 'R', .42, .85], [3.5, 'R', .42, .85]]),
        perc: { clave: 'x..x..x...x.x...', cowbell: 'X.x.X.x.X.x.X.x.', guiro: 'L.s.L.ssL.s.L.ss', congas: 'm.s.m.oom.s.m.oo', shaker: 'XxXxXxXxXxXxXxXx' } } },
    bolero: { name: 'Bolero', short: 'Bolero', tempo: 76, clave: true, claveName: 'son clave',
      p4: { cycle: 8, piano: [[0, 'B', 1.6, .62], [1, 'a1', 1.2, .55], [1.5, 'a2', 1.1, .52], [2, 'a3', 1.2, .58], [2.5, 'a4', 1.1, .55], [3, 'a3', 1, .55], [3.5, 'a2', .9, .5],
                             [4, 'B', 1.6, .6], [5, 'a2', 1.2, .55], [5.5, 'a3', 1.1, .52], [6, 'a4', 1.2, .58], [6.5, 'a5', 1.1, .55], [7, 'a3', 1, .55], [7.5, 'a1', .8, .5]],
        bass: bars2([[0, 'R', 1.45, 1], [1.5, 'R', .4, .7], [2, '5', 1.9, .9]]),
        perc: { clave: '..x.x...x..x..x.', bongos: 'htmthtlthtmthtlt', shaker: 'XxXxXxXxXxXxXxXx', congas: 'm.s.m.oom.s.m.oo', guiro: 'L...L.s.L...L.s.' } },
      p3: { cycle: 6, piano: [[0, 'B', 1.4, .6], [1, 'a1', 1, .55], [1.5, 'a2', 1, .52], [2, 'a3', 1, .56], [2.5, 'a2', .8, .5], [3, 'B', 1.4, .6], [4, 'a2', 1, .55], [4.5, 'a3', 1, .52], [5, 'a4', 1, .56], [5.5, 'a1', .8, .5]],
        bass: [[0, 'R', 1.9, 1], [2, '5', .95, .85], [3, 'R', 1.9, .95], [5, '5', .95, .85]], perc: { shaker: 'XxXxXxXxXxXx', bongos: 'htmtlthtmtlt', guiro: 'L...s.L...s.' } } },
    mambo: { name: 'Mambo', short: 'Mambo', tempo: 190, clave: true, claveName: 'son clave',
      p4: { cycle: 8, piano: [[0, 'O5', .42, 1], [0.5, 'I', .38, .7], [1, 'O3', .42, .9], [1.5, 'B', .38, .85], [2.5, 'O5', .42, .95], [3, 'I', .38, .7], [3.5, 'B', .9, 1, 1],
                             [4.5, 'I', .38, .7], [5, 'O5', .42, .95], [5.5, 'B', .38, .8], [6, 'O3', .42, .9], [6.5, 'I', .38, .7], [7, 'O1', .42, .95], [7.5, 'B', .9, .95, 1]],
        bass: TUMBAO,
        perc: { clave: 'x..x..x...x.x...', cowbell: 'X.xxX.x.X.x.XxX.', congas: 'htsthtoohtsthtOO', timbales: 'x.xx.x.xx.x.xx.x', guiro: 'L.ssL.ssL.ssL.ss', bongos: 'htmthtlthtmthtlt' } } },
    rumba: { name: 'Rumba (guaguancó feel)', short: 'Rumba', tempo: 104, clave: true, claveName: 'rumba clave',
      p4: { cycle: 8, piano: [[0, 'B', 1.3, .8], [1.5, 'B', 1.2, .75], [3, 'B', .9, .78, 1], [4.5, 'B', 1.2, .74], [6, 'B', .9, .76], [7.5, 'B', .45, .74, 1]],
        bass: [[0, 'R', 1.4, .95], [1.5, '5', 1.4, .85], [3, 'N', 1.9, 1], [5.5, '5', 1.4, .85], [7, 'N', 1.9, 1]],
        perc: { clave: 'x..x...x..x.x...', congas: 'h.tsh.oos.toh.OO', timbales: 'x.xx.x.xx.x.xx.x', shaker: 'XxXxXxXxXxXxXxXx' } } },
    merengue: { name: 'Merengue', short: 'Merengue', tempo: 150,
      p4: { cycle: 8, piano: bars2([[0, 'O5', .4, 1], [0.5, 'I', .38, .7], [1, 'O3', .4, .9], [1.5, 'I', .38, .7], [2, 'O1', .4, .95], [2.5, 'I', .38, .7], [3, 'O3', .4, .9], [3.5, 'I', .4, .75, 1]]),
        bass: bars2([[0, 'R', .8, 1], [1, '5', .8, .9], [2, 'R', .8, .95], [3, '5', .42, .85], [3.5, 'A', .42, .85]]),
        perc: { shaker: 'X.xxX.xxX.xxX.xxX.xxX.xxX.xxX.xx', drums: 'r.rrt.rtr.rrt.rt', congas: '....o.o.....o.oo' } } },
    cumbia: { name: 'Cumbia', short: 'Cumbia', tempo: 96,
      p4: { cycle: 8, piano: bars2([[0, 'b', .4, .6], [0.5, 'B', .3, .8], [1.5, 'B', .3, .8], [2.5, 'B', .3, .8], [3.5, 'B', .3, .82, 1]]),
        bass: bars2([[0, 'R', 1.4, 1], [2, '5', 1.4, .9], [3.5, '5', .45, .75]]),
        perc: { guiro: 'L.ssL.ssL.ssL.ssL.ssL.ssL.ssL.ss', congas: '.o.o.o.o.o.o.o.s', drums: 'k...k...k...k...', shaker: 'XxXxXxXxXxXxXxXx' } } },
    tango: { name: 'Tango', short: 'Tango', tempo: 120,
      p4: { cycle: 8, piano: [[0, 'M', .32, 1], [1, 'M', .3, .72], [2, 'M', .32, .95], [3, 'M', .3, .72], [4, 'M', .45, 1], [5.5, 'M', .45, .92], [7, 'M', .45, .9]],
        bass: [[0, 'R', .45, 1], [1, '5', .4, .75], [2, 'R', .45, .95], [3, '5', .4, .75], [4, 'R', .6, 1], [5.5, '5', .6, .92], [7, '8', .5, .88], [7.75, 'A', .22, .8]],
        perc: { rim: 'x.x.x.x.x..x..x.' } },
      p3: VALS3 },
    habanera: { name: 'Habanera / Danzón', short: 'Habanera', tempo: 92,
      p4: { cycle: 8, piano: bars2([[0, 'b', .7, .8], [0.75, 'B', .22, .62], [1, 'B', .45, .8], [1.5, 'B', .45, .72], [2, 'b', .7, .8], [2.75, 'B', .22, .62], [3, 'B', .45, .8], [3.5, 'B', .45, .72]]),
        bass: bars2([[0, 'R', .7, 1], [0.75, '5', .22, .7], [1, '8', .45, .85], [1.5, '5', .45, .8], [2, 'R', .7, 1], [2.75, '5', .22, .7], [3, '8', .45, .85], [3.5, '5', .45, .8]]),
        perc: { rim: 'x..xx.x.x..xx.x.x..xx.x.x..xx.x.', congas: 'o..mo.s.o..mo.s.', guiro: 'L...s.s.L...s.s.' } } },
    afro68: { name: 'Afro-Cuban 6/8', short: '6/8', tempo: 100, triple: true,
      p4: { cycle: 4, piano: [[0, 'B', .9, .85], [1, 'B', .6, .72], [5 / 3, 'B', .6, .75], [7 / 3, 'B', .6, .8], [10 / 3, 'B', .6, .76, 1]],
        bass: [[0, 'R', .95, 1], [5 / 3, '5', .3, .8], [2, '5', .95, .9], [11 / 3, 'A', .3, .8]],
        perc: { cowbell: 'X.X.XX.X.X.X', clave: 'x.x.x..x.x..', shaker: 'X..x..X..x..', congas: 'm..s.oo..s.o', drums: 'k.....k.....' } },
      p3: { cycle: 6, piano: [[0, 'B', 1.3, .85], [1.5, 'B', .8, .72], [2.5, 'B', .8, .75], [3.5, 'B', .8, .8], [5, 'B', .8, .76, 1]],
        bass: [[0, 'R', 1.4, 1], [2.5, '5', .45, .8], [3, '5', 1.4, .9], [5.5, 'A', .45, .8]],
        perc: { cowbell: 'X.X.XX.X.X.X', clave: 'x.x.x..x.x..', shaker: 'X..x..X..x..', congas: 'm..s.oo..s.o', drums: 'k.....k.....' } } },
    vals: { name: 'Vals / Ranchera (3/4)', short: 'Vals', tempo: 120, p4: null, p3: VALS3 }
  };
  var STYLE_ORDER = ['bossa', 'samba', 'salsa', 'chacha', 'bolero', 'mambo', 'rumba', 'merengue', 'cumbia', 'tango', 'afro68', 'habanera', 'vals'];
  var STYLE_ALIASES = { 'bossa nova': 'bossa', 'bossa': 'bossa', 'samba': 'samba', 'salsa': 'salsa', 'son': 'salsa', 'son montuno': 'salsa', 'montuno': 'salsa', 'salsa/son montuno': 'salsa',
    'cha-cha': 'chacha', 'cha cha': 'chacha', 'chachacha': 'chacha', 'cha-cha-cha': 'chacha', 'cha-cha-chá': 'chacha', 'bolero': 'bolero', 'mambo': 'mambo', 'rumba': 'rumba', 'guaguanco': 'rumba',
    'merengue': 'merengue', 'cumbia': 'cumbia', 'tango': 'tango', 'afro': 'afro68', '6/8': 'afro68', 'afro-cuban 6/8': 'afro68', 'bembe': 'afro68', 'habanera': 'habanera', 'danzon': 'habanera', 'danzón': 'habanera',
    'vals': 'vals', 'waltz': 'vals', 'ranchera': 'vals' };
  function styleId(s) { if (!s) return null; if (STYLES[s]) return s; var k = String(s).toLowerCase().trim(); return STYLE_ALIASES[k] || STYLE_ALIASES[k.replace(/[^a-z\/ -]/g, '')] || null; }

  /* which parts a style actually plays (others are greyed out in the mixer) */
  function styleParts(sid, triple) {
    var st = STYLES[sid] || STYLES.bossa;
    // a Band-in-a-Box style: its own decoded drums, or the built-in percussion of the closest app style
    if (st.bib) { var o = st.drums ? { melody: 1, piano: 1, bass: 1 } : styleParts(st.fallback, triple); Object.keys(st.bibUsed || {}).forEach(function (k) { if (st.bibUsed[k]) o[k] = 1; }); return o; }
    var p = (triple ? st.p3 || VALS3 : st.p4 || st.p3), out = { melody: 1, piano: 1, bass: 1 };
    Object.keys((p && p.perc) || {}).forEach(function (k) { out[k] = 1; });
    return out;
  }

  /* ---------- song timeline ---------- */
  function keyFromText(k) { var r = k && C.parseKey(k.replace(/\s*(major|maj)$/i, '').replace(/\s*minor$/i, 'm')); return r; }
  function buildSong(song) {
    var out = { errors: [], warnings: [], melody: null, events: [], chordEvents: [], bars: [], pickup: 0 };
    var res = null, chart = null;
    if (song.abc && /[A-Ga-gz]/.test(song.abc.replace(/^[A-Za-z]:.*$/mg, ''))) {
      res = C.parseABC(song.abc); C.alignExtraVerses(res);
      if (res.errors.length) out.errors = out.errors.concat(res.errors.map(function (e) { return { where: 'melody', line: e.line, message: e.message }; }));
      if (!res.notes.length) res = null;
    }
    if (song.chart && song.chart.trim()) {
      chart = H.parseChart(song.chart, res ? { num: res.meter.num, den: res.meter.den } : (song.meter ? parseMeterTxt(song.meter) : null));
      if (chart.errors.length) out.errors = out.errors.concat(chart.errors.map(function (e) { return { where: 'chords', line: e.line, message: e.message }; }));
      if (!chart.bars.length) chart = null;
    }
    var meter = res ? { num: res.meter.num, den: res.meter.den } : chart ? chart.meter : (parseMeterTxt(song.meter) || { num: 4, den: 4 });
    var barQ = meter.num / meter.den * 4;
    var compound = meter.den === 8 && meter.num % 3 === 0;
    out.meter = meter; out.barQ = barQ; out.beatQ = compound ? 1.5 : meter.den === 2 ? 2 : meter.den === 8 ? 0.5 : 1;
    out.beatsPerBar = Math.round(barQ / out.beatQ);
    out.triple = Math.abs(barQ - 3) < 1e-6; // 3/4 and 6/8 use the 3-beat patterns
    var p = 0, melEnd = 0;
    if (res) {
      out.melody = res;
      var b0 = res.notes[0].bar, len0 = 0; res.notes.forEach(function (n) { if (n.bar === b0) len0 += n.dur; });
      if (len0 < barQ - 1e-6 && len0 > 0) p = len0;
      var ev = C.buildEvents(res, 0); out.events = ev.events; melEnd = ev.total;
    }
    out.pickup = p;
    // chord events
    var cev = [];
    if (chart) {
      chart.bars.forEach(function (b, k) { b.chords.forEach(function (c) { cev.push({ t: p + k * barQ + c.beat, sym: c.sym }); }); });
      out.chartBars = chart.bars.length;
    } else if (res) {
      var eff = [], cur = null;
      res.notes.forEach(function (n) { if (n.chord && H.parseChord(n.chord)) cur = n.chord; eff[n.i] = cur; });
      var last = undefined;
      out.events.forEach(function (e) { var s = eff[e.n]; if (s && s !== last) { cev.push({ t: e.start, sym: s }); last = s; } });
    }
    cev.forEach(function (c) { c.c = H.parseChord(c.sym); });
    cev = cev.filter(function (c) { return c.c; });
    // a chord on a pickup note belongs to the first bar for the backing; snap chords that land a hair before a bar line
    cev.forEach(function (c) { var rel = (c.t - p) / barQ, near = Math.round(rel); if (Math.abs(rel - near) * barQ < 0.13) c.t = p + near * barQ; if (c.t < p) c.t = p; });
    cev.sort(function (a, b) { return a.t - b.t; });
    // dedupe same time (keep last)
    var cd = []; cev.forEach(function (c) { if (cd.length && Math.abs(cd[cd.length - 1].t - c.t) < 1e-6) cd[cd.length - 1] = c; else cd.push(c); });
    out.chordEvents = cd;
    var end = Math.max(melEnd, chart ? p + chart.bars.length * barQ : 0);
    var nb = Math.max(1, Math.ceil((end - p) / barQ - 0.02));
    if (chart) nb = Math.max(nb, chart.bars.length);
    out.total = p + nb * barQ; out.nb = nb;
    for (var k = 0; k < nb; k++) {
      var st = p + k * barQ, ch = [], c0 = chordAt(out, st + 1e-6);
      if (c0) ch.push({ sym: c0.sym, beat: 0 });
      cd.forEach(function (c) { if (c.t > st + 1e-6 && c.t < st + barQ - 1e-6) ch.push({ sym: c.sym, beat: c.t - st }); });
      var lab = chart && chart.bars[k] ? chart.bars[k].label : null;
      out.bars.push({ i: k, start: st, chords: ch, label: lab });
    }
    // key
    var key = res ? res.key : keyFromText(song.key || (chart && chart.key));
    if (!key || (!res && !song.key && !(chart && chart.key))) {
      // guess: last chord of the song is usually the tonic
      var lc = cd.length ? cd[cd.length - 1].c : null;
      if (lc) key = C.parseKey(H.nameOfPc(lc.root, 0) + (lc.third === 3 ? 'm' : '')); else key = C.parseKey('C');
    }
    out.key = key;
    out.hasChords = cd.length > 0;
    if (!cd.length) out.warnings.push('This song has no chord symbols yet, so only the melody will play.');
    return out;
  }
  function parseMeterTxt(t) { var m = String(t || '').match(/(\d+)\s*\/\s*(\d+)/); return m ? { num: +m[1], den: +m[2] } : null; }
  function chordAt(tl, t) {
    var a = tl.chordEvents, lo = 0, hi = a.length - 1, r = null;
    while (lo <= hi) { var mid = (lo + hi) >> 1; if (a[mid].t <= t + 1e-9) { r = a[mid]; lo = mid + 1; } else hi = mid - 1; }
    return r || a[0] || null;
  }
  function nextChordAfter(tl, t) { var a = tl.chordEvents; for (var i = 0; i < a.length; i++) if (a[i].t > t + 1e-6) return a[i]; return null; }

  /* ---------- backing generator for one bar ----------
     returns [{part, t (beats from bar start), dur, vel, midi:[..] | sound:'name'}] */
  var PERC_SOUND = {
    clave: { x: 'clave', X: 'clave' },
    congas: { h: 'congaHeel', t: 'congaTip', s: 'congaSlap', o: 'congaOpen', O: 'tumbaOpen', m: 'congaMuff' },
    bongos: { h: 'bongoHi', l: 'bongoLo', m: 'bongoThumb', t: 'bongoTip' },
    shaker: { X: 'shakerAcc', x: 'shaker' },
    cowbell: { X: 'bellAcc', x: 'bell', H: 'bellHi' },
    timbales: { x: 'cascara', o: 'timbalHi', l: 'timbalLo', r: 'timbalRim' },
    guiro: { L: 'guiroLong', s: 'guiroShort' },
    rim: { x: 'rim', X: 'rim' },
    drums: { k: 'kick', K: 'surdoOpen', m: 'surdoMute', r: 'tamboraRim', t: 'tamboraOpen' }
  };
  function patternFor(tl, sid) {
    var st = STYLES[sid] || STYLES.bossa;
    if (tl.triple) return st.p3 || VALS3;
    return st.p4 || STYLES.bolero.p4;
  }
  function generateBar(tl, sid, k, opt) {
    opt = opt || {};
    var pat = patternFor(tl, sid), barQ = tl.barQ, cyc = pat.cycle, out = [];
    var claveShift = 0, st = STYLES[sid] || {};
    if (st.clave && opt.clave === '2-3' && cyc === 8) claveShift = 4;
    if (st.clave && opt.clave === '2-3' && cyc === 6) claveShift = 3;
    var gStart = k * barQ, bStart = tl.pickup + k * barQ, lastBar = opt.ending && k === tl.nb - 1;
    var state = opt.state || (opt.state = {});
    function hitsIn(list, fn) {
      // list positions in cycle; bar covers [c0, c0+barQ)
      var c0 = ((gStart + claveShift) % cyc + cyc) % cyc;
      for (var rep = -1; rep <= Math.ceil(barQ / cyc); rep++) list.forEach(function (h) {
        var pos = h[0] + rep * cyc - c0;
        if (pos >= -1e-6 && pos < barQ - 1e-6) fn(h, pos);
      });
    }
    if (lastBar) {
      var cE = chordAt(tl, bStart + 1e-3);
      if (cE && !cE.c.nc) {
        var v = H.voice(cE.c, state.prevV, { low: 55, high: 79, n: 4 });
        out.push({ part: 'piano', t: 0, dur: barQ, vel: 0.85, midi: v.concat([v[v.length - 1] + 12].filter(function (x) { return x <= 88; })) });
        out.push({ part: 'bass', t: 0, dur: barQ, vel: 1, midi: [H.bassNote(cE.c, 'R', 28, 50, state.prevB)] });
      }
      ['clave', 'cowbell', 'congas', 'timbales'].forEach(function (pt) { if (pat.perc && pat.perc[pt]) out.push({ part: pt, t: 0, dur: 1, vel: 1, sound: pt === 'congas' ? 'tumbaOpen' : pt === 'timbales' ? 'timbalLo' : pt === 'cowbell' ? 'bellAcc' : 'clave' }); });
      return out;
    }
    // piano
    hitsIn(pat.piano || [], function (h, pos) {
      var t = bStart + pos, ant = h[4], ce = chordAt(tl, t + (ant ? 0.55 : 0.02));
      if (!ce || ce.c.nc) return;
      var c = ce.c, tok = h[1], midi, vel = h[3];
      // a chord that changes under an arpeggio note gets a fresh (soft) chord instead, so the change is heard
      if (tok[0] === 'a' && Math.abs(ce.t - t) < 0.05 && pos > 0.01) { tok = 'B'; vel *= 0.9; }
      if (tok === 'B' || tok === 'M' || tok === 'b') {
        midi = H.voice(c, state.prevV, tok === 'M' ? { low: 52, high: 72, n: 4, center: 61 } : tok === 'b' ? { low: 50, high: 70, n: 3, center: 59 } : { low: 54, high: 76, n: 4, center: 64 });
        if (tok !== 'b') state.prevV = midi;
      } else if (tok[0] === 'O') {
        var deg = tok[1], ivs = c.intervals, pick = deg === '5' ? ivs.filter(function (x) { return x >= 6 && x <= 8; })[0] : deg === '3' ? ivs.filter(function (x) { return x >= 2 && x <= 5; })[0] : deg === '7' ? (c.seventh != null ? c.seventh : 12) : 0;
        if (pick === undefined) pick = 7;
        var pc = (c.root + pick) % 12, top = 67; while (top % 12 !== pc) top++;
        if (state.prevTop && Math.abs(top - 12 - state.prevTop) < Math.abs(top - state.prevTop) && top - 12 >= 64) top -= 12;
        state.prevTop = top; midi = [top - 12, top];
      } else if (tok === 'I') {
        var tp = state.prevTop || 72, tones = H.compTones(c, 3).concat([c.root]);
        var ins = []; tones.forEach(function (pcc) { for (var m = tp - 11; m < tp; m++) if (m % 12 === pcc && ins.indexOf(m) < 0 && m !== tp - 12) ins.push(m); });
        ins.sort(function (a, b) { return b - a; }); midi = ins.slice(0, 2);
        if (!midi.length) return;
      } else if (tok[0] === 'a') {
        if (!(state.arpV && state.prevC === ce)) state.arpV = H.voice(c, state.prevV, { low: 50, high: 69, n: 4, center: 60 });
        state.prevC = ce;
        var vv = state.arpV, ix = +tok[1] || 0, arp = vv.concat(vv.slice(0, 2).map(function (x) { return x + 12; }));
        midi = [arp[ix % arp.length]];
      }
      if (tok === 'B' && h[1] !== 'B') { midi = H.voice(c, state.prevV, { low: 54, high: 74, n: 4, center: 62 }); state.prevV = midi; state.arpV = midi; state.prevC = ce; }
      out.push({ part: 'piano', t: pos, dur: h[2], vel: vel, midi: midi, block: tok === 'B' || tok === 'M' || tok === 'b' });
    });
    // bass
    hitsIn(pat.bass || [], function (h, pos) {
      var t = bStart + pos, deg = h[1], ce = chordAt(tl, t + 0.02), m;
      if (!ce || ce.c.nc) return;
      // a chord that has just arrived (this bar, within a beat) gets its root, not the fifth or third
      if ((deg === '5' || deg === '3') && ce.t >= bStart - 1e-6 && t - ce.t < 0.99) deg = 'R';
      if (deg === 'N') { var nx = chordAt(tl, t + 1.05); m = H.bassNote(nx.c, 'R', 28, 50, state.prevB); }
      else if (deg === 'A') { var nc = chordAt(tl, t + 0.5); var target = H.bassNote(nc.c, 'R', 29, 50, state.prevB); m = (target === state.prevB || nc === ce) ? H.bassNote(ce.c, '5', 28, 50, state.prevB) : target - 1; }
      else if (deg === '8') { m = H.bassNote(ce.c, 'R', 28, 50, state.prevB); if (m + 12 <= 55) m += 12; }
      else m = H.bassNote(ce.c, deg, 28, 50, state.prevB);
      state.prevB = m;
      out.push({ part: 'bass', t: pos, dur: h[2], vel: h[3], midi: [m] });
    });
    // percussion
    var perc = pat.perc || {};
    Object.keys(perc).forEach(function (pt) {
      var str = perc[pt], step = cyc / str.length, list = [];
      for (var i = 0; i < str.length; i++) if (str[i] !== '.') list.push([i * step, str[i]]);
      hitsIn(list, function (h, pos) {
        var snd = (PERC_SOUND[pt] || {})[h[1]] || null; if (!snd) return;
        var acc = h[1] === 'X' || h[1] === 'K' || h[1] === 'L' || h[1] === 's' && pt === 'congas';
        out.push({ part: pt, t: pos, dur: h[1] === 'L' ? Math.min(1, step * 2) : 0.2, vel: acc ? 1 : 0.72, sound: snd });
      });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    if (opt.feel === false) return out;
    return feel(out, { sid: sid, st: st, pat: pat, k: k, tl: tl, c0: ((gStart + claveShift) % cyc + cyc) % cyc, cyc: cyc, state: state, lastBar: lastBar, seed: opt.seed });
  }

  /* ---------- feel: accents, dynamics, small human timing, variation and fills ----------
     Deterministic (seeded by bar and part) so the same bar always plays the same way and tests are repeatable.
     Each event gets vel (0..1) and dt (seconds; small timing offset, consistent tendency per part). */
  var FEEL = { piano: [1.5, 2.2], bass: [-1, 1.6], clave: [0, 1], congas: [-0.5, 2.2], bongos: [1, 2.2], shaker: [1.5, 1.8], cowbell: [-1, 1.3], timbales: [0, 1.8], guiro: [2, 2.2], rim: [0, 1.3], drums: [-1, 1.3], melody: [0, 1.5] };
  function rng(seed) { var x = seed >>> 0 || 1; return function () { x ^= x << 13; x >>>= 0; x ^= x >> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }
  function gauss(r) { return (r() + r() + r() - 1.5) * 1.15; } // about unit variance, bounded
  function partSeed(p) { var h = 7; for (var i = 0; i < p.length; i++) h = (h * 31 + p.charCodeAt(i)) >>> 0; return h; }
  function humanMs(part, r) { var f = FEEL[part] || [0, 1.5]; return Math.max(-8, Math.min(8, f[0] + gauss(r) * f[1])) / 1000; }
  function feel(out, o) {
    var tl = o.tl, barQ = tl.barQ, beatQ = tl.beatQ || 1, k = o.k, st = o.st || {}, pat = o.pat || {};
    var R = rng(((o.seed || 1) * 2654435761 + (k + 1) * 40503) >>> 0);
    // clave strokes in this bar (cycle positions) - clave styles lean on them
    var clv = {};
    if (st.clave && pat.perc && pat.perc.clave) { var cs = pat.perc.clave, step = o.cyc / cs.length; for (var i = 0; i < cs.length; i++) if (cs[i] !== '.') clv[Math.round(i * step * 4)] = 1; }
    var phraseEnd8 = k % 8 === 7 && k + 1 < tl.nb && !o.lastBar, phraseEnd4 = k % 4 === 3 && k + 1 < tl.nb && !o.lastBar;
    var swell = [0.97, 1, 1.02, 0.99][k % 4];
    // variation: let the piano breathe now and then (drop one weak off-beat hit), never on chord arrivals
    if (!o.lastBar && R() < 0.22) {
      var weak = out.filter(function (e) { return e.part === 'piano' && !e.raw && Math.abs(e.t / 0.5 - Math.round(e.t / 0.5)) < 1e-6 && Math.abs(e.t - Math.round(e.t)) > 0.1 && e.t > 0.6; });
      if (weak.length > 1) { var drop = weak[Math.floor(R() * weak.length)]; out = out.filter(function (e) { return e !== drop; }); }
    }
    // fills at phrase ends: a short drum figure on the last beat leading into the next phrase
    if (phraseEnd8 && pat.perc) {
      var last = barQ - beatQ, fillPart = pat.perc.timbales ? 'timbales' : pat.perc.congas ? 'congas' : pat.perc.drums ? 'drums' : pat.perc.bongos ? 'bongos' : null;
      if (fillPart) {
        out = out.filter(function (e) { return !(e.part === fillPart && e.t >= last - 1e-6); });
        var snd = { timbales: ['timbalHi', 'timbalHi', 'timbalLo', 'timbalLo'], congas: ['congaOpen', 'congaSlap', 'congaOpen', 'tumbaOpen'], drums: ['tamboraRim', 'kick', 'tamboraRim', 'kick'], bongos: ['bongoHi', 'bongoHi', 'bongoLo', 'bongoLo'] }[fillPart];
        if (fillPart === 'drums' && pat.perc.drums.indexOf('t') < 0) snd = ['kick', 'kick', 'kick', 'kick'];
        for (var f = 0; f < 4; f++) out.push({ part: fillPart, t: last + f * beatQ / 4, dur: 0.2, vel: 0.62 + f * 0.1, sound: snd[f], fill: 1 });
      }
    }
    // bass approach note at 4-bar phrase ends when the harmony moves (a chromatic step into the next root)
    if (phraseEnd4 && H) {
      var bs = out.filter(function (e) { return e.part === 'bass' && !e.raw; }), lb = bs[bs.length - 1];
      var nx = chordAt(tl, tl.pickup + (k + 1) * barQ + 0.01), here = chordAt(tl, tl.pickup + k * barQ + barQ - 0.6);
      if (lb && nx && here && !nx.c.nc && nx.sym !== here.sym && lb.t + lb.dur > barQ - 0.5 - 1e-6 && lb.t < barQ - 0.6) {
        var tgt = H.bassNote(nx.c, 'R', 29, 50, lb.midi[0]), ap = tgt + (lb.midi[0] > tgt ? 1 : -1);
        lb.dur = Math.max(0.3, barQ - 0.5 - lb.t - 0.03);
        out.push({ part: 'bass', t: barQ - 0.5, dur: 0.46, vel: 0.78, midi: [ap], approach: 1 });
      }
    }
    var byPart = {};
    out.forEach(function (e) { (byPart[e.part] = byPart[e.part] || []).push(e); });
    // legato bass: notes run into the next one unless the pattern leaves a deliberate rest
    (byPart.bass || []).forEach(function (e, i, a) { if (e.raw) return; var nx2 = a[i + 1]; if (nx2) { var gap = nx2.t - (e.t + e.dur); if (gap > 0 && gap < 0.3) e.dur = nx2.t - e.t - 0.02; } });
    Object.keys(byPart).forEach(function (part) {
      var r = rng(((o.seed || 1) * 977 + (k + 1) * 7919 + partSeed(part)) >>> 0);
      byPart[part].forEach(function (e) {
        if (e.raw) { e.dt = 0; return; } // Band-in-a-Box patterns keep their own velocities and microtiming
        e.dt = humanMs(part, r); // Band-in-a-Box patterns keep their own velocities and microtiming
        var pos = e.t, cpos = Math.round(((o.c0 + pos) % o.cyc) * 4), onBeat = Math.abs(pos / beatQ - Math.round(pos / beatQ)) < 1e-6;
        var a = pos < 1e-6 ? 1.08 : onBeat ? (Math.abs(pos - barQ / 2) < 1e-6 ? 1.03 : 1) : Math.abs(pos * 2 - Math.round(pos * 2)) < 1e-6 ? 0.93 : 0.86;
        if (part === 'piano' || part === 'bass') a = Math.sqrt(a); // patterns already shape these
        if (clv[cpos] && (part === 'piano' || part === 'bass' || part === 'cowbell' || part === 'congas' || part === 'bongos')) a *= 1.08;
        if (o.sid === 'bossa' && (part === 'rim' || part === 'drums') && onBeat && Math.round(pos / beatQ) % 2 === 1) a *= 0.78; // lighter backbeat
        if (o.sid === 'bossa' && part === 'shaker') a *= onBeat ? 1.05 : 0.82;
        if ((o.sid === 'salsa' || o.sid === 'mambo') && part === 'bass' && Math.abs(pos % 4 - 3) < 1e-6) a *= 1.06; // the anticipated bass of the tumbao
        if (part === 'shaker' || part === 'guiro') a *= 0.9 + r() * 0.2;
        e.vel = Math.max(0.12, Math.min(1, e.vel * a * swell * (0.94 + r() * 0.12)));
      });
    });
    out.sort(function (a, b) { return a.t - b.t; });
    return out;
  }

  /* count-in clicks: n bars of the song's beat */
  function countIn(tl, bars) {
    var out = [], per = tl.beatsPerBar || 4, bq = tl.beatQ || 1;
    for (var b = 0; b < bars; b++) for (var i = 0; i < per; i++) out.push({ t: (b * per + i) * bq, accent: i === 0, n: i + 1 });
    return { clicks: out, len: bars * tl.barQ };
  }

  var API = { PARTS: PARTS, STYLES: STYLES, STYLE_ORDER: STYLE_ORDER, styleId: styleId, styleParts: styleParts, buildSong: buildSong, chordAt: chordAt,
    generateBar: generateBar, feel: feel, countIn: countIn, nextChordAfter: nextChordAfter };
  root.LFEngine = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
