/* THE HOLE WORLD — balance & content config. All tuning lives here.
   Imported by the game (Vite) and by tools/sim.js (Node, native type stripping): keep the syntax erasable. */

export interface Layer { id: string; top: number; val: number; c: [string, string, string] }
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
  prestigeMultPerStar: 0.5,     // total mult = 1 + 0.5 × stars
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
    { id: 'soil',    top: 0,       val: 1,   c: ['#6b4a30', '#7d5a3c', '#543823'] },
    { id: 'clay',    top: 3,       val: 1.6, c: ['#a4643f', '#b5744b', '#8a5133'] },
    { id: 'sed',     top: 40,      val: 2.5, c: ['#c9a36b', '#b88f5a', '#d8b47d'] },
    { id: 'granite', top: 1000,    val: 4,   c: ['#8c8a8f', '#a3a0a6', '#6f6d73'] },
    { id: 'crust',   top: 15000,   val: 7,   c: ['#5d5466', '#6e6478', '#4a4252'] },
    { id: 'umantle', top: 35000,   val: 12,  c: ['#8f3b22', '#a5472a', '#73301c'] },
    { id: 'lmantle', top: 660000,  val: 20,  c: ['#b0401d', '#c75222', '#8c3216'] },
    { id: 'ocore',   top: 2890000, val: 32,  c: ['#e07a1f', '#f08f2a', '#c4661a'] },
    { id: 'icore',   top: 5150000, val: 50,  c: ['#ffd36b', '#ffe49a', '#f5b942'] },
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
  // Supported UI languages (BCP-47 tags matching src/i18n/*.json)
  langs: ['en', 'ru', 'es', 'pt-BR', 'id', 'tr', 'de', 'fr', 'ja', 'ko', 'zh-CN', 'hi'],
};
export type Config = typeof CFG;
export default CFG;
