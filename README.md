# Carjack

A GTA 2 style top-down driving/shooting prototype. Everything is drawn with
flat geometric shapes — no sprites, no images, no assets at all.

- Drive a car around a city of streets, houses, parks and trees
- Press **E** to jump out and run around on foot
- On foot, aim with the mouse and shoot by **clicking** (or holding the button)
- Pedestrians wander the sidewalks, duck in and out of houses, scatter from
  speeding cars — and turn into a blood splat if you run them over or shoot them
- One police station and one hospital, both marked on the minimap
- Cars explode when their chassis is destroyed, hurting you by proximity
  (up to 30%) or by half your health if you are still inside
- Run out of health and you wake up outside the hospital

## Run it

No build step and no dependencies. Either:

```bash
# recommended
python3 -m http.server 8000
# then open http://localhost:8000
```

or just double-click `index.html` (all scripts are classic, not modules, so it
works from `file://` too).

## Controls

| Input | On foot | In a car |
| --- | --- | --- |
| `W` / `↑` | run up | accelerate |
| `S` / `↓` | run down | brake, then reverse |
| `A` / `←` | run left | steer left |
| `D` / `→` | run right | steer right |
| `E` | get into the nearest car | get out |
| Mouse move | aim | — |
| **Left or right click** | **shoot** (hold to keep firing) | — |
| `R` | reset player + cars to spawn | |
| `P` | pause / resume | |
| `F1` | toggle debug overlay (hitboxes, FPS, coords) | |

A crosshair is drawn at the cursor while you are on foot.

## Layout

```
index.html      canvas, HUD, script tags in dependency order
tests.html      unit assertions (collision, physics, world parsing, camera)
smoke.html      end-to-end test that boots the real game and simulates input
src/config.js   every tunable number and colour, in one place
src/math.js     vectors, clamp, circle/AABB/segment collisions
src/input.js    key state, edge-triggered presses, mouse -> world
map/city.js     the city as an ASCII grid + car spawns
src/world.js    ASCII -> collision boxes, special buildings, spatial index, drawing
src/camera.js   smoothed follow camera, world clamping, screen shake
src/blood.js    permanent blood decals (cached Path2D per splat)
src/peds.js     pedestrian state machine: walk, enter/exit houses, flee, die
src/car.js      arcade car physics, capsule collision, car rendering
src/player.js   on-foot movement and rendering
src/bullet.js   bullet pool with swept wall collision
src/hud.js      speedometer, health bars, minimap, debug text
src/main.js     fixed-step loop, entity wiring, enter/exit glue
```

Scripts share one `window.CJ` namespace and attach to it at load time, so the
`<script>` order in `index.html` matters.

## How the interesting parts work

**Fixed timestep.** The simulation always advances in 1/60 s steps, no matter
the frame rate, and `dt` is clamped so a stalled tab cannot fast-forward the
world. Car handling and collisions are therefore reproducible.

**Car physics.** Velocity is decomposed into *forward* and *lateral* components
relative to the car's heading. Lateral speed decays exponentially
(`lat *= exp(-GRIP * dt)`), which is what makes the car slide through corners
instead of feeling like it is on rails. Steering authority scales with speed and
flips sign in reverse.

**Collision.** Cars are capsules: three circles sampled along the body axis,
each pushed out of nearby building boxes. Movement is sub-stepped when a car
moves more than 40% of a tile per step so it cannot tunnel through a wall at
top speed. Bullets use a swept segment test for the same reason.

**Enter / exit.** While driving, the player entity is pinned to the car. On
exit, four candidate spots (right, left, behind, in front) are tested against
the world and the first clear one wins, plus a short grace period so the car
does not immediately shove the player back.

**Pedestrian navigation.** No pathfinding. Every city block (8×8 tiles) has a
ring of sidewalk tiles, and peds are spawned onto a ring and walk point to
point around it, which is guaranteed to be a clear path. A ring tile whose
inward neighbour is a building counts as a door; when a ped reaches one there
is a `PED_DOOR_CHANCE` of stepping inside — it fades out, waits a few seconds,
then reappears at a random door on the same block. Cars moving faster than
`PED_SCARE_SPEED` within `PED_FLEE_RADIUS` make them run.

**Death.** `Ped.kill()` is idempotent: it flags the ped, bumps the kill counter
and drops a blood decal. Cars kill above `KILL_SPEED` and merely shoulder
people aside below it. Bullets kill through `Bullets.update`'s optional
pedestrian arguments, so drive-by shooting is a one-line change later.

**Special buildings.** The map uses `P` and `H` tiles, both solid. Because the
solid-merging pass keys runs by character, the police station and the hospital
come out as their own collision boxes with `kind: 'police'` / `'hospital'`,
which is how `world.policeStation` and `world.hospital` find their footprints.
`world.hospitalSpawn` is solved at load time: the first side of the hospital
whose pavement is clear wins, so the respawn point is never inside a wall.

**Explosions and health.** A car at zero chassis health is *not* deleted
immediately — it stays in the list flagged as wrecked, and `explodeDeadCars()`
runs at the top of the next step. Doing it there (rather than mid-collision)
means the blast is always measured from the position where the car died, so
damage is deterministic. `M.blastDamage(d, radius, max)` falls off linearly,
giving the full 30% at the centre and nothing at the rim; being inside the car
is a flat 50% instead. Zero health calls `respawnPlayer()`, which teleports you
to `world.hospitalSpawn` at full health.

**Rendering.** Ground tiles are drawn per frame with culling; buildings are
slightly darker rectangles with a lighter roof, a fake "wall" band on the south
and east edges, and a window pattern, which is enough to read them as 3D.

## Tuning

Everything lives in `src/config.js`. The ones worth touching first:

| Constant | Effect |
| --- | --- |
| `CAR_MAX` | top speed |
| `CAR_ACCEL` | acceleration |
| `STEER_RATE`, `STEER_REF` | turn rate and how quickly it ramps in with speed |
| `GRIP` | lower = more drift |
| `CAR_ROLL` | how quickly the car coasts to a stop |
| `CAM_LERP`, `CAM_LEAD` | camera snappiness and look-ahead |
| `ENTER_RANGE` | how close you must be to press E into a car |
| `PED_COUNT` | how busy the streets are |
| `PED_DOOR_CHANCE` | how often people duck into houses |
| `KILL_SPEED` | car speed above which people are flattened instead of nudged |
| `SPLAT_MAX` | how many blood decals stay on the map |
| `EXPLOSION_RADIUS` | blast radius of a car that blows up |
| `EXPLOSION_DMG_FRAC` | share of max health lost at the blast centre (0.30) |
| `EXPLOSION_IN_CAR_FRAC` | share lost if the car you are in explodes (0.50) |

## Tests

```bash
# 93 assertions: collisions, car physics, world parsing, bullets, peds, blood,
#                special buildings, blast damage, camera
open tests.html          # or: python3 -m http.server 8000 → /tests.html

# 48 assertions: boots the game and simulates real key/mouse input
open smoke.html
```

Both print green/red rows and a summary line. They also expose
`window.__TEST_RESULT__` / `window.__SMOKE_RESULT__`, so they run headlessly:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless --disable-gpu --virtual-time-budget=6000 \
  --dump-dom file://$PWD/smoke.html | grep summary
```

## Not implemented (deliberately, for this prototype)

Drive-by shooting, NPC traffic, police/wanted level, sound, sprites, rotating
(GTA2-style) camera, saving, healing inside the hospital. The data hooks exist:
`world.cars`, `Car.hp`, `Bullets.owner` takes any entity, `Bullets.update`
already accepts a pedestrian list for the shooting callback, and the police
station is parsed and drawn but has no behaviour attached yet.