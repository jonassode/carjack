// Carjack - bootstrap: fixed timestep loop, entity wiring, enter/exit glue.
window.CJ = window.CJ || {};

(function () {
  'use strict';

  var C = CJ.CFG;
  var M = CJ.M;

  var canvas, ctx, dpr = 1;
  var world = CJ.World;
  var cam = CJ.Camera;

  var player = null;
  var cars = [];
  var particles = [];
  var graceCar = null;
  var exitGrace = 0;

  var acc = 0;
  var lastTime = 0;
  var fps = 60, fpsAcc = 0, fpsFrames = 0;
  var paused = false;
  var debug = false;

  // ------------------------------------------------------------------ setup
  function resize() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    var w = Math.max(320, window.innerWidth);
    var h = Math.max(240, window.innerHeight);
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    cam.setViewport(w, h);
  }

  function reset() {
    CJ.Bullets.clear();
    CJ.Blood.clear();
    particles.length = 0;
    graceCar = null;
    exitGrace = 0;
    paused = false;

    cars = world.carSpawns.map(function (spawn, i) {
      return new CJ.Car({
        x: spawn.x,
        y: spawn.y,
        h: spawn.h,
        color: C.CAR_COLORS[i % C.CAR_COLORS.length]
      });
    });

    player = new CJ.Player(world.playerSpawn.x, world.playerSpawn.y);
    player.collide(world);
    CJ.Peds.reset();
    cam.setTarget(player, true);
    CJ.Input.clearAll();
  }

  function init() {
    canvas = document.getElementById('game');
    ctx = canvas.getContext('2d', { alpha: false });

    world.init(CJ.MAP_CITY);
    CJ.Peds.init(world, CJ.MAP_CITY);
    CJ.Input.init(canvas);
    CJ.HUD.init();
    resize();

    window.addEventListener('resize', resize);
    reset();

    lastTime = performance.now();
    requestAnimationFrame(frame);
  }

  // ------------------------------------------------------------------ cars
  function nearestCar() {
    var best = null;
    var bestD = C.ENTER_RANGE;
    for (var i = 0; i < cars.length; i++) {
      var d = M.dist(player.x, player.y, cars[i].x, cars[i].y);
      if (d < bestD) { bestD = d; best = cars[i]; }
    }
    return best;
  }

  function enterCar(car) {
    car.driver = player;
    player.driving = car;
    player.vx = 0;
    player.vy = 0;
    cam.setTarget(car);
  }

  function exitCar() {
    var car = player.driving;
    if (!car) return;

    var cosH = Math.cos(car.heading);
    var sinH = Math.sin(car.heading);
    var side = C.EXIT_OFFSET;
    var back = C.CAR_LEN / 2 + C.P_RADIUS + 6;

    // Right, then left, then directly behind / in front; take the first clear spot.
    var spots = [
      { x: car.x - sinH * side, y: car.y + cosH * side },
      { x: car.x + sinH * side, y: car.y - cosH * side },
      { x: car.x - cosH * back, y: car.y - sinH * back },
      { x: car.x + cosH * back, y: car.y + sinH * back }
    ];

    var spot = spots[0];
    for (var i = 0; i < spots.length; i++) {
      if (!world.isSolidAt(spots[i].x, spots[i].y, C.P_RADIUS + 2)) { spot = spots[i]; break; }
    }

    player.x = spot.x;
    player.y = spot.y;
    player.vx = 0;
    player.vy = 0;
    player.collide(world);

    car.driver = null;
    player.driving = null;
    player.face = car.heading;
    player.aim = car.heading;

    graceCar = car;
    exitGrace = C.EXIT_GRACE;
    cam.setTarget(player);
  }

  function destroyCar(car) {
    var idx = cars.indexOf(car);
    if (idx === -1) return;
    if (player.driving === car) {
      player.driving = null;
      car.driver = null;
      player.x = car.x;
      player.y = car.y;
      player.collide(world);
      cam.setTarget(player);
    }
    cars.splice(idx, 1);
    spawnBurst(car.x, car.y, 26, ['#ffd25c', '#ff8a3d', '#ff4a2f', '#6b6f75']);
    cam.shake(12);
  }

  function onHitCar(car, x, y) {
    car.hp -= C.B_DAMAGE;
    spawnSparks(x, y, 4);
    if (car.hp <= 0) destroyCar(car);
  }

  // ------------------------------------------------------------------ particles
  function spawnParticle(x, y, vx, vy, life, color, size) {
    if (particles.length > 320) particles.shift();
    particles.push({ x: x, y: y, vx: vx, vy: vy, life: life, max: life, color: color, size: size });
  }

  function spawnSparks(x, y, n) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 40 + Math.random() * 150;
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.15 + Math.random() * 0.2, i % 2 ? '#ffe27a' : '#ffb347', 1.6 + Math.random());
    }
  }

  function spawnBurst(x, y, n, colors) {
    for (var i = 0; i < n; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 30 + Math.random() * 220;
      spawnParticle(x, y, Math.cos(a) * s, Math.sin(a) * s,
        0.35 + Math.random() * 0.55, colors[i % colors.length], 2 + Math.random() * 3);
    }
  }

  function updateParticles(dt) {
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-4 * dt);
      p.vy *= Math.exp(-4 * dt);
    }
  }

  function drawParticles(c) {
    for (var i = 0; i < particles.length; i++) {
      var p = particles[i];
      c.globalAlpha = Math.max(0, Math.min(1, p.life / p.max));
      c.fillStyle = p.color;
      c.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    c.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ collisions
  // Cars are capsules (three circles each), so test every circle pair and
  // resolve the deepest overlap. A single centre circle lets noses and tails
  // visually sink into each other.
  function collideCars() {
    var a, b, i, j, pass, ca, cb, res, deepest, dx, dy;

    for (a = 0; a < cars.length; a++) {
      for (b = a + 1; b < cars.length; b++) {
        for (pass = 0; pass < 2; pass++) {
          ca = cars[a].bodyCircles();
          cb = cars[b].bodyCircles();
          deepest = null;

          for (i = 0; i < ca.length; i++) {
            for (j = 0; j < cb.length; j++) {
              res = M.circleVsCircle(ca[i].x, ca[i].y, ca[i].r, cb[j].x, cb[j].y, cb[j].r);
              if (res && (!deepest || res.depth > deepest.depth)) deepest = res;
            }
          }
          if (!deepest) break;

          dx = deepest.nx * deepest.depth * 0.5;
          dy = deepest.ny * deepest.depth * 0.5;
          cars[a].x += dx; cars[a].y += dy;
          cars[b].x -= dx; cars[b].y -= dy;

          M.cancelInto(cars[a], deepest.nx, deepest.ny);
          M.cancelInto(cars[b], -deepest.nx, -deepest.ny);
        }
      }
    }
  }

  // The parked car you just stepped out of must not shove you around.
  function collidePlayerCars() {
    if (player.driving) return;
    for (var i = 0; i < cars.length; i++) {
      var car = cars[i];
      if (exitGrace > 0 && car === graceCar) continue;

      var circles = car.bodyCircles();
      for (var k = 0; k < circles.length; k++) {
        var res = M.circleVsCircle(player.x, player.y, player.radius,
          circles[k].x, circles[k].y, circles[k].r);
        if (res) {
          player.x += res.nx * res.depth;
          player.y += res.ny * res.depth;
          M.cancelInto(player, res.nx, res.ny);
        }
      }
    }
  }

  // ------------------------------------------------------------------ shooting
  function fire() {
    var m = player.muzzle();
    CJ.Bullets.spawn(m.x, m.y, player.aim, player);
    player.fireCd = C.P_FIRE_CD;
    player.recoil = 1;
    cam.shake(1.8);
  }

  function onHitPed(ped, x, y) {
    if (!ped.kill(Math.cos(player.aim), Math.sin(player.aim))) return;
    spawnBurst(x, y, 6, ['#8b1a1a', '#6b1414', '#a02020']);
    cam.shake(1.2);
  }

  // Every car flattens the people it drives into.
  function runOverPeds() {
    for (var i = 0; i < cars.length; i++) {
      var flattened = CJ.Peds.hitByCar(cars[i]);
      if (!flattened) continue;
      spawnBurst(cars[i].x, cars[i].y, 5, ['#8b1a1a', '#6b1414']);
      cam.shake(Math.min(10, 3 + flattened * 2));
    }
  }

  // ------------------------------------------------------------------ step
  function step(dt) {
    var I = CJ.Input;

    // Global toggles work even while paused.
    if (I.pressed('KeyP')) paused = !paused;
    if (I.pressed('F1')) debug = !debug;
    if (I.pressed('KeyR')) reset();

    if (paused) { I.endStep(); return; }
    if (exitGrace > 0) exitGrace -= dt;

    // Enter / leave the nearest car.
    if (I.pressed('KeyE')) {
      if (player.driving) exitCar();
      else {
        var car = nearestCar();
        if (car) enterCar(car);
      }
    }

    // Aim at the mouse whenever we are on foot.
    if (!player.driving && I.mouse.moved) {
      var mw = cam.screenToWorld(I.mouse.sx, I.mouse.sy);
      player.aim = Math.atan2(mw.y - player.y, mw.x - player.x);
    }

    var axis = I.axis();

    if (player.driving) {
      var driven = player.driving;
      driven.update(dt, I.driving());
      var impact = driven.integrate(dt, world);
      if (impact > 60) {
        cam.shake(Math.min(14, impact * 0.03));
        spawnSparks(driven.x, driven.y, 5);
      }
      // Keep the player glued to the car while driving.
      player.x = driven.x;
      player.y = driven.y;
      player.vx = driven.vx;
      player.vy = driven.vy;
    } else {
      player.update(dt, axis, world);
      if (I.firing() && player.canFire()) fire();
    }

    // Parked cars keep settling (and coast after an exit).
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      if (c === player.driving) continue;
      c.update(dt, null);
      c.integrate(dt, world);
    }

    collideCars();
    collidePlayerCars();
    runOverPeds();

    CJ.Peds.update(dt, world, cars);
    CJ.Bullets.update(dt, world, cars, onHitCar, CJ.Peds.targets(), onHitPed);
    updateParticles(dt);
    cam.update(dt, world);
    I.endStep();
  }

  // ------------------------------------------------------------------ render
  function drawReticle(c) {
    var I = CJ.Input;
    if (!I.mouse.inside || player.driving) return;
    var w = cam.screenToWorld(I.mouse.sx, I.mouse.sy);
    c.save();
    c.strokeStyle = 'rgba(255,255,255,0.5)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.arc(w.x, w.y, 7, 0, Math.PI * 2);
    c.moveTo(w.x - 12, w.y); c.lineTo(w.x - 4, w.y);
    c.moveTo(w.x + 4, w.y); c.lineTo(w.x + 12, w.y);
    c.moveTo(w.x, w.y - 12); c.lineTo(w.x, w.y - 4);
    c.moveTo(w.x, w.y + 4); c.lineTo(w.x, w.y + 12);
    c.stroke();
    c.restore();
  }

  function drawHitboxes(c) {
    var view = cam.view;
    var hw = view.w / 2, hh = view.h / 2;
    c.save();
    c.lineWidth = 1;
    c.strokeStyle = 'rgba(255,90,90,0.75)';
    for (var i = 0; i < world.solids.length; i++) {
      var b = world.solids[i];
      if (b.x + b.w < cam.x - hw || b.x > cam.x + hw) continue;
      if (b.y + b.h < cam.y - hh || b.y > cam.y + hh) continue;
      c.strokeRect(b.x + 0.5, b.y + 0.5, b.w - 1, b.h - 1);
    }
    c.strokeStyle = 'rgba(80,255,130,0.9)';
    var circles = player.driving
      ? player.driving.bodyCircles()
      : [{ x: player.x, y: player.y, r: player.radius }];
    for (i = 0; i < circles.length; i++) {
      c.beginPath();
      c.arc(circles[i].x, circles[i].y, circles[i].r, 0, Math.PI * 2);
      c.stroke();
    }
    c.restore();
  }

  function render() {
    var view = cam.view;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0d10';
    ctx.fillRect(0, 0, view.w, view.h);

    cam.apply(ctx);

    world.drawGround(ctx, cam, view);
    world.drawBuildings(ctx, cam, view);

    // Blood sits on the ground; people and cars are drawn over it.
    CJ.Blood.draw(ctx);
    CJ.Peds.draw(ctx);

    for (var i = 0; i < cars.length; i++) cars[i].render(ctx);
    if (!player.driving) player.draw(ctx);
    CJ.Bullets.draw(ctx);
    drawParticles(ctx);
    drawReticle(ctx);
    if (debug) drawHitboxes(ctx);

    cam.restore(ctx);

    CJ.HUD.update({ player: player, paused: paused });
    CJ.HUD.draw(ctx, {
      cam: cam,
      world: world,
      player: player,
      cars: cars,
      fps: fps,
      debug: debug
    });
  }

  // ------------------------------------------------------------------ loop
  function frame(now) {
    var dtMs = now - lastTime;
    lastTime = now;
    if (!isFinite(dtMs) || dtMs < 0) dtMs = 16;

    var dt = Math.min(dtMs / 1000, C.MAX_FRAME);

    acc += dt;
    var guard = 0;
    while (acc >= C.DT && guard < 8) {
      step(C.DT);
      acc -= C.DT;
      guard++;
    }
    if (guard >= 8) acc = 0;   // never spiral after a long stall

    fpsAcc += dt;
    fpsFrames++;
    if (fpsAcc >= 0.5) {
      fps = fpsFrames / fpsAcc;
      fpsAcc = 0;
      fpsFrames = 0;
    }

    render();
    requestAnimationFrame(frame);
  }

  // Exposed for the smoke test (smoke.html) and for console poking.
  window.CJGame = {
    init: init,
    reset: reset,
    step: step,
    render: render,
    getState: function () {
      return {
        player: player,
        cars: cars,
        world: world,
        cam: cam,
        paused: paused,
        debug: debug,
        particles: particles,
        bulletsLive: CJ.Bullets.liveCount,
        peds: CJ.Peds.list,
        pedsAlive: CJ.Peds.aliveCount,
        kills: CJ.Peds.kills,
        splats: CJ.Blood.count
      };
    }
  };

  // Scripts sit at the end of <body>, but be safe if they ever load later.
  // Listen on `document` (not `window`): the event targets the document, so
  // document listeners run before anything that bubbles up to window.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();