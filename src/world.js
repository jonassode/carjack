// Carjack - world: parses the ASCII map into collision boxes and draws it.
//
// The world is drawn with per-frame culling of visible tiles (cheap, and avoids
// a 4096x4096 offscreen canvas which would eat ~67MB of memory).
window.CJ = window.CJ || {};

CJ.World = (function () {
  'use strict';

  var M = CJ.M;

  var T = 64;            // tile size
  var grid = [];         // array of strings
  var cols = 0;
  var rows = 0;
  var w = 0;
  var h = 0;

  var solids = [];       // { x, y, w, h, kind } axis aligned boxes
  var carSpawns = [];
  var playerSpawn = { x: 0, y: 0 };

  var index = { cell: 0, cols: 0, rows: 0, buckets: [] };
  var stamp = 1;

  // ---------------------------------------------------------------- helpers
  function tileChar(tx, ty) {
    if (tx < 0 || ty < 0 || tx >= cols || ty >= rows) return '#';
    var row = grid[ty];
    if (!row) return '#';
    var c = row.charAt(tx);
    return c || ' ';
  }

  function isRoadChar(c) { return c === '='; }

  function tileAtWorld(x, y) {
    var tx = Math.floor(x / T);
    var ty = Math.floor(y / T);
    return tileChar(tx, ty);
  }

  function isOnRoad(x, y) { return isRoadChar(tileAtWorld(x, y)); }

  // ---------------------------------------------------------------- parsing
  function buildSolids() {
    var open = {};
    var x, y;

    for (y = 0; y < rows; y++) {
      var next = {};
      var x0 = -1;
      for (x = 0; x <= cols; x++) {
        var solid = (x < cols) && tileChar(x, y) === '#';
        if (solid && x0 < 0) { x0 = x; }
        if ((!solid || x === cols) && x0 >= 0) {
          var key = x0 + ':' + x;
          if (open[key]) {
            open[key].h += T;                 // extend the box downwards
            next[key] = open[key];
          } else {
            var box = { x: x0 * T, y: y * T, w: (x - x0) * T, h: T, kind: 'building' };
            solids.push(box);
            next[key] = box;
          }
          x0 = -1;
        }
      }
      open = next;
    }

    // Trees are small solid circles approximated by a centred box.
    for (y = 0; y < rows; y++) {
      for (x = 0; x < cols; x++) {
        if (tileChar(x, y) === 'o') {
          solids.push({
            x: x * T + T * 0.30,
            y: y * T + T * 0.30,
            w: T * 0.40,
            h: T * 0.40,
            kind: 'tree'
          });
        }
      }
    }
  }

  function buildIndex() {
    index.cell = T * 4;
    index.cols = Math.max(1, Math.ceil(w / index.cell));
    index.rows = Math.max(1, Math.ceil(h / index.cell));
    index.buckets = [];
    for (var i = 0; i < index.cols * index.rows; i++) index.buckets.push([]);

    for (var s = 0; s < solids.length; s++) {
      var b = solids[s];
      var cx0 = Math.floor(b.x / index.cell);
      var cy0 = Math.floor(b.y / index.cell);
      var cx1 = Math.floor((b.x + b.w) / index.cell);
      var cy1 = Math.floor((b.y + b.h) / index.cell);
      for (var cy = cy0; cy <= cy1; cy++) {
        for (var cx = cx0; cx <= cx1; cx++) {
          if (cx < 0 || cy < 0 || cx >= index.cols || cy >= index.rows) continue;
          index.buckets[cy * index.cols + cx].push(b);
        }
      }
    }
  }

  // All solids that could touch a circle of radius `r` around (x,y).
  // Results are de-duplicated with a per-call stamp.
  function solidsNear(x, y, r) {
    var out = [];
    var cell = index.cell;
    var cx0 = Math.floor((x - r) / cell);
    var cy0 = Math.floor((y - r) / cell);
    var cx1 = Math.floor((x + r) / cell);
    var cy1 = Math.floor((y + r) / cell);
    stamp++;

    for (var cy = cy0; cy <= cy1; cy++) {
      for (var cx = cx0; cx <= cx1; cx++) {
        if (cx < 0 || cy < 0 || cx >= index.cols || cy >= index.rows) continue;
        var bucket = index.buckets[cy * index.cols + cx];
        for (var i = 0; i < bucket.length; i++) {
          var b = bucket[i];
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          out.push(b);
        }
      }
    }
    return out;
  }

  function isSolidAt(x, y, r) {
    var near = solidsNear(x, y, r);
    for (var i = 0; i < near.length; i++) {
      if (M.circleVsAABB(x, y, r, near[i])) return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- init
  function init(def) {
    T = def.tileSize || CJ.CFG.TILE;
    grid = def.rows;
    rows = grid.length;
    cols = grid[0].length;
    w = cols * T;
    h = rows * T;

    solids = [];
    buildSolids();
    buildIndex();

    carSpawns = (def.cars || []).map(function (c) {
      return { x: c.x * T, y: c.y * T, h: c.h || 0 };
    });

    playerSpawn = {
      x: (def.playerSpawn ? def.playerSpawn.x : 2) * T,
      y: (def.playerSpawn ? def.playerSpawn.y : 2) * T
    };
  }

  // ---------------------------------------------------------------- rendering
  function isRoadTile(tx, ty) { return tileChar(tx, ty) === '='; }

  function dashLine(ctx, x, y, len, vertical) {
    var dash = 18, gap = 22;
    for (var p = 0; p < len; p += dash + gap) {
      var l = Math.min(dash, len - p);
      if (vertical) ctx.fillRect(x - 1.5, y + p, 3, l);
      else ctx.fillRect(x + p, y - 1.5, l, 3);
    }
  }

  function drawLanes(ctx, tx0, ty0, tx1, ty1) {
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = CJ.CFG.COL.laneMark;

    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        if (!isRoadTile(tx, ty)) continue;

        // Vertical street : the seam sits between this lane and the next one east.
        if (isRoadTile(tx + 1, ty) && !isRoadTile(tx - 1, ty) &&
            (isRoadTile(tx, ty - 1) || isRoadTile(tx, ty + 1))) {
          dashLine(ctx, (tx + 1) * T, ty * T, T, true);
        }

        // Horizontal street : seam between this lane and the one to the south.
        if (isRoadTile(tx, ty + 1) && !isRoadTile(tx, ty - 1) &&
            (isRoadTile(tx - 1, ty) || isRoadTile(tx + 1, ty))) {
          dashLine(ctx, tx * T, (ty + 1) * T, T, false);
        }
      }
    }
    ctx.restore();
  }

  function drawGround(ctx, cam, view) {
    var C = CJ.CFG.COL;
    var hw = view.w / 2, hh = view.h / 2;
    var tx0 = Math.max(0, Math.floor((cam.x - hw) / T) - 1);
    var ty0 = Math.max(0, Math.floor((cam.y - hh) / T) - 1);
    var tx1 = Math.min(cols - 1, Math.ceil((cam.x + hw) / T) + 1);
    var ty1 = Math.min(rows - 1, Math.ceil((cam.y + hh) / T) + 1);

    for (var ty = ty0; ty <= ty1; ty++) {
      for (var tx = tx0; tx <= tx1; tx++) {
        var c = tileChar(tx, ty);
        var v = M.hash2(tx, ty);
        var col;
        if (c === '=') col = v > 0.5 ? C.road : C.roadAlt;
        else if (c === '.') col = v > 0.5 ? C.sidewalk : C.sidewalkAlt;
        else col = v > 0.5 ? C.grass : C.grassAlt;
        ctx.fillStyle = col;
        ctx.fillRect(tx * T, ty * T, T + 1, T + 1);
      }
    }

    drawLanes(ctx, tx0, ty0, tx1, ty1);
  }

  var winPattern = null;

  function getWindowPattern(ctx) {
    if (winPattern) return winPattern;
    var pc = document.createElement('canvas');
    pc.width = 26;
    pc.height = 26;
    var pctx = pc.getContext('2d');
    pctx.fillStyle = 'rgba(255,232,180,0.10)';
    pctx.fillRect(6, 8, 9, 6);
    winPattern = ctx.createPattern(pc, 'repeat');
    return winPattern;
  }

  function drawBuilding(ctx, b, pattern) {
    var C = CJ.CFG.COL;
    var v = M.hash2(Math.round(b.x / T), Math.round(b.y / T));
    var band = Math.min(8, Math.min(b.w, b.h) * 0.18);

    // Drop shadow, then roof, then two "walls" along the south/east edges so the
    // flat rectangles read as height.
    ctx.fillStyle = C.shadow;
    ctx.fillRect(b.x + 8, b.y + 9, b.w, b.h);

    ctx.fillStyle = v > 0.5 ? C.buildingAlt : C.building;
    ctx.fillRect(b.x, b.y, b.w, b.h);

    if (b.w > 26 && b.h > 26) {
      var iw = b.w - band - 8;
      var ih = b.h - band - 8;
      if (iw > 10 && ih > 10 && pattern) {
        ctx.save();
        ctx.translate(b.x + 4, b.y + 4);
        ctx.fillStyle = pattern;
        ctx.fillRect(0, 0, iw, ih);
        ctx.restore();
      }
    }

    ctx.fillStyle = C.buildingSide;
    ctx.fillRect(b.x, b.y + b.h - band, b.w, band);
    ctx.fillRect(b.x + b.w - band, b.y, band, b.h);

    ctx.fillStyle = 'rgba(255,255,255,0.07)';
    ctx.fillRect(b.x, b.y, b.w, 2);
    ctx.fillRect(b.x, b.y, 2, b.h);

    // Dark outline keeps neighbouring blocks from fusing into one slab.
    ctx.strokeStyle = C.outline;
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
  }

  function drawTree(ctx, b) {
    var cx = b.x + b.w / 2;
    var cy = b.y + b.h / 2;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.arc(cx + 4, cy + 5, b.w * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5a3d28';
    ctx.fillRect(cx - 3, cy - 2, 6, b.h * 0.62);
    ctx.fillStyle = '#274d2c';
    ctx.beginPath();
    ctx.arc(cx, cy, b.w * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2f5e35';
    ctx.beginPath();
    ctx.arc(cx - 3, cy - 4, b.w * 0.40, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawBuildings(ctx, cam, view) {
    var hw = view.w / 2, hh = view.h / 2;
    var x0 = cam.x - hw - T, x1 = cam.x + hw + T;
    var y0 = cam.y - hh - T, y1 = cam.y + hh + T;
    var pattern = null;

    for (var i = 0; i < solids.length; i++) {
      var b = solids[i];
      if (b.x + b.w < x0 || b.x > x1 || b.y + b.h < y0 || b.y > y1) continue;
      if (b.kind === 'tree') { drawTree(ctx, b); continue; }
      if (!pattern) pattern = getWindowPattern(ctx);
      drawBuilding(ctx, b, pattern);
    }
  }

  // ---------------------------------------------------------------- minimap
  var mini = null;

  function buildMini(px) {
    if (mini) return mini;
    mini = document.createElement('canvas');
    mini.width = cols * px;
    mini.height = rows * px;
    var mctx = mini.getContext('2d');
    var C = CJ.CFG.COL;
    for (var ty = 0; ty < rows; ty++) {
      for (var tx = 0; tx < cols; tx++) {
        var c = tileChar(tx, ty);
        var col;
        if (c === '=') col = '#1c1f25';
        else if (c === '.') col = '#41464e';
        else if (c === '#') col = '#6d7580';
        else col = '#22352a';
        mctx.fillStyle = col;
        mctx.fillRect(tx * px, ty * px, px, px);
      }
    }
    return mini;
  }

  // Draws the minimap into a `size` x `size` square at (ox, oy) in screen space.
  function drawMinimap(ctx, ox, oy, size) {
    var px = 3;
    var canvas = buildMini(px);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, ox, oy, size, size);
    ctx.restore();
  }

  return {
    init: init,
    tileChar: tileChar,
    tileAtWorld: tileAtWorld,
    isOnRoad: isOnRoad,
    isSolidAt: isSolidAt,
    solidsNear: solidsNear,
    get solids() { return solids; },
    get carSpawns() { return carSpawns; },
    get playerSpawn() { return playerSpawn; },
    get tile() { return T; },
    get cols() { return cols; },
    get rows() { return rows; },
    get w() { return w; },
    get h() { return h; },
    drawGround: drawGround,
    drawBuildings: drawBuildings,
    drawMinimap: drawMinimap,
    buildMinimap: function () {}
  };
})();