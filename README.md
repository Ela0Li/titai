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
│  │  ├─ app.js          引擎：清单/问答/收藏/刷题/设置/多学习包
│  │  ├─ deck.js         由 tools/mkdeck.js 生成，window.DECK = {...}（兜底用）
│  │  └─ decks/*.json    内置学习包，一份一个文件（引擎按 id 读取）
│  ├─ java/com/studydeck/app/
│  │  ├─ MainActivity.java   WebView 壳 + 返回键接管 + 深链
│  │  └─ Bridge.java         多包读写/切换 + 进度文件 + setChrome / http / versionName
│  └─ res/               图标与主题
├─ decks/                想「从电脑导入」的学习包放这里（sync.js 负责下发）
├─ docs/deck-protocol.md 学习包协议 v1（内容层 / 进度层 / 同步层 + 校验规则）
├─ schema/               JSON Schema：deck.schema.json / state.schema.json
├─ tools/
│  ├─ mkdeck.js          数据源 → dist/deck.json + assets/decks/<id>.json（含覆盖率自检）
│  ├─ validate-deck.js   协议校验器（引用闭合、答案结构、链路质量；覆盖仅警告）
│  ├─ conformance.js     一致性测试：真实引擎 + 无头浏览器渲染一份 deck
│  └─ sync.js            局域网同步服务 + 电脑端浏览页面 + 学习包下发
├─ dist/deck.json        学习包真相，可 diff、可备份
└─ sync/                 同步服务的数据（deck.json / state.json / code.txt）
```

App 内的进度按包分文件：`files/states/<deck-id>.json`；导入包放在 `files/decks/<deck-id>.json`。

学习包、进度、同步三层的完整契约见 **[docs/deck-protocol.md](docs/deck-protocol.md)**。

---

## 构建与安装

```powershell
# 1) 编译学习包（数据改了就要重跑）
node tools/mkdeck.js

# 1.5) 按协议 v1 校验（建议随 mkdeck 一起跑）
node tools/validate-deck.js dist/deck.json

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

- 浏览器打开 `http://127.0.0.1:8787` → 控制台：配对码、本机 IP、每个学习包的进度表
- 浏览器打开 `http://127.0.0.1:8787/a/` → 直接在电脑上用同一套界面（进度存浏览器本地）
- `http://127.0.0.1:8787/a/?deck=<学习包 id>` → 指定打开某个包；控制台里点包名就是这个地址

手机端：设置 → 局域网同步 → 填 `电脑IP:8787` + 4 位配对码

- **拉取**：电脑上**当前这个包**的进度合并到手机（包对不上会拒绝合并并提示）
- **推送**：把手机当前包的进度写到电脑
- 合并规则：同一个自查点/收藏/刷题记录取时间戳更新的那份，不会互相覆盖；收藏的取消用 `on:false` 墓碑，取消不会“复活”

> 模拟器里连宿主机用 `10.0.2.2:8787`（已在测试中验证）。

---

## 换一个学习目标

引擎不认识「PCG」这三个字，它只认学习包。现在支持**多个学习包共存**，两条路：

**A. 内置一个新包（内容随 APK 走）**

1. 新建目录，例如 `decks-src/my-subject/`，放入
   - `modules.js`：`module.exports = [{ id, title, short, priority, stage, signal, keypoints[], traps[], checks[{ t, lvl }] }]`
   - `qa-1.js`、`qa-2.js`…：`module.exports = [{ id, m, lvl, layer, q, tags[], covers[], next[], peer[], ans[{h,p}] }]`
   - 可选 `meta.json`：`{ "id": "my-subject", "title": "…", "subtitle": "…", "accent": "#2f81f7" }`
2. `node tools/mkdeck.js decks-src/my-subject`
3. 重新打包安装

**B. 外部导入（不重装 APK，推荐）**

1. 把写好的 `deck.json` 丢进仓库根的 `decks/` 目录（任意文件名）
2. 电脑上跑 `node tools/sync.js`
3. 手机上「设置 → 学习包 → 从电脑获取学习包」→ 点「下载」→ 自动导入并切过去

两种方式产出的包可以并存：同一 `id` 时导入包覆盖内置包，方便改内容而不动 APK。

`mkdeck.js` 会检查：每个自查点是否至少被一条问答覆盖、`next`/`peer` 引用是否存在、QA id 是否重复——不通过就报错退出，避免把残缺内容打进 App。
（覆盖率是**本项目的验收线**，不是协议要求：协议里它只是 SHOULD，校验器只报 `W_UNCOVERED` 警告。）

`validate-deck.js` 再把协议 v1 的不变量过一遍（id 派生规则、引用闭合、答案四段结构与顺序、`next` 层级是否递进、覆盖深度直方图），输出 `problems / warnings / notes` 三级结果，可直接接 CI。

`conformance.js` 做最后一道：把 deck 塞进真实引擎资源、用无头浏览器渲染，确认没有 JS 异常、模块/自查点/问答数量与声明一致、`terms` 文案生效、详情面板能打开。

界面名词解耦：`deck.terms = { group, check, qa }` 可覆盖显示文案，缺省是「模块 / 知识点 / 问答」；本包在 `mkdeck.js` 里写成「自查点」，换包时想叫「知识点／考点」都行，不影响 id、进度与同步。

进度按学习包 id 区分：每个包一份 `files/states/<id>.json`，换包后旧进度不会串味（同一个包里 id 复用则视为同一题）。升级到多包版本后，老的 `state.json` 会一次性迁移到内置包名下。

---

## 学习包管理

「设置 → 学习包」列出所有可用包，当前包标「使用中」，其余有「切换」；导入包多一个「删」（连同它的进度一起删）。下面的「从电脑获取学习包」向 `tools/sync.js` 要列表并逐个下载。

- 内置包：随 APK 走，删不掉，卸载重装还在。
- 导入包：存在应用私有目录 `decks/<id>.json`，可随时删。
- 同名 `id`：导入包覆盖内置包（改内容不用重装 APK）。

调试用深链（`adb shell am start`）：

```bash
-e deck demo                 # 切到某个学习包
-e download demo             # 从电脑下载并切过去（需先 -e host / -e code）
-e decks 1                   # 打开「电脑上的学习包」列表
```

---

## 已知取舍

- 同步进度按学习包分桶：电脑端 `sync/states/<id>.json`，手机端 `files/states/<id>.json`；`push`/`pull` 的请求体带 `deck`，两边只碰当前这一个包。多包同时用同步也不会互相覆盖；但**浏览器里的进度是本地的**，与电脑端分桶文件不是同一份，要靠拉取/推送对齐。
- 电脑端页面：`/` 是控制台（配对码、地址、每个包的进度表、点包名进对应界面），`/a/?deck=<id>` 直接打开某个包。
- 更新：侧载 APK 覆盖安装即更新，版本号在「设置」页底部。
- 无账号、无云端：同步只在同一局域网内、点对点，不经过任何服务器。
- WebView 用的是系统内核（模拟器上 Chromium 110），CSS 里避开了 `color-mix()` 这类新语法。
