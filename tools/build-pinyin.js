#!/usr/bin/env node
/* 生成 app/src/main/assets/pinyin.js —— 搜索用的汉字→拼音表。

   为什么要按「用到的字」裁剪：全量拼音表 2 万汉字约 200 KB，而知识包正文只用到两千多个字，
   裁完约 30 KB，APK 开销可以忽略。

   数据源：tools/data/pinyin-src.txt（每行「字<TAB>拼音1,拼音2」，无声调，ü 记作 v）
   用法：
     node tools/build-pinyin.js              用现有数据源重建 assets/pinyin.js
     node tools/build-pinyin.js --import <pinyin.txt>   从上游 pinyin-data 更新数据源（需要联网）
     node tools/build-pinyin.js --check      只报覆盖率，不写文件
*/
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SRC = path.join(ROOT, "tools", "data", "pinyin-src.txt");
const OUT = path.join(ROOT, "app", "src", "main", "assets", "pinyin.js");
const DECKS = ["demo", "ml-math", "ml-intro"];

/* 带声调的元音 → 无声调；ü 系列单独记成 v，方便用户敲 lv/nv */
const TONE = {
  "ā": "a", "á": "a", "ǎ": "a", "à": "a",
  "ē": "e", "é": "e", "ě": "e", "è": "e", "ê": "e",
  "ī": "i", "í": "i", "ǐ": "i", "ì": "i",
  "ō": "o", "ó": "o", "ǒ": "o", "ò": "o",
  "ū": "u", "ú": "u", "ǔ": "u", "ù": "u",
  "ǖ": "v", "ǘ": "v", "ǚ": "v", "ǜ": "v", "ü": "v",
  "ń": "n", "ň": "n", "ǹ": "n", "ḿ": "m", "m̀": "m",
  "ẑ": "z", "ĉ": "c", "ŝ": "s"
};

function plainSyllable(s) {
  let out = "";
  for (const ch of s) out += TONE[ch] || ch;
  return out.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zv]/g, "");
}

/* 知识包正文里出现的所有汉字 */
function corpusChars() {
  const set = new Set();
  for (const id of DECKS) {
    const p = path.join(ROOT, "decks", id + ".json");
    let txt = "";
    try { txt = fs.readFileSync(p, "utf8"); } catch (e) { continue; }
    for (const ch of txt) if (/[\u3400-\u9fff]/.test(ch)) set.add(ch);
  }
  return set;
}

function readSrc() {
  const map = new Map();
  let raw = "";
  try { raw = fs.readFileSync(SRC, "utf8"); } catch (e) { return map; }
  raw.split(/\r?\n/).forEach((line) => {
    if (!line || line[0] === "#") return;
    const [ch, py] = line.split("\t");
    if (!ch || !py) return;
    map.set(ch, py.split(",").filter(Boolean));
  });
  return map;
}

function writeSrc(map) {
  const chars = Array.from(map.keys()).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const head = "# 汉字→拼音（无声调，ü 记作 v），由 node tools/build-pinyin.js --import 生成\n" +
    "# 格式：字<TAB>拼音1,拼音2（多音字按读音顺序，首位是最常用读音）\n";
  const body = chars.map((c) => c + "\t" + map.get(c).join(",")).join("\n");
  fs.mkdirSync(path.dirname(SRC), { recursive: true });
  fs.writeFileSync(SRC, head + body + "\n", "utf8");
  return chars.length;
}

function doImport(file) {
  const raw = fs.readFileSync(file, "utf8");
  const full = new Map();
  for (const line of raw.split(/\r?\n/)) {
    const m = /^U\+([0-9A-Fa-f]+):\s*([^#]+)/.exec(line);
    if (!m) continue;
    const ch = String.fromCodePoint(parseInt(m[1], 16));
    const readings = m[2].split(",").map((s) => plainSyllable(s.trim())).filter(Boolean);
    if (readings.length) full.set(ch, Array.from(new Set(readings)));
  }
  const need = corpusChars();
  const out = new Map();
  const missing = [];
  need.forEach((ch) => {
    if (full.has(ch)) out.set(ch, full.get(ch));
    else missing.push(ch);
  });
  const n = writeSrc(out);
  console.log("上游读音 " + full.size + " 字 → 按知识包裁剪后 " + n + " 字");
  if (missing.length) console.log("上游缺读音 " + missing.length + " 字：" + missing.join(""));
}

function build(checkOnly) {
  const need = corpusChars();
  const src = readSrc();
  if (!src.size) {
    console.log("数据源为空，先跑：node tools/build-pinyin.js --import <pinyin.txt>");
    process.exit(1);
  }
  const miss = [];
  const map = {};
  need.forEach((ch) => {
    const py = src.get(ch);
    if (py) map[ch] = py.slice(0, 3).join("|");
    else miss.push(ch);
  });
  const cover = ((need.size - miss.length) / need.size * 100).toFixed(1);
  console.log("知识包汉字 " + need.size + " 字，有拼音 " + Object.keys(map).length +
    " 字（覆盖 " + cover + "%）");
  if (miss.length) console.log("缺拼音（只能按原文搜）：" + miss.slice(0, 60).join("") + (miss.length > 60 ? " …" : ""));
  if (checkOnly) return;
  const chars = Object.keys(map).sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
  const json = chars.map((c) => JSON.stringify(c) + ":" + JSON.stringify(map[c])).join(",");
  const out = "/* 自动生成，勿手改：node tools/build-pinyin.js */\n" +
    "window.PINYIN = {" + json + "};\n";
  fs.writeFileSync(OUT, out, "utf8");
  const kb = (Buffer.byteLength(out, "utf8") / 1024).toFixed(1);
  console.log("→ " + path.relative(ROOT, OUT) + "（" + kb + " KB）");
}

const argv = process.argv.slice(2);
const i = argv.indexOf("--import");
if (i >= 0) {
  const f = argv[i + 1];
  if (!f) { console.error("用法：node tools/build-pinyin.js --import <pinyin.txt>"); process.exit(1); }
  doImport(f);
  build(false);
} else {
  build(argv.indexOf("--check") >= 0);
}
