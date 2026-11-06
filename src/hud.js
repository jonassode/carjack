// Carjack - HUD: DOM text panels + canvas minimap / debug overlay.
window.CJ = window.CJ || {};

CJ.HUD = (function () {
  'use strict';

  var els = {};

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  function init() {
    els.mode = document.getElementById('hud-mode');
    els.speed = document.getElementById('hud-speed');
    els.speedUnit = document.getElementById('hud-speed-unit');
    els.healthFill = document.getElementById('hud-health-fill');
    els.carHealth = document.getElementById('hud-car-health');
    els.carHealthFill = document.getElementById('hud-car-health-fill');
    els.hint = document.getElementById('hud-hint');
    els.paused = document.getElementById('hud-paused');
  }

  function update(s) {
    var driving = !!s.player.driving;
    setText(els.mode, driving ? 'DRIVING' : 'ON FOOT');
    if (els.mode) els.mode.className = driving ? 'mode driving' : 'mode foot';

    var kmh = driving ? Math.round(Math.abs(s.player.driving.speed) * 0.12) : 0;
    setText(els.speed, String(kmh));
    if (els.speedUnit) els.speedUnit.style.opacity = driving ? '1' : '0.25';

    var hp = Math.max(0, s.player.hp) / CJ.CFG.P_HP;
    if (els.healthFill) els.healthFill.style.width = (hp * 100).toFixed(0) + '%';

    if (els.carHealth) els.carHealth.style.display = driving ? 'block' : 'none';
    if (driving && els.carHealthFill) {
      var chp = Math.max(0, s.player.driving.hp) / CJ.CFG.CAR_HP;
      els.carHealthFill.style.width = (chp * 100).toFixed(0) + '%';
    }

    if (els.hint) {
      var hint = driving
        ? 'ARROWS / WASD drive   ·   E get out   ·   R reset   ·   P pause   ·   F1 debug'
        : 'ARROWS / WASD run   ·   SPACE shoot   ·   E enter car   ·   R reset   ·   P pause   ·   F1 debug';
      setText(els.hint, hint);
    }

    if (els.paused) els.paused.style.display = s.paused ? 'flex' : 'none';
  }

  // Minimap + debug text, drawn in screen space (after the camera transform).
  function draw(ctx, s) {
    var view = s.cam.view;
    var size = Math.min(168, Math.max(110, Math.round(Math.min(view.w, view.h) * 0.22)));
    var ox = view.w - size - 16;
    var oy = 16;
    var world = s.world;

    // Frame.
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,14,0.72)';
    ctx.fillRect(ox - 4, oy - 4, size + 8, size + 8);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1;
    ctx.strokeRect(ox - 3.5, oy - 3.5, size + 7, size + 7);
    ctx.restore();

    world.drawMinimap(ctx, ox, oy, size);

    var sx = size / world.w;
    var sy = size / world.h;

    ctx.save();
    // Camera view rectangle.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(
      ox + (s.cam.x - view.w / 2) * sx,
      oy + (s.cam.y - view.h / 2) * sy,
      view.w * sx,
      view.h * sy
    );

    // Cars.
    for (var i = 0; i < s.cars.length; i++) {
      var car = s.cars[i];
      ctx.fillStyle = car === s.player.driving ? '#7ee081' : '#e8c04a';
      ctx.fillRect(ox + car.x * sx - 2, oy + car.y * sy - 2, 4, 4);
    }

    // Player blip (hidden while driving, the car blip stands in).
    if (!s.player.driving) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + s.player.x * sx, oy + s.player.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    if (s.debug) drawDebug(ctx, s);
  }

  function drawDebug(ctx, s) {
    var lines = [
      'fps ' + s.fps.toFixed(0),
      'cam ' + s.cam.x.toFixed(0) + ',' + s.cam.y.toFixed(0),
      'pos ' + (s.player.driving ? s.player.driving.x : s.player.x).toFixed(0) + ',' +
               (s.player.driving ? s.player.driving.y : s.player.y).toFixed(0),
      'bullets ' + CJ.Bullets.liveCount,
      'peds ' + CJ.Peds.aliveCount + '/' + CJ.Peds.list.length + '  kills ' + CJ.Peds.kills,
      'splats ' + CJ.Blood.count,
      'loops ' + CJ.Peds.loops.length,
      'solids ' + s.world.solids.length,
      'mode ' + (s.player.driving ? 'car' : 'foot')
    ];
    ctx.save();
    ctx.fillStyle = 'rgba(8,10,14,0.72)';
    ctx.fillRect(14, 14, 190, 18 + lines.length * 15);
    ctx.fillStyle = '#8ff0a4';
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.textBaseline = 'top';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 24, 22 + i * 15);
    }
    ctx.restore();
  }

  return { init: init, update: update, draw: draw };
})();