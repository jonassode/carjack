// Carjack - keyboard / mouse state with edge-triggered keys.
window.CJ = window.CJ || {};

CJ.Input = (function () {
  'use strict';

  var keys = {};        // event.code -> true while held
  var pressed = {};     // event.code -> true for exactly one sim step
  var mouse = { sx: 0, sy: 0, down: false, inside: false, moved: false };

  // Both WASD and the arrow keys drive the same axes.
  var AXES = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight']
  };

  // Keys the game owns: stop the browser from scrolling / quick-finding.
  var OWNED = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space',
               'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyP', 'KeyR', 'F1'];

  function anyDown(list) {
    for (var i = 0; i < list.length; i++) {
      if (keys[list[i]]) return true;
    }
    return false;
  }

  function onKeyDown(e) {
    if (OWNED.indexOf(e.code) !== -1) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;   // ignore auto-repeat
    keys[e.code] = true;
  }

  function onKeyUp(e) {
    if (OWNED.indexOf(e.code) !== -1) e.preventDefault();
    keys[e.code] = false;
  }

  // Alt-Tab leaves keys stuck down otherwise.
  function clearAll() {
    keys = {};
    pressed = {};
    mouse.down = false;
  }

  function init(canvas) {
    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp, { passive: false });
    window.addEventListener('blur', clearAll);
    window.addEventListener('contextmenu', function (e) { e.preventDefault(); });

    canvas.addEventListener('mousemove', function (e) {
      var r = canvas.getBoundingClientRect();
      mouse.sx = e.clientX - r.left;
      mouse.sy = e.clientY - r.top;
      mouse.inside = true;
      mouse.moved = true;
    });
    canvas.addEventListener('mousedown', function (e) { e.preventDefault(); mouse.down = true; });
    window.addEventListener('mouseup', function () { mouse.down = false; });
    canvas.addEventListener('mouseleave', function () { mouse.inside = false; });
  }

  return {
    init: init,
    clearAll: clearAll,
    get mouse() { return mouse; },

    down: function (name) { return anyDown(AXES[name] || [name]); },
    key: function (code) { return !!keys[code]; },
    pressed: function (code) { return !!pressed[code]; },

    // Direct movement vector, normalised so diagonals are not faster.
    axis: function () {
      var x = 0, y = 0;
      if (anyDown(AXES.left)) x -= 1;
      if (anyDown(AXES.right)) x += 1;
      if (anyDown(AXES.up)) y -= 1;
      if (anyDown(AXES.down)) y += 1;
      if (x !== 0 && y !== 0) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
      return { x: x, y: y };
    },

    // Car control mapping: up = throttle, down = brake/reverse, left/right = steer.
    driving: function () {
      var throttle = 0, steer = 0;
      if (anyDown(AXES.up)) throttle += 1;
      if (anyDown(AXES.down)) throttle -= 1;
      if (anyDown(AXES.right)) steer += 1;
      if (anyDown(AXES.left)) steer -= 1;
      return { throttle: throttle, steer: steer };
    },

    // Call once at the end of every fixed step.
    endStep: function () { pressed = {}; }
  };
})();