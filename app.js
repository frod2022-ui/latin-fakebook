/* ===== Latin Fake Book — app UI, playback scheduler, library, import/backup ===== */
(function () {
  'use strict';
  var C = window.LFCore, H = window.LFChords, E = window.LFEngine, A = window.LFAudio, ST = window.LFStaff;
  var $ = function (id) { return document.getElementById(id); };
  var LS = {
    get: function (k, d) { try { var v = localStorage.getItem('lfb.' + k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('lfb.' + k, JSON.stringify(v)); } catch (e) { toast('Could not save on this device (storage is full or blocked).'); } }
  };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function forEach(list, fn) { Array.prototype.forEach.call(list, fn); }

  /* ---------- mixer defaults: piano + bass (and melody); percussion available but muted ---------- */
  var PERC_IDS = E.PARTS.filter(function (p) { return p.perc; }).map(function (p) { return p.id; });
  var BASE_GAIN = { melody: 0.7, piano: 0.78, bass: 1.35, clave: 0.5, congas: 0.72, bongos: 0.6, shaker: 0.34, cowbell: 0.42, timbales: 0.5, guiro: 0.42, rim: 0.5, drums: 0.8, click: 0.7 };
  function defaultMix() {
    var m = { melody: { vol: 0.8, mute: false }, piano: { vol: 0.8, mute: false }, bass: { vol: 0.82, mute: false } };
    PERC_IDS.forEach(function (id) { m[id] = { vol: 0.7, mute: true }; });
    return m;
  }
  var mix = (function () { var d = defaultMix(), s = LS.get('mix2', null); if (s) Object.keys(d).forEach(function (k) { if (s[k]) d[k] = { vol: +s[k].vol, mute: !!s[k].mute }; }); return d; })();

  var S = {
    song: null, base: null, tl: null, style: 'bossa', tempo: 120, transpose: 0, clave: '3-2',
    instr: LS.get('instr', 'C'), countIn: LS.get('countIn', 1), loop: LS.get('loop', false), view: LS.get('view', 'lead'),
    voice: LS.get('voice', 'flute'), comp: LS.get('comp', 'piano'), solo: false,
    range: null, rangeMode: false, rangeFirst: null,
    playing: false, startBar: 0, layout: null, cur: -1, curBar: -1, lastSys: -1
  };
  var P = { segs: [], queue: [], anchorTime: 0, anchorBeat: 0, pbEnd: 0, nextBar: 0, done: false, timer: null, raf: 0, gen: {} };

  /* ---------- library ---------- */
  var builtIn = (window.LF_SONGS || []).slice();
  var mySongs = LS.get('mySongs', []);
  var SECTION_ORDER = ['Mexico', 'Cuba & the Caribbean', 'Argentina & Uruguay', 'Spain', 'Practice progressions', 'My Songs', 'My Band-in-a-Box'];
  var BIB_SEC = 'My Band-in-a-Box';
  function allSongs() { return builtIn.concat(mySongs.map(function (m) { return Object.assign({}, m, { section: m.bib ? BIB_SEC : 'My Songs', mine: true }); })); }
  function findSong(id) { var a = allSongs(); for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i]; return null; }
  function styleName(id) { var s = E.STYLES[id]; return s ? s.short : id; }
  function renderLibrary() {
    var q = ($('libSearch').value || '').toLowerCase().trim(), list = $('libList'), html = '';
    var songs = allSongs(), groups = {};
    songs.forEach(function (s) {
      var hay = (s.title + ' ' + (s.sub || '') + ' ' + (s.section || '') + ' ' + styleName(E.styleId(s.style) || '') + ' ' + (s.credit || '') + (s.bib ? ' band-in-a-box biab ' + s.bib.style + ' ' + (s.bib.file || '') : '')).toLowerCase();
      if (q && hay.indexOf(q) < 0) return;
      (groups[s.section || 'Other'] = groups[s.section || 'Other'] || []).push(s);
    });
    var secs = Object.keys(groups).sort(function (a, b) { var ia = SECTION_ORDER.indexOf(a), ib = SECTION_ORDER.indexOf(b); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    if (secs.indexOf('My Songs') < 0) secs.splice(secs.indexOf(BIB_SEC) < 0 ? secs.length : secs.indexOf(BIB_SEC), 0, 'My Songs');
    secs.forEach(function (sec) {
      var arr = groups[sec] || [];
      if (sec === BIB_SEC) {
        // a big collection: folded away unless searching or a song from it is open
        var fold = LS.get('bibOpen', null), open = !!q || (fold === null ? !!(S.song && S.song.bib) : fold);
        html += '<h3 class="lib-sec"><button class="lib-sec-btn" data-act="bibfold" aria-expanded="' + open + '"><span>' + esc(sec) + ' <span>' + arr.length + '</span></span><span class="chev" aria-hidden="true">›</span></button></h3>';
        if (!open) return;
        html += '<p class="privacy">🔒 Your Band-in-a-Box songs and styles are kept only on this device. Nothing is uploaded.</p>';
        html += '<div class="lib-actions"><button class="pill-btn" data-act="bib">Import Band-in-a-Box</button><button class="pill-btn" data-act="backup">Back up my songs</button></div>';
      } else
      html += '<h3 class="lib-sec">' + esc(sec) + (arr.length ? ' <span>' + arr.length + '</span>' : '') + '</h3>';
      if (sec === 'My Songs') {
        html += '<p class="privacy">🔒 Your songs are kept only on this device. Nothing is uploaded.</p>';
        html += '<div class="lib-actions"><button class="pill-btn" data-act="add">＋ Add song</button><button class="pill-btn" data-act="import">Import file</button><button class="pill-btn" data-act="backup"' + (mySongs.length ? '' : ' disabled') + '>Back up my songs</button></div>';
        arr = arr.filter(function (x) { return !x.bib; });
        if (!arr.length) html += '<p class="lib-empty">' + (q ? 'No matches.' : 'Songs you add or import will appear here.') + '</p>';
      }
      arr.forEach(function (s) {
        var sid = E.styleId(s.style) || 'bossa';
        var sub = s.bib ? [bibNice(s.bib.style) + (bibHave(s) ? '' : ' → ' + styleName(sid)), s.key, s.meter !== '4/4' ? s.meter : ''] : [styleName(sid), s.sub];
        html += '<button class="lib-item" aria-current="' + (S.song && S.song.id === s.id) + '" data-id="' + esc(s.id) + '"><span class="num">' + esc(s.bib ? 'BB' : styleName(sid).slice(0, 2)) + '</span><span style="min-width:0"><span class="t">' + esc(s.title) + '</span><span class="s">' + esc(sub.filter(Boolean).join(' · ')) + '</span></span></button>';
      });
    });
    list.innerHTML = html;
    forEach(list.querySelectorAll('.lib-item'), function (b) { b.onclick = function () { loadSong(b.dataset.id, true); closeLib(); }; });
    forEach(list.querySelectorAll('[data-act]'), function (b) {
      b.onclick = function () { var a = b.dataset.act; if (a === 'add') { closeLib(); openDialog(null); } else if (a === 'import') openImport(); else if (a === 'bib') $('bibInput').click(); else if (a === 'backup') backup(); else if (a === 'bibfold') { LS.set('bibOpen', b.getAttribute('aria-expanded') !== 'true'); renderLibrary(); } };
    });
  }
  function openLib() { $('library').classList.add('open'); $('scrim').classList.add('show'); var on = $('libList').querySelector('[aria-current="true"]'); if (on) on.scrollIntoView({ block: 'center' }); }
  function closeLib() { $('library').classList.remove('open'); $('scrim').classList.remove('show'); }

  /* ---------- loading a song ---------- */
  function songPrefs(id) { return (LS.get('prefs', {}) || {})[id] || {}; }
  function savePrefs() {
    if (!S.song) return; var all = LS.get('prefs', {}) || {};
    all[S.song.id] = { style: S.style, tempo: S.tempo, transpose: S.transpose, clave: S.clave };
    LS.set('prefs', all);
  }
  function loadSong(id, user) {
    var s = findSong(id) || builtIn[0] || allSongs()[0];
    if (!s) return;
    stop(true);
    S.song = s; LS.set('song', s.id);
    var base = E.buildSong(s);
    if (!base.nb) { toast('This song could not be read.'); return; }
    S.base = base;
    var pr = songPrefs(s.id), bid = bibStyleId(s), defStyle = (bid && E.STYLES[bid]) || E.styleId(s.style) || (base.triple ? 'vals' : 'bossa');
    if (bid && E.STYLES[bid]) defStyle = bid;
    S.style = E.styleId(pr.style) || defStyle;
    if (base.triple && !E.STYLES[S.style].p3) S.style = 'vals';
    S.tempo = pr.tempo || s.tempo || E.STYLES[S.style].tempo;
    S.transpose = pr.transpose || 0;
    S.clave = pr.clave || s.clave || '3-2';
    S.range = null; S.rangeMode = false; S.startBar = 0;
    rebuild();
    renderHeader(); renderStyles(); renderMixer(); renderView(); updateControls(); renderLibrary();
    if (base.errors.length && user) toast('Some of this song could not be read: ' + base.errors[0].message);
    if (user) window.scrollTo({ top: 0, behavior: 'smooth' });
    // a Band-in-a-Box song: load its own style from this device's storage and switch to it
    if (bid && !E.STYLES[bid]) ensureBib(s).then(function (id) {
      if (!id || S.song !== s) return;
      renderStyles(); if (!pr.style || pr.style === id) setStyle(id);
      renderHeader(); renderLibrary();
    });
  }
  /* audio timeline in concert pitch with transposition applied */
  function rebuild() {
    var b = S.base, t = S.transpose, kf = C.transposeFifths(b.key.fifths, t);
    var tl = Object.assign({}, b);
    tl.events = b.events.map(function (e) { return Object.assign({}, e, { midi: e.midi == null ? null : e.midi + t }); });
    tl.chordEvents = b.chordEvents.map(function (c) { var sym = t ? H.transposeChord(c.sym, t, kf) : c.sym; return { t: c.t, sym: sym, c: H.parseChord(sym) || c.c }; });
    S.tl = tl; S.keyFifths = kf;
  }
  function instrSemis() {
    if (S.instr === 'Bb') return 2;
    if (S.instr === 'Eb') {
      var r = S.base.melody; if (!r) return -3;
      var hi = -1; r.notes.forEach(function (n) { if (!n.rest && n.midi > hi) hi = n.midi; });
      return hi + S.transpose + 9 <= 81 ? 9 : -3;
    }
    return 0;
  }
  function dispSemis() { return S.transpose + instrSemis(); }
  function dispFifths() { return C.transposeFifths(S.base.key.fifths, dispSemis()); }
  function dispChord(sym) { return H.displayChord(sym, dispSemis(), dispFifths()); }
  var MODE_OFF = { mix: 7, dor: 2, aeo: 9, m: 9, min: 9, minor: 9, phr: 4, loc: 11, lyd: 5 };
  function keyTonic(f, mode) { var majPc = ((f * 7) % 12 + 12) % 12, off = MODE_OFF[mode] || 0; return H.nameOfPc((majPc + off) % 12, f).replace('b', '♭').replace('#', '♯'); }
  function keyLabel(f, mode) { var off = MODE_OFF[mode] || 0; return keyTonic(f, mode) + (off === 9 ? ' minor' : off ? ' ' + ({ 7: 'Mixolydian', 2: 'Dorian', 4: 'Phrygian', 11: 'Locrian', 5: 'Lydian' })[off] : ' major'); }

  function renderHeader() {
    var s = S.song, b = S.base;
    $('songTitle').textContent = s.title;
    $('songSub').textContent = s.sub || '';
    $('songCredit').textContent = s.credit || '';
    $('nowTitle').textContent = s.title;
    var chips = [];
    chips.push('<span class="mchip"><b>' + esc(b.meter.num + '/' + b.meter.den) + '</b> time</span>');
    chips.push('<span class="mchip"><b>' + b.nb + '</b> bars</span>');
    chips.push('<span class="mchip">' + (b.melody ? 'Melody + chords' : 'Chords only') + '</span>');
    if (s.mine) chips.push('<span class="mchip mine">🔒 My song</span>');
    if (s.bib) chips.push('<span class="mchip">Band-in-a-Box · ' + esc(bibNice(s.bib.style)) + (bibHave(s) ? '' : ' (style not imported)') + '</span>');
    $('metaChips').innerHTML = chips.join('');
    var about = '';
    if (s.about) about += '<p>' + esc(s.about) + '</p>';
    about += '<p><b>Source:</b> ' + esc(s.source || 'Added by you') + '</p>';
    if (s.rights) about += '<p><b>Rights:</b> ' + esc(s.rights) + '</p>';
    $('aboutText').innerHTML = about;
    var acts = '';
    if (s.mine) acts = '<button class="pill-btn" id="editSong">Edit</button><button class="pill-btn" id="dlSong">Save as file</button><button class="pill-btn danger" id="delSong">Delete</button>';
    else acts = '<button class="pill-btn" id="copySong">Make my own copy to edit</button>';
    $('songActions').innerHTML = acts;
    if ($('editSong')) $('editSong').onclick = function () { openDialog(S.song); };
    if ($('delSong')) $('delSong').onclick = deleteSong;
    if ($('dlSong')) $('dlSong').onclick = function () { downloadSong(S.song); };
    if ($('copySong')) $('copySong').onclick = function () {
      var src = S.song, copy = { id: newId(), title: src.title + ' (my copy)', style: S.style, tempo: S.tempo, clave: S.clave, key: src.key, meter: src.meter, abc: src.abc || '', chart: src.chart || '', source: 'Copied from the built-in “' + src.title + '”. ' + (src.source || ''), credit: src.credit || '' };
      mySongs.push(copy); LS.set('mySongs', mySongs); loadSong(copy.id, true); openDialog(findSong(copy.id));
    };
  }
  function renderStyles() {
    var row = $('styleRow'), triple = S.base.triple, html = '', bid = bibStyleId(S.song);
    if (bid && E.STYLES[bid]) html += '<button class="chip" data-s="' + esc(bid) + '" aria-pressed="' + (bid === S.style) + '" title="' + esc(E.STYLES[bid].name) + '">' + esc(E.STYLES[bid].short) + '</button>';
    E.STYLE_ORDER.forEach(function (id) {
      var st = E.STYLES[id], ok = triple ? !!st.p3 : !!st.p4;
      if (!ok) return;
      html += '<button class="chip" data-s="' + id + '" aria-pressed="' + (id === S.style) + '">' + esc(st.short) + '</button>';
    });
    row.innerHTML = html;
    forEach(row.querySelectorAll('.chip'), function (b) { b.onclick = function () { setStyle(b.dataset.s, true); }; });
    var on = row.querySelector('[aria-pressed="true"]'); if (on && on.scrollIntoView) { var r = row.getBoundingClientRect(), o = on.getBoundingClientRect(); if (o.right > r.right || o.left < r.left) row.scrollLeft += o.left - r.left - 20; }
    $('claveCtrl').hidden = !E.STYLES[S.style].clave;
  }
  function setStyle(id, user) {
    if (!E.STYLES[id]) return;
    var old = S.style; S.style = id;
    if (user && old !== id) {
      var ot = E.STYLES[old].tempo, nt = E.STYLES[id].tempo;
      // keep the user's tempo if they changed it; otherwise move to the new style's typical tempo
      if (Math.abs(S.tempo - ((S.song.style && E.styleId(S.song.style) === old && S.song.tempo) || ot)) < 3) S.tempo = (E.styleId(S.song.style) === id && S.song.tempo) || nt;
    }
    forEach($('styleRow').querySelectorAll('.chip'), function (b) { b.setAttribute('aria-pressed', b.dataset.s === id ? 'true' : 'false'); });
    $('claveCtrl').hidden = !E.STYLES[id].clave;
    P.gen = {};
    renderMixer(); updateControls(); savePrefs();
    if (user) toast(E.STYLES[id].name + (E.STYLES[id].clave ? ' · ' + S.clave + ' clave' : ''));
  }

  /* ---------- views ---------- */
  function renderView() {
    forEach($('viewSeg').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === S.view ? 'true' : 'false'); });
    var lead = S.view === 'lead' && S.base.melody;
    $('staff').hidden = !lead; $('chartView').hidden = !!lead;
    $('viewSeg').querySelector('[data-v="lead"]').disabled = !S.base.melody;
    var f = dispFifths(), mode = S.base.key.mode;
    var inst = S.instr === 'C' ? '' : ' · for ' + (S.instr === 'Bb' ? 'B♭' : 'E♭') + ' instruments';
    $('keyInfo').innerHTML = 'Key <b>' + esc(keyLabel(f, mode)) + '</b>' + inst;
    if (lead) renderStaff(); else renderGrid();
  }
  function renderStaff() {
    var r = S.base.melody; if (!r) return;
    var disp = C.displayNotes(r, dispSemis());
    // chord symbol shown at the first note (or rest) that sounds when each chord starts
    var chords = {}, ev = S.base.events, ce = S.base.chordEvents, k = 0;
    ce.forEach(function (c) {
      var best = null;
      for (var i = 0; i < ev.length; i++) { if (ev[i].start <= c.t + 1e-6 && c.t < ev[i].start + ev[i].dur - 1e-6) { best = ev[i]; break; } }
      if (!best) return;
      var n = best.n; if (chords[n] && chords[n] !== dispChord(c.sym)) chords[n] += ' ' + dispChord(c.sym); else chords[n] = dispChord(c.sym);
    });
    // a repeated section shows the same chords once: keep only the first time each source note is seen
    S.layout = ST.render($('staff'), { res: r, disp: disp, verse: 0, chords: chords, onTap: function (i) { var e = S.base.events.filter(function (x) { return x.n === i; })[0]; if (e) seekTo(Math.max(0, Math.floor((e.start - S.base.pickup + 1e-6) / S.base.barQ))); } });
    S.cur = -1; S.lastSys = -1;
  }
  function renderGrid() {
    var g = $('grid'), b = S.base, html = '', prevKey = null;
    b.bars.forEach(function (bar, k) {
      var names = bar.chords.map(function (c) { return dispChord(c.sym); }), key = names.join(' ');
      var sim = key === prevKey && !bar.label; prevKey = key;
      var cls = 'bar' + (S.range && k >= S.range.a && k <= S.range.b ? ' inrange' : '') + (S.rangeMode && S.rangeFirst === k ? ' rsel' : '');
      html += '<div class="' + cls + '" data-k="' + k + '" role="button" tabindex="0" aria-label="Bar ' + (k + 1) + ': ' + esc(names.join(', ') || 'no chord') + '"><span class="bn">' + (k + 1) + '</span>' + (bar.label ? '<span class="lab">' + esc(bar.label) + '</span>' : '');
      if (!names.length) html += '<span class="ch sim">—</span>';
      names.forEach(function (n) { html += '<span class="ch' + (names.length > 2 || n.length > 6 ? ' small' : '') + (sim ? ' sim' : '') + '">' + esc(n) + '</span>'; });
      html += '</div>';
    });
    g.innerHTML = html;
    g.className = 'grid' + (b.beatsPerBar === 3 && false ? ' c3' : '');
    forEach(g.querySelectorAll('.bar'), function (el) {
      el.onclick = function () { barTap(+el.dataset.k); };
      el.onkeydown = function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); barTap(+el.dataset.k); } };
    });
    $('pickupNote').hidden = !b.pickup;
    if (b.pickup) $('pickupNote').textContent = 'The melody starts with a short pickup before bar 1.';
    updateRangeUI();
    S.curBar = -1;
  }
  function barTap(k) {
    if (S.rangeMode) {
      if (S.rangeFirst == null) { S.rangeFirst = k; $('rangeHint').textContent = 'Now tap the last bar to loop.'; renderGrid(); return; }
      var a = Math.min(S.rangeFirst, k), b = Math.max(S.rangeFirst, k);
      S.range = { a: a, b: b }; S.rangeMode = false; S.rangeFirst = null;
      if (!S.loop) setLoop(true, true);
      renderGrid(); toast('Looping bars ' + (a + 1) + '–' + (b + 1));
      if (S.playing) seekTo(a);
      return;
    }
    seekTo(k);
  }
  function updateRangeUI() {
    $('rangeBtn').textContent = S.rangeMode ? 'Cancel' : (S.range ? 'Choose other bars' : 'Loop some bars');
    $('rangeClear').hidden = !S.range;
    $('rangeHint').textContent = S.rangeMode ? (S.rangeFirst == null ? 'Tap the first bar to loop.' : 'Now tap the last bar to loop.') : S.range ? 'Looping bars ' + (S.range.a + 1) + '–' + (S.range.b + 1) + '. Tap a bar to jump there.' : 'Tap a bar to play from there.';
  }

  /* ---------- mixer ---------- */
  function partLevel(id) {
    if (id === 'click') return BASE_GAIN.click;
    var m = mix[id]; if (!m) return 0;
    if (S.solo && id !== 'melody') return 0;
    if (m.mute) return 0;
    if (id === 'melody' && melodyOff()) return 0;
    return BASE_GAIN[id] * m.vol * m.vol * 1.4;
  }
  function melodyOff() { return mix.melody.mute; }
  function applyMix() { E.PARTS.forEach(function (p) { A.setLevel(p.id, partLevel(p.id)); }); A.setLevel('click', BASE_GAIN.click); LS.set('mix2', mix); }
  function percOn() { var used = E.styleParts(S.style, S.base.triple); return PERC_IDS.some(function (id) { return used[id] && !mix[id].mute; }); }
  function renderMixer() {
    var used = E.styleParts(S.style, S.base.triple), html = '';
    function row(p, extra, sub) {
      var m = mix[p.id], un = !used[p.id];
      return '<div class="mrow' + (un ? ' unused' : '') + '" data-p="' + p.id + '"><div class="mname">' + esc(p.name) + (sub ? '<small>' + sub + '</small>' : un ? '<small>Not used in ' + esc(E.STYLES[S.style].short) + '</small>' : '') + '</div>' +
        '<div class="mbtns"><button class="mbtn mute" aria-pressed="' + m.mute + '" aria-label="Mute ' + esc(p.name) + '">' + (m.mute ? 'Off' : 'Mute') + '</button>' +
        (p.id === 'melody' ? '<button class="mbtn solo" aria-pressed="' + S.solo + '" title="Hear only the melody">Solo</button>' : '') + '</div>' +
        '<input type="range" min="0" max="100" value="' + Math.round(m.vol * 100) + '" aria-label="' + esc(p.name) + ' volume">' + (extra || '') + '</div>';
    }
    var mel = E.PARTS[0], pno = E.PARTS[1], bs = E.PARTS[2];
    html += row(mel, '<div class="seg" data-seg="voice"><button data-v="flute">Flute</button><button data-v="vibes">Vibes</button><button data-v="piano">Piano</button></div>', S.base.melody ? 'The tune' : 'This song has no melody written');
    html += row(pno, '<div class="seg" data-seg="comp"><button data-v="piano">Piano</button><button data-v="guitar">Nylon guitar</button></div>', pianoDesc());
    html += row(bs, '', bassDesc());
    var pOn = percOn(), pu = PERC_IDS.filter(function (id) { return used[id]; });
    html += '<div class="perc-head"><div><b>Percussion</b><small>' + (pu.length ? (pOn ? 'Playing' : 'Off — piano and bass only') : 'None in this style') + '</small></div>' + (pu.length ? '<button class="pill-btn' + (pOn ? '' : ' solid') + '" id="percToggle">' + (pOn ? 'Turn percussion off' : 'Add percussion') + '</button>' : '') + '</div>';
    html += '<details class="perc-list"' + (LS.get('percOpen', false) ? ' open' : '') + '><summary>Percussion players (' + pu.length + ' in ' + esc(E.STYLES[S.style].short) + ')</summary>';
    E.PARTS.filter(function (p) { return p.perc; }).sort(function (a, b) { return (used[b.id] ? 1 : 0) - (used[a.id] ? 1 : 0); }).forEach(function (p) { html += row(p, '', p.id === 'clave' && used.clave ? (E.STYLES[S.style].claveName || 'clave') + ' · ' + S.clave : ''); });
    html += '</details>';
    var box = $('mixRows'); box.innerHTML = html;
    forEach(box.querySelectorAll('.mrow'), function (r) {
      var id = r.dataset.p, m = mix[id];
      var mb = r.querySelector('.mute'), rg = r.querySelector('input[type=range]');
      fill(rg);
      mb.onclick = function () { m.mute = !m.mute; if (!m.mute && PERC_IDS.indexOf(id) >= 0) loadSamples(); if (id === 'melody') syncMelBtn(); applyMix(); renderMixer(); };
      rg.oninput = function () { m.vol = this.value / 100; if (m.mute && m.vol > 0 && id !== 'melody') { m.mute = false; mb.setAttribute('aria-pressed', 'false'); mb.textContent = 'Mute'; } fill(this); applyMix(); };
      rg.onchange = function () { if (id !== 'melody' && PERC_IDS.indexOf(id) >= 0) renderMixer(); };
      var so = r.querySelector('.solo'); if (so) so.onclick = function () { S.solo = !S.solo; if (S.solo && mix.melody.mute) { mix.melody.mute = false; syncMelBtn(); } applyMix(); renderMixer(); };
      var seg = r.querySelector('.seg');
      if (seg) {
        var key = seg.dataset.seg, cur = key === 'voice' ? S.voice : S.comp;
        forEach(seg.querySelectorAll('button'), function (b) {
          b.setAttribute('aria-pressed', b.dataset.v === cur ? 'true' : 'false');
          b.onclick = function () {
            if (key === 'voice') { S.voice = b.dataset.v; LS.set('voice', S.voice); } else { S.comp = b.dataset.v; LS.set('comp', S.comp); }
            var k2 = key; loadSamples().then(function () { preview(k2 === 'voice' ? 'melody' : 'comp'); });
            renderMixer();
          };
        });
      }
    });
    if ($('percToggle')) $('percToggle').onclick = function () {
      var on = !percOn(); PERC_IDS.forEach(function (id) { if (used[id]) mix[id].mute = !on; });
      applyMix(); renderMixer(); toast(on ? 'Percussion added' : 'Percussion off — piano and bass only'); if (on) loadSamples();
    };
    var det = box.querySelector('details'); det.ontoggle = function () { LS.set('percOpen', det.open); };
  }
  function pianoDesc() {
    var d = { bossa: 'Bossa comping, guitar-style rhythm', samba: 'Samba comping (partido-alto feel)', salsa: 'Montuno (guajeo) in octaves', chacha: 'Cha-cha chords with the “cha-cha” push', bolero: 'Arpeggios and soft chords', mambo: 'Mambo montuno with block hits', rumba: 'Syncopated chords', merengue: 'Merengue jaleo pattern', cumbia: 'Off-beat chords', tango: 'Marcato and 3-3-2 sincopa', afro68: 'Chords on the 6/8 bell feel', habanera: 'Habanera / danzón chords', vals: 'Waltz: bass on 1, chords on 2 and 3' };
    return (S.comp === 'guitar' ? 'Nylon guitar · ' : '') + (d[S.style] || 'Chords');
  }
  function bassDesc() {
    var d = { bossa: 'Root–fifth, bossa rhythm', samba: 'Surdo-style root–fifth', salsa: 'Tumbao (anticipated bass)', chacha: 'Cha-cha bass', bolero: 'Root–fifth, gentle', mambo: 'Tumbao', rumba: 'Tumbao-style', merengue: 'Root–fifth with walk-ups', cumbia: 'Root–fifth', tango: 'Marcato / 3-3-2 with arrastre', afro68: 'Root–fifth in 6/8', habanera: 'Habanera rhythm', vals: 'Root on 1, fifth on the next bar' };
    return d[S.style] || 'Bass line';
  }
  function preview(which) {
    try { A.ensure(); applyMix(); } catch (e) { return; }
    if (S.playing) return;
    var t = A.now() + 0.05, c = (S.tl.chordEvents[0] || {}).c;
    if (which === 'melody') { var n = S.tl.events.filter(function (e) { return e.midi != null && e.attack !== false; }).slice(0, 3); var bq = 60 / S.tempo; n.forEach(function (e, i) { A.melody(e.midi, t + i * 0.36, 0.32, 0.8, S.voice); }); if (!n.length) A.melody(72, t, 0.6, 0.8, S.voice); }
    else if (c) { var v = H.voice(c, null, { low: 54, high: 76, n: 4, center: 64 }); if (S.comp === 'guitar') A.guitar(v, t, 1.2, 0.8, 'piano'); else A.piano(v, t, 1.2, 0.75, 'piano'); }
  }
  function fill(r) { if (!r) return; var p = (r.value - r.min) / (r.max - r.min) * 100; r.style.setProperty('--p', p + '%'); }

  /* ---------- melody toggle (the big button) ---------- */
  function syncMelBtn() {
    var on = !mix.melody.mute;
    $('melBtn').setAttribute('aria-pressed', on ? 'true' : 'false');
    $('melLbl').textContent = on ? 'ON' : 'OFF';
    $('melBtn').setAttribute('aria-label', on ? 'Melody is on. Tap to turn the melody off and play along yourself.' : 'Melody is off. Tap to hear the melody again.');
  }
  function toggleMelody() {
    mix.melody.mute = !mix.melody.mute;
    if (mix.melody.mute) S.solo = false;
    syncMelBtn(); applyMix(); renderMixer();
    toast(mix.melody.mute ? 'Melody off — now you play the tune!' : 'Melody on');
  }

  /* =================== PLAYBACK =================== */
  function spq() { return 60 / (S.tempo * S.tl.beatQ); } // seconds per quarter note (tempo counts the song's beat)
  function pbTime(pb) { return P.anchorTime + (pb - P.anchorBeat) * spq(); }
  function curPb() { return P.anchorBeat + (A.now() - A.latency() - P.anchorTime) / spq(); }
  function endBar() { return S.range ? S.range.b : S.tl.nb - 1; }
  function firstBar() { return S.range ? S.range.a : 0; }
  function warmUp() {
    var jobs = [], lo = 40, hi = 86, seen = {};
    if (!A.ready('piano')) for (var m = lo; m <= hi; m += 3) (function (m) { jobs.push(function () { A.pianoBuf(m, false); }); jobs.push(function () { A.pianoBuf(m, true); }); })(m);
    if (!A.ready('bass')) for (var b = 28; b <= 55; b++) (function (b) { jobs.push(function () { A.bassBuf(b); }); })(b);
    var used = E.styleParts(S.style, S.tl.triple);
    ['shaker', 'shakerAcc', 'click', 'clickHi'].concat(A.ready('perc') ? [] : A.PERC_NAMES).forEach(function (n) { jobs.push(function () { A.percBuf(n); }); });
    if (S.comp === 'guitar' && !A.ready('guitar')) for (var g = 50; g <= 79; g++) (function (g) { jobs.push(function () { A.guitarBuf(g); }); })(g);
    if (S.voice === 'vibes' && !A.ready('vibes')) S.tl.events.forEach(function (e) { if (e.midi != null && !seen[e.midi]) { seen[e.midi] = 1; jobs.push(function () { A.vibesBuf(e.midi); }); } });
    A.warm(jobs);
  }
  /* ---------- real instrument samples: load what the current settings need, with a progress bar ---------- */
  function neededSets() {
    var n = ['piano', 'bass'];
    if (S.voice === 'flute') n.push('flute'); else if (S.voice === 'vibes') n.push('vibes');
    var bs = E.STYLES[S.style] && E.STYLES[S.style].bib;
    if (S.comp === 'guitar' || (bs && bs.parts.guitar && !bs.parts.piano)) n.push('guitar');
    if (S.base && percOn()) n.push('perc');
    return n;
  }
  var loadingP = null;
  function loadSamples() {
    var need = neededSets().filter(function (id) { return !A.ready(id); });
    if (!need.length) return Promise.resolve();
    var bar = $('loadBar'), fillEl = $('loadFill'), txt = $('loadTxt'), shown = false;
    var timer = setTimeout(function () { shown = true; bar.classList.add('show'); }, 150);
    var p = A.load(need, function (d, t) { var pc = t ? Math.round(d / t * 100) : 100; fillEl.style.width = pc + '%'; txt.textContent = 'Getting the instruments ready… ' + pc + '%'; if (S.waiting) $('nowState').textContent = 'Loading instruments… ' + pc + '%'; })
      .then(function () {
        clearTimeout(timer); txt.textContent = 'Instruments ready'; fillEl.style.width = '100%';
        setTimeout(function () { bar.classList.remove('show'); }, shown ? 700 : 0);
        try { if (!S.askedCache && navigator.serviceWorker && navigator.serviceWorker.controller) { S.askedCache = true; navigator.serviceWorker.controller.postMessage({ type: 'cache-samples' }); } } catch (e) {}
        var bad = need.filter(function (id) { return !A.ready(id); });
        if (bad.length) toast('Some instrument sounds could not be loaded, so simpler built-in sounds are used.');
      });
    loadingP = p; return p;
  }
  function play(fromBar) {
    try { A.ensure(); } catch (e) { toast(e.message); return; }
    var need = neededSets().filter(function (id) { return !A.ready(id) && A.SETS[id]; });
    if (need.length && !S.waiting) {
      S.waiting = true; $('nowState').textContent = 'Loading instruments…'; setPlayIcon(true);
      loadSamples().then(function () { if (!S.waiting) return; S.waiting = false; play(fromBar); });
      return;
    }
    S.waiting = false;
    applyMix();
    if (!S.warmed) { S.warmed = true; warmUp(); }
    var tl = S.tl, start = fromBar != null ? fromBar : S.startBar;
    if (start < firstBar() || start > endBar()) start = firstBar();
    P.segs = []; P.queue = []; P.pbEnd = 0; P.done = false; P.gen = {}; P.nextBar = start;
    var pickupNotes = start === 0 && tl.pickup > 0;
    if (S.countIn > 0) {
      var ci = E.countIn(tl, S.countIn);
      P.segs.push({ kind: 'count', start: 0, len: ci.len, n: tl.beatsPerBar });
      ci.clicks.forEach(function (c) { P.queue.push({ pb: c.t, kind: 'click', accent: c.accent, n: c.n }); });
      P.pbEnd = ci.len;
    } else if (pickupNotes) {
      P.segs.push({ kind: 'pick', start: 0, len: tl.pickup }); P.pbEnd = tl.pickup;
    }
    if (pickupNotes) queuePickup(P.pbEnd - tl.pickup);
    P.anchorTime = A.now() + 0.12; P.anchorBeat = 0;
    S.playing = true; setPlayIcon(); $('nowState').textContent = S.countIn ? 'Count-in…' : 'Playing';
    clearInterval(P.timer); P.timer = setInterval(tick, 25); tick();
    cancelAnimationFrame(P.raf); P.raf = requestAnimationFrame(frame);
  }
  function queuePickup(at) {
    S.tl.events.forEach(function (e) { if (e.start < S.tl.pickup - 1e-6 && e.midi != null && e.attack !== false) P.queue.push({ pb: at + e.start, kind: 'mel', midi: e.midi, dur: e.sound || e.dur, n: e.n }); });
  }
  function appendBar() {
    var tl = S.tl, k = P.nextBar;
    if (k > endBar()) { if (S.loop) k = firstBar(); else { P.done = true; return; } }
    var seg = { kind: 'bar', bar: k, start: P.pbEnd, len: tl.barQ }; P.segs.push(seg);
    var ending = !S.loop && !S.range;
    var st = E.STYLES[S.style], evs;
    if (st && st.bib) {
      // the song's own Band-in-a-Box patterns, fitted to its chords; built-in percussion if its drums are not decoded
      evs = BS.generateBar(tl, st.bib, k, { state: P.gen.bib || (P.gen.bib = {}), parts: S.song.bib && bibStyleId(S.song) === S.style ? S.song.bib.parts : null, ending: ending });
      if (!st.drums) evs = evs.concat(E.generateBar(tl, st.fallback, k, { clave: S.clave, ending: ending, state: P.gen }).filter(function (e) { return e.part !== 'piano' && e.part !== 'bass'; }));
    } else evs = E.generateBar(tl, S.style, k, { clave: S.clave, ending: ending, state: P.gen });
    evs.forEach(function (ev) { P.queue.push({ pb: seg.start + ev.t, kind: 'back', ev: ev }); });
    var b0 = tl.pickup + k * tl.barQ, b1 = b0 + tl.barQ;
    tl.events.forEach(function (e) {
      if (e.midi == null || e.attack === false) return;
      if (e.start >= b0 - 1e-6 && e.start < b1 - 1e-6) P.queue.push({ pb: seg.start + e.start - b0, kind: 'mel', midi: e.midi, dur: e.sound || e.dur, n: e.n });
    });
    // when looping back to the top of a song with a pickup, play the pickup notes at the end of the last bar
    if (S.loop && k === endBar() && firstBar() === 0 && tl.pickup > 0) queuePickup(seg.start + tl.barQ - tl.pickup);
    P.pbEnd += tl.barQ; P.nextBar = k + 1;
    P.queue.sort(function (a, b) { return a.pb - b.pb; });
  }
  function tick() {
    if (!S.playing) return;
    var now = A.now(), horizon = now + 0.3, s = spq();
    while (!P.done && pbTime(P.pbEnd) < horizon + S.tl.barQ * s * 0.5) appendBar();
    while (P.queue.length && pbTime(P.queue[0].pb) < horizon) {
      var q = P.queue.shift(), t = Math.max(now + 0.005, pbTime(q.pb));
      if (q.kind === 'click') A.click(t, q.accent);
      else if (q.kind === 'mel') A.melody(q.midi, t, Math.max(0.06, q.dur * s * 0.96 - 0.02), 0.82, S.voice);
      else playBack(q.ev, t, s);
    }
    if (P.done && !P.queue.length && now > pbTime(P.pbEnd) + 0.3) finished();
  }
  function playBack(ev, t, s) {
    if (PERC_IDS.indexOf(ev.part) >= 0 && !partLevel(ev.part)) return; // muted percussion: nothing to play
    var dur = ev.dur * s;
    if (ev.part === 'piano') {
      if (S.comp === 'guitar' || ev.instr === 'guitar') A.guitar(ev.midi, t, dur, ev.vel, 'piano');
      else if (ev.raw) A.piano(ev.midi, t, dur, ev.vel, 'piano', { spread: 0 });
      else A.piano(ev.midi, t, dur, ev.vel, 'piano', { spread: ev.block ? 0.006 : 0.003 });
    } else if (ev.part === 'bass') A.bass(ev.midi[0], t, dur, ev.vel);
    else if (ev.sound) A.perc(ev.sound, ev.part, t, ev.vel);
  }
  function finished() { stop(); $('nowState').textContent = 'Finished'; }
  function frame() {
    if (!S.playing) return;
    var pb = curPb(), seg = null;
    for (var i = P.segs.length - 1; i >= 0; i--) if (P.segs[i].start <= pb + 1e-9) { seg = P.segs[i]; break; }
    var badge = $('countBadge');
    if (seg && seg.kind === 'count' && pb < seg.start + seg.len) {
      var bq = S.tl.beatQ, n = Math.floor((pb - seg.start) / bq) % seg.n + 1;
      badge.textContent = n; badge.classList.add('show');
      $('nowState').textContent = 'Count-in… ' + n;
      if (S.tl.pickup && P.nextBar === 0) {}
    } else badge.classList.remove('show');
    if (seg && seg.kind === 'bar') {
      var songT = S.tl.pickup + seg.bar * S.tl.barQ + Math.min(seg.len - 1e-6, pb - seg.start);
      showPos(seg.bar, songT);
      $('nowState').textContent = 'Bar ' + (seg.bar + 1) + ' of ' + S.tl.nb + (S.range ? ' · looping ' + (S.range.a + 1) + '–' + (S.range.b + 1) : S.loop ? ' · repeat on' : '');
    } else if (seg && seg.kind !== 'count') showPos(-1, pb - seg.start);
    P.raf = requestAnimationFrame(frame);
  }
  function showPos(bar, songT) {
    $('progressBar').style.width = Math.max(0, Math.min(100, songT / S.tl.total * 100)) + '%';
    if (bar !== S.curBar) {
      S.curBar = bar;
      var g = $('grid'); if (!$('chartView').hidden) {
        forEach(g.querySelectorAll('.bar.on'), function (e) { e.classList.remove('on'); });
        var el = g.querySelector('.bar[data-k="' + bar + '"]');
        if (el) { el.classList.add('on'); keepVisible(el); }
      }
    }
    if (S.layout && !$('staff').hidden) {
      var evs = S.tl.events, found = -1;
      for (var k = 0; k < evs.length; k++) if (evs[k].start <= songT + 1e-6 && songT < evs[k].start + evs[k].dur) { found = evs[k].n; break; }
      if (found !== S.cur) setCurrent(found);
    }
  }
  function keepVisible(el) {
    var r = el.getBoundingClientRect(), trH = $('transport').getBoundingClientRect().height, topH = document.querySelector('.topbar').getBoundingClientRect().height;
    if (r.top < topH + 8 || r.bottom > window.innerHeight - trH - 8) window.scrollBy({ top: r.top - topH - (window.innerHeight - topH - trH) * 0.3, behavior: 'smooth' });
  }
  function setCurrent(i) {
    var L = S.layout, svg = $('staff').querySelector('svg'); if (!L || !svg) return;
    forEach(svg.querySelectorAll('.st-note.on, .lyr.on, .chordsym.on'), function (e) { e.classList.remove('on'); });
    S.cur = i;
    if (i < 0 || !L.notes[i]) { L.hl.classList.remove('show'); return; }
    var info = L.notes[i], g = svg.querySelector('.st-note[data-i="' + i + '"]'); if (g) g.classList.add('on');
    if (info.lyr) info.lyr.classList.add('on');
    // light up the chord in force
    for (var j = i; j >= 0; j--) if (L.notes[j] && L.notes[j].ch) { L.notes[j].ch.classList.add('on'); break; }
    L.hl.style.transform = 'translate(' + (info.x - 1.4 * L.sp) + 'px,' + (L.sysTop[info.sys] + 2.6 * L.sp) + 'px)'; L.hl.classList.add('show');
    if (info.sys !== S.lastSys) {
      S.lastSys = info.sys;
      var rect = svg.getBoundingClientRect(), sc = rect.width / svg.viewBox.baseVal.width, top = rect.top + L.sysTop[info.sys] * sc, bottom = top + L.sysH * sc;
      var trH = $('transport').getBoundingClientRect().height, topH = document.querySelector('.topbar').getBoundingClientRect().height;
      if (top < topH + 8 || bottom > window.innerHeight - trH - 8) window.scrollBy({ top: top - topH - (window.innerHeight - topH - trH) * 0.25, behavior: 'smooth' });
    }
  }
  function pause() {
    if (!S.playing) return;
    var pb = curPb(), seg = null;
    for (var i = P.segs.length - 1; i >= 0; i--) if (P.segs[i].start <= pb) { seg = P.segs[i]; break; }
    S.startBar = seg && seg.kind === 'bar' ? seg.bar : firstBar();
    halt(); $('nowState').textContent = 'Paused at bar ' + (S.startBar + 1);
  }
  function halt() { S.waiting = false; S.playing = false; clearInterval(P.timer); cancelAnimationFrame(P.raf); A.silence(); P.queue = []; $('countBadge').classList.remove('show'); setPlayIcon(); }
  function stop(quiet) {
    halt(); S.startBar = firstBar(); S.curBar = -1;
    if (S.layout) setCurrent(-1);
    forEach($('grid').querySelectorAll('.bar.on'), function (e) { e.classList.remove('on'); });
    $('progressBar').style.width = '0%';
    if (!quiet) $('nowState').textContent = 'Ready';
  }
  function toggle() { if (S.waiting) { halt(); $('nowState').textContent = 'Ready'; return; } if (S.playing) pause(); else play(); }
  function seekTo(bar) {
    bar = Math.max(0, Math.min(S.tl.nb - 1, bar));
    if (S.range && (bar < S.range.a || bar > S.range.b)) { S.range = null; updateRangeUI(); if (!$('chartView').hidden) renderGrid(); }
    S.startBar = bar;
    if (S.playing) { halt(); var ci = S.countIn; S.countIn = 0; play(bar); S.countIn = ci; }
    else { $('nowState').textContent = 'Starts at bar ' + (bar + 1) + ' — press Play'; showPos(bar, S.tl.pickup + bar * S.tl.barQ); }
  }
  function setPlayIcon(busy) {
    $('playBtn').classList.toggle('busy', !!busy);
    $('playIco').innerHTML = S.playing || busy ? '<rect x="6.5" y="5" width="4" height="14" rx="1.3"/><rect x="13.5" y="5" width="4" height="14" rx="1.3"/>' : '<path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z"/>';
    $('playBtn').setAttribute('aria-label', S.playing ? 'Pause' : 'Play');
  }
  function setTempo(b) {
    b = Math.max(40, Math.min(240, Math.round(b)));
    if (S.playing) { var pb = P.anchorBeat + (A.now() - P.anchorTime) / spq(); P.anchorBeat = pb; P.anchorTime = A.now(); }
    S.tempo = b; updateControls(); savePrefs();
  }
  function setTranspose(t) {
    t = Math.max(-12, Math.min(12, t));
    var was = S.playing; if (was) pause();
    S.transpose = t; rebuild(); renderView(); updateControls(); savePrefs();
    if (was) { var ci = S.countIn; S.countIn = 0; play(S.startBar); S.countIn = ci; }
  }
  function setLoop(on, quiet) { S.loop = on; LS.set('loop', on); $('loopBtn').setAttribute('aria-pressed', on ? 'true' : 'false'); if (!quiet) toast(on ? (S.range ? 'Repeating bars ' + (S.range.a + 1) + '–' + (S.range.b + 1) : 'Repeat the whole song: on') : 'Repeat off'); }
  function updateControls() {
    var t = $('tempo'); t.value = S.tempo; fill(t);
    var st = E.STYLES[S.style], unit = S.tl.beatQ === 1.5 ? 'dotted-quarter' : S.tl.beatQ === 2 ? 'half-note' : 'beats';
    $('tempoOut').textContent = S.tempo + ' ' + (unit === 'beats' ? 'beats/min' : unit + 's/min');
    var tr = S.transpose;
    $('transOut').textContent = tr === 0 ? 'As written' : (tr > 0 ? '+' : '−') + Math.abs(tr) + (Math.abs(tr) === 1 ? ' half step' : ' half steps');
    $('keyVal').textContent = keyTonic(S.keyFifths, S.base.key.mode) + ((MODE_OFF[S.base.key.mode] || 0) === 9 ? 'm' : '');
    forEach($('countSeg').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', +b.dataset.v === S.countIn ? 'true' : 'false'); });
    forEach($('instSeg').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === S.instr ? 'true' : 'false'); });
    forEach($('claveSeg').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', b.dataset.v === S.clave ? 'true' : 'false'); });
    $('claveOut').textContent = st.clave ? (st.claveName || '') : '';
    $('loopBtn').setAttribute('aria-pressed', S.loop ? 'true' : 'false');
    syncMelBtn();
  }

  /* =================== ADD / EDIT =================== */
  function newId() { return 'my-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
  var editing = null;
  function openDialog(song) {
    editing = song && song.mine ? song : null;
    $('dlgTitle').textContent = editing ? 'Edit song' : 'Add a song';
    var sel = $('fStyle'); sel.innerHTML = E.STYLE_ORDER.map(function (id) { return '<option value="' + id + '">' + esc(E.STYLES[id].name) + '</option>'; }).join('');
    var s = editing || {};
    $('fTitle').value = s.title || ''; sel.value = E.styleId(s.style) || 'bossa'; $('fTime').value = s.meter || '4/4'; $('fKey').value = s.key || ''; $('fTempo').value = s.tempo || '';
    $('fChart').value = s.chart || ''; $('fAbc').value = s.abc || '';
    $('dlgMsg').className = 'msg'; $('dlgMsg').innerHTML = '';
    var d = $('songDlg'); if (d.showModal) d.showModal(); else d.setAttribute('open', '');
    setTimeout(function () { if (!editing) $('fTitle').focus(); }, 50);
  }
  function closeDialog() { var d = $('songDlg'); if (d.close) d.close(); else d.removeAttribute('open'); }
  function saveDialog() {
    var s = {
      id: editing ? editing.id : newId(), title: $('fTitle').value.trim() || 'Untitled', style: $('fStyle').value, meter: $('fTime').value,
      key: $('fKey').value.trim(), tempo: Math.max(40, Math.min(260, +$('fTempo').value || 0)) || E.STYLES[$('fStyle').value].tempo,
      chart: $('fChart').value.trim(), abc: $('fAbc').value.trim(), source: editing ? editing.source : 'Typed in by you on ' + new Date().toLocaleDateString(), credit: editing ? editing.credit || '' : ''
    };
    var msg = $('dlgMsg');
    if (!s.chart && !s.abc) { msg.className = 'msg show err'; msg.innerHTML = 'Please type some chords, for example <code>| Am7 | D7 | Gmaj7 | % |</code>'; return false; }
    if (s.abc && !/^\s*K:/m.test(s.abc)) s.abc = 'X:1\nT:' + s.title + '\nM:' + s.meter + '\nL:1/8\nK:' + (s.key || 'C') + '\n' + s.abc;
    var tl = E.buildSong(s);
    if (tl.errors.length) {
      msg.className = 'msg show err';
      msg.innerHTML = tl.errors.slice(0, 3).map(function (e) { return '<div>' + (e.where === 'chords' ? 'Chords' : 'Melody') + (e.line ? ', line ' + e.line : '') + ': ' + esc(e.message) + '</div>'; }).join('');
      if (!tl.nb || !(tl.hasChords || tl.melody)) return false;
      if (!msg.dataset.ok) { msg.dataset.ok = '1'; msg.innerHTML += '<div>Press Save again to keep it anyway.</div>'; return false; }
    }
    delete msg.dataset.ok;
    if (!tl.hasChords && !tl.melody) { msg.className = 'msg show err'; msg.textContent = 'No chords were found. Use chord names like C, Am7, G7 between bar lines | … |'; return false; }
    if (editing && editing.bib) { s.bib = editing.bib; s.section = editing.section; }
    if (editing) { var i = mySongs.findIndex(function (m) { return m.id === editing.id; }); mySongs[i] = s; } else mySongs.push(s);
    LS.set('mySongs', mySongs);
    var all = LS.get('prefs', {}) || {}; delete all[s.id]; LS.set('prefs', all);
    closeDialog(); loadSong(s.id, true); toast(editing ? 'Saved' : 'Added “' + s.title + '” to My Songs');
    return true;
  }
  function deleteSong() {
    var s = S.song; if (!s || !s.mine) return;
    if (!confirm('Delete “' + s.title + '” from this device? This cannot be undone (unless you have a backup).')) return;
    mySongs = mySongs.filter(function (m) { return m.id !== s.id; }); LS.set('mySongs', mySongs);
    loadSong(builtIn[0].id); toast('Deleted');
  }
  function download(name, text, type) {
    var blob = new Blob([text], { type: type || 'text/plain' }), a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 800);
  }
  function fileName(t) { return (t || 'song').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '-') || 'song'; }
  function downloadSong(s) {
    var txt = 'Title: ' + s.title + '\nStyle: ' + (E.STYLES[E.styleId(s.style)] || {}).name + '\nTime: ' + (s.meter || '4/4') + (s.key ? '\nKey: ' + s.key : '') + '\nTempo: ' + (s.tempo || '') + '\n\n' + (s.chart || '') + (s.abc ? '\n\n' + s.abc : '') + '\n';
    if (!s.chart && s.abc) { download(fileName(s.title) + '.abc', s.abc + '\n', 'text/vnd.abc'); return; }
    download(fileName(s.title) + '.txt', txt);
  }
  function backup() {
    var prefs = LS.get('prefs', {}) || {}, my = {};
    mySongs.forEach(function (s) { if (prefs[s.id]) my[s.id] = prefs[s.id]; });
    var data = { app: 'latin-fakebook', version: 1, saved: new Date().toISOString(), songs: mySongs, prefs: my };
    var d = new Date(), stamp = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
    // Band-in-a-Box styles that the songs use go into the same file, so restoring it brings both back
    var keys = {}; mySongs.forEach(function (m) { if (m.bib && m.bib.styleKey && bibKnown[m.bib.styleKey]) keys[m.bib.styleKey] = 1; });
    return Promise.all(Object.keys(keys).map(function (k) { return bibGet(k).then(function (v) { if (v) { data.bibStyles = data.bibStyles || {}; data.bibStyles[k] = v; } }); })).catch(function () {}).then(function () {
      download('latin-fakebook-backup-' + stamp + '.json', JSON.stringify(data), 'application/json');
      var ns = Object.keys(data.bibStyles || {}).length;
      toast('Backup saved: ' + mySongs.length + ' song' + (mySongs.length === 1 ? '' : 's') + (ns ? ' and ' + ns + ' Band-in-a-Box style' + (ns === 1 ? '' : 's') : ''));
      return data;
    });
  }


  /* =================== BAND-IN-A-BOX =================== */
  // Songs (.SGU/.MGU) become normal "my songs"; styles (.STY) are turned into the app's own pattern JSON and kept in
  // IndexedDB on this device (they are too big for localStorage). Nothing is sent anywhere.
  var BI = window.LFBiab, BS = window.LFBiabSty, bibKnown = {}, bibCache = {}, bibReadyP = Promise.resolve();
  var bibDB = null;
  function bibOpen() {
    if (!bibDB) bibDB = new Promise(function (res, rej) {
      if (!window.indexedDB) return rej(new Error('This browser cannot store styles.'));
      var r = indexedDB.open('lfb-bib', 1);
      r.onupgradeneeded = function () { r.result.createObjectStore('styles'); };
      r.onsuccess = function () { res(r.result); }; r.onerror = function () { rej(r.error); };
    });
    return bibDB;
  }
  function bibTx(mode, fn) {
    return bibOpen().then(function (db) { return new Promise(function (res, rej) {
      var t = db.transaction('styles', mode), req = fn(t.objectStore('styles'));
      t.oncomplete = function () { res(req ? req.result : undefined); }; t.onerror = t.onabort = function () { rej(t.error || new Error('storage error')); };
    }); });
  }
  function bibPut(map) { return bibTx('readwrite', function (st) { Object.keys(map).forEach(function (k) { st.put(map[k], k); bibKnown[k] = 1; bibCache[k] = map[k]; }); }); }
  function bibGet(k) { return bibCache[k] ? Promise.resolve(bibCache[k]) : bibTx('readonly', function (st) { return st.get(k); }).then(function (v) { if (v) bibCache[k] = v; return v; }); }
  function bibInit() { bibReadyP = bibTx('readonly', function (st) { return st.getAllKeys(); }).then(function (ks) { (ks || []).forEach(function (k) { bibKnown[k] = 1; }); }).catch(function () {}); return bibReadyP; }
  function isBibFile(f) { return /\.(sgu|mgu|sg\d|mg\d|sty)$/i.test(f.name) && !/^\._/.test(f.name); }
  function bibNice(st) { return String(st || '').replace(/\.sty$/i, '').toUpperCase(); } // as Band-in-a-Box shows it
  function bibStyleId(s) { return s && s.bib && s.bib.styleKey ? 'bib:' + s.bib.styleKey : null; }
  function bibHave(s) { return !!(s && s.bib && s.bib.styleKey && (bibKnown[s.bib.styleKey] || E.STYLES['bib:' + s.bib.styleKey])); }
  function registerBib(key, sty, fb) {
    var id = 'bib:' + key; if (E.STYLES[id]) return id;
    fb = E.STYLES[fb] ? fb : (sty.meter === '3/4' ? 'vals' : 'bolero');
    var f = E.STYLES[fb], drums = !!(sty.parts.drums && (sty.parts.drums.a.length || sty.parts.drums.b.length)), nm = bibNice(key);
    E.STYLES[id] = Object.assign({}, f, {
      name: 'Band-in-a-Box style ' + nm + (sty.desc ? ' (' + sty.desc.slice(0, 60) + ')' : '') + (drums ? '' : ' · drums: ' + f.short),
      short: '★ ' + nm, tempo: sty.tempo > 30 && sty.tempo < 300 ? sty.tempo : f.tempo, bib: sty, fallback: fb, drums: drums,
      bibUsed: BS.partsUsed(sty), clave: drums ? false : f.clave, p3: f.p3 || E.STYLES.vals.p3, p4: f.p4 || E.STYLES.bolero.p4
    });
    return id;
  }
  function ensureBib(s) {
    var key = s.bib && s.bib.styleKey; if (!key) return Promise.resolve(null);
    if (E.STYLES['bib:' + key]) return Promise.resolve('bib:' + key);
    return bibReadyP.then(function () { return bibKnown[key] ? bibGet(key) : null; }).then(function (sty) { return sty && sty.parts ? registerBib(key, sty, E.styleId(s.style)) : null; }).catch(function () { return null; });
  }
  function openImport() { closeLib(); var d = $('importDlg'); if (d.showModal) d.showModal(); else $('fileInput').click(); }
  function importBib(fileList) {
    var files = Array.prototype.filter.call(fileList, isBibFile), sty = files.filter(function (f) { return /\.sty$/i.test(f.name); }), songs = files.filter(function (f) { return !/\.sty$/i.test(f.name); });
    if (!files.length) { toast('No Band-in-a-Box songs (.SGU, .MGU) or styles (.STY) were found there.'); return Promise.resolve([]); }
    var styles = {}, bad = [], added = [], i = 0, total = files.length;
    var bar = $('loadBar'), fillEl = $('loadFill'), txt = $('loadTxt');
    function progress() { i++; if (total > 20) { bar.classList.add('show'); fillEl.style.width = Math.round(i / total * 100) + '%'; txt.textContent = 'Reading Band-in-a-Box files… ' + i + ' of ' + total; } }
    function each(list, fn) { // a few files at a time so the page stays responsive
      var k = 0;
      return new Promise(function (res) { (function next() { var chunk = list.slice(k, k + 12); k += 12; if (!chunk.length) return res(); Promise.all(chunk.map(function (f) { return readAsBuf(f).then(function (b) { fn(f, b); }).catch(function (e) { bad.push(f.name + ': ' + (e.message || e)); }).then(progress); })).then(function () { setTimeout(next, 0); }); })(); });
    }
    return bibReadyP.then(function () {
      return each(sty, function (f, b) { var st = BS.parse(b, f.name); styles[BI.styleKey(f.name)] = st; });
    }).then(function () { return Object.keys(styles).length ? bibPut(styles) : null; }).then(function () {
      var have = mySongs.reduce(function (o, m) { o[m.id] = 1; return o; }, {});
      return each(songs, function (f, b) {
        var info = BI.parse(b, f.name), key = BI.styleKey(info.style), st = styles[key] || bibCache[key];
        var s = BI.toSong(info, { path: f.webkitRelativePath || f.name, styleMeter: st && st.meterKnown && st.meter, styleDesc: st && st.desc, swing: st ? st.swing : /swing|shuf|jaz|blues|bop/i.test(info.style) });
        var tl = E.buildSong(s); if (!tl.nb || !tl.hasChords) throw new Error('no chords were found');
        if (have[s.id]) return; have[s.id] = 1;
        s.source = 'Imported from your Band-in-a-Box file ' + (f.webkitRelativePath || f.name) + ' on ' + new Date().toLocaleDateString();
        mySongs.push(s); added.push(s);
      });
    }).then(function () {
      // a song whose style was not in this batch may still find it among styles imported earlier
      var miss = added.filter(function (s) { return s.bib.styleKey && !styles[s.bib.styleKey] && !bibKnown[s.bib.styleKey]; }).length;
      LS.set('mySongs', mySongs); bar.classList.remove('show');
      var nSty = Object.keys(styles).length, msg = [];
      if (added.length) msg.push('Added ' + added.length + ' Band-in-a-Box song' + (added.length === 1 ? '' : 's'));
      if (nSty) msg.push((added.length ? '' : 'Saved ') + nSty + ' style' + (nSty === 1 ? '' : 's'));
      if (!added.length && !nSty) msg.push(songs.length ? 'Those songs are already here' : 'Nothing new was added');
      if (miss) msg.push(miss + (miss === 1 ? ' song uses' : ' songs use') + ' a style you have not imported yet, so a built-in style plays');
      if (bad.length) msg.push(bad.length + ' file' + (bad.length === 1 ? '' : 's') + ' could not be read');
      if (bad.length && window.console) console.warn('Band-in-a-Box files not read:', bad);
      LS.set('bibOpen', true); renderLibrary();
      if (added.length) { loadSong(added[0].id, true); closeLib(); }
      else if (nSty && S.song && S.song.bib) loadSong(S.song.id);
      toast(msg.join(' · ') + '.');
      return { added: added, styles: nSty, failed: bad };
    });
  }

  /* =================== IMPORT =================== */
  function readAsText(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsText(f); }); }
  function readAsBuf(f) { return new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(f); }); }
  function unzipFirstXML(buf) {
    var u8 = new Uint8Array(buf), dv = new DataView(buf), eocd = -1;
    for (var i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return Promise.reject(new Error('This .mxl file could not be opened.'));
    var cnt = dv.getUint16(eocd + 10, true), off = dv.getUint32(eocd + 16, true), entries = [];
    for (var k = 0; k < cnt; k++) {
      var nl = dv.getUint16(off + 28, true), xl = dv.getUint16(off + 30, true), cl = dv.getUint16(off + 32, true);
      var name = new TextDecoder().decode(u8.subarray(off + 46, off + 46 + nl));
      entries.push({ name: name, method: dv.getUint16(off + 10, true), csize: dv.getUint32(off + 20, true), lho: dv.getUint32(off + 42, true) });
      off += 46 + nl + xl + cl;
    }
    var e = entries.filter(function (x) { return /\.(xml|musicxml)$/i.test(x.name) && !/^META-INF/i.test(x.name); })[0];
    if (!e) return Promise.reject(new Error('No music was found inside this .mxl file.'));
    var p = e.lho, start = p + 30 + dv.getUint16(p + 26, true) + dv.getUint16(p + 28, true), data = u8.subarray(start, start + e.csize);
    if (e.method === 0) return Promise.resolve(new TextDecoder().decode(data));
    if (typeof DecompressionStream === 'undefined') return Promise.reject(new Error('This browser cannot open compressed .mxl files. Please save the file as uncompressed MusicXML (.xml).'));
    return new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  function chartFromText(t, name) {
    var h = {}; t.replace(/^\s*(Title|Style|Time|Key|Tempo|Clave|Composer)\s*:\s*(.+)$/img, function (m, k, v) { h[k.toLowerCase()] = v.trim(); return m; });
    var chart = t.split(/\n\s*\n(?=\s*X:)/)[0];
    var abc = (t.match(/^\s*X:[\s\S]*$/m) || [''])[0];
    return { id: newId(), title: h.title || name, style: E.styleId(h.style) || 'bossa', meter: h.time || '', key: h.key || '', tempo: +h.tempo || 0, clave: h.clave || '', credit: h.composer || '', chart: chart.trim(), abc: abc.trim(), source: 'Imported from ' + name + ' on ' + new Date().toLocaleDateString() };
  }
  function songFromABC(abc, fname) {
    var r = C.parseABC(abc);
    if (r.errors.length && !r.notes.length) throw new Error(r.errors[0].message);
    var guess = null, rh = (abc.match(/^R:\s*(.+)$/m) || [])[1];
    if (rh) guess = E.styleId(rh);
    return { id: newId(), title: r.title || fname, style: guess || (Math.abs(r.meter.num / r.meter.den * 4 - 3) < 1e-6 ? 'vals' : 'bolero'), meter: '', key: '', tempo: 0, credit: (r.composer || []).join(' · '), abc: abc.trim() + '\n', chart: '', source: 'Imported from ' + fname + ' on ' + new Date().toLocaleDateString() };
  }
  function importFiles(files) {
    var added = [], notes = [];
    var jobs = Array.prototype.map.call(files, function (f) {
      var name = f.name.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
      var ext = ((f.name.match(/\.([^.]+)$/) || [])[1] || '').toLowerCase(), p;
      if (ext === 'mid' || ext === 'midi') p = readAsBuf(f).then(function (b) { return [songFromABC(C.midiToABC(b, name).abc, name)]; });
      else if (ext === 'mxl') p = readAsBuf(f).then(unzipFirstXML).then(function (t) { return [songFromABC(C.musicXMLToABC(t), name)]; });
      else if (ext === 'xml' || ext === 'musicxml') p = readAsText(f).then(function (t) { return [songFromABC(C.musicXMLToABC(t), name)]; });
      else p = readAsText(f).then(function (t) {
        if (ext === 'json' || /^\s*\{/.test(t)) {
          var d = JSON.parse(t); if (!d || !Array.isArray(d.songs)) throw new Error('This is not a Latin Fake Book backup.');
          var out = [], prefs = LS.get('prefs', {}) || {};
          d.songs.forEach(function (s) {
            if (!s || (!s.chart && !s.abc)) return;
            var dup = mySongs.filter(function (m) { return m.id === s.id; })[0];
            if (dup) { if (JSON.stringify(dup) === JSON.stringify(s)) return; s = Object.assign({}, s, { id: newId() }); }
            if (d.prefs && d.prefs[s.id]) prefs[s.id] = d.prefs[s.id];
            out.push(s);
          });
          LS.set('prefs', prefs); notes.push('backup');
          if (d.bibStyles && typeof d.bibStyles === 'object') { var ok = {}; Object.keys(d.bibStyles).forEach(function (k) { var v = d.bibStyles[k]; if (v && v.parts) ok[k] = v; }); if (Object.keys(ok).length) return bibPut(ok).then(function () { notes.push('styles'); return out; }); }
          return out;
        }
        if (/<score-partwise|<score-timewise/.test(t)) return [songFromABC(C.musicXMLToABC(t), name)];
        if (/^\s*K:/m.test(t) && !/^\s*\|/m.test(t.split(/^\s*X:/m)[0] || '')) {
          var parts = t.split(/\n(?=X:)/).filter(function (x) { return /[A-Ga-g]/.test(x) && /K:/.test(x); });
          return parts.map(function (x) { return songFromABC(/^\s*X:/m.test(x) ? x.trim() : 'X:1\nT:' + name + '\n' + x.trim(), name); });
        }
        return [chartFromText(t, name)];
      });
      return p.then(function (songs) {
        songs.forEach(function (s) {
          var tl = E.buildSong(s);
          if (!tl.nb || (!tl.hasChords && !tl.melody)) throw new Error('no chords or notes were found');
          if (!s.tempo) s.tempo = E.STYLES[E.styleId(s.style) || 'bossa'].tempo;
          if (s.bib) { var j = mySongs.findIndex(function (m) { return m.id === s.id; }); if (j >= 0) return; }
          if (!tl.hasChords) notes.push('nochords');
          mySongs.push(s); added.push(s);
        });
      }).catch(function (e) { toast('Could not open ' + f.name + ': ' + (e.message || e)); });
    });
    return Promise.all(jobs).then(function () {
      LS.set('mySongs', mySongs); renderLibrary();
      if (added.length) {
        LS.set('song', added[0].id); loadSong(added[0].id, true); closeLib();
        var nb = added.filter(function (x) { return x.bib; }).length;
        toast((added.length === 1 ? 'Added “' + added[0].title + '” to ' + (nb ? BIB_SEC : 'My Songs') : 'Added ' + added.length + ' songs to ' + (nb === added.length ? BIB_SEC : 'My Songs')) + (notes.indexOf('styles') >= 0 ? ', with their Band-in-a-Box styles' : '') + (notes.indexOf('nochords') >= 0 ? ' — no chord symbols found; use Edit to add chords.' : ''));
      } else if (notes.indexOf('backup') >= 0) toast('Those songs are already here.');
      return added;
    });
  }

  /* =================== UI WIRING =================== */
  function toast(t) { var e = $('toast'); e.textContent = t; e.classList.add('show'); clearTimeout(toast.t); toast.t = setTimeout(function () { e.classList.remove('show'); }, 3200); }
  function segWire(id, fn) { forEach($(id).querySelectorAll('button'), function (b) { b.onclick = function () { fn(b.dataset.v); updateControls(); }; }); }
  function init() {
    $('playBtn').onclick = toggle;
    $('stopBtn').onclick = function () { stop(); };
    $('melBtn').onclick = toggleMelody;
    $('loopBtn').onclick = function () { setLoop(!S.loop); };
    $('moreBtn').onclick = function () { var t = $('transport'), open = !t.classList.contains('expanded'); t.classList.toggle('expanded', open); this.setAttribute('aria-expanded', open ? 'true' : 'false'); LS.set('more', open); };
    if (LS.get('more', false)) { $('transport').classList.add('expanded'); $('moreBtn').setAttribute('aria-expanded', 'true'); }
    $('tempo').oninput = function () { setTempo(+this.value); };
    $('tempoDown').onclick = function () { setTempo(S.tempo - 4); };
    $('tempoUp').onclick = function () { setTempo(S.tempo + 4); };
    $('transDown').onclick = function () { setTranspose(S.transpose - 1); };
    $('transUp').onclick = function () { setTranspose(S.transpose + 1); };
    segWire('countSeg', function (v) { S.countIn = +v; LS.set('countIn', S.countIn); });
    segWire('instSeg', function (v) { S.instr = v; LS.set('instr', v); renderView(); toast(v === 'C' ? 'Showing concert pitch (C)' : 'Showing music for ' + (v === 'Bb' ? 'B♭' : 'E♭') + ' instruments'); });
    segWire('claveSeg', function (v) { S.clave = v; P.gen = {}; savePrefs(); renderMixer(); if (S.playing) { var b = S.startBar; pause(); var ci = S.countIn; S.countIn = 0; play(S.startBar); S.countIn = ci; } });
    var tune = $('tune'), tv = LS.get('tune', 440); A.setTune(tv);
    function showTune() { var v = A.tune; tune.value = v; fill(tune); $('tuneOut').textContent = 'A = ' + v + ' Hz'; forEach($('tuneSeg').querySelectorAll('button'), function (b) { b.setAttribute('aria-pressed', +b.dataset.v === v ? 'true' : 'false'); }); }
    function setTune(v) { A.setTune(Math.round(v)); LS.set('tune', A.tune); showTune(); }
    tune.oninput = function () { setTune(+this.value); };
    forEach($('tuneSeg').querySelectorAll('button'), function (b) { b.onclick = function () { setTune(+b.dataset.v); toast('Tuning A = ' + b.dataset.v + ' Hz'); }; });
    showTune();
    var vol = $('volume'), sv = LS.get('volume', 85); vol.value = sv; A.setVolume(sv / 100); $('volOut').textContent = sv + '%'; fill(vol);
    vol.oninput = function () { A.setVolume(this.value / 100); $('volOut').textContent = this.value + '%'; fill(this); LS.set('volume', +this.value); };
    forEach($('viewSeg').querySelectorAll('button'), function (b) { b.onclick = function () { S.view = b.dataset.v; LS.set('view', S.view); renderView(); }; });
    $('rangeBtn').onclick = function () { S.rangeMode = !S.rangeMode; S.rangeFirst = null; renderGrid(); };
    $('rangeClear').onclick = function () { S.range = null; S.rangeMode = false; renderGrid(); toast('Playing the whole song'); };
    $('presetPB').onclick = function () { PERC_IDS.forEach(function (id) { mix[id].mute = true; }); mix.piano.mute = false; mix.bass.mute = false; S.solo = false; applyMix(); renderMixer(); toast('Piano and bass only'); };
    $('presetFull').onclick = function () { setTimeout(loadSamples, 0); var used = E.styleParts(S.style, S.base.triple); PERC_IDS.forEach(function (id) { mix[id].mute = !used[id]; }); mix.piano.mute = false; mix.bass.mute = false; S.solo = false; applyMix(); renderMixer(); toast('Full band'); };
    $('presetReset').onclick = function () { var d = defaultMix(); Object.keys(d).forEach(function (k) { mix[k].vol = d[k].vol; }); applyMix(); renderMixer(); toast('Volumes reset'); };
    $('progress').onclick = function (ev) { var r = this.getBoundingClientRect(), t = (ev.clientX - r.left) / r.width * S.tl.total; seekTo(Math.floor((t - S.tl.pickup) / S.tl.barQ)); };
    $('addBtn').onclick = function () { openDialog(null); };
    $('importBtn').onclick = openImport;
    $('impSong').onclick = function () { $('importDlg').close(); $('fileInput').click(); };
    $('impBib').onclick = function () { $('importDlg').close(); $('bibInput').click(); };
    $('impBibDir').onclick = function () { $('importDlg').close(); $('bibDirInput').click(); };
    ['bibInput', 'bibDirInput'].forEach(function (id) { $(id).onchange = function () { if (this.files && this.files.length) importBib(this.files); this.value = ''; }; });
    if (!('webkitdirectory' in document.createElement('input'))) $('impBibDir').hidden = true;
    bibInit();
    $('fileInput').onchange = function () { if (this.files && this.files.length) importFiles(this.files); this.value = ''; };
    $('songForm').addEventListener('submit', function (e) { e.preventDefault(); saveDialog(); });
    $('dlgCancel').onclick = function (e) { e.preventDefault(); closeDialog(); };
    document.addEventListener('dragover', function (e) { e.preventDefault(); });
    document.addEventListener('drop', function (e) { e.preventDefault(); var f = e.dataTransfer.files; if (!f.length) return; if (Array.prototype.some.call(f, isBibFile)) importBib(f); else importFiles(f); });
    $('chooseBtn').onclick = openLib; $('libClose').onclick = closeLib; $('scrim').onclick = closeLib;
    $('libSearch').oninput = renderLibrary;
    document.addEventListener('keydown', function (e) {
      if (/^(TEXTAREA|INPUT|SELECT)$/.test(e.target.tagName) && e.target.type !== 'range') return;
      if ($('songDlg').open || $('importDlg').open) return;
      if (e.code === 'Space') { e.preventDefault(); toggle(); }
      else if (e.key === 'm' || e.key === 'M') toggleMelody();
      else if (e.key === 'Escape') closeLib();
    });
    var rw, lastW = window.innerWidth; window.addEventListener('resize', function () { clearTimeout(rw); rw = setTimeout(function () { if (window.innerWidth !== lastW && S.base) { lastW = window.innerWidth; renderView(); } }, 150); });
    var deferred = null;
    window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferred = e; $('installBtn').hidden = false; });
    $('installBtn').onclick = function () { if (deferred) { deferred.prompt(); deferred = null; $('installBtn').hidden = true; } };
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) navigator.serviceWorker.register('sw.js').catch(function () {});
    applyMix();
    setTimeout(loadSamples, 50);
    var params = new URLSearchParams(location.search);
    loadSong(params.get('song') || LS.get('song', builtIn[0] && builtIn[0].id));
  }
  window.LFApp = { state: S, P: P, mix: mix, play: play, pause: pause, stop: stop, loadSong: loadSong, setStyle: setStyle, setTempo: setTempo, setTranspose: setTranspose, toggleMelody: toggleMelody,
    importFiles: importFiles, importBib: importBib, backup: backup, bibReady: function () { return bibReadyP; }, loadSamples: loadSamples, neededSets: neededSets, partLevel: partLevel, audio: A, seekTo: seekTo, allSongs: allSongs };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
