#!/usr/bin/env node
/* 题台 · 日常开发助手（模拟器优先）
 *
 * 日常构建、安装、启动、截图都走模拟器；真机只在最终验收时加 --phone。
 *
 *   node tools/dev.js deploy                  # 构建 + 装模拟器 + 打开 + 截图
 *   node tools/dev.js deploy --tab qa         # 打开后再跳到问答页
 *   node tools/dev.js deploy --open q.m1.grad # 打开某条问答
 *   node tools/dev.js deploy --deck ml-math   # 指定知识包
 *   node tools/dev.js shot                    # 只截图
 *   node tools/dev.js deploy --phone          # 装到真机（最终验收时才用）
 */
"use strict";
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const SDK = "C:\\Users\\Ela\\Documents\\Food Note\\.tools\\android-sdk";
const ADB = path.join(SDK, "platform-tools", "adb.exe");
const APK = path.join(ROOT, "app", "build", "outputs", "apk", "release", "app-release.apk");
const PKG = "com.studydeck.app";
const SHOT = path.join(ROOT, "shot");

/* ---- 参数 ---- */
const argv = process.argv.slice(2);
const action = (argv[0] || "deploy").replace(/^--?/, "");
function flag(name) {
  const i = argv.indexOf("--" + name);
  return i >= 0 ? true : false;
}
function opt(name, def) {
  const i = argv.indexOf("--" + name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : def;
}
const phone = flag("phone");
const serial = phone ? "a27457ef" : "emulator-5554";
const deck = opt("deck", "");
const tab = opt("tab", "");
const open = opt("open", "");
const check = opt("check", "");

const env = Object.assign({}, process.env, {
  JAVA_HOME: "C:\\Program Files\\Eclipse Adoptium\\jdk-17.0.19.10-hotspot",
  ANDROID_HOME: SDK,
});

function say(msg) { console.log("· " + msg); }

function run(cmd, args, opts) {
  const base = Object.assign({ cwd: ROOT, env, encoding: "utf8" }, opts || {});
  /* Windows 上 .bat 必须经 shell 才能执行 */
  if (/\.bat$/i.test(cmd)) base.shell = true;
  const r = spawnSync(cmd, args, base);
  if (r.status !== 0) {
    const out = (r.stdout || "") + (r.stderr || "");
    console.error(out.trim().split("\n").slice(-12).join("\n"));
    throw new Error(cmd + " 失败（exit " + r.status + "）");
  }
  return (r.stdout || "") + (r.stderr || "");
}

function adb(args) { return run(ADB, ["-s", serial].concat(args)); }

function build() {
  say("构建 release（" + serial + "）");
  const out = run(path.join(ROOT, "gradlew.bat"), ["--offline", "-p", ROOT, "assembleRelease", "--console=plain"]);
  out.split("\n").filter((l) => /BUILD|error:|FAILURE/.test(l)).forEach((l) => console.log("  " + l.trim()));
  if (!fs.existsSync(APK)) throw new Error("没有生成 APK：" + APK);
}

function install() {
  say("安装到 " + serial);
  const out = adb(["install", "-r", APK]);
  console.log("  " + out.trim().split("\n").pop());
}

function launch() {
  const extras = [];
  if (deck) extras.push("-e", "deck", deck);
  if (tab) extras.push("-e", "tab", tab);
  if (check) extras.push("-e", "check", check);
  if (open) extras.push("-e", "open", open);
  say("启动 " + PKG + (extras.length ? " " + extras.join(" ") : ""));
  adb(["shell", "am", "force-stop", PKG]);
  adb(["shell", "am", "start", "-n", PKG + "/.MainActivity"].concat(extras));
  spawnSync("ping", ["-n", "6", "127.0.0.1"], { stdio: "ignore" });
}

function shot(name) {
  fs.mkdirSync(SHOT, { recursive: true });
  const png = path.join(SHOT, (name || "dev") + ".png");
  adb(["shell", "screencap", "-p", "/sdcard/_dev.png"]);
  adb(["pull", "/sdcard/_dev.png", png]);
  adb(["shell", "rm", "-f", "/sdcard/_dev.png"]);
  say("截图 → " + png);
}

try {
  if (action === "build") build();
  else if (action === "install") install();
  else if (action === "run") launch();
  else if (action === "shot") shot(opt("name", "dev"));
  else if (action === "clean") {
    if (fs.existsSync(SHOT)) fs.readdirSync(SHOT).forEach((f) => fs.unlinkSync(path.join(SHOT, f)));
    say("已清理 shot/");
  } else if (action === "deploy") {
    build();
    install();
    launch();
    const tag = deck || tab || check || open;
    shot(tag ? tag.replace(/[^A-Za-z0-9_.-]/g, "_") : "dev");
  } else {
    console.error("用法：node tools/dev.js [deploy|build|install|run|shot|clean] [--deck X] [--tab list|qa|fav|drill|more] [--open q.m1.grad] [--check m1.1] [--phone]");
    process.exit(2);
  }
  say("日志：\"" + ADB + "\" -s " + serial + " logcat -d -s StudyDeck");
} catch (e) {
  console.error("✗ " + e.message);
  process.exit(1);
}
