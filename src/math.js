// Carjack - tiny math + collision helpers. Everything is axis aligned boxes
// and circles, so we only need a handful of primitives.
window.CJ = window.CJ || {};

CJ.M = (function () {
  'use strict';

  var EPS = 1e-9;

  function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function sign(v) { return v < 0 ? -1 : (v > 0 ? 1 : 0); }
  function len(x, y) { return Math.sqrt(x * x + y * y); }
  function dist(ax, ay, bx, by) { return Math.sqrt((bx - ax) * (bx - ax) + (by - ay) * (by - ay)); }
  function dot(ax, ay, bx, by) { return ax * bx + ay * by; }

  function norm(x, y) {
    var l = len(x, y);
    return l > EPS ? { x: x / l, y: y / l } : { x: 0, y: 0 };
  }

  // Rotate a vector by `a` radians.
  function rot(x, y, a) {
    var c = Math.cos(a), s = Math.sin(a);
    return { x: x * c - y * s, y: x * s + y * c };
  }

  // Exponential smoothing that is stable for any dt.
  function smooth(current, target, rate, dt) {
    return current + (target - current) * (1 - Math.exp(-rate * dt));
  }

  // Take `amount` off `balance`, never going below zero. Pure so the "you can
  // never be in debt" rule is testable in isolation.
  function charge(balance, amount) {
    if (!isFinite(balance)) return 0;
    if (!(amount > 0)) return Math.max(0, balance);
    return Math.max(0, balance - amount);
  }

  // Damage from an explosion: full `maxAmount` at the centre, falling off
  // linearly to zero at `radius`. Negative or NaN distances clamp safely.
  function blastDamage(dist, radius, maxAmount) {
    if (!(radius > 0) || !isFinite(dist)) return 0;
    if (dist <= 0) return maxAmount;
    if (dist >= radius) return 0;
    return maxAmount * (1 - dist / radius);
  }

  // Deterministic 0..1 hash for stable per-tile colour variation.
  function hash2(x, y) {
    var h = x * 374761393 + y * 668265263;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return ((h >>> 0) % 1000) / 1000;
  }

  // ---------------------------------------------------------------- circle vs AABB
  // Returns null when clear, else { nx, ny, depth } pointing OUT of the rect.
  function circleVsAABB(cx, cy, r, b) {
    var nearX = clamp(cx, b.x, b.x + b.w);
    var nearY = clamp(cy, b.y, b.y + b.h);
    var dx = cx - nearX;
    var dy = cy - nearY;
    var d2 = dx * dx + dy * dy;

    if (d2 > r * r) return null;

    if (d2 > EPS) {
      var d = Math.sqrt(d2);
      return { nx: dx / d, ny: dy / d, depth: r - d };
    }

    // Circle centre is inside the box: escape along the shallowest axis.
    var left = cx - b.x;
    var right = (b.x + b.w) - cx;
    var top = cy - b.y;
    var bottom = (b.y + b.h) - cy;
    var m = Math.min(left, right, top, bottom);

    if (m === left) return { nx: -1, ny: 0, depth: left + r };
    if (m === right) return { nx: 1, ny: 0, depth: right + r };
    if (m === top) return { nx: 0, ny: -1, depth: top + r };
    return { nx: 0, ny: 1, depth: bottom + r };
  }

  // ---------------------------------------------------------------- segment vs AABB
  // Slab method. Returns the hit parameter t in [0,1], or -1 if no hit.
  function segVsAABB(x1, y1, x2, y2, b) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var tmin = 0;
    var tmax = 1;

    // X slab
    if (Math.abs(dx) < EPS) {
      if (x1 < b.x || x1 > b.x + b.w) return -1;
    } else {
      var tx1 = (b.x - x1) / dx;
      var tx2 = (b.x + b.w - x1) / dx;
      if (tx1 > tx2) { var tmpX = tx1; tx1 = tx2; tx2 = tmpX; }
      tmin = Math.max(tmin, tx1);
      tmax = Math.min(tmax, tx2);
      if (tmin > tmax) return -1;
    }

    // Y slab
    if (Math.abs(dy) < EPS) {
      if (y1 < b.y || y1 > b.y + b.h) return -1;
    } else {
      var ty1 = (b.y - y1) / dy;
      var ty2 = (b.y + b.h - y1) / dy;
      if (ty1 > ty2) { var tmpY = ty1; ty1 = ty2; ty2 = tmpY; }
      tmin = Math.max(tmin, ty1);
      tmax = Math.min(tmax, ty2);
      if (tmin > tmax) return -1;
    }

    return tmin;
  }

  // ---------------------------------------------------------------- circle vs circle
  function circleVsCircle(ax, ay, ar, bx, by, br) {
    var dx = ax - bx;
    var dy = ay - by;
    var r = ar + br;
    var d2 = dx * dx + dy * dy;
    if (d2 > r * r || d2 < EPS) return null;
    var d = Math.sqrt(d2);
    return { nx: dx / d, ny: dy / d, depth: r - d };
  }

  // Move `obj` (has x,y) out of any solid it overlaps. Returns the normals hit.
  function pushOutOfSolids(obj, r, solids) {
    var hits = [];
    for (var i = 0; i < solids.length; i++) {
      var res = circleVsAABB(obj.x, obj.y, r, solids[i]);
      if (res) {
        obj.x += res.nx * res.depth;
        obj.y += res.ny * res.depth;
        hits.push(res);
      }
    }
    return hits;
  }

  // Remove the velocity component going into a contact normal.
  function cancelInto(obj, nx, ny) {
    var vn = obj.vx * nx + obj.vy * ny;
    if (vn < 0) {
      obj.vx -= nx * vn;
      obj.vy -= ny * vn;
    }
    return vn;
  }

  return {
    EPS: EPS,
    clamp: clamp,
    lerp: lerp,
    sign: sign,
    len: len,
    dist: dist,
    dot: dot,
    norm: norm,
    rot: rot,
    smooth: smooth,
    blastDamage: blastDamage,
    charge: charge,
    hash2: hash2,
    circleVsAABB: circleVsAABB,
    segVsAABB: segVsAABB,
    circleVsCircle: circleVsCircle,
    pushOutOfSolids: pushOutOfSolids,
    cancelInto: cancelInto
  };
})();