/* ===== Shared playback timing: lookahead ticker, audio-locked clock, audio unlock, smooth roll =====
   Used by the Latin Fake Book and the Psalter Player.
   - Ticker: fires every 25 ms from a Web Worker, so background or occluded windows (Safari and Chrome slow main-thread
     timers to about 1 s there) do not starve the scheduler. Falls back to setInterval.
   - Clock: the AudioContext time the listener is hearing right now (getOutputTimestamp, or currentTime minus the
     output and base latency). It is smoothed against performance.now() so animation moves at a steady rate even though
     currentTime advances in render-quantum steps (Safari exposes it in larger steps).
   - unlock(): resumes/creates audio on the first tap, click or key (iOS and macOS Safari need a user gesture).
   - Roll: moves a long strip of music with transform: translate3d under a fixed playhead. Loops wrap seamlessly by
     showing copies of the looped section on either side, so the music never jumps. */
(function (root) {
  'use strict';
  function Ticker(fn, ms) {
    ms = ms || 25;
    var w = null, iv = null, on = false;
    try {
      var src = 'var t=null;onmessage=function(e){if(e.data==="start"){clearInterval(t);t=setInterval(function(){postMessage(0)},' + ms + ')}else{clearInterval(t);t=null}}';
      w = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      w.onmessage = function () { if (on) fn(); };
    } catch (e) { w = null; }
    return {
      start: function () { on = true; if (w) w.postMessage('start'); else { clearInterval(iv); iv = setInterval(fn, ms); } fn(); },
      stop: function () { on = false; if (w) w.postMessage('stop'); clearInterval(iv); iv = null; },
      get worker() { return !!w; }
    };
  }
  function Clock(getCtx, graphDelay) {
    // graphDelay: fixed delay inside our own audio graph (a DynamicsCompressorNode looks ahead 6 ms)
    var gd = graphDelay == null ? 0.006 : graphDelay;
    var lastPerf = 0, lastT = 0, have = false;
    var env = null, envPerf = 0; // upper envelope of currentTime - performance time (currentTime advances in chunks)
    function ctNow(ctx, perf) {
      var pn = performance.now(), d = ctx.currentTime - pn / 1000;
      if (env === null || Math.abs(d - env) > 0.25) env = d; // first reading or a discontinuity (resume, device change)
      else env = Math.max(d, env - 0.002 * Math.max(0, pn - envPerf) / 1000); // freshest reading; follows clock drift
      envPerf = pn;
      return perf / 1000 + env;
    }
    function raw(ctx, perf) {
      var ct = ctNow(ctx, perf);
      if (ctx.getOutputTimestamp) {
        var ts = ctx.getOutputTimestamp();
        // contextTime is what is reaching the speakers at performanceTime. Some engines (WebKit builds) report a
        // performanceTime on another time base or at another rate, so use it only after it has been seen to advance
        // at the real rate (1 s per s, checked every 250 ms) and while it agrees with currentTime.
        if (ts && ts.performanceTime > 0 && ts.contextTime > 0) {
          var e = ts.contextTime + (perf - ts.performanceTime) / 1000;
          if (otsP0 === null || perf < otsP0) { otsP0 = perf; otsE0 = e; }
          else if (perf - otsP0 >= 250) { var rate = (e - otsE0) / ((perf - otsP0) / 1000); otsGood = Math.abs(rate - 1) < 0.03; otsP0 = perf; otsE0 = e; }
          if (otsGood && e <= ct + 0.02 && e >= ct - 0.5) { okOts = true; return e - gd; }
        }
      }
      okOts = false;
      return ct - (ctx.outputLatency || 0) - (ctx.baseLatency || 0) - gd;
    }
    var okOts = false, otsGood = false, otsP0 = null, otsE0 = 0;
    return {
      // audio-context time being heard now, steady for animation; perf = rAF timestamp (ms) if you have it
      heard: function (perf) {
        var ctx = getCtx(); if (!ctx) return 0;
        perf = perf || performance.now();
        var r = raw(ctx, perf);
        if (ctx.state !== 'running') { have = false; return r; }
        if (!have) { have = true; lastPerf = perf; lastT = r; return r; }
        var pred = lastT + Math.max(0, perf - lastPerf) / 1000, err = r - pred;
        // follow the audio clock gently; snap only on a real discontinuity (device change, resume)
        var t = Math.abs(err) > 0.06 ? r : pred + err * 0.06;
        if (t < lastT) t = lastT;
        lastPerf = perf; lastT = t;
        return t;
      },
      reset: function () { have = false; env = null; otsP0 = null; otsGood = false; },
      get usesOutputTimestamp() { return okOts; },
      latency: function () { var ctx = getCtx(); if (!ctx) return 0; return Math.max(0, ctx.currentTime - raw(ctx, performance.now())); }
    };
  }
  function unlock(fn) {
    var done = false, evs = ['pointerdown', 'touchend', 'keydown', 'mousedown'];
    function go() { if (done) return; done = true; evs.forEach(function (e) { document.removeEventListener(e, go, true); }); try { fn(); } catch (e) {} }
    evs.forEach(function (e) { document.addEventListener(e, go, true); });
  }

  /* Roll: host (overflow hidden, position relative) > strip (the music). posOf(t) gives the strip coordinate (px along
     the axis) for song time t. setLoop(A, B) makes [A, B) repeat seamlessly (strip coordinates). */
  function Roll(host, strip, opt) {
    opt = opt || {};
    var axis = opt.axis || 'x', frac = opt.at || 1 / 3, copies = [], loop = null, cur = 0, sz = 0;
    host.classList.add('roll'); host.classList.toggle('roll-y', axis === 'y'); host.classList.toggle('roll-x', axis === 'x');
    strip.classList.add('roll-strip');
    var head = host.querySelector('.playhead'); if (!head) { head = document.createElement('div'); head.className = 'playhead'; head.setAttribute('aria-hidden', 'true'); host.appendChild(head); }
    function size() { return sz; } // measured on build/resize only: no layout reads while animating
    function headAt() { return Math.round(sz * frac); }
    function place() { sz = axis === 'x' ? host.clientWidth : host.clientHeight; if (axis === 'x') { head.style.left = headAt() + 'px'; head.style.top = ''; } else { head.style.top = headAt() + 'px'; head.style.left = ''; } }
    function tr(el, v) { el.style.transform = axis === 'x' ? 'translate3d(' + v + 'px,0,0)' : 'translate3d(0,' + v + 'px,0)'; }
    function clip(el, from, to) { // in the copy's own coordinates
      var a = from == null ? '-100000px' : from + 'px', b = to == null ? '-100000px' : 'calc(100% - ' + to + 'px)';
      if (from == null && to == null) { el.style.clipPath = ''; return; }
      el.style.clipPath = axis === 'x' ? 'inset(-50px ' + (to == null ? '-100000px' : b) + ' -50px ' + (from == null ? '-100000px' : a) + ')' : 'inset(' + (from == null ? '-100000px' : a) + ' -50px ' + (to == null ? '-100000px' : b) + ' -50px)';
    }
    function clearCopies() { copies.forEach(function (c) { c.el.remove(); }); copies = []; clip(strip, null, null); }
    function build() {
      clearCopies(); if (!loop) return;
      var L = loop.B - loop.A; if (L < 4) return;
      var n = Math.min(8, Math.ceil(size() / L) + 1);
      for (var k = -n; k <= n; k++) {
        if (!k) continue;
        var el = opt.makeCopy ? opt.makeCopy(k) : strip.cloneNode(true);
        el.classList.add('roll-strip', 'roll-copy'); el.removeAttribute('id'); el.setAttribute('aria-hidden', 'true');
        host.insertBefore(el, strip.nextSibling);
        copies.push({ k: k, el: el });
      }
      // each copy shows exactly one pass of the loop; the outermost ones extend to the edges
      clip(strip, loop.A, loop.B);
      copies.forEach(function (c) { clip(c.el, c.k === -n ? null : loop.A, c.k === n ? null : loop.B); });
    }
    var api = {
      host: host, strip: strip, axis: axis,
      setLoop: function (A, B) { var nl = A == null ? null : { A: A, B: B }; if (JSON.stringify(nl) === JSON.stringify(loop)) return; loop = nl; build(); api.set(cur); },
      get loop() { return loop; },
      // p = strip coordinate that should sit under the playhead
      set: function (p) {
        cur = p; var off = headAt() - p; // sub-pixel: the layer is composited, so motion stays even
        tr(strip, off);
        if (loop) { var L = loop.B - loop.A; copies.forEach(function (c) { tr(c.el, off + c.k * L); }); }
        return off;
      },
      get pos() { return cur; },
      each: function (fn) { fn(strip, 0); copies.forEach(function (c) { fn(c.el, c.k); }); },
      rebuild: function () { place(); build(); api.set(cur); },
      headAt: headAt, size: size,
      destroy: function () { clearCopies(); head.remove(); host.classList.remove('roll', 'roll-x', 'roll-y'); strip.classList.remove('roll-strip'); strip.style.transform = ''; }
    };
    place();
    return api;
  }
  /* piecewise-linear map through knots [[t, pos], ...] sorted by t */
  function knotMap(knots) {
    return function (t) {
      var n = knots.length; if (!n) return 0;
      if (t <= knots[0][0]) return knots[0][1] - (n > 1 ? 0 : 0);
      var lo = 0, hi = n - 1;
      if (t >= knots[hi][0]) return knots[hi][1];
      while (hi - lo > 1) { var m = (lo + hi) >> 1; if (knots[m][0] <= t) lo = m; else hi = m; }
      var a = knots[lo], b = knots[hi], f = b[0] > a[0] ? (t - a[0]) / (b[0] - a[0]) : 0;
      return a[1] + f * (b[1] - a[1]);
    };
  }
  /* frame-time probe: records rAF intervals and how far the roll moved each frame */
  function FrameProbe() {
    var dts = [], steps = [], last = null, lastPos = null;
    return {
      frame: function (now, pos) { if (last != null) { dts.push(now - last); if (lastPos != null) steps.push(pos - lastPos); } last = now; lastPos = pos; },
      report: function () {
        function st(a) { var n = a.length; if (!n) return null; var m = a.reduce(function (x, y) { return x + y; }, 0) / n, sd = Math.sqrt(a.reduce(function (x, y) { return x + (y - m) * (y - m); }, 0) / n), s = a.slice().sort(function (x, y) { return x - y; }); return { n: n, mean: +m.toFixed(2), sd: +sd.toFixed(2), p99: +s[Math.floor(n * 0.99)].toFixed(2), max: +s[n - 1].toFixed(2), min: +s[0].toFixed(2) }; }
        // speed per ms of frame time, so a long frame that moved proportionally further is not a jump
        var v = steps.map(function (s, i) { return s / (dts[i + 1] || dts[i] || 16.7); });
        return { frameMs: st(dts), pxPerFrame: st(steps), pxPerMs: st(v), backwards: steps.filter(function (s) { return s < -0.01; }).length };
      }
    };
  }
  root.LFTiming = { Ticker: Ticker, Clock: Clock, unlock: unlock, Roll: Roll, knotMap: knotMap, FrameProbe: FrameProbe };
})(typeof window !== 'undefined' ? window : globalThis);
