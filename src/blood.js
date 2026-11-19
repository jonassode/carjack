// Carjack - blood decals left behind by flattened pedestrians.
//
// Splats are permanent (no fade) and drawn on the ground under every entity.
// Each splat caches a Path2D so the per-frame cost is a single fill() call.
window.CJ = window.CJ || {};

CJ.Blood = (function () {
  'use strict';

  var TAU = Math.PI * 2;
  var splats = [];

  function rnd(a, b) { return a + Math.random() * (b - a); }

  function makePath(x, y, blobs) {
    if (typeof Path2D !== 'function') return null;
    var p = new Path2D();
    for (var i = 0; i < blobs.length; i++) {
      var b = blobs[i];
      // ellipse() is baked into the path, so the whole splat is one fill().
      p.moveTo(x + b.x + b.rx, y + b.y);
      p.ellipse(x + b.x, y + b.y, b.rx, b.ry, b.rot, 0, TAU);
    }
    return p;
  }

  // `dirX/dirY` is the impact direction (car velocity or bullet direction) so
  // the spray smears the way the body was travelling.
  function add(x, y, dirX, dirY) {
    var dx = dirX || 0;
    var dy = dirY || 0;
    var l = Math.sqrt(dx * dx + dy * dy);
    if (l > 0.001) { dx /= l; dy /= l; } else { dx = 0; dy = 0; }

    var reach = rnd(22, 38);
    var n = 12 + ((Math.random() * 9) | 0);
    var blobs = [];
    var i;

    // Radiating droplets.
    for (i = 0; i < n; i++) {
      var a = Math.random() * TAU;
      var dist = Math.pow(Math.random(), 1.4) * reach;
      var smear = rnd(0.15, 1.0) * reach * 0.8;
      var r = rnd(2.2, 7.5);
      blobs.push({
        x: Math.cos(a) * dist + dx * smear,
        y: Math.sin(a) * dist + dy * smear,
        rx: r,
        ry: r * rnd(0.65, 1),
        rot: a
      });
    }

    // A few long streaks along the direction of travel.
    var angle = Math.atan2(dy, dx);
    var streaks = 3 + ((Math.random() * 3) | 0);
    for (i = 0; i < streaks; i++) {
      var len = rnd(9, 24);
      var off = rnd(-9, 9);
      blobs.push({
        x: dx * len + dy * off,
        y: dy * len - dx * off,
        rx: len * rnd(1.2, 2.0),
        ry: rnd(2.0, 4.6),
        rot: angle
      });
    }

    splats.push({
      x: x,
      y: y,
      pool: rnd(11, 16),         // central pool radius
      blobs: blobs,
      path: makePath(x, y, blobs),
      age: 0                     // seconds it has been on the ground
    });

    if (splats.length > CJ.CFG.SPLAT_MAX) splats.splice(0, splats.length - CJ.CFG.SPLAT_MAX);
  }

  // Age every decal. main calls this once per fixed step so the street cleaners
  // can tell how long a splat has been lying there. Decals never fade on their
  // own — only a cleaner (or the SPLAT_MAX cap) ever removes them.
  function update(dt) {
    for (var i = 0; i < splats.length; i++) splats[i].age += dt;
  }

  // Remove one decal. Returns true when it was actually on the ground.
  function remove(splat) {
    var i = splats.indexOf(splat);
    if (i === -1) return false;
    splats.splice(i, 1);
    return true;
  }

  // A cleaner scrubs everything within `r` of (x,y). Returns how many it got.
  function cleanNear(x, y, r) {
    var r2 = r * r;
    var got = 0;
    for (var i = splats.length - 1; i >= 0; i--) {
      var dx = splats[i].x - x;
      var dy = splats[i].y - y;
      if (dx * dx + dy * dy <= r2) { splats.splice(i, 1); got++; }
    }
    return got;
  }

  function draw(ctx) {
    if (!splats.length) return;
    var C = CJ.CFG.COL;
    var i, j, s, b;

    ctx.save();

    // Dark central pools first, then the spray on top.
    ctx.fillStyle = C.bloodPool;
    for (i = 0; i < splats.length; i++) {
      s = splats[i];
      var a = (s.blobs.length ? Math.atan2(s.blobs[0].y, s.blobs[0].x) : 0);
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.pool, s.pool * 0.82, a, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = C.blood;
    for (i = 0; i < splats.length; i++) {
      s = splats[i];
      if (s.path) {
        ctx.fill(s.path);
      } else {
        for (j = 0; j < s.blobs.length; j++) {
          b = s.blobs[j];
          ctx.beginPath();
          ctx.ellipse(s.x + b.x, s.y + b.y, b.rx, b.ry, b.rot, 0, TAU);
          ctx.fill();
        }
      }
    }

    ctx.restore();
  }

  function clear() { splats.length = 0; }

  return {
    add: add,
    update: update,
    remove: remove,
    cleanNear: cleanNear,
    draw: draw,
    clear: clear,
    get count() { return splats.length; },
    get splats() { return splats; }
  };
})();