/* THE HOLE WORLD — balance & content config. All tuning lives here.
   Imported by the game (Vite) and by tools/sim.js (Node, native type stripping): keep the syntax erasable. */

export interface Layer { id: string; top: number; val: number; hard?: number; c: [string, string, string] }
/* A world to dig through: radius, its layers (top-down to the center; the far side mirrors them), finds per layer and milestones.
   `hardMult` scales every layer's hardness (effort per meter). Earth is worlds[0] and uses the top-level layers/finds/milestones. */
export interface World { id: string; e: string; r: number; hardMult: number; layers: Layer[]; finds: Record<string, [string, string, string, string]>; milestones: Milestone[]; sky: [string, string]; ground: [string, string] }
export interface Tool { id: string; e: string; pow: number; cost: number }
export interface Helper { id: string; e: string; rate: number; cost: number }
export interface Rarity { id: string; w: number; secs: number; color: string }
export interface Milestone { d: number; k: string }

export const CFG = {
  earthR: 6371000,              // m, surface → center
  through: 12742000,            // m, surface → other side
  costGrowth: 1.15,             // helper price multiplier per owned
  findChance: 0.035,            // per tap
  rarity: [                     // weight, coin bonus (seconds of income), color
    { id: 'common', w: 70, secs: 8,   color: '#d9c7b4' },
    { id: 'rare',   w: 22, secs: 25,  color: '#4fd1c5' },
    { id: 'epic',   w: 7,  secs: 90,  color: '#b98cff' },
    { id: 'legend', w: 1,  secs: 400, color: '#ff9b3d' },
  ] as Rarity[],
  comboWindow: 380,             // ms between taps to keep combo
  comboMax: 40,                 // taps to reach max combo
  comboMult: 1.0,               // extra multiplier at max combo (1.0 → x2)
  nugget: { minGap: 70, maxGap: 160, life: 7, frenzyMult: 7, frenzySecs: 12, burstSecs: 45, firstMin: 25, firstMax: 45 },
  tapsPerSecCap: 20,            // anti-autoclicker: taps above this are ignored
  offlineCapFree: 2 * 3600,
  offlineCapCrew: 24 * 3600,
  offlineMinSec: 30,
  crewMult: 2,
  prestigeBase: 2,              // total mult = prestigeBase ^ stars (each world dug through doubles tap and helper output, forever)
  incomeTapsPerSec: 4,          // assumed taps/s when converting income to coin bonuses
  dailyMinCoins: 50,
  dailyStreakCap: 7,
  // Daily quests: 3 per day, picked by date; targets scale with the player's current pace. Reward = incomePerSec × rewardSecs.
  quests: {
    perDay: 3, rewardSecs: 150, minReward: 30,
    kinds: [
      { id: 'taps',    e: '👆', base: 300,  perStar: 100 },   // taps today
      { id: 'meters',  e: '⛏️', minutes: 10 },                // meters today ≈ 10 min of current income
      { id: 'helpers', e: '🐶', base: 3,    perStar: 1 },     // helpers bought today
      { id: 'finds',   e: '🏺', base: 3,    perStar: 1 },     // treasures found today
      { id: 'combo',   e: '⚡', base: 1,    perStar: 0 },     // reach max combo once
    ],
  },
  // Soft fatigue (no hard energy): after activeSecPerDay of active tapping in a day, taps run at slowMult for restSec.
  // Helpers keep digging. Never on the first calendar day of play (first session must reach a breakthrough). Golden Shovel removes it.
  fatigue: { activeSecPerDay: 25 * 60, slowMult: 0.5, restSec: 20 * 60, firstDayFree: true, activeWindowMs: 1500 },
  collectionRewardSecs: 300,    // all 4 finds of a layer → incomePerSec × this
  streakShareMin: 3,            // streak ≥ 3 is a share moment (SPEC §2.5)
  // Phase 2 additions (SPEC §2.5): referral friends and the seasonal world hole. Core balance above is untouched.
  referral: { idlePctPerFriend: 0.02, maxFriends: 25, qualifyTaps: 100 }, // each qualified friend = +2% idle, up to 25
  world: { boostMult: 2, boostHours: 24, defaultK: 5000 },               // when the world hole reaches the core: ×2 for 24 h, then a new season
  // Layers top-down from the surface. The far side mirrors them.
  layers: [
    // val = coins per meter, hard = effort (tap/helper output) per meter. The first 1 km is as fast as v1; from granite down the rock
    // gets harder faster than it pays, so the second half of the planet takes days of helpers instead of minutes (Phase 5).
    { id: 'soil',    top: 0,       val: 1,   hard: 1,   c: ['#6b4a30', '#7d5a3c', '#543823'] },
    { id: 'clay',    top: 3,       val: 1.6, hard: 1,   c: ['#a4643f', '#b5744b', '#8a5133'] },
    { id: 'sed',     top: 40,      val: 2.5, hard: 1,   c: ['#c9a36b', '#b88f5a', '#d8b47d'] },
    { id: 'granite', top: 1000,    val: 5,   hard: 2,   c: ['#8c8a8f', '#a3a0a6', '#6f6d73'] },
    { id: 'crust',   top: 15000,   val: 10,  hard: 4,   c: ['#5d5466', '#6e6478', '#4a4252'] },
    { id: 'umantle', top: 35000,   val: 20,  hard: 8,   c: ['#8f3b22', '#a5472a', '#73301c'] },
    { id: 'lmantle', top: 660000,  val: 45,  hard: 20,  c: ['#b0401d', '#c75222', '#8c3216'] },
    { id: 'ocore',   top: 2890000, val: 110, hard: 60,  c: ['#e07a1f', '#f08f2a', '#c4661a'] },
    { id: 'icore',   top: 5150000, val: 250, hard: 150, c: ['#ffd36b', '#ffe49a', '#f5b942'] },
  ] as Layer[],
  farSideValStep: 1.5,          // value multiplier per layer on the way up
  tools: [
    { id: 'spoon',   e: '🥄', pow: 0.1,   cost: 0 },
    { id: 'shovel',  e: '🪏', pow: 0.3,   cost: 15 },
    { id: 'pick',    e: '⛏️', pow: 0.8,   cost: 150 },
    { id: 'hammer',  e: '🔨', pow: 2.5,   cost: 1500 },
    { id: 'drill',   e: '🪛', pow: 8,     cost: 15e3 },
    { id: 'digger',  e: '🚜', pow: 30,    cost: 150e3 },
    { id: 'borer',   e: '🚇', pow: 120,   cost: 1.5e6 },
    { id: 'laser',   e: '🔦', pow: 500,   cost: 15e6 },
    { id: 'plasma',  e: '☄️', pow: 2500,  cost: 150e6 },
    { id: 'hole',    e: '🌀', pow: 12000, cost: 1.5e9 },
  ] as Tool[],
  helpers: [
    { id: 'dog',     e: '🐶', rate: 0.1,  cost: 12 },
    { id: 'grandpa', e: '👴', rate: 0.4,  cost: 110 },
    { id: 'badger',  e: '🦡', rate: 1.5,  cost: 1000 },
    { id: 'robot',   e: '🤖', rate: 6,    cost: 9000 },
    { id: 'crew',    e: '👷', rate: 25,   cost: 80e3 },
    { id: 'rig',     e: '🏗️', rate: 100,  cost: 750e3 },
    { id: 'aliens',  e: '🛸', rate: 450,  cost: 7e6 },
    { id: 'dragon',  e: '🐉', rate: 2000, cost: 65e6 },
  ] as Helper[],
  shareUrl: typeof __SITE_URL__ !== 'undefined' ? __SITE_URL__ : 'https://thehole.world', // public origin, injected by vite.config.ts (VITE_SITE_URL); the fallback keeps tools/sim.js working in Node
  tgApp: 'https://t.me/TheHoleWorldBot/play', // Mini App deep link; share links inside Telegram use it with ?startapp=r_<code>
  // 4 finds per layer: common, rare, epic, legendary
  finds: {
    soil:    ['🪱', '🥔', '🪙', '💍'],
    clay:    ['🦴', '🏺', '🗝️', '👑'],
    sed:     ['🐚', '🦷', '🦕', '🦖'],
    granite: ['🪨', '💎', '⛏️', '☄️'],
    crust:   ['🧲', '🔮', '🛢️', '🗿'],
    umantle: ['🔥', '💠', '🌋', '🐲'],
    lmantle: ['⚙️', '🧿', '🪐', '👽'],
    ocore:   ['🧪', '🌀', '⚡', '🛸'],
    icore:   ['✨', '🌟', '☀️', '🌍'],
  } as Record<string, [string, string, string, string]>,
  milestones: [ // depth (m) → fact key
    { d: 3, k: 'm_clay' }, { d: 40, k: 'm_40' }, { d: 1000, k: 'm_1km' },
    { d: 4000, k: 'm_mine' }, { d: 8849, k: 'm_everest' }, { d: 10994, k: 'm_mariana' },
    { d: 12262, k: 'm_kola' }, { d: 35000, k: 'm_mantle' }, { d: 150000, k: 'm_diamond' },
    { d: 2890000, k: 'm_ocore' }, { d: 5150000, k: 'm_icore' }, { d: 6371000, k: 'm_center' },
  ] as Milestone[],
  bigMilestones: ['m_kola', 'm_mantle', 'm_diamond', 'm_ocore', 'm_icore', 'm_center'], // open a share modal on the first run
  // Infinite prestige (Phase 5): after the breakthrough the digger moves to the next world. Each world is harder per meter
  // (hardMult) and pays more per meter (val), the star bonus carries over. After the last world the list repeats with lapHardMult.
  lapHardMult: 200,               // each lap of the world list: ×200 hardness against ×128 from seven stars, so every lap is ~1.6× the previous
  worlds: [
    { id: 'earth', e: '🌍', r: 6371000, hardMult: 1, ground: ['#4fae3d', '#6fd257'], layers: [] as Layer[], finds: {} as Record<string, [string, string, string, string]>, milestones: [] as Milestone[], sky: ['#6eb9f0', '#b9e0fc'] },
    { id: 'moon', e: '🌙', r: 1737400, hardMult: 3, ground: ['#7c7c84', '#9a9aa2'], sky: ['#0b0f1f', '#1f2744'], layers: [
      { id: 'regolith', top: 0,       val: 3,   hard: 1.5, c: ['#8d8d93', '#a2a2a8', '#6e6e74'] },
      { id: 'megareg',  top: 15,      val: 6,   hard: 3,   c: ['#6f6f78', '#82828c', '#565660'] },
      { id: 'anorth',   top: 2000,    val: 14,  hard: 7,   c: ['#c9c6bf', '#d9d6cf', '#aaa69e'] },
      { id: 'mmantle',  top: 50000,   val: 40,  hard: 20,  c: ['#7a5a4a', '#8e6a58', '#5e4538'] },
      { id: 'mcore',    top: 1400000, val: 120, hard: 60,  c: ['#b8b0a0', '#d0c8b8', '#948c7c'] } ],
      finds: { regolith: ['🪨', '👣', '🚩', '🧀'], megareg: ['🔩', '🛰️', '🥾', '🚀'], anorth: ['⚪', '💠', '🔭', '🧿'], mmantle: ['🌑', '🔥', '🪐', '👽'], mcore: ['🧲', '💎', '🌕', '🌚'] },
      milestones: [{ d: 15, k: 'm_moon_reg' }, { d: 2000, k: 'm_moon_crust' }, { d: 50000, k: 'm_moon_mantle' }, { d: 1400000, k: 'm_moon_core' }, { d: 1737400, k: 'm_moon_center' }] },
    { id: 'mars', e: '🔴', r: 3389500, hardMult: 8, ground: ['#9c4a26', '#c9663a'], sky: ['#d9915a', '#f2c29b'], layers: [
      { id: 'rdust',    top: 0,       val: 5,   hard: 1.5, c: ['#b5552e', '#c9663a', '#8f4324'] },
      { id: 'permafr',  top: 20,      val: 10,  hard: 3,   c: ['#9db0c4', '#b3c4d6', '#7f93a8'] },
      { id: 'mbasalt',  top: 500,     val: 20,  hard: 7,   c: ['#5a3a30', '#6d4a3e', '#452c24'] },
      { id: 'rmantle',  top: 50000,   val: 60,  hard: 20,  c: ['#8a3a22', '#a0482b', '#6c2d1a'] },
      { id: 'rcore',    top: 1800000, val: 180, hard: 60,  c: ['#c47a3a', '#dd8f48', '#9c5f2c'] } ],
      finds: { rdust: ['🌪️', '🥫', '🤖', '🛸'], permafr: ['🧊', '🦠', '🧬', '🐟'], mbasalt: ['🪨', '🧲', '🏔️', '🗿'], rmantle: ['🌋', '💠', '🔥', '🐉'], rcore: ['⚙️', '💎', '🪐', '👾'] },
      milestones: [{ d: 20, k: 'm_mars_ice' }, { d: 500, k: 'm_mars_basalt' }, { d: 21900, k: 'm_mars_olympus' }, { d: 50000, k: 'm_mars_mantle' }, { d: 3389500, k: 'm_mars_center' }] },
    { id: 'venus', e: '🟠', r: 6051800, hardMult: 20, ground: ['#7a4216', '#a35a22'], sky: ['#c9a24a', '#e8d28a'], layers: [
      { id: 'vlava',    top: 0,       val: 8,   hard: 1.5, c: ['#8a4a1a', '#a35a22', '#6b3813'] },
      { id: 'vbasalt',  top: 10,      val: 16,  hard: 3,   c: ['#4a3a3a', '#5c4848', '#382b2b'] },
      { id: 'vlitho',   top: 500,     val: 35,  hard: 7,   c: ['#6b5a4a', '#7e6b59', '#52443a'] },
      { id: 'vmantle',  top: 60000,   val: 100, hard: 20,  c: ['#a64b1e', '#bf5a26', '#833a16'] },
      { id: 'vcore',    top: 3000000, val: 300, hard: 60,  c: ['#e8a93a', '#f7bf52', '#c08a2c'] } ],
      finds: { vlava: ['🌋', '🫧', '🛰️', '👑'], vbasalt: ['🪨', '🧪', '🔮', '💍'], vlitho: ['🧲', '💠', '🗝️', '🦂'], vmantle: ['🔥', '⚗️', '🐍', '🐲'], vcore: ['⚡', '💎', '☀️', '👸'] },
      milestones: [{ d: 10, k: 'm_venus_plains' }, { d: 500, k: 'm_venus_crust' }, { d: 60000, k: 'm_venus_mantle' }, { d: 3000000, k: 'm_venus_core' }, { d: 6051800, k: 'm_venus_center' }] },
    { id: 'neptune', e: '🔵', r: 24622000, hardMult: 50, ground: ['#4a78c8', '#6a95e0'], sky: ['#2a5bb8', '#6f9be0'], layers: [
      { id: 'nclouds',  top: 0,        val: 15,  hard: 1,   c: ['#4f7fd6', '#6a95e0', '#3c64ad'] },
      { id: 'nhydro',   top: 1000,     val: 30,  hard: 3,   c: ['#2f55a8', '#3f68bd', '#244284'] },
      { id: 'nice',     top: 5000000,  val: 80,  hard: 8,   c: ['#8fd3e8', '#aee2f1', '#6fb3c8'] },
      { id: 'ndiamond', top: 10000000, val: 250, hard: 25,  c: ['#d8f0ff', '#ffffff', '#b0d4ee'] },
      { id: 'ncore',    top: 20000000, val: 700, hard: 70,  c: ['#5a5a6a', '#6e6e80', '#444452'] } ],
      finds: { nclouds: ['☁️', '🌀', '🪁', '🐋'], nhydro: ['🫧', '🧊', '⚗️', '🧜'], nice: ['❄️', '🔷', '🧊', '🦑'], ndiamond: ['💎', '💠', '👑', '🔱'], ncore: ['🪨', '🧲', '🌌', '🐙'] },
      milestones: [{ d: 1000, k: 'm_nep_wind' }, { d: 5000000, k: 'm_nep_ice' }, { d: 10000000, k: 'm_nep_diamond' }, { d: 20000000, k: 'm_nep_core' }, { d: 24622000, k: 'm_nep_center' }] },
    { id: 'jupiter', e: '🟤', r: 69911000, hardMult: 120, ground: ['#b89470', '#dbb48f'], sky: ['#c89a6a', '#e9c9a4'], layers: [
      { id: 'jclouds',  top: 0,        val: 25,   hard: 1,   c: ['#c9a07a', '#dbb48f', '#a8835f'] },
      { id: 'jstorm',   top: 50000,    val: 50,   hard: 3,   c: ['#b8603a', '#cf7449', '#914a2c'] },
      { id: 'jhydro',   top: 1000000,  val: 120,  hard: 8,   c: ['#8a7a6a', '#9e8e7c', '#6a5c50'] },
      { id: 'jmetal',   top: 20000000, val: 400,  hard: 25,  c: ['#9aa3b8', '#b2bbcf', '#78809a'] },
      { id: 'jcore',    top: 60000000, val: 1200, hard: 70,  c: ['#e0c070', '#f0d48a', '#b89a52'] } ],
      finds: { jclouds: ['☁️', '🎈', '🪂', '🦅'], jstorm: ['🌪️', '⚡', '🔴', '👁️'], jhydro: ['🫧', '🧪', '🌊', '🐳'], jmetal: ['🧲', '⚙️', '🔩', '🤖'], jcore: ['🪨', '💎', '🌟', '👑'] },
      milestones: [{ d: 50000, k: 'm_jup_storm' }, { d: 1000000, k: 'm_jup_ocean' }, { d: 20000000, k: 'm_jup_metal' }, { d: 60000000, k: 'm_jup_core' }, { d: 69911000, k: 'm_jup_center' }] },
    { id: 'sun', e: '☀️', r: 696000000, hardMult: 200, ground: ['#e0962a', '#ffc85e'], sky: ['#ffb02e', '#ffe08a'], layers: [
      { id: 'photo',    top: 0,         val: 40,   hard: 1,   c: ['#ffb43a', '#ffc85e', '#e0962a'] },
      { id: 'convect',  top: 500000,    val: 100,  hard: 3,   c: ['#ff8c1a', '#ffa23f', '#d87212'] },
      { id: 'radiat',   top: 200000000, val: 300,  hard: 8,   c: ['#ff6a1a', '#ff8440', '#d6540f'] },
      { id: 'fusion',   top: 500000000, val: 1000, hard: 25,  c: ['#fff1b8', '#ffffff', '#ffd980'] } ],
      finds: { photo: ['🔥', '🌞', '🕶️', '🦅'], convect: ['🫧', '🌡️', '⚡', '🐦‍🔥'], radiat: ['☢️', '💡', '🔆', '🧞'], fusion: ['⚛️', '💎', '🌟', '🏆'] },
      milestones: [{ d: 500000, k: 'm_sun_photo' }, { d: 200000000, k: 'm_sun_convect' }, { d: 500000000, k: 'm_sun_core' }, { d: 696000000, k: 'm_sun_center' }] },
  ] as World[],
  // Supported UI languages (BCP-47 tags matching src/i18n/*.json)
  langs: ['en', 'ru', 'es', 'pt-BR', 'id', 'tr', 'de', 'fr', 'ja', 'ko', 'zh-CN', 'hi'],
};
export type Config = typeof CFG;
export default CFG;
