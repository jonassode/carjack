// Carjack - pedestrians.
//
// Each city block has a ring of sidewalk tiles. Peds are spawned onto one of
// those rings and walk from tile to tile around it, which guarantees a clear
// path with no pathfinding. Any ring tile whose inward neighbour is a building
// counts as a door, so peds can step into houses, vanish, and come back out of
// a different door.
window.CJ = window.CJ || {};

CJ.Peds = (function () {
  'use strict';

  var M = CJ.M;
  var TAU = Math.PI * 2;

  var world = null;
  var mapDef = null;
  var loops = [];
  var peds = [];
  var kills = 0;

  function rnd(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

  // ---------------------------------------------------------------- routes
  function buildLoops(w) {
    var block = (mapDef.blockSize) || 8;
    var roadW = (mapDef.roadWidth) || 2;
    var T = w.tile;
    var bxCount = Math.floor(w.cols / block);
    var byCount = Math.floor(w.rows / block);
    var out = [];

    for (var by = 0; by < byCount; by++) {
      for (var bx = 0; bx < bxCount; bx++) {
        var x0 = bx * block;
        var y0 = by * block;
        var x1 = x0 + block - roadW - 1;
        var y1 = y0 + block - roadW - 1;

        // Walk the ring clockwise, remembering which tile each point faces.
        var ring = [];
        var i;
        for (i = x0; i <= x1; i++) ring.push([i, y0, i, y0 + 1]);
        for (i = y0 + 1; i <= y1; i++) ring.push([x1, i, x1 - 1, i]);
        for (i = x1 - 1; i >= x0; i--) ring.push([i, y1, i, y1 - 1]);
        for (i = y1 - 1; i > y0; i--) ring.push([x0, i, x0 + 1, i]);

        var points = [];
        var doors = [];
        var ok = true;

        for (i = 0; i < ring.length; i++) {
          var t = ring[i];
          var px = (t[0] + 0.5) * T;
          var py = (t[1] + 0.5) * T;

          // The route must stay on walkable, non-road tiles.
          if (w.tileChar(t[0], t[1]) === '=' || w.isSolidAt(px, py, CJ.CFG.PED_RADIUS)) {
            ok = false;
            break;
          }

          var point = {
            x: px,
            y: py,
            door: w.tileChar(t[2], t[3]) === '#'
          };
          points.push(point);
          if (point.door) {
            point.i = i;
            doors.push(point);
          }
        }

        if (ok && points.length > 7) out.push({ points: points, doors: doors });
      }
    }

    return out;
  }

  // ---------------------------------------------------------------- ped
  function Ped(loop, idx) {
    var start = loop.points[idx];

    this.loop = loop;
    this.idx = (idx + 1) % loop.points.length;
    this.x = start.x;
    this.y = start.y;
    this.vx = 0;
    this.vy = 0;
    this.r = CJ.CFG.PED_RADIUS;
    this.color = pick(CJ.CFG.PED_COLORS);
    this.baseSpeed = CJ.CFG.PED_SPEED * rnd(0.82, 1.2);
    this.face = Math.random() * TAU;
    this.walk = Math.random() * TAU;
    this.panic = 0;
    this.fade = 1;
    this.timer = 0;
    this.state = 'walk';      // walk | entering | inside | exiting | dead
    this.dead = false;
  }

  Ped.prototype.target = function () {
    return this.loop.points[this.idx];
  };

  // Walk to the next ring tile; maybe duck into a house on the way.
  Ped.prototype.arrive = function () {
    var p = this.loop.points[this.idx];

    if (p.door && Math.random() < CJ.CFG.PED_DOOR_CHANCE) {
      this.state = 'entering';
      this.timer = CJ.CFG.PED_FADE_TIME;
      this.fade = 1;
      return;
    }

    this.idx = (this.idx + 1) % this.loop.points.length;
  };

  // Come back out of a house (possibly a different door) and fade in.
  Ped.prototype.emerge = function () {
    var doors = this.loop.doors;
    if (doors.length) {
      var door = pick(doors);
      this.x = door.x;
      this.y = door.y;
      this.idx = (door.i + 1) % this.loop.points.length;
    }
    this.state = 'exiting';
    this.timer = CJ.CFG.PED_FADE_TIME;
    this.fade = 0;
    this.vx = 0;
    this.vy = 0;
  };

  Ped.prototype.update = function (dt, w, cars) {
    if (this.state === 'dead') return;
    var C = CJ.CFG;

    if (this.state === 'inside') {
      this.timer -= dt;
      if (this.timer <= 0) this.emerge();
      return;
    }

    if (this.state === 'entering') {
      this.timer -= dt;
      this.fade = Math.max(0, this.timer / C.PED_FADE_TIME);
      if (this.timer <= 0) {
        this.state = 'inside';
        this.fade = 0;
        this.timer = rnd(C.PED_INSIDE_MIN, C.PED_INSIDE_MAX);
      }
      return;
    }

    if (this.state === 'exiting') {
      this.timer -= dt;
      this.fade = Math.min(1, 1 - this.timer / C.PED_FADE_TIME);
      if (this.timer <= 0) {
        this.state = 'walk';
        this.fade = 1;
      }
      return;
    }

    // --- walking ---------------------------------------------------------
    this.panic = Math.max(0, this.panic - dt);

    // Scramble away from any car that is close and moving fast.
    for (var i = 0; i < cars.length; i++) {
      var c = cars[i];
      var speed = M.len(c.vx, c.vy);
      if (speed < C.PED_SCARE_SPEED) continue;
      if (M.dist(c.x, c.y, this.x, this.y) < C.PED_FLEE_RADIUS) this.panic = 1.1;
    }

    var speed = this.panic > 0 ? this.baseSpeed * C.PED_PANIC_MULT : this.baseSpeed;
    var t = this.target();
    var dx = t.x - this.x;
    var dy = t.y - this.y;
    var d = M.len(dx, dy);

    if (d < 2.5) {
      this.arrive();
      return;
    }

    this.vx = M.smooth(this.vx, (dx / d) * speed, 12, dt);
    this.vy = M.smooth(this.vy, (dy / d) * speed, 12, dt);
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    this.face = Math.atan2(this.vy, this.vx);
    this.walk += M.len(this.vx, this.vy) * dt * 0.16;

    // Safety net for hand-authored maps: never end up inside a building.
    var near = w.solidsNear(this.x, this.y, this.r);
    for (i = 0; i < near.length; i++) {
      var res = M.circleVsAABB(this.x, this.y, this.r, near[i]);
      if (res) {
        this.x += res.nx * res.depth;
        this.y += res.ny * res.depth;
      }
    }
  };

  // Flattened by a car or a bullet: drop a splat and stop simulating this ped.
  Ped.prototype.kill = function (dirX, dirY) {
    if (this.dead) return false;
    this.dead = true;
    this.state = 'dead';
    kills++;
    CJ.Blood.add(this.x, this.y, dirX, dirY);
    return true;
  };

  // ------------------------------------------------------------------ drawing
  Ped.prototype.render = function (ctx) {
    if (this.dead) return;
    if (this.state === 'inside' || this.fade <= 0.01) return;

    var r = this.r;
    var alpha = this.fade;

    ctx.save();
    ctx.globalAlpha = alpha;

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(this.x + 2, this.y + 3, r * 0.95, r * 0.62, 0, 0, TAU);
    ctx.fill();

    // Legs, swinging while walking.
    var swing = Math.sin(this.walk) * (this.panic > 0 ? 3.4 : 2.2);
    ctx.strokeStyle = 'rgba(28,32,38,0.85)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(this.x - 1.8, this.y);
    ctx.lineTo(this.x - 1.8 + swing, this.y + r * 0.9);
    ctx.moveTo(this.x + 1.8, this.y);
    ctx.lineTo(this.x + 1.8 - swing, this.y + r * 0.9);
    ctx.stroke();

    // Body circle.
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,20,0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Head, offset a little towards the walking direction.
    ctx.fillStyle = CJ.CFG.COL.skin;
    ctx.beginPath();
    ctx.arc(this.x + Math.cos(this.face) * r * 0.35,
            this.y + Math.sin(this.face) * r * 0.35, r * 0.44, 0, TAU);
    ctx.fill();

    ctx.restore();
  };

  // ------------------------------------------------------------------ API
  function init(w, def) {
    world = w;
    mapDef = def;
    loops = buildLoops(w);
    peds = [];
  }

  function reset() {
    peds = [];
    kills = 0;
    if (!loops.length) return;
    for (var i = 0; i < CJ.CFG.PED_COUNT; i++) spawnOne();
  }

  function spawnOne() {
    var loop = pick(loops);
    if (!loop) return;
    var idx = (Math.random() * loop.points.length) | 0;
    var ped = new Ped(loop, idx);
    peds.push(ped);
    return ped;
  }

  function update(dt, w, cars) {
    for (var i = 0; i < peds.length; i++) {
      if (!peds[i].dead) peds[i].update(dt, w, cars);
    }
  }

  function draw(ctx) {
    for (var i = 0; i < peds.length; i++) peds[i].render(ctx);
  }

  // A car's body circles versus the close peds. Above KILL_SPEED the ped is
  // flattened; below it the car just shoulders them out of the way.
  function hitByCar(car) {
    var C = CJ.CFG;
    var speed = M.len(car.vx, car.vy);
    var circles = car.bodyCircles();
    var flattened = 0;

    for (var i = 0; i < peds.length; i++) {
      var ped = peds[i];
      if (ped.dead || ped.state === 'inside') continue;
      if (M.dist(car.x, car.y, ped.x, ped.y) > C.CAR_LEN) continue;

      for (var k = 0; k < circles.length; k++) {
        var res = M.circleVsCircle(circles[k].x, circles[k].y, circles[k].r,
                                   ped.x, ped.y, ped.r);
        if (!res) continue;

        if (speed > C.KILL_SPEED) {
          var l = speed || 1;
          ped.kill(car.vx / l, car.vy / l);
          flattened++;
        } else {
          ped.x += res.nx * (res.depth + 0.5);
          ped.y += res.ny * (res.depth + 0.5);
        }
        break;
      }
    }
    return flattened;
  }

  // Bullet callback target list: anything not already dead.
  function targets() {
    var out = [];
    for (var i = 0; i < peds.length; i++) {
      if (!peds[i].dead && peds[i].state !== 'inside') out.push(peds[i]);
    }
    return out;
  }

  return {
    init: init,
    reset: reset,
    spawnOne: spawnOne,
    update: update,
    draw: draw,
    hitByCar: hitByCar,
    targets: targets,
    get list() { return peds; },
    get loops() { return loops; },
    get kills() { return kills; },
    get aliveCount() {
      var n = 0;
      for (var i = 0; i < peds.length; i++) if (!peds[i].dead) n++;
      return n;
    }
  };
})();