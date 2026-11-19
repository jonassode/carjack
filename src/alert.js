// Carjack - the alert meter: how much the police know about you.
//
// Pure state, no drawing and no police behaviour. The value is 0..100 and the
// HUD paints it as five shields (ALERT_BADGES), each worth 20 points. Crimes
// add heat; after a quiet spell the trail goes cold and it drains away.
window.CJ = window.CJ || {};

CJ.Alert = (function () {
  'use strict';

  var M = CJ.M;

  function Alert() {
    this.value = 0;
    this.idle = 0;          // seconds since the last crime
  }

  // Points one shield is worth (20 with the default tuning).
  Alert.perBadge = function () {
    return CJ.CFG.ALERT_MAX / CJ.CFG.ALERT_BADGES;
  };

  // Add heat for a crime. Anything that is not a positive finite number is
  // ignored, and the meter is capped so it can never run past full.
  Alert.prototype.add = function (amount) {
    if (!isFinite(amount) || amount <= 0) return this.value;
    this.value = Math.min(CJ.CFG.ALERT_MAX, this.value + amount);
    this.idle = 0;
    return this.value;
  };

  Alert.prototype.set = function (value) {
    if (!isFinite(value)) return this.value;
    this.value = M.clamp(value, 0, CJ.CFG.ALERT_MAX);
    this.idle = 0;
    return this.value;
  };

  Alert.prototype.reset = function () {
    this.value = 0;
    this.idle = 0;
    return this.value;
  };

  // Called once per fixed step. Nothing happens until ALERT_COOLDOWN seconds
  // have passed without a crime, then the meter drains linearly.
  Alert.prototype.update = function (dt) {
    if (!(dt > 0)) return this.value;
    this.idle += dt;
    if (this.idle < CJ.CFG.ALERT_COOLDOWN) return this.value;
    this.value = Math.max(0, this.value - CJ.CFG.ALERT_DECAY * dt);
    return this.value;
  };

  // 0..1 for shield `i`: how much of that particular shield is lit. Shield 0
  // fills from 0 to 20 points, shield 1 from 20 to 40, and so on.
  Alert.prototype.fill = function (i) {
    var per = Alert.perBadge();
    return M.clamp((this.value - i * per) / per, 0, 1);
  };

  // Number of completely lit shields.
  Alert.prototype.badges = function () {
    return Math.min(CJ.CFG.ALERT_BADGES,
      Math.floor(this.value / Alert.perBadge()));
  };

  // True once the meter is into the second badge, which is the point where
  // the station sends a car after you.
  Alert.prototype.hot = function () {
    return this.value >= CJ.CFG.ALERT_CHASE_AT;
  };

  return Alert;
})();