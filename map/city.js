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
//   'P'  police station (solid, exactly one on the map)
//   'H'  hospital (solid, exactly one on the map)
//   '|'  road centre line marker (non-solid)
//   'o'  tree (solid, small)
//   'C'  street-cleaner depot (solid, small — owns part of one block)
//
window.CJ = window.CJ || {};

(function () {
  'use strict';

  var N = 64;          // grid is N x N tiles
  var BLOCK = 8;       // one block (road pair + block + sidewalk) every 8 tiles
  var ROAD_W = 2;      // road lanes per street

  // Exactly one of each. Blocks are in block coordinates; the parks live at
  // (4,4), (1,6) and (6,2), so these two are chosen to not collide with them.
  var SPECIAL = {
    police: { bx: 2, by: 2, ch: 'P' },
    hospital: { bx: 5, by: 5, ch: 'H' }
  };

  function specialAt(blockX, blockY) {
    if (blockX === SPECIAL.police.bx && blockY === SPECIAL.police.by) return 'P';
    if (blockX === SPECIAL.hospital.bx && blockY === SPECIAL.hospital.by) return 'H';
    return null;
  }

  // The street-cleaner depot: a small building that owns only *part* of block
  // (1,1) rather than a whole block. `x0/y0` are block-local tile coordinates
  // (the sidewalk ring lives at 0 and 5, so the interior runs 1..4).
  var DEPOT = { bx: 1, by: 1, x0: 2, y0: 2, w: 3, h: 2 };

  function isDepotTile(blockX, blockY, bx, by) {
    if (blockX !== DEPOT.bx || blockY !== DEPOT.by) return false;
    return bx >= DEPOT.x0 && bx < DEPOT.x0 + DEPOT.w &&
           by >= DEPOT.y0 && by < DEPOT.y0 + DEPOT.h;
  }

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

        var blockX = Math.floor(x / BLOCK);
        var blockY = Math.floor(y / BLOCK);

        // The police station and the hospital each own a whole block interior.
        var special = specialAt(blockX, blockY);
        if (special) { row.push(special); continue; }

        // The cleaner depot only covers a few tiles of one block.
        if (isDepotTile(blockX, blockY, bx, by)) { row.push('C'); continue; }

        // Whole-block parks.
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

  // Gap between a parked car's flank and the kerb, in tiles. The car is 22px
  // wide (~0.34 tiles), so this leaves it a few pixels clear of the kerb while
  // staying inside its own lane.
  var CURB_GAP = 0.30;

  // Snap a car spawn (x/y in tile units, h in radians) out of the middle of the
  // street and up against the kerb on the right-hand side of its heading.
  function park(x, y, h) {
    var alongX = Math.abs(Math.cos(h)) >= Math.abs(Math.sin(h)); // heading east/west
    var across = alongX ? y : x;                                 // across the street
    var block = Math.floor(across / BLOCK) * BLOCK;              // start of its block
    var kerbLow = block + BLOCK - ROAD_W;                        // kerbside tile pair
    var kerbHigh = block + BLOCK;
    // Right of the heading: +y for east (h=0), -y for west, -x for south, +x for north.
    var rightIsHigh = alongX ? (Math.cos(h) > 0) : (-Math.sin(h) > 0);
    var parked = rightIsHigh ? kerbHigh - CURB_GAP : kerbLow + CURB_GAP;
    return alongX ? { x: x, y: parked, h: h } : { x: parked, y: y, h: h };
  }

  CJ.MAP_CITY = {
    tileSize: 64,
    blockSize: BLOCK,        // tiles per city block (used to lay out sidewalk routes)
    roadWidth: ROAD_W,
    legend: { ' ': 'grass', '=': 'road', '.': 'sidewalk', '#': 'building',
             'P': 'police', 'H': 'hospital', 'C': 'depot', '|': 'lane', 'o': 'tree' },
    rows: buildRows(),

    // Where the two special buildings live, in block coordinates.
    special: SPECIAL,

    // The cleaner depot: block coordinates plus the small footprint it occupies.
    depot: DEPOT,

    // Player spawn (tile units, centre of tile). Sidewalk at a street corner,
    // with a car parked on the road straight below it.
    playerSpawn: { x: 8.5, y: 5.5 },

    // Parked cars. `park()` above takes a point on the street and slides it
    // sideways until the car hugs the kerb on its right, so the city never
    // looks like a traffic jam frozen in the middle of the road.
    cars: [
      park(8.5, 6.5, 0),
      park(26.0, 7.0, 0),
      park(12.0, 15.0, Math.PI),
      park(36.0, 23.0, 0),
      park(20.0, 31.0, 0),
      park(44.0, 39.0, Math.PI),
      park(15.0, 22.0, Math.PI / 2),
      park(31.0, 40.0, -Math.PI / 2)
    ]
  };
})();