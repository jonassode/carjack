// Carjack - HUD: DOM text panels + canvas minimap / debug overlay.
window.CJ = window.CJ || {};

CJ.HUD = (function () {
  'use strict';

  var els = {};
  var badges = [];

  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  // The five shields are built once from config so markup and tuning agree.
  function buildBadges() {
    badges = [];
    if (!els.alertBadges) return;
    els.alertBadges.innerHTML = '';
    for (var i = 0; i < CJ.CFG.ALERT_BADGES; i++) {
      var b = document.createElement('span');
      b.className = 'badge';
      b.style.setProperty('--fill', '0%');
      els.alertBadges.appendChild(b);
      badges.push(b);
    }
  }

  function init() {
    els.mode = document.getElementById('hud-mode');
    els.speed = document.getElementById('hud-speed');
    els.speedUnit = document.getElementById('hud-speed-unit');
    els.healthFill = document.getElementById('hud-health-fill');
    els.healthText = document.getElementById('hud-health-text');
    els.money = document.getElementById('hud-money');
    els.alertText = document.getElementById('hud-alert-text');
    els.alertBadges = document.getElementById('hud-alert-badges');
    els.wasted = document.getElementById('hud-wasted');
    els.wastedMoney = document.getElementById('hud-wasted-money');
    els.respawnBtn = document.getElementById('hud-respawn');
    els.busted = document.getElementById('hud-busted');
    els.bustedMoney = document.getElementById('hud-busted-money');
    els.bustedBtn = document.getElementById('hud-busted-respawn');
    els.carHealth = document.getElementById('hud-car-health');
    els.carHealthFill = document.getElementById('hud-car-health-fill');
    els.hint = document.getElementById('hud-hint');
    els.paused = document.getElementById('hud-paused');
    buildBadges();
  }

  function update(s) {
    var driving = !!s.player.driving;
    setText(els.mode, driving ? 'DRIVING' : 'ON FOOT');
    if (els.mode) els.mode.className = driving ? 'mode driving' : 'mode foot';

    var kmh = driving ? Math.round(Math.abs(s.player.driving.speed) * 0.12) : 0;
    setText(els.speed, String(kmh));
    if (els.speedUnit) els.speedUnit.style.opacity = driving ? '1' : '0.25';

    var hp = Math.max(0, s.player.hp) / CJ.CFG.P_HP;
    if (els.healthFill) {
      els.healthFill.style.width = (hp * 100).toFixed(0) + '%';
      els.healthFill.style.background = hp > 0.5
        ? 'linear-gradient(90deg, #48d17a, #8ff0a4)'
        : (hp > 0.25
            ? 'linear-gradient(90deg, #d1a248, #ffd15c)'
            : 'linear-gradient(90deg, #c0392b, #ff6b5a)');
    }
    if (els.healthText) setText(els.healthText, String(Math.ceil(Math.max(0, s.player.hp))));
    if (els.money) setText(els.money, '$' + Math.round(Math.max(0, s.player.money)));

    // --- alert meter: five shields, ALERT_MAX / ALERT_BADGES points each ----
    var meter = s.alert;
    if (els.alertText) {
      setText(els.alertText, String(Math.round(meter ? meter.value : 0)));
    }
    for (var b = 0; b < badges.length; b++) {
      var fill = meter ? meter.fill(b) : 0;
      var pct = (fill * 100).toFixed(0) + '%';
      if (badges[b]._fill !== pct) {
        badges[b].style.setProperty('--fill', pct);
        badges[b]._fill = pct;
      }
      var cls = 'badge' +
        (fill >= 0.999 ? ' on' : '') +
        (s.chase ? ' alerted' : '');
      if (badges[b].className !== cls) badges[b].className = cls;
    }

    if (els.carHealth) els.carHealth.style.display = driving ? 'block' : 'none';
    if (driving && els.carHealthFill) {
      var chp = Math.max(0, s.player.driving.hp) / CJ.CFG.CAR_HP;
      els.carHealthFill.style.width = (chp * 100).toFixed(0) + '%';
    }

    if (els.hint) {
      var hint = driving
        ? 'ARROWS / WASD drive   ·   E get out   ·   R reset   ·   P pause   ·   F1 debug'
        : 'ARROWS / WASD run   ·   MOUSE / CLICK shoot   ·   E enter car   ·   R reset   ·   P pause   ·   F1 debug';
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

    // Cars: green for yours, blue for the police, amber for a street cleaner,
    // yellow for parked ones.
    for (var i = 0; i < s.cars.length; i++) {
      var car = s.cars[i];
      ctx.fillStyle = car.police ? '#5b9bff'
        : (car.cleaner ? '#f0a93a'
        : (car === s.player.driving ? '#7ee081' : '#e8c04a'));
      ctx.fillRect(ox + car.x * sx - 2, oy + car.y * sy - 2, 4, 4);
    }

    // Player blip (hidden while driving, the car blip stands in).
    if (!s.player.driving) {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(ox + s.player.x * sx, oy + s.player.y * sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Officers on foot, so you can see them closing in on the minimap.
    var cops = CJ.Police.targets();
    for (var ci = 0; ci < cops.length; ci++) {
      ctx.fillStyle = '#9cc6ff';
      ctx.beginPath();
      ctx.arc(ox + cops[ci].x * sx, oy + cops[ci].y * sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Special buildings: blue ring for the police station, red cross for the
    // hospital, amber ring for the cleaner depot. Drawn on top so they are
    // findable at a glance.
    var specials = [
      { rect: world.policeStation, color: '#5b9bff' },
      { rect: world.hospital, color: '#ff5a4a' },
      { rect: world.depot, color: '#f0a93a' }
    ];
    for (var k = 0; k < specials.length; k++) {
      var rect = specials[k].rect;
      if (!rect) continue;
      ctx.strokeStyle = specials[k].color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        ox + rect.x * sx + 0.5,
        oy + rect.y * sy + 0.5,
        Math.max(3, rect.w * sx),
        Math.max(3, rect.h * sy)
      );
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
      'hp ' + Math.ceil(s.player.hp) + '/' + CJ.CFG.P_HP +
        (s.player.driving ? '  car ' + Math.max(0, Math.ceil(s.player.driving.hp)) : ''),
      'peds ' + CJ.Peds.aliveCount + '/' + CJ.Peds.list.length + '  kills ' + CJ.Peds.kills,
      'alert ' + Math.round(CJ.Police.alert) + '  ' +
        (CJ.Police.active
          ? 'POLICE ' + CJ.Police.snapshot().cars + ' cars / ' +
            CJ.Police.snapshot().afoot + ' afoot'
          : 'police idle'),
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

  var respawnCb = null;
  var bustRespawnCb = null;

  // main.js hands us the respawn routines; the overlay buttons just call them.
  function wire(btn, set) {
    if (!btn || btn._wired) return;
    btn._wired = true;
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      if (set) set();
    });
  }

  function onRespawn(fn) {
    respawnCb = fn;
    wire(els.respawnBtn, function () { if (respawnCb) respawnCb(); });
  }

  function onBustRespawn(fn) {
    bustRespawnCb = fn;
    wire(els.bustedBtn, function () { if (bustRespawnCb) bustRespawnCb(); });
  }

  function showWasted(moneyLeft, cost) {
    if (!els.wasted) return;
    hideBusted();
    if (els.wastedMoney) {
      setText(els.wastedMoney, '-' + '$' + cost + '   ·   $' + Math.round(moneyLeft) + ' left');
    }
    els.wasted.style.display = 'flex';
    if (els.respawnBtn) els.respawnBtn.focus();
  }

  function hideWasted() {
    if (els.wasted) els.wasted.style.display = 'none';
  }

  function showBusted(moneyLeft, cost) {
    if (!els.busted) return;
    hideWasted();
    if (els.bustedMoney) {
      setText(els.bustedMoney, '-' + '$' + cost + '   ·   $' + Math.round(moneyLeft) + ' left');
    }
    els.busted.style.display = 'flex';
    if (els.bustedBtn) els.bustedBtn.focus();
  }

  function hideBusted() {
    if (els.busted) els.busted.style.display = 'none';
  }

  return {
    init: init,
    update: update,
    draw: draw,
    onRespawn: onRespawn,
    onBustRespawn: onBustRespawn,
    showWasted: showWasted,
    hideWasted: hideWasted,
    showBusted: showBusted,
    hideBusted: hideBusted
  };
})();