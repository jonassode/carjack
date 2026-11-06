// Carjack - city map data.
//
// The map is a plain grid of characters. `CJ.World` parses it into collision
// boxes and draws it. The rows below are generated once by `buildRows()` so the
// street grid can never drift out of alignment, but the result is just strings:
// paste your own 64-character rows here to hand-author a city.
//
//   ' '  grass / open ground
//   '='  road
//   '.'  sidewalk
//   '#'  building (solid)
//   '|'  road centre line marker (non-solid)
//   'o'  tree (solid, small)
//
window.CJ = window.CJ || {};

(function () {
  'use strict';

  var N = 64;          // grid is N x N tiles
  var BLOCK = 8;       // one block (road pair + block + sidewalk) every 8 tiles
  var ROAD_W = 2;      // road lanes per street

  function isRoadLine(c) {
    var m = ((c % BLOCK) + BLOCK) % BLOCK;
    return m >= BLOCK - ROAD_W; // tiles 6,7 of every 8
  }

  function h2(x, y) { return CJ.M.hash2(x, y); }

  function buildRows() {
    var grid = [];
    var x, y;

    for (y = 0; y < N; y++) {
      var row = [];
      for (x = 0; x < N; x++) {
        var onRoad = isRoadLine(x) || isRoadLine(y);
        if (onRoad) { row.push('='); continue; }

        // Sidewalk ring hugging every block.
        var bx = ((x % BLOCK) + BLOCK) % BLOCK;
        var by = ((y % BLOCK) + BLOCK) % BLOCK;
        var edge = (bx === 0) || (bx === BLOCK - ROAD_W - 1) ||
                   (by === 0) || (by === BLOCK - ROAD_W - 1);
        if (edge) { row.push('.'); continue; }

        // Whole-block parks.
        var blockX = Math.floor(x / BLOCK);
        var blockY = Math.floor(y / BLOCK);
        var isPark = (blockX === 4 && blockY === 4) ||
                     (blockX === 1 && blockY === 6) ||
                     (blockX === 6 && blockY === 2);
        if (isPark) {
          // Scatter a few trees around the lawn.
          if (h2(x * 7 + 1, y * 13 + 3) > 0.82) { row.push('o'); }
          else { row.push(' '); }
          continue;
        }

        // Fill the block interior with little buildings, leaving alleys so the
        // city does not read as one solid slab.
        var r = h2(x * 31 + 7, y * 17 + 5);
        var alley = (bx === 3 && by % 2 === 1) || (by === 3 && bx % 2 === 1);
        if (alley) { row.push('.'); continue; }
        if (r > 0.90) { row.push(' '); continue; }       // small yard
        if (r > 0.86) { row.push('.'); continue; }       // parking pad
        row.push('#');
      }
      grid.push(row);
    }

    // Ring road along the outer edge so the world never ends in a wall of grass.
    for (var i = 0; i < N; i++) {
      grid[0][i] = '=';
      grid[N - 1][i] = '=';
      grid[i][0] = '=';
      grid[i][N - 1] = '=';
    }

    return grid.map(function (row) { return row.join(''); });
  }

  CJ.MAP_CITY = {
    tileSize: 64,
    legend: { ' ': 'grass', '=': 'road', '.': 'sidewalk', '#': 'building', '|': 'lane', 'o': 'tree' },
    rows: buildRows(),

    // Player spawn (tile units, centre of tile). Sidewalk at a street corner,
    // with a car parked on the road straight below it.
    playerSpawn: { x: 8.5, y: 5.5 },

    // Parked cars. x/y in tile units, h = heading in radians (0 = east).
    cars: [
      { x: 8.5, y: 6.5,  h: 0 },
      { x: 26.0, y: 7.0,  h: 0 },
      { x: 12.0, y: 15.0, h: Math.PI },
      { x: 36.0, y: 23.0, h: 0 },
      { x: 20.0, y: 31.0, h: 0 },
      { x: 44.0, y: 39.0, h: Math.PI },
      { x: 15.0, y: 22.0, h: Math.PI / 2 },
      { x: 31.0, y: 40.0, h: -Math.PI / 2 }
    ]
  };
})();