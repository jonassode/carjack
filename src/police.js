// Carjack - the police response.
//
// src/alert.js owns the 0..100 awareness number; this module turns that heat
// into action. Once the meter reaches the second badge a car is dispatched from
// the police station. It follows the road grid (breadth-first search over the
// road tiles), rams you while you drive, and the officers bail out to shoot and
// finally try to drag you out of the car and bust you.
window.CJ = window.CJ || {};

CJ.Police = (function () {
  'use strict';

  var M = CJ.M;
  var TAU = Math.PI * 2;

  var world = null;
  var carsRef = null;       // the shared car list main.js owns
  var meter = null;         // CJ.Alert instance
  var units = [];           // active responses: one per filled badge
  var spawnTimer = 0;       // seconds until the next car rolls out
  var wasHot = false;       // heat was over the line last step (dispatch edge)
  var bustCb = null;

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  // ------------------------------------------------------------------ roads
  // Roads are a connected grid, so a plain BFS always finds a route. Both ends
  // snap to the closest road tile, which is how the car can reach you while you
  // are standing in a park or on a pavement.
  function nearestRoadTile(w, tx, ty, maxR) {
    var best = null;
    var bestD = Infinity;
    for (var dy = -maxR; dy <= maxR; dy++) {
      for (var dx = -maxR; dx <= maxR; dx++) {
        var x = tx + dx;
        var y = ty + dy;
        if (x < 0 || y < 0 || x >= w.cols || y >= w.rows) continue;
        if (w.tileChar(x, y) !== '=') continue;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = { tx: x, ty: y }; }
      }
    }
    return best;
  }

  // Where a car leaves the station: a piece of road near the building's centre,
  // facing along whichever axis that road runs. When the station sends several
// cars at once they must not appear inside each other, so candidates are tried
// nearest-first and the first spot clear of the cars already out wins.
  function spawnPoint(w, taken) {
    var rect = w.policeStation;
    var cx = rect ? rect.x + rect.w / 2 : w.w / 2;
    var cy = rect ? rect.y + rect.h / 2 : w.h / 2;
    var ctx0 = Math.floor(cx / w.tile);
    var cty0 = Math.floor(cy / w.tile);
    var T = w.tile;
    var best = null;
    var bestD = Infinity;

    for (var dy = -12; dy <= 12; dy++) {
      for (var dx = -12; dx <= 12; dx++) {
        var tx = ctx0 + dx;
        var ty = cty0 + dy;
        if (tx < 0 || ty < 0 || tx >= w.cols || ty >= w.rows) continue;
        if (w.tileChar(tx, ty) !== '=') continue;
        var d = dx * dx + dy * dy;
        if (d >= bestD) continue;
        var x = (tx + 0.5) * T;
        var y = (ty + 0.5) * T;
        var blocked = false;
        if (taken) {
          for (var i = 0; i < taken.length; i++) {
            if (M.dist(x, y, taken[i].x, taken[i].y) < CJ.CFG.CAR_LEN * 1.6) {
              blocked = true;
              break;
            }
          }
        }
        if (blocked) continue;
        bestD = d;
        best = { x: x, y: y, tx: tx, ty: ty };
      }
    }

    if (!best) return null;
    var h = (w.tileChar(best.tx + 1, best.ty) === '=' ||
             w.tileChar(best.tx - 1, best.ty) === '=') ? 0 : Math.PI / 2;
    return { x: best.x, y: best.y, h: h };
  }

  // Road-tile centres from (sx,sy) to (gx,gy), or null when there is no route.
  function findPath(w, sx, sy, gx, gy) {
    var T = w.tile;
    var cols = w.cols;
    var rows = w.rows;
    var start = nearestRoadTile(w, Math.floor(sx / T), Math.floor(sy / T), 6);
    var goal = nearestRoadTile(w, Math.floor(gx / T), Math.floor(gy / T), 6);
    if (!start || !goal) return null;

    var total = cols * rows;
    var startIdx = start.ty * cols + start.tx;
    var goalIdx = goal.ty * cols + goal.tx;
    var prev = new Int32Array(total);
    for (var i = 0; i < total; i++) prev[i] = -1;

    var queue = new Int32Array(total);
    var head = 0, tail = 0;
    queue[tail++] = startIdx;
    prev[startIdx] = startIdx;

    var dxs = [1, -1, 0, 0];
    var dys = [0, 0, 1, -1];
    while (head < tail) {
      var cur = queue[head++];
      if (cur === goalIdx) break;
      var cx = cur % cols;
      var cy = (cur / cols) | 0;
      for (var k = 0; k < 4; k++) {
        var nx = cx + dxs[k];
        var ny = cy + dys[k];
        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
        if (w.tileChar(nx, ny) !== '=') continue;
        var ni = ny * cols + nx;
        if (prev[ni] !== -1) continue;
        prev[ni] = cur;
        queue[tail++] = ni;
      }
    }

    if (prev[goalIdx] === -1) return null;

    var tiles = [];
    var at = goalIdx;
    while (at !== startIdx) {
      tiles.push(at);
      at = prev[at];
      if (tiles.length > total) return null;   // defensive: never loop forever
    }
    tiles.push(startIdx);
    tiles.reverse();

    var points = [];
    for (i = 1; i < tiles.length; i++) {
      var t = tiles[i];
      points.push({
        x: ((t % cols) + 0.5) * T,
        y: (((t / cols) | 0) + 0.5) * T
      });
    }
    if (!points.length) {
      points.push({ x: (goal.tx + 0.5) * T, y: (goal.ty + 0.5) * T });
    }
    return points;
  }

  function lineClear(x1, y1, x2, y2) {
    var d = M.dist(x1, y1, x2, y2);
    var steps = Math.ceil(d / 32);
    for (var i = 1; i < steps; i++) {
      var t = i / steps;
      if (world.isSolidAt(M.lerp(x1, x2, t), M.lerp(y1, y2, t), 2)) return false;
    }
    return true;
  }

  // ------------------------------------------------------------------ cops
  function Cop() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    this.r = CJ.CFG.COP_RADIUS;
    this.hp = CJ.CFG.COP_HP;
    this.dead = false;
    this.isCop = true;        // main routes bullet hits with this flag
    this.aim = 0;
    this.face = 0;
    this.walk = 0;
    this.fireCd = 0;
    this.state = 'drive';     // drive | foot | dead
  }

  Cop.prototype.kill = function (dirX, dirY) {
    if (this.dead) return false;
    this.dead = true;
    this.state = 'dead';
    CJ.Blood.add(this.x, this.y, dirX, dirY);
    return true;
  };

  Cop.prototype.render = renderCop;

  function moveCop(cop, dt, tx, ty, speed) {
    var C = CJ.CFG;
    var dx = tx - cop.x;
    var dy = ty - cop.y;
    var d = M.len(dx, dy) || 1;
    var want = d < C.POLICE_GRAB_RANGE - 8 ? 0 : speed;
    cop.vx = M.smooth(cop.vx, (dx / d) * want, 12, dt);
    cop.vy = M.smooth(cop.vy, (dy / d) * want, 12, dt);
    cop.x += cop.vx * dt;
    cop.y += cop.vy * dt;

    // Officers are pushed out of buildings exactly like the player.
    for (var pass = 0; pass < 2; pass++) {
      var near = world.solidsNear(cop.x, cop.y, cop.r);
      var moved = false;
      for (var i = 0; i < near.length; i++) {
        var res = M.circleVsAABB(cop.x, cop.y, cop.r, near[i]);
        if (res) {
          cop.x += res.nx * res.depth;
          cop.y += res.ny * res.depth;
          moved = true;
        }
      }
      if (!moved) break;
    }

    var speedNow = M.len(cop.vx, cop.vy);
    if (speedNow > 8) cop.face = Math.atan2(cop.vy, cop.vx);
    cop.walk += speedNow * dt * 0.12;
  }

  function copFire(cop) {
    var C = CJ.CFG;
    var spread = rnd(-C.COP_SPREAD, C.COP_SPREAD);
    CJ.Bullets.spawn(
      cop.x + Math.cos(cop.aim) * 14,
      cop.y + Math.sin(cop.aim) * 14,
      cop.aim + spread,
      cop
    );
    cop.fireCd = C.COP_FIRE_CD * rnd(0.85, 1.3);
  }

  // The driver's door, which is where an officer tries to grab you.
  function doorSpot(car) {
    return {
      x: car.x - Math.sin(car.heading) * 28,
      y: car.y + Math.cos(car.heading) * 28
    };
  }

  function updateCop(cop, dt, player) {
    var C = CJ.CFG;
    var target = player.driving || player;
    var dx = target.x - cop.x;
    var dy = target.y - cop.y;
    var d = M.len(dx, dy) || 1;

    cop.aim = Math.atan2(dy, dx);
    cop.fireCd -= dt;

    if (d < C.COP_RANGE && d > C.COP_HOLD_FIRE &&
        lineClear(cop.x, cop.y, target.x, target.y) && cop.fireCd <= 0) {
      copFire(cop);
    }

    var spot = player.driving ? doorSpot(player.driving) : target;
    moveCop(cop, dt, spot.x, spot.y, C.COP_SPEED);
  }

  // ------------------------------------------------------------------ unit
  function removeCar(car) {
    if (!carsRef) return;
    var i = carsRef.indexOf(car);
    if (i !== -1) carsRef.splice(i, 1);
  }

  function despawnAll() {
    for (var i = 0; i < units.length; i++) {
      if (units[i].car) removeCar(units[i].car);
    }
    units.length = 0;
    // Squad cars whose crews were wiped out were left in the world to be
    // stolen; a death, a bust or R sweeps those up too.
    if (carsRef) {
      for (var j = carsRef.length - 1; j >= 0; j--) {
        if (carsRef[j].abandoned) carsRef.splice(j, 1);
      }
    }
  }

  // The crew is gone, but its car is not: it is left parked where it stopped so
  // the player can steal it, and this unit stops managing it. Every abandoned
  // squad car is swept up by despawnAll (death, bust or R).
  function abandonUnit(u) {
    var car = u.car;
    if (car) {
      car.abandoned = true;
      car.auto = false;
      car.driver = null;
      car.vx = 0;
      car.vy = 0;
      car.speed = 0;
      car.throttle = 0;
      car.steer = 0;
      car.brake = false;
    }
    u.car = null;
    var i = units.indexOf(u);
    if (i !== -1) units.splice(i, 1);
  }

  // The cars already on the road, so a reinforcement does not spawn on top.
  function policeCars() {
    var out = [];
    for (var i = 0; i < units.length; i++) {
      if (units[i].car) out.push(units[i].car);
    }
    return out;
  }

  function spawnUnit() {
    if (!world || !carsRef) return null;
    var p = spawnPoint(world, policeCars());
    if (!p) return null;

    var C = CJ.CFG;
    var car = new CJ.Car({
      x: p.x,
      y: p.y,
      h: p.h,
      color: C.COL.policeBody,
      maxSpeed: C.CAR_MAX * C.POLICE_SPEED_MULT,
      accel: C.CAR_ACCEL * C.POLICE_ACCEL_MULT,
      hp: C.POLICE_CAR_HP,
      police: true
    });
    car.auto = true;                 // main leaves it to the AI
    car.siren = rnd(0, TAU);

    var cops = [new Cop(), new Cop()];
    for (var i = 0; i < cops.length; i++) {
      cops[i].x = car.x;
      cops[i].y = car.y;
    }
    car.driver = cops[0];

    var u = {
      car: car,
      cops: cops,
      deployed: false,
      bustTimer: 0,
      path: null,
      waypoint: 0,
      repath: 0,
      stuck: 0,
      reverse: 0,
      footTimer: 0
    };
    units.push(u);
    carsRef.push(car);
    return u;
  }

  function shouldDeploy(u, player) {
    var C = CJ.CFG;
    if (!u.car || u.deployed) return false;
    var target = player.driving || player;
    var d = M.dist(u.car.x, u.car.y, target.x, target.y);
    var speed = M.len(u.car.vx, u.car.vy);
    // A car that has already stopped is close enough from a little further out;
    // this also means a squad car can never sit still and never get out.
    var reach = speed < 15 ? C.POLICE_DEPLOY_RANGE + 90 : C.POLICE_DEPLOY_RANGE;
    if (d > reach) return false;
    if (speed > C.POLICE_DEPLOY_SPEED) return false;
    if (player.driving && Math.abs(player.driving.speed) > C.POLICE_BUST_SPEED) return false;
    return true;
  }

  function deployUnit(u) {
    var car = u.car;
    var cosH = Math.cos(car.heading);
    var sinH = Math.sin(car.heading);
    var spots = [
      { x: car.x - sinH * 30, y: car.y + cosH * 30 },
      { x: car.x + sinH * 30, y: car.y - cosH * 30 },
      { x: car.x - cosH * 44, y: car.y - sinH * 44 }
    ];

    var n = 0;
    for (var i = 0; i < u.cops.length; i++) {
      var cop = u.cops[i];
      if (cop.dead) continue;
      var spot = spots[n % spots.length];
      n++;
      cop.x = spot.x;
      cop.y = spot.y;
      cop.vx = 0;
      cop.vy = 0;
      cop.state = 'foot';
      cop.fireCd = rnd(0.15, 0.5);
      if (world.isSolidAt(cop.x, cop.y, cop.r + 1)) {
        cop.x = car.x;
        cop.y = car.y;
      }
    }

    car.driver = null;
    car.auto = false;          // left parked with the light bar running
    car.vx = 0;
    car.vy = 0;
    car.speed = 0;
    car.throttle = 0;
    car.steer = 0;
    u.deployed = true;
    u.footTimer = 0;
    u.bustTimer = 0;
    u.path = null;
  }

  function remount(u) {
    var car = u.car;
    if (!car) return;
    var driver = null;
    for (var i = 0; i < u.cops.length; i++) {
      var cop = u.cops[i];
      if (cop.dead) continue;
      cop.state = 'drive';
      cop.vx = 0;
      cop.vy = 0;
      cop.x = car.x;
      cop.y = car.y;
      if (!driver) driver = cop;
    }
    car.driver = driver;
    car.auto = true;
    u.deployed = false;
    u.footTimer = 0;
    u.bustTimer = 0;
    u.path = null;
    u.repath = 0;
    u.stuck = 0;
    u.reverse = 0;
  }

  // Pursue: follow the road route while far, straight at you once there is a
  // clear line. The car rams you if you stay in the driver's seat.
  function driveChase(u, dt, player) {
    var C = CJ.CFG;
    var car = u.car;
    var px = player.driving ? player.driving.x : player.x;
    var py = player.driving ? player.driving.y : player.y;
    var distance = M.dist(car.x, car.y, px, py);

    var aimX = px;
    var aimY = py;
    var direct = distance < C.POLICE_RAM_RANGE && lineClear(car.x, car.y, px, py);

    if (!direct) {
      u.repath -= dt;
      if (u.repath <= 0 || !u.path || !u.path.length) {
        u.path = findPath(world, car.x, car.y, px, py);
        u.waypoint = 0;
        u.repath = C.POLICE_REPATH;
      }

      var path = u.path;
      if (path && path.length) {
        while (u.waypoint < path.length - 1 &&
               M.dist(car.x, car.y, path[u.waypoint].x, path[u.waypoint].y) < 34) {
          u.waypoint++;
        }
        // Aim a little way down the road so corners are anticipated.
        var look = u.waypoint;
        for (var i = u.waypoint; i < path.length; i++) {
          if (M.dist(car.x, car.y, path[i].x, path[i].y) > C.POLICE_LOOKAHEAD) break;
          look = i;
        }
        aimX = path[look].x;
        aimY = path[look].y;
      }
    }

    var diff = wrapAngle(Math.atan2(aimY - car.y, aimX - car.x) - car.heading);
    var steer = M.clamp(diff * 2.4, -1, 1);
    var throttle = 1;

    if (!player.driving && distance < C.POLICE_DEPLOY_RANGE - 40) {
      // Brake to a stop so the officers can get out instead of running you over.
      throttle = car.speed > C.POLICE_DEPLOY_SPEED ? -1 : 0;
    } else if (Math.abs(diff) > 0.55 && Math.abs(car.speed) > 250) {
      throttle = -1;
    } else if (Math.abs(diff) > 0.9) {
      throttle = 0.25;
    }

    if (u.reverse > 0) {
      u.reverse -= dt;
      car.update(dt, { throttle: -1, steer: -steer });
      car.integrate(dt, world);
      return;
    }

    car.update(dt, { throttle: throttle, steer: steer });
    car.integrate(dt, world);

    var speed = M.len(car.vx, car.vy);
    if (speed < 25 && throttle > 0) u.stuck += dt;
    else u.stuck = Math.max(0, u.stuck - dt);

    // Wedged against a kerb or a parked car: back off and take the corner again.
    if (u.stuck > 0.9) {
      u.stuck = 0;
      u.reverse = 0.55;
      u.path = null;
      u.repath = 0;
    }
  }

  // True when an officer is within grabbing distance and you are not moving
  // fast enough to shake them off. The timer runs while they have hold of you.
  function updateBust(u, dt, player) {
    var C = CJ.CFG;
    var target = player.driving || player;
    var close = false;

    for (var i = 0; i < u.cops.length; i++) {
      var cop = u.cops[i];
      if (cop.dead || cop.state !== 'foot') continue;
      if (M.dist(cop.x, cop.y, target.x, target.y) <= C.POLICE_GRAB_RANGE) {
        close = true;
        break;
      }
    }

    var reachable = !player.driving ||
      Math.abs(player.driving.speed) <= C.POLICE_BUST_SPEED;

    if (close && reachable) u.bustTimer += dt;
    else u.bustTimer = Math.max(0, u.bustTimer - dt * 2);

    if (u.bustTimer < C.POLICE_BUST_TIME) return false;

    u.bustTimer = 0;
    if (bustCb) bustCb();       // main flags player.busted and calls disengage()
    return true;
  }

  function updateUnit(u, dt, player) {
    // main.js removes a wrecked car; anyone still inside went with it.
    if (u.car && carsRef && carsRef.indexOf(u.car) === -1) {
      for (var c = 0; c < u.cops.length; c++) {
        if (u.cops[c].state === 'drive' && !u.cops[c].dead) {
          u.cops[c].dead = true;
          u.cops[c].state = 'dead';
          CJ.Blood.add(u.car.x, u.car.y, 1, 0);
        }
      }
      u.car = null;
      u.deployed = true;
    }

    var living = 0;
    for (var i = 0; i < u.cops.length; i++) {
      if (!u.cops[i].dead) living++;
    }
    if (!living) {
      abandonUnit(u);            // crew down: leave the car, the others carry on
      return false;
    }

    if (u.car) {
      u.car.siren = (u.car.siren + dt * 9) % TAU;
      // Once the officers are out, the car is left where it stopped.
      if (!u.deployed) {
        driveChase(u, dt, player);
        if (shouldDeploy(u, player)) deployUnit(u);
      }
    }

    for (i = 0; i < u.cops.length; i++) {
      var cop = u.cops[i];
      if (cop.dead || cop.state !== 'foot') continue;
      updateCop(cop, dt, player);
    }

    // You drove off and left them standing: pile back in and resume the chase.
    if (u.deployed && u.car && player.driving) {
      var far = M.dist(u.car.x, u.car.y, player.driving.x, player.driving.y);
      u.footTimer += dt;
      if (u.footTimer > CJ.CFG.POLICE_REMOUNT && far > CJ.CFG.POLICE_REMOUNT_RANGE) {
        remount(u);
      }
    }

    if (updateBust(u, dt, player)) return true;   // busted; everyone stands down
    return false;
  }

  // ------------------------------------------------------------------ API
  function init(w, onBust) {
    world = w;
    bustCb = onBust || null;
    meter = new CJ.Alert();
    units = [];
    spawnTimer = 0;
    wasHot = false;
    carsRef = null;
  }

  function reset() {
    despawnAll();
    spawnTimer = 0;
    wasHot = false;
    if (meter) meter.reset();
  }

  // Called on death, on a bust and by R: the police forget about you.
  function disengage() {
    reset();
  }

  // One squad car for every badge filled: 20 points sends one, 40 two, and so
  // on up to ALERT_BADGES. Anything under the chase line sends nobody.
  function wantedUnits() {
    if (!meter || !meter.hot()) return 0;
    return Math.min(CJ.CFG.POLICE_MAX_UNITS,
                    Math.max(1, meter.badges()));
  }

  function update(dt, player, cars) {
    if (!meter || !world) return;
    if (cars) carsRef = cars;

    meter.update(dt);
    var hot = meter.hot();
    var wanted = wantedUnits();

    if (!hot) {
      // The trail went cold: every car is stood down.
      if (units.length) despawnAll();
      spawnTimer = CJ.CFG.POLICE_CALL_DELAY;
      wasHot = false;
      return;
    }

    // New units roll out one at a time so they do not spawn on top of each
    // other (and so reinforcements visibly arrive).
    if (units.length < wanted) {
      if (!wasHot) spawnTimer = CJ.CFG.POLICE_CALL_DELAY;
      spawnTimer -= dt;
      if (spawnTimer <= 0) {
        spawnTimer = spawnUnit() ? CJ.CFG.POLICE_REINFORCE_DELAY : 0.5;
      }
    } else {
      spawnTimer = CJ.CFG.POLICE_REINFORCE_DELAY;
    }
    wasHot = hot;

    // Walk backwards: a unit can retire itself when its crew is gone.
    for (var i = units.length - 1; i >= 0; i--) {
      if (updateUnit(units[i], dt, player)) return;   // busted
    }
  }

  function hitCop(cop, dirX, dirY) {
    if (!cop || !cop.kill(dirX, dirY)) return false;
    if (meter) meter.add(CJ.CFG.ALERT_COP_KILL);
    return true;
  }

  // The police car blew up: everyone still inside goes with it.
  function onCarDestroyed(car) {
    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      if (unit.car !== car) continue;
      for (var i = 0; i < unit.cops.length; i++) {
        var cop = unit.cops[i];
        if (cop.dead || cop.state !== 'drive') continue;
        cop.dead = true;
        cop.state = 'dead';
        CJ.Blood.add(car.x, car.y, 1, 0);
      }
      unit.car = null;
      unit.deployed = true;
      unit.bustTimer = 0;
      return;
    }
  }

  // Bullet targets: only officers who are out of the car can be shot.
  function targets() {
    var out = [];
    for (var u = 0; u < units.length; u++) {
      var cops = units[u].cops;
      for (var i = 0; i < cops.length; i++) {
        if (!cops[i].dead && cops[i].state === 'foot') out.push(cops[i]);
      }
    }
    return out;
  }

  function draw(ctx) {
    for (var u = 0; u < units.length; u++) {
      var cops = units[u].cops;
      for (var i = 0; i < cops.length; i++) {
        if (cops[i].state === 'foot') cops[i].render(ctx);
      }
    }
  }

  // A small read-only view for the HUD, smoke tests and console poking.
  function snapshot() {
    var total = 0;
    var afoot = 0;
    var cars = 0;
    var deployed = false;
    var bustTimer = 0;
    var firstCar = null;

    for (var u = 0; u < units.length; u++) {
      var unit = units[u];
      if (unit.car) {
        cars++;
        if (!firstCar) firstCar = unit.car;
      }
      if (unit.deployed) deployed = true;
      if (unit.bustTimer > bustTimer) bustTimer = unit.bustTimer;
      for (var i = 0; i < unit.cops.length; i++) {
        var cop = unit.cops[i];
        if (cop.dead) continue;
        total++;
        if (cop.state === 'foot') afoot++;
      }
    }

    return {
      active: units.length > 0,
      units: units.length,
      cars: cars,
      car: firstCar,
      cops: total,
      afoot: afoot,
      deployed: deployed,
      bustTimer: bustTimer,
      alert: meter ? meter.value : 0,
      wanted: wantedUnits()
    };
  }

  function renderCop(ctx) {
    if (this.dead || this.state !== 'foot') return;
    var C = CJ.CFG;
    var r = this.r;
    var speed = M.len(this.vx, this.vy);

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(this.x + 3, this.y + 4, r * 1.02, r * 0.72, 0, 0, TAU);
    ctx.fill();

    // Legs.
    var swing = Math.sin(this.walk) * (speed > 14 ? 4 : 0);
    ctx.strokeStyle = '#1b2739';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(this.x - 3, this.y - 1);
    ctx.lineTo(this.x - 3 + swing * 0.4, this.y + 6 + swing);
    ctx.moveTo(this.x + 3, this.y - 1);
    ctx.lineTo(this.x + 3 - swing * 0.4, this.y + 6 - swing);
    ctx.stroke();

    // Body.
    ctx.fillStyle = C.COL.cop;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(8,12,20,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Pale shoulder wedge towards the way they are moving.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.face);
    ctx.fillStyle = 'rgba(159,180,216,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, -0.5, 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Badge, and the gun aimed at the last known position.
    ctx.fillStyle = '#ffd15c';
    ctx.beginPath();
    ctx.arc(this.x, this.y - r * 0.25, 2.1, 0, TAU);
    ctx.fill();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);
    ctx.fillStyle = '#20262e';
    ctx.fillRect(r * 0.45, -1.8, 11, 3.6);
    ctx.restore();
  }

  return {
    init: init,
    reset: reset,
    update: update,
    draw: draw,
    disengage: disengage,
    addHeat: function (amount) { if (meter) meter.add(amount); },
    hitCop: hitCop,
    onCarDestroyed: onCarDestroyed,
    targets: targets,
    snapshot: snapshot,
    findPath: findPath,
    spawnPoint: spawnPoint,
    get meter() { return meter; },
    get alert() { return meter ? meter.value : 0; },
    get active() { return units.length > 0; },
    get units() { return units; },
    get hot() { return meter ? meter.hot() : false; }
  };
})();