// Carjack - smoothed follow camera (north-up, clamped to the world).
window.CJ = window.CJ || {};

CJ.Camera = (function () {
  'use strict';

  var M = CJ.M;

  var x = 0, y = 0;
  var target = null;
  var view = { w: 1, h: 1 };
  var shakeAmt = 0;
  var shX = 0, shY = 0;

  function setViewport(w, h) { view.w = Math.max(1, w); view.h = Math.max(1, h); }

  function setTarget(obj, snap) {
    target = obj;
    if (snap && obj) { x = obj.x; y = obj.y; }
  }

  function update(dt, world) {
    var C = CJ.CFG;
    if (target) {
      // Look slightly ahead of the direction of travel - this is what makes the
      // camera feel like GTA2 rather than a dead-centre follow cam.
      var tx = target.x + (target.vx || 0) * C.CAM_LEAD;
      var ty = target.y + (target.vy || 0) * C.CAM_LEAD;
      x = M.smooth(x, tx, C.CAM_LERP, dt);
      y = M.smooth(y, ty, C.CAM_LERP, dt);
    }

    var hw = view.w / 2, hh = view.h / 2;
    x = world.w <= view.w ? world.w / 2 : M.clamp(x, hw, world.w - hw);
    y = world.h <= view.h ? world.h / 2 : M.clamp(y, hh, world.h - hh);

    shakeAmt = M.smooth(shakeAmt, 0, C.SHAKE_DECAY, dt);
    if (shakeAmt > 0.05) {
      shX = (Math.random() * 2 - 1) * shakeAmt;
      shY = (Math.random() * 2 - 1) * shakeAmt;
    } else {
      shakeAmt = 0; shX = 0; shY = 0;
    }
  }

  function shake(amount) {
    shakeAmt = Math.min(18, shakeAmt + amount);
  }

  function apply(ctx) {
    ctx.save();
    ctx.translate(
      Math.round(view.w / 2 - x + shX),
      Math.round(view.h / 2 - y + shY)
    );
  }

  function restore(ctx) { ctx.restore(); }

  function screenToWorld(sx, sy) {
    return { x: x + (sx - view.w / 2), y: y + (sy - view.h / 2) };
  }

  function inView(px, py, pad) {
    pad = pad || 40;
    return Math.abs(px - x) < view.w / 2 + pad && Math.abs(py - y) < view.h / 2 + pad;
  }

  return {
    setViewport: setViewport,
    setTarget: setTarget,
    update: update,
    shake: shake,
    apply: apply,
    restore: restore,
    screenToWorld: screenToWorld,
    inView: inView,
    get target() { return target; },
    get view() { return view; },
    get x() { return x; },
    get y() { return y; }
  };
})();