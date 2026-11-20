/* ==========================================================================
   پرواز شاهد — موتور صدا (WebAudio، بدون فایل خارجی)
   ========================================================================== */
(function () {
  "use strict";

  var ctx = null;
  var master = null;
  var sfxBus = null;
  var enabled = true;
  var engine = null;      // گرید صدای موتور پهپاد
  var lastShot = 0;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(ctx.destination);

    sfxBus = ctx.createGain();
    sfxBus.gain.value = 0.55;
    sfxBus.connect(master);

    startEngine();
    return ctx;
  }

  function now() { return ctx ? ctx.currentTime : 0; }

  /* ---------- نویز سفید مشترک ---------- */
  var noiseBuf = null;
  function noise() {
    if (noiseBuf) return noiseBuf;
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }

  /* ---------- موتور پهپاد: زمزمهٔ مداوم ---------- */
  function startEngine() {
    var t = now();
    engine = {};

    engine.gain = ctx.createGain();
    engine.gain.gain.value = 0.0;
    engine.gain.connect(master);

    // دو نوسانگر با فرکانس نزدیک برای ایجاد ضربان
    engine.osc1 = ctx.createOscillator();
    engine.osc1.type = "sawtooth";
    engine.osc1.frequency.value = 78;

    engine.osc2 = ctx.createOscillator();
    engine.osc2.type = "square";
    engine.osc2.frequency.value = 79.5;

    engine.filter = ctx.createBiquadFilter();
    engine.filter.type = "lowpass";
    engine.filter.frequency.value = 420;
    engine.filter.Q.value = 2;

    engine.osc1.connect(engine.filter);
    engine.osc2.connect(engine.filter);
    engine.filter.connect(engine.gain);

    // نویز باد
    var n = ctx.createBufferSource();
    n.buffer = noise();
    n.loop = true;
    var nf = ctx.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 900;
    nf.Q.value = 0.7;
    var ng = ctx.createGain();
    ng.gain.value = 0.05;
    n.connect(nf); nf.connect(ng); ng.connect(engine.gain);
    engine.wind = ng;

    engine.osc1.start(t);
    engine.osc2.start(t);
    n.start(t);

    engine.gain.gain.setTargetAtTime(0.075, t, 1.2);
  }

  function setEnvelope() {
    if (!ctx || !enabled || !engine) return;
    var t = now();
    engine.gain.gain.setTargetAtTime(0.075, t, 0.25);
  }

  function engineMute(muted) {
    if (!ctx || !engine) return;
    var t = now();
    engine.gain.gain.setTargetAtTime(muted || !enabled ? 0 : 0.075, t, 0.3);
  }

  /* ---------- افکت شلیک ---------- */
  function shot(heavy) {
    if (!ctx || !enabled) return;
    var t = now();
    if (t - lastShot < 0.035 && !heavy) return;
    lastShot = t;

    var src = ctx.createBufferSource();
    src.buffer = noise();
    src.playbackRate.value = heavy ? 0.55 : 1.4;

    var bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.setValueAtTime(heavy ? 380 : 1500, t);
    bp.frequency.exponentialRampToValueAtTime(heavy ? 120 : 500, t + 0.13);
    bp.Q.value = heavy ? 1.1 : 2.2;

    var g = ctx.createGain();
    g.gain.setValueAtTime(heavy ? 0.55 : 0.28, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (heavy ? 0.35 : 0.12));

    src.connect(bp); bp.connect(g); g.connect(sfxBus);
    src.start(t);
    src.stop(t + 0.4);

    // کلیک فلزی
    var o = ctx.createOscillator();
    o.type = "triangle";
    o.frequency.setValueAtTime(heavy ? 180 : 620, t);
    o.frequency.exponentialRampToValueAtTime(heavy ? 60 : 180, t + 0.09);
    var og = ctx.createGain();
    og.gain.setValueAtTime(heavy ? 0.3 : 0.12, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
    o.connect(og); og.connect(sfxBus);
    o.start(t); o.stop(t + 0.12);
  }

  /* ---------- انفجار ---------- */
  function boom(big) {
    if (!ctx || !enabled) return;
    var t = now();
    var src = ctx.createBufferSource();
    src.buffer = noise();
    src.playbackRate.value = big ? 0.42 : 0.75;

    var lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.setValueAtTime(big ? 900 : 1600, t);
    lp.frequency.exponentialRampToValueAtTime(90, t + (big ? 0.9 : 0.5));

    var g = ctx.createGain();
    g.gain.setValueAtTime(big ? 0.75 : 0.4, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + (big ? 1.1 : 0.6));

    src.connect(lp); lp.connect(g); g.connect(sfxBus);
    src.start(t); src.stop(t + 1.2);

    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(big ? 110 : 150, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.5);
    var og = ctx.createGain();
    og.gain.setValueAtTime(big ? 0.6 : 0.3, t);
    og.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
    o.connect(og); og.connect(sfxBus);
    o.start(t); o.stop(t + 0.65);
  }

  /* ---------- برخورد/آسیب ---------- */
  function hit() {
    if (!ctx || !enabled) return;
    var t = now();
    var o = ctx.createOscillator();
    o.type = "square";
    o.frequency.setValueAtTime(220, t);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.18);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.22, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.2);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 0.22);
  }

  /* ---------- برداشتن جعبه ---------- */
  function pickup() {
    if (!ctx || !enabled) return;
    var t = now();
    [660, 880, 1320].forEach(function (f, i) {
      var o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.setValueAtTime(f, t + i * 0.06);
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + i * 0.06);
      g.gain.exponentialRampToValueAtTime(0.16, t + i * 0.06 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.06 + 0.22);
      o.connect(g); g.connect(sfxBus);
      o.start(t + i * 0.06); o.stop(t + i * 0.06 + 0.24);
    });
  }

  /* ---------- موشک نقطه‌زن ---------- */
  function missile() {
    if (!ctx || !enabled) return;
    var t = now();
    var o = ctx.createOscillator();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(1500, t + 0.45);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.001, t);
    g.gain.exponentialRampToValueAtTime(0.2, t + 0.1);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.5);
    var f = ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = 900; f.Q.value = 3;
    o.connect(f); f.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 0.52);
  }

  /* ---------- هشدار ---------- */
  function warn() {
    if (!ctx || !enabled) return;
    var t = now();
    [0, 0.16].forEach(function (d) {
      var o = ctx.createOscillator();
      o.type = "square";
      o.frequency.value = 520;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.08, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.13);
      o.connect(g); g.connect(sfxBus);
      o.start(t + d); o.stop(t + d + 0.15);
    });
  }

  /* ---------- جاروی رابط (hover/کلیک دکمه) ---------- */
  function ui() {
    if (!ctx || !enabled) return;
    var t = now();
    var o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(720, t);
    o.frequency.exponentialRampToValueAtTime(980, t + 0.07);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.09, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.1);
    o.connect(g); g.connect(sfxBus);
    o.start(t); o.stop(t + 0.11);
  }

  function vibrate(ms) {
    if (navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
  }

  window.SFX = {
    unlock: function () {
      ensure();
      if (ctx && ctx.state === "suspended") ctx.resume();
      setEnvelope();
    },
    setEnabled: function (v) {
      enabled = !!v;
      if (enabled) ensure();
      engineMute(false);
    },
    isEnabled: function () { return enabled; },
    muteEngine: engineMute,
    shot: shot,
    boom: boom,
    hit: hit,
    pickup: pickup,
    missile: missile,
    warn: warn,
    ui: ui,
    vibrate: vibrate
  };
})();
