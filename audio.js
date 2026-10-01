/* ===== Latin Fake Book audio: sampled-in-memory piano/bass/percussion synthesis + per-part mixer (Web Audio) ===== */
(function (root) {
  'use strict';
  var ctx = null, master, comp, revIn, revOut, conv, sr = 44100;
  var parts = {}, cache = {}, live = [], noiseBuf = null;
  var settings = { volume: 0.85, tune: 440 };
  var PART_IDS = ['melody', 'piano', 'bass', 'clave', 'congas', 'bongos', 'shaker', 'cowbell', 'timbales', 'guiro', 'rim', 'drums', 'click'];
  var PAN = { melody: 0, piano: -0.12, bass: 0, clave: 0.35, congas: 0.3, bongos: -0.3, shaker: 0.42, cowbell: -0.25, timbales: -0.35, guiro: 0.45, rim: 0.2, drums: 0, click: 0 };
  var SEND = { melody: 0.24, piano: 0.2, bass: 0.04, click: 0, drums: 0.08 };
  function freq(m) { return 440 * Math.pow(2, (m - 69) / 12); }

  function ensure() {
    if (ctx) { if (ctx.state !== 'running') { try { ctx.resume(); } catch (e) {} } return ctx; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) throw new Error('This browser cannot play sound (no Web Audio).');
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    ctx = new AC({ latencyHint: 'interactive' }); sr = ctx.sampleRate;
    comp = ctx.createDynamicsCompressor(); comp.threshold.value = -12; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.003; comp.release.value = 0.2;
    master = ctx.createGain(); master.gain.value = settings.volume * settings.volume * 1.5;
    master.connect(comp); comp.connect(ctx.destination);
    conv = ctx.createConvolver(); conv.buffer = impulse(1.9, 3.2);
    revIn = ctx.createGain(); revOut = ctx.createGain(); revOut.gain.value = 0.9;
    revIn.connect(conv); conv.connect(revOut); revOut.connect(master);
    PART_IDS.forEach(function (id) {
      var g = ctx.createGain(), out = g;
      if (ctx.createStereoPanner) { var p = ctx.createStereoPanner(); p.pan.value = PAN[id] || 0; g.connect(p); out = p; }
      out.connect(master);
      var s = ctx.createGain(); s.gain.value = SEND[id] !== undefined ? SEND[id] : 0.07; out.connect(s); s.connect(revIn);
      parts[id] = { gain: g, level: parts[id] ? parts[id].level : 1 };
      g.gain.value = parts[id].level;
    });
    var b = ctx.createBuffer(1, 1, sr), s0 = ctx.createBufferSource(); s0.buffer = b; s0.connect(ctx.destination); s0.start(0); // iOS unlock
    return ctx;
  }
  function impulse(seconds, decay) {
    var len = Math.floor(sr * seconds), buf = ctx.createBuffer(2, len, sr);
    for (var ch = 0; ch < 2; ch++) {
      var d = buf.getChannelData(ch), lp = 0;
      for (var i = 0; i < len; i++) { var t = i / sr; lp += ((Math.random() * 2 - 1) - lp) * (0.22 + 0.5 * Math.exp(-t * 4)); d[i] = lp * Math.pow(1 - i / len, decay) * (t < 0.01 ? t / 0.01 : 1); }
      [0.011, 0.019, 0.029, 0.041].forEach(function (er, k) { var p = Math.floor((er + ch * 0.0025) * sr); if (p < len) d[p] += (0.45 - k * 0.08) * (k % 2 ? -1 : 1); });
    }
    return buf;
  }
  function mkBuf(data) { var b = ctx.createBuffer(1, data.length, sr); b.getChannelData(0).set(data); return b; }
  function normalize(y, peakTo) { var pk = 0; for (var i = 0; i < y.length; i++) { var a = Math.abs(y[i]); if (a > pk) pk = a; } var g = (peakTo || 0.9) / (pk || 1); for (var j = 0; j < y.length; j++) y[j] *= g; return y; }
  function fadeOut(y, secs) { var n = Math.min(y.length, Math.floor(secs * sr)); for (var i = 0; i < n; i++) y[y.length - 1 - i] *= i / n; return y; }
  function rnd() { return Math.random() * 2 - 1; }
  /* simple RBJ biquad for offline rendering */
  function biquad(y, type, f0, Q) {
    var w = 2 * Math.PI * f0 / sr, cs = Math.cos(w), sn = Math.sin(w), al = sn / (2 * (Q || 0.707)), b0, b1, b2, a0, a1, a2;
    if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
    else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
    else { b0 = al; b1 = 0; b2 = -al; }
    a0 = 1 + al; a1 = -2 * cs; a2 = 1 - al;
    var x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    for (var i = 0; i < y.length; i++) { var x = y[i], o = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0; x2 = x1; x1 = x; y2 = y1; y1 = o; y[i] = o; }
    return y;
  }

  /* ---------- PIANO: additive synthesis with inharmonic partials, two-stage decay, string beating and a hammer ---------- */
  function renderPiano(m, hard) {
    var f = freq(m), T = Math.max(1.1, Math.min(8, 8.5 - (m - 24) * 0.12)), secs = Math.min(4.2, T * 0.75 + 0.6), len = Math.floor(sr * secs);
    var y = new Float32Array(len), B = 0.00008 * Math.exp((m - 21) * 0.045), nyq = Math.min(sr * 0.45, hard ? 11000 : 7000);
    for (var n = 1; n <= 28; n++) {
      var fn = n * f * Math.sqrt(1 + B * n * n); if (fn > nyq) break;
      var strike = Math.abs(Math.sin(Math.PI * n * 0.118)) + 0.08;
      var amp = strike / Math.pow(n, hard ? 0.95 : 1.35) * (n === 1 ? 1 : 0.9) * (m < 45 && n === 1 ? 0.6 : 1);
      var tauF = T * 0.22 / (1 + 0.45 * (n - 1)), tauS = T / (1 + 0.3 * Math.pow(n - 1, 1.15));
      var det = 1 + 0.00035 * (n % 3 === 0 ? -1 : 1) * (1 + (m % 5) * 0.1);
      for (var s = 0; s < 2; s++) {
        var ff = s ? fn * det : fn, w = 2 * Math.PI * ff / sr, c = Math.cos(w), sn = Math.sin(w), re = 1, im = 0, ph = Math.random() * 0.2;
        re = Math.cos(ph); im = Math.sin(ph);
        var dF = Math.exp(-1 / (tauF * sr)), dS = Math.exp(-1 / (tauS * sr)), eF = 0.62 * amp * 0.5, eS = 0.38 * amp * 0.5;
        for (var i = 0; i < len; i++) { var nr = re * c - im * sn; im = re * sn + im * c; re = nr; y[i] += im * (eF + eS); eF *= dF; eS *= dS; }
      }
    }
    // hammer thump & felt noise
    var hl = Math.floor(sr * 0.02), lp = 0, hk = hard ? 0.16 : 0.07;
    for (var k = 0; k < hl; k++) { lp += (rnd() - lp) * (hard ? 0.5 : 0.25); y[k] += lp * hk * (1 - k / hl); }
    for (var a = 0, an = Math.floor(sr * 0.0015); a < an; a++) y[a] *= a / an;
    normalize(y, 0.9 * Math.pow(0.985, Math.max(0, m - 60)));
    return fadeOut(y, 0.25);
  }
  /* ---------- BASS: warm upright / baby-bass pluck ---------- */
  function renderBass(m) {
    var f = freq(m), secs = 2.6, len = Math.floor(sr * secs), y = new Float32Array(len);
    for (var n = 1; n <= 14; n++) {
      var fn = n * f * (1 + 0.0003 * n * n); if (fn > 5000) break;
      var amp = (n === 1 ? 1 : n === 2 ? 0.72 : 0.55 / Math.pow(n - 1, 1.3)) * Math.abs(Math.sin(Math.PI * n * 0.21) + 0.15);
      var tau = n === 1 ? 1.7 : n === 2 ? 0.9 : 0.42 / (1 + 0.5 * (n - 3)), w = 2 * Math.PI * fn / sr, c = Math.cos(w), sn = Math.sin(w), re = 1, im = 0, e = amp, d = Math.exp(-1 / (tau * sr));
      for (var i = 0; i < len; i++) { var nr = re * c - im * sn; im = re * sn + im * c; re = nr; y[i] += im * e; e *= d; }
    }
    // finger thump: low sine burst + soft click
    var th = Math.floor(sr * 0.06);
    for (var k = 0; k < th; k++) { var t = k / sr; y[k] += Math.sin(2 * Math.PI * f * 0.5 * t) * 0.35 * Math.exp(-t * 60) + rnd() * 0.03 * Math.exp(-t * 400); }
    for (var a = 0, an = Math.floor(sr * 0.004); a < an; a++) y[a] *= a / an;
    biquad(y, 'lp', Math.min(3200, f * 14), 0.6);
    return fadeOut(normalize(y, 0.95), 0.3);
  }
  /* ---------- nylon guitar (Karplus-Strong) ---------- */
  function renderGuitar(m) {
    var f = freq(m), P = sr / f, N = Math.max(2, Math.floor(P - 0.5)), len = Math.floor(sr * 2.4), y = new Float32Array(len), i;
    var T60 = Math.max(1.2, 3.2 - (m - 52) * 0.05), rho = Math.pow(0.001, 1 / (f * T60)), S = 0.42;
    var pos = Math.max(1, Math.round(N * 0.18)), ex = new Float32Array(N);
    for (i = 0; i < N; i++) ex[i] = rnd() * 0.5 + (1 - Math.abs(2 * i / N - 1)) * 0.9 - 0.45;
    for (i = 0; i < N; i++) y[i] = ex[i] - (i >= pos ? ex[i - pos] : 0) * 0.9;
    for (i = N; i < len; i++) y[i] = rho * ((1 - S) * y[i - N] + S * y[i - N - 1 < 0 ? 0 : i - N - 1]);
    var px = 0, py = 0; for (i = 0; i < len; i++) { var x = y[i], o = x - px + 0.995 * py; px = x; py = o; y[i] = o; }
    biquad(y, 'lp', 3800, 0.5);
    return { y: fadeOut(normalize(y, 0.8), 0.3), rate: f / (sr / (N + 0.5)) };
  }
  /* ---------- vibraphone (bar partials 1 : 4 : 10, motor tremolo) ---------- */
  function renderVibes(m) {
    var f = freq(m), len = Math.floor(sr * 3.2), y = new Float32Array(len);
    [[1, 1, 2.6], [4, 0.22, 0.55], [10.1, 0.05, 0.12], [2, 0.04, 0.3]].forEach(function (p) {
      var fn = f * p[0]; if (fn > sr * 0.45) return;
      var w = 2 * Math.PI * fn / sr, c = Math.cos(w), sn = Math.sin(w), re = 1, im = 0, e = p[1], d = Math.exp(-1 / (p[2] * sr));
      for (var i = 0; i < len; i++) { var nr = re * c - im * sn; im = re * sn + im * c; re = nr; y[i] += im * e; e *= d; }
    });
    for (var i = 0; i < len; i++) { var t = i / sr; y[i] *= 1 - 0.28 * (0.5 - 0.5 * Math.cos(2 * Math.PI * 5.2 * t)); if (i < 60) y[i] *= i / 60; }
    for (var k = 0; k < Math.floor(sr * 0.006); k++) y[k] += rnd() * 0.05 * (1 - k / (sr * 0.006));
    return fadeOut(normalize(y, 0.8), 0.3);
  }

  /* ---------- PERCUSSION ---------- */
  function tone(len, f0, f1, glide, decay, amp) { // pitched membrane
    var y = new Float32Array(len), ph = 0;
    for (var i = 0; i < len; i++) { var t = i / sr, f = f1 + (f0 - f1) * Math.exp(-t / glide); ph += 2 * Math.PI * f / sr; y[i] = Math.sin(ph) * amp * Math.exp(-t / decay); }
    return y;
  }
  function noise(len, decay, amp, attack) { var y = new Float32Array(len); for (var i = 0; i < len; i++) { var t = i / sr; y[i] = rnd() * amp * Math.exp(-t / decay) * (attack && t < attack ? t / attack : 1); } return y; }
  function mix() { var a = arguments, L = 0; for (var k = 0; k < a.length; k++) L = Math.max(L, a[k].length); var y = new Float32Array(L); for (var j = 0; j < a.length; j++) for (var i = 0; i < a[j].length; i++) y[i] += a[j][i]; return y; }
  var L = function (s) { return Math.floor(sr * s); };
  var PERC = {
    clave: function () { var y = mix(tone(L(.12), 2550, 2450, .01, .03, 1), tone(L(.06), 5100, 5000, .01, .008, .2), biquad(noise(L(.01), .002, .3), 'bp', 3000, 2)); return y; },
    click: function () { return mix(tone(L(.06), 1800, 1700, .01, .015, 1), biquad(noise(L(.01), .002, .3), 'bp', 2500, 2)); },
    clickHi: function () { return mix(tone(L(.06), 2400, 2300, .01, .015, 1), biquad(noise(L(.01), .002, .4), 'bp', 3200, 2)); },
    congaOpen: function () { return mix(tone(L(.5), 300, 235, .012, .2, 1), tone(L(.2), 470, 420, .01, .05, .25), biquad(noise(L(.02), .004, .25), 'bp', 1500, 1)); },
    tumbaOpen: function () { return mix(tone(L(.6), 230, 178, .015, .26, 1), tone(L(.2), 360, 330, .01, .05, .22), biquad(noise(L(.02), .004, .22), 'bp', 1100, 1)); },
    congaSlap: function () { return mix(biquad(noise(L(.12), .028, 1.1), 'bp', 1900, 1.2), tone(L(.1), 420, 330, .005, .03, .5)); },
    congaHeel: function () { return mix(tone(L(.1), 140, 110, .01, .03, .6), biquad(noise(L(.02), .006, .1), 'lp', 600, .7)); },
    congaTip: function () { return mix(tone(L(.06), 520, 480, .005, .015, .32), biquad(noise(L(.015), .003, .18), 'bp', 2500, 1)); },
    congaMuff: function () { return mix(tone(L(.1), 330, 280, .006, .03, .7), biquad(noise(L(.02), .004, .2), 'bp', 1400, 1)); },
    bongoHi: function () { return mix(tone(L(.25), 640, 560, .006, .08, 1), biquad(noise(L(.02), .003, .3), 'bp', 3000, 1)); },
    bongoLo: function () { return mix(tone(L(.3), 450, 385, .008, .11, 1), biquad(noise(L(.02), .003, .25), 'bp', 2200, 1)); },
    bongoThumb: function () { return mix(tone(L(.08), 560, 520, .005, .02, .55), biquad(noise(L(.015), .003, .2), 'bp', 2600, 1)); },
    bongoTip: function () { return mix(tone(L(.05), 700, 650, .005, .012, .3), biquad(noise(L(.01), .002, .15), 'bp', 3500, 1)); },
    shaker: function () { return biquad(biquad(noise(L(.09), .022, .55, .006), 'hp', 4500, .7), 'bp', 7500, .6); },
    shakerAcc: function () { return biquad(biquad(noise(L(.12), .035, .9, .004), 'hp', 4000, .7), 'bp', 7000, .6); },
    bell: function () { return bell(560, 845, .22, .8); },
    bellAcc: function () { return bell(560, 845, .3, 1); },
    bellHi: function () { return bell(760, 1140, .2, .8); },
    cascara: function () { return mix(biquad(noise(L(.05), .01, 1), 'bp', 3200, 2.5), tone(L(.05), 1700, 1650, .01, .012, .4)); },
    timbalHi: function () { return mix(tone(L(.6), 480, 455, .01, .22, .8), tone(L(.5), 480 * 1.63, 470 * 1.63, .01, .15, .3), biquad(noise(L(.3), .08, .25), 'bp', 4000, 1.5)); },
    timbalLo: function () { return mix(tone(L(.7), 360, 340, .01, .26, .8), tone(L(.5), 360 * 1.6, 350 * 1.6, .01, .16, .3), biquad(noise(L(.3), .08, .22), 'bp', 3500, 1.5)); },
    timbalRim: function () { return mix(biquad(noise(L(.04), .007, 1), 'bp', 2400, 3), tone(L(.04), 900, 880, .01, .01, .3)); },
    guiroLong: function () { return guiro(0.24, 22); },
    guiroShort: function () { return guiro(0.07, 6); },
    rim: function () { return mix(biquad(noise(L(.06), .012, .9), 'bp', 1800, 2.2), tone(L(.07), 520, 480, .005, .02, .55)); },
    kick: function () { return mix(tone(L(.45), 120, 52, .03, .16, 1), biquad(noise(L(.01), .002, .2), 'lp', 1500, .7)); },
    surdoOpen: function () { return mix(tone(L(.9), 95, 62, .04, .38, 1), biquad(noise(L(.02), .004, .2), 'lp', 900, .7)); },
    surdoMute: function () { return mix(tone(L(.2), 95, 70, .02, .07, .8), biquad(noise(L(.02), .004, .2), 'lp', 900, .7)); },
    tamboraOpen: function () { return mix(tone(L(.35), 190, 150, .015, .12, 1), biquad(noise(L(.02), .004, .25), 'bp', 900, 1)); },
    tamboraRim: function () { return mix(biquad(noise(L(.05), .01, .8), 'bp', 1500, 3), tone(L(.05), 820, 800, .01, .015, .4)); }
  };
  function bell(f1, f2, dec, amp) {
    var len = L(dec * 3), y = new Float32Array(len), p1 = 0, p2 = 0;
    for (var i = 0; i < len; i++) { var t = i / sr; p1 += f1 / sr; p2 += f2 / sr; var sq = (p1 % 1 < .5 ? 1 : -1) * .5 + (p2 % 1 < .5 ? 1 : -1) * .5; y[i] = sq * amp * (Math.exp(-t / (dec * .12)) * .6 + Math.exp(-t / dec) * .4); }
    biquad(y, 'bp', 1050, 1.6); biquad(y, 'hp', 400, .7);
    return y;
  }
  function guiro(secs, n) {
    var len = L(secs + 0.04), y = new Float32Array(len);
    for (var k = 0; k < n; k++) { var t0 = Math.floor((k / n) * secs * sr * (1 - 0.15 * k / n)), a = 0.5 + 0.5 * Math.sin(Math.PI * k / n); for (var i = 0; i < L(.006); i++) if (t0 + i < len) y[t0 + i] += rnd() * a * Math.exp(-i / (sr * .0015)); }
    biquad(y, 'bp', 3600, 1.4); biquad(y, 'hp', 1500, .7);
    return y;
  }

  function getBuf(kind, key, maker) {
    var k = kind + ':' + key; if (cache[k]) return cache[k];
    var r = maker(); if (r && r.y) { cache[k] = { buf: mkBuf(r.y), rate: r.rate }; } else { var y = r; normalize(y, 0.9); cache[k] = { buf: mkBuf(fadeOut(y, 0.01)), rate: 1 }; }
    return cache[k];
  }
  /* piano is rendered every 3 semitones and re-pitched by up to ±1 semitone, like a multisampled piano (fast to prepare on phones) */
  function pianoBuf(m, hard) {
    m = Math.max(21, Math.min(108, m)); var base = Math.max(21, Math.min(108, Math.round(m / 3) * 3));
    var b = getBuf('pno' + (hard ? 'H' : 'S'), base, function () { return { y: renderPiano(base, hard), rate: 1 }; });
    return base === m ? b : { buf: b.buf, rate: Math.pow(2, (m - base) / 12) };
  }
  function bassBuf(m) { return getBuf('bass', m, function () { return { y: renderBass(m), rate: 1 }; }); }
  function vibesBuf(m) { return getBuf('vib', m, function () { return { y: renderVibes(m), rate: 1 }; }); }
  function guitarBuf(m) { return getBuf('gtr', m, function () { return renderGuitar(m); }); }
  function percBuf(name) { return getBuf('perc', name, function () { return PERC[name](); }); }

  function track(nodes, end) { live.push({ nodes: nodes, end: end }); if (live.length > 500) { var now = ctx.currentTime; live = live.filter(function (x) { return x.end > now - 0.2; }); } }

  /* ================= SAMPLED INSTRUMENTS =================
     Real recordings bundled in samples/ (see CREDITS): Salamander Grand Piano (CC-BY 3.0), FluidR3 GM bass / nylon guitar / vibraphone (MIT),
     VSCO 2 Community Edition flute and Latin percussion (CC0). Pitched sets are sampled about every 3rd semitone and re-pitched in between. */
  var BASE = 'samples/';
  function rng(a, b, st) { var o = []; for (var m = a; m <= b; m += st) o.push(m); return o; }
  var SETS = {
    piano: { notes: rng(33, 102, 3), layers: ['p', 'm', 'f'], file: function (l, m) { return 'piano/' + l + m + '.mp3'; } },
    bass: { notes: rng(28, 61, 3), file: function (l, m) { return 'bass/' + m + '.mp3'; } },
    guitar: { notes: rng(40, 85, 3), file: function (l, m) { return 'guitar/' + m + '.mp3'; } },
    vibes: { notes: rng(52, 91, 3), file: function (l, m) { return 'vibes/' + m + '.mp3'; } },
    flute: { notes: [60, 64, 69, 72, 76, 81, 84, 88, 93, 96], file: function (l, m) { return 'flute/' + m + '.mp3'; } },
    perc: { names: ['clave_1', 'clave_2', 'clave_acc', 'conga_open1', 'conga_open2', 'conga_slap', 'conga_tap1', 'conga_tap2', 'tumba_open1', 'tumba_open2', 'quinto_open1', 'quinto_open2', 'quinto_tap',
      'bell_1', 'bell_2', 'bell_acc', 'guiro_long', 'guiro_short1', 'guiro_short2', 'kick_1', 'kick_2', 'kick_acc', 'tap_1', 'tap_2', 'tap_acc', 'timbal_1', 'timbal_2', 'tamb_shake'], file: function (l, n) { return 'perc/' + n + '.mp3'; } }
  };
  var smp = {}, setState = {}, setPromise = {};
  function setFiles(id) {
    var S = SETS[id], out = [];
    if (S.names) S.names.forEach(function (n) { out.push({ key: id + ':' + n, url: BASE + S.file(null, n) }); });
    else (S.layers || ['']).forEach(function (l) { S.notes.forEach(function (m) { out.push({ key: id + ':' + l + m, url: BASE + S.file(l, m) }); }); });
    return out;
  }
  var decoder = null;
  function decode(ab) {
    if (!decoder) { var OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext; decoder = ctx || (OAC ? new OAC(1, 1, 44100) : null); }
    if (!decoder) return Promise.reject(new Error('no audio'));
    return new Promise(function (res, rej) { var p = decoder.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
  }
  function onsetOf(buf) { // skip encoder padding / silence before the attack so notes land exactly on the beat
    var d = buf.getChannelData(0), pk = 0, i, n = Math.min(d.length, Math.floor(buf.sampleRate * 0.4));
    for (i = 0; i < n; i++) if (Math.abs(d[i]) > pk) pk = Math.abs(d[i]);
    var th = pk * 0.04; for (i = 0; i < n; i++) if (Math.abs(d[i]) > th) break;
    return Math.max(0, i / buf.sampleRate - 0.002);
  }
  /* load sample sets; onProg(done, total) */
  function load(ids, onProg) {
    var files = [], waits = [];
    ids.forEach(function (id) {
      if (!SETS[id]) return;
      if (setState[id] === 'ready') return;
      if (setPromise[id]) { waits.push(setPromise[id]); return; }
      setState[id] = 'loading';
      var fl = setFiles(id); fl.forEach(function (f) { f.set = id; }); files = files.concat(fl);
    });
    var total = files.length, done = 0, failed = {};
    if (onProg) onProg(0, total);
    var q = files.slice();
    function worker() {
      var f = q.shift(); if (!f) return Promise.resolve();
      return fetch(f.url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then(decode).then(function (buf) {
        smp[f.key] = { buf: buf, off: onsetOf(buf) };
      }).catch(function () { failed[f.set] = true; }).then(function () { done++; if (onProg) onProg(done, total); return worker(); });
    }
    var ws = []; for (var k = 0; k < 6; k++) ws.push(worker());
    var all = Promise.all(ws).then(function () {
      ids.forEach(function (id) { if (setState[id] === 'loading') { setState[id] = failed[id] ? 'error' : 'ready'; delete setPromise[id]; } });
    });
    ids.forEach(function (id) { if (setState[id] === 'loading' && !setPromise[id]) setPromise[id] = all; });
    return Promise.all(waits.concat([all]));
  }
  function ready(id) { return setState[id] === 'ready'; }
  function nearest(id, m, layer) {
    var S = SETS[id], best = null, bd = 99;
    S.notes.forEach(function (n) { var d = Math.abs(n - m); if (d < bd || (d === bd && n > m)) { bd = d; best = n; } });
    var s = smp[id + ':' + (layer || '') + best];
    return s ? { s: s, rate: Math.pow(2, (m - best) / 12) } : null;
  }
  function tuneRatio() { return settings.tune / 440; }
  function hum(t) { return t + (Math.random() - 0.5) * 0.008; } // a few ms of human timing
  /* play one sample: dur = held length (0 = let it ring), release = seconds of fade after note-off */
  function playSample(z, part, t, dur, gain, release, pitched, loop) {
    var src = ctx.createBufferSource(), g = ctx.createGain(), buf = z.s.buf, rate = z.rate * (pitched ? tuneRatio() : 1);
    src.buffer = buf; src.playbackRate.value = rate;
    var avail = (buf.duration - z.s.off) / rate;
    if (loop && dur > avail - 0.4 && buf.duration > 3) { src.loop = true; src.loopStart = Math.min(buf.duration - 1, z.s.off + 1.4); src.loopEnd = buf.duration - 0.45; avail = 1e9; }
    src.connect(g); g.connect(parts[part].gain);
    g.gain.setValueAtTime(gain, t);
    var stopAt;
    if (dur && dur < avail) { var end = t + dur; g.gain.setValueAtTime(gain, end); g.gain.setTargetAtTime(0, end, release / 4); stopAt = end + release * 1.6; }
    else stopAt = t + Math.min(avail, 30);
    src.start(t, z.s.off); src.stop(stopAt + 0.02);
    track([src, g], stopAt);
  }
  function playBuf(b, part, t, dur, vel, release, rateMul) {
    var s = ctx.createBufferSource(), g = ctx.createGain(), pitched = part !== 'click' && PART_IDS.indexOf(part) < 3;
    s.buffer = b.buf; s.playbackRate.value = (b.rate || 1) * (rateMul || 1) * (pitched ? tuneRatio() : 1);
    s.connect(g); g.connect(parts[part].gain);
    var end = dur ? t + dur : t + b.buf.duration / s.playbackRate.value;
    g.gain.setValueAtTime(vel, t);
    if (dur) { g.gain.setValueAtTime(vel, end); g.gain.setTargetAtTime(0, end, release || 0.08); }
    s.start(t); s.stop(Math.min(t + b.buf.duration / s.playbackRate.value, end + (release || 0.08) * 6) + 0.02);
    track([s, g], end + 0.6);
  }
  var PIANO_REF = { p: 0.42, m: 0.68, f: 0.92 };
  function pianoLayer(vel) { return vel < 0.56 ? 'p' : vel < 0.8 ? 'm' : 'f'; }
  /* piano: a chord (array of midi) - lowest note slightly first, real velocity layers, natural damper release */
  function piano(midis, t, dur, vel, part, opt) {
    if (!ctx) return; part = part || 'piano'; opt = opt || {};
    var n = midis.length, t0 = hum(t);
    if (ready('piano')) {
      var lay = pianoLayer(vel), adj = Math.pow(vel / PIANO_REF[lay], 0.8);
      midis.forEach(function (m, k) {
        var z = nearest('piano', m, lay); if (!z) return;
        var g = 1.5 * adj * (k === n - 1 && n > 2 ? 1.1 : 1) * (n > 3 ? 0.6 : n > 1 ? 0.75 : 1) * (0.94 + Math.random() * 0.1);
        playSample(z, part, t0 + k * (opt.spread || 0.004) + Math.random() * 0.003, dur, g, opt.release || (dur < 0.3 ? 0.18 : 0.32), true);
      });
      return;
    }
    var hard = vel > 0.78;
    midis.forEach(function (m, k) {
      var v = vel * (0.5 + 0.5 * vel) * (k === n - 1 && n > 2 ? 1.08 : 1) * (n > 3 ? 0.62 : n > 1 ? 0.78 : 1) * (0.94 + Math.random() * 0.1);
      playBuf(pianoBuf(m, hard), part, t0 + k * (opt.spread || 0.004) + Math.random() * 0.003, dur, v, opt.release || (dur < 0.3 ? 0.05 : 0.09));
    });
  }
  function guitar(midis, t, dur, vel, part) {
    if (!ctx) return; var t0 = hum(t);
    midis.slice().sort(function (a, b) { return a - b; }).forEach(function (m, k) {
      if (ready('guitar')) { var z = nearest('guitar', m); if (z) playSample(z, part || 'piano', t0 + k * 0.012, dur + 0.05, vel * 0.9 * (0.92 + Math.random() * 0.12), 0.25, true); return; }
      playBuf(guitarBuf(m), part || 'piano', t0 + k * 0.011, dur + 0.05, vel * 0.7 * (0.92 + Math.random() * 0.12), 0.09);
    });
  }
  function bass(m, t, dur, vel) {
    if (!ctx) return; var t0 = hum(t);
    if (ready('bass')) { var z = nearest('bass', m); if (z) { playSample(z, 'bass', t0, dur, 1.25 * vel * (0.92 + Math.random() * 0.1), 0.12, true); return; } }
    playBuf(bassBuf(m), 'bass', t0, dur, vel * (0.92 + Math.random() * 0.1), 0.06);
  }
  /* synth names used by the patterns -> recorded percussion (round-robin), [files, rate, gain] */
  var PMAP = {
    clave: [['clave_1', 'clave_2'], 1, 0.8], congaOpen: [['conga_open1', 'conga_open2'], 1, 0.9], tumbaOpen: [['tumba_open1', 'tumba_open2'], 1, 0.95], congaSlap: [['conga_slap'], 1.04, 0.9],
    congaHeel: [['conga_tap1'], 0.9, 0.45], congaTip: [['conga_tap2'], 1.05, 0.4], congaMuff: [['conga_tap1', 'conga_tap2'], 1, 0.7],
    bongoHi: [['quinto_open1', 'quinto_open2'], 1.5, 0.75], bongoLo: [['conga_open1', 'conga_open2'], 1.42, 0.75], bongoThumb: [['quinto_tap'], 1.4, 0.5], bongoTip: [['quinto_tap'], 1.6, 0.35],
    bell: [['bell_1', 'bell_2'], 1, 0.7], bellAcc: [['bell_acc'], 1, 0.85], bellHi: [['bell_1', 'bell_2'], 1.33, 0.6],
    cascara: [['tap_1', 'tap_2'], 1.35, 0.55], timbalHi: [['timbal_1', 'timbal_2'], 1.3, 0.75], timbalLo: [['timbal_1', 'timbal_2'], 1.1, 0.75], timbalRim: [['tap_acc'], 1.2, 0.7],
    guiroLong: [['guiro_long'], 1.25, 0.6], guiroShort: [['guiro_short1', 'guiro_short2'], 1, 0.6], rim: [['tap_1', 'tap_2'], 1, 0.7],
    kick: [['kick_1', 'kick_2'], 1, 0.9], surdoOpen: [['kick_acc'], 0.85, 1], surdoMute: [['kick_1'], 0.9, 0.7], tamboraOpen: [['tumba_open1', 'tumba_open2'], 0.85, 0.9], tamboraRim: [['tap_acc'], 1.1, 0.6]
  };
  var rr = {};
  function perc(name, part, t, vel) {
    if (!ctx) return;
    var mp = PMAP[name], t0 = t + (Math.random() - 0.5) * 0.006;
    if (mp && ready('perc')) {
      var k = (rr[name] = ((rr[name] || 0) + 1) % mp[0].length), s = smp['perc:' + mp[0][k]];
      if (s) { playSample({ s: s, rate: mp[1] }, part, t0, 0, mp[2] * vel * (0.88 + Math.random() * 0.16), 0.05, false); return; }
    }
    if (!PERC[name]) return;
    playBuf(percBuf(name), part, t0, 0, vel * (0.88 + Math.random() * 0.16));
  }
  function click(t, accent) { if (!ctx) return; playBuf(percBuf(accent ? 'clickHi' : 'click'), 'click', t, 0, accent ? 0.9 : 0.6); }

  /* melody voices */
  var fluteWave = null;
  function melody(m, t, dur, vel, voice) {
    if (!ctx) return;
    if (voice === 'piano') { piano([m], t, dur + 0.05, Math.min(1, vel * 0.95 + 0.05), 'melody', { release: 0.3 }); return; }
    if (voice === 'vibes') {
      if (ready('vibes')) { var zv = nearest('vibes', m); if (zv) { playSample(zv, 'melody', t, Math.max(dur, 0.25) + 0.15, vel * 1.2, 0.5, true); return; } }
      playBuf(vibesBuf(m), 'melody', t, Math.max(dur, 0.25) + 0.25, vel * 0.85, 0.25); return;
    }
    if (ready('flute')) { var zf = nearest('flute', m); if (zf) { playSample(zf, 'melody', t, Math.max(0.1, dur), vel * 0.75, 0.14, true, true); return; } }
    // flute (synth fallback): soft sine-ish tone, breath and delayed vibrato
    if (!fluteWave) { var re = new Float32Array([0, 0, 0, 0, 0]), im = new Float32Array([0, 1, 0.16, 0.06, 0.02]); fluteWave = ctx.createPeriodicWave(re, im); }
    var f = freq(m) * tuneRatio(), o = ctx.createOscillator(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
    o.setPeriodicWave(fluteWave); o.frequency.value = f;
    lfo.frequency.value = 5.1; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(0, t + 0.22); lg.gain.linearRampToValueAtTime(f * 0.0045, t + 0.6);
    lfo.connect(lg); lg.connect(o.frequency);
    var end = t + Math.max(0.08, dur), a = 0.5 * vel;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(a * 1.15, t + 0.035); g.gain.setTargetAtTime(a, t + 0.035, 0.08);
    g.gain.setValueAtTime(a, end); g.gain.setTargetAtTime(0, end, 0.05);
    o.connect(g); g.connect(parts.melody.gain);
    if (!noiseBuf) { var nb = new Float32Array(sr); for (var i = 0; i < sr; i++) nb[i] = rnd(); noiseBuf = mkBuf(nb); }
    var ns = ctx.createBufferSource(), nf = ctx.createBiquadFilter(), ng = ctx.createGain();
    ns.buffer = noiseBuf; ns.loop = true; nf.type = 'bandpass'; nf.frequency.value = Math.min(9000, f * 2.2); nf.Q.value = 1.2;
    ng.gain.setValueAtTime(0, t); ng.gain.linearRampToValueAtTime(0.06 * vel, t + 0.02); ng.gain.setTargetAtTime(0.012 * vel, t + 0.03, 0.06); ng.gain.setValueAtTime(0.012 * vel, end); ng.gain.setTargetAtTime(0, end, 0.04);
    ns.connect(nf); nf.connect(ng); ng.connect(parts.melody.gain);
    o.start(t); lfo.start(t); ns.start(t, Math.random() * 0.5); var stopAt = end + 0.4; o.stop(stopAt); lfo.stop(stopAt); ns.stop(stopAt);
    track([o, lfo, ns, g, ng], stopAt);
  }

  function silence() {
    if (!ctx) return; var now = ctx.currentTime;
    live.forEach(function (x) { x.nodes.forEach(function (n) { try { if (n.gain) { n.gain.cancelScheduledValues(now); n.gain.setTargetAtTime(0, now, 0.025); } else if (n.stop) n.stop(now + 0.12); } catch (e) {} }); });
    live = [];
  }
  function setLevel(id, v) { if (!parts[id]) parts[id] = { level: v }; parts[id].level = v; if (ctx && parts[id].gain) parts[id].gain.gain.setTargetAtTime(v, ctx.currentTime, 0.03); }
  /* pre-render the notes a song will need, a few per tick, so the first bars don't stutter */
  function warm(list, done) {
    if (!ctx) { if (done) done(); return; }
    var q = list.slice(), step = function () {
      var t0 = Date.now();
      while (q.length && Date.now() - t0 < 12) { var it = q.shift(); try { it(); } catch (e) {} }
      if (q.length) setTimeout(step, 0); else if (done) done();
    };
    step();
  }
  root.LFAudio = {
    ensure: ensure, piano: piano, guitar: guitar, bass: bass, perc: perc, click: click, melody: melody, silence: silence, setLevel: setLevel, warm: warm,
    pianoBuf: function (m, h) { return ctx && pianoBuf(m, h); }, bassBuf: function (m) { return ctx && bassBuf(m); }, percBuf: function (n) { return ctx && percBuf(n); },
    vibesBuf: function (m) { return ctx && vibesBuf(m); }, guitarBuf: function (m) { return ctx && guitarBuf(m); },
    now: function () { return ctx ? ctx.currentTime : 0; }, latency: function () { return ctx ? (ctx.outputLatency || ctx.baseLatency || 0) : 0; },
    setVolume: function (v) { settings.volume = v; if (master) master.gain.setTargetAtTime(v * v * 1.5, ctx.currentTime, 0.04); },
    tap: function () { var an = ctx.createAnalyser(); an.fftSize = 2048; comp.connect(an); return an; },
    load: load, ready: ready, SETS: SETS, setTune: function (hz) { settings.tune = Math.max(400, Math.min(480, +hz || 440)); }, get tune() { return settings.tune; },
    get running() { return !!ctx; }, levelOf: function (id) { return parts[id] ? parts[id].level : null; }, PERC_NAMES: Object.keys(PERC)
  };
})(typeof window !== 'undefined' ? window : globalThis);
