/* ===== Latin Fake Book staff renderer (adapted from the Hymn Player) — treble staff, chord symbols above, lyrics below ===== */
(function (root) {
  'use strict';
  var C = root.LFCore, SVGNS = 'http://www.w3.org/2000/svg';
  var measureCtx = document.createElement('canvas').getContext('2d');
  function chordW(t, px) { measureCtx.font = '700 ' + px + 'px ' + (getComputedStyle(document.body).getPropertyValue('--font') || 'sans-serif'); return measureCtx.measureText(t).width; }
  function textW(t, px, bold) { measureCtx.font = (bold ? '700 ' : '') + px + 'px ' + getComputedStyle(document.body).getPropertyValue('--serif'); return measureCtx.measureText(t).width; }
  function glyphFor(d) {
    var bases = [4, 2, 1, 0.5, 0.25, 0.125];
    for (var i = 0; i < bases.length; i++) {
      var b = bases[i];
      if (Math.abs(d - b * 1.75) < 1e-6) return { base: b, dots: 2 };
      if (Math.abs(d - b * 1.5) < 1e-6) return { base: b, dots: 1 };
      if (Math.abs(d - b) < 1e-6) return { base: b, dots: 0 };
    }
    for (var j = 0; j < bases.length; j++) if (d >= bases[j] - 1e-6) return { base: bases[j], dots: d >= bases[j] * 1.5 - 1e-6 ? 1 : 0 };
    return { base: 0.125, dots: 0 };
  }
  var SHARP_STEPS = [38, 35, 39, 36, 33, 37, 34], FLAT_STEPS = [34, 37, 33, 36, 32, 35, 31];
  function render(host, o) {
    var r = o.res, CH = o.chords || {}, hasCh = Object.keys(CH).length > 0;
    var W = Math.max(300, host.clientWidth || 800);
    var sp = W < 420 ? 9.6 : W < 520 ? 10.5 : W < 800 ? 12 : 13.5;           // staff space in px
    var lyrPx = Math.round(sp * (W < 520 ? 1.75 : 1.65)), chPx = Math.round(sp * (W < 520 ? 1.7 : 1.6));
    var disp = o.disp;
    var dn = disp.notes, verse = o.verse || 0;
    var fifths = disp.fifths, nAcc = Math.abs(fifths);
    var clefW = 3.4 * sp, keyW = nAcc * 1.05 * sp + (nAcc ? 0.6 * sp : 0), timeW = r.meter.free ? 0 : 2.6 * sp;
    // measure each element
    var items = []; // {type:'note', n, w} | {type:'bar', el, w}
    var noteEls = r.notes;
    var barAfter = {}; r.elements.forEach(function (e, k) { if (e.type === 'bar' && e.afterNote !== undefined && e.afterNote >= 0) barAfter[e.afterNote] = e; });
    noteEls.forEach(function (n, i) {
      var d = dn[i], g = glyphFor(n.dur), ly = n.lyrics && n.lyrics[verse];
      var lw = ly && ly.text ? textW(ly.text + (ly.hyph ? ' -' : ''), lyrPx) + 0.6 * sp : 0;
      var base = (W < 520 ? 1.7 + Math.min(4, n.dur) * 0.95 : 2.3 + Math.min(4, n.dur) * 1.35) * sp + (d.showAcc !== undefined ? 1.2 * sp : 0) + (g.dots ? 0.6 * sp : 0);
      var cw = CH[i] ? chordW(CH[i], chPx) + 0.9 * sp : 0;
      items.push({ type: 'note', i: i, w: Math.max(base, lw, cw, 2.6 * sp), lw: lw, g: g });
      if (barAfter[i]) items.push({ type: 'bar', el: barAfter[i], w: (barAfter[i].kind === 'single' && !barAfter[i].repEnd && !barAfter[i].repStart ? 1.4 : 2.2) * sp });
    });
    // break into systems: prefer phrase (source line) ends, then bars
    var systems = [], cur = [], curW = 0, usable = W - 10;
    function headW(first) { return clefW + keyW + (first ? timeW : 0) + 0.8 * sp; }
    var lineEnds = {}; noteEls.forEach(function (n, i) { if (i + 1 < noteEls.length && noteEls[i + 1].line !== n.line) lineEnds[i] = true; });
    // group items into "phrases" by source line, and phrases into "bars"
    var phrases = [], ph = [];
    items.forEach(function (it, k) { ph.push(it); var endsLine = it.type === 'bar' ? lineEnds[it.el.afterNote] : (lineEnds[it.i] && !(items[k + 1] && items[k + 1].type === 'bar')); if (endsLine) { phrases.push(ph); ph = []; } });
    if (ph.length) phrases.push(ph);
    function wOf(arr) { return arr.reduce(function (a, b) { return a + b.w; }, 0); }
    phrases.forEach(function (p) {
      var pw = wOf(p), hw = headW(systems.length === 0 && !cur.length);
      if (cur.length && curW + pw <= usable - headW(systems.length === 0)) { cur = cur.concat(p); curW += pw; return; }
      if (cur.length) { systems.push(cur); cur = []; curW = 0; }
      if (pw <= usable - headW(systems.length === 0)) { cur = p.slice(); curW = pw; return; }
      // phrase too long: split at bars
      var bar = [];
      p.forEach(function (it) {
        bar.push(it);
        if (it.type === 'bar') {
          var bw = wOf(bar), lim = usable - headW(systems.length === 0);
          if (cur.length && curW + bw > lim) { systems.push(cur); cur = []; curW = 0; }
          cur = cur.concat(bar); curW += bw; bar = [];
        }
      });
      if (bar.length) { var bw2 = wOf(bar); if (cur.length && curW + bw2 > usable - headW(systems.length === 0)) { systems.push(cur); cur = []; curW = 0; } cur = cur.concat(bar); curW += bw2; }
    });
    if (cur.length) systems.push(cur);
    // vertical metrics
    var topPad = (hasCh ? 6.6 : 4.2) * sp, staffH = 4 * sp, belowStaff = 3.6 * sp, lyrH = r.verseCount ? lyrPx * 1.55 : 0, gap = 1.6 * sp;
    var sysH = topPad + staffH + belowStaff + lyrH + gap;
    var H = systems.length * sysH + 6;
    var svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', 'Music notation with words');
    function el(name, attrs, parent) { var e = document.createElementNS(SVGNS, name); for (var k in attrs) e.setAttribute(k, attrs[k]); (parent || svg).appendChild(e); return e; }
    var hl = el('rect', { class: 'st-hl', x: 0, y: 0, width: 2.8 * sp, height: 1, rx: sp * 0.9 });
    var layout = { notes: {}, sysTop: [], sp: sp, hl: hl, sysH: sysH };
    systems.forEach(function (sys, si) {
      var y0 = si * sysH + topPad, x = 4;
      var first = si === 0;
      layout.sysTop.push(si * sysH);
      var stepY = function (step) { return y0 + staffH - (step - 30) * sp / 2; };
      var natural = wOf(sys), head = headW(first), avail = W - 6 - x - head;
      var isLast = si === systems.length - 1;
      var scale = natural > 0 ? avail / natural : 1;
      if (isLast && scale > 1.35) scale = 1.35; // don't over-stretch a short last line
      if (scale > 2.2) scale = 2.2;
      var endX = x + head + natural * scale;
      for (var l = 0; l < 5; l++) el('line', { class: 'st-line', x1: x, x2: endX, y1: y0 + l * sp, y2: y0 + l * sp });
      el('line', { class: 'st-bar', x1: x, x2: x, y1: y0, y2: y0 + staffH });
      drawClef(el, x + 0.5 * sp, y0 + 3 * sp, sp);
      var kx = x + clefW;
      for (var a = 0; a < nAcc; a++) {
        var st = fifths > 0 ? SHARP_STEPS[a] : FLAT_STEPS[a];
        drawAcc(el, svg, fifths > 0 ? 1 : -1, kx + a * 1.05 * sp + 0.5 * sp, stepY(st), sp, 'st-ink');
      }
      var tx = kx + keyW;
      if (first && !r.meter.free) {
        var fs = sp * 2.15;
        var tnum = r.meter.symbol === 'C' ? 'C' : r.meter.num, tden = r.meter.den;
        if (r.meter.symbol === 'C' || r.meter.symbol === 'C|') { var tt = el('text', { x: tx + 0.9 * sp, y: y0 + 2.75 * sp, 'font-size': fs * 1.2, 'font-weight': 700, 'text-anchor': 'middle', class: 'st-ink', 'font-family': 'Georgia,serif' }); tt.textContent = 'C'; }
        else {
          var t1 = el('text', { x: tx + 1.0 * sp, y: y0 + 1.82 * sp, 'font-size': fs, 'font-weight': 800, 'text-anchor': 'middle', class: 'st-ink', 'font-family': 'Georgia,"Times New Roman",serif' }); t1.textContent = tnum;
          var t2 = el('text', { x: tx + 1.0 * sp, y: y0 + 3.82 * sp, 'font-size': fs, 'font-weight': 800, 'text-anchor': 'middle', class: 'st-ink', 'font-family': 'Georgia,"Times New Roman",serif' }); t2.textContent = tden;
        }
      }
      var cx = x + head;
      var lyrY = y0 + staffH + belowStaff + lyrPx * 0.95;
      var beamQueue = [];
      sys.forEach(function (it, k) {
        var w = it.w * scale;
        if (it.type === 'bar') {
          drawBar(el, it.el, cx + w * 0.45, y0, staffH, sp, isLast && k === sys.length - 1);
          cx += w; return;
        }
        var n = noteEls[it.i], d = dn[it.i], nx = cx + Math.max(Math.min(w * 0.42, 1.6 * sp + (d.showAcc !== undefined ? 1 * sp : 0)), it.lw / 2);
        var g = it.g, grp = el('g', { class: 'st-note', 'data-i': it.i });
        var info = { x: nx, sys: si, y0: y0, cx: cx, w: w };
        if (n.rest) { if (!n.invisible) drawRest(el, grp, g, nx, y0, sp); }
        else {
          var y = stepY(d.step), up = d.step < 34;
          info.y = y;
          // ledger lines
          for (var ls = 28; ls >= d.step; ls -= 2) el('line', { class: 'st-line ledger', x1: nx - 1.05 * sp, x2: nx + 1.05 * sp, y1: stepY(ls), y2: stepY(ls), 'stroke-width': 1.3 }, grp);
          for (var hs = 40; hs <= d.step; hs += 2) el('line', { class: 'st-line ledger', x1: nx - 1.05 * sp, x2: nx + 1.05 * sp, y1: stepY(hs), y2: stepY(hs), 'stroke-width': 1.3 }, grp);
          var hollow = g.base >= 2;
          el('ellipse', { class: 'head' + (hollow ? ' hollow' : ''), cx: nx, cy: y, rx: sp * 0.66, ry: sp * 0.47, transform: 'rotate(-20 ' + nx + ' ' + y + ')',
            fill: hollow ? 'none' : 'var(--ink)', stroke: hollow ? 'var(--ink)' : 'none', 'stroke-width': hollow ? sp * 0.17 : 0 }, grp);
          if (hollow) el('ellipse', { class: 'head', cx: nx, cy: y, rx: sp * 0.66, ry: sp * 0.47, transform: 'rotate(-20 ' + nx + ' ' + y + ')', fill: 'transparent' }, grp);
          if (d.showAcc !== undefined) drawAcc(el, grp, d.showAcc, nx - 1.55 * sp, y, sp, 'st-ink');
          for (var dt = 0; dt < g.dots; dt++) el('circle', { class: 'dot st-ink', cx: nx + sp * (1.1 + dt * 0.55), cy: (d.step % 2 === 0 ? y - sp / 2 : y), r: sp * 0.17 }, grp);
          if (g.base < 4) {
            var stemX = up ? nx + sp * 0.58 : nx - sp * 0.58, stemY2 = up ? y - 3.4 * sp : y + 3.4 * sp;
            if (up && d.step < 26) stemY2 = stepY(34); if (!up && d.step > 42) stemY2 = stepY(34);
            var stem = el('line', { class: 'stem st-stroke', x1: stemX, x2: stemX, y1: y + (up ? -0.15 : 0.15) * sp, y2: stemY2, 'stroke-width': sp * 0.12 }, grp);
            info.stem = { el: stem, x: stemX, y2: stemY2, up: up, base: g.base, grp: grp };
            if (g.base <= 0.5) beamQueue.push({ i: it.i, info: info, n: n });
            else flushBeams();
          } else flushBeams();
          // tie to next
          if (n.tie && noteEls[it.i + 1] && noteEls[it.i + 1].tiedFrom === it.i) info.tieOut = true;
        }
        if (n.rest || g.base > 0.5) flushBeams();
        else if (n.spaceAfter || (n.barAfter) || k === sys.length - 1 || beatEnd(n)) flushBeams();
        // lyric
        var ly = n.lyrics && n.lyrics[verse];
        if (ly && (ly.text || ly.hold)) {
          if (ly.text) {
            var tEl = el('text', { class: 'lyr', x: nx, y: lyrY, 'font-size': lyrPx, 'text-anchor': 'middle', 'data-i': it.i });
            tEl.textContent = ly.text; info.lyr = tEl;
            if (ly.hyph) info.hyph = true;
          }
        }
        if (CH[it.i]) { var ct = el('text', { class: 'chordsym', x: cx + 0.15 * sp, y: y0 - Math.max(2.4 * sp, (y0 - (info.y || y0)) + 1.6 * sp) , 'font-size': chPx, 'data-i': it.i }); ct.textContent = CH[it.i]; if (y0 - (info.y || y0) > 3.6 * sp) ct.setAttribute('y', y0 - 4.9 * sp); else ct.setAttribute('y', y0 - 2.6 * sp); info.ch = ct; }
        layout.notes[it.i] = info;
        cx += w;
      });
      flushBeams();
      function beatEnd(n) { var beat = r.meter.den === 8 && r.meter.num % 3 === 0 ? 1.5 : (r.meter.den === 2 ? 2 : 1); var e = n.start + n.dur; return Math.abs(e / beat - Math.round(e / beat)) < 1e-6; }
      function flushBeams() {
        if (!beamQueue.length) return;
        var q = beamQueue; beamQueue = [];
        if (q.length === 1) { drawFlag(el, q[0].info.stem, sp); return; }
        var ups = q.reduce(function (a, b) { return a + (b.info.stem.up ? 1 : 0); }, 0) >= q.length / 2;
        var ys = q.map(function (b) { return b.info.y; });
        var ext = ups ? Math.min.apply(null, ys) - 3.2 * sp : Math.max.apply(null, ys) + 3.2 * sp;
        q.forEach(function (b) {
          var s = b.info.stem, sx = ups ? b.info.x + sp * 0.58 : b.info.x - sp * 0.58;
          s.el.setAttribute('x1', sx); s.el.setAttribute('x2', sx); s.el.setAttribute('y2', ext); s.el.setAttribute('y1', b.info.y + (ups ? -0.15 : 0.15) * sp); s.x = sx;
        });
        var bt = sp * 0.48, x1 = q[0].info.stem.x, x2 = q[q.length - 1].info.stem.x;
        var beam = el('path', { class: 'st-ink', d: 'M' + x1 + ' ' + ext + 'L' + x2 + ' ' + ext + 'L' + x2 + ' ' + (ext + (ups ? bt : -bt)) + 'L' + x1 + ' ' + (ext + (ups ? bt : -bt)) + 'Z' });
        q.forEach(function (b) { b.info.beam = beam; });
        // secondary beams for 16ths
        q.forEach(function (b, k2) {
          if (b.info.stem.base > 0.25) return;
          var y2 = ext + (ups ? 1 : -1) * bt * 1.7, sx = b.info.stem.x, ex;
          var nb = q[k2 + 1], pb = q[k2 - 1];
          if (nb && nb.info.stem.base <= 0.25) ex = nb.info.stem.x; else if (pb && pb.info.stem.base > 0.25) ex = sx - 1.2 * sp; else if (!nb) ex = sx - 1.2 * sp; else ex = sx + 1.2 * sp;
          if (pb && pb.info.stem.base <= 0.25) return;
          el('path', { class: 'st-ink', d: 'M' + sx + ' ' + y2 + 'L' + ex + ' ' + y2 + 'L' + ex + ' ' + (y2 + (ups ? bt : -bt)) + 'L' + sx + ' ' + (y2 + (ups ? bt : -bt)) + 'Z' });
        });
      }
    });
    // ties & hyphens & extenders
    Object.keys(layout.notes).forEach(function (k) {
      var a = layout.notes[k], i = +k;
      if (a.tieOut && layout.notes[i + 1]) {
        var b = layout.notes[i + 1], up = dn[i].step >= 34, yy = a.y + (up ? -0.8 : 0.8) * sp;
        if (b.sys === a.sys) el('path', { class: 'st-stroke', 'stroke-width': sp * 0.13, d: 'M' + (a.x + 0.7 * sp) + ' ' + yy + ' Q' + ((a.x + b.x) / 2) + ' ' + (yy + (up ? -1.2 : 1.2) * sp) + ' ' + (b.x - 0.7 * sp) + ' ' + yy });
        else el('path', { class: 'st-stroke', 'stroke-width': sp * 0.13, d: 'M' + (a.x + 0.7 * sp) + ' ' + yy + ' q' + (1.4 * sp) + ' ' + ((up ? -1 : 1) * sp) + ' ' + (2.8 * sp) + ' 0' });
      }
      if (a.hyph && a.lyr) {
        // find next syllable in same verse
        for (var j = i + 1; j < noteEls.length; j++) { var lj = noteEls[j].lyrics && noteEls[j].lyrics[verse]; if (lj && lj.text) break; }
        var bnext = layout.notes[j];
        var lw = textW(noteEls[i].lyrics[verse].text, lyrPx);
        var hx = bnext && bnext.sys === a.sys ? ((a.x + lw / 2) + (bnext.x - textW(noteEls[j].lyrics[verse].text, lyrPx) / 2)) / 2 : a.x + lw / 2 + 0.7 * sp;
        var hy = el('text', { class: 'lyr', x: hx, y: lyrY_of(a), 'font-size': lyrPx, 'text-anchor': 'middle' }); hy.textContent = '-';
      }
      var ly = noteEls[i].lyrics && noteEls[i].lyrics[verse];
      if (ly && ly.extend && a.lyr && !ly.hyph) {
        // extender line under held notes
        var last = i;
        for (var m = i + 1; m < noteEls.length; m++) { var lm = noteEls[m].lyrics && noteEls[m].lyrics[verse]; if (lm && lm.hold) last = m; else break; }
        var e = layout.notes[last];
        if (e && e.sys === a.sys && last > i) el('line', { class: 'st-line', x1: a.x + textW(ly.text, lyrPx) / 2 + 2, x2: e.x + 0.6 * sp, y1: lyrY_of(a) + 2, y2: lyrY_of(a) + 2, 'stroke-width': 1.2 });
      }
    });
    function lyrY_of(a) { return a.y0 + staffH + belowStaff + lyrPx * 0.95; }
    hl.setAttribute('height', staffH + 5.4 * sp + (lyrH ? lyrH * 0.9 : 0));
    host.innerHTML = ''; host.appendChild(svg);
    svg.addEventListener('click', function (ev) {
      var g = ev.target.closest('[data-i]'); if (!g) return;
      if (o.onTap) o.onTap(+g.getAttribute('data-i'));
    });
    return layout;
  }
  function drawClef(el, x, yG, sp) {
    // treble clef drawn as strokes; yG = y of the G line
    var s = sp, d = function (pts) { return pts; };
    var path = 'M' + (x + 1.05 * s) + ',' + (yG + 0.25 * s) +
      ' C' + (x + 0.55 * s) + ',' + (yG + 0.25 * s) + ' ' + (x + 0.45 * s) + ',' + (yG - 0.6 * s) + ' ' + (x + 1.05 * s) + ',' + (yG - 0.8 * s) +
      ' C' + (x + 1.85 * s) + ',' + (yG - 1.0 * s) + ' ' + (x + 2.25 * s) + ',' + (yG + 0.05 * s) + ' ' + (x + 1.8 * s) + ',' + (yG + 0.75 * s) +
      ' C' + (x + 1.35 * s) + ',' + (yG + 1.35 * s) + ' ' + (x + 0.1 * s) + ',' + (yG + 1.25 * s) + ' ' + (x + 0.05 * s) + ',' + (yG + 0.15 * s) +
      ' C' + (x + 0.0 * s) + ',' + (yG - 0.95 * s) + ' ' + (x + 1.05 * s) + ',' + (yG - 1.75 * s) + ' ' + (x + 1.5 * s) + ',' + (yG - 2.6 * s) +
      ' C' + (x + 1.95 * s) + ',' + (yG - 3.4 * s) + ' ' + (x + 1.8 * s) + ',' + (yG - 4.25 * s) + ' ' + (x + 1.45 * s) + ',' + (yG - 4.2 * s) +
      ' C' + (x + 1.0 * s) + ',' + (yG - 4.1 * s) + ' ' + (x + 0.85 * s) + ',' + (yG - 3.1 * s) + ' ' + (x + 1.0 * s) + ',' + (yG - 2.3 * s) +
      ' L' + (x + 1.42 * s) + ',' + (yG + 1.95 * s) +
      ' C' + (x + 1.5 * s) + ',' + (yG + 2.6 * s) + ' ' + (x + 0.95 * s) + ',' + (yG + 2.75 * s) + ' ' + (x + 0.65 * s) + ',' + (yG + 2.45 * s);
    el('path', { class: 'st-stroke', d: path, 'stroke-width': s * 0.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' });
    el('circle', { class: 'st-ink', cx: x + 0.78 * s, cy: yG + 2.3 * s, r: s * 0.33 });
  }
  function drawAcc(el, parent, a, x, y, sp, cls) {
    var g = el('g', { class: 'acc' }, parent), s = sp, p;
    if (a === 1 || a === 2) {
      if (a === 2) { el('path', { class: cls, d: 'M' + (x - .5 * s) + ' ' + (y - .5 * s) + 'l' + s + ' ' + s + 'm0 -' + s + 'l-' + s + ' ' + s, stroke: 'var(--ink)', 'stroke-width': s * .22 }, g); return; }
      p = 'M' + (x - .3 * s) + ' ' + (y - 1.3 * s) + 'v2.7' .replace('2.7', 2.7 * s) + '';
      el('path', { class: cls, d: 'M' + (x - .28 * s) + ' ' + (y - 1.35 * s) + 'L' + (x - .28 * s) + ' ' + (y + 1.45 * s) + 'L' + (x - .14 * s) + ' ' + (y + 1.45 * s) + 'L' + (x - .14 * s) + ' ' + (y - 1.35 * s) + 'Z' +
        'M' + (x + .18 * s) + ' ' + (y - 1.45 * s) + 'L' + (x + .18 * s) + ' ' + (y + 1.35 * s) + 'L' + (x + .32 * s) + ' ' + (y + 1.35 * s) + 'L' + (x + .32 * s) + ' ' + (y - 1.45 * s) + 'Z' +
        'M' + (x - .62 * s) + ' ' + (y - .3 * s) + 'L' + (x + .62 * s) + ' ' + (y - .62 * s) + 'L' + (x + .62 * s) + ' ' + (y - .26 * s) + 'L' + (x - .62 * s) + ' ' + (y + .06 * s) + 'Z' +
        'M' + (x - .62 * s) + ' ' + (y + .45 * s) + 'L' + (x + .62 * s) + ' ' + (y + .13 * s) + 'L' + (x + .62 * s) + ' ' + (y + .49 * s) + 'L' + (x - .62 * s) + ' ' + (y + .81 * s) + 'Z' }, g);
    } else if (a === -1 || a === -2) {
      var fl = function (xx) { el('path', { class: cls, d: 'M' + (xx - .35 * s) + ' ' + (y - 1.9 * s) + 'L' + (xx - .35 * s) + ' ' + (y + .55 * s) + 'C' + (xx + .2 * s) + ' ' + (y + .2 * s) + ' ' + (xx + .75 * s) + ' ' + (y - .1 * s) + ' ' + (xx + .55 * s) + ' ' + (y - .55 * s) + 'C' + (xx + .35 * s) + ' ' + (y - .95 * s) + ' ' + (xx - .05 * s) + ' ' + (y - .7 * s) + ' ' + (xx - .2 * s) + ' ' + (y - .45 * s) + 'L' + (xx - .2 * s) + ' ' + (y - 1.9 * s) + 'Z' +
        'M' + (xx - .2 * s) + ' ' + (y - .2 * s) + 'C' + (xx - .02 * s) + ' ' + (y - .5 * s) + ' ' + (xx + .4 * s) + ' ' + (y - .55 * s) + ' ' + (xx + .25 * s) + ' ' + (y - .15 * s) + 'C' + (xx + .15 * s) + ' ' + (y + .05 * s) + ' ' + (xx - .05 * s) + ' ' + (y + .2 * s) + ' ' + (xx - .2 * s) + ' ' + (y + .3 * s) + 'Z', 'fill-rule': 'evenodd' }, g); };
      fl(x); if (a === -2) fl(x - .75 * s);
    } else {
      el('path', { class: cls, d: 'M' + (x - .4 * s) + ' ' + (y - 1.5 * s) + 'L' + (x - .4 * s) + ' ' + (y + .55 * s) + 'L' + (x - .26 * s) + ' ' + (y + .55 * s) + 'L' + (x - .26 * s) + ' ' + (y - 1.5 * s) + 'Z' +
        'M' + (x + .26 * s) + ' ' + (y - .55 * s) + 'L' + (x + .26 * s) + ' ' + (y + 1.5 * s) + 'L' + (x + .4 * s) + ' ' + (y + 1.5 * s) + 'L' + (x + .4 * s) + ' ' + (y - .55 * s) + 'Z' +
        'M' + (x - .4 * s) + ' ' + (y - .3 * s) + 'L' + (x + .4 * s) + ' ' + (y - .55 * s) + 'L' + (x + .4 * s) + ' ' + (y - .2 * s) + 'L' + (x - .4 * s) + ' ' + (y + .05 * s) + 'Z' +
        'M' + (x - .4 * s) + ' ' + (y + .5 * s) + 'L' + (x + .4 * s) + ' ' + (y + .25 * s) + 'L' + (x + .4 * s) + ' ' + (y + .6 * s) + 'L' + (x - .4 * s) + ' ' + (y + .85 * s) + 'Z' }, g);
    }
  }
  function drawFlag(el, st, sp) {
    var n = st.base <= 0.125 ? 3 : st.base <= 0.25 ? 2 : 1, s = sp;
    for (var k = 0; k < n; k++) {
      var yy = st.y2 + (st.up ? 1 : -1) * k * 0.85 * s, dir = st.up ? 1 : -1;
      el('path', { class: 'flag st-ink', d: 'M' + st.x + ' ' + yy + 'C' + (st.x + .2 * s) + ' ' + (yy + dir * 1.0 * s) + ' ' + (st.x + 1.5 * s) + ' ' + (yy + dir * 1.3 * s) + ' ' + (st.x + 1.0 * s) + ' ' + (yy + dir * 2.6 * s) +
        'C' + (st.x + 1.2 * s) + ' ' + (yy + dir * 1.6 * s) + ' ' + (st.x + .5 * s) + ' ' + (yy + dir * 1.35 * s) + ' ' + st.x + ' ' + (yy + dir * 1.0 * s) + 'Z' }, st.grp);
    }
  }
  function drawRest(el, grp, g, x, y0, sp) {
    var s = sp, b = g.base;
    if (b >= 4) el('rect', { class: 'head st-ink', x: x - .65 * s, y: y0 + s, width: 1.3 * s, height: .5 * s }, grp);
    else if (b >= 2) el('rect', { class: 'head st-ink', x: x - .65 * s, y: y0 + 1.5 * s, width: 1.3 * s, height: .5 * s }, grp);
    else if (b >= 1) el('path', { class: 'head st-stroke', 'stroke-width': s * .28, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', d: 'M' + (x - .3 * s) + ' ' + (y0 + .6 * s) + 'L' + (x + .45 * s) + ' ' + (y0 + 1.5 * s) + 'L' + (x - .3 * s) + ' ' + (y0 + 2.3 * s) + 'L' + (x + .4 * s) + ' ' + (y0 + 3.0 * s) + 'C' + (x - .5 * s) + ' ' + (y0 + 2.7 * s) + ' ' + (x - .5 * s) + ' ' + (y0 + 3.4 * s) + ' ' + (x + .05 * s) + ' ' + (y0 + 3.6 * s) }, grp);
    else { el('path', { class: 'head st-stroke', 'stroke-width': s * .16, d: 'M' + (x + .5 * s) + ' ' + (y0 + 1.6 * s) + 'L' + (x - .2 * s) + ' ' + (y0 + 3.4 * s) }, grp); el('circle', { class: 'head st-ink', cx: x - .2 * s, cy: y0 + 1.75 * s, r: .32 * s }, grp); el('path', { class: 'head st-stroke', 'stroke-width': s * .14, d: 'M' + (x - .2 * s) + ' ' + (y0 + 1.95 * s) + 'Q' + (x + .2 * s) + ' ' + (y0 + 2.0 * s) + ' ' + (x + .5 * s) + ' ' + (y0 + 1.6 * s) }, grp); }
    if (g.dots) el('circle', { class: 'dot st-ink', cx: x + 1.0 * s, cy: y0 + 1.5 * s, r: s * .17 }, grp);
  }
  function drawBar(el, b, x, y0, h, sp, isEnd) {
    var thin = 1.4, thick = sp * 0.45;
    var dots = function (xx) { el('circle', { class: 'st-ink', cx: xx, cy: y0 + 1.5 * sp, r: sp * .2 }); el('circle', { class: 'st-ink', cx: xx, cy: y0 + 2.5 * sp, r: sp * .2 }); };
    if (b.kind === 'final' || (isEnd && b.kind !== 'single')) {
      el('line', { class: 'st-bar', x1: x - .5 * sp, x2: x - .5 * sp, y1: y0, y2: y0 + h });
      el('rect', { class: 'st-ink', x: x, y: y0, width: thick, height: h });
      if (b.repEnd) dots(x - 1.1 * sp);
      return;
    }
    if (b.repEnd || b.repStart) {
      if (b.repEnd) { dots(x - 1.0 * sp); el('line', { class: 'st-bar', x1: x - .4 * sp, x2: x - .4 * sp, y1: y0, y2: y0 + h }); }
      el('rect', { class: 'st-ink', x: x - thick / 2 + (b.repEnd && !b.repStart ? .2 * sp : 0), y: y0, width: thick, height: h });
      if (b.repStart) { el('line', { class: 'st-bar', x1: x + .5 * sp, x2: x + .5 * sp, y1: y0, y2: y0 + h }); dots(x + 1.05 * sp); }
      return;
    }
    if (b.kind === 'double') { el('line', { class: 'st-bar', x1: x - .3 * sp, x2: x - .3 * sp, y1: y0, y2: y0 + h }); el('line', { class: 'st-bar', x1: x + .1 * sp, x2: x + .1 * sp, y1: y0, y2: y0 + h }); return; }
    el('line', { class: 'st-bar', x1: x, x2: x, y1: y0, y2: y0 + h, 'stroke-width': thin });
  }
  root.LFStaff = { render: render };
})(window);
