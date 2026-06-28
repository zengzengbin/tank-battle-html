import test from "node:test";
import assert from "node:assert/strict";
import * as core from "../src/core.mjs";

import {
  LEVELS,
  MAX_LEVEL,
  SAVE_KEY,
  applyDamage,
  applyPowerUp,
  createDefaultSave,
  damageTerrain,
  loadSave,
  parseMap,
  recordResult,
} from "../src/core.mjs";

test("defines five progressively larger enemy waves", () => {
  assert.equal(MAX_LEVEL, 5);
  assert.deepEqual(LEVELS.map((level) => level.enemyCount), [12, 14, 16, 20, 24]);
  assert.ok(LEVELS.every((level) => level.map.length === 13));
  assert.ok(LEVELS.every((level) => level.map.every((row) => row.length === 13)));
});

test("every level places the player one tile north of the base front wall", () => {
  assert.deepEqual(core.PLAYER_SPAWN, { x: 6, y: 10 });
  for (const level of LEVELS) {
    assert.equal(level.map[12][6], "B", `${level.name} base must remain at the bottom`);
    assert.equal(level.map[11][6], "b", `${level.name} base needs a front brick wall`);
    assert.equal(level.map[10][6], ".", `${level.name} player spawn must be north of the wall`);
  }
});

test("a player bullet can cross the full battlefield when unobstructed", () => {
  assert.equal(typeof core.PLAYER_BULLET_SPEED, "number");
  assert.equal(typeof core.BULLET_LIFETIME_MS, "number");
  const travelDistance = core.PLAYER_BULLET_SPEED * (core.BULLET_LIFETIME_MS / 1000);
  assert.ok(travelDistance >= 416, `bullet travel distance was only ${travelDistance}px`);
});

test("parses the 13 by 13 map and requires one base", () => {
  const parsed = parseMap(LEVELS[0].map);
  assert.equal(parsed.width, 13);
  assert.equal(parsed.height, 13);
  assert.equal(parsed.base.x, 6);
  assert.equal(parsed.base.y, 12);
  assert.throws(() => parseMap(["..."]), /13 x 13/);
});

test("brick quadrants break while steel requires maximum firepower", () => {
  assert.deepEqual(damageTerrain({ type: "brick", mask: 15 }, 0, 1), {
    type: "brick",
    mask: 13,
  });
  assert.equal(damageTerrain({ type: "brick", mask: 1 }, 0, 0), null);
  assert.deepEqual(damageTerrain({ type: "steel", mask: 15 }, 2, 0), {
    type: "steel",
    mask: 15,
  });
  assert.equal(damageTerrain({ type: "steel", mask: 15 }, 3, 0), null);
});

test("damage respects shields and consumes armor", () => {
  assert.deepEqual(applyDamage({ hp: 1, shieldUntil: 5000 }, 1000, 1), {
    hp: 1,
    shieldUntil: 5000,
    destroyed: false,
  });
  assert.deepEqual(applyDamage({ hp: 4, shieldUntil: 0 }, 1000, 1), {
    hp: 3,
    shieldUntil: 0,
    destroyed: false,
  });
});

test("player hits consume lives and only end the attempt after the last life", () => {
  assert.equal(typeof core.resolvePlayerHit, "function");
  assert.deepEqual(core.resolvePlayerHit(3), {
    lives: 2,
    gameOver: false,
    reason: "坦克被击毁",
  });
  assert.deepEqual(core.resolvePlayerHit(1), {
    lives: 0,
    gameOver: true,
    reason: "坦克被击毁",
  });
});

test("power-ups upgrade firepower and apply timed effects", () => {
  const initial = { firepower: 0, shieldUntil: 0, freezeUntil: 0, fortifyUntil: 0 };
  assert.equal(applyPowerUp(initial, "star", 1000).firepower, 1);
  assert.equal(applyPowerUp({ ...initial, firepower: 3 }, "star", 1000).firepower, 3);
  assert.equal(applyPowerUp(initial, "shield", 1000).shieldUntil, 9000);
  assert.equal(applyPowerUp(initial, "freeze", 1000).freezeUntil, 7000);
  assert.equal(applyPowerUp(initial, "fortify", 1000).fortifyUntil, 13000);
});

test("save loading tolerates missing, malformed, and unavailable storage", () => {
  assert.equal(SAVE_KEY, "tank-battle-save-v1");
  assert.deepEqual(loadSave({ getItem: () => null }), createDefaultSave());
  assert.deepEqual(loadSave({ getItem: () => "bad json" }), createDefaultSave());
  assert.deepEqual(loadSave({ getItem: () => { throw new Error("blocked"); } }), createDefaultSave());
});

test("recording a win unlocks the next level and preserves the best score", () => {
  const first = recordResult(createDefaultSave(), { level: 1, won: true, score: 1200 });
  assert.equal(first.unlockedLevel, 2);
  assert.equal(first.highScore, 1200);
  const lower = recordResult(first, { level: 2, won: false, score: 500 });
  assert.equal(lower.unlockedLevel, 2);
  assert.equal(lower.highScore, 1200);
  const final = recordResult({ ...first, unlockedLevel: MAX_LEVEL }, { level: MAX_LEVEL, won: true, score: 1500 });
  assert.equal(final.unlockedLevel, MAX_LEVEL);
  assert.equal(final.highScore, 1500);
});
