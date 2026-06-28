import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const bundled = await build({
  entryPoints: [resolve(root, "src/game.mjs")],
  bundle: true,
  minify: true,
  write: false,
  format: "iife",
  platform: "browser",
  target: ["es2020"],
  charset: "utf8",
  legalComments: "none",
});

const phaserLicense = await readFile(resolve(root, "node_modules/phaser/LICENSE.md"), "utf8");
const script = bundled.outputFiles[0].text;
const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="theme-color" content="#0d151b">
  <title>坦克大战</title>
  <style>
    *{box-sizing:border-box}html,body{width:100%;height:100%;margin:0;overflow:hidden;background:#080d11;color:#fff;font-family:"Courier New","Microsoft YaHei",monospace;user-select:none;-webkit-user-select:none}
    body{display:grid;place-items:center}#game-root{width:100vw;height:100vh;display:grid;place-items:center}canvas{display:block;image-rendering:pixelated;image-rendering:crisp-edges;max-width:100%;max-height:100%;box-shadow:0 0 50px #000}
  </style>
</head>
<body>
  <div id="game-root" aria-label="坦克大战游戏画面"></div>
  <!-- Phaser v3.90.0 license (MIT):
${phaserLicense.replaceAll("--", "—")}
  -->
  <script>${script.replaceAll("</script", "<\\/script")}</script>
</body>
</html>`;

await writeFile(resolve(root, "坦克大战.html"), html, "utf8");
console.log(`Built 坦克大战.html (${Buffer.byteLength(html).toLocaleString()} bytes)`);
