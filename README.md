# Carjack

A GTA 2 style top-down driving/shooting prototype. Everything is drawn with
flat geometric shapes — no sprites, no images, no assets at all.

- Drive a car around a city of streets, houses, parks and trees
- Cars are parked along the kerb with their lights off; headlights and their
  beams come on only once you are behind the wheel
- Press **E** to jump out and run around on foot
- On foot, aim with the mouse and shoot by **clicking** (or holding the button)
- Pedestrians wander the sidewalks, duck in and out of houses, scatter from
  speeding cars — and turn into a blood splat if you run them over or shoot them
- One police station and one hospital, both marked on the minimap
- A five-shield **alert meter** tracks how much attention you have drawn: running
  people over and shooting them raises it, and from the second shield on the
  station sends **one squad car per filled badge** — five badges means five cars
  — which chase and ram you, then bail out to shoot and drag you out of the car
- A little **street-cleaner depot** building sends out a sweeper truck twenty
  seconds after any blood appears; it drives over, scrubs the mess away and
  parks up again, so the streets (and the decal pool) never stay messy for long
- Cars explode when their chassis is destroyed, hurting you by proximity
  (up to 30%) or by half your health if you are still inside
- Run out of health and you are **WASTED** — you lose $25 and must click the
  respawn button to wake up outside the hospital
- Get grabbed by an officer and you are **BUSTED** — you lose $50 and wake up
  outside the police station
- You start with $100 and can never go below $0

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

A crosshair is drawn at the cursor while you are on foot. When you are wasted,
click **Respawn at hospital** to carry on.

## Layout

```
index.html      canvas, HUD, script tags in dependency order
tests.html      unit assertions (collision, physics, world parsing, camera)
smoke.html      end-to-end test that boots the real game and simulates input
src/config.js   every tunable number and colour, in one place
src/math.js     vectors, clamp, circle/AABB/segment collisions
src/input.js    key state, edge-triggered presses, mouse -> world
src/alert.js    0..100 police awareness, five 20-point badges, cooling down
map/city.js     the city as an ASCII grid + car spawns
src/world.js    ASCII -> collision boxes, special buildings, spatial index, drawing
src/camera.js   smoothed follow camera, world clamping, screen shake
src/blood.js    permanent blood decals (cached Path2D per splat)
src/peds.js     pedestrian state machine: walk, enter/exit houses, flee, die
src/car.js      arcade car physics, capsule collision, car rendering
src/player.js   on-foot movement and rendering
src/bullet.js   bullet pool with swept wall collision
src/police.js   dispatch, road-grid pursuit, rams, officers on foot, busting
src/cleaner.js  the depot: timed dispatch, road-grid drive-out, wash, drive home
src/hud.js      cash/health/alert panels, minimap, WASTED/BUSTED overlays, debug
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
does not immediately shove the player back. `Car.lightsOn()` is simply "is
anyone sitting in it", so the headlight beam, the warm lenses and the cone of
light all disappear the moment you step out.

**Parked cars.** `map/city.js` authors each spawn as a point on the street and
runs it through `park()`, which looks up the 2-tile road band for the car's
block, works out which kerb is on its right for that heading, and slides the
car `CURB_GAP` (0.30 tiles) away from it. The `cars` list therefore reads as
"park here" and still lines the kerbside exactly if you move a coordinate.

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
is a flat 50% instead.

**Money and being wasted.** Hitting zero health calls `die()`, which sets
`player.dead`, charges `MONEY_DEATH_COST` and shows the WASTED overlay. While
`player.dead` the step loop zeroes the movement axis and ignores `E` and the
fire button, so you keep watching the city with no control. Nothing respawns
you until the overlay's button calls back into `respawnPlayer()`, which clears
the flag, restores full health and teleports you to `world.hospitalSpawn`.
`M.charge(balance, amount)` is a pure function so the "never below $0" rule is
unit-tested in isolation rather than buried in the death path.

**Alert and the police response.** `CJ.Alert` is pure state: a 0..100 value,
five shields of 20 points, and a cooldown timer. Crimes call `add()`, which caps
the meter and restarts the cooldown; `update(dt)` drains 1.1 points a second
once eight seconds have passed without a crime. Crossing 20 points — into the
second shield — is the dispatch trigger. `CJ.Police` owns the meter and the
response: it wants one squad car per badge filled (`ALERT_BADGES` at most), so
two shields bring two cars and a full meter brings five. The first leaves after
`POLICE_CALL_DELAY`, each reinforcement follows `POLICE_REINFORCE_DELAY` later,
and every car takes the next free piece of road outside the station so they
never spawn inside each other. Each car recomputes a breadth-first route over
the road tiles every 0.8 s. It aims a look-ahead waypoint down that route so it brakes into
corners, and inside `POLICE_RAM_RANGE` with a clear line it drops the route and
drives straight at you. If it gets wedged it reverses for half a second and
tries the corner again. Once you are on foot and close — or stopped beside it in
a car — the officers bail out, shoot when they have line of sight (holding fire
inside `COP_HOLD_FIRE` so they can grab you), and after `POLICE_BUST_TIME` of
contact the BUSTED overlay appears: the meter empties, the squad car is removed
and the bail is charged. The heat keeps decaying during a chase, so a clean
getaway eventually makes them stand down.

**Street cleaners.** `CJ.Cleaner` is the tidy-up crew. Every decal carries an
`age` (bumped once a step by `CJ.Blood.update`), and once one passes
`CLEAN_DELAY` — twenty seconds with nobody washing it — the depot sends a truck.
Like a squad car the sweeper routes over the road tiles (the same breadth-first
search the police use), so it can reach a splat that is sitting on a pavement,
and it retraces that route home. On arrival it parks, spins its brush and sprays
for `CLEANER_WASH_TIME`, then `CJ.Blood.cleanNear` wipes every decal inside
`CLEANER_WASH_RADIUS` — so one truck clears a whole cluster and the pool drains
long before it could ever reach `SPLAT_MAX`. At most `CLEANER_MAX_UNITS` sweepers
are out at once, so the depot cannot flood the streets, and a truck that gets
wedged gives up after `CLEANER_GIVEUP` and goes home empty-handed.

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
| `MONEY_START` | cash you begin with (100) |
| `MONEY_DEATH_COST` | cash lost each time you are wasted (25) |
| `MONEY_BUST_COST` | bail each time you are busted (50) |
| `ALERT_RUN_OVER`, `ALERT_SHOOT_HIT`, `ALERT_COP_KILL` | heat per crime |
| `ALERT_CHASE_AT` | points that trigger a dispatch (20 = second shield) |
| `ALERT_DECAY`, `ALERT_COOLDOWN` | how fast, and how soon, the meter cools |
| `POLICE_CALL_DELAY` | seconds between the trigger and the first car leaving the station |
| `POLICE_REINFORCE_DELAY` | gap between one squad car rolling out and the next |
| `POLICE_MAX_UNITS` | most cars on the road at once (5 = one per badge) |
| `POLICE_SPEED_MULT` | how much faster the squad car is |
| `POLICE_DEPLOY_RANGE` | how close it stops before the officers get out |
| `COP_SPEED`, `COP_FIRE_CD`, `POLICE_BULLET_DMG` | officers on foot |
| `POLICE_BUST_TIME` | seconds of grabbing before you are busted |
| `CLEAN_DELAY` | seconds a blood splat waits before a cleaner is sent (20) |
| `CLEANER_MAX_UNITS` | most sweeper trucks out at once |
| `CLEANER_WASH_RADIUS` | how big a patch one sweeper scrubs clean |
| `CLEANER_SPEED_MULT` | how much slower the sweeper is than your car |
| `CLEANER_GIVEUP` | seconds before a wedged truck heads home |

## Tests

```bash
# 165 assertions: collisions, car physics, parking, headlights, world parsing,
#                 bullets, cops, peds, blood, special buildings, blast damage,
#                 money, the alert meter, the police fleet, the cleaner depot,
#                 camera
open tests.html          # or: python3 -m http.server 8000 → /tests.html

# 94 assertions: boots the game and simulates real key/mouse input
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

Drive-by shooting, NPC traffic, sound, sprites, rotating (GTA2-style) camera,
saving, healing inside the hospital, police roadblocks and anything beyond the
five-shield meter (no national guard, no bribes). The data hooks exist:
`world.cars`, `Car.hp`, `Bullets.owner` takes any entity, and `Bullets.update`
accepts pedestrians, police officers and the player as targets.