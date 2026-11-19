// Carjack - the street cleaners.
//
// A little depot building ('C' on the map) keeps the streets tidy. A blood splat
// that has been lying there for CLEAN_DELAY seconds with nobody washing it
// summons a cleaner truck: it rolls out of the depot, follows the road grid to
// the mess, stops, scrubs every decal within CLEANER_WASH_RADIUS away, then
// drives home. That drains the decal pool so it never just fills to SPLAT_MAX.
window.CJ = window.CJ || {};

CJ.Cleaner = (function () {
  'use strict';

  var M = CJ.M;
  var TAU = Math.PI * 2;

  var world = null;
  var carsRef = null;       // the shared car list main.js owns
  var units = [];           // active trucks
  var spawnTimer = 0;       // seconds until the next truck rolls out

  function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
  }

  // Where a truck leaves the depot: the nearest piece of road to the building,
  // facing along it. Candidates are tried nearest-first and the first spot clear
  // of the trucks already out wins, so a second truck never spawns on top of the
  // first. (The police station spawn point works the same way.)
  function spawnPoint(w, taken) {
    var rect = w.depot;
    if (!rect) return null;
    var cx = rect.x + rect.w / 2;
    var cy = rect.y + rect.h / 2;
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

  // ------------------------------------------------------------------ unit
  function removeCar(car) {
    if (!carsRef || !car) return;
    var i = carsRef.indexOf(car);
    if (i !== -1) carsRef.splice(i, 1);
  }

  function retire(u) {
    removeCar(u.car);
    var i = units.indexOf(u);
    if (i !== -1) units.splice(i, 1);
  }

  // The trucks already out, so a second one does not spawn on top of the first.
  function truckCars() {
    var out = [];
    for (var i = 0; i < units.length; i++) {
      if (units[i].car) out.push(units[i].car);
    }
    return out;
  }

  function spawnTruck(splat) {
    if (!world || !carsRef) return null;
    var p = spawnPoint(world, truckCars());
    if (!p) return null;

    var C = CJ.CFG;
    var truck = new CJ.Car({
      x: p.x,
      y: p.y,
      h: p.h,
      color: C.COL.cleanerBody,
      maxSpeed: C.CAR_MAX * C.CLEANER_SPEED_MULT,
      accel: C.CAR_ACCEL * C.CLEANER_ACCEL_MULT,
      hp: C.CLEANER_CAR_HP,
      cleaner: true
    });
    truck.auto = true;                 // main leaves the physics to us

    var u = {
      car: truck,
      target: splat,                   // the decal it was sent for
      tx: splat ? splat.x : p.x,
      ty: splat ? splat.y : p.y,
      homeX: p.x,
      homeY: p.y,
      path: null,
      waypoint: 0,
      repath: 0,
      stuck: 0,
      reverse: 0,
      state: 'out',                    // out | wash | home
      wash: 0,
      life: 0
    };
    units.push(u);
    carsRef.push(truck);
    return u;
  }

  // Whether a truck is already on its way to this decal.
  function targeted(splat) {
    for (var i = 0; i < units.length; i++) {
      if (units[i].target === splat) return true;
    }
    return false;
  }

  // The oldest decal that has waited long enough and has no truck on it.
  function waitingSplat() {
    var list = CJ.Blood.splats;
    var best = null;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (s.age < CJ.CFG.CLEAN_DELAY) continue;
      if (targeted(s)) continue;
      if (!best || s.age > best.age) best = s;
    }
    return best;
  }

  // Drive toward (tx,ty) along the road grid. The road BFS is the same one the
  // police use; both ends snap to the nearest road tile, so a truck can reach a
  // splat that is sitting on a pavement.
  function driveTo(u, dt, tx, ty) {
    var C = CJ.CFG;
    var car = u.car;

    u.repath -= dt;
    if (u.repath <= 0 || !u.path || !u.path.length) {
      u.path = CJ.Police.findPath(world, car.x, car.y, tx, ty);
      u.waypoint = 0;
      u.repath = C.CLEANER_REPATH;
    }

    var aimX = tx;
    var aimY = ty;
    var path = u.path;
    if (path && path.length) {
      while (u.waypoint < path.length - 1 &&
             M.dist(car.x, car.y, path[u.waypoint].x, path[u.waypoint].y) < 34) {
        u.waypoint++;
      }
      aimX = path[u.waypoint].x;
      aimY = path[u.waypoint].y;
    }

    var diff = wrapAngle(Math.atan2(aimY - car.y, aimX - car.x) - car.heading);
    var steer = M.clamp(diff * 2.4, -1, 1);
    var throttle = 1;
    if (Math.abs(diff) > 0.9) throttle = 0.35;   // ease into tight corners

    if (u.reverse > 0) {
      u.reverse -= dt;
      car.update(dt, { throttle: -1, steer: -steer });
      car.integrate(dt, world);
      return;
    }

    car.update(dt, { throttle: throttle, steer: steer });
    car.integrate(dt, world);

    var speed = M.len(car.vx, car.vy);
    if (speed < 20 && throttle > 0) u.stuck += dt;
    else u.stuck = Math.max(0, u.stuck - dt);

    // Wedged on a kerb or a parked car: back up and take the corner again.
    if (u.stuck > 1.1) {
      u.stuck = 0;
      u.reverse = 0.5;
      u.path = null;
      u.repath = 0;
    }
  }

  function updateUnit(u, dt) {
    var car = u.car;
    if (!car) { retire(u); return; }

    // main.js may have dropped the car; die quietly with it.
    if (carsRef && carsRef.indexOf(car) === -1) {
      var idx = units.indexOf(u);
      if (idx !== -1) units.splice(idx, 1);
      return;
    }

    var C = CJ.CFG;
    u.life += dt;
    car.brush = (car.brush + dt * 13) % TAU;

    if (u.state === 'out') {
      // A truck that cannot reach its mess gives up and heads home, so a stray
      // unreachable decal cannot pin the whole fleet forever.
      if (u.life > C.CLEANER_GIVEUP) {
        u.state = 'home';
        u.path = null;
        u.waypoint = 0;
        u.repath = 0;
        return;
      }
      driveTo(u, dt, u.tx, u.ty);
      if (M.dist(car.x, car.y, u.tx, u.ty) < C.CLEANER_REACH) {
        u.state = 'wash';
        u.wash = C.CLEANER_WASH_TIME;
        car.vx = 0;
        car.vy = 0;
      }
    } else if (u.state === 'wash') {
      // Park up and scrub: hold still while the brush and water run.
      car.update(dt, { throttle: 0, steer: 0 });
      car.integrate(dt, world);
      car.spraying = true;
      u.wash -= dt;
      if (u.wash <= 0) {
        CJ.Blood.cleanNear(u.tx, u.ty, C.CLEANER_WASH_RADIUS);
        car.spraying = false;
        u.state = 'home';
        u.path = null;
        u.waypoint = 0;
        u.repath = 0;
      }
    } else {
      driveTo(u, dt, u.homeX, u.homeY);
      if (M.dist(car.x, car.y, u.homeX, u.homeY) < C.CLEANER_REACH) retire(u);
    }
  }

  // ------------------------------------------------------------------ API
  function init(w) {
    world = w;
    units = [];
    spawnTimer = 0;
    carsRef = null;
  }

  function reset() {
    for (var i = 0; i < units.length; i++) removeCar(units[i].car);
    units.length = 0;
    spawnTimer = 0;
  }

  function update(dt, cars) {
    if (!world) return;
    if (cars) carsRef = cars;

    // Roll out a truck for the oldest splat that has waited long enough.
    spawnTimer -= dt;
    var waiting = waitingSplat();
    if (waiting && units.length < CJ.CFG.CLEANER_MAX_UNITS && spawnTimer <= 0) {
      spawnTimer = spawnTruck(waiting) ? CJ.CFG.CLEANER_DEPART_DELAY : 0.5;
    }

    for (var i = units.length - 1; i >= 0; i--) updateUnit(units[i], dt);
  }

  // A small read-only view for the HUD, tests and console poking.
  function snapshot() {
    var washing = 0;
    for (var i = 0; i < units.length; i++) {
      if (units[i].state === 'wash') washing++;
    }
    return {
      active: units.length > 0,
      units: units.length,
      washing: washing,
      truck: units.length ? units[0].car : null
    };
  }

  return {
    init: init,
    reset: reset,
    update: update,
    snapshot: snapshot,
    spawnPoint: spawnPoint,          // exposed for tests / debug
    get units() { return units; },
    get active() { return units.length > 0; }
  };
})();
