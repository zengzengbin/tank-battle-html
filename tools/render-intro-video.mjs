import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, "..");
const output = resolve(root, "tank-battle-intro-15s.mp4");
const font = "Microsoft YaHei";

function text(value, x, y, size, color = "white", enable = "between(t,0,15)", extra = "") {
  return `drawtext=font='${font}':text='${value}':x=${x}:y=${y}:fontsize=${size}:fontcolor=${color}:enable='${enable}'${extra}`;
}

function box(x, y, w, h, color, enable = "between(t,0,15)", thickness = "fill") {
  return `drawbox=x=${x}:y=${y}:w=${w}:h=${h}:color=${color}:t=${thickness}:enable='${enable}'`;
}

const filters = [
  "format=rgba",
  "drawgrid=w=40:h=40:t=1:c=0x1a2a3a@0.45",
  box(60, 60, 1160, 600, "black@0.35"),
  box(60, 60, 1160, 600, "0x7dd3fc@0.22", "between(t,0,15)", 3),

  // Scene 1: title
  text("坦克大战", "(w-text_w)/2", 125, 86, "0xffd166", "between(t,0,3)"),
  text("电脑键盘版 · 复古像素战场", "(w-text_w)/2", 245, 34, "0xe8f2f6", "between(t,0.3,3)"),
  box("520+30*sin(t*4)", 385, 120, 58, "0x70d487@1", "between(t,0.6,3)"),
  box("640+30*sin(t*4)", 407, 70, 12, "0xffd166@1", "between(t,0.6,3)"),
  box("720+260*(t-1.2)", 409, 44, 8, "0xffd166@1", "between(t,1.2,2.6)"),

  // Scene 2: game objective
  text("守护基地", "(w-text_w)/2", 110, 62, "0xffd166", "between(t,3,6)"),
  text("在 13×13 战场中消灭敌军", "(w-text_w)/2", 215, 36, "0xe8f2f6", "between(t,3.2,6)"),
  text("砖墙、钢墙、草丛、冰面共同构成战术空间", "(w-text_w)/2", 270, 30, "0x8fd3a8", "between(t,3.4,6)"),
  box(500, 360, 280, 220, "0x101920@1", "between(t,3,6)"),
  box(500, 360, 280, 220, "0x52616a@1", "between(t,3,6)", 3),
  box(610, 505, 60, 42, "0xff7b72@1", "between(t,3,6)"),
  text("BASE", 602, 516, 19, "white", "between(t,3,6)"),
  box(545, 405, 42, 30, "0x70d487@1", "between(t,3,6)"),
  box(695, 405, 42, 30, "0xff7b72@1", "between(t,3,6)"),
  box("585+80*(t-3)", 417, 32, 7, "0xffd166@1", "between(t,3.6,5.3)"),

  // Scene 3: controls
  text("键盘操作", "(w-text_w)/2", 105, 62, "0xffd166", "between(t,6,9)"),
  box(310, 235, 130, 70, "0x263949@1", "between(t,6,9)"),
  box(460, 235, 160, 70, "0x263949@1", "between(t,6,9)"),
  box(640, 235, 130, 70, "0x263949@1", "between(t,6,9)"),
  box(790, 235, 170, 70, "0x263949@1", "between(t,6,9)"),
  text("WASD", 334, 252, 30, "white", "between(t,6,9)"),
  text("方向键", 495, 252, 30, "white", "between(t,6,9)"),
  text("空格", 673, 252, 30, "white", "between(t,6,9)"),
  text("J 开火", 829, 252, 30, "white", "between(t,6,9)"),
  text("移动 · 开火 · 暂停，一套键盘完成战斗", "(w-text_w)/2", 385, 34, "0xe8f2f6", "between(t,6.3,9)"),
  text("P / Esc 暂停", "(w-text_w)/2", 445, 30, "0x8fd3a8", "between(t,6.5,9)"),

  // Scene 4: features
  text("四关挑战", "(w-text_w)/2", 105, 62, "0xffd166", "between(t,9,12)"),
  text("2 条生命 · 中弹复活 · 短暂无敌", "(w-text_w)/2", 210, 38, "0x70d487", "between(t,9.2,12)"),
  text("星星提升火力  护盾抵挡攻击  冻结控制敌人", "(w-text_w)/2", 290, 31, "0xe8f2f6", "between(t,9.5,12)"),
  text("炸弹清场  基地钢化  打穿四大战区", "(w-text_w)/2", 345, 31, "0xe8f2f6", "between(t,9.7,12)"),
  box(365, 445, 90, 58, "0x70d487@1", "between(t,9.4,12)"),
  box(595, 445, 90, 58, "0x7dd3fc@1", "between(t,9.4,12)"),
  box(825, 445, 90, 58, "0xffd166@1", "between(t,9.4,12)"),
  text("生命", 378, 517, 25, "white", "between(t,9.4,12)"),
  text("护盾", 608, 517, 25, "white", "between(t,9.4,12)"),
  text("火力", 838, 517, 25, "white", "between(t,9.4,12)"),

  // Scene 5: final CTA
  text("即刻开战", "(w-text_w)/2", 120, 70, "0xffd166", "between(t,12,15)"),
  text("打开 坦克大战.html", "(w-text_w)/2", 250, 43, "0x70d487", "between(t,12.3,15)"),
  text("保护基地，打穿四大战区！", "(w-text_w)/2", 330, 38, "0xe8f2f6", "between(t,12.6,15)"),
  box(500, 445, 280, 64, "0xff7b72@1", "between(t,12.8,15)"),
  text("PLAY NOW", "(w-text_w)/2", 459, 33, "white", "between(t,12.8,15)"),

  "format=yuv420p",
].join(",");

const args = [
  "-y",
  "-f", "lavfi",
  "-i", "color=c=0x08111d:s=1280x720:d=15:r=30",
  "-f", "lavfi",
  "-i", "aevalsrc=0.08*sin(2*PI*110*t)+0.035*sin(2*PI*220*t)+0.025*sin(2*PI*330*t)+0.18*sin(2*PI*55*t)*lt(mod(t\\,0.5)\\,0.08):d=15:s=48000",
  "-vf", filters,
  "-af", "afade=t=in:st=0:d=0.35,afade=t=out:st=14:d=1,volume=0.45",
  "-shortest",
  "-t", "15",
  "-r", "30",
  "-c:v", "libx264",
  "-pix_fmt", "yuv420p",
  "-movflags", "+faststart",
  "-c:a", "aac",
  "-b:a", "128k",
  output,
];

const result = spawnSync("ffmpeg", args, { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Rendered ${output}`);
