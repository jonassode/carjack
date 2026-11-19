// Carjack - central tuning table. Change numbers here to change game feel.
window.CJ = window.CJ || {};

CJ.CFG = {
  // --- world / loop -------------------------------------------------------
  TILE: 64,            // pixels per map tile
  DT: 1 / 60,          // fixed simulation step (seconds)
  MAX_FRAME: 0.25,     // clamp huge frame gaps (tab switch) to avoid spiral

  // --- player on foot -----------------------------------------------------
  P_SPEED: 165,        // px/s top walking speed
  P_ACCEL: 12,         // velocity smoothing rate (higher = snappier)
  P_RADIUS: 9,         // collision circle radius
  P_FIRE_CD: 0.15,     // seconds between shots
  P_HP: 100,

  // --- car ----------------------------------------------------------------
  CAR_ACCEL: 520,      // forward acceleration px/s^2
  CAR_BRAKE: 900,      // brake deceleration while rolling forward
  CAR_MAX: 480,        // top speed px/s
  CAR_MAX_REV: -160,   // top reverse speed
  CAR_ROLL: 60,        // rolling resistance px/s^2
  STEER_RATE: 2.6,     // rad/s at full steering lock
  STEER_REF: 120,      // speed at which steering reaches full authority
  GRIP: 6.0,           // lateral velocity damping (low = drifty)
  CAR_LEN: 44,
  CAR_W: 22,
  CAR_RADIUS: 11,      // = CAR_W / 2, collision capsule radius
  CAR_HP: 100,
  CAR_CRASH_DAMP: 0.55, // speed multiplier applied on wall impact

  // --- enter / exit -------------------------------------------------------
  ENTER_RANGE: 46,     // max distance to press E into a car
  EXIT_OFFSET: 26,     // how far to step out from car centre
  EXIT_GRACE: 0.4,     // seconds of car<->player collision immunity after exit

  // --- money --------------------------------------------------------------
  MONEY_START: 100,           // dollars you begin with
  MONEY_DEATH_COST: 25,       // taken off every time you are wasted
  MONEY_BUST_COST: 50,        // bail taken off every time you are busted

  // --- police / alert -----------------------------------------------------
  // Awareness is 0..100 and drawn as five shields worth 20 points each. The
  // second shield (20 points) is where the station starts sending cars.
  ALERT_MAX: 100,
  ALERT_BADGES: 5,
  ALERT_CHASE_AT: 20,         // start of the second badge = police response
  ALERT_RUN_OVER: 8,          // heat per person your car flattens
  ALERT_SHOOT_HIT: 14,        // heat per person you shoot
  ALERT_COP_KILL: 26,         // heat for dropping an officer
  ALERT_DECAY: 1.1,           // points lost per second once the trail goes cold
  ALERT_COOLDOWN: 8,          // seconds with no crime before cooling starts

  POLICE_CALL_DELAY: 1.8,     // dispatch time after the alert crosses the line
  POLICE_MAX_UNITS: 5,        // one squad car per filled badge (capped at five)
  POLICE_REINFORCE_DELAY: 0.9,// gap between one car rolling out and the next
  POLICE_SPEED_MULT: 1.06,    // police cars are a little faster than yours
  POLICE_ACCEL_MULT: 1.15,
  POLICE_CAR_HP: 180,         // tougher than a civilian car
  POLICE_RAM_RANGE: 230,      // ignore the road and drive straight at you inside this
  POLICE_REPATH: 0.8,         // seconds between road routes
  POLICE_LOOKAHEAD: 150,      // px of road to aim at (anticipates corners)
  POLICE_DEPLOY_RANGE: 150,   // stop and pile out this close to you
  POLICE_DEPLOY_SPEED: 70,    // ...once the car is slower than this
  POLICE_REMOUNT: 6,          // seconds afoot before they get back in the car
  POLICE_REMOUNT_RANGE: 320,  // ...if you have driven this far away

  COP_SPEED: 185,             // a shade faster than you on foot
  COP_RADIUS: 9,
  COP_HP: 100,
  COP_RANGE: 330,             // how far they will open fire
  COP_FIRE_CD: 0.85,          // seconds between shots
  COP_SPREAD: 0.09,           // radians of aim wobble
  COP_HOLD_FIRE: 110,         // no shooting once they are close enough to grab
  POLICE_BULLET_DMG: 11,      // damage a cop's bullet does to you
  COP_CAR_DAMAGE: 8,          // ...and to a car (keeps chases from ending instantly)

  POLICE_GRAB_RANGE: 30,      // reach for your collar / door handle
  POLICE_BUST_TIME: 1.5,      // seconds of grabbing before you are busted
  POLICE_BUST_SPEED: 70,      // your car must be slower than this to be pulled out

  // --- explosions / health ------------------------------------------------
  EXPLOSION_RADIUS: 190,      // px blast radius around a car that blows up
  EXPLOSION_DMG_FRAC: 0.30,   // share of max health lost right at the blast centre
  EXPLOSION_IN_CAR_FRAC: 0.50,// share of max health lost if the car you are in blows

  // --- bullets ------------------------------------------------------------
  B_SPEED: 900,
  B_TTL: 1.2,
  B_RADIUS: 2.5,
  B_DAMAGE: 34,

  // --- pedestrians --------------------------------------------------------
  PED_COUNT: 64,          // how many people wander the city
  PED_RADIUS: 6,
  PED_SPEED: 44,          // base walking speed px/s
  PED_PANIC_MULT: 2.1,    // speed multiplier while fleeing a fast car
  PED_FLEE_RADIUS: 120,   // a car closer than this and faster than PED_SCARE_SPEED scares them
  PED_SCARE_SPEED: 130,
  PED_DOOR_CHANCE: 0.3,   // chance of stepping into a house when passing a door
  PED_FADE_TIME: 0.35,    // seconds to fade in/out at a door
  PED_INSIDE_MIN: 1.5,    // seconds spent inside a house (min / max)
  PED_INSIDE_MAX: 5.0,
  KILL_SPEED: 55,         // car speed needed to flatten someone instead of nudging them
  SPLAT_MAX: 220,         // blood decals kept before the oldest are dropped

  // --- camera -------------------------------------------------------------
  CAM_LERP: 6,         // follow smoothing rate
  CAM_LEAD: 0.25,      // how far ahead of velocity the camera looks
  SHAKE_DECAY: 7,

  // --- palette (all geometry is drawn with flat colours) -------------------
  COL: {
    grass:      '#22382a',
    grassAlt:   '#26412f',
    road:       '#2b2f36',
    roadAlt:    '#2e323a',
    sidewalk:   '#565c66',
    sidewalkAlt:'#5b616b',
    laneMark:   '#d9d06a',
    building:   '#3d4551',
    buildingAlt:'#444d5a',
    buildingSide:'#222932',
    outline:    'rgba(8,10,14,0.55)',
    shadow:     'rgba(0,0,0,0.34)',
    blood:      '#8c1a1a',
    bloodDark:  '#5c0f0f',
    bloodPool:  'rgba(112,18,18,0.62)',
    police:     '#2f4f86',
    policeRoof: '#3f68ab',
    hospital:   '#b9c4cc',
    hospitalRoof:'#dde6ec',
    cross:      '#c23b2b',
    explosion:  '#ffb347',
    player:     '#eef2f7',
    playerArm:  '#9aa3ae',
    skin:       '#f0c090',
    bullet:     '#ffe27a',
    hudText:    '#e6e9ee',
    policeBody: '#e6edf5',
    policeStripe:'#2f4f86',
    sirenRed:   '#ff3b30',
    sirenBlue:  '#3b82ff',
    cop:        '#2b3f63',
    copTrim:    '#9fb4d8'
  },

  CAR_COLORS: ['#b8402f', '#2f6fb8', '#c9a227', '#2f9e6b', '#8d4fc9', '#c96a2f'],

  // Pedestrians are plain circles; these are their shirt colours.
  PED_COLORS: ['#c8cfd8', '#e0d7b8', '#9fb8d8', '#d8a8a8', '#a8d8b8', '#c0b0d8', '#d8c8a0']
};