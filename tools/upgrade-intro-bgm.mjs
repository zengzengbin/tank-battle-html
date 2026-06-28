import { spawnSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

const toolsDir = dirname(fileURLToPath(import.meta.url));
const root = resolve(toolsDir, "..");
const video = resolve(root, "tank-battle-intro-15s.mp4");
const bgm = resolve(root, "tank-battle-intro-8bit-bgm.wav");
const output = resolve(root, "tank-battle-intro-15s-upgraded.mp4");

const sampleRate = 48000;
const duration = 15;
const totalSamples = sampleRate * duration;
const channels = 1;
const bytesPerSample = 2;
const dataSize = totalSamples * channels * bytesPerSample;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function midiToFreq(midi) {
  return 440 * (2 ** ((midi - 69) / 12));
}

function square(freq, t, duty = 0.5) {
  return (t * freq) % 1 < duty ? 1 : -1;
}

function triangle(freq, t) {
  const p = (t * freq) % 1;
  return 4 * Math.abs(p - 0.5) - 1;
}

function envelope(local, length, attack = 0.01, release = 0.08) {
  if (local < 0 || local > length) return 0;
  const a = attack > 0 ? clamp(local / attack, 0, 1) : 1;
  const r = release > 0 ? clamp((length - local) / release, 0, 1) : 1;
  return Math.min(a, r);
}

function noteAt(t, pattern, stepLength) {
  const index = Math.floor(t / stepLength) % pattern.length;
  const local = t % stepLength;
  return { midi: pattern[index], local, length: stepLength };
}

function writeWavHeader(buffer) {
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(channels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * channels * bytesPerSample, 28);
  buffer.writeUInt16LE(channels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(dataSize, 40);
}

const buffer = Buffer.alloc(44 + dataSize);
writeWavHeader(buffer);

const leadPattern = [64, 67, 71, 76, 74, 71, 67, 71, 64, 67, 72, 76, 79, 76, 72, 71];
const bassPattern = [40, 40, 47, 40, 43, 43, 47, 43];
const accentPattern = [76, 79, 83, 79, 81, 79, 76, 74];

for (let i = 0; i < totalSamples; i += 1) {
  const t = i / sampleRate;
  const sectionGain = t < 0.35 ? t / 0.35 : t > 14.1 ? (15 - t) / 0.9 : 1;

  const beat = t % 0.5;
  const kickEnv = Math.exp(-beat * 22) * (beat < 0.12 ? 1 : 0);
  const kick = Math.sin(2 * Math.PI * (52 + 28 * Math.exp(-beat * 32)) * t) * kickEnv * 0.42;

  const snareLocal = (t + 0.25) % 0.5;
  const snareEnv = Math.exp(-snareLocal * 35) * (snareLocal < 0.055 ? 1 : 0);
  const snare = (square(1800, t, 0.22) + square(1200, t, 0.34)) * snareEnv * 0.035;

  const bassNote = noteAt(t, bassPattern, 0.5);
  const bassFreq = midiToFreq(bassNote.midi);
  const bass = triangle(bassFreq, t) * envelope(bassNote.local, bassNote.length, 0.01, 0.12) * 0.16;

  const leadNote = noteAt(t, leadPattern, 0.25);
  const leadFreq = midiToFreq(leadNote.midi);
  const leadGate = leadNote.local < 0.18 ? 1 : 0;
  const lead = square(leadFreq, t, 0.38) * envelope(leadNote.local, 0.18, 0.008, 0.045) * leadGate * 0.085;

  const accentNote = noteAt(t + 0.125, accentPattern, 0.5);
  const accentFreq = midiToFreq(accentNote.midi);
  const accentGate = accentNote.local < 0.11 && t > 3 ? 1 : 0;
  const accent = square(accentFreq, t, 0.2) * envelope(accentNote.local, 0.11, 0.006, 0.035) * accentGate * 0.045;

  const sceneHit = [0, 3, 6, 9, 12].some((s) => t >= s && t < s + 0.18)
    ? Math.sin(2 * Math.PI * 98 * t) * Math.exp(-((t % 3) || t) * 9) * 0.18
    : 0;

  const mixed = (kick + snare + bass + lead + accent + sceneHit) * sectionGain * 0.72;
  const sample = Math.round(clamp(mixed, -1, 1) * 32767);
  buffer.writeInt16LE(sample, 44 + i * bytesPerSample);
}

writeFileSync(bgm, buffer);
console.log(`Generated BGM ${bgm}`);

const result = spawnSync("ffmpeg", [
  "-y",
  "-i", video,
  "-i", bgm,
  "-map", "0:v:0",
  "-map", "1:a:0",
  "-c:v", "copy",
  "-c:a", "aac",
  "-b:a", "160k",
  "-shortest",
  output,
], { stdio: "inherit" });

if (result.status !== 0) process.exit(result.status ?? 1);
console.log(`Rendered upgraded video ${output}`);
