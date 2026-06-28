# 坦克大战电脑键盘版 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将现有手机优先版本改为纯电脑键盘版，并修复出生区导致的短射程体验。

**Architecture:** 保留 Phaser 战斗核心和单文件构建方式，仅收敛输入层、HUD 布局和地图出生区。通过核心地图测试与产物测试锁定行为，再进行浏览器试玩。

**Tech Stack:** Phaser 3.90、JavaScript ESM、Node test、esbuild

---

### Task 1: 出生通道回归测试

**Files:**
- Modify: `test/core.test.mjs`
- Modify: `src/core.mjs`

- [ ] 添加测试，断言四关 `map[11][6]` 与 `map[10][6]` 均为 `.`。
- [ ] 运行 `node --test test/core.test.mjs`，确认旧地图因第 10 行中央砖墙失败。
- [ ] 将四张地图第 10 行中央格改为空地，同时保留基地两侧砖墙。
- [ ] 重跑测试，期望全部通过。

### Task 2: 电脑输入与布局

**Files:**
- Modify: `test/build.test.mjs`
- Modify: `src/game.mjs`
- Modify: `tools/build.mjs`

- [ ] 添加产物测试，要求包含 `空格 / J`，且不包含 `请将手机横过来`、`手机横屏` 和触控按钮文案。
- [ ] 运行 `node --test test/build.test.mjs`，确认旧产物失败。
- [ ] 删除触控状态与控件，给 `J` 加入开火映射，更新说明与右侧电脑键位面板。
- [ ] 将战场扩大到 468 像素并调整地图、实体与 HUD 定位，保持逻辑网格不变。
- [ ] 删除构建模板中的竖屏遮罩和移动端媒体查询。
- [ ] 运行 `npm.cmd test`，期望全部通过。

### Task 3: 构建与浏览器验收

**Files:**
- Generate: `坦克大战.html`

- [ ] 运行 `npm.cmd run build`，生成单文件产物。
- [ ] 在 1280×720 浏览器中启动游戏，验证键盘移动、空格/J 开火和 P/Esc 暂停。
- [ ] 将坦克移至开阔区域，确认子弹在未碰撞时跨越多个格子。
- [ ] 检查控制台无游戏错误，再运行 `npm.cmd test` 做最终验证。
