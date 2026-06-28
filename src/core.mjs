export const SAVE_KEY = "tank-battle-save-v1";
export const PLAYER_BULLET_SPEED = 360;
export const BULLET_LIFETIME_MS = 2500;
export const PLAYER_SPAWN = Object.freeze({ x: 6, y: 10 });

const MAPS = [
  [
    ".............",
    "..bbb...bbb..",
    "..b.......b..",
    "..b..bbb..b..",
    ".....b.b.....",
    ".bb..b.b..bb.",
    ".............",
    "..bbb...bbb..",
    "....b...b....",
    "....b...b....",
    ".....b.b.....",
    ".....bbb.....",
    ".....bBb.....",
  ],
  [
    ".............",
    ".ggbb...bbgg.",
    ".g.........g.",
    "..www...www..",
    "..w.b...b.w..",
    "..w.......w..",
    "..www...www..",
    ".gg..bbb..gg.",
    "...b.....b...",
    ".bbb..b..bbb.",
    ".....b.b.....",
    ".....bbb.....",
    ".....bBb.....",
  ],
  [
    ".............",
    ".ss..bbb..ss.",
    "..i.......i..",
    "..i.ss.ss.i..",
    "..i.......i..",
    "bbb..iii..bbb",
    ".....iii.....",
    ".ss..iii..ss.",
    "...b.....b...",
    "..bb..s..bb..",
    ".....b.b.....",
    ".....bbb.....",
    ".....bBb.....",
  ],
  [
    ".............",
    ".gss.bbb.ssg.",
    ".g.w.....w.g.",
    "...w.b.b.w...",
    ".iiw.....wii.",
    ".i.www.www.i.",
    ".i.........i.",
    ".gg..sss..gg.",
    "..bb.....bb..",
    ".bbb..s..bbb.",
    ".....b.b.....",
    ".....bbb.....",
    ".....bBb.....",
  ],
  [
    ".............",
    ".s.g.bbb.g.s.",
    ".w.........w.",
    ".w.b.s.s.b.w.",
    ".w...i.i...w.",
    "sss..i.i..sss",
    "...g.www.g...",
    ".bb..sss..bb.",
    "..s.......s..",
    ".bbb..s..bbb.",
    ".....b.b.....",
    ".....bbb.....",
    ".....bBb.....",
  ],
];

export const LEVELS = [
  { id: 1, name: "边境初战", enemyCount: 12, spawnDelay: 1900, weights: [55, 25, 15, 5], map: MAPS[0] },
  { id: 2, name: "水草迷阵", enemyCount: 14, spawnDelay: 1650, weights: [38, 32, 20, 10], map: MAPS[1] },
  { id: 3, name: "寒钢要塞", enemyCount: 16, spawnDelay: 1450, weights: [25, 30, 25, 20], map: MAPS[2] },
  { id: 4, name: "终极防线", enemyCount: 20, spawnDelay: 1250, weights: [18, 27, 27, 28], map: MAPS[3] },
  { id: 5, name: "钢铁风暴", enemyCount: 24, spawnDelay: 1100, weights: [12, 24, 28, 36], map: MAPS[4] },
];

export const MAX_LEVEL = LEVELS.length;

const TERRAIN_BY_CHAR = {
  b: "brick",
  s: "steel",
  w: "water",
  g: "grass",
  i: "ice",
};

export function parseMap(rows) {
  if (!Array.isArray(rows) || rows.length !== 13 || rows.some((row) => row.length !== 13)) {
    throw new Error("Map must be 13 x 13");
  }
  let base = null;
  const terrain = [];
  rows.forEach((row, y) => {
    [...row].forEach((char, x) => {
      if (char === "B") base = { x, y };
      const type = TERRAIN_BY_CHAR[char];
      if (type) terrain.push({ x, y, type, mask: type === "brick" || type === "steel" ? 15 : 0 });
    });
  });
  if (!base) throw new Error("Map requires one base");
  return { width: 13, height: 13, base, terrain };
}

export function damageTerrain(tile, firepower, quadrant) {
  if (!tile || (tile.type !== "brick" && tile.type !== "steel")) return tile;
  if (tile.type === "steel" && firepower < 3) return tile;
  if (tile.type === "steel") return null;
  const mask = tile.mask & ~(1 << quadrant);
  return mask === 0 ? null : { ...tile, mask };
}

export function applyDamage(entity, now, amount = 1) {
  if (entity.shieldUntil > now) return { ...entity, destroyed: false };
  const hp = Math.max(0, entity.hp - amount);
  return { ...entity, hp, destroyed: hp === 0 };
}

export function resolvePlayerHit(lives = 1) {
  const remainingLives = Math.max(0, Number(lives) - 1);
  return { lives: remainingLives, gameOver: remainingLives === 0, reason: "坦克被击毁" };
}

export function applyPowerUp(state, type, now) {
  if (type === "star") return { ...state, firepower: Math.min(3, state.firepower + 1) };
  if (type === "shield") return { ...state, shieldUntil: now + 8000 };
  if (type === "freeze") return { ...state, freezeUntil: now + 6000 };
  if (type === "fortify") return { ...state, fortifyUntil: now + 12000 };
  if (type === "bomb") return { ...state, clearEnemies: true };
  return { ...state };
}

export function createDefaultSave() {
  return { version: 1, unlockedLevel: 1, highScore: 0, sound: true };
}

export function loadSave(storage) {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return createDefaultSave();
    const value = JSON.parse(raw);
    if (value?.version !== 1) return createDefaultSave();
    return {
      version: 1,
      unlockedLevel: Math.min(MAX_LEVEL, Math.max(1, Number(value.unlockedLevel) || 1)),
      highScore: Math.max(0, Number(value.highScore) || 0),
      sound: value.sound !== false,
    };
  } catch {
    return createDefaultSave();
  }
}

export function saveProgress(storage, save) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

export function recordResult(save, result) {
  const unlockedLevel = result.won
    ? Math.max(save.unlockedLevel, Math.min(MAX_LEVEL, result.level + 1))
    : save.unlockedLevel;
  return {
    ...save,
    unlockedLevel,
    highScore: Math.max(save.highScore, result.score),
  };
}
