import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

test("build creates one self-contained offline HTML game", () => {
  execFileSync(process.execPath, ["tools/build.mjs"], { stdio: "pipe" });
  const html = readFileSync("坦克大战.html", "utf8");
  assert.match(html, /<title>坦克大战<\/title>/);
  assert.match(html, /Phaser v3\.90\.0/);
  assert.match(html, /tank-battle-save-v1/);
  assert.match(html, /边境初战/);
  assert.match(html, /终极防线/);
  assert.match(html, /钢铁风暴/);
  assert.match(html, /空格 \/ J/);
  assert.doesNotMatch(html, /请将手机横过来/);
  assert.doesNotMatch(html, /手机横屏/);
  assert.doesNotMatch(html, /左侧方向/);
  assert.doesNotMatch(html, /<script[^>]+src=/i);
  assert.doesNotMatch(html, /<link[^>]+href=/i);
  assert.ok(statSync("坦克大战.html").size > 500_000);
});
