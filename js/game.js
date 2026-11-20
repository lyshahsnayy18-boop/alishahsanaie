/* ==========================================================================
   پرواز شاهد — موتور بازی
   شبیه‌ساز عملیات پهپاد رزمی (Canvas 2D، بدون وابستگی)
   ========================================================================== */
(function () {
  "use strict";

  /* ------------------------------------------------------------------ *
   *  ابزارهای پایه
   * ------------------------------------------------------------------ */
  var $ = function (id) { return document.getElementById(id); };

  var stage = $("stage");
  var cv = $("scene");
  var ctx = cv.getContext("2d", { alpha: false });

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var rand = function (a, b) { return a + Math.random() * (b - a); };
  var randi = function (a, b) { return Math.floor(rand(a, b + 1)); };
  var pick = function (arr) { return arr[Math.floor(Math.random() * arr.length)]; };
  var dist2 = function (ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  };
  var TAU = Math.PI * 2;

  function fa(n) {
    var s = Math.round(n).toString();
    var map = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
    return s.replace(/\d/g, function (d) { return map[+d]; }).replace(/\B(?=(\d{3})+(?!\d))/g, "٬");
  }

  var FONT = "Vazirmatn, 'Segoe UI', Tahoma, sans-serif";

  /* ------------------------------------------------------------------ *
   *  مختصات جهانی
   * ------------------------------------------------------------------ */
  var WORLD_H = 600;          // ارتفاع ثابت جهانی
  var W = 1000, H = WORLD_H;  // عرض جهانی بر اساس نسبت صفحه
  var scale = 1, dpr = 1;

  function resize() {
    var r = stage.getBoundingClientRect();
    if (!r.width || !r.height) return;
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.max(1, Math.round(r.width * dpr));
    cv.height = Math.max(1, Math.round(r.height * dpr));
    cv.style.width = r.width + "px";
    cv.style.height = r.height + "px";

    scale = r.height / WORLD_H;
    H = WORLD_H;
    W = clamp(r.width / scale, 300, 3200);

    buildSky();
    if (game.drone) {
      game.drone.x = clamp(game.drone.x, 30, W - 30);
      game.drone.y = clamp(game.drone.y, 60, H - 20);
      game.drone.tx = game.drone.x;
      game.drone.ty = game.drone.y;
    }
  }

  /* ------------------------------------------------------------------ *
   *  عناصر رابط
   * ------------------------------------------------------------------ */
  var el = {
    hud: $("hud"),
    missionNo: $("missionNo"),
    baseTxt: $("baseTxt"),
    missionBar: $("missionBar"),
    missionTxt: $("missionTxt"),
    escapedTxt: $("escapedTxt"),
    scoreVal: $("scoreVal"),
    comboVal: $("comboVal"),
    hpTxt: $("hpTxt"),
    hpBar: $("hpBar"),
    hpBarWrap: document.querySelector(".bar--hp"),
    shieldTag: $("shieldTag"),
    ammoTxt: $("ammoTxt"),
    ammoBar: $("ammoBar"),
    heatTxt: $("heatTxt"),
    heatBar: $("heatBar"),
    heatWrap: $("heatWrap"),
    specialBtn: $("specialBtn"),
    specialFill: $("specialFill"),
    hints: $("hints"),
    toast: $("toast"),
    screenMenu: $("screenMenu"),
    screenHelp: $("screenHelp"),
    screenPause: $("screenPause"),
    screenOver: $("screenOver"),
    bestMenu: $("bestMenu"),
    overTitle: $("overTitle"),
    overReason: $("overReason"),
    statScore: $("statScore"),
    statBest: $("statBest"),
    statKills: $("statKills"),
    statAcc: $("statAcc"),
    statMission: $("statMission"),
    btnMute: $("btnMute"),
    btnPause: $("btnPause"),
    btnFull: $("btnFull")
  };

  var hudCache = {};

  /* ------------------------------------------------------------------ *
   *  وضعیت بازی
   * ------------------------------------------------------------------ */
  var game = null;

  function newGame() {
    return {
      mode: "menu",
      time: 0,
      score: 0,
      best: +(localStorage.getItem("shahed-best") || 0),
      kills: 0,
      shots: 0,
      hits: 0,
      mission: 1,
      missionKills: 0,
      quota: 12,
      escaped: 0,
      hp: 100,
      maxHp: 100,
      baseHp: 100,
      ammo: 260,
      maxAmmo: 260,
      heat: 0,
      heatLock: false,
      special: 0,
      shield: 0,
      cool: 0,
      combo: 0,
      comboT: 0,
      shake: 0,
      flash: 0,
      hitFlash: 0,
      spawnT: 0.8,
      missionBreak: 1.2,
      locked: null,
      boss: null,
      bossKilled: false,
      bossSpawned: false,
      drone: { x: W / 2, y: H * 0.76, tx: W / 2, ty: H * 0.76, bank: 0, bob: 0, recoil: 0 },
      bullets: [],
      ebullets: [],
      enemies: [],
      pickups: [],
      particles: [],
      texts: [],
      missiles: [],
      stars: [],
      clouds: []
    };
  }

  /* ------------------------------------------------------------------ *
   *  ورودی
   * ------------------------------------------------------------------ */
  var input = {
    down: false,
    px: 0, py: 0,
    keys: Object.create(null),
    usingKeys: false,
    fired: false
  };

  function toWorld(clientX, clientY) {
    var r = stage.getBoundingClientRect();
    return { x: (clientX - r.left) / scale, y: (clientY - r.top) / scale };
  }

  function setPointer(e) {
    var p = toWorld(e.clientX, e.clientY);
    input.px = p.x; input.py = p.y;
    input.usingKeys = false;
  }

  stage.addEventListener("pointermove", function (e) {
    if (game && game.mode !== "play") return;
    setPointer(e);
  }, { passive: true });

  stage.addEventListener("pointerdown", function (e) {
    if (!game) return;
    if (e.target.closest && e.target.closest("button")) return;
    if (game.mode !== "play") return;
    stage.setPointerCapture && stage.setPointerCapture(e.pointerId);
    setPointer(e);
    input.down = true;
    input.fired = false;
    SFX.unlock();
  });

  var releasePointer = function () { input.down = false; };
  stage.addEventListener("pointerup", releasePointer);
  stage.addEventListener("pointercancel", releasePointer);
  window.addEventListener("pointerup", releasePointer);
  window.addEventListener("pointercancel", releasePointer);
  stage.addEventListener("pointerleave", function () {
    // ماوس از کادر بیرون رفت: شلیک متوقف می‌شود ولی پهپاد سر جایش می‌ماند
    input.down = false;
  });

  stage.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  window.addEventListener("keydown", function (e) {
    var k = e.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].indexOf(k) >= 0) e.preventDefault();
    input.keys[k] = true;
    if (!game) return;

    if (k === " " && game.mode === "play") { input.down = true; input.fired = false; }
    if (k === "f" && game.mode === "play") fireSpecial();
    if (k === "p" || k === "escape") {
      if (game.mode === "play") pauseGame();
      else if (game.mode === "pause") resumeGame();
    }
    if (k === "m") toggleSound();
    if (k === "enter" || k === "r") {
      if (game.mode === "over") startGame();
      else if (game.mode === "menu") startGame();
    }
  });

  window.addEventListener("keyup", function (e) {
    var k = e.key.toLowerCase();
    input.keys[k] = false;
    if (k === " ") input.down = false;
  });

  window.addEventListener("blur", function () {
    input.down = false;
    input.keys = Object.create(null);
    if (game && game.mode === "play") pauseGame();
  });

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && game && game.mode === "play") pauseGame();
  });

  /* ------------------------------------------------------------------ *
   *  آسمان، ابر و پس‌زمینه (ساخته‌شده در آف‌اسکرین)
   * ------------------------------------------------------------------ */
  var skyCanvas = document.createElement("canvas");
  var skyW = 0, skyH = 0;

  function buildSky() {
    var w = 1400, h = 440;
    skyW = w; skyH = h;
    skyCanvas.width = w; skyCanvas.height = h;
    var g = skyCanvas.getContext("2d");

    var grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0.00, "#040b16");
    grad.addColorStop(0.28, "#0b2338");
    grad.addColorStop(0.52, "#173c52");
    grad.addColorStop(0.72, "#2f5a63");
    grad.addColorStop(0.86, "#8a6a52");
    grad.addColorStop(1.00, "#c9803f");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);

    // درخشش خورشید پایین صحنه
    var sunX = w * 0.62, sunY = h * 1.06;
    var sun = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, h * 0.95);
    sun.addColorStop(0, "rgba(255, 214, 150, 0.95)");
    sun.addColorStop(0.12, "rgba(255, 158, 84, 0.55)");
    sun.addColorStop(0.38, "rgba(238, 106, 66, 0.22)");
    sun.addColorStop(1, "rgba(238, 106, 66, 0)");
    g.fillStyle = sun;
    g.fillRect(0, 0, w, h);

    // هالهٔ سرد بالا
    var top = g.createRadialGradient(w * 0.2, -h * 0.1, 10, w * 0.2, -h * 0.1, h * 1.1);
    top.addColorStop(0, "rgba(90, 220, 230, 0.22)");
    top.addColorStop(1, "rgba(90, 220, 230, 0)");
    g.fillStyle = top;
    g.fillRect(0, 0, w, h);
  }

  function buildClouds() {
    game.stars.length = 0;
    game.clouds.length = 0;
    var n = Math.round(W / 26) + 14;
    for (var i = 0; i < n; i++) {
      game.stars.push({
        x: rand(0, W),
        y: rand(0, H * 0.62),
        r: rand(0.4, 1.5),
        a: rand(0.15, 0.75),
        tw: rand(0.5, 2.2)
      });
    }
    for (var j = 0; j < 12; j++) {
      game.clouds.push(makeCloud(rand(-80, W + 80), rand(-H * 0.3, H)));
    }
  }

  function makeCloud(x, y) {
    var puffs = [];
    var n = randi(4, 7);
    var size = rand(26, 76);
    for (var i = 0; i < n; i++) {
      puffs.push({
        dx: rand(-size, size),
        dy: rand(-size * 0.35, size * 0.35),
        r: rand(size * 0.35, size * 0.85)
      });
    }
    return { x: x, y: y, puffs: puffs, sp: rand(0.45, 1.5), a: rand(0.05, 0.18), z: rand(0.5, 1.4) };
  }

  /* ------------------------------------------------------------------ *
   *  ذرات و متن‌های شناور
   * ------------------------------------------------------------------ */
  var MAX_PARTICLES = 520;

  function spawnParticle(x, y, opt) {
    if (game.particles.length > MAX_PARTICLES) game.particles.shift();
    game.particles.push({
      x: x, y: y,
      vx: opt.vx || 0,
      vy: opt.vy || 0,
      life: opt.life || 0.6,
      max: opt.life || 0.6,
      r: opt.r || 3,
      color: opt.color || "#ffd27a",
      drag: opt.drag == null ? 0.9 : opt.drag,
      grav: opt.grav || 0,
      glow: opt.glow !== false,
      kind: opt.kind || "dot"
    });
  }

  function explode(x, y, size, color) {
    var n = Math.round(10 + size * 0.9);
    for (var i = 0; i < n; i++) {
      var a = rand(0, TAU), sp = rand(30, 150) * (size / 40);
      spawnParticle(x, y, {
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(0.3, 0.7),
        r: rand(2, 5) * (size / 40),
        color: Math.random() < 0.55 ? color : (Math.random() < 0.5 ? "#fff1c4" : "#ff7a3d"),
        drag: 0.88
      });
    }
    // حلقهٔ شوک
    spawnParticle(x, y, { life: 0.34, r: size * 0.5, kind: "ring", color: "#ffd9a0", drag: 1 });
    for (var j = 0; j < 4; j++) {
      var aa = rand(0, TAU);
      spawnParticle(x, y, {
        vx: Math.cos(aa) * rand(10, 40),
        vy: Math.sin(aa) * rand(10, 40),
        life: rand(0.9, 1.6),
        r: rand(6, 16),
        color: "rgba(40,40,40,0.55)",
        drag: 0.94,
        glow: false,
        kind: "smoke"
      });
    }
  }

  function floatText(x, y, text, color, size) {
    game.texts.push({ x: x, y: y, text: text, color: color || "#ffe6b0", life: 0.95, max: 0.95, size: size || 15 });
  }

  /* ------------------------------------------------------------------ *
   *  دشمنان
   * ------------------------------------------------------------------ */
  var TYPES = {
    helo:  { hp: 34,  r: 22, score: 110, vy: 52, wob: 30, fire: 1.9, dmg: 6,  scale: 1.0,  label: "بالگرد" },
    jet:   { hp: 26,  r: 18, score: 150, vy: 105, wob: 12, fire: 2.8, dmg: 6, scale: 0.9,  label: "جت" },
    heavy: { hp: 135, r: 36, score: 340, vy: 34, wob: 14, fire: 1.3, dmg: 12, scale: 1.25, label: "گالکسی" },
    kami:  { hp: 20,  r: 15, score: 100, vy: 165, wob: 6,  fire: 0,   dmg: 0,  scale: 0.85, label: "انتحاری" }
  };

  function difficulty() {
    return 1 + (game.mission - 1) * 0.17 + game.time / 260;
  }

  function spawnEnemy(forceType) {
    if (game.enemies.length > 22) return;
    var d = difficulty();
    var type = forceType;
    if (!type) {
      var roll = Math.random();
      if (game.mission >= 3 && roll < 0.1) type = "heavy";
      else if (roll < 0.34) type = "jet";
      else if (roll < 0.62) type = "kami";
      else type = "helo";
    }
    var T = TYPES[type];
    var x = rand(W * 0.1, W * 0.9);
    var e = {
      type: type,
      x: x,
      y: -60 - rand(0, 60),
      baseX: x,
      hp: Math.round(T.hp * (1 + (d - 1) * 0.85)),
      maxHp: Math.round(T.hp * (1 + (d - 1) * 0.85)),
      r: T.r,
      vx: rand(-18, 18),
      baseVy: T.vy * (0.75 + d * 0.25),
      wobT: rand(0, TAU),
      wobSpeed: rand(0.6, 1.4),
      wobAmp: T.wob,
      fireCd: rand(0.7, T.fire),
      fireRate: T.fire / (0.85 + d * 0.2),
      dmg: T.dmg,
      t: 0,
      dead: false,
      flash: 0,
      scale: 0.9
    };
    game.enemies.push(e);
  }

  function spawnBoss() {
    var hp = 620 + game.mission * 140;
    var b = {
      type: "boss",
      x: W / 2,
      y: -110,
      hp: hp,
      maxHp: hp,
      r: 58,
      vx: 46 * (Math.random() < 0.5 ? -1 : 1),
      baseVy: 8,
      wobT: 0,
      wobSpeed: 0.8,
      wobAmp: 10,
      fireCd: 1.2,
      fireRate: 0.85,
      dmg: 10,
      t: 0,
      dead: false,
      flash: 0,
      scale: 1.25,
      entered: false,
      isBoss: true
    };
    game.boss = b;
    game.enemies.push(b);
    SFX.warn();
    toast("⚠ ناوچهٔ مادر شناسایی شد");
  }

  /* ------------------------------------------------------------------ *
   *  جعبه‌های تجهیزات
   * ------------------------------------------------------------------ */
  var PICKUPS = {
    ammo:   { color: "#8be9ff", label: "مهمات" },
    repair: { color: "#63e58b", label: "تعمیر" },
    shield: { color: "#9d8bff", label: "سپر" },
    cool:   { color: "#ffd27a", label: "خنک‌کننده" }
  };

  function spawnPickup() {
    var roll = Math.random();
    var kind = roll < 0.4 ? "ammo" : roll < 0.63 ? "repair" : roll < 0.85 ? "shield" : "cool";
    if (game.hp > game.maxHp - 15 && kind === "repair" && Math.random() < 0.6) kind = "ammo";
    game.pickups.push({
      kind: kind,
      x: rand(W * 0.12, W * 0.88),
      y: -30,
      vy: rand(42, 74),
      r: 15,
      bob: rand(0, TAU),
      life: 16,
      t: 0
    });
  }

  /* ------------------------------------------------------------------ *
   *  شلیک
   * ------------------------------------------------------------------ */
  var fireTimer = 0;

  function fireSpecial() {
    if (!game || game.mode !== "play") return;
    if (game.special < 100) {
      toast("موشک نقطه‌زن آماده نیست");
      return;
    }
    game.special = 0;
    var target = null, best = Infinity;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.y < 0 || e.dead) continue;
      var d = dist2(e.x, e.y, game.drone.x, game.drone.y);
      if (d < best) { best = d; target = e; }
    }
    game.missiles.push({
      x: game.drone.x,
      y: game.drone.y - 16,
      vx: 0,
      vy: -340,
      target: target,
      life: 3.2,
      trail: 0
    });
    SFX.missile();
    SFX.vibrate(30);
    floatText(game.drone.x, game.drone.y - 46, "شلیک نقطه‌زن", "#ffd27a", 13);
    game.shake = Math.max(game.shake, 6);
  }

  function playerShoot(dt) {
    if (!input.down) return;

    fireTimer -= dt;
    if (game.heatLock || game.ammo <= 0) return;
    if (fireTimer > 0) return;
    fireTimer = 0.082;

    game.ammo--;
    game.shots++;
    game.heat = Math.min(100, game.heat + 3.1);
    if (game.heat >= 100) game.heatLock = true;

    var d = game.drone;
    var spread = 2.2;
    var offs = [-7, 7];
    for (var i = 0; i < 2; i++) {
      var ox = offs[i];
      game.bullets.push({
        x: d.x + ox,
        y: d.y - 20,
        vx: rand(-spread, spread) + d.bank * 40,
        vy: -820,
        life: 2,
        r: 2.6
      });
    }
    d.recoil = 1;
    SFX.shot(false);
  }

  /* ------------------------------------------------------------------ *
   *  آسیب و مرگ
   * ------------------------------------------------------------------ */
  function damageDrone(amount) {
    if (game.mode !== "play") return;
    if (game.shield > 0) {
      var absorbed = Math.min(game.shield, amount);
      game.shield -= absorbed;
      amount -= absorbed;
      if (absorbed > 0) {
        game.particles.push({ x: game.drone.x, y: game.drone.y, vx: 0, vy: 0, life: 0.3, max: 0.3, r: 34, color: "#9d8bff", drag: 1, glow: true, kind: "shieldRing" });
      }
    }
    if (amount <= 0) return;
    game.hp = Math.max(0, game.hp - amount);
    game.hitFlash = Math.min(1, game.hitFlash + amount / 26);
    game.shake = Math.max(game.shake, 4 + amount * 0.35);
    game.combo = 0;
    SFX.hit();
    SFX.vibrate(18);
    if (game.hp <= 0) gameOver("پهپاد سرنگون شد.", "عملیات شکست خورد");
  }

  function damageBase(amount) {
    game.baseHp = Math.max(0, game.baseHp - amount);
    game.shake = Math.max(game.shake, 7);
    SFX.warn();
    if (game.baseHp <= 0) gameOver("پایگاه از دست رفت.", "مأموریت ناموفق");
  }

  function killEnemy(e, byPlayer) {
    if (e.dead) return;
    e.dead = true;
    var isBoss = !!e.isBoss;
    var T = TYPES[e.type] || { score: 900, r: 60 };
    var gain = T.score;

    game.combo++;
    game.comboT = 2.6;
    var mult = clamp(1 + Math.floor(game.combo / 3), 1, 6);
    game.score += Math.round(gain * mult);
    game.kills++;
    game.missionKills++;
    game.special = Math.min(100, game.special + (isBoss ? 45 : 5.5));

    explode(e.x, e.y, isBoss ? 160 : e.r * 1.6, isBoss ? "#ffd27a" : "#ffb066");
    if (isBoss) {
      for (var k = 0; k < 6; k++) {
        setTimeout(function () {
          if (!game || game.mode === "menu") return;
          explode(rand(W * 0.2, W * 0.8), rand(H * 0.12, H * 0.5), 70, "#ffcf7a");
          SFX.boom(true);
        }, k * 160);
      }
      game.shake = 22;
      SFX.boom(true);
      game.boss = null;
      game.bossKilled = true;
    } else {
      SFX.boom(false);
    }
    floatText(e.x, e.y - 12, "+" + fa(gain * mult), mult > 1 ? "#ffd27a" : "#bff7ff", mult > 1 ? 17 : 14);
    if (mult > 1) floatText(e.x, e.y + 8, "×" + fa(mult), "#ffb457", 12);
    SFX.vibrate(12);

    // احتمال افتادن جعبه
    if (!isBoss && Math.random() < 0.13) {
      game.pickups.push({
        kind: pick(["ammo", "repair", "shield", "cool"]),
        x: e.x, y: e.y, vy: rand(40, 70), r: 15, bob: rand(0, TAU), life: 13, t: 0
      });
    }
  }

  /* ------------------------------------------------------------------ *
   *  مأموریت
   * ------------------------------------------------------------------ */
  function nextMission(fromBoss) {
    game.mission++;
    game.missionKills = 0;
    game.quota = 12 + (game.mission - 1) * 4;
    game.missionBreak = 2.4;
    game.score += 250 + game.mission * 60;
    game.bossSpawned = false;
    game.hp = Math.min(game.maxHp, game.hp + 12);
    game.ammo = Math.min(game.maxAmmo, game.ammo + 90);
    game.heat = 0; game.heatLock = false;
    game.enemies.length = 0;
    game.ebullets.length = 0;
    if (fromBoss) {
      toast("ناوچهٔ مادر منهدم شد — عملیات " + fa(game.mission));
    } else {
      toast("عملیات " + fa(game.mission - 1) + " کامل شد — آماده‌باش");
    }
    SFX.pickup();
  }

  function updateMission(dt) {
    if (game.missionBreak > 0) {
      game.missionBreak -= dt;
      return;
    }
    if (game.bossKilled) {
      game.bossKilled = false;
      nextMission(true);
      return;
    }
    if (game.boss) {
      // در نبرد با ناوچه، مأموریت با انهدام آن تمام می‌شود
      return;
    }
    if (game.missionKills >= game.quota) {
      // هر چهار عملیات، نبرد پایانی با ناوچهٔ مادر
      if (game.mission % 4 === 0 && !game.bossSpawned) {
        game.bossSpawned = true;
        spawnBoss();
        return;
      }
      nextMission(false);
      return;
    }

    game.spawnT -= dt;
    if (game.spawnT <= 0) {
      var d = difficulty();
      var maxAlive = clamp(3 + Math.floor(game.mission * 0.9), 3, 9);
      if (game.enemies.filter(function (e) { return !e.dead; }).length < maxAlive) {
        spawnEnemy();
        if (Math.random() < 0.25) spawnEnemy();
      }
      game.spawnT = clamp(1.25 - d * 0.12, 0.42, 1.3) * rand(0.7, 1.25);
    }

    if (Math.random() < dt * 0.16) spawnPickup();
  }

  /* ------------------------------------------------------------------ *
   *  به‌روزرسانی
   * ------------------------------------------------------------------ */
  function updateDrone(dt) {
    var d = game.drone;
    var kx = (input.keys["arrowright"] || input.keys["d"] ? 1 : 0) - (input.keys["arrowleft"] || input.keys["a"] ? 1 : 0);
    var ky = (input.keys["arrowdown"] || input.keys["s"] ? 1 : 0) - (input.keys["arrowup"] || input.keys["w"] ? 1 : 0);

    if (kx || ky) {
      input.usingKeys = true;
      d.tx = clamp(d.tx + kx * 520 * dt, 26, W - 26);
      d.ty = clamp(d.ty + ky * 420 * dt, H * 0.3, H * 0.93);
    } else if (!input.usingKeys && (input.px || input.py)) {
      d.tx = clamp(input.px, 26, W - 26);
      d.ty = clamp(input.py - 26, H * 0.26, H * 0.94);
    }

    var prevX = d.x;
    var ease = input.down ? 9 : 13;
    d.x = lerp(d.x, d.tx, clamp(dt * ease, 0, 1));
    d.y = lerp(d.y, d.ty, clamp(dt * ease, 0, 1));
    d.x = clamp(d.x, 20, W - 20);
    d.y = clamp(d.y, H * 0.18, H - 24);

    var vx = (d.x - prevX) / Math.max(dt, 0.0001);
    d.bank = lerp(d.bank, clamp(vx / 620, -1, 1), clamp(dt * 7, 0, 1));
    d.bob += dt * 6;
    d.recoil = Math.max(0, d.recoil - dt * 7);
  }

  function updateBullets(dt) {
    var i, b, e, k;
    for (i = game.bullets.length - 1; i >= 0; i--) {
      b = game.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y < -30 || b.x < -30 || b.x > W + 30) {
        game.bullets.splice(i, 1);
        continue;
      }
      // برخورد
      for (k = 0; k < game.enemies.length; k++) {
        e = game.enemies[k];
        if (!e || e.dead || e.y < -e.r) continue;
        var rr = e.r + b.r;
        if (dist2(b.x, b.y, e.x, e.y) <= rr * rr) {
          e.hp -= 12;
          e.flash = 1;
          game.hits++;
          spawnParticle(b.x, b.y, { vx: rand(-40, 40), vy: rand(-20, 40), life: 0.22, r: 3, color: "#fff2c9" });
          game.bullets.splice(i, 1);
          if (e.hp <= 0) killEnemy(e, true);
          break;
        }
      }
    }

    // گلوله‌های دشمن
    for (i = game.ebullets.length - 1; i >= 0; i--) {
      b = game.ebullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0 || b.y > H + 40 || b.x < -40 || b.x > W + 40) {
        game.ebullets.splice(i, 1);
        continue;
      }
      var dr = game.drone;
      var rr2 = 16 + b.r;
      if (dist2(b.x, b.y, dr.x, dr.y) <= rr2 * rr2) {
        damageDrone(b.dmg);
        explode(b.x, b.y, 22, "#ff8a5c");
        game.ebullets.splice(i, 1);
      }
    }

    // موشک نقطه‌زن
    for (i = game.missiles.length - 1; i >= 0; i--) {
      var m = game.missiles[i];
      m.life -= dt;
      var tx = m.target && !m.target.dead ? m.target.x : m.x;
      var ty = m.target && !m.target.dead ? m.target.y : m.y - 500;
      var ang = Math.atan2(ty - m.y, tx - m.x);
      var cur = Math.atan2(m.vy, m.vx);
      var diff = ((ang - cur + Math.PI * 3) % TAU) - Math.PI;
      cur += clamp(diff, -6 * dt, 6 * dt);
      var sp = 620;
      m.vx = Math.cos(cur) * sp;
      m.vy = Math.sin(cur) * sp;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = 0.02;
        spawnParticle(m.x, m.y, { vx: rand(-20, 20), vy: rand(0, 30), life: 0.5, r: rand(2, 5), color: "#ffb457", drag: 0.94 });
      }
      if (m.y < -60 || m.life <= 0 || m.x < -60 || m.x > W + 60) {
        game.missiles.splice(i, 1);
        continue;
      }
      var hitSomething = false;
      for (k = 0; k < game.enemies.length; k++) {
        e = game.enemies[k];
        if (!e || e.dead || e.y < -e.r) continue;
        if (dist2(m.x, m.y, e.x, e.y) <= (e.r + 30) * (e.r + 30)) { hitSomething = true; break; }
      }
      if (hitSomething || !m.target || m.target.dead) {
        if (hitSomething) {
          // آسیب منطقه‌ای
          for (k = 0; k < game.enemies.length; k++) {
            e = game.enemies[k];
            if (!e || e.dead) continue;
            if (dist2(m.x, m.y, e.x, e.y) <= 125 * 125) {
              e.hp -= 180;
              e.flash = 1;
              if (e.hp <= 0) killEnemy(e, true);
            }
          }
          explode(m.x, m.y, 120, "#ffd27a");
          game.shake = 16;
          SFX.boom(true);
        }
        game.missiles.splice(i, 1);
      }
    }
  }

  function updateEnemies(dt) {
    var d = difficulty();
    for (var i = game.enemies.length - 1; i >= 0; i--) {
      var e = game.enemies[i];
      e.t += dt;
      e.flash = Math.max(0, e.flash - dt * 5);

      if (e.dead) { game.enemies.splice(i, 1); continue; }

      var dr = game.drone;

      if (e.isBoss) {
        if (!e.entered) {
          e.y += 60 * dt;
          if (e.y >= H * 0.2) { e.entered = true; e.y = H * 0.2; }
        } else {
          e.x += e.vx * dt;
          e.y = H * 0.2 + Math.sin(e.t * 0.9) * 22;
          if (e.x < e.r + 20) { e.x = e.r + 20; e.vx = Math.abs(e.vx); }
          if (e.x > W - e.r - 20) { e.x = W - e.r - 20; e.vx = -Math.abs(e.vx); }
        }
        e.fireCd -= dt;
        if (e.fireCd <= 0 && e.entered) {
          e.fireCd = e.fireRate;
          for (var s = -1; s <= 1; s++) {
            var a = Math.atan2(dr.y - e.y, dr.x - e.x) + s * 0.22;
            game.ebullets.push({
              x: e.x + s * 26, y: e.y + 30,
              vx: Math.cos(a) * 250, vy: Math.sin(a) * 250,
              r: 5, dmg: 9, life: 4, color: "#ff7a5c"
            });
          }
          SFX.shot(true);
        }
        // ناوچه خودش هم بالگرد رها می‌کند
        if (Math.random() < dt * 0.22) {
          var ce = {
            type: "helo", x: e.x + rand(-40, 40), y: e.y + 30, baseX: e.x,
            hp: Math.round(30 * d), maxHp: Math.round(30 * d), r: 22,
            vx: rand(-15, 15), baseVy: 60 * d, wobT: rand(0, TAU), wobSpeed: 1,
            wobAmp: 24, fireCd: rand(0.6, 1.6), fireRate: 2 / d, dmg: 6, t: 0,
            dead: false, flash: 0, scale: 0.95
          };
          game.enemies.push(ce);
        }
        continue;
      }

      // حرکت رو به پایین با شتاب پرسپکتیو
      var depth = clamp(e.y / H, 0, 1);
      var vy = e.baseVy * (0.55 + depth * 1.35);
      e.y += vy * dt;

      if (e.type === "kami") {
        // انتحاری: به سمت پهپاد کشیده می‌شود
        e.x += clamp(dr.x - e.x, -70, 70) * dt * 0.9;
        e.x = clamp(e.x, 12, W - 12);
      } else {
        e.wobT += dt * e.wobSpeed;
        e.baseX += e.vx * dt;
        if (e.baseX < W * 0.08) { e.baseX = W * 0.08; e.vx = Math.abs(e.vx); }
        if (e.baseX > W * 0.92) { e.baseX = W * 0.92; e.vx = -Math.abs(e.vx); }
        e.x = e.baseX + Math.sin(e.wobT) * e.wobAmp;
      }
      e.scale = 0.72 + depth * 0.55;

      // شلیک دشمن
      if (e.type !== "kami" && e.y > 0 && e.y < H * 0.72) {
        e.fireCd -= dt;
        if (e.fireCd <= 0) {
          e.fireCd = e.fireRate * rand(0.7, 1.35);
          var ang = Math.atan2(dr.y - e.y, dr.x - e.x) + rand(-0.09, 0.09);
          var spd = e.type === "heavy" ? 230 : 270;
          game.ebullets.push({
            x: e.x + rand(-8, 8), y: e.y + e.r * 0.8,
            vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd,
            r: e.type === "heavy" ? 4.5 : 3.4,
            dmg: e.dmg, life: 4,
            color: e.type === "heavy" ? "#ffb457" : "#ff7a5c"
          });
          SFX.shot(true);
        }
      }

      // برخورد با پهپاد (کوبیدن)
      if (dist2(e.x, e.y, dr.x, dr.y) < (e.r * e.scale + 16) * (e.r * e.scale + 16)) {
        damageDrone(e.isBoss ? 30 : e.type === "kami" ? 18 : 22);
        killEnemy(e, false);
        continue;
      }

      // فرار از منطقه
      if (e.y > H + e.r * 2) {
        game.enemies.splice(i, 1);
        game.escaped++;
        damageBase(e.type === "heavy" ? 18 : 10);
        toast("هدف فرار کرد — پایگاه آسیب دید");
      }
    }
  }

  function updatePickups(dt) {
    for (var i = game.pickups.length - 1; i >= 0; i--) {
      var p = game.pickups[i];
      p.t += dt;
      p.bob += dt * 3;
      p.y += p.vy * dt;
      p.life -= dt;
      var dr = game.drone;
      if (dist2(p.x, p.y, dr.x, dr.y) < (p.r + 16) * (p.r + 16)) {
        applyPickup(p);
        game.pickups.splice(i, 1);
        continue;
      }
      if (p.y > H + 40 || p.life <= 0) game.pickups.splice(i, 1);
    }
  }

  function applyPickup(p) {
    var d = PICKUPS[p.kind];
    if (p.kind === "ammo") {
      game.ammo = Math.min(game.maxAmmo, game.ammo + 70);
      floatText(p.x, p.y, "مهمات +۷۰", d.color, 14);
    } else if (p.kind === "repair") {
      game.hp = Math.min(game.maxHp, game.hp + 22);
      floatText(p.x, p.y, "تعمیر +۲۲", d.color, 14);
    } else if (p.kind === "shield") {
      game.shield = Math.min(70, game.shield + 40);
      floatText(p.x, p.y, "سپر فعال", d.color, 14);
    } else {
      game.heat = Math.max(0, game.heat - 55);
      game.heatLock = false;
      game.cool = 5;
      floatText(p.x, p.y, "خنک‌سازی", d.color, 14);
    }
    for (var i = 0; i < 12; i++) {
      var a = rand(0, TAU);
      spawnParticle(p.x, p.y, {
        vx: Math.cos(a) * rand(30, 110), vy: Math.sin(a) * rand(30, 110),
        life: rand(0.25, 0.6), r: rand(1.5, 3.5), color: d.color
      });
    }
    game.score += 40;
    SFX.pickup();
    SFX.vibrate(10);
  }

  function updateParticles(dt) {
    var arr = game.particles;
    for (var i = arr.length - 1; i >= 0; i--) {
      var p = arr[i];
      p.life -= dt;
      if (p.life <= 0) { arr.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += p.grav * dt;
      var dr = Math.pow(p.drag, dt * 60);
      p.vx *= dr; p.vy *= dr;
      if (p.kind === "smoke") p.r += dt * 16;
    }
    for (var j = game.texts.length - 1; j >= 0; j--) {
      var t = game.texts[j];
      t.life -= dt;
      t.y -= dt * 42;
      if (t.life <= 0) game.texts.splice(j, 1);
    }
  }

  function updateClouds(dt) {
    for (var i = 0; i < game.clouds.length; i++) {
      var c = game.clouds[i];
      c.y += c.sp * 34 * dt * (1 + game.drone.y / H);
      c.x -= game.drone.bank * 26 * dt;
      if (c.y > H + 160) {
        var nc = makeCloud(rand(-80, W + 80), -160);
        game.clouds[i] = nc;
      }
    }
  }

  function updateHudText() {
    var g = game;
    if (hudCache.score !== g.score) { hudCache.score = g.score; el.scoreVal.textContent = fa(g.score); }
    var hp = Math.max(0, Math.round(g.hp));
    if (hudCache.hp !== hp) {
      hudCache.hp = hp;
      el.hpTxt.textContent = fa(hp);
      el.hpBar.style.width = hp + "%";
      el.hpBarWrap.classList.toggle("low", hp <= 35);
    }
    if (hudCache.base !== g.baseHp) {
      hudCache.base = g.baseHp;
      el.baseTxt.textContent = fa(Math.round(g.baseHp)) + "٪";
    }
    var ammo = Math.max(0, g.ammo);
    if (hudCache.ammo !== ammo) {
      hudCache.ammo = ammo;
      el.ammoTxt.textContent = fa(ammo);
      el.ammoBar.style.width = (ammo / g.maxAmmo) * 100 + "%";
    }
    var heat = Math.round(g.heat);
    if (hudCache.heat !== heat) {
      hudCache.heat = heat;
      el.heatTxt.textContent = fa(heat) + "٪";
      el.heatBar.style.width = heat + "%";
      el.heatWrap.classList.toggle("hot", g.heatLock);
    }
    var sh = Math.round(g.shield);
    if (hudCache.shield !== sh) {
      hudCache.shield = sh;
      el.shieldTag.textContent = sh > 0 ? "سپر: " + fa(sh) : "سپر: خاموش";
      el.shieldTag.classList.toggle("on", sh > 0);
    }
    if (hudCache.mission !== g.mission) {
      hudCache.mission = g.mission;
      el.missionNo.textContent = fa(g.mission);
    }
    var mk = Math.min(g.missionKills, g.quota);
    if (hudCache.mk !== mk || hudCache.quota !== g.quota) {
      hudCache.mk = mk; hudCache.quota = g.quota;
      el.missionTxt.textContent = fa(mk) + " از " + fa(g.quota) + " هدف";
      el.missionBar.style.width = clamp((mk / g.quota) * 100, 0, 100) + "%";
    }
    if (hudCache.esc !== g.escaped) {
      hudCache.esc = g.escaped;
      el.escapedTxt.textContent = "فرار: " + fa(g.escaped);
    }
    var sp = Math.round(g.special);
    if (hudCache.special !== sp) {
      hudCache.special = sp;
      el.specialFill.style.width = sp + "%";
      el.specialBtn.classList.toggle("ready", sp >= 100);
      el.specialBtn.disabled = sp < 100;
    }
    var combo = g.comboT > 0 ? clamp(1 + Math.floor(g.combo / 3), 1, 6) : 0;
    if (hudCache.combo !== combo) {
      hudCache.combo = combo;
      el.comboVal.textContent = combo > 1 ? "زنجیره ×" + fa(combo) : "";
    }
  }

  function update(dt) {
    game.time += dt;
    game.shake = Math.max(0, game.shake - dt * 34);
    game.hitFlash = Math.max(0, game.hitFlash - dt * 1.6);
    game.flash = Math.max(0, game.flash - dt * 2);

    if (game.comboT > 0) {
      game.comboT -= dt;
      if (game.comboT <= 0) game.combo = 0;
    }
    if (game.cool > 0) game.cool -= dt;
    if (game.special < 100) game.special = Math.min(100, game.special + dt * 1.35);

    updateDrone(dt);
    playerShoot(dt);
    updateBullets(dt);
    updateEnemies(dt);
    updatePickups(dt);
    updateParticles(dt);
    updateClouds(dt);
    updateMission(dt);

    // خنک‌شدن اسلحه
    var coolRate = game.cool > 0 ? 78 : 26;
    game.heat = Math.max(0, game.heat - coolRate * dt);
    if (game.heatLock && game.heat < 42) game.heatLock = false;

    // مهمات خودکار
    if (game.ammo < 40 && Math.random() < dt * 0.4) {
      // فقط اطلاع‌رسانی، نه شارژ خودکار
    }
    if (game.ammo <= 0 && !hudCache.noAmmoToast) {
      hudCache.noAmmoToast = true;
      toast("مهمات تمام شد — جعبهٔ مهمات را بگیرید");
    }
    if (game.ammo > 5) hudCache.noAmmoToast = false;

    updateHudText();
  }

  /* ------------------------------------------------------------------ *
   *  رسم
   * ------------------------------------------------------------------ */
  function drawBackground(dt) {
    ctx.drawImage(skyCanvas, 0, 0, skyW, skyH, 0, 0, W, H);

    // ستاره‌ها
    for (var i = 0; i < game.stars.length; i++) {
      var s = game.stars[i];
      var tw = 0.6 + Math.sin(game.time * s.tw + i) * 0.4;
      ctx.globalAlpha = s.a * tw * 0.8;
      ctx.fillStyle = "#cfefff";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // ابرهای لایه‌ای
    for (var c = 0; c < game.clouds.length; c++) {
      var cl = game.clouds[c];
      ctx.globalAlpha = cl.a;
      ctx.fillStyle = "#d9f1ff";
      ctx.beginPath();
      for (var p = 0; p < cl.puffs.length; p++) {
        var pf = cl.puffs[p];
        ctx.moveTo(cl.x + pf.dx + pf.r, cl.y + pf.dy);
        ctx.arc(cl.x + pf.dx, cl.y + pf.dy, pf.r, 0, TAU);
      }
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // خطوط سرعت برای حس پرواز
    ctx.save();
    ctx.strokeStyle = "rgba(190, 235, 255, 0.13)";
    ctx.lineWidth = 1;
    var streakN = 16;
    for (var k = 0; k < streakN; k++) {
      var t = (game.time * (0.5 + k * 0.03) + k * 0.37) % 1;
      var x = ((k * 137.5) % W);
      var y = H * 0.55 + t * H * 0.75;
      var len = 22 + ((k * 13) % 40);
      ctx.globalAlpha = 0.25 * (1 - t);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x, y + len);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawDrone() {
    var d = game.drone;
    var bob = Math.sin(d.bob) * 1.6;
    ctx.save();
    ctx.translate(d.x, d.y + bob);
    ctx.rotate(d.bank * 0.2);

    // هالهٔ موتور
    var glow = ctx.createRadialGradient(0, 4, 2, 0, 4, 58);
    glow.addColorStop(0, "rgba(80, 230, 220, 0.26)");
    glow.addColorStop(1, "rgba(80, 230, 220, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 4, 58, 0, TAU);
    ctx.fill();

    // بال‌های کشیده و باریک
    var wing = ctx.createLinearGradient(0, -6, 0, 12);
    wing.addColorStop(0, "#2b4250");
    wing.addColorStop(1, "#0c1920");
    ctx.fillStyle = wing;
    ctx.strokeStyle = "rgba(120, 240, 230, 0.6)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(-7, -4);
    ctx.lineTo(-68, 12);
    ctx.lineTo(-64, 17);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(7, -4);
    ctx.lineTo(68, 12);
    ctx.lineTo(64, 17);
    ctx.lineTo(7, 8);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // دُم V شکل
    ctx.fillStyle = "#12222b";
    ctx.beginPath();
    ctx.moveTo(-5, 16); ctx.lineTo(-19, 30); ctx.lineTo(-13, 32); ctx.lineTo(0, 22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(5, 16); ctx.lineTo(19, 30); ctx.lineTo(13, 32); ctx.lineTo(0, 22);
    ctx.closePath();
    ctx.fill(); ctx.stroke();

    // بدنهٔ کشیده
    var body = ctx.createLinearGradient(0, -34, 0, 26);
    body.addColorStop(0, "#4a6a78");
    body.addColorStop(0.4, "#21363f");
    body.addColorStop(1, "#0a151b");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(0, -34);
    ctx.quadraticCurveTo(7, -22, 8, 2);
    ctx.quadraticCurveTo(8, 18, 0, 24);
    ctx.quadraticCurveTo(-8, 18, -8, 2);
    ctx.quadraticCurveTo(-7, -22, 0, -34);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(150, 250, 240, 0.85)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // سنسور دماغه
    ctx.fillStyle = "rgba(160, 250, 245, 0.9)";
    ctx.beginPath();
    ctx.arc(0, -27, 3.2, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.75)";
    ctx.beginPath();
    ctx.arc(-1, -28, 1.1, 0, TAU);
    ctx.fill();

    // خط بدنه
    ctx.strokeStyle = "rgba(120, 240, 230, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -20);
    ctx.lineTo(0, 16);
    ctx.stroke();

    // پرهٔ ملخ (محو)
    var pr = 13 + Math.sin(game.time * 40) * 1.5;
    ctx.strokeStyle = "rgba(190, 255, 250, 0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(0, 20, pr, 3, 0, 0, TAU);
    ctx.stroke();

    // شعلهٔ خروجی / پس‌سوز
    var flame = 9 + Math.sin(game.time * 32) * 3 + d.recoil * 5;
    var fg = ctx.createLinearGradient(0, 22, 0, 22 + flame * 2.2);
    fg.addColorStop(0, "rgba(140, 245, 255, 0.85)");
    fg.addColorStop(1, "rgba(120, 240, 255, 0)");
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.moveTo(-3.5, 24); ctx.lineTo(3.5, 24); ctx.lineTo(0, 24 + flame * 2.2);
    ctx.closePath(); ctx.fill();

    // سپر
    if (game.shield > 0) {
      ctx.strokeStyle = "rgba(157, 139, 255, " + (0.35 + Math.sin(game.time * 5) * 0.15) + ")";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, 0, 40, 0, TAU);
      ctx.stroke();
    }

    ctx.restore();
  }

  function enemyColor(e) {
    if (e.isBoss) return "#ffcf7a";
    if (e.type === "jet") return "#7fe0ff";
    if (e.type === "heavy") return "#ffd27a";
    if (e.type === "kami") return "#ff7a6b";
    return "#ffa06b";
  }

  function drawEnemy(e) {
    var s = e.scale;
    ctx.save();
    ctx.translate(e.x, e.y);
    ctx.scale(s, s);
    var col = enemyColor(e);

    // هاله
    var g = ctx.createRadialGradient(0, 0, 2, 0, 0, e.r * 1.9);
    g.addColorStop(0, "rgba(255, 150, 90, 0.16)");
    g.addColorStop(1, "rgba(255, 150, 90, 0)");
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, e.r * 1.9, 0, TAU); ctx.fill();

    ctx.strokeStyle = e.flash > 0.1 ? "#ffffff" : col;
    ctx.lineWidth = 1.7;
    ctx.fillStyle = "rgba(12, 22, 28, 0.94)";

    if (e.isBoss) {
      drawBoss(e);
      ctx.restore();
      return;
    }

    if (e.type === "helo") {
      // بدنه
      ctx.beginPath();
      ctx.ellipse(0, 0, 13, 19, 0, 0, TAU);
      ctx.fill(); ctx.stroke();
      // دم
      ctx.beginPath();
      ctx.moveTo(0, 14); ctx.lineTo(-4, 30); ctx.lineTo(4, 30);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // روتور
      var rr = 24 + Math.sin(game.time * 30) * 2;
      ctx.strokeStyle = "rgba(255, 220, 180, 0.5)";
      ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(0, -4, rr, 4.5, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(0, -4, 4.5, rr * 0.35, 0, 0, TAU); ctx.stroke();
      // کابین
      ctx.fillStyle = "rgba(255, 170, 120, 0.35)";
      ctx.beginPath(); ctx.ellipse(0, 8, 7, 5, 0, 0, TAU); ctx.fill();
      // چراغ
      ctx.fillStyle = Math.sin(game.time * 9 + e.wobT) > 0 ? "#ff5d5d" : "#5a2020";
      ctx.beginPath(); ctx.arc(0, 27, 2.2, 0, TAU); ctx.fill();
    } else if (e.type === "jet") {
      ctx.beginPath();
      ctx.moveTo(0, -20);
      ctx.lineTo(7, -2);
      ctx.lineTo(24, 12);
      ctx.lineTo(6, 10);
      ctx.lineTo(0, 20);
      ctx.lineTo(-6, 10);
      ctx.lineTo(-24, 12);
      ctx.lineTo(-7, -2);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(140, 230, 255, 0.5)";
      ctx.beginPath(); ctx.ellipse(0, -8, 3, 5, 0, 0, TAU); ctx.fill();
      // شعله
      ctx.fillStyle = "rgba(120, 220, 255, 0.45)";
      ctx.beginPath();
      ctx.moveTo(-4, -18); ctx.lineTo(4, -18); ctx.lineTo(0, -30 - Math.random() * 6);
      ctx.closePath(); ctx.fill();
    } else if (e.type === "heavy") {
      ctx.beginPath();
      ctx.moveTo(0, -30);
      ctx.lineTo(22, -8);
      ctx.lineTo(20, 18);
      ctx.lineTo(8, 30);
      ctx.lineTo(-8, 30);
      ctx.lineTo(-20, 18);
      ctx.lineTo(-22, -8);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      // دو روتور
      ctx.strokeStyle = "rgba(255, 220, 180, 0.45)";
      ctx.beginPath(); ctx.ellipse(-20, -6, 18, 4, 0, 0, TAU); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(20, -6, 18, 4, 0, 0, TAU); ctx.stroke();
      // هسته
      var core = ctx.createRadialGradient(0, 6, 1, 0, 6, 12);
      core.addColorStop(0, "rgba(255, 190, 110, 0.9)");
      core.addColorStop(1, "rgba(255, 140, 60, 0)");
      ctx.fillStyle = core;
      ctx.beginPath(); ctx.arc(0, 6, 12, 0, TAU); ctx.fill();
    } else {
      // انتحاری: بال مثلثی
      ctx.beginPath();
      ctx.moveTo(0, -18);
      ctx.lineTo(18, 16);
      ctx.lineTo(0, 10);
      ctx.lineTo(-18, 16);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
      ctx.fillStyle = "rgba(255, 90, 70, 0.85)";
      ctx.beginPath(); ctx.arc(0, 2, 3.4, 0, TAU); ctx.fill();
    }

    // نوار جان
    if (e.hp < e.maxHp) {
      var w = e.r * 1.8;
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(-w / 2, -e.r - 12, w, 3);
      ctx.fillStyle = col;
      ctx.fillRect(-w / 2, -e.r - 12, w * (e.hp / e.maxHp), 3);
    }

    ctx.restore();
  }

  function drawBoss(e) {
    // بدنهٔ بزرگ ناوچه
    var g = ctx.createLinearGradient(0, -50, 0, 50);
    g.addColorStop(0, "#2a3f4c");
    g.addColorStop(1, "#0b151c");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, -58);
    ctx.lineTo(46, -26);
    ctx.lineTo(58, 20);
    ctx.lineTo(30, 46);
    ctx.lineTo(-30, 46);
    ctx.lineTo(-58, 20);
    ctx.lineTo(-46, -26);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = e.flash > 0.1 ? "#fff" : "#ffcf7a";
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // روتورها
    ctx.strokeStyle = "rgba(255, 220, 170, 0.35)";
    ctx.lineWidth = 2;
    for (var i = -1; i <= 1; i++) {
      if (!i) continue;
      ctx.beginPath(); ctx.ellipse(i * 38, -30, 26, 6, 0, 0, TAU); ctx.stroke();
    }

    // هستهٔ درخشان
    var core = ctx.createRadialGradient(0, 6, 2, 0, 6, 30);
    core.addColorStop(0, "rgba(255, 210, 140, 0.95)");
    core.addColorStop(0.4, "rgba(255, 110, 60, 0.5)");
    core.addColorStop(1, "rgba(255, 110, 60, 0)");
    ctx.fillStyle = core;
    ctx.beginPath(); ctx.arc(0, 6, 30, 0, TAU); ctx.fill();

    ctx.fillStyle = "rgba(120, 240, 235, 0.75)";
    ctx.beginPath(); ctx.ellipse(0, 26, 10, 5, 0, 0, TAU); ctx.fill();

    // نوار جان
    var w = 120;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(-w / 2, -78, w, 5);
    ctx.fillStyle = "#ffcf7a";
    ctx.fillRect(-w / 2, -78, w * clamp(e.hp / e.maxHp, 0, 1), 5);
  }

  function drawPickup(p) {
    var d = PICKUPS[p.kind];
    ctx.save();
    ctx.translate(p.x, p.y + Math.sin(p.bob) * 3);
    var pulse = 0.7 + Math.sin(p.t * 4) * 0.3;
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = d.color;
    ctx.fillStyle = "rgba(8, 20, 26, 0.9)";
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(0, 0, p.r, 0, TAU);
    ctx.fill(); ctx.stroke();

    ctx.globalAlpha = 0.25 + pulse * 0.2;
    ctx.beginPath(); ctx.arc(0, 0, p.r + 7, 0, TAU); ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    ctx.lineWidth = 2;
    if (p.kind === "ammo") {
      for (var i = -1; i <= 1; i++) {
        ctx.fillRect(i * 5 - 1.5, -6, 3, 12);
      }
    } else if (p.kind === "repair") {
      ctx.fillRect(-2, -8, 4, 16);
      ctx.fillRect(-8, -2, 16, 4);
    } else if (p.kind === "shield") {
      ctx.beginPath();
      ctx.moveTo(0, -9);
      ctx.lineTo(8, -5);
      ctx.lineTo(8, 3);
      ctx.quadraticCurveTo(8, 8, 0, 11);
      ctx.quadraticCurveTo(-8, 8, -8, 3);
      ctx.lineTo(-8, -5);
      ctx.closePath();
      ctx.stroke();
    } else {
      for (var a = 0; a < 3; a++) {
        var ang = (a * Math.PI) / 3;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * -8, Math.sin(ang) * -8);
        ctx.lineTo(Math.cos(ang) * 8, Math.sin(ang) * 8);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawBullets() {
    // گلوله‌های بازیکن
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (var i = 0; i < game.bullets.length; i++) {
      var b = game.bullets[i];
      var grd = ctx.createLinearGradient(b.x, b.y, b.x, b.y + 26);
      grd.addColorStop(0, "rgba(180, 255, 250, 0.95)");
      grd.addColorStop(1, "rgba(90, 200, 255, 0)");
      ctx.fillStyle = grd;
      ctx.fillRect(b.x - 1.6, b.y, 3.2, 24);
      ctx.fillStyle = "#eaffff";
      ctx.beginPath();
      ctx.arc(b.x, b.y, 2.2, 0, TAU);
      ctx.fill();
    }
    // گلوله‌های دشمن
    for (var j = 0; j < game.ebullets.length; j++) {
      var e = game.ebullets[j];
      var g2 = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 4);
      g2.addColorStop(0, "#fff2d0");
      g2.addColorStop(0.35, "rgba(255, 120, 80, 0.85)");
      g2.addColorStop(1, "rgba(255, 80, 50, 0)");
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.arc(e.x, e.y, e.r * 4, 0, TAU);
      ctx.fill();
    }
    // موشک‌ها
    for (var k = 0; k < game.missiles.length; k++) {
      var m = game.missiles[k];
      var g3 = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, 22);
      g3.addColorStop(0, "#fff");
      g3.addColorStop(0.4, "rgba(255, 190, 100, 0.85)");
      g3.addColorStop(1, "rgba(255, 140, 60, 0)");
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(m.x, m.y, 22, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawParticles() {
    ctx.save();
    for (var i = 0; i < game.particles.length; i++) {
      var p = game.particles[i];
      var k = clamp(p.life / p.max, 0, 1);
      if (p.kind === "ring") {
        ctx.globalAlpha = k * 0.8;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3 * k + 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (1 + (1 - k) * 2.4), 0, TAU);
        ctx.stroke();
      } else if (p.kind === "shieldRing") {
        ctx.globalAlpha = k;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 4 * k;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 38 + (1 - k) * 16, 0, TAU);
        ctx.stroke();
      } else if (p.kind === "smoke") {
        ctx.globalAlpha = k * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, TAU);
        ctx.fill();
      } else {
        ctx.globalAlpha = k;
        ctx.fillStyle = p.color;
        if (p.glow) {
          ctx.shadowBlur = 12;
          ctx.shadowColor = p.color;
        }
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r * (0.4 + k * 0.8), 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
    ctx.restore();
  }

  function drawTexts() {
    ctx.save();
    ctx.textAlign = "center";
    for (var i = 0; i < game.texts.length; i++) {
      var t = game.texts[i];
      var k = t.life / t.max;
      ctx.globalAlpha = clamp(k * 1.4, 0, 1);
      ctx.font = "800 " + t.size + "px " + FONT;
      ctx.fillStyle = t.color;
      ctx.shadowBlur = 10;
      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.fillText(t.text, t.x, t.y);
    }
    ctx.restore();
  }

  function drawLock() {
    // نشانگر هدف نزدیک (کمک نشانه‌گیری)
    var best = null, bd = Infinity;
    var d = game.drone;
    for (var i = 0; i < game.enemies.length; i++) {
      var e = game.enemies[i];
      if (e.dead || e.y < e.r) continue;
      var dx = Math.abs(e.x - d.x);
      if (dx < bd && e.y < d.y) { bd = dx; best = e; }
    }
    game.locked = best;
    if (!best) return;

    var r = best.r * best.scale + 12;
    var t = game.time * 2;
    ctx.save();
    ctx.strokeStyle = "rgba(255, 220, 160, " + (0.55 + Math.sin(t * 3) * 0.2) + ")";
    ctx.lineWidth = 1.6;
    var arm = r * 0.45;
    var corners = [[-1, -1], [1, -1], [-1, 1], [1, 1]];
    for (var c = 0; c < 4; c++) {
      var sx = corners[c][0], sy = corners[c][1];
      ctx.beginPath();
      ctx.moveTo(best.x + sx * r, best.y + sy * r - sy * arm);
      ctx.lineTo(best.x + sx * r, best.y + sy * r);
      ctx.lineTo(best.x + sx * r - sx * arm, best.y + sy * r);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawVignetteFx() {
    if (game.hitFlash > 0.01) {
      var g = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.82);
      g.addColorStop(0, "rgba(255, 40, 40, 0)");
      g.addColorStop(1, "rgba(255, 30, 30, " + game.hitFlash * 0.75 + ")");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    if (game.shield > 0) {
      var s = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, H * 0.95);
      s.addColorStop(0, "rgba(140, 120, 255, 0)");
      s.addColorStop(1, "rgba(140, 120, 255, " + (0.08 + Math.sin(game.time * 3) * 0.03) + ")");
      ctx.fillStyle = s;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function render(dt) {
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);

    var sx = 0, sy = 0;
    if (game.shake > 0.2) {
      sx = rand(-game.shake, game.shake) * 0.5;
      sy = rand(-game.shake, game.shake) * 0.5;
    }
    ctx.save();
    ctx.translate(sx, sy);

    drawBackground(dt);

    // مرتب‌سازی عمق: دوردست‌ها کوچک‌تر
    var list = game.enemies.slice().sort(function (a, b) { return a.y - b.y; });

    for (var i = 0; i < game.pickups.length; i++) drawPickup(game.pickups[i]);
    for (var p = 0; p < list.length; p++) {
      if (list[p].y > game.drone.y + 40) continue;
      drawEnemy(list[p]);
    }

    drawDrone();

    for (var q = 0; q < list.length; q++) {
      if (list[q].y <= game.drone.y + 40) continue;
      drawEnemy(list[q]);
    }

    drawBullets();
    drawLock();
    drawParticles();
    drawTexts();
    drawVignetteFx();

    ctx.restore();
  }

  /* ------------------------------------------------------------------ *
   *  حلقهٔ بازی
   * ------------------------------------------------------------------ */
  var last = 0;

  function frame(ts) {
    requestAnimationFrame(frame);
    if (!game) { game = newGame(); buildClouds(); resize(); return; }
    var dt = last ? (ts - last) / 1000 : 0.016;
    last = ts;
    dt = clamp(dt, 0, 0.05);

    if (game.mode === "play") {
      update(dt);
    } else {
      // پس‌زمینهٔ زنده در منو/توقف
      game.time += dt * 0.6;
      game.shake = Math.max(0, game.shake - dt * 20);
      game.hitFlash = Math.max(0, game.hitFlash - dt * 1.6);
      game.drone && updateClouds(dt);
      if (game.mode === "menu") {
        updateDroneIdle(dt);
      }
      updateParticles(dt);
    }
    render(dt);
  }

  function updateDroneIdle(dt) {
    var d = game.drone;
    d.bob += dt * 4;
    d.x = lerp(d.x, W * 0.5, dt * 1.2);
    d.y = lerp(d.y, H * 0.72, dt * 1.2);
    d.bank = lerp(d.bank, Math.sin(game.time * 0.7) * 0.5, dt * 2);
  }

  /* ------------------------------------------------------------------ *
   *  جریان بازی
   * ------------------------------------------------------------------ */
  var toastTimer = 0;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.toast.classList.remove("show"); }, 2200);
  }

  function show(screen) {
    [el.screenMenu, el.screenHelp, el.screenPause, el.screenOver].forEach(function (s) {
      if (s) s.classList.add("hidden");
    });
    if (screen) screen.classList.remove("hidden");
  }

  function startGame() {
    SFX.unlock();
    var best = game ? game.best : 0;
    game = newGame();
    game.best = best;
    buildClouds();
    resize();
    game.mode = "play";
    game.drone.x = W / 2; game.drone.tx = W / 2;
    game.drone.y = H * 0.82; game.drone.ty = H * 0.82;
    hudCache = {};
    show(null);
    el.hud.classList.remove("hidden");
    el.specialBtn.disabled = true;
    el.hints.classList.remove("fade");
    setTimeout(function () { if (el.hints) el.hints.classList.add("fade"); }, 9000);
    SFX.muteEngine(false);
    setTimeout(function () { if (game && game.mode === "play") toast("عملیات ۱ — از پایگاه دفاع کنید"); }, 300);
  }

  function pauseGame() {
    if (!game || game.mode !== "play") return;
    game.mode = "pause";
    input.down = false;
    SFX.muteEngine(true);
    show(el.screenPause);
  }

  function resumeGame() {
    if (!game || game.mode !== "pause") return;
    game.mode = "play";
    last = 0;
    SFX.muteEngine(false);
    show(null);
  }

  function toMenu() {
    if (!game) return;
    game.mode = "menu";
    input.down = false;
    SFX.muteEngine(true);
    el.hud.classList.add("hidden");
    el.bestMenu.textContent = fa(game.best || 0);
    show(el.screenMenu);
  }

  function gameOver(reason, title) {
    if (!game || game.mode === "over") return;
    game.mode = "over";
    input.down = false;
    SFX.boom(true);
    SFX.muteEngine(true);
    SFX.vibrate([40, 60, 120]);
    explode(game.drone.x, game.drone.y, 150, "#ff9a5c");
    game.shake = 26;

    if (game.score > game.best) {
      game.best = game.score;
      localStorage.setItem("shahed-best", game.best);
    }
    var acc = game.shots ? Math.round((game.hits / game.shots) * 100) : 0;

    el.overTitle.textContent = title || "عملیات پایان یافت";
    el.overReason.textContent = reason || "پهپاد سرنگون شد.";
    el.statScore.textContent = fa(game.score);
    el.statBest.textContent = fa(game.best);
    el.statKills.textContent = fa(game.kills);
    el.statAcc.textContent = fa(acc) + "٪";
    el.statMission.textContent = fa(game.mission);
    el.bestMenu.textContent = fa(game.best);

    setTimeout(function () {
      if (game && game.mode === "over") show(el.screenOver);
    }, 700);
  }

  /* ------------------------------------------------------------------ *
   *  اتصال دکمه‌ها
   * ------------------------------------------------------------------ */
  function toggleSound() {
    var on = !SFX.isEnabled();
    SFX.setEnabled(on);
    if (on) SFX.unlock();
    el.btnMute.textContent = on ? "🔊" : "🔇";
    var b = $("btnSound");
    if (b) b.textContent = "صدا: " + (on ? "روشن" : "خاموش");
    if (on) SFX.ui();
  }

  $("btnStart").addEventListener("click", function () { SFX.ui(); startGame(); });
  $("btnHelp").addEventListener("click", function () { SFX.ui(); el.screenHelp.classList.remove("hidden"); });
  $("btnHelpClose").addEventListener("click", function () { SFX.ui(); el.screenHelp.classList.add("hidden"); });
  $("btnSound").addEventListener("click", toggleSound);
  $("btnResume").addEventListener("click", function () { SFX.ui(); resumeGame(); });
  $("btnRestart").addEventListener("click", function () { SFX.ui(); startGame(); });
  $("btnMenu").addEventListener("click", function () { SFX.ui(); toMenu(); });
  $("btnAgain").addEventListener("click", function () { SFX.ui(); startGame(); });
  $("btnHome").addEventListener("click", function () { SFX.ui(); toMenu(); });
  el.specialBtn.addEventListener("click", function (e) { e.stopPropagation(); fireSpecial(); });
  el.btnPause.addEventListener("click", function () {
    if (!game) return;
    if (game.mode === "play") pauseGame();
    else if (game.mode === "pause") resumeGame();
  });
  el.btnMute.addEventListener("click", toggleSound);
  el.btnFull.addEventListener("click", function () {
    var f = document.getElementById("frame");
    if (!document.fullscreenElement) {
      (f.requestFullscreen ? f.requestFullscreen() : Promise.reject()).catch(function () {});
    } else {
      document.exitFullscreen && document.exitFullscreen();
    }
  });

  ["mouseenter", "focus"].forEach(function (ev) {
    document.querySelectorAll(".btn").forEach(function (b) {
      b.addEventListener(ev, function () { SFX.ui(); });
    });
  });

  /* ------------------------------------------------------------------ *
   *  شروع
   * ------------------------------------------------------------------ */
  game = newGame();
  buildClouds();
  resize();
  if (window.ResizeObserver) {
    var rzT = 0;
    new ResizeObserver(function () {
      clearTimeout(rzT);
      rzT = setTimeout(resize, 120);
    }).observe(stage);
  } else {
    window.addEventListener("resize", resize);
  }
  window.addEventListener("orientationchange", function () {
    setTimeout(resize, 250);
  });

  el.bestMenu.textContent = fa(game.best);
  el.hud.classList.add("hidden");
  show(el.screenMenu);

  requestAnimationFrame(frame);
})();
