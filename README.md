# 题台（StudyDeck）

一个自用的安卓刷题与自查 App：内容（学习包）与程序分离，进度按时间戳合并，电脑端和手机端可离线各自用、也可以局域网同步。

现在内置的学习包是「UE5 PCG 面试复习」：18 个模块、194 个自查点、178 条问答、560 条交叉引用。

---

## 目录结构

```
studydeck/
├─ app/src/main/
│  ├─ assets/            ← 前端（HTML/CSS/JS），WebView 直接加载
│  │  ├─ index.html
│  │  ├─ app.css         深色/浅色两套主题（只用 rgba，兼容旧 WebView）
│  │  ├─ app.js          引擎：清单/问答/收藏/刷题/设置
│  │  └─ deck.js         由 tools/mkdeck.js 生成，window.DECK = {...}
│  ├─ java/com/studydeck/app/
│  │  ├─ MainActivity.java   WebView 壳 + 返回键接管
│  │  └─ Bridge.java         saveState / loadState / setChrome / toast
│  └─ res/               图标与主题
├─ tools/
│  ├─ mkdeck.js          数据源 → dist/deck.json + assets/deck.js（含覆盖率自检）
│  └─ sync.js            局域网同步服务 + 电脑端浏览页面
├─ dist/deck.json        学习包真相，可 diff、可备份
└─ sync/                 同步服务的数据（deck.json / state.json / code.txt）
```

---

## 构建与安装

```powershell
# 1) 编译学习包（数据改了就要重跑）
node tools/mkdeck.js

# 2) 打包 APK（debug）
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
.\gradlew.bat --offline assembleDebug

# 3) 装到手机/模拟器
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

正式包：

```powershell
.\gradlew.bat --offline assembleRelease   # → app/build/outputs/apk/release/app-release.apk
```

版本号在 `app/build.gradle.kts` 里（`versionCode` / `versionName`），App 设置页底部显示的就是 `versionName`。

---

## 签名

release 包用的是自己的 4096 位 RSA 证书（有效期 100 年），**证书和口令不在仓库里**：

| 文件 | 位置 | 是否入库 |
| --- | --- | --- |
| `release.keystore` | `signing/release.keystore` | 否（`.gitignore`） |
| `keystore.properties` | `signing/keystore.properties` | 否（`.gitignore`） |

`signing/keystore.properties` 长这样（`storeFile` 相对 `app/` 解析）：

```properties
storeFile=../signing/release.keystore
storePassword=……
keyAlias=studydeck
keyPassword=……
```

没这个文件时，`assembleRelease` 会自动回落到 debug 签名，所以 clone 下来不用证书也能编译。

> ⚠️ 这个 keystore 就是 App 的身份：**丢了**，以后的更新装不到老设备上（只能卸载重装，进度会没）；**泄露**，别人能用你的包名签出“假更新”。
> 请把它和口令一起离线备份两处（U 盘 / 网盘私有目录 / 密码管理器附件），不要提交到 git、不要发群。
> 同一份 keystore 才算“同一个 App”：换证书必须先 `adb uninstall com.studydeck.app` 再装，进度会丢 —— 装前先在「设置 → 局域网同步」里推送一次，装完再拉取回来。

---

## 电脑端

```powershell
node tools\sync.js          # 默认 8787
```

- 浏览器打开 `http://127.0.0.1:8787` → 显示配对码、本机 IP、当前进度
- 浏览器打开 `http://127.0.0.1:8787/a/` → 直接在电脑上用同一套界面（进度存浏览器本地）

手机端：设置 → 局域网同步 → 填 `电脑IP:8787` + 4 位配对码

- **拉取**：电脑进度合并到手机
- **推送**：手机进度写到电脑
- 合并规则：同一个自查点/收藏/刷题记录取时间戳更新的那份，不会互相覆盖；收藏的取消用 `on:false` 墓碑，取消不会“复活”

> 模拟器里连宿主机用 `10.0.2.2:8787`（已在测试中验证）。

---

## 换一个学习目标

引擎不认识「PCG」这三个字，它只认学习包。新增一个包：

1. 新建目录，例如 `decks/my-subject/`，放入
   - `modules.js`：`module.exports = [{ id, title, short, priority, stage, signal, keypoints[], traps[], checks[{ t, lvl }] }]`
   - `qa-1.js`、`qa-2.js`…：`module.exports = [{ id, m, lvl, layer, q, tags[], covers[], next[], peer[], ans[{h,p}] }]`
   - 可选 `meta.json`：`{ "id": "my-subject", "title": "…", "subtitle": "…", "accent": "#2f81f7" }`
2. `node tools/mkdeck.js decks/my-subject`
3. 重新打包安装

`mkdeck.js` 会检查：每个自查点是否至少被一条问答覆盖、`next`/`peer` 引用是否存在、QA id 是否重复——不通过就报错退出，避免把残缺内容打进 App。

进度按学习包 id 区分：换包后旧进度不会串味（同一个包里 id 复用则视为同一题）。

---

## 已知取舍

- 单学习包：App 一次只装一个学习包，换包需要重打包。多包切换要做「包管理 + 下载」，这一版刻意不做。
- 更新：侧载 APK 覆盖安装即更新，版本号在「设置」页底部。
- 无账号、无云端：同步只在同一局域网内、点对点，不经过任何服务器。
- WebView 用的是系统内核（模拟器上 Chromium 110），CSS 里避开了 `color-mix()` 这类新语法。
