import test from "node:test";
import assert from "node:assert/strict";
let physics = {};
try {
  physics = await import("../src/physics.mjs");
} catch {
  // The first TDD run intentionally exercises the missing helper.
}

test("clampPointToRect keeps a sprite fully inside the battlefield", () => {
  assert.equal(typeof physics.clampPointToRect, "function");
  assert.deepEqual(
    physics.clampPointToRect(70, 90, { x: 78, y: 62, width: 416, height: 416 }, 14, 14),
    { x: 92, y: 90, clamped: true },
  );
  assert.deepEqual(
    physics.clampPointToRect(200, 200, { x: 78, y: 62, width: 416, height: 416 }, 14, 14),
    { x: 200, y: 200, clamped: false },
  );
});

test("isPointInsideRect treats projectile size as part of the boundary", () => {
  assert.equal(typeof physics.isPointInsideRect, "function");
  const rect = { x: 78, y: 62, width: 416, height: 416 };
  assert.equal(physics.isPointInsideRect(90, 90, rect, 3, 4), true);
  assert.equal(physics.isPointInsideRect(79, 90, rect, 3, 4), false);
  assert.equal(physics.isPointInsideRect(492, 90, rect, 3, 4), false);
  assert.equal(physics.isPointInsideRect(90, 63, rect, 3, 4), false);
  assert.equal(physics.isPointInsideRect(90, 477, rect, 3, 4), false);
});

test("launchBullet applies velocity after a physics group resets new members", () => {
  assert.equal(typeof physics.launchBullet, "function");
  const bullet = {
    velocity: { x: 0, y: 0 },
    setVelocity(x, y) {
      this.velocity = { x, y };
      return this;
    },
  };
  const group = {
    add(member) {
      member.setVelocity(0, 0);
    },
  };

  physics.launchBullet(bullet, group, 0, -360);

  assert.deepEqual(bullet.velocity, { x: 0, y: -360 });
});
