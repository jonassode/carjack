// Carjack - bullet pool with swept collision (no tunnelling through walls).
window.CJ = window.CJ || {};

CJ.Bullets = (function () {
  'use strict';

  var M = CJ.M;
  var MAX = 128;
  var pool = [];
  var cursor = 0;
  var i;

  for (i = 0; i < MAX; i++) {
    pool.push({ active: false, x: 0, y: 0, px: 0, py: 0, vx: 0, vy: 0, ttl: 0, owner: null });
  }

  function spawn(x, y, dir, owner) {
    var C = CJ.CFG;
    var b = pool[cursor];
    cursor = (cursor + 1) % MAX;

    b.active = true;
    b.x = x; b.y = y;
    b.px = x; b.py = y;
    b.vx = Math.cos(dir) * C.B_SPEED;
    b.vy = Math.sin(dir) * C.B_SPEED;
    b.ttl = C.B_TTL;
    b.owner = owner || null;
    return b;
  }

  // Moves every bullet, resolves wall hits with a segment test, then hits against
// cars and pedestrians with circle tests.
  //   onHitCar(car, x, y) / onHitPed(ped, x, y) are optional damage callbacks.
  //   `peds` and `onHitPed` are optional so older callers keep working.
  function update(dt, world, cars, onHitCar, peds, onHitPed) {
    var C = CJ.CFG;
    var near, j, k, t, best, nx, ny, car, res, hit;

    for (i = 0; i < MAX; i++) {
      var b = pool[i];
      if (!b.active) continue;

      b.ttl -= dt;
      if (b.ttl <= 0) { b.active = false; continue; }

      b.px = b.x;
      b.py = b.y;
      nx = b.x + b.vx * dt;
      ny = b.y + b.vy * dt;

      // --- walls (swept) -------------------------------------------------
      best = 1;
      near = world.solidsNear((b.x + nx) / 2, (b.y + ny) / 2, C.TILE);
      for (j = 0; j < near.length; j++) {
        t = M.segVsAABB(b.x, b.y, nx, ny, near[j]);
        if (t >= 0 && t < best) best = t;
      }
      if (best < 1) {
        b.x = M.lerp(b.x, nx, best);
        b.y = M.lerp(b.y, ny, best);
        b.active = false;
        continue;
      }

      // --- pedestrians (circle test, checked first: they are smaller) -----
      hit = false;
      if (peds && peds.length) {
        for (k = 0; k < peds.length; k++) {
          var ped = peds[k];
          if (!ped || ped.dead) continue;
          res = M.circleVsCircle(nx, ny, C.B_RADIUS + 1.5, ped.x, ped.y, ped.r || 6);
          if (res) {
            b.active = false;
            hit = true;
            if (onHitPed) onHitPed(ped, nx, ny);
            break;
          }
        }
      }
      if (hit) continue;

      // --- cars (circle test at the new position) ------------------------
      for (k = 0; k < cars.length; k++) {
        car = cars[k];
        if (car === b.owner) continue;
        res = M.circleVsCircle(nx, ny, C.B_RADIUS + 1, car.x, car.y, C.CAR_LEN * 0.42);
        if (res) {
          b.active = false;
          if (onHitCar) onHitCar(car, nx, ny);
          break;
        }
      }
      if (!b.active) continue;

      b.x = nx;
      b.y = ny;
    }
  }

  function draw(ctx) {
    var C = CJ.CFG;
    ctx.lineCap = 'round';
    for (var j = 0; j < MAX; j++) {
      var b = pool[j];
      if (!b.active) continue;
      var l = M.len(b.vx, b.vy) || 1;
      var tx = (b.vx / l) * 11;
      var ty = (b.vy / l) * 11;
      ctx.strokeStyle = C.bullet;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(b.x - tx, b.y - ty);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.lineCap = 'butt';
  }

  function clear() {
    for (var j = 0; j < MAX; j++) pool[j].active = false;
  }

  return {
    spawn: spawn,
    update: update,
    draw: draw,
    clear: clear,
    get pool() { return pool; },
    get liveCount() {
      var n = 0;
      for (var j = 0; j < MAX; j++) if (pool[j].active) n++;
      return n;
    }
  };
})();