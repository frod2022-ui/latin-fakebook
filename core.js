/* ===== Latin Fake Book core (adapted from the Hymn Player core): ABC parser with chord symbols, lyrics, MIDI & MusicXML import, spelling ===== */
(function (root) {
  'use strict';
  var LETTERS = 'CDEFGAB';
  var NAT = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  var SHARP_ORDER = 'FCGDAEB', FLAT_ORDER = 'BEADGCF';
  var MAJOR_FIFTHS = { 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'F#': 6, 'C#': 7, 'F': -1, 'Bb': -2, 'Eb': -3, 'Ab': -4, 'Db': -5, 'Gb': -6, 'Cb': -7 };
  var MODE_SHIFT = { maj: 0, ion: 0, mix: -1, dor: -2, aeo: -3, m: -3, min: -3, phr: -4, loc: -5, lyd: 1 };
  var NOTE_NAMES_SHARP = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];

  function ParseError(msg, line, col) { this.message = msg; this.line = line; this.col = col; }

  function fifthsToAcc(fifths) {
    var acc = { C: 0, D: 0, E: 0, F: 0, G: 0, A: 0, B: 0 }, i;
    if (fifths > 0) for (i = 0; i < Math.min(fifths, 7); i++) acc[SHARP_ORDER[i]] = 1;
    if (fifths < 0) for (i = 0; i < Math.min(-fifths, 7); i++) acc[FLAT_ORDER[i]] = -1;
    return acc;
  }
  function majorTonicFromFifths(f) {
    for (var k in MAJOR_FIFTHS) if (MAJOR_FIFTHS[k] === f) return k;
    return 'C';
  }
  function prettyKey(name) { return name.replace(/#/g, '♯').replace(/b(?=$|\s|m)/, '♭'); }

  /* Parse a K: field value. Returns {fifths, acc, tonic, mode, name} or null if invalid */
  function parseKey(str) {
    var s = (str || '').replace(/%.*$/, '').trim();
    // strip clef/other assignments
    s = s.replace(/\b(clef|middle|transpose|octave|stafflines|t|m)\s*=\s*\S+/gi, '').replace(/\b(treble|bass|alto|tenor|perc|none)\b(?=\s|$)/gi, function (w) { return w.toLowerCase() === 'none' ? 'NONE' : ''; }).trim();
    if (s === '' || /^NONE$/.test(s)) return { fifths: 0, acc: fifthsToAcc(0), tonic: 'C', mode: 'maj', name: s === '' ? 'C' : 'none' };
    if (/^H[Pp]/.test(s)) return { fifths: 2, acc: fifthsToAcc(2), tonic: 'D', mode: 'maj', name: 'HP' };
    var m = s.match(/^([A-Ga-g])([#b♯♭]?)\s*([A-Za-z]*)\s*(.*)$/);
    if (!m) return null;
    var tonic = m[1].toUpperCase() + (m[2] === '#' || m[2] === '♯' ? '#' : m[2] ? 'b' : '');
    var modeWord = (m[3] || '').toLowerCase();
    var mode = 'maj';
    if (modeWord) {
      var mk = modeWord === 'm' ? 'm' : modeWord.slice(0, 3);
      if (!(mk in MODE_SHIFT)) {
        if (/^[\^_=]/.test(m[3])) { m[4] = m[3] + ' ' + m[4]; } else return null;
      } else mode = mk;
    }
    // fifths of tonic as major
    var base = MAJOR_FIFTHS[tonic];
    if (base === undefined) {
      // e.g. G# major or D# : compute via circle
      var pcs = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
      var pc = (pcs[tonic[0]] + (tonic[1] === '#' ? 1 : tonic[1] === 'b' ? -1 : 0) + 12) % 12;
      base = ((pc * 7) % 12); if (base > 6) base -= 12;
      if (tonic[1] === '#' && base < 0) base += 12;
    }
    var fifths = base + MODE_SHIFT[mode];
    var acc = fifthsToAcc(fifths);
    // explicit accidentals e.g. ^f _b =c
    var rest = (m[4] || '').trim();
    var em, re = /(\^\^|__|\^|_|=)([A-Ga-g])/g;
    while ((em = re.exec(rest))) acc[em[2].toUpperCase()] = em[1] === '^' ? 1 : em[1] === '_' ? -1 : em[1] === '^^' ? 2 : em[1] === '__' ? -2 : 0;
    var nice = tonic + (mode === 'maj' ? '' : mode === 'm' || mode === 'min' || mode === 'aeo' ? 'm' : ' ' + mode);
    return { fifths: fifths, acc: acc, tonic: tonic, mode: mode, name: nice };
  }

  function parseFraction(s) {
    var m = String(s).trim().match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) return +m[1] / +m[2];
    if (/^\d+(\.\d+)?$/.test(String(s).trim())) return +s;
    return null;
  }
  function parseMeter(s) {
    s = (s || '').replace(/%.*$/, '').trim();
    if (s === 'C') return { num: 4, den: 4, text: '4/4', symbol: 'C' };
    if (s === 'C|') return { num: 2, den: 2, text: '2/2', symbol: 'C|' };
    if (/^none$/i.test(s) || s === '') return { num: 4, den: 4, text: '', free: true };
    var m = s.match(/^\(?([\d+]+)\)?\s*\/\s*(\d+)/);
    if (!m) return null;
    var num = m[1].split('+').reduce(function (a, b) { return a + (+b || 0); }, 0);
    return { num: num, den: +m[2], text: num + '/' + m[2] };
  }
  function parseTempo(s, unitWhole) {
    s = (s || '').replace(/"[^"]*"/g, '').replace(/%.*$/, '').trim();
    var m = s.match(/(\d+\s*\/\s*\d+(?:\s+\d+\s*\/\s*\d+)*)\s*=\s*(\d+)/);
    if (m) {
      var beat = m[1].split(/\s+/).reduce(function (a, f) { return a + (parseFraction(f) || 0); }, 0);
      return { bpm: +m[2] * beat * 4, beatWhole: beat }; // convert to quarter-notes per minute
    }
    m = s.match(/^(\d+)$/);
    if (m) return { bpm: +m[1] * (unitWhole || 0.25) * 4, beatWhole: unitWhole || 0.25 };
    return null;
  }

  /* ---------- lyric tokenizer (ABC 2.1 section 5.1) ---------- */
  function tokenizeLyrics(text) {
    var toks = [], cur = '', i, ch, lastWasHyph = false;
    function push(hyph) { toks.push({ t: 'syl', text: cur, hyph: hyph }); cur = ''; }
    for (i = 0; i < text.length; i++) {
      ch = text[i];
      if (ch === '\\' && text[i + 1] === '-') { cur += '-'; i++; continue; }
      if (ch === ' ' || ch === '\t') { if (cur) { push(false); lastWasHyph = false; } continue; }
      if (ch === '-') {
        if (cur) { push(true); lastWasHyph = true; }
        else if (lastWasHyph) { toks.push({ t: 'skip', cont: true }); }
        else { lastWasHyph = true; }
        continue;
      }
      if (ch === '_') { if (cur) push(false); toks.push({ t: 'hold' }); lastWasHyph = false; continue; }
      if (ch === '*') { if (cur) push(false); toks.push({ t: 'skip' }); lastWasHyph = false; continue; }
      if (ch === '|') { if (cur) push(false); toks.push({ t: 'bar' }); lastWasHyph = false; continue; }
      if (ch === '~') { cur += ' '; continue; }
      cur += ch; lastWasHyph = false;
    }
    if (cur) push(false);
    return toks;
  }
  function stripVerseNumber(s) { return s.replace(/^\s*\d+\.\s*/, ''); }

  function alignLyrics(notes, text, verse) {
    var toks = tokenizeLyrics(text), idx = 0, first = true, placed = 0, last = null;
    for (var k = 0; k < toks.length; k++) {
      var tk = toks[k];
      if (tk.t === 'bar') {
        if (idx > 0) { var b = notes[idx - 1].bar; while (idx < notes.length && notes[idx].bar === b) idx++; }
        continue;
      }
      if (idx >= notes.length) return { overflow: toks.length - k };
      var n = notes[idx];
      if (!n.lyrics) n.lyrics = [];
      if (tk.t === 'syl') {
        var txt = tk.text;
        if (first) { txt = stripVerseNumber(txt); first = false; if (!txt) { continue; } }
        n.lyrics[verse] = { text: txt, hyph: tk.hyph };
        last = n.lyrics[verse]; placed++;
      } else if (tk.t === 'hold') {
        n.lyrics[verse] = { text: '', hold: true };
        if (last) last.extend = true;
      } else if (tk.t === 'skip') {
        if (tk.cont) n.lyrics[verse] = { text: '', cont: true };
      }
      idx++;
    }
    return { placed: placed, unused: notes.length - idx };
  }

  /* ---------- the ABC parser ---------- */
  function parseABC(src) {
    var res = {
      title: '', subtitles: [], composer: [], meter: { num: 4, den: 4, text: '4/4' }, unit: null, tempo: null,
      key: parseKey('C'), notes: [], elements: [], verseCount: 0, verseLabels: [], extraVerses: [], errors: [], warnings: [], info: {}
    };
    if (typeof src !== 'string') src = String(src || '');
    var lines = src.replace(/\r\n?/g, '\n').split('\n');
    var inHeader = false, sawX = false, bodyStarted = false;
    var unit = null; // fraction of a whole note
    var keyAcc = res.key.acc, curKey = res.key, meter = res.meter;
    var firstVoice = null, curVoice = null;
    var barNo = 0, barAcc = {}, music = [], lineIdx = 0;
    var pendingNotes = [], groupNotes = [], verseInGroup = 0, lastLineWasLyric = false, groupHasAny = false;
    var Wlines = [];
    var tupletLeft = 0, tupletFactor = 1, brokenNext = 1, lastNote = null, pendingTieFrom = null;
    var anyHeaderK = false, overlaySkip = false, lastDecor = [], curSrcLine = 0, pendingChord = null;

    function unitQ() { return (unit || defaultUnit()) * 4; }
    function defaultUnit() { return (meter.num / meter.den) < 0.75 ? 1 / 16 : 1 / 8; }
    function err(msg, ln, col) { res.errors.push({ message: msg, line: ln + 1, col: (col || 0) + 1 }); }
    function voiceOk() { return firstVoice === null || curVoice === firstVoice; }
    function handleVoice(v) {
      var id = (v || '').trim().split(/\s+/)[0];
      if (!id) return;
      if (firstVoice === null) firstVoice = id;
      curVoice = id;
    }
    function applyField(letter, value, ln, inline) {
      value = value.replace(/(^|[^\\])%.*$/, '$1').trim();
      switch (letter) {
        case 'T': if (!res.title) res.title = value; else res.subtitles.push(value); break;
        case 'C': res.composer.push(value); break;
        case 'M': { var mt = parseMeter(value); if (!mt) err('The time signature "M:' + value + '" isn\'t one I understand. Try something like M:4/4 or M:3/4.', ln); else { meter = mt; if (!bodyStarted) res.meter = mt; } break; }
        case 'L': { var f = parseFraction(value); if (!f) err('The note length "L:' + value + '" should look like L:1/4 or L:1/8.', ln); else unit = f; break; }
        case 'Q': { var t = parseTempo(value, unit || defaultUnit()); if (t && !res.tempo) res.tempo = t; break; }
        case 'K': {
          var k = parseKey(value);
          if (!k) { err('I don\'t recognise the key "K:' + value + '". Try K:G, K:D, K:F, K:Bb or K:Am.', ln); k = parseKey('C'); }
          if (!voiceOk() && bodyStarted) break;
          curKey = k; keyAcc = k.acc;
          if (!anyHeaderK) { res.key = k; anyHeaderK = true; }
          if (/(\b|\s)V:/.test(value)) {}
          break;
        }
        case 'V': handleVoice(value); break;
        case 'X': sawX = true; break;
        default:
          if (!inline) res.info[letter] = (res.info[letter] ? res.info[letter] + '\n' : '') + value;
      }
    }

    function newNote(o) {
      o.i = res.notes.length; o.bar = barNo; o.line = lineIdx; o.srcLine = curSrcLine; o.lyrics = [];
      res.notes.push(o); res.elements.push({ type: 'note', n: o.i }); return o;
    }

    function parseMusicLine(s, ln) {
      var i = 0, L = s.length;
      // continuation handled by caller
      while (i < L) {
        var ch = s[i];
        if (overlaySkip && ch !== '|' && ch !== ':') { i++; continue; }
        if (ch === ' ' || ch === '\t') { if (lastNote) lastNote.spaceAfter = true; i++; continue; }
        if (ch === '%') break;
        if (ch === '\\') { i++; continue; }
        if (ch === '`' || ch === '$' || ch === ')' || ch === 'y') { i++; continue; }
        if (ch === '"') { var e = s.indexOf('"', i + 1); if (e < 0) { err('A chord name or text in quotes (") was not closed.', ln, i); return; }
          var qt = s.slice(i + 1, e).trim(); if (qt && '^_<>@'.indexOf(qt[0]) < 0) pendingChord = qt; i = e + 1; continue; }
        if (ch === '!' || ch === '+') {
          var e2 = s.indexOf(ch, i + 1);
          if (e2 < 0) { err('A decoration starting with "' + ch + '" was not closed.', ln, i); return; }
          i = e2 + 1; continue;
        }
        if (ch === '{') { var e3 = s.indexOf('}', i + 1); if (e3 < 0) { err('Grace notes in { } were not closed with "}".', ln, i); return; } i = e3 + 1; continue; }
        if ('.~HLMOPSTuvJRt'.indexOf(ch) >= 0) { i++; continue; }
        if (ch === '&') { overlaySkip = true; i++; continue; }
        if (ch === '(') {
          var tm = s.slice(i).match(/^\((\d)(?::(\d*))?(?::(\d*))?/);
          if (tm) {
            var p = +tm[1], q = tm[2] ? +tm[2] : ({ 2: 3, 3: 2, 4: 3, 6: 2, 8: 3 }[p] || ((meter.num % 3 === 0 && meter.num > 3) ? 3 : 2));
            var r = tm[3] ? +tm[3] : p;
            tupletFactor = q / p; tupletLeft = r; i += tm[0].length; continue;
          }
          i++; continue;
        }
        if (ch === '-') { if (lastNote) lastNote.tie = true; i++; continue; }
        if (ch === '>' || ch === '<') {
          var run = s.slice(i).match(/^(>+|<+)/)[0], n = run.length;
          var factor = 1 - Math.pow(0.5, n); // >:0.5 >>:0.75
          if (lastNote) {
            if (ch === '>') { setDur(lastNote, lastNote.dur * (1 + factor)); brokenNext = 1 - factor; }
            else { setDur(lastNote, lastNote.dur * (1 - factor)); brokenNext = 1 + factor; }
          }
          i += n; continue;
        }
        // inline field [K:...]
        if (ch === '[' && /^\[[A-Za-z]:/.test(s.slice(i, i + 3))) {
          var e4 = s.indexOf(']', i);
          if (e4 < 0) { err('An inline field like [K:G] was not closed with "]".', ln, i); return; }
          var fl = s[i + 1], fv = s.slice(i + 3, e4);
          applyField(fl, fv, ln, true);
          if (fl === 'V' && !voiceOk()) return; // rest of line belongs to another voice
          i = e4 + 1; continue;
        }
        // endings [1 [2
        if (ch === '[' && /\d/.test(s[i + 1] || '')) {
          var em = s.slice(i).match(/^\[(\d+(?:[,-]\d+)*)/);
          res.elements.push({ type: 'ending', nums: parseEndingNums(em[1]) });
          i += em[0].length; continue;
        }
        // bar lines
        if (ch === '|' || ch === ':' || (ch === '[' && s[i + 1] === '|') || ch === ']') {
          var bm = s.slice(i).match(/^(?::|\||\[\||\])+/);
          if (!bm) { i++; continue; }
          var tok = bm[0];
          if (tok === ':' ) { i++; continue; }
          i += tok.length;
          var lead = tok.match(/^:*/)[0].length, trail = tok.match(/:*$/)[0].length;
          var kind = /\]|\|\||\[\|/.test(tok) ? 'double' : 'single';
          if (/\|\]$|\|\]:*$/.test(tok) && !lead) kind = 'final';
          var bel = { type: 'bar', kind: kind, repEnd: lead > 0, repStart: trail > 0 && (tok.length > trail), afterNote: res.notes.length - 1 };
          if (tok === '::') { bel.repEnd = true; bel.repStart = true; }
          res.elements.push(bel);
          if (res.notes.length) res.notes[res.notes.length - 1].barAfter = bel;
          barNo++; barAcc = {}; overlaySkip = false;
          var dm = s.slice(i).match(/^\s?(\d+(?:[,-]\d+)*)/);
          if (dm && !/^\s?\d+\s*\//.test(s.slice(i))) { res.elements.push({ type: 'ending', nums: parseEndingNums(dm[1]) }); i += dm[0].length; }
          continue;
        }
        // chords
        if (ch === '[') {
          var e5 = s.indexOf(']', i);
          if (e5 < 0) { err('A chord in [ ] was not closed with "]".', ln, i); return; }
          var inner = s.slice(i + 1, e5), best = null, pos = 0, firstLen = null;
          while (pos < inner.length) {
            var nm = inner.slice(pos).match(/^(\^\^|__|\^|_|=)?([A-Ga-g])([',]*)([0-9]*\/*[0-9]*)/);
            if (!nm) { pos++; continue; }
            var pn = pitchOf(nm[1], nm[2], nm[3], true);
            if (firstLen === null) firstLen = lenOf(nm[4]);
            if (!best || pn.midi > best.midi) best = pn;
            pos += nm[0].length;
          }
          i = e5 + 1;
          var lm = s.slice(i).match(/^[0-9]*\/*[0-9]*/)[0]; i += lm.length;
          if (best) { commitAcc(best); addNote(best, (firstLen || 1) * lenOf(lm), ln); }
          continue;
        }
        // notes
        var nm2 = s.slice(i).match(/^(\^\^|__|\^|_|=)?([A-Ga-g])([',]*)([0-9]*\/*[0-9]*)/);
        if (nm2) {
          var pn2 = pitchOf(nm2[1], nm2[2], nm2[3]);
          commitAcc(pn2);
          addNote(pn2, lenOf(nm2[4]), ln);
          i += nm2[0].length; continue;
        }
        var rm = s.slice(i).match(/^([zx])([0-9]*\/*[0-9]*)/);
        if (rm) { addNote({ rest: true, invisible: rm[1] === 'x' }, lenOf(rm[2]), ln); i += rm[0].length; continue; }
        var zm = s.slice(i).match(/^([ZX])(\d*)/);
        if (zm) { var bars = +(zm[2] || 1); for (var bb = 0; bb < bars; bb++) { addNote({ rest: true, wholeBar: true }, (meter.num / meter.den) / (unit || defaultUnit()), ln); if (bb < bars - 1) { res.elements.push({ type: 'bar', kind: 'single' }); barNo++; } } i += zm[0].length; continue; }
        if (ch === '^' || ch === '_' || ch === '=') { err('The sharp/flat sign "' + ch + '" must come right before a note letter, like ^F or _B.', ln, i); return; }
        if (/[0-9\/]/.test(ch)) { err('The number "' + ch + '" needs to come right after a note, like G2 or A/2.', ln, i); return; }
        err('I don\'t understand the character "' + ch + '". Notes are the letters A to G (or a to g), and z is a rest.', ln, i);
        return;
      }
    }
    function parseEndingNums(t) { var out = []; t.split(',').forEach(function (p) { var r = p.split('-'); if (r.length === 2) for (var x = +r[0]; x <= +r[1]; x++) out.push(x); else out.push(+p); }); return out; }
    function lenOf(t) {
      if (!t) return 1;
      var m = t.match(/^(\d*)(\/*)(\d*)$/);
      if (!m) return 1;
      var num = m[1] ? +m[1] : 1, den = 1;
      if (m[2]) den = m[3] ? +m[3] * Math.pow(2, m[2].length - 1) : Math.pow(2, m[2].length);
      return num / den;
    }
    function pitchOf(accStr, letter, octs, noCommit) {
      var up = letter.toUpperCase(), oct = letter === up ? 4 : 5;
      for (var k = 0; k < octs.length; k++) oct += octs[k] === "'" ? 1 : -1;
      var explicit = accStr ? { '^': 1, '^^': 2, '_': -1, '__': -2, '=': 0 }[accStr] : null;
      var key = up + oct, alter;
      if (explicit !== null) alter = explicit;
      else if (key in barAcc) alter = barAcc[key];
      else alter = keyAcc[up] || 0;
      return { letter: up, octave: oct, alter: alter, explicit: explicit, midi: 12 * (oct + 1) + NAT[up] + alter, step: LETTERS.indexOf(up) + 7 * oct };
    }
    function commitAcc(p) { if (p.explicit !== null && p.explicit !== undefined) barAcc[p.letter + p.octave] = p.explicit; }
    function setDur(n, d) { n.dur = d; n.durUnits = d / unitQ(); }
    function addNote(p, lenUnits, ln) {
      var d = lenUnits * unitQ();
      if (brokenNext !== 1) { d *= brokenNext; brokenNext = 1; }
      if (tupletLeft > 0) { d *= tupletFactor; tupletLeft--; p.tuplet = true; }
      if (!(d > 0) || !isFinite(d)) { err('A note length could not be worked out.', ln); return; }
      var n = newNote(p);
      if (pendingChord !== null) { n.chord = pendingChord; pendingChord = null; }
      setDur(n, d);
      if (lastNote && lastNote.tie && !n.rest) {
        if (lastNote.midi === n.midi) { n.tiedFrom = lastNote.i; } else { lastNote.slurTie = true; }
      }
      lastNote = n;
      if (!n.rest) pendingNotes.push(n);
      n.barLen = meter.free ? 0 : meter.num / meter.den * 4;
      groupHasAny = true;
    }

    var contBuffer = '';
    for (var ln = 0; ln < lines.length; ln++) {
      var raw = lines[ln]; curSrcLine = ln;
      var line = raw.replace(/\s+$/, '');
      if (/^%%/.test(line)) continue;
      if (/^\s*%/.test(line)) continue;
      if (/^\s*$/.test(line)) { if (bodyStarted && res.notes.length) { /* blank line ends tune */ if (sawX && res.notes.length) break; } continue; }
      var fm = line.match(/^([A-Za-z+]):(.*)$/);
      if (fm && !(bodyStarted && /^[A-Ga-g]:/.test(line) && false)) {
        var L = fm[1], V = fm[2];
        if (L === 'w' || L === '+') {
          if (!voiceOk()) continue;
          if (!lastLineWasLyric || L === '+') {
            if (L !== '+') { groupNotes = pendingNotes; pendingNotes = []; verseInGroup = 0; }
          }
          if (L === '+') { verseInGroup = Math.max(0, verseInGroup - 1); }
          var r = alignLyrics(groupNotes, V, verseInGroup);
          if (r.overflow) res.warnings.push('Line ' + (ln + 1) + ': there are more words than notes; ' + r.overflow + ' word part(s) were left out.');
          verseInGroup++;
          res.verseCount = Math.max(res.verseCount, verseInGroup);
          lastLineWasLyric = true;
          continue;
        }
        if (L === 'W') { Wlines.push(V.trim()); continue; }
        if (L === 'K' && !bodyStarted) { applyField(L, V, ln); bodyStarted = true; continue; }
        if (L === 'V') { applyField(L, V, ln); lastLineWasLyric = false; continue; }
        if ('XTCMLQKNOSRBDFGHIZPrsmU'.indexOf(L) >= 0) { applyField(L, V, ln); continue; }
        if (!bodyStarted) { applyField(L, V, ln); continue; }
      }
      if (!bodyStarted) {
        // tolerate missing headers: treat as music
        if (/^[A-Za-z]:/.test(line)) continue;
        bodyStarted = true;
      }
      if (!voiceOk() && !/^\s*\[V:/.test(line)) continue;
      lastLineWasLyric = false;
      var t = line;
      parseMusicLine(t, ln);
      if (!/\\\s*$/.test(t)) lineIdx++;
      if (res.errors.length > 8) break;
    }
    res.unit = unit || defaultUnit();
    if (!res.tempo) res.tempo = null;
    // W: verses (unaligned stanzas)
    var stanza = [];
    Wlines.concat(['']).forEach(function (w) {
      if (w === '') { if (stanza.length) res.extraVerses.push(stanza.join(' ')); stanza = []; return; }
      stanza.push(w);
    });
    res.extraVerses = res.extraVerses.map(function (s) { return s.replace(/^\s*\d+\.\s*/, ''); });
    if (!res.notes.length && !res.errors.length) res.errors.push({ message: 'I couldn\'t find any notes. Type notes using the letters A to G after the K: line.', line: 1, col: 1 });
    finish(res);
    return res;
  }

  function finish(res) {
    // timeline in quarter-note beats, source order
    var t = 0;
    res.notes.forEach(function (n) { n.start = t; t += n.dur; });
    res.totalBeats = t;
    // bar sanity warnings
    var barLen = res.meter.free ? 0 : res.meter.num / res.meter.den * 4;
    if (barLen) {
      var bars = {}, blen = {}; res.notes.forEach(function (n) { bars[n.bar] = (bars[n.bar] || 0) + n.dur; blen[n.bar] = n.barLen; });
      var keys = Object.keys(bars).map(Number).sort(function (a, b) { return a - b; });
      keys.forEach(function (b, ix) {
        if (ix === 0 || ix === keys.length - 1) return;
        var want = blen[b] || barLen; if (want && Math.abs(bars[b] - want) > 1e-6) res.warnings.push('Bar ' + (b + 1) + ' has ' + fmtBeats(bars[b]) + ' beats but the time signature expects ' + fmtBeats(want) + '.');
      });
    }
    res.verseLabels = []; for (var v = 0; v < res.verseCount; v++) res.verseLabels.push('Verse ' + (v + 1));
    res.playback = unfold(res);
  }
  function fmtBeats(x) { return Math.round(x * 100) / 100; }

  /* repeats & endings -> playback order list of note indices */
  function unfold(res) {
    var els = res.elements, out = [], i = 0, repStart = 0, pass = 1, skipping = false, guard = 0;
    var jumpedFrom = -1;
    while (i < els.length && guard++ < 100000) {
      var e = els[i];
      if (e.type === 'note') { if (!skipping) out.push(e.n); i++; continue; }
      if (e.type === 'ending') { skipping = e.nums.indexOf(pass) < 0; i++; continue; }
      if (e.type === 'bar') {
        if (e.repEnd && !skipping && pass === 1 && jumpedFrom !== i) {
          jumpedFrom = i; pass = 2; i = repStart; continue;
        }
        if (e.repEnd && !skipping && pass === 2) { pass = 1; jumpedFrom = -1; repStart = i + 1; }
        if (e.repEnd && skipping) { i++; continue; }
        if (e.kind !== 'single' && !e.repEnd && skipping) { /* an ending stopped */ }
        if (e.kind !== 'single' || e.repEnd) { if (skipping && !e.repEnd) skipping = false; }
        if (e.repStart) { if (i + 1 !== repStart || pass === 1) { repStart = i + 1; if (jumpedFrom !== -1 && pass === 2 && !e.repEnd) {} } }
        if (e.kind === 'final' && pass === 1) {}
        i++; continue;
      }
      i++;
    }
    // reset pass when leaving repeats with no endings
    return out;
  }

  /* ---------- playback events (ties merged for audio) ---------- */
  function buildEvents(res, transpose) {
    var ev = [], t = 0, order = res.playback;
    for (var k = 0; k < order.length; k++) {
      var n = res.notes[order[k]];
      var e = { n: n.i, start: t, dur: n.dur, midi: n.rest ? null : n.midi + (transpose || 0), attack: true };
      if (n.tiedFrom !== undefined && ev.length && ev[ev.length - 1].midi === e.midi && order[k - 1] === n.tiedFrom) {
        e.attack = false; var p = ev[ev.length - 1]; while (p && !p.attack) p = ev[ev.indexOf(p) - 1]; if (p) p.sound += n.dur;
      }
      e.sound = n.dur;
      ev.push(e); t += n.dur;
    }
    return { events: ev, total: t };
  }

  /* ---------- spelling (for transposition & MIDI import) ---------- */
  function spell(midi, fifths) {
    var acc = fifthsToAcc(fifths), pc = ((midi % 12) + 12) % 12, best = null;
    for (var li = 0; li < 7; li++) {
      var L = LETTERS[li], a = pc - NAT[L];
      if (a > 6) a -= 12; if (a < -6) a += 12;
      if (Math.abs(a) > 2) continue;
      var score = Math.abs(a - acc[L]) * 10 + Math.abs(a);
      if (a !== acc[L]) score += (fifths >= 0 ? (a < acc[L] ? 3 : 0) : (a > acc[L] ? 3 : 0));
      if (Math.abs(a) === 2) score += 20;
      if ((a === -1 && (L === 'C' || L === 'F')) || (a === 1 && (L === 'E' || L === 'B'))) score += 8;
      if (!best || score < best.score) best = { letter: L, alter: a, score: score };
    }
    var natPitch = midi - best.alter;
    var oct = Math.floor(natPitch / 12) - 1;
    return { letter: best.letter, alter: best.alter, octave: oct, step: LETTERS.indexOf(best.letter) + 7 * oct, midi: midi };
  }
  function transposeFifths(fifths, semis) {
    var f = fifths + ((((semis * 7) % 12) + 12) % 12);
    while (f > 6) f -= 12;
    while (f < -6) f += 12;
    if (f === 6 && fifths < 0) f = -6;
    return f;
  }
  /* display layer: for each note compute letter/octave/step & which accidental glyph to show */
  function displayNotes(res, transpose) {
    transpose = transpose || 0;
    var fifths = transpose ? transposeFifths(res.key.fifths, transpose) : res.key.fifths;
    var keyAcc = transpose ? fifthsToAcc(fifths) : res.key.acc;
    var out = [], barState = {}, curBar = -1;
    res.notes.forEach(function (n) {
      if (n.bar !== curBar) { barState = {}; curBar = n.bar; }
      var d = { i: n.i, rest: n.rest, dur: n.dur, bar: n.bar, line: n.line };
      if (!n.rest) {
        var sp = transpose ? spell(n.midi + transpose, fifths) : { letter: n.letter, alter: n.alter, octave: n.octave, step: n.step, midi: n.midi };
        d.letter = sp.letter; d.octave = sp.octave; d.step = sp.step; d.alter = sp.alter; d.midi = n.midi + transpose;
        var k = sp.letter + sp.octave, cur = (k in barState) ? barState[k] : keyAcc[sp.letter];
        if (sp.alter !== cur || (n.explicit !== null && n.explicit !== undefined && !transpose)) { d.showAcc = sp.alter; }
        barState[k] = sp.alter;
      }
      out.push(d);
    });
    return { notes: out, fifths: fifths, keyAcc: keyAcc, keyName: keyNameFromFifths(fifths, res.key.mode) };
  }
  function keyNameFromFifths(f, mode) {
    var shift = MODE_SHIFT[mode] || 0;
    var maj = majorTonicFromFifths(f - shift);
    if (shift === 0) return prettyKey(maj) + ' major';
    // tonic of mode = major tonic moved
    var majPc = (NAT[maj[0]] + (maj[1] === '#' ? 1 : maj[1] === 'b' ? -1 : 0) + 12) % 12;
    var off = { mix: 7, dor: 2, aeo: 9, m: 9, min: 9, phr: 4, loc: 11, lyd: 5 }[mode];
    var sp = spell(60 + ((majPc + off) % 12), f);
    var nm = sp.letter + (sp.alter > 0 ? '♯' : sp.alter < 0 ? '♭' : '');
    return nm + (mode === 'm' || mode === 'min' || mode === 'aeo' ? ' minor' : ' ' + { mix: 'mixolydian', dor: 'dorian', phr: 'phrygian', loc: 'locrian', lyd: 'lydian' }[mode]);
  }

  /* ---------- writing ABC from a note list (MIDI / MusicXML import) ---------- */
  function lenStr(q) { // q = duration in units of L
    var r = Math.round(q * 96) / 96, num, den;
    for (den = 1; den <= 64; den *= 2) { num = r * den; if (Math.abs(num - Math.round(num)) < 1e-6) { num = Math.round(num); break; } }
    if (den > 64) { den = 64; num = Math.round(r * 64); }
    if (num === den) return '';
    if (den === 1) return String(num);
    if (num === 1 && den === 2) return '/';
    if (num === 1) return '/' + den;
    return num + '/' + den;
  }
  function abcPitch(sp) {
    var o = sp.octave, s;
    if (o >= 5) { s = sp.letter.toLowerCase(); for (var k = 5; k < o; k++) s += "'"; }
    else { s = sp.letter; for (var j = 4; j > o; j--) s += ','; }
    return s;
  }
  function accMark(a) { return { '-2': '__', '-1': '_', '0': '=', '1': '^', '2': '^^' }[a]; }
  /* items: [{midi|null, dur (quarters), lyric?:{text,hyph,extend}}]; opts: {title, meterNum, meterDen, fifths, mode, bpm, pickup(quarters)} */
  function notesToABC(items, opts) {
    var num = opts.meterNum || 4, den = opts.meterDen || 4, fifths = opts.fifths || 0;
    var barQ = num / den * 4, Lq = den >= 8 ? 0.5 : 1; // L in quarters
    var keyAcc = fifthsToAcc(fifths), mode = opts.mode || 'maj';
    var keyName = majorTonicFromFifths(fifths - (mode === 'm' ? -3 : 0));
    if (mode === 'm') { var sp0 = spell(60 + ((NAT[keyName[0]] + (keyName[1] === '#' ? 1 : keyName[1] === 'b' ? -1 : 0) + 9) % 12), fifths); keyName = sp0.letter + (sp0.alter > 0 ? '#' : sp0.alter < 0 ? 'b' : '') + 'm'; }
    var head = ['X:1', 'T:' + (opts.title || 'Imported tune')];
    (opts.extraHeaders || []).forEach(function (h) { head.push(h); });
    head.push('M:' + num + '/' + den, 'L:' + (Lq === 1 ? '1/4' : '1/8'), 'Q:1/4=' + Math.round(opts.bpm || 90), 'K:' + keyName);
    var pos = -(opts.pickup || 0); // position within bar; negative = pickup
    var out = [], lineBars = 0, barAcc = {}, verses = opts.verses || 1, lyricLines = [], curLyr = [];
    for (var v = 0; v < verses; v++) curLyr.push([]);
    var barCount = 0, lastBarChord = null;
    var barStartPos = opts.pickup ? opts.pickup : 0, inBar = opts.pickup ? (barQ - opts.pickup) : 0;
    inBar = opts.pickup ? barQ - opts.pickup : 0;
    var lineTok = [];
    function flushLine() {
      if (!lineTok.length) return;
      out.push(lineTok.join(' ').replace(/ \|/g, ' |'));
      for (var v = 0; v < verses; v++) if (opts.hasLyrics) out.push('w: ' + curLyr[v].join(' '));
      lineTok = []; for (var v2 = 0; v2 < verses; v2++) curLyr[v2] = [];
    }
    items.forEach(function (it, idx) {
      var remaining = it.dur, first = true;
      while (remaining > 1e-6) {
        var room = barQ - inBar, d = Math.min(remaining, room);
        // avoid unrepresentable lengths like 5/4: split into representable chunks
        var token;
        if (it.midi === null || it.midi === undefined) token = 'z' + lenStr(d / Lq);
        else {
          var sp = spell(it.midi, fifths), key = sp.letter + sp.octave;
          var cur = (key in barAcc) ? barAcc[key] : keyAcc[sp.letter];
          token = (sp.alter !== cur ? accMark(sp.alter) : '') + abcPitch(sp) + lenStr(d / Lq);
          barAcc[key] = sp.alter;
          if (remaining - d > 1e-6) token += '-';
        }
        if (first && it.chord) token = '"' + it.chord + '"' + token;
        else if (opts.barChords && inBar < 1e-6 && opts.barChords[barCount] && opts.barChords[barCount] !== lastBarChord) { token = '"' + opts.barChords[barCount] + '"' + token; lastBarChord = opts.barChords[barCount]; }
        lineTok.push(token);
        if (opts.hasLyrics && it.midi !== null && it.midi !== undefined) {
          for (var v = 0; v < verses; v++) {
            var ly = it.lyrics && it.lyrics[v];
            if (!first) { curLyr[v].push('*'); continue; } // tied continuation: empty slot
            if (!ly) curLyr[v].push('*');
            else if (ly.hold) curLyr[v].push('_');
            else curLyr[v].push(escapeLyric(ly.text) + (ly.hyph ? '-' : ''));
          }
        }
        first = false;
        remaining -= d; inBar += d;
        if (inBar >= barQ - 1e-6) {
          inBar = 0; barAcc = {}; barCount++; lineBars++;
          var last = idx === items.length - 1 && remaining <= 1e-6;
          lineTok.push(last ? '|]' : '|');
          if (lineBars >= (opts.barsPerLine || 4) && !last) { flushLine(); lineBars = 0; }
        }
      }
    });
    if (lineTok.length && !/\|\]$/.test(lineTok[lineTok.length - 1])) lineTok.push('|]');
    flushLine();
    (opts.extraVerses || []).forEach(function (s, k) { out.push('W: ' + s); });
    return head.concat(out).join('\n') + '\n';
  }
  function escapeLyric(t) { return String(t).replace(/\s+/g, '~').replace(/-/g, '\\-').replace(/[*_|]/g, ''); }

  /* ---------- MIDI file reader ---------- */
  function parseMIDI(bytes) {
    var d = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), p = 0;
    function u32() { var v = (d[p] << 24 | d[p + 1] << 16 | d[p + 2] << 8 | d[p + 3]) >>> 0; p += 4; return v; }
    function u16() { var v = d[p] << 8 | d[p + 1]; p += 2; return v; }
    function vlq() { var v = 0, b; do { b = d[p++]; v = (v << 7) | (b & 0x7f); } while (b & 0x80 && p < d.length); return v; }
    function str(n) { var s = ''; for (var k = 0; k < n; k++) s += String.fromCharCode(d[p + k]); return s; }
    if (str(4) !== 'MThd') throw new Error('This does not look like a MIDI file.');
    p = 4; var hl = u32(), fmt = u16(), ntr = u16(), div = u16(); p = 8 + hl;
    if (div & 0x8000) throw new Error('This MIDI file uses SMPTE timing, which is not supported.');
    var out = { ppq: div, format: fmt, notes: [], tempos: [], timeSigs: [], keySigs: [], names: [], lyrics: [] };
    for (var tr = 0; tr < ntr && p < d.length; tr++) {
      if (str(4) !== 'MTrk') break;
      p += 4; var len = u32(), end = p + len, tick = 0, status = 0, open = {};
      while (p < end) {
        tick += vlq();
        var b = d[p];
        if (b & 0x80) { status = b; p++; } 
        var hi = status & 0xf0, ch = status & 0x0f;
        if (status === 0xff) {
          var type = d[p++], ml = vlq(), ds = p; p += ml;
          if (type === 0x51) out.tempos.push({ tick: tick, mpq: d[ds] << 16 | d[ds + 1] << 8 | d[ds + 2] });
          else if (type === 0x58) out.timeSigs.push({ tick: tick, num: d[ds], den: Math.pow(2, d[ds + 1]) });
          else if (type === 0x59) out.keySigs.push({ tick: tick, sf: (d[ds] << 24) >> 24, mi: d[ds + 1] });
          else if (type === 0x03) { var nm = ''; for (var k = 0; k < ml; k++) nm += String.fromCharCode(d[ds + k]); out.names.push({ track: tr, name: nm }); }
          else if (type === 0x05) { var ly = ''; for (var k2 = 0; k2 < ml; k2++) ly += String.fromCharCode(d[ds + k2]); out.lyrics.push({ track: tr, tick: tick, text: ly }); }
          continue;
        }
        if (status === 0xf0 || status === 0xf7) { var sl = vlq(); p += sl; continue; }
        if (hi === 0x90 || hi === 0x80) {
          var note = d[p++], vel = d[p++], key = ch * 128 + note;
          if (hi === 0x90 && vel > 0) { if (open[key]) { open[key].end = tick; out.notes.push(open[key]); } open[key] = { track: tr, ch: ch, start: tick, pitch: note, vel: vel }; }
          else if (open[key]) { open[key].end = tick; out.notes.push(open[key]); delete open[key]; }
          continue;
        }
        if (hi === 0xa0 || hi === 0xb0 || hi === 0xe0) { p += 2; continue; }
        if (hi === 0xc0 || hi === 0xd0) { p += 1; continue; }
        p++; // unknown, skip
      }
      p = end;
    }
    out.notes.sort(function (a, b) { return a.start - b.start || b.pitch - a.pitch; });
    return out;
  }
  function midiToABC(bytes, title) {
    var m = parseMIDI(bytes), ppq = m.ppq;
    var notes = m.notes.filter(function (n) { return n.ch !== 9; });
    if (!notes.length) throw new Error('This MIDI file has no melody notes in it.');
    // choose the track with the highest average pitch among tracks having a reasonable number of notes
    var tracks = {};
    notes.forEach(function (n) { var t = tracks[n.track] || (tracks[n.track] = { c: 0, s: 0 }); t.c++; t.s += n.pitch; });
    var maxC = 0; Object.keys(tracks).forEach(function (k) { maxC = Math.max(maxC, tracks[k].c); });
    var bestT = null; Object.keys(tracks).forEach(function (k) { var t = tracks[k]; if (t.c >= maxC * 0.35 && (bestT === null || t.s / t.c > tracks[bestT].s / tracks[bestT].c)) bestT = k; });
    var mel = notes.filter(function (n) { return String(n.track) === String(bestT); });
    // skyline: highest note at each onset
    var grid = ppq / 4; // sixteenth
    function q(t) { return Math.round(t / grid) * grid; }
    var byStart = {};
    mel.forEach(function (n) { var s = q(n.start); if (!byStart[s] || byStart[s].pitch < n.pitch) byStart[s] = { start: s, end: Math.max(q(n.end), s + grid), pitch: n.pitch }; });
    var seq = Object.keys(byStart).map(Number).sort(function (a, b) { return a - b; }).map(function (s) { return byStart[s]; });
    var items = [], cur = 0;
    var origin = 0;
    seq.forEach(function (n, k) {
      var next = k + 1 < seq.length ? seq[k + 1].start : n.end;
      var end = Math.min(n.end, next);
      if (n.start > cur + grid / 2 && items.length) items.push({ midi: null, dur: (n.start - cur) / ppq });
      if (!items.length) origin = n.start;
      var dur = end - n.start;
      // absorb tiny gaps (articulation) into the note
      if (next - end > 0 && next - end <= ppq / 2 && k + 1 < seq.length) dur = next - n.start;
      items.push({ midi: n.pitch, dur: dur / ppq });
      cur = n.start + dur;
    });
    var ts = m.timeSigs[0] || { num: 4, den: 4 };
    var ks = m.keySigs[0];
    var fifths = ks ? ks.sf : guessFifths(items), mode = ks && ks.mi ? 'm' : 'maj';
    var bpm = m.tempos.length ? 60000000 / m.tempos[0].mpq : 100;
    var barQ = ts.num / ts.den * 4;
    var pickup = ((origin / ppq) % barQ);
    pickup = pickup > 1e-6 ? barQ - pickup : 0;
    if (!pickup) { // infer pickup from total length
      var total = items.reduce(function (a, b) { return a + b.dur; }, 0), rem = total % barQ;
      if (rem > 1e-6) { var acc = 0; for (var k = 0; k < items.length; k++) { acc += items[k].dur; if (Math.abs(acc - rem) < 1e-6) { pickup = rem; break; } if (acc > rem) break; } }
    }
    var nm = (m.names.filter(function (x) { return x.name.trim(); })[0] || {}).name;
    // guess one chord per bar from all pitched notes (accompaniment tracks help most)
    var barChords = [], spell0 = function (pc) { return ['C', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'][pc]; };
    var TPL = [['', [0, 4, 7]], ['m', [0, 3, 7]], ['7', [0, 4, 7, 10]], ['m7', [0, 3, 7, 10]], ['maj7', [0, 4, 7, 11]], ['dim', [0, 3, 6]], ['m7b5', [0, 3, 6, 10]]];
    var lastTick = notes.reduce(function (a, n) { return Math.max(a, n.end); }, 0);
    for (var j = 0; j < 2000; j++) {
      var bs = origin + (j === 0 ? 0 : (pickup ? pickup + (j - 1) * barQ : j * barQ)) * ppq, be = j === 0 && pickup ? origin + pickup * ppq : bs + barQ * ppq;
      if (bs >= lastTick) break;
      var w = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], low = null;
      notes.forEach(function (n) { var ov = Math.min(n.end, be) - Math.max(n.start, bs); if (ov > 0) { w[n.pitch % 12] += ov * (n.track === +bestT ? 0.6 : 1); if (!low || n.pitch < low.pitch) low = n; } });
      var tot = w.reduce(function (a, b) { return a + b; }, 0); if (!tot) { barChords.push(null); continue; }
      var best = null;
      for (var r = 0; r < 12; r++) TPL.forEach(function (tp) {
        var inS = 0; tp[1].forEach(function (iv) { inS += w[(r + iv) % 12]; });
        var sc = inS - (tot - inS) * 1.2 - tp[1].length * tot * 0.04 + (low && low.pitch % 12 === r ? tot * 0.25 : 0) + (w[r] > 0 ? 0 : -tot);
        if (!best || sc > best.sc) best = { sc: sc, name: spell0(r) + tp[0] };
      });
      barChords.push(best.name);
    }
    return { abc: notesToABC(items, { title: title || nm || 'Imported MIDI tune', meterNum: ts.num, meterDen: ts.den, fifths: fifths, mode: mode, bpm: bpm * (ts.den === 2 ? 1 : 1), pickup: pickup, barChords: barChords }), items: items, raw: m, pickup: pickup, fifths: fifths, meter: ts };
  }
  function guessFifths(items) {
    var best = 0, bestScore = -1;
    for (var f = -6; f <= 6; f++) {
      var acc = fifthsToAcc(f), sc = 0, tonicPc = (NAT[majorTonicFromFifths(f)[0]] + (majorTonicFromFifths(f)[1] === '#' ? 1 : majorTonicFromFifths(f)[1] === 'b' ? -1 : 0) + 12) % 12;
      var scale = {}; LETTERS.split('').forEach(function (L) { scale[(NAT[L] + acc[L] + 12) % 12] = 1; });
      items.forEach(function (it) { if (it.midi != null && scale[it.midi % 12]) sc += it.dur; });
      var last = items.filter(function (it) { return it.midi != null; }).slice(-1)[0];
      if (last && last.midi % 12 === tonicPc) sc += 2;
      if (sc > bestScore + 1e-9 || (Math.abs(sc - bestScore) < 1e-9 && Math.abs(f) < Math.abs(best))) { best = f; bestScore = sc; }
    }
    return best;
  }

  var XML_KIND = { 'major': '', 'minor': 'm', 'augmented': 'aug', 'diminished': 'dim', 'dominant': '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
    'diminished-seventh': 'dim7', 'augmented-seventh': '7#5', 'half-diminished': 'm7b5', 'major-minor': 'mMaj7', 'major-sixth': '6', 'minor-sixth': 'm6',
    'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9', 'dominant-11th': '11', 'major-11th': 'maj11', 'minor-11th': 'm11',
    'dominant-13th': '13', 'major-13th': 'maj13', 'minor-13th': 'm13', 'suspended-second': 'sus2', 'suspended-fourth': 'sus4', 'power': '5', 'none': 'N.C.' };
  function harmonyText(h) {
    function tx(parent, tag) { var e = parent.getElementsByTagName(tag)[0]; return e ? e.textContent.trim() : ''; }
    var rs = tx(h, 'root-step'); if (!rs) return null;
    var ra = +tx(h, 'root-alter') || 0, kEl = h.getElementsByTagName('kind')[0], kind = kEl ? kEl.textContent.trim() : 'major';
    if (kind === 'none') return 'N.C.';
    var q = XML_KIND.hasOwnProperty(kind) ? XML_KIND[kind] : (kEl && kEl.getAttribute('text')) || '';
    var degs = h.getElementsByTagName('degree');
    for (var d = 0; d < degs.length; d++) {
      var v = tx(degs[d], 'degree-value'), a = +tx(degs[d], 'degree-alter') || 0, t = tx(degs[d], 'degree-type');
      if (t === 'subtract') continue;
      q += (t === 'add' && !a ? 'add' : '') + (a < 0 ? 'b' : a > 0 ? '#' : '') + v;
    }
    var name = rs + (ra < 0 ? 'b' : ra > 0 ? '#' : '') + q;
    var bs = h.getElementsByTagName('bass')[0];
    if (bs) { var bst = tx(bs, 'bass-step'), ba = +tx(bs, 'bass-alter') || 0; if (bst) name += '/' + bst + (ba < 0 ? 'b' : ba > 0 ? '#' : ''); }
    return name;
  }
  /* ---------- MusicXML (uncompressed) reader, needs DOMParser ---------- */
  function musicXMLToABC(text, DOMParserImpl) {
    var DP = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!DP) throw new Error('MusicXML reading needs a web browser.');
    var doc = new DP().parseFromString(text, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length) throw new Error('This MusicXML file could not be read (it may be damaged).');
    if (doc.getElementsByTagName('score-timewise').length) throw new Error('Only "partwise" MusicXML files are supported.');
    var part = doc.getElementsByTagName('part')[0];
    if (!part) throw new Error('No music part was found in this MusicXML file.');
    var title = (doc.getElementsByTagName('work-title')[0] || doc.getElementsByTagName('movement-title')[0] || {}).textContent || '';
    var div = 1, fifths = 0, mode = 'maj', num = 4, den = 4, bpm = 0, items = [], gotKey = false, gotTime = false, maxVerse = 1, firstVoice = null;
    var measures = part.getElementsByTagName('measure'), pickup = 0, pendingHarm = null;
    for (var mi = 0; mi < measures.length; mi++) {
      var meas = measures[mi], mDur = 0;
      var kids = meas.children;
      for (var c = 0; c < kids.length; c++) {
        var el = kids[c], tag = el.tagName;
        if (tag === 'attributes') {
          var dv = el.getElementsByTagName('divisions')[0]; if (dv) div = +dv.textContent || 1;
          var ky = el.getElementsByTagName('key')[0]; if (ky && !gotKey) { var fx = ky.getElementsByTagName('fifths')[0]; if (fx) fifths = +fx.textContent; var md = ky.getElementsByTagName('mode')[0]; if (md && /minor/.test(md.textContent)) mode = 'm'; gotKey = true; }
          var tm = el.getElementsByTagName('time')[0]; if (tm && !gotTime) { num = +(tm.getElementsByTagName('beats')[0] || {}).textContent || 4; den = +(tm.getElementsByTagName('beat-type')[0] || {}).textContent || 4; gotTime = true; }
        } else if (tag === 'sound' && el.getAttribute('tempo') && !bpm) bpm = +el.getAttribute('tempo');
        else if (tag === 'direction') { var snd = el.getElementsByTagName('sound')[0]; if (snd && snd.getAttribute('tempo') && !bpm) bpm = +snd.getAttribute('tempo'); }
        else if (tag === 'harmony') { var hs = harmonyText(el); if (hs) pendingHarm = hs; }
        else if (tag === 'backup') { break; } // ignore later voices in the measure
        else if (tag === 'note') {
          if (el.getElementsByTagName('grace').length) continue;
          var vEl = el.getElementsByTagName('voice')[0], voice = vEl ? vEl.textContent : '1';
          if (firstVoice === null) firstVoice = voice;
          if (voice !== firstVoice) continue;
          var isChord = el.getElementsByTagName('chord').length > 0;
          var durEl = el.getElementsByTagName('duration')[0], dq = durEl ? (+durEl.textContent / div) : 0;
          var midi = null;
          if (!el.getElementsByTagName('rest').length) {
            var pit = el.getElementsByTagName('pitch')[0];
            if (pit) {
              var stp = pit.getElementsByTagName('step')[0].textContent, oc = +pit.getElementsByTagName('octave')[0].textContent;
              var alt = pit.getElementsByTagName('alter')[0]; alt = alt ? Math.round(+alt.textContent) : 0;
              midi = 12 * (oc + 1) + NAT[stp] + alt;
            }
          }
          if (isChord) { var lastIt = items[items.length - 1]; if (lastIt && midi !== null && lastIt.midi !== null && midi > lastIt.midi) lastIt.midi = midi; continue; }
          var it = { midi: midi, dur: dq, lyrics: [] };
          if (pendingHarm) { it.chord = pendingHarm; pendingHarm = null; }
          var lys = el.getElementsByTagName('lyric');
          for (var li = 0; li < lys.length; li++) {
            var nmb = +(lys[li].getAttribute('number') || (li + 1)); if (!(nmb >= 1)) nmb = li + 1;
            var txtEl = lys[li].getElementsByTagName('text')[0], syl = (lys[li].getElementsByTagName('syllabic')[0] || {}).textContent || 'single';
            if (txtEl) { it.lyrics[nmb - 1] = { text: txtEl.textContent, hyph: syl === 'begin' || syl === 'middle' }; maxVerse = Math.max(maxVerse, nmb); }
            else if (lys[li].getElementsByTagName('extend').length) it.lyrics[nmb - 1] = { hold: true, text: '' };
          }
          var ties = el.getElementsByTagName('tie'), tieStop = false;
          for (var ti = 0; ti < ties.length; ti++) if (ties[ti].getAttribute('type') === 'stop') tieStop = true;
          var prev = items[items.length - 1];
          if (tieStop && prev && prev.midi === midi && !it.chord) { prev.dur += dq; } else items.push(it);
          mDur += dq;
        }
      }
      if (mi === 0 && Math.abs(mDur - num / den * 4) > 1e-6 && mDur > 0) pickup = mDur;
    }
    var hasLyrics = items.some(function (it) { return it.lyrics && it.lyrics.length; });
    // merge tie durations exceeding bar are re-split by notesToABC
    return notesToABC(items, { title: title || 'Imported MusicXML tune', meterNum: num, meterDen: den, fifths: fifths, mode: mode, bpm: bpm || 90, pickup: pickup, hasLyrics: hasLyrics, verses: hasLyrics ? maxVerse : 0 });
  }

  /* ---------- simple English syllabifier (for plain-text verses) ---------- */
  var SYL_EXC = { kindness: 'kind-ness', "foll'wing": "foll'-wing", "op'ning": "op'-ning", "tempter's": "tempt-er's", tempter: 'tempt-er', already: 'al-read-y', without: 'with-out', "with'ring": "with'-ring", simply: 'sim-ply', angels: 'an-gels', angel: 'an-gel', shining: 'shin-ing', waking: 'wak-ing', morning: 'morn-ing', closing: 'clos-ing', shadows: 'shad-ows', mower: 'mow-er', nations: 'na-tions', forgotten: 'for-got-ten', rolling: 'roll-ing', surely: 'sure-ly', crying: 'cry-ing', triumph: 'tri-umph', dying: 'dy-ing', flying: 'fly-ing', lying: 'ly-ing', ever: 'ev-er', never: 'nev-er', river: 'riv-er', many: 'man-y', anger: 'an-ger', within: 'with-in', following: 'fol-low-ing', downwards: 'down-wards', misdeed: 'mis-deed', deserved: 'de-served', suffered: 'suf-fered', pining: 'pin-ing', sadness: 'sad-ness', gladness: 'glad-ness', springing: 'spring-ing', 'ever-springing': 'ev-er-spring-ing', herald: 'her-ald', 'herald\'s': 'her-ald\'s', desert: 'des-ert', bidding: 'bid-ding', repentance: 're-pent-ance', kingdom: 'king-dom', warning: 'warn-ing', prepare: 'pre-pare', valleys: 'val-leys', crooked: 'crook-ed', rougher: 'rough-er', places: 'pla-ces', humble: 'hum-ble', befits: 'be-fits', holy: 'ho-ly', glory: 'glo-ry', abroad: 'a-broad', token: 'to-ken', broken: 'bro-ken', pardon: 'par-don', blotting: 'blot-ting', certainly: 'cer-tain-ly', 'devour\'d': 'de-vour\'d', 'swallow\'d': 'swal-low\'d', esteem: 'es-teem', away: 'a-way', raging: 'rag-ing', swelling: 'swell-ing', 'o\'erwhelmed': 'o\'er-whelm-ed', safely: 'safe-ly', bloody: 'blood-y', cruelty: 'cru-el-ty', 'fowler\'s': 'fowl-er\'s', escapes: 'es-capes', escaped: 'es-cap-ed', therefore: 'there-fore', 'th\'assembly': 'th\'as-sem-bly', ungodly: 'un-god-ly', judgment: 'judg-ment', overthrown: 'o-ver-thrown', unto: 'un-to', meditates: 'med-i-tates', scorner: 'scorn-er', 'scorner\'s': 'scorn-er\'s', sitteth: 'sit-teth', placeth: 'plac-eth', planted: 'plant-ed', season: 'sea-son', fadeth: 'fad-eth', prosper: 'pros-per', wicked: 'wick-ed', godly: 'god-ly', whereas: 'where-as', iniquities: 'in-iq-ui-ties', graciously: 'gra-cious-ly', forgive: 'for-give', diseases: 'dis-eas-es', relieve: 're-lieve', redeem: 're-deem', 'loving-kindness': 'lov-ing-kind-ness', tender: 'ten-der', mercies: 'mer-cies', eternal: 'e-ter-nal', attends: 'at-tends', busy: 'bus-y', carried: 'car-ried', slumber: 'slum-ber', slumbers: 'slum-bers', behold: 'be-hold', henceforth: 'hence-forth', going: 'go-ing', preserve: 'pre-serve', forever: 'for-ev-er', table: 'ta-ble', every: 'ev-ery', heaven: 'heav-en', heavens: 'heav-ens', heavenly: 'heav-en-ly', 'heav\'n': 'heav\'n', 'heav\'nly': 'heav\'n-ly', power: 'pow-er', powers: 'pow-ers', 'pow\'r': 'pow\'r', 'o\'er': 'o\'er', 'e\'er': 'e\'er', 'ne\'er': 'ne\'er', fire: 'fire', our: 'our', hour: 'hour', flower: 'flow-er', saviour: 'sav-iour', savior: 'sav-ior', even: 'ev-en', given: 'giv-en', 'giv\'n': 'giv\'n', jesus: 'je-sus', israel: 'is-ra-el', 'israel\'s': 'is-ra-el\'s', glorious: 'glo-rious', righteousness: 'right-eous-ness', righteous: 'right-eous', quiet: 'qui-et', comfort: 'com-fort', table: 'ta-ble', create: 'cre-ate', creatures: 'crea-tures', shepherd: 'shep-herd', restore: 're-store', mercy: 'mer-cy', goodness: 'good-ness', forevermore: 'for-ev-er-more', evermore: 'ev-er-more', dwelling: 'dwell-ing', pastures: 'pas-tures', waters: 'wa-ters', leadeth: 'lead-eth', anoint: 'a-noint', overflows: 'o-ver-flows', furnished: 'fur-nish-ed', presence: 'pres-ence', salvation: 'sal-va-tion', deliverance: 'de-liv-er-ance', experience: 'ex-pe-ri-ence', magnify: 'mag-ni-fy', posterity: 'pos-ter-i-ty', changing: 'chang-ing', trouble: 'trou-ble', praises: 'prais-es', people: 'peo-ple', cheerful: 'cheer-ful', before: 'be-fore', rejoice: 're-joice', indeed: 'in-deed', approach: 'ap-proach', seemly: 'seem-ly', mercy: 'mer-cy', maker: 'ma-ker', mountains: 'moun-tains', mighty: 'migh-ty', worship: 'wor-ship', alone: 'a-lone', jerusalem: 'je-ru-sa-lem', unto: 'un-to', sufficient: 'suf-fi-cient', defence: 'de-fence', everlasting: 'ev-er-last-ing', endless: 'end-less', thousand: 'thou-sand', evening: 'eve-ning', rising: 'ris-ing', 'ever-rolling': 'ev-er-roll-ing', forgotten: 'for-got-ten', opening: 'o-pen-ing', eternal: 'e-ter-nal', shelter: 'shel-ter', stormy: 'storm-y', shadow: 'sha-dow', secure: 'se-cure', received: 're-ceived', little: 'lit-tle', noble: 'no-ble', nobler: 'no-bler', immortality: 'im-mor-tal-i-ty', endures: 'en-dures', happy: 'hap-py', oppressed: 'op-pressed', eyesight: 'eye-sight', fainting: 'faint-ing', conscience: 'con-science', stranger: 'stran-ger', distress: 'dis-tress', widow: 'wid-ow', fatherless: 'fa-ther-less', prisoner: 'pris-oner', release: 're-lease', cooling: 'cool-ing', heated: 'heat-ed', refreshing: 're-fresh-ing', living: 'liv-ing', thirsty: 'thirst-y', behold: 'be-hold', majesty: 'maj-es-ty', divine: 'di-vine', restless: 'rest-less', employ: 'em-ploy', thankful: 'thank-ful', forsaken: 'for-sak-en', exposed: 'ex-posed', oppressor: 'op-press-or', 'oppressor\'s': 'op-press-or\'s', eternal: 'e-ter-nal', israel: 'Is-ra-el' };
  function syllabifyWord(w) {
    if (w.indexOf('~') > 0) { var jp = w.split('~'), first = syllabifyWord(jp[0]); first[first.length - 1] += '~' + jp.slice(1).join('~'); return first; }
    var pm = w.match(/^(.*[A-Za-z])('s|’s)([^A-Za-z]*)$/);
    if (pm && !SYL_EXC[(pm[1] + pm[2]).replace(/^[^A-Za-z']+/, '').toLowerCase()]) { var bp = syllabifyWord(pm[1]); bp[bp.length - 1] += pm[2] + pm[3]; return bp; }
    var m = w.match(/^([^A-Za-z']*)([A-Za-z'’]+(?:-[A-Za-z'’]+)*)([^A-Za-z']*)$/);
    if (!m) return [w];
    var pre = m[1], core = m[2].replace(/’/g, "'"), post = m[3], lc = core.toLowerCase();
    var parts;
    if (core.indexOf('-') > 0) { parts = []; core.split('-').forEach(function (p) { parts = parts.concat(syllabifyWord(p)); }); }
    else if (SYL_EXC[lc]) parts = splitLike(core, SYL_EXC[lc]);
    else parts = autoSyl(core);
    parts[0] = pre + parts[0]; parts[parts.length - 1] += post;
    return parts;
  }
  function splitLike(word, pattern) { var out = [], pos = 0; pattern.split('-').forEach(function (p) { out.push(word.substr(pos, p.length)); pos += p.length; }); return out; }
  function autoSyl(w) {
    var lc = w.toLowerCase();
    if (lc.length <= 3) return [w];
    var V = /[aeiouy]/;
    // find vowel groups (an apostrophe between vowels and a w after a vowel stay in the group)
    var groups = [], i = 0;
    while (i < lc.length) {
      if (V.test(lc[i]) && !(lc[i] === 'y' && i === 0)) { var s = i; while (i < lc.length && (V.test(lc[i]) || (lc[i] === "'" && V.test(lc[i + 1] || '')) || (lc[i] === 'w' && i > s && !V.test(lc[i + 1] || '')))) i++; groups.push([s, i]); } else i++;
    }
    // silent final e / es / ed
    var lastG = groups[groups.length - 1];
    if (groups.length > 1 && lastG) {
      var tail = lc.slice(lastG[0]);
      if (/^e$/.test(tail) && !/[^aeiou]le$/.test(lc)) groups.pop();
      else if (/^es$/.test(tail) && !/(s|x|z|ch|sh|c|g)es$/.test(lc) && !/[^aeiou]les$/.test(lc)) groups.pop();
      else if (/^ed$/.test(tail) && !/[td]ed$/.test(lc)) groups.pop();
    }
    if (groups.length < 2) return [w];
    var cuts = [];
    for (var g = 0; g < groups.length - 1; g++) {
      var a = groups[g][1], b = groups[g + 1][0], cons = lc.slice(a, b), cut;
      if (cons.length === 0) cut = a; // vowel hiatus (rare after grouping)
      else if (cons.length === 1) cut = a;
      else {
        var dig = /^(ch|sh|th|ph|wh|gh|ck|ng)$/;
        if (cons.length === 2 && dig.test(cons)) cut = cons === 'ck' || cons === 'ng' ? b : a;
        else if (/^(bl|br|cl|cr|dr|fl|fr|gl|gr|pl|pr|tr|str|thr|shr|sc|sp|st)$/.test(cons.slice(1)) && cons.length >= 3) cut = a + 1;
        else if (/(ch|sh|th|ph|wh|ck|ng)$/.test(cons) && cons.length >= 3) cut = b - 2;
        else cut = a + 1;
      }
      cuts.push(cut);
    }
    var out = [], prev = 0;
    cuts.forEach(function (c) { out.push(w.slice(prev, c)); prev = c; });
    out.push(w.slice(prev));
    return out.filter(function (x) { return x; });
  }
  function syllabifyText(text) {
    var syls = [];
    text.split(/\s+/).filter(Boolean).forEach(function (word) {
      var p = syllabifyWord(word);
      p.forEach(function (s, k) { syls.push({ text: s, hyph: k < p.length - 1 }); });
    });
    return syls;
  }
  function sylsToW(syls) { return syls.map(function (s) { return escapeLyric(s.text) + (s.hyph ? '-' : ''); }).join(' ').replace(/- /g, '-'); }
  /* align plain stanza to the slots verse 0 uses (or every singable note) */
  function textToWLine(res, text) {
    var syls = syllabifyText(text);
    var sing = res.notes.filter(function (n) { return !n.rest; });
    var slots = sing.map(function (n) { var l = n.lyrics && n.lyrics[0]; return !l ? 'skip' : l.hold ? 'hold' : l.cont ? 'skip' : 'syl'; });
    var nSyl = slots.filter(function (s) { return s === 'syl'; }).length;
    var parts = [], k = 0;
    if (nSyl === syls.length) {
      slots.forEach(function (s) { if (s === 'syl') { var y = syls[k++]; parts.push(escapeLyric(y.text) + (y.hyph ? '-' : '')); } else parts.push(s === 'hold' ? '_' : '*'); });
    } else {
      syls.forEach(function (y) { parts.push(escapeLyric(y.text) + (y.hyph ? '-' : '')); });
    }
    return { line: parts.join(' '), match: nSyl === syls.length, syllables: syls.length, slots: nSyl, singable: sing.length };
  }
  /* make W: stanzas into aligned verses */
  function alignExtraVerses(res) {
    if (!res.extraVerses.length) return res;
    var sing = res.notes.filter(function (n) { return !n.rest; });
    res.extraVerses.forEach(function (text) {
      var w = textToWLine(res, text), v = res.verseCount;
      alignLyrics(sing, w.line, v);
      res.verseCount++; res.verseLabels.push('Verse ' + res.verseCount);
      if (!w.match) res.warnings.push('Verse ' + res.verseCount + ' has ' + w.syllables + ' syllables but the tune has ' + w.slots + ' places for words; the words may not line up exactly.');
    });
    res.extraVerses = [];
    return res;
  }

  /* Add plain-text verses (array of strings) as aligned w: lines, following verse 1's word slots. */
  function addVersesToABC(abc, texts) {
    var res = parseABC(abc);
    if (res.errors.length) throw new Error('ABC error: ' + res.errors[0].message + ' (line ' + res.errors[0].line + ')');
    var sing = res.notes.filter(function (n) { return !n.rest; });
    var slots = sing.map(function (n) { var l = n.lyrics && n.lyrics[0]; return !l ? 'skip' : l.hold ? 'hold' : l.cont ? 'cont' : 'syl'; });
    var nSyl = slots.filter(function (x) { return x === 'syl'; }).length;
    var perVerse = texts.map(function (t, vi) {
      var syls = syllabifyText(t);
      if (syls.length !== nSyl) throw new Error('Verse ' + (res.verseCount + vi + 1) + ' has ' + syls.length + ' syllables, tune needs ' + nSyl + ': ' + syls.map(function (s) { return s.text + (s.hyph ? '-' : ''); }).join(' '));
      var k = 0;
      return slots.map(function (sl) { if (sl === 'syl') { var y = syls[k++]; return escapeLyric(y.text) + (y.hyph ? '-' : ''); } return sl === 'skip' ? '*' : '_'; });
    });
    var lines = abc.replace(/\r\n?/g, '\n').split('\n');
    // group singable notes by source line
    var bySrc = {}; sing.forEach(function (n, idx) { (bySrc[n.srcLine] = bySrc[n.srcLine] || []).push(idx); });
    var srcLines = Object.keys(bySrc).map(Number).sort(function (a, b) { return a - b; });
    var inserts = {};
    srcLines.forEach(function (sl, gi) {
      var end = sl, nextMusic = gi + 1 < srcLines.length ? srcLines[gi + 1] : lines.length;
      for (var j = sl + 1; j < nextMusic; j++) if (/^w:/.test(lines[j])) end = j; else if (/^\s*$/.test(lines[j]) || /^[A-Za-z]:/.test(lines[j]) && !/^w:/.test(lines[j])) break;
      inserts[end] = perVerse.map(function (tokens) { return 'w: ' + bySrc[sl].map(function (ix) { return tokens[ix]; }).join(' ').replace(/(\S)- (?=\S)/g, '$1- '); });
    });
    var out = [];
    lines.forEach(function (l, i) { out.push(l); if (inserts[i]) out.push.apply(out, inserts[i]); });
    return out.join('\n');
  }

  var API = { addVersesToABC: addVersesToABC, parseABC: parseABC, parseKey: parseKey, buildEvents: buildEvents, displayNotes: displayNotes, spell: spell, transposeFifths: transposeFifths,
    keyNameFromFifths: keyNameFromFifths, notesToABC: notesToABC, parseMIDI: parseMIDI, midiToABC: midiToABC, musicXMLToABC: musicXMLToABC,
    syllabifyText: syllabifyText, syllabifyWord: syllabifyWord, sylsToW: sylsToW, textToWLine: textToWLine, alignExtraVerses: alignExtraVerses, tokenizeLyrics: tokenizeLyrics, fifthsToAcc: fifthsToAcc, NOTE_NAMES: NOTE_NAMES_SHARP };
  root.HymnCore = API; root.LFCore = API;
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
