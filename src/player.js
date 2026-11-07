// Carjack - the on-foot player.
window.CJ = window.CJ || {};

CJ.Player = (function () {
  'use strict';

  var M = CJ.M;

  function Player(x, y) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = CJ.CFG.P_RADIUS;
    this.hp = CJ.CFG.P_HP;
    this.money = CJ.CFG.MONEY_START;   // dollars
    this.dead = false;      // true between being wiped out and pressing respawn
    this.aim = 0;          // radians, drives the gun
    this.face = 0;         // radians, drives the body
    this.walk = 0;         // animation phase
    this.fireCd = 0;
    this.driving = null;   // Car while inside one
    this.recoil = 0;
  }

  Player.prototype.isDriving = function () { return !!this.driving; };

  Player.prototype.update = function (dt, axis, world) {
    var C = CJ.CFG;
    if (this.fireCd > 0) this.fireCd -= dt;
    this.recoil = M.smooth(this.recoil, 0, 18, dt);
    if (this.driving) return;

    var tx = axis.x * C.P_SPEED;
    var ty = axis.y * C.P_SPEED;
    this.vx = M.smooth(this.vx, tx, C.P_ACCEL, dt);
    this.vy = M.smooth(this.vy, ty, C.P_ACCEL, dt);

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.collide(world);

    var speed = M.len(this.vx, this.vy);
    if (speed > 14) this.face = Math.atan2(this.vy, this.vx);
    this.walk += speed * dt * 0.10;
  };

  // Circle vs every nearby box; two passes so inner corners settle.
  Player.prototype.collide = function (world) {
    var r = this.radius;
    for (var pass = 0; pass < 2; pass++) {
      var near = world.solidsNear(this.x, this.y, r);
      var moved = false;
      for (var i = 0; i < near.length; i++) {
        var res = M.circleVsAABB(this.x, this.y, r, near[i]);
        if (res) {
          this.x += res.nx * res.depth;
          this.y += res.ny * res.depth;
          M.cancelInto(this, res.nx, res.ny);
          moved = true;
        }
      }
      if (!moved) break;
    }

    // World bounds.
    if (this.x < r) { this.x = r; this.vx = Math.max(0, this.vx); }
    if (this.y < r) { this.y = r; this.vy = Math.max(0, this.vy); }
    if (this.x > world.w - r) { this.x = world.w - r; this.vx = Math.min(0, this.vx); }
    if (this.y > world.h - r) { this.y = world.h - r; this.vy = Math.min(0, this.vy); }
  };

  // Where the muzzle sits, and which way it points.
  Player.prototype.muzzle = function () {
    var r = this.radius + 6;
    return {
      x: this.x + Math.cos(this.aim) * r,
      y: this.y + Math.sin(this.aim) * r
    };
  };

  Player.prototype.canFire = function () { return !this.driving && this.fireCd <= 0; };

  Player.prototype.draw = function (ctx) {
    var C = CJ.CFG;
    var r = this.radius;

    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath();
    ctx.ellipse(this.x + 3, this.y + 4, r * 1.02, r * 0.72, 0, 0, Math.PI * 2);
    ctx.fill();

    // Legs shuffle while walking.
    var swing = Math.sin(this.walk) * (M.len(this.vx, this.vy) > 14 ? 4 : 0);
    ctx.strokeStyle = '#2b3138';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(this.x - 3, this.y - 1);
    ctx.lineTo(this.x - 3 + swing * 0.4, this.y + 6 + swing);
    ctx.moveTo(this.x + 3, this.y - 1);
    ctx.lineTo(this.x + 3 - swing * 0.4, this.y + 6 - swing);
    ctx.stroke();

    // Body.
    ctx.fillStyle = C.player;
    ctx.beginPath();
    ctx.arc(this.x, this.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(10,14,20,0.85)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Jacket / facing wedge.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.face);
    ctx.fillStyle = 'rgba(62,74,92,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.62, -0.55, 0.55);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // Gun, aimed at the mouse.
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.aim);
    var back = this.recoil * 3;
    ctx.fillStyle = '#3a4048';
    ctx.fillRect(r * 0.45 - back, -1.8, 11, 3.6);
    ctx.fillStyle = C.skin;
    ctx.beginPath();
    ctx.arc(r * 0.55 - back, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  };

  return Player;
})();