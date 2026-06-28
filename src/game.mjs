import Phaser from "phaser";
import {
  LEVELS,
  MAX_LEVEL,
  BULLET_LIFETIME_MS,
  PLAYER_BULLET_SPEED,
  PLAYER_SPAWN,
  applyPowerUp,
  loadSave,
  recordResult,
  resolvePlayerHit,
  saveProgress,
} from "./core.mjs";
import { clampPointToRect, isPointInsideRect, launchBullet } from "./physics.mjs";

const WIDTH = 960;
const HEIGHT = 540;
const CELL = 32;
const MAP_SIZE = CELL * 13;
const MAP_X = 78;
const MAP_Y = 62;
const BATTLEFIELD = Object.freeze({ x: MAP_X, y: MAP_Y, width: MAP_SIZE, height: MAP_SIZE });
const FONT = '"Courier New", "Microsoft YaHei", monospace';
const DIRECTIONS = {
  up: { x: 0, y: -1, angle: 0 },
  right: { x: 1, y: 0, angle: 90 },
  down: { x: 0, y: 1, angle: 180 },
  left: { x: -1, y: 0, angle: 270 },
};
const ENEMY_TYPES = [
  { key: "enemy-basic", hp: 1, speed: 74, fireDelay: 1150, score: 100 },
  { key: "enemy-fast", hp: 1, speed: 112, fireDelay: 1050, score: 200 },
  { key: "enemy-power", hp: 1, speed: 82, fireDelay: 620, score: 300 },
  { key: "enemy-armor", hp: 4, speed: 62, fireDelay: 900, score: 400 },
];
const POWER_TYPES = ["star", "shield", "freeze", "bomb", "fortify"];
const POWER_LABELS = { star: "★", shield: "盾", freeze: "停", bomb: "爆", fortify: "钢" };
const INITIAL_LIVES = 2;
const RESPAWN_SHIELD_MS = 1800;

class Synth {
  constructor() {
    this.context = null;
    this.enabled = true;
    this.musicTimer = null;
    this.musicStep = 0;
  }

  unlock() {
    if (!this.enabled) return;
    const Context = window.AudioContext || window.webkitAudioContext;
    if (!Context) return;
    this.context ||= new Context();
    if (this.context.state === "suspended") this.context.resume();
  }

  tone(frequency, duration = 0.08, type = "square", volume = 0.035, slide = 0) {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context) return;
    const now = this.context.currentTime;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, now);
    oscillator.frequency.linearRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    oscillator.connect(gain).connect(this.context.destination);
    oscillator.start(now);
    oscillator.stop(now + duration);
  }

  play(name) {
    const sounds = {
      shoot: () => this.tone(210, 0.07, "square", 0.04, -90),
      hit: () => this.tone(90, 0.09, "sawtooth", 0.05, -40),
      brick: () => this.tone(135, 0.045, "square", 0.025, -30),
      pickup: () => [520, 660, 820].forEach((f, i) => setTimeout(() => this.tone(f, 0.07), i * 55)),
      life: () => [180, 130].forEach((f, i) => setTimeout(() => this.tone(f, 0.2, "sawtooth", 0.05, -60), i * 80)),
      win: () => [392, 523, 659, 784].forEach((f, i) => setTimeout(() => this.tone(f, 0.16), i * 100)),
      lose: () => [220, 174, 130].forEach((f, i) => setTimeout(() => this.tone(f, 0.22, "square", 0.05, -30), i * 130)),
    };
    sounds[name]?.();
  }

  startMusic() {
    this.stopMusic();
    const notes = [110, 147, 165, 147, 123, 147, 196, 165];
    this.musicTimer = setInterval(() => {
      if (document.hidden) return;
      this.tone(notes[this.musicStep++ % notes.length], 0.11, "square", 0.012);
    }, 330);
  }

  stopMusic() {
    clearInterval(this.musicTimer);
    this.musicTimer = null;
  }
}

const synth = new Synth();

function textStyle(size, color = "#f5e7b2", align = "center") {
  return { fontFamily: FONT, fontSize: `${size}px`, color, align, stroke: "#111827", strokeThickness: 3 };
}

function addButton(scene, x, y, label, onClick, options = {}) {
  const width = options.width || 230;
  const height = options.height || 46;
  const depth = options.depth || 0;
  const bg = scene.add.rectangle(x, y, width, height, options.color || 0x243544)
    .setStrokeStyle(2, options.stroke || 0xd9a441)
    .setInteractive({ useHandCursor: true }).setDepth(depth);
  const labelText = scene.add.text(x, y, label, textStyle(options.size || 22)).setOrigin(0.5).setDepth(depth + 1);
  bg.on("pointerover", () => bg.setFillStyle(0x365365));
  bg.on("pointerout", () => bg.setFillStyle(options.color || 0x243544));
  bg.on("pointerdown", () => { synth.unlock(); bg.setScale(0.97); });
  bg.on("pointerup", () => { bg.setScale(1); onClick(); });
  return { bg, label: labelText };
}

function weightedEnemy(weights) {
  let roll = Phaser.Math.Between(1, weights.reduce((sum, value) => sum + value, 0));
  for (let index = 0; index < weights.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return index;
  }
  return 0;
}

function makeTextures(scene) {
  if (scene.textures.exists("player")) return;
  const graphics = scene.make.graphics({ add: false });

  const tank = (key, color, accent) => {
    graphics.clear();
    graphics.fillStyle(0x111827).fillRect(1, 2, 6, 24).fillRect(21, 2, 6, 24);
    graphics.fillStyle(color).fillRect(7, 3, 14, 22).fillRect(4, 5, 3, 5).fillRect(21, 5, 3, 5);
    graphics.fillStyle(accent).fillRect(9, 7, 10, 12).fillRect(12, 1, 4, 8);
    graphics.fillStyle(0xf8e7a1).fillRect(12, 10, 4, 4);
    graphics.generateTexture(key, 28, 28);
  };
  tank("player", 0xd9a441, 0xffdc73);
  tank("enemy-basic", 0xb45f3f, 0xe68a5f);
  tank("enemy-fast", 0x4da36a, 0x8ed1a2);
  tank("enemy-power", 0x7d5cc6, 0xb9a4ef);
  tank("enemy-armor", 0x87909a, 0xd3d8dd);

  graphics.clear().fillStyle(0xf7f1d0).fillRect(1, 0, 4, 8).generateTexture("bullet", 6, 8);
  graphics.clear().fillStyle(0x8f442b).fillRect(0, 0, 16, 16)
    .fillStyle(0xc3633e).fillRect(1, 1, 14, 5).fillRect(1, 9, 14, 5)
    .fillStyle(0x5b291c).fillRect(0, 7, 16, 2).generateTexture("brick", 16, 16);
  graphics.clear().fillStyle(0x687681).fillRect(0, 0, 32, 32)
    .fillStyle(0xaeb8bf).fillRect(2, 2, 28, 5).fillRect(2, 18, 28, 5)
    .lineStyle(2, 0x37424b).strokeRect(1, 1, 30, 30).generateTexture("steel", 32, 32);
  graphics.clear().fillStyle(0x194f80).fillRect(0, 0, 32, 32)
    .lineStyle(2, 0x4ca3d9).lineBetween(2, 8, 16, 8).lineBetween(12, 17, 30, 17).lineBetween(1, 26, 20, 26)
    .generateTexture("water", 32, 32);
  graphics.clear().fillStyle(0x73b7d1).fillRect(0, 0, 32, 32)
    .lineStyle(2, 0xc8edf3).lineBetween(3, 8, 27, 3).lineBetween(8, 24, 29, 16)
    .generateTexture("ice", 32, 32);
  graphics.clear().fillStyle(0x2f7040).fillCircle(8, 9, 8).fillCircle(22, 7, 8).fillCircle(16, 20, 10)
    .fillStyle(0x4d9857).fillCircle(13, 10, 5).fillCircle(24, 20, 5).generateTexture("grass", 32, 32);
  graphics.clear().fillStyle(0xd3b35b).fillRect(2, 8, 28, 21)
    .fillStyle(0x5f4721).fillTriangle(4, 8, 16, 0, 28, 8)
    .fillStyle(0x203446).fillRect(11, 14, 10, 15).fillStyle(0xf5df8a).fillRect(14, 17, 4, 8)
    .generateTexture("base", 32, 32);
  graphics.clear().fillStyle(0xf5d259).fillCircle(14, 14, 13).fillStyle(0x704a14).fillCircle(14, 14, 9)
    .generateTexture("power", 28, 28);
  graphics.destroy();
}

class BootScene extends Phaser.Scene {
  constructor() { super("boot"); }
  create() {
    makeTextures(this);
    this.scene.start("menu");
  }
}

class MenuScene extends Phaser.Scene {
  constructor() { super("menu"); }
  create() {
    this.save = loadSave(window.localStorage);
    synth.enabled = this.save.sound;
    this.cameras.main.setBackgroundColor("#0d151b");
    this.drawBackdrop();
    this.add.text(WIDTH / 2, 78, "坦 克 大 战", textStyle(52, "#ffd166")).setOrigin(0.5);
    this.add.text(WIDTH / 2, 126, "守住基地 · 击退钢铁军团", textStyle(18, "#8fd3a8")).setOrigin(0.5);
    addButton(this, WIDTH / 2, 190, this.save.unlockedLevel > 1 ? "继续游戏" : "开始游戏", () => {
      synth.startMusic();
      this.scene.start("game", { level: this.save.unlockedLevel });
    });
    this.add.text(WIDTH / 2, 240, "关卡选择", textStyle(18, "#aab7c4")).setOrigin(0.5);
    const levelButtonSpacing = 86;
    const levelButtonStartX = WIDTH / 2 - ((MAX_LEVEL - 1) * levelButtonSpacing) / 2;
    for (let index = 1; index <= MAX_LEVEL; index += 1) {
      const unlocked = index <= this.save.unlockedLevel;
      addButton(this, levelButtonStartX + (index - 1) * levelButtonSpacing, 282, unlocked ? `${index}` : "锁", () => {
        if (unlocked) { synth.startMusic(); this.scene.start("game", { level: index }); }
      }, { width: 72, height: 48, color: unlocked ? 0x29495a : 0x222a30, stroke: unlocked ? 0x80c58b : 0x59636b });
    }
    addButton(this, WIDTH / 2 - 120, 354, this.save.sound ? "声音：开" : "声音：关", () => {
      this.save.sound = !this.save.sound;
      synth.enabled = this.save.sound;
      saveProgress(window.localStorage, this.save);
      this.scene.restart();
    }, { width: 210, size: 19 });
    addButton(this, WIDTH / 2 + 120, 354, "操作说明", () => this.showHelp(), { width: 210, size: 19 });
    this.add.text(WIDTH / 2, 420, `最高分 ${String(this.save.highScore).padStart(6, "0")}`, textStyle(20, "#c8d6df")).setOrigin(0.5);
    this.add.text(WIDTH / 2, 505, "移动：WASD / 方向键    开火：空格 / J    暂停：P / Esc", textStyle(15, "#718391")).setOrigin(0.5);
    window.__TANK_GAME_READY__ = true;
  }

  drawBackdrop() {
    for (let i = 0; i < 42; i += 1) {
      const x = Phaser.Math.Between(0, WIDTH);
      const y = Phaser.Math.Between(0, HEIGHT);
      this.add.rectangle(x, y, Phaser.Math.Between(8, 28), Phaser.Math.Between(8, 28), 0x1a2b32, 0.45)
        .setAngle(Phaser.Math.Between(0, 3) * 90);
    }
    this.add.image(170, 170, "player").setScale(3).setAlpha(0.18).setAngle(-25);
    this.add.image(790, 375, "enemy-armor").setScale(3.5).setAlpha(0.16).setAngle(25);
  }

  showHelp() {
    const blocker = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x05090c, 0.86).setDepth(20).setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 600, 360, 0x17252e).setStrokeStyle(3, 0xd9a441).setDepth(21);
    const copy = [
      "守住地图下方基地，消灭本关全部敌军。",
      "砖墙可破坏；钢墙需要三级火力；水面不可通行。",
      "草丛会遮挡坦克；冰面会让坦克短暂滑行。",
      "击毁发光敌军会掉落升级、护盾、冻结、炸弹或加固。",
      "注意：你的炮弹也能摧毁自己的基地！",
    ].join("\n\n");
    this.add.text(WIDTH / 2, 238, copy, { ...textStyle(18, "#dce8ec", "left"), lineSpacing: 5 }).setOrigin(0.5).setDepth(22);
    addButton(this, WIDTH / 2, 410, "明白了", () => this.scene.restart(), { width: 180, depth: 22 });
    this.children.bringToTop(panel);
    this.children.bringToTop(blocker);
  }
}

class GameScene extends Phaser.Scene {
  constructor() { super("game"); }

  init(data) {
    this.levelNumber = Phaser.Math.Clamp(data.level || 1, 1, MAX_LEVEL);
    this.level = LEVELS[this.levelNumber - 1];
    this.score = data.score || 0;
    this.lives = INITIAL_LIVES;
    this.spawned = 0;
    this.killed = 0;
    this.ended = false;
    this.paused = false;
    this.freezeUntil = 0;
    this.fortifyUntil = 0;
    this.firepower = 0;
    this.lastPlayerVelocity = { x: 0, y: -1 };
  }

  create() {
    this.cameras.main.setBackgroundColor("#101920");
    this.physics.world.setBounds(MAP_X, MAP_Y, MAP_SIZE, MAP_SIZE);
    this.createGroups();
    this.createMap();
    this.createHud();
    this.createDesktopPanel();
    this.createPlayer();
    this.configureCollisions();
    this.nextSpawnAt = this.time.now + 500;
    this.keys = this.input.keyboard.addKeys("W,A,S,D,J,SPACE,P,ESC");
    this.cursors = this.input.keyboard.createCursorKeys();
    this.input.keyboard.on("keydown-P", () => this.togglePause());
    this.input.keyboard.on("keydown-ESC", () => this.togglePause());
    this.events.on("shutdown", () => synth.stopMusic());
    this.physics.world.on("worldbounds", (body) => body.gameObject?.destroy());
    this.updateHud();
  }

  createGroups() {
    this.tankSolids = this.physics.add.staticGroup();
    this.bulletSolids = this.physics.add.staticGroup();
    this.enemies = this.physics.add.group();
    this.bullets = this.physics.add.group();
    this.powerUps = this.physics.add.group({ allowGravity: false, immovable: true });
    this.grass = this.add.group();
    this.iceCells = new Set();
    this.fortress = [];
  }

  cellCenter(x, y) { return { x: MAP_X + x * CELL + CELL / 2, y: MAP_Y + y * CELL + CELL / 2 }; }

  createMap() {
    this.add.rectangle(MAP_X + MAP_SIZE / 2, MAP_Y + MAP_SIZE / 2, MAP_SIZE + 10, MAP_SIZE + 10, 0x070b0e)
      .setStrokeStyle(4, 0x52616a).setDepth(-4);
    this.add.grid(MAP_X + MAP_SIZE / 2, MAP_Y + MAP_SIZE / 2, MAP_SIZE, MAP_SIZE, CELL, CELL, 0x10191b, 1, 0x243035, 0.18).setDepth(-3);

    this.level.map.forEach((row, y) => [...row].forEach((char, x) => {
      const point = this.cellCenter(x, y);
      if (char === "b") this.createBrick(x, y);
      if (char === "s") this.addSolid(point.x, point.y, "steel", "steel", true, true);
      if (char === "w") this.addSolid(point.x, point.y, "water", "water", true, false);
      if (char === "g") this.grass.add(this.add.image(point.x, point.y, "grass").setDepth(18));
      if (char === "i") { this.add.image(point.x, point.y, "ice").setDepth(-1); this.iceCells.add(`${x},${y}`); }
      if (char === "B") {
        this.base = this.addSolid(point.x, point.y, "base", "base", true, true);
        this.base.setDepth(3);
      }
    }));
  }

  addSolid(x, y, texture, type, blocksTank, blocksBullet) {
    const object = this.physics.add.staticImage(x, y, texture).setData("type", type);
    if (blocksTank) this.tankSolids.add(object);
    if (blocksBullet) this.bulletSolids.add(object);
    return object;
  }

  createBrick(cellX, cellY) {
    for (let quadrant = 0; quadrant < 4; quadrant += 1) {
      const x = MAP_X + cellX * CELL + 8 + (quadrant % 2) * 16;
      const y = MAP_Y + cellY * CELL + 8 + Math.floor(quadrant / 2) * 16;
      const brick = this.physics.add.staticImage(x, y, "brick")
        .setData("type", "brick").setData("quadrant", quadrant);
      this.tankSolids.add(brick);
      this.bulletSolids.add(brick);
    }
  }

  createHud() {
    this.add.text(24, 18, `第 ${this.levelNumber} 关  ${this.level.name}`, textStyle(20, "#ffd166", "left")).setOrigin(0, 0.5);
    this.hudText = this.add.text(WIDTH - 24, 18, "", textStyle(18, "#dce7ec", "right")).setOrigin(1, 0.5);
    this.add.text(24, 46, "保护基地", textStyle(14, "#8fd3a8", "left")).setOrigin(0, 0.5);
    this.statusText = this.add.text(WIDTH - 24, 46, "", textStyle(14, "#8fd3a8", "right")).setOrigin(1, 0.5);
  }

  createDesktopPanel() {
    this.add.rectangle(742, 270, 330, 414, 0x17252e, 0.86).setStrokeStyle(2, 0x52616a);
    this.add.text(742, 94, "键盘操作", textStyle(25, "#ffd166")).setOrigin(0.5);
    this.add.text(650, 145, "移动", textStyle(16, "#8fd3a8", "left")).setOrigin(0, 0.5);
    this.add.text(650, 180, "W A S D  /  方向键", textStyle(20, "#dce8ec", "left")).setOrigin(0, 0.5);
    this.add.text(650, 235, "开火", textStyle(16, "#8fd3a8", "left")).setOrigin(0, 0.5);
    this.add.text(650, 270, "空格 / J", textStyle(22, "#ffb37f", "left")).setOrigin(0, 0.5);
    this.add.text(650, 325, "暂停", textStyle(16, "#8fd3a8", "left")).setOrigin(0, 0.5);
    this.add.text(650, 360, "P / Esc", textStyle(20, "#dce8ec", "left")).setOrigin(0, 0.5);
    addButton(this, 742, 430, "暂停游戏", () => this.togglePause(), { width: 220, height: 42, size: 18, color: 0x293943, depth: 30 });
  }

  createPlayer() {
    const point = this.cellCenter(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    this.player = this.physics.add.sprite(point.x, point.y, "player").setDepth(8).setCollideWorldBounds(true);
    this.player.body.setSize(25, 25);
    this.player.setData({ team: "player", direction: "up", hp: 1, shieldUntil: 0, lastShot: 0 });
    this.tweens.add({ targets: this.player, alpha: { from: 0.25, to: 1 }, duration: 180, yoyo: true, repeat: 5 });
  }

  configureCollisions() {
    this.physics.add.collider(this.player, this.tankSolids);
    this.physics.add.collider(this.enemies, this.tankSolids, (enemy) => this.turnEnemy(enemy, true));
    this.physics.add.collider(this.player, this.enemies);
    this.physics.add.collider(this.enemies, this.enemies, (a, b) => { this.turnEnemy(a, true); this.turnEnemy(b, true); });
    this.physics.add.collider(this.bullets, this.bulletSolids, (bullet, solid) => this.hitSolid(bullet, solid));
    this.physics.add.overlap(this.bullets, this.enemies, (a, b) => this.hitEnemyWithBullet(a, b));
    this.physics.add.overlap(this.bullets, this.player, (a, b) => this.hitPlayerWithBullet(a, b));
    this.physics.add.overlap(this.bullets, this.bullets, (a, b) => {
      if (a !== b && a.active && b.active && a.getData("team") !== b.getData("team")) { a.destroy(); b.destroy(); }
    });
    this.physics.add.overlap(this.player, this.powerUps, (_player, power) => this.collectPower(power));
  }

  update(time) {
    if (this.paused || this.ended) return;
    if (this.player?.active) this.updatePlayer(time);
    this.updateEnemies(time);
    this.spawnEnemies(time);
    this.updateBullets();
    this.constrainTanksToBattlefield();
    this.updateEffects(time);
    if (this.killed >= this.level.enemyCount && this.enemies.countActive(true) === 0) this.finish(true);
  }

  getInputDirection() {
    if (this.cursors.left.isDown || this.keys.A.isDown) return "left";
    if (this.cursors.right.isDown || this.keys.D.isDown) return "right";
    if (this.cursors.up.isDown || this.keys.W.isDown) return "up";
    if (this.cursors.down.isDown || this.keys.S.isDown) return "down";
    return null;
  }

  updatePlayer(time) {
    const direction = this.getInputDirection();
    const speed = 105;
    if (direction) {
      const vector = DIRECTIONS[direction];
      this.player.setData("direction", direction).setAngle(vector.angle).setVelocity(vector.x * speed, vector.y * speed);
      this.lastPlayerVelocity = { x: vector.x * speed, y: vector.y * speed };
    } else if (this.isOnIce(this.player)) {
      this.player.setVelocity(this.lastPlayerVelocity.x * 0.82, this.lastPlayerVelocity.y * 0.82);
      this.lastPlayerVelocity.x *= 0.97;
      this.lastPlayerVelocity.y *= 0.97;
    } else {
      this.player.setVelocity(0);
    }
    if (this.keys.SPACE.isDown || this.keys.J.isDown) this.tryShoot(this.player, true, time);
  }

  isOnIce(entity) {
    const x = Math.floor((entity.x - MAP_X) / CELL);
    const y = Math.floor((entity.y - MAP_Y) / CELL);
    return this.iceCells.has(`${x},${y}`);
  }

  spawnEnemies(time) {
    if (time < this.nextSpawnAt || this.spawned >= this.level.enemyCount || this.enemies.countActive(true) >= 4) return;
    const points = [0, 6, 12];
    const cellX = points[this.spawned % points.length];
    const point = this.cellCenter(cellX, 0);
    const occupied = this.enemies.getChildren().some((enemy) => enemy.active && Phaser.Math.Distance.Between(enemy.x, enemy.y, point.x, point.y) < 35);
    if (occupied) { this.nextSpawnAt = time + 400; return; }
    const typeIndex = weightedEnemy(this.level.weights);
    const config = ENEMY_TYPES[typeIndex];
    const enemy = this.physics.add.sprite(point.x, point.y, config.key).setDepth(7).setCollideWorldBounds(true);
    enemy.body.setSize(25, 25);
    enemy.setData({
      team: "enemy", typeIndex, hp: config.hp, direction: "down", nextTurn: time + Phaser.Math.Between(500, 1300),
      nextShot: time + Phaser.Math.Between(500, 1100), bonus: this.spawned % 4 === 3, flashOn: false,
    });
    if (enemy.getData("bonus")) this.tweens.add({ targets: enemy, alpha: 0.45, duration: 180, yoyo: true, repeat: -1 });
    this.enemies.add(enemy);
    this.spawned += 1;
    this.nextSpawnAt = time + this.level.spawnDelay;
    this.updateHud();
  }

  updateEnemies(time) {
    const frozen = time < this.freezeUntil;
    this.enemies.getChildren().forEach((enemy) => {
      if (!enemy.active) return;
      if (frozen) { enemy.setVelocity(0); enemy.setTint(0x8ed7f0); return; }
      enemy.clearTint();
      if (time >= enemy.getData("nextTurn")) this.turnEnemy(enemy, false, time);
      const direction = DIRECTIONS[enemy.getData("direction")];
      const speed = ENEMY_TYPES[enemy.getData("typeIndex")].speed;
      enemy.setVelocity(direction.x * speed, direction.y * speed).setAngle(direction.angle);
      if (time >= enemy.getData("nextShot")) this.tryShoot(enemy, false, time);
    });
  }

  turnEnemy(enemy, forced = false, time = this.time.now) {
    if (!enemy?.active || (!forced && time < enemy.getData("nextTurn"))) return;
    let direction;
    const strategy = Phaser.Math.Between(0, 9);
    if (strategy < 4) direction = "down";
    else if (strategy < 6 && this.player?.active) {
      const dx = this.player.x - enemy.x;
      const dy = this.player.y - enemy.y;
      direction = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
    } else direction = Phaser.Utils.Array.GetRandom(["up", "right", "down", "left"]);
    enemy.setData("direction", direction);
    enemy.setData("nextTurn", time + Phaser.Math.Between(550, 1450));
  }

  tryShoot(tank, playerShot, time = this.time.now) {
    if (!tank?.active) return;
    const firepower = playerShot ? this.firepower : 0;
    const config = playerShot ? { fireDelay: Math.max(170, 430 - firepower * 75) } : ENEMY_TYPES[tank.getData("typeIndex")];
    const lastShot = tank.getData("lastShot") || 0;
    const nextShot = tank.getData("nextShot") || 0;
    if ((playerShot && time - lastShot < config.fireDelay) || (!playerShot && time < nextShot)) return;
    const directionName = tank.getData("direction");
    const direction = DIRECTIONS[directionName];
    const bullet = this.physics.add.sprite(tank.x + direction.x * 20, tank.y + direction.y * 20, "bullet")
      .setDepth(6).setAngle(direction.angle).setData("team", playerShot ? "player" : "enemy")
      .setData("firepower", firepower).setData("born", time);
    bullet.body.setSize(5, 8);
    bullet.body.onWorldBounds = true;
    bullet.setCollideWorldBounds(true);
    const speed = PLAYER_BULLET_SPEED + firepower * 35;
    launchBullet(bullet, this.bullets, direction.x * speed, direction.y * speed);
    tank.setData("lastShot", time);
    if (!playerShot) tank.setData("nextShot", time + config.fireDelay + Phaser.Math.Between(100, 650));
    synth.play("shoot");
    this.muzzleFlash(tank.x + direction.x * 18, tank.y + direction.y * 18);
  }

  hitSolid(bullet, solid) {
    if (!bullet.active || !solid.active) return;
    const type = solid.getData("type");
    if (type === "brick") { solid.destroy(); synth.play("brick"); this.spark(solid.x, solid.y, 0xb65b38, 4); }
    if (type === "steel" && bullet.getData("team") === "player" && bullet.getData("firepower") >= 3) {
      solid.destroy(); synth.play("hit"); this.spark(solid.x, solid.y, 0xb8c5cc, 7);
    }
    if (type === "base") {
      solid.destroy();
      this.base = null;
      this.explode(solid.x, solid.y, true);
      bullet.destroy();
      this.finish(false, "基地被摧毁");
      return;
    }
    bullet.destroy();
  }

  getBulletAndOther(a, b) {
    const aIsBullet = a?.getData?.("born") !== undefined;
    const bIsBullet = b?.getData?.("born") !== undefined;
    if (aIsBullet && !bIsBullet) return { bullet: a, other: b };
    if (bIsBullet && !aIsBullet) return { bullet: b, other: a };
    return { bullet: null, other: null };
  }

  hitPlayerWithBullet(a, b) {
    const { bullet, other: player } = this.getBulletAndOther(a, b);
    if (!bullet?.active || !player?.active || player !== this.player || bullet.getData("team") !== "enemy") return;
    if (player.getData("shieldUntil") > this.time.now) {
      bullet.destroy();
      this.spark(player.x, player.y, 0x7de1ff, 4);
      return;
    }
    bullet.destroy();
    this.loseLife("坦克被击毁");
  }

  hitEnemyWithBullet(a, b) {
    const { bullet, other: enemy } = this.getBulletAndOther(a, b);
    if (!bullet?.active || !enemy?.active || enemy === this.player || bullet.getData("team") !== "player") return;
    bullet.destroy();
    const hp = enemy.getData("hp") - 1;
    enemy.setData("hp", hp);
    if (hp > 0) { enemy.setTint(0xffffff); this.time.delayedCall(80, () => enemy?.active && enemy.clearTint()); synth.play("hit"); return; }
    this.destroyEnemy(enemy, true);
  }

  destroyEnemy(enemy, credit) {
    if (!enemy?.active) return;
    const { x, y } = enemy;
    const config = ENEMY_TYPES[enemy.getData("typeIndex")];
    const bonus = enemy.getData("bonus");
    enemy.destroy();
    if (credit) this.score += config.score;
    this.killed += 1;
    this.explode(x, y);
    if (bonus) this.spawnPowerUp(x, y);
    this.updateHud();
  }

  loseLife(reason = "坦克被击毁") {
    if (!this.player?.active || this.ended) return;
    const { x, y } = this.player;
    const result = resolvePlayerHit(this.lives);
    this.lives = result.lives;
    this.firepower = 0;
    this.player.disableBody(true, true);
    this.explode(x, y, true);
    this.updateHud();
    if (result.gameOver) {
      this.finish(false, reason || result.reason);
      return;
    }
    this.time.delayedCall(800, () => this.respawnPlayer());
  }

  respawnPlayer() {
    if (this.ended || this.player?.active) return;
    const point = this.cellCenter(PLAYER_SPAWN.x, PLAYER_SPAWN.y);
    const shieldUntil = this.time.now + RESPAWN_SHIELD_MS;
    this.lastPlayerVelocity = { x: 0, y: -1 };
    this.player.enableBody(true, point.x, point.y, true, true);
    this.player.setAngle(0).setVelocity(0, 0);
    this.player.setData({ team: "player", direction: "up", hp: 1, shieldUntil, lastShot: 0 });
    this.updateShieldRing(this.time.now);
    this.tweens.add({ targets: this.player, alpha: { from: 0.25, to: 1 }, duration: 150, yoyo: true, repeat: 5 });
    this.updateHud();
  }

  spawnPowerUp(x, y) {
    const type = POWER_TYPES[this.killed % POWER_TYPES.length];
    const power = this.physics.add.sprite(x, y, "power").setDepth(12).setData("type", type);
    const label = this.add.text(x, y, POWER_LABELS[type], textStyle(15, "#fff5c2")).setOrigin(0.5).setDepth(13);
    power.setData("label", label);
    this.powerUps.add(power);
    this.tweens.add({ targets: [power, label], alpha: 0.45, duration: 240, yoyo: true, repeat: -1 });
    this.time.delayedCall(10000, () => { if (power.active) { label.destroy(); power.destroy(); } });
  }

  collectPower(power) {
    const type = power.getData("type");
    power.getData("label")?.destroy();
    power.destroy();
    const state = applyPowerUp({
      firepower: this.firepower, shieldUntil: this.player.getData("shieldUntil") || 0,
      freezeUntil: this.freezeUntil, fortifyUntil: this.fortifyUntil,
    }, type, this.time.now);
    this.firepower = state.firepower;
    this.player.setData("shieldUntil", state.shieldUntil);
    this.updateShieldRing(this.time.now);
    this.freezeUntil = state.freezeUntil;
    if (state.fortifyUntil > this.fortifyUntil) this.activateFortress(state.fortifyUntil);
    this.fortifyUntil = state.fortifyUntil;
    if (state.clearEnemies) [...this.enemies.getChildren()].forEach((enemy) => this.destroyEnemy(enemy, true));
    this.score += 500;
    synth.play("pickup");
    this.updateHud();
  }

  activateFortress(until) {
    this.fortress.forEach((tile) => tile.destroy());
    this.fortress = [];
    [[5, 11], [6, 11], [7, 11], [5, 12], [7, 12]].forEach(([x, y]) => {
      const point = this.cellCenter(x, y);
      const tile = this.addSolid(point.x, point.y, "steel", "steel", true, true).setTint(0xd8e7ec).setDepth(5);
      this.fortress.push(tile);
    });
    this.time.delayedCall(Math.max(0, until - this.time.now), () => {
      this.fortress.forEach((tile) => tile?.active && tile.destroy());
      this.fortress = [];
    });
  }

  updateShieldRing(time) {
    if (!this.player?.active || this.player.getData("shieldUntil") <= time) {
      this.shieldRing?.setVisible(false);
      return;
    }
    if (!this.shieldRing) {
      this.shieldRing = this.add.circle(this.player.x, this.player.y, 22).setStrokeStyle(3, 0x70d9ff, 0.85).setDepth(11);
      this.shieldRing.setBlendMode(Phaser.BlendModes.ADD);
    }
    this.shieldRing
      .setPosition(this.player.x, this.player.y)
      .setVisible(true)
      .setAlpha(0.62 + Math.sin(time / 80) * 0.25)
      .setScale(1 + Math.sin(time / 130) * 0.08);
  }

  updateEffects(time) {
    this.updateShieldRing(time);
    const statuses = [];
    if (time < this.freezeUntil) statuses.push(`冻结 ${Math.ceil((this.freezeUntil - time) / 1000)}s`);
    if (time < this.fortifyUntil) statuses.push(`基地钢化 ${Math.ceil((this.fortifyUntil - time) / 1000)}s`);
    if (this.firepower > 0) statuses.push(`火力 Lv.${this.firepower + 1}`);
    this.statusText.setText(statuses.join("  "));
  }

  updateBullets() {
    this.bullets.getChildren().forEach((bullet) => {
      if (!bullet.active) return;
      const halfWidth = Math.max(bullet.displayWidth || 0, bullet.body?.width || 0) / 2;
      const halfHeight = Math.max(bullet.displayHeight || 0, bullet.body?.height || 0) / 2;
      if (this.time.now - bullet.getData("born") > BULLET_LIFETIME_MS
        || !isPointInsideRect(bullet.x, bullet.y, BATTLEFIELD, halfWidth, halfHeight)) {
        bullet.destroy();
      }
    });
  }

  constrainTankToBattlefield(tank, turnOnClamp = false) {
    if (!tank?.active || !tank.body) return;
    const halfWidth = Math.max(tank.displayWidth || 0, tank.body.width || 0) / 2;
    const halfHeight = Math.max(tank.displayHeight || 0, tank.body.height || 0) / 2;
    const clamped = clampPointToRect(tank.x, tank.y, BATTLEFIELD, halfWidth, halfHeight);
    if (!clamped.clamped) return;
    tank.setPosition(clamped.x, clamped.y);
    tank.setVelocity(0, 0);
    tank.body.updateFromGameObject();
    if (turnOnClamp) this.turnEnemy(tank, true);
  }

  constrainTanksToBattlefield() {
    this.constrainTankToBattlefield(this.player);
    this.enemies.getChildren().forEach((enemy) => this.constrainTankToBattlefield(enemy, true));
  }

  updateHud() {
    this.hudText?.setText(`生命 ${this.lives}   剩余 ${this.level.enemyCount - this.killed}   分数 ${String(this.score).padStart(6, "0")}`);
  }

  muzzleFlash(x, y) {
    const flash = this.add.circle(x, y, 7, 0xffe28a, 0.9).setDepth(14);
    this.tweens.add({ targets: flash, scale: 0.1, alpha: 0, duration: 90, onComplete: () => flash.destroy() });
  }

  spark(x, y, color, count) {
    for (let i = 0; i < count; i += 1) {
      const bit = this.add.rectangle(x, y, 4, 4, color).setDepth(15);
      this.tweens.add({ targets: bit, x: x + Phaser.Math.Between(-24, 24), y: y + Phaser.Math.Between(-24, 24), alpha: 0, duration: 260, onComplete: () => bit.destroy() });
    }
  }

  explode(x, y, large = false) {
    synth.play("hit");
    this.cameras.main.shake(large ? 130 : 65, large ? 0.008 : 0.003);
    [0xffd166, 0xf47b45, 0x7a2e2e].forEach((color, layer) => {
      const blast = this.add.circle(x, y, (large ? 14 : 9) - layer * 2, color, 0.9).setDepth(16);
      this.tweens.add({ targets: blast, scale: 2.3 + layer, alpha: 0, duration: 180 + layer * 60, onComplete: () => blast.destroy() });
    });
    this.spark(x, y, 0xf6b94c, large ? 12 : 7);
  }

  togglePause() {
    if (this.ended) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.physics.pause();
      synth.stopMusic();
      this.pauseOverlay = this.add.container(0, 0).setDepth(80);
      const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x05090c, 0.82).setInteractive();
      const title = this.add.text(WIDTH / 2, 180, "游戏暂停", textStyle(38, "#ffd166")).setOrigin(0.5);
      const resume = addButton(this, WIDTH / 2, 260, "继续战斗", () => this.togglePause());
      const restart = addButton(this, WIDTH / 2, 320, "重开本关", () => { synth.startMusic(); this.scene.restart({ level: this.levelNumber }); });
      const menu = addButton(this, WIDTH / 2, 380, "返回主页", () => this.scene.start("menu"));
      this.pauseOverlay.add([shade, title, resume.bg, resume.label, restart.bg, restart.label, menu.bg, menu.label]);
    } else {
      this.pauseOverlay?.destroy(true);
      this.physics.resume();
      synth.startMusic();
    }
  }

  finish(won, reason = "") {
    if (this.ended) return;
    this.ended = true;
    this.physics.pause();
    synth.stopMusic();
    synth.play(won ? "win" : "lose");
    const oldSave = loadSave(window.localStorage);
    const save = recordResult(oldSave, { level: this.levelNumber, won, score: this.score });
    saveProgress(window.localStorage, save);
    const result = { won, reason, level: this.levelNumber, score: this.score, final: won && this.levelNumber === MAX_LEVEL };
    if (!won) {
      this.showFailureOverlay(result);
      return;
    }
    let transitioned = false;
    const showResult = () => {
      if (transitioned) return;
      transitioned = true;
      this.scene.start("result", result);
    };
    this.time.delayedCall(700, showResult);
    window.setTimeout(showResult, 900);
  }

  showFailureOverlay(result) {
    this.failureOverlay?.destroy(true);
    this.failureOverlay = this.add.container(0, 0).setDepth(100);
    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x05090c, 0.86).setInteractive();
    const panel = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 560, 340, 0x271617).setStrokeStyle(3, 0xff8b75);
    const title = this.add.text(WIDTH / 2, 150, "任务失败", textStyle(44, "#ff8b75")).setOrigin(0.5);
    const reason = this.add.text(WIDTH / 2, 205, result.reason || "坦克被击毁", textStyle(21, "#cddde4")).setOrigin(0.5);
    const score = this.add.text(WIDTH / 2, 255, `本次得分  ${String(result.score).padStart(6, "0")}`, textStyle(24, "#8fd3a8")).setOrigin(0.5);
    const retry = addButton(this, WIDTH / 2, 325, "重试本关", () => {
      synth.startMusic();
      this.scene.restart({ level: result.level });
    }, { width: 220, depth: 101 });
    const menu = addButton(this, WIDTH / 2, 385, "返回主页", () => this.scene.start("menu"), { width: 220, color: 0x263943, depth: 101 });
    this.failureOverlay.add([shade, panel, title, reason, score, retry.bg, retry.label, menu.bg, menu.label]);
  }
}

class ResultScene extends Phaser.Scene {
  constructor() { super("result"); }
  init(data) { this.result = data; }
  create() {
    const { won, reason, level, score, final } = this.result;
    this.cameras.main.setBackgroundColor(won ? "#12271d" : "#271617");
    this.add.text(WIDTH / 2, 105, final ? "钢铁防线守住了！" : won ? `第 ${level} 关完成` : "任务失败", textStyle(46, won ? "#ffd166" : "#ff8b75")).setOrigin(0.5);
    this.add.text(WIDTH / 2, 175, won ? (final ? "五大战区全部告捷" : "基地安全，准备进入下一战区") : reason, textStyle(21, "#cddde4")).setOrigin(0.5);
    this.add.text(WIDTH / 2, 235, `本次得分  ${String(score).padStart(6, "0")}`, textStyle(25, "#8fd3a8")).setOrigin(0.5);
    if (won && level < MAX_LEVEL) addButton(this, WIDTH / 2, 320, "进入下一关", () => { synth.startMusic(); this.scene.start("game", { level: level + 1, score }); });
    else if (!won) addButton(this, WIDTH / 2, 320, "重试本关", () => { synth.startMusic(); this.scene.start("game", { level }); });
    else addButton(this, WIDTH / 2, 320, "再次挑战", () => { synth.startMusic(); this.scene.start("game", { level: 1 }); });
    addButton(this, WIDTH / 2, 390, "返回主页", () => this.scene.start("menu"), { color: 0x263943 });
  }
}

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game-root",
  width: WIDTH,
  height: HEIGHT,
  backgroundColor: "#101920",
  pixelArt: true,
  roundPixels: true,
  physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene, MenuScene, GameScene, ResultScene],
});

document.addEventListener("visibilitychange", () => {
  const gameScene = game.scene.getScene("game");
  if (document.hidden && gameScene?.scene.isActive() && !gameScene.paused && !gameScene.ended) gameScene.togglePause();
});
