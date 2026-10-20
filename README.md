# 题台（StudyDeck）

一个自用的安卓刷题与自查 App：内容（学习包）与程序分离，进度按时间戳合并，电脑端和手机端可离线各自用、也可以局域网同步。

现在内置五个知识包（计算机基础 / 计算机图形学 / UE5 PCG / 机器学习数学基础 / 机器学习入门）和两个学习计划，默认打开机器学习计划。

---

## 目录结构

```
studydeck/
├─ app/src/main/
│  ├─ assets/            ← 前端（HTML/CSS/JS），WebView 直接加载
│  │  ├─ index.html
│  │  ├─ app.css         深色/浅色两套主题（只用 rgba，兼容旧 WebView）
│  │  ├─ app.js          引擎：计划/多知识包/清单/问答/收藏/刷题/设置/掌握度同步
│  │  ├─ deck.js         由 tools/mkdeck.js 生成，window.DECK = {...}（兜底用）
│  │  ├─ decks/*.json    内置知识包，一份一个文件（引擎按 id 读取）
│  │  └─ plans/*.json    内置学习计划（成员顺序 = 学习顺序）
│  ├─ java/com/studydeck/app/
│  │  ├─ MainActivity.java   WebView 壳 + 返回键接管 + 深链
│  │  └─ Bridge.java         多包读写/切换 + 进度文件 + setChrome / http / versionName
│  └─ res/               图标与主题
├─ decks/                想「从电脑导入」的知识包放这里（sync.js 负责下发）
├─ plans/                学习计划（ml.plan.json、cs-cg-ue5.plan.json）
├─ docs/deck-protocol.md 协议 v1.5（内容层 / 进度层 / 同步层 / 公式 / 跨包引用 / 学习计划 / 掌握度同步）
├─ schema/               JSON Schema：deck / state / plan
├─ tools/
│  ├─ mkdeck.js          数据源 → dist/deck.json + assets/decks/<id>.json（含覆盖率自检）
│  ├─ validate-deck.js   协议校验器（引用闭合、答案结构、链路质量；覆盖仅警告）
│  ├─ validate-plan.js   计划校验器（成员存在、顺序、primary）
│  ├─ check-links.js     多包联合检查（跨包引用解析、环、缺包）
│  ├─ split-pcg.js       把一个大包按模块区间拆成多个包（重编号 + 跨包引用改写）
│  ├─ conformance.js     一致性测试：真实引擎 + 无头浏览器渲染一份 deck
│  └─ sync.js            局域网同步服务 + 电脑端浏览页面 + 学习包下发
├─ dist/deck.json        学习包真相，可 diff、可备份
└─ sync/                 同步服务的数据（deck.json / state.json / code.txt）
```

App 内的进度按包分文件：`files/states/<deck-id>.json`；导入包放在 `files/decks/<deck-id>.json`；主题与同步地址这类跟包无关的偏好放在 `files/prefs.json`，换包不丢。

知识包、进度、同步三层的完整契约见 **[docs/deck-protocol.md](docs/deck-protocol.md)**。

### 学习计划（v1.3，v1.4 增强）

`plans/*.plan.json` 把多个知识包串成一条学习路径：顶部一条 chip 就能在计划内切包（不重载页面），列表按知识包分区、每个分区可独立展开/收起、模块编号各自从 1 起，问答页可以按包筛选。计划本身可以新建、改名、增删成员、切换、删除、导入导出（设置 → 学习计划）。

现在仓库里有五个包、两个计划：

| 知识包 | 模块 | 知识点 | 问答 | 属于 |
|---|---|---|---|---|
| `cs-base` 计算机基础·面试复习 | 6 | 62 | 47 | 计划二 |
| `cv-graphics` 计算机图形学·图形与渲染 | 3 | 42 | 39 | 计划二 |
| `ue5-pcg` UE5 PCG·程序化生成 | 9 | 90 | 92 | 计划二 |
| `ml-math` 机器学习数学基础 | 5 | 32 | 24 | 计划一 |
| `ml-intro` 机器学习入门·从数据到上线 | 9 | 54 | 60 | 计划一 |

- 计划一 `plans/ml.plan.json`（`order: 1`，**内置默认**）：`ml-math` → `ml-intro`；
- 计划二 `plans/cs-cg-ue5.plan.json`（`order: 2`）：`cs-base` → `cv-graphics` → `ue5-pcg`。

`order` 只对内置计划有意义：本机没选过计划时，取 `order` 最小的那个。

同一条问答覆盖的知识点**共享掌握度**：在一个包里点亮，跨包（`deck#id`）的那一条也会同步写一份（协议 §10）。

所有内置包的界面名词统一为「模块 / 知识点 / 问答」，模块标题统一写成「模块X · 主题」。

跨包引用在界面上分三态显示（协议 §8.5.1）：

| 状态 | 样子 | 点下去会怎样 |
|---|---|---|
| 目标包在**当前计划内** | 虚线 + 包名（强调色） | 软切包，不重载，顶部还是计划视图 |
| 目标包**已安装但在计划外** | 灰色虚线 + 包名 + 「计划外」小标 | 进入该包并临时离开计划：标题变成包名，顶部出现「← 回到<计划名>」 |
| 目标包**没装** | 点线 + 「未安装的学习包」 | 不可点 |

---

## 开发与测试环境（v0.8.1 起）

**日常构建、安装、跑起来、截图都在模拟器上做，真机只在最终验收时用一次。**

| 环境 | 设备 | 系统 / WebView | 用途 |
| --- | --- | --- | --- |
| 模拟器 | `emulator-5554` | Android 12（API 32）/ WebView 110 | 日常开发、回归、截图 |
| 真机 | `a27457ef`（小米 14） | Android 16（API 36）/ WebView 153 | 只在明确要求时做最终验收 |

一条命令搞定（`tools/dev.js`）：

```powershell
node tools/dev.js deploy                  # 构建 + 装模拟器 + 打开 + 截图到 shot/
node tools/dev.js deploy --tab qa          # 顺便跳到问答页
node tools/dev.js deploy --deck ml-math    # 指定知识包
node tools/dev.js deploy --open q.m1.grad  # 打开某条问答
node tools/dev.js deploy --check m1.1      # 打开某个知识点
node tools/dev.js shot --name home         # 只截图
node tools/dev.js deploy --phone           # 装到真机（最终验收时才用）
```

真机验收请手动执行（等价于上面 `--phone`）：

```powershell
.\gradlew.bat --offline assembleRelease
adb -s a27457ef install -r app\build\outputs\apk\release\app-release.apk
adb -s a27457ef shell am start -n com.studydeck.app/.MainActivity
```

**模拟器已知差异**（不是 App 的 bug，别在模拟器上追）：

1. **公式会显示成方框**：模拟器镜像没有带 OpenType MATH 表的数学字体，Chromium 110 的 MathML 就掉豆腐块；真机（WebView 153）正常。数学排版只能在真机上验。
2. **`color-mix()` 不支持**（Chromium 111 才有）：跨包 chip 的虚线强调色、包名标签底色会退化成普通边框色。样式里已写好回退值（先声明纯色再声明 `color-mix`），功能不受影响。
3. 字号/密度与真机不同（1080×1920 vs 1200×2670），布局只能看个大概，像素级问题仍需真机。

模拟器操作提示：它是 root 的、`adb root` 可用，但 `/system` 分区只读，别指望往里塞字体（要 `-writable-system` 重启模拟器才行）。

### 答案结构（v1.5 起自由）

`ans` 是有序块数组，每块必须有 `p`（段落），可选 `h`（自拟小标题）、`lvl`（1..3 级，不能跳级）、`list`（要点列表）。协议**不再要求**「结论 → 机制 → 取舍 → 实战」四段式，也不要求以结论开头：面试型学习包这么写仍然推荐，知识型/操作型可以自己分节，甚至整篇不写标题。

天花板是 3 级：`lvl` 超过 3 或跳级（1 → 3）会被校验器拒绝（`E_ANS_LVL`）。老包无需改动，`{h:"结论", p:"…"}` 仍然是合法的一级标题块。

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
   - `qa-1.js`、`qa-2.js`…：`module.exports = [{ id, m, lvl, layer, q, tags[], covers[], next[], peer[], ans[{p, h?, lvl?, list?}] }]`
   - 可选 `meta.json`：`{ "id": "my-subject", "title": "…", "subtitle": "…", "accent": "#2f81f7" }`
2. `node tools/mkdeck.js decks-src/my-subject`
3. 重新打包安装

**B. 外部导入（不重装 APK，推荐）**

三条路，产出的都是同一个「导入包」：

1. **微信/QQ/网盘里直接打开**：把 `deck.json` 发到手机，用「其他应用打开」选「题台」；或在文件管理器里点开、选「题台」。
2. **设置页选文件**：「设置 → 学习包 → 从文件导入」，在系统文件选择器里挑 `.json`。
3. **从电脑推**：把文件丢进仓库根的 `decks/`，电脑跑 `node tools/sync.js`，手机「从电脑获取学习包」→「下载」。

导入会先体检再入库：JSON 合法、`schema=1`、`id` 合法、模块/自查点/问答的结构与引用闭合、答案第一段是「结论」。不合格的文件不会写入，弹层直接列出问题清单（如 `E_CHECK_PREFIX：g1.2 应为 g1.1`），改完再发一次即可。

两种方式产出的包可以并存：同一 `id` 时导入包覆盖内置包，方便改内容而不动 APK。

`mkdeck.js` 会检查：每个自查点是否至少被一条问答覆盖、`next`/`peer` 引用是否存在、QA id 是否重复——不通过就报错退出，避免把残缺内容打进 App。
（覆盖率是**本项目的验收线**，不是协议要求：协议里它只是 SHOULD，校验器只报 `W_UNCOVERED` 警告。）

`validate-deck.js` 再把协议 v1 的不变量过一遍（id 派生规则、引用闭合、答案块结构与 1..3 级标题、`next` 层级是否递进、覆盖深度直方图），输出 `problems / warnings / notes` 三级结果，可直接接 CI。

`conformance.js` 做最后一道：把 deck 塞进真实引擎资源、用无头浏览器渲染，确认没有 JS 异常、模块/自查点/问答数量与声明一致、`terms` 文案生效、详情面板能打开。

界面名词解耦：`deck.terms = { group, check, qa }` 可覆盖显示文案，缺省是「模块 / 知识点 / 问答」；本包在 `mkdeck.js` 里写成「自查点」，换包时想叫「知识点／考点」都行，不影响 id、进度与同步。

进度按学习包 id 区分：每个包一份 `files/states/<id>.json`，换包后旧进度不会串味（同一个包里 id 复用则视为同一题）。升级到多包版本后，老的 `state.json` 会一次性迁移到内置包名下。

---

## 学习包管理

「设置 → 学习包」列出所有可用包，当前包标「使用中」，其余有「切换」；导入包多一个「删」（连同它的进度一起删）。下面的「从文件导入」走系统文件选择器，「从电脑获取学习包」向 `tools/sync.js` 要列表并逐个下载。

导入的入口一共三个：文件选择器、其他应用的「打开方式/分享」（`.json` 文件可以选「题台」打开）、电脑下发。三条路都会先跑一遍结构体检，坏包不入库。

- 内置包：随 APK 走，删不掉，卸载重装还在。
- 导入包：存在应用私有目录 `decks/<id>.json`，可随时删。
- 同名 `id`：导入包覆盖内置包（改内容不用重装 APK）。

调试用深链（`adb shell am start`）：

```bash
-e deck demo                 # 切到某个学习包
-e download demo             # 从电脑下载并切过去（需先 -e host / -e code）
-e decks 1                   # 打开「电脑上的学习包」列表
-e importFile /path/x.json   # 直接导入一个文件（应用私有路径，调试用）
```

---

## 答安结构与内容工具（v0.8.3 起）

协议只规定「答案是一个块数组」，每块有 `h`（自拟小标题，≤24 字）、`lvl`（1..3，可省）、`p`（正文）、`list`（要点，可选）。写成什么结构由内容体裁决定，本仓库的约定是：

| 体裁 | 结构 | 例子 |
|---|---|---|
| 操作型（怎么处理 / 怎么选 / 怎么排查） | 一句话 → 分几步（list）→ 边界与坑 → 落地 | `q.m2.clean`、`q.m6.debug` |
| 对比型（A 与 B 的区别） | 一句话 → 关键差异（list）→ 怎么选 → 边界 | `q.m4.prune`、`q.m2.forward` |
| 概念型（是什么 / 为什么） | 结论 → 机制 → 取舍 → 实战 | `q.m1.biasvar` |

两个工具：

- `node tools/audit-answers.js [--deck id] [--list] [--dump]` —— 按可复现的规则扫「结构不合适」的答案：E1 空洞块（正文 < 40 字，带 `list` 的块按 `p`+条目合计算）、E2 单块过长、E3 操作型问句却只有取舍/实战、E4「结论」块里写步骤、E5 该拆 list 的长段落、E6 多块无标题、E7 有嵌套语义却全用 1 级标题。
- `node tools/restructure-answers.js [--check]` —— 应用 `tools/answers-patches.json` 里的补丁表。补丁表幂等：`decks/*.json` 被生成脚本（`build-ml-math.js`、`split-deck.js` …）重建后，重跑一次即可把重排过的答案恢复。改答案时先用 `snapshot-patches.js` 把新内容记进补丁表，避免下次重建丢失。

---

## 已知取舍

- 同步进度按学习包分桶：电脑端 `sync/states/<id>.json`，手机端 `files/states/<id>.json`；`push`/`pull` 的请求体带 `deck`，两边只碰当前这一个包。多包同时用同步也不会互相覆盖；但**浏览器里的进度是本地的**，与电脑端分桶文件不是同一份，要靠拉取/推送对齐。
- 电脑端页面：`/` 是控制台（配对码、地址、每个包的进度表、点包名进对应界面），`/a/?deck=<id>` 直接打开某个包。
- 更新：侧载 APK 覆盖安装即更新，版本号在「设置」页底部。
- 无账号、无云端：同步只在同一局域网内、点对点，不经过任何服务器。
- WebView 用的是系统内核（模拟器上 Chromium 110），CSS 里避开了 `color-mix()` 这类新语法。
