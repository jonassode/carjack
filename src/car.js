// Carjack - arcade car with a forward/lateral velocity model.
//
// Velocity is split into "forward" (along the car) and "lateral" (sideways).
// Lateral speed decays with grip, which is what produces the GTA2-style slide.
window.CJ = window.CJ || {};

CJ.Car = (function () {
  'use strict';

  var M = CJ.M;

  function rr(ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function Car(o) {
    o = o || {};
    this.x = o.x || 0;
    this.y = o.y || 0;
    this.heading = o.h || 0;
    this.vx = 0;
    this.vy = 0;
    this.color = o.color || CJ.CFG.CAR_COLORS[0];
    this.hp = o.hp || CJ.CFG.CAR_HP;

    // Optional overrides: police cars are quicker and tougher than parked ones.
    this.maxSpeed = o.maxSpeed || CJ.CFG.CAR_MAX;
    this.accel = o.accel || CJ.CFG.CAR_ACCEL;
    this.police = !!o.police;
    this.abandoned = false;  // a squad car whose crew is gone: free to steal
    this.auto = false;       // true while the police AI is driving
    this.siren = 0;          // light-bar phase, in radians
    this.ramCd = 0;          // seconds until a ram can hurt the player again

    this.driver = null;      // a Player (or cop) while occupied
    this.throttle = 0;
    this.steer = 0;
    this.brake = false;
    this.speed = 0;          // forward speed, for the HUD
    this.lastImpact = 0;
    this.cleaner = !!o.cleaner; // a street-cleaner depot truck
    this.brush = 0;          // spinning-brush phase, in radians
    this.spraying = false;   // true while scrubbing a splat away
  }

  // ------------------------------------------------------------------ physics
  Car.prototype.update = function (dt, ctrl) {
    var C = CJ.CFG;
    if (this.ramCd > 0) this.ramCd -= dt;

    // Basis from the *current* heading.
    var cosH = Math.cos(this.heading);
    var sinH = Math.sin(this.heading);
    var fx = cosH, fy = sinH;
    var rx = -sinH, ry = cosH;

    var fwd = this.vx * fx + this.vy * fy;
    var lat = this.vx * rx + this.vy * ry;

    var throttle = ctrl ? ctrl.throttle : 0;
    var steer = ctrl ? ctrl.steer : 0;

    // Throttle / brake / reverse.
    if (throttle > 0) {
      fwd += this.accel * dt;
    } else if (throttle < 0) {
      if (fwd > 12) fwd -= C.CAR_BRAKE * dt;        // pressed S while rolling forward
      else fwd -= this.accel * 0.7 * dt;            // reverse
    }

    // Rolling resistance, never overshooting zero.
    if (fwd > 0) fwd = Math.max(0, fwd - C.CAR_ROLL * dt);
    else if (fwd < 0) fwd = Math.min(0, fwd + C.CAR_ROLL * dt);

    fwd = M.clamp(fwd, C.CAR_MAX_REV, this.maxSpeed);

    // Lateral grip: exponential so it is frame-rate independent.
    lat *= Math.exp(-C.GRIP * dt);

    // Steering authority scales with speed and flips when reversing.
    var authority = Math.min(1, Math.abs(fwd) / C.STEER_REF);
    var dir = fwd < 0 ? -1 : 1;
    this.heading += steer * C.STEER_RATE * authority * dir * dt;
    if (this.heading > Math.PI) this.heading -= Math.PI * 2;
    if (this.heading < -Math.PI) this.heading += Math.PI * 2;

    // Rebuild world velocity on the OLD basis so momentum keeps its direction
    // for one frame - that one frame is the drift.
    this.vx = fx * fwd + rx * lat;
    this.vy = fy * fwd + ry * lat;

    this.throttle = throttle;
    this.steer = steer;
    this.brake = throttle < 0 && fwd > 12;
    this.speed = fwd;
  };

  // Three overlapping circles sampled along the body axis = a capsule.
  Car.prototype.bodyCircles = function () {
    var C = CJ.CFG;
    var cosH = Math.cos(this.heading);
    var sinH = Math.sin(this.heading);
    var off = C.CAR_LEN / 2 - C.CAR_RADIUS;
    return [
      { x: this.x + cosH * off, y: this.y + sinH * off, r: C.CAR_RADIUS },
      { x: this.x, y: this.y, r: C.CAR_RADIUS },
      { x: this.x - cosH * off, y: this.y - sinH * off, r: C.CAR_RADIUS }
    ];
  };

  // Push the car out of any solid it overlaps. Returns impact speed (px/s).
  Car.prototype.resolve = function (world) {
    var C = CJ.CFG;
    var hits = [];
    var pass, i, j, circles, near, res;

    for (pass = 0; pass < 3; pass++) {
      var any = false;
      circles = this.bodyCircles();
      for (i = 0; i < circles.length; i++) {
        near = world.solidsNear(circles[i].x, circles[i].y, circles[i].r);
        for (j = 0; j < near.length; j++) {
          res = M.circleVsAABB(circles[i].x, circles[i].y, circles[i].r, near[j]);
          if (res) {
            this.x += res.nx * res.depth;
            this.y += res.ny * res.depth;
            hits.push(res);
            any = true;
            break; // re-evaluate the geometry after moving
          }
        }
      }
      if (!any) break;
    }

    // Keep the car inside the world rectangle.
    var r = C.CAR_RADIUS;
    if (this.x < r) { this.x = r; hits.push({ nx: 1, ny: 0 }); }
    if (this.y < r) { this.y = r; hits.push({ nx: 0, ny: 1 }); }
    if (this.x > world.w - r) { this.x = world.w - r; hits.push({ nx: -1, ny: 0 }); }
    if (this.y > world.h - r) { this.y = world.h - r; hits.push({ nx: 0, ny: -1 }); }

    var impact = 0;
    for (i = 0; i < hits.length; i++) {
      var vn = M.cancelInto(this, hits[i].nx, hits[i].ny);
      impact = Math.max(impact, -vn);
    }

    if (impact > 40) {
      // A real crash: scrub speed, dent the car.
      var damp = C.CAR_CRASH_DAMP + (1 - C.CAR_CRASH_DAMP) * (1 - Math.min(1, impact / 400));
      this.vx *= damp;
      this.vy *= damp;
      this.hp = Math.max(0, this.hp - impact * 0.05);
    }

    this.lastImpact = impact;
    return impact;
  };

  // Move with sub-steps so a fast car cannot tunnel through a thin wall.
  Car.prototype.integrate = function (dt, world) {
    var speed = M.len(this.vx, this.vy);
    var stepLen = CJ.CFG.TILE * 0.4;
    var steps = Math.max(1, Math.min(8, Math.ceil(speed * dt / stepLen)));
    var h = dt / steps;
    var impact = 0;
    for (var i = 0; i < steps; i++) {
      this.x += this.vx * h;
      this.y += this.vy * h;
      impact = Math.max(impact, this.resolve(world));
    }
    return impact;
  };

  Car.prototype.containsPoint = function (px, py, pad) {
    pad = pad || 0;
    return M.dist(this.x, this.y, px, py) <= CJ.CFG.CAR_LEN / 2 + pad;
  };

  // Whether the player may hop in. Never a sweeper, and never a squad car that
  // still has its officers — but a squad car whose crew is down is fair game.
  Car.prototype.canEnter = function () {
    if (this.cleaner) return false;
    if (this.police && !this.abandoned) return false;
    return true;
  };

  // Headlights (and the cones they throw) are only on while someone is driving.
  // A police car keeps its lights on even when the officers have bailed out; a
  // street cleaner never runs headlights at all.
  Car.prototype.lightsOn = function () {
    if (this.cleaner) return false;
    return !!this.driver || this.police;
  };

  Car.prototype.render = render;

  return Car;

  // ------------------------------------------------------------------ render
  function render(ctx) {
    var C = CJ.CFG;
    var L = C.CAR_LEN;
    var W = C.CAR_W;
    var lights = this.lightsOn();

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.heading);

    // Headlight cones, under everything else, and only for a car in use.
    if (lights) {
      ctx.fillStyle = 'rgba(255,246,205,0.055)';
      ctx.beginPath();
      ctx.moveTo(L / 2, -W * 0.34);
      ctx.lineTo(L / 2 + 130, -64);
      ctx.lineTo(L / 2 + 130, 64);
      ctx.lineTo(L / 2, W * 0.34);
      ctx.closePath();
      ctx.fill();
    }

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    rr(ctx, -L / 2 + 5, -W / 2 + 6, L, W, 6);
    ctx.fill();

    // Wheels (the front pair turns with the steering input).
    ctx.fillStyle = '#15181c';
    var wx = [L * 0.30, L * 0.30, -L * 0.28, -L * 0.28];
    var wy = [-W * 0.54, W * 0.54, -W * 0.54, W * 0.54];
    var wa = [this.steer * 0.42, this.steer * 0.42, 0, 0];
    for (var i = 0; i < 4; i++) {
      ctx.save();
      ctx.translate(wx[i], wy[i]);
      ctx.rotate(wa[i]);
      ctx.fillRect(-5.5, -2.6, 11, 5.2);
      ctx.restore();
    }

    // Body.
    ctx.fillStyle = this.color;
    rr(ctx, -L / 2, -W / 2, L, W, 6);
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(0,0,0,0.38)';
    ctx.stroke();

    // Squad-car livery: a blue band over the doors with a white door panel.
    if (this.police) {
      ctx.fillStyle = CJ.CFG.COL.policeStripe;
      rr(ctx, -L * 0.10, -W / 2, L * 0.30, W, 3);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.90)';
      rr(ctx, L * 0.02, -W * 0.30, L * 0.10, W * 0.60, 2);
      ctx.fill();
    }

    // Street-cleaner livery: a water tank on the deck, an amber beacon and a
    // spinning brush under the nose, throwing a low splash of water while it
    // scrubs. No headlights, and no forward beam of any kind.
    if (this.cleaner) {
      var CL = CJ.CFG.COL;

      // Rear water tank.
      ctx.fillStyle = CL.cleanerTank;
      rr(ctx, -L * 0.44, -W * 0.40, L * 0.30, W * 0.80, 5);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.30)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Hazard stripe across the flank.
      ctx.fillStyle = CL.cleanerTrim;
      rr(ctx, -L * 0.06, -W / 2, L * 0.20, W, 2);
      ctx.fill();

      // Amber beacon, pulsing with the brush.
      var on = (0.55 + 0.45 * Math.sin(this.brush * 2)).toFixed(3);
      ctx.fillStyle = 'rgba(255,176,50,' + on + ')';
      ctx.beginPath();
      ctx.arc(L * 0.01, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();

      // Spinning brush under the nose.
      ctx.save();
      ctx.translate(L / 2 - 4, 0);
      ctx.rotate(this.brush);
      ctx.strokeStyle = CL.cleanerBrush;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (var bb = 0; bb < 8; bb++) {
        var ba = (bb / 8) * Math.PI * 2;
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(ba) * 8, Math.sin(ba) * 8);
      }
      ctx.stroke();
      ctx.fillStyle = 'rgba(40,46,54,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, 3.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Water while it scrubs: a low halo of splashing droplets around the
      // brush, not a forward beam (the sweeper runs no headlights).
      if (this.spraying) {
        var ox = L / 2 - 4;
        ctx.strokeStyle = CL.water;
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        for (var wd = 0; wd < 9; wd++) {
          var wa = (wd / 9) * Math.PI * 2 + this.brush * 0.4;
          ctx.moveTo(ox + Math.cos(wa) * 10, Math.sin(wa) * 11);
          ctx.lineTo(ox + Math.cos(wa) * 17, Math.sin(wa) * 18);
        }
        ctx.stroke();
        ctx.lineCap = 'butt';
      }
    }

    // Cabin + glass.
    ctx.fillStyle = 'rgba(0,0,0,0.20)';
    rr(ctx, -L * 0.24, -W * 0.36, L * 0.46, W * 0.72, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,200,235,0.55)';
    rr(ctx, L * 0.10, -W * 0.33, L * 0.14, W * 0.66, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(150,200,235,0.32)';
    rr(ctx, -L * 0.33, -W * 0.31, L * 0.09, W * 0.62, 3);
    ctx.fill();

    // Roof light bar: red and blue halves that chase each other.
    if (this.police) {
      var pulse = Math.sin(this.siren);
      var red = Math.max(0, pulse);
      var blue = Math.max(0, -pulse);
      var glow = 0.10;

      ctx.fillStyle = 'rgba(16,20,26,0.95)';
      ctx.fillRect(-L * 0.04, -W * 0.44, 6, W * 0.88);
      ctx.fillStyle = 'rgba(255,59,48,' + (0.30 + 0.70 * red).toFixed(3) + ')';
      ctx.fillRect(-L * 0.04, -W * 0.42, 6, W * 0.40);
      ctx.fillStyle = 'rgba(59,130,255,' + (0.30 + 0.70 * blue).toFixed(3) + ')';
      ctx.fillRect(-L * 0.04, W * 0.02, 6, W * 0.40);

      // A little light spill so the bar reads at a glance.
      ctx.fillStyle = 'rgba(255,59,48,' + (glow * red).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(-L * 0.04, -W * 0.30, 40, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(59,130,255,' + (glow * blue).toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(-L * 0.04, W * 0.30, 40, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lamps: warm lenses while driven, dark glass while parked.
    ctx.fillStyle = lights ? 'rgba(255,240,190,0.90)' : 'rgba(22,27,33,0.55)';
    ctx.fillRect(L / 2 - 3, -W * 0.42 - 2, 3, 5);
    ctx.fillRect(L / 2 - 3, W * 0.42 - 3, 3, 5);
    if (this.brake) {
      ctx.fillStyle = 'rgba(255,60,40,0.95)';
      ctx.fillRect(-L / 2, -W * 0.42 - 2, 3, 5);
      ctx.fillRect(-L / 2, W * 0.42 - 3, 3, 5);
    }

    ctx.restore();
  }
})();