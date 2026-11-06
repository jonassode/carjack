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
    hudText:    '#e6e9ee'
  },

  CAR_COLORS: ['#b8402f', '#2f6fb8', '#c9a227', '#2f9e6b', '#8d4fc9', '#c96a2f'],

  // Pedestrians are plain circles; these are their shirt colours.
  PED_COLORS: ['#c8cfd8', '#e0d7b8', '#9fb8d8', '#d8a8a8', '#a8d8b8', '#c0b0d8', '#d8c8a0']
};