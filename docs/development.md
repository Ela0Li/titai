# 题台 · 开发者文档

面向改代码、改协议、发版的人。**只是想装来用**，看仓库根目录的 [README](../README.md) 就够了。

内容与程序分离：知识包是 JSON，程序是一个 WebView 壳；进度按时间戳合并，电脑端与手机端可以各自离线用，也可以局域网同步。

现在内置两个知识包（机器学习数学基础 / 机器学习入门）和一个学习计划，另有一个最小样例包供校验器自测。

当前版本 **0.9.4**。更新日志见 [CHANGELOG](../CHANGELOG.md)，许可证 [MIT](../LICENSE)，安装包在 [Releases](https://github.com/Ela0Li/titai/releases)。

---

## 目录结构

```
studydeck/
├─ app/src/main/
│  ├─ assets/            ← 前端（HTML/CSS/JS），WebView 直接加载
│  │  ├─ index.html
│  │  ├─ app.css         深色/浅色两套主题（带 color-mix 回退）
│  │  ├─ app.js          引擎：计划/多知识包/知识点/问答/收藏/刷题/设置/掌握度同步
│  │  ├─ math.js         $…$ / $$…$$ → MathML（不依赖外部库）
│  │  ├─ deck.js         空注入位（浏览器直开兜底 / conformance 注入点）
│  │  ├─ decks/*.json    内置知识包，一份一个文件（引擎按 id 读取）
│  │  └─ plans/*.json    内置学习计划（成员顺序 = 学习顺序）
│  ├─ java/com/studydeck/app/
│  │  ├─ MainActivity.java   WebView 壳 + 返回键接管 + 深链
│  │  └─ Bridge.java         多包读写/切换 + 进度文件 + setChrome / http / versionName
│  └─ res/               图标与主题
├─ decks/                **知识包真相**（一份一个 JSON；改内容就改这里）
├─ decks-src/ml-intro/   ml-intro 的**已停用**生成源（留作历史；别跑 build.js）
├─ plans/                学习计划（ml.plan.json）
├─ docs/                 协议 v1.9，拆成三册（章节号沿用总编号）
│  ├─ protocol-core.md   总纲：保证边界 §0 / 进度层 §2 / 同步层 §3 / 校验器 §4 / 版本 §5 / 掌握度同步 §10 / 附录 A 字段速查
│  ├─ deck-protocol.md   知识包：示例 §0 / 内容层 §1 / 制作 §6 / 数学公式 §7 / 跨包引用 §8
│  ├─ plan-protocol.md   学习计划 §9
│  └─ deck-protocol.src.md  合并前的原文（tools/split-protocol.js 的输入，改协议改这份再拆）
├─ schema/               JSON Schema：deck / state / plan
├─ skills/               给 agent 用的技能：写知识包 / 计划（自带校验器与模板）
│  └─ titai-deck-author/   SKILL.md + references/ + assets/ + scripts/
├─ test/decks/           最小样例包（校验器与 conformance 的自测）
├─ tools/
│  ├─ validate-deck.js   协议校验器（引用闭合、答案结构、链路质量；覆盖仅警告）
│  ├─ validate-plan.js   计划校验器（成员存在、顺序、primary）
│  ├─ check-links.js     多包联合检查（跨包引用解析、环、缺包）
│  ├─ audit-answers.js   答案结构体检（按体裁判断结构是否合适）
│  ├─ conformance.js     一致性测试：真实引擎 + 无头浏览器渲染一份 deck
│  ├─ apply-hints.js     把 tools/hints/*.json 的「及格线」灌进知识包
│  ├─ build-ml-math.js   **已停用**的生成脚本（留作历史；别跑，会覆盖 ml-math.json）
│  ├─ split-protocol.js  从 src 拆出协议三册
│  ├─ test-math.js       数学解析单测（顺便产出预览页）
│  ├─ dev.js             构建 + 安装 + 打开 + 截图（开发用）
│  ├─ sync.js            局域网同步服务 + 电脑端浏览页面 + 知识包下发
│  ├─ hints/             知识点的「及格线」文案（tools/hints/*.json）
│  ├─ build-pinyin.js    生成搜索用的拼音表（app/src/main/assets/pinyin.js）
│  ├─ test-search.js     无头跑一组搜索查询，核对命中与高亮
│  └─ test-progress.js   掌握度回归：圆点只展示、卡片单亮、关卡片后百分比刷新（含问答 `qm`）
├─ .github/workflows/    CI：语法检查 + 协议/计划/引用/答案体检
└─ sync/                 同步服务的运行时数据（配对码与进度，不入库）
```

App 内的进度按包分文件：`files/states/<deck-id>.json`；导入包放在 `files/decks/<deck-id>.json`；主题与同步地址这类跟包无关的偏好放在 `files/prefs.json`，换包不丢。

知识包契约见 **[docs/deck-protocol.md](docs/deck-protocol.md)**；进度 / 同步 / 校验 / 版本在 **[docs/protocol-core.md](docs/protocol-core.md)**；计划文件在 **[docs/plan-protocol.md](docs/plan-protocol.md)**。三册共用同一个版本号，章节号不重排，所以「§9」永远是学习计划。

### 学习计划（v1.3，v1.4 增强）

`plans/*.plan.json` 把多个知识包串成一条学习路径：顶部一条 chip 就能在计划内切包（不重载页面），列表按知识包分区、每个分区可独立展开/收起、模块编号各自从 1 起，问答页可以按包筛选。计划本身可以新建、改名、增删成员、切换、删除、导入导出（设置 → 学习计划）。

现在仓库里有三个包、一个计划：

| 知识包 | 模块 | 知识点 | 问答 | 说明 |
|---|---|---|---|---|
| `ml-math` 机器学习数学基础 | 5 | 32 | 24 | 计划成员 |
| `ml-intro` 机器学习入门·从数据到上线 | 9 | 54 | 60 | 计划成员 |
| `demo` 示例包 | 2 | 5 | 3 | 最小样例，供校验器/一致性测试自测 |

- `plans/ml.plan.json`（`order: 1`，**内置默认**）：`ml-math` → `ml-intro`。

`order` 只对内置计划有意义：本机没选过计划时，取 `order` 最小的那个。

同一条问答覆盖的知识点**共享掌握度**：在一个包里点亮，跨包（`deck#id`）的那一条也会同步写一份（协议 §10）。

所有内置包的界面名词统一为「模块 / 知识点 / 问答」，模块标题统一写成「模块X · 主题」。

跨包引用在界面上分三态显示（协议 §8.5.1）：

| 状态 | 样子 | 点下去会怎样 |
|---|---|---|
| 目标包在**当前计划内** | 虚线 + 包名（强调色） | 软切包，不重载，顶部还是计划视图 |
| 目标包**已安装但在计划外** | 灰色虚线 + 包名 + 「计划外」小标 | 进入该包并临时离开计划：标题变成包名，顶部出现「← 回到<计划名>」 |
| 目标包**没装** | 点线 + 「未安装的知识包」 | 不可点 |

点计划外的引用时不再直接跳走，而是先弹一个二选一（v0.8.6）：**加入计划并跳转**（把该包追加到当前计划末尾，之后就是计划内跳转）或**先看看（临时离开计划）**。设置页「跨包关联」下面有一张三态图例，样子和这里一致。

---

## 开发与测试环境（v0.8.1 起）

**构建、安装、跑起来、截图都用 `tools/dev.js`，一条命令走完；真机只在需要看真实排版时用。**

| 环境 | 设备 | 系统 / WebView | 用途 |
| --- | --- | --- | --- |
| 真机 | `a27457ef`（小米 14） | Android 16（API 36）/ WebView 153 | 日常开发、回归、截图（当前唯一可用设备） |

> 模拟器 `emulator-5554`（Android 12 / WebView 110）曾经是日常测试床，本机已将其与 SDK 里的 emulator 组件一并删除；下面「模拟器已知差异」保留作参考，如果将来重装 SDK 模拟器还能对上。

一条命令搞定（`tools/dev.js`）：

```powershell
node tools/dev.js deploy                  # 构建 + 装真机 + 打开 + 截图到 shot/
node tools/dev.js deploy --tab qa          # 顺便跳到问答页
node tools/dev.js deploy --deck ml-math    # 指定知识包
node tools/dev.js deploy --open q.m1.grad  # 打开某条问答
node tools/dev.js deploy --check m1.1      # 打开某个知识点
node tools/dev.js shot --name home         # 只截图
```

等价的手工步骤（`tools/dev.js` 内部就是这几步）：

```powershell
.\gradlew.bat --offline assembleRelease
adb -s a27457ef install -r app\build\outputs\apk\release\app-release.apk
adb -s a27457ef shell am start -n com.studydeck.app/.MainActivity
```

**模拟器已知差异**（不是 App 的 bug，别在模拟器上追；本机模拟器已移除，留作参考）：

1. **公式会显示成方框**：模拟器镜像没有带 OpenType MATH 表的数学字体，Chromium 110 的 MathML 就掉豆腐块；真机（WebView 153）正常。数学排版只能在真机上验。
2. **`color-mix()` 不支持**（Chromium 111 才有）：跨包 chip 的虚线强调色、包名标签底色会退化成普通边框色。样式里已写好回退值（先声明纯色再声明 `color-mix`），功能不受影响。
3. 字号/密度与真机不同（1080×1920 vs 1200×2670），布局只能看个大概，像素级问题仍需真机。

模拟器操作提示：它是 root 的、`adb root` 可用，但 `/system` 分区只读，别指望往里塞字体（要 `-writable-system` 重启模拟器才行）。

### 答案结构（v1.5 起自由）

`ans` 是有序块数组，每块必须有 `p`（段落），可选 `h`（自拟小标题）、`lvl`（1..3 级，不能跳级）、`list`（要点列表）。协议**不再要求**「结论 → 机制 → 取舍 → 实战」四段式，也不要求以结论开头：面试型知识包这么写仍然推荐，知识型/操作型可以自己分节，甚至整篇不写标题。

天花板是 3 级：`lvl` 超过 3 或跳级（1 → 3）会被校验器拒绝（`E_ANS_LVL`）。老包无需改动，`{h:"结论", p:"…"}` 仍然是合法的一级标题块。

### 知识点的「及格线」（v1.7 起）

知识点（check）**保持一句话**，不加分段——它是掌握度的最小单位，列表要能扫读。真正缺的是「说到什么程度算过」，所以给 check 加了一个可选字段 `hint`（6–60 字、不换行）：

```json
{ "id": "m1.5", "text": "模板实例化、Lambda 捕获、auto 与类型推导的常见误用",
  "lvl": "P1", "hint": "各举一个误用例子即可，不必背特性清单" }
```

详情页会在标题下面显示成一行「及格线 xxx」；没有 `hint` 就整行不出现，老包零改动。

`hint` 写的是**判据**（“说清三点算过”“举一个反例即可”），不是答案要点——答案在 `covers` 指过去的问答里。**写三条以上要点就说明这条该拆成两条知识点**，60 字上限就是为这个留的。

内置包的知识点提示存在 `tools/hints/<deck>.json`，用 `node tools/apply-hints.js` 灌进 `decks/*.json` 与 assets；**重建过知识包之后要重跑一次**，`--check` 只体检不写。

---

## 构建与安装

知识包内容是 JSON，改完直接校验，不需要编译；**所有包（含 ml-intro / ml-math）都是直接编辑 `decks/<id>.json`**。

```powershell
# 1) 校验（改过任何 decks/*.json 都跑一遍）
node tools/validate-deck.js decks/ml-intro.json
node tools/check-links.js decks/*.json
node tools/audit-answers.js

# 2) 打包 APK（debug）
$env:JAVA_HOME="C:\Program Files\Eclipse Adoptium\jdk-17.0.19.10-hotspot"
.\gradlew.bat --offline assembleDebug

# 3) 装到手机/模拟器
adb install -r app\build\outputs\apk\debug\app-debug.apk
```

改完 `decks/<id>.json` 记得同步一份到 `app/src/main/assets/decks/`（内置包读的是那份）。

> ⚠ `decks-src/ml-intro/build.js` 与 `tools/build-ml-math.js` 是**已停用的生成脚本**：它们停在 0.7.0 的内容，跑一次会覆盖现在的 JSON 并丢掉 `hint` 等后加字段。只在想读当年的生成逻辑时才打开。

需要批量补字段时用这两个（幂等，可重复跑）：

```powershell
node tools/apply-hints.js            # 按 tools/hints/*.json 补回「及格线」
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

- 浏览器打开 `http://127.0.0.1:8787` → 控制台：配对码、本机 IP、每个知识包的进度表
- 浏览器打开 `http://127.0.0.1:8787/a/` → 直接在电脑上用同一套界面（进度存浏览器本地）
- `http://127.0.0.1:8787/a/?deck=<知识包 id>` → 指定打开某个包；控制台里点包名就是这个地址

手机端：设置 → 局域网同步 → 填 `电脑IP:8787` + 4 位配对码

- **拉取**：电脑上**当前这个包**的进度合并到手机（包对不上会拒绝合并并提示）
- **推送**：把手机当前包的进度写到电脑
- 合并规则：同一个知识点/收藏/刷题记录取时间戳更新的那份，不会互相覆盖；收藏的取消用 `on:false` 墓碑，取消不会“复活”

> 模拟器里连宿主机用 `10.0.2.2:8787`（已在测试中验证）。

---

## 换一个学习目标

引擎不认识具体学科，它只认知识包。现在支持**多个知识包共存**，两条路：

**A. 内置一个新包（内容随 APK 走）**

现在内置包都是直接写 `decks/<id>.json`（协议见 `docs/deck-protocol.md`），最小可用模板在 `test/decks/minimal.deck.json`：拷一份改 `id` / `title` / 模块与问答，放到 `decks/`，再同步一份到 `app/src/main/assets/decks/` 即可。

以前那套「`decks-src/` 写 JS 源 → 生成 JSON」的流程已经停用（`decks-src/ml-intro/build.js` 留在仓库里只作历史参考，别跑）；现在所有包一律直接编辑 `decks/<id>.json`。

**B. 外部导入（不重装 APK，推荐）**

三条路，产出的都是同一个「导入包」：

1. **微信/QQ/网盘里直接打开**：把 `deck.json` 发到手机，用「其他应用打开」选「题台」；或在文件管理器里点开、选「题台」。
2. **设置页选文件**：「设置 → 知识包 → 从文件导入」，在系统文件选择器里挑 `.json`。
3. **从电脑推**：把文件丢进仓库根的 `decks/`，电脑跑 `node tools/sync.js`，手机「从电脑获取知识包」→「下载」。

导入会先体检再入库：JSON 合法、`schema=1`、`id` 合法、模块/知识点/问答的结构与引用闭合（答案结构 v1.5 起是自由的，只校验块字段与 1..3 级标题）。不合格的文件不会写入，弹层直接列出问题清单（如 `E_CHECK_PREFIX：g1.2 应为 g1.1`），改完再发一次即可。

两种方式产出的包可以并存：同一 `id` 时导入包覆盖内置包，方便改内容而不动 APK。

`validate-deck.js` 会把协议的不变量过一遍（id 派生规则、引用闭合、答案块结构与 1..3 级标题、覆盖深度直方图），另外检查每条知识点是否被问答覆盖、`next`/`peer` 引用是否存在、QA id 是否重复——不通过就报错退出，避免把残缺内容打进 App。
（覆盖率是**本项目的验收线**，不是协议要求：协议里它只是 SHOULD，校验器只报 `W_UNCOVERED` 警告。）

`audit-answers.js` 再从「读起来顺不顺」的角度扫一遍：空洞块、超长块、体裁与结构错配、结论里写步骤、该拆列表却堆成一段。它只给建议，不阻断构建。

`conformance.js` 做最后一道：把 deck 塞进真实引擎资源、用无头浏览器渲染，确认没有 JS 异常、模块/知识点/问答数量与声明一致、`terms` 文案生效、详情面板能打开。

界面名词解耦：`deck.terms = { group, check, qa }` 可覆盖显示文案，缺省是「模块 / 知识点 / 问答」；换包时想叫「章节／考点／题目」都行，不影响 id、进度与同步。

进度按知识包 id 区分：每个包一份 `files/states/<id>.json`，换包后旧进度不会串味（同一个包里 id 复用则视为同一题）。升级到多包版本后，老的 `state.json` 会一次性迁移到内置包名下。

## 让 agent 帮你写包（skills/）

`skills/titai-deck-author/` 是一个给 AI agent 用的技能（Agent Skill：`SKILL.md` + 参考文档 + 模板 + 脚本）。加载它之后，agent 知道协议怎么规定、结构怎么选、写完怎么自检，产出的 JSON 直接就能导入。

```
skills/titai-deck-author/
├─ SKILL.md              主文件：六步工作流、硬规则速查、常见返工清单
├─ references/
│  ├─ deck-format.md     逐字段速查（含公式、跨包引用）
│  ├─ content-rules.md   体裁判定、四种答案结构模板、及格线写法、追问链设计
│  └─ validation.md      全部错误码与修法、体检规则、脚本不查什么
├─ assets/
│  ├─ deck.template.json 通过校验、零警告的最小可用包
│  ├─ plan.template.json 最小可用计划
│  └─ schema/            两份 JSON Schema（权威结构定义）
└─ scripts/
   ├─ check.js           一条命令总检（自动识别 deck / plan）
   ├─ validate-deck.js   协议校验器（与 tools/ 下同一个文件）
   ├─ validate-plan.js   计划校验器
   └─ audit-answers.js   答案结构体检
```

装上（agent 默认从 `~/.agents/skills/` 读技能）：

```bash
git clone https://github.com/Ela0Li/titai.git
cp -r titai/skills/titai-deck-author ~/.agents/skills/        # Windows: robocopy 或资源管理器复制
```

不装技能也能用里面的校验器，改完包跑一遍就行：

```bash
node skills/titai-deck-author/scripts/check.js decks/我的包.json
```

技能里的 `scripts/validate-deck.js` 与仓库 `tools/` 下那份是同一份实现；**改规则两边都要同步**（CI 会用技能自带的模板跑一遍，模板烂了会红）。

---

## 知识包管理

「设置 → 知识包」列出所有可用包，当前包标「使用中」，其余有「切换」；导入包多一个「删」（连同它的进度一起删）。下面的「从文件导入」走系统文件选择器，「从电脑获取知识包」向 `tools/sync.js` 要列表并逐个下载。

导入的入口一共三个：文件选择器、其他应用的「打开方式/分享」（`.json` 文件可以选「题台」打开）、电脑下发。三条路都会先跑一遍结构体检，坏包不入库。

- 内置包：随 APK 走，删不掉，卸载重装还在。
- 导入包：存在应用私有目录 `decks/<id>.json`，可随时删。
- 同名 `id`：导入包覆盖内置包（改内容不用重装 APK）。

**学习计划**（v0.8.6 起）和知识包一样直接列在设置页，一行一个：标题、`id · N 个知识包 · 成员顺序`，右侧「使用 / 编辑 / 删」（当前计划只显示「编辑」，内置计划不能删）。下面才是「新建计划 / 导入计划文件」，不再藏进二级面板。

调试用深链（`adb shell am start`）：

```bash
-e deck demo                 # 切到某个知识包
-e download demo             # 从电脑下载并切过去（需先 -e host / -e code）
-e decks 1                   # 打开「电脑上的知识包」列表
-e importFile /path/x.json   # 直接导入一个文件（只认应用私有路径，调试用）
-e plan http://电脑:端口/x.plan.json   # 从电脑取一个计划文件，导入并切过去
```

---

## 答案结构与内容工具（v0.8.3 起）

协议只规定「答案是一个块数组」，每块有 `h`（自拟小标题，≤24 字）、`lvl`（1..3，可省）、`p`（正文）、`list`（要点，可选）。写成什么结构由内容体裁决定，本仓库的约定是：

| 体裁 | 结构 | 例子 |
|---|---|---|
| 操作型（怎么处理 / 怎么选 / 怎么排查） | 一句话 → 分几步（list）→ 边界与坑 → 落地 | `q.m2.clean`、`q.m6.debug` |
| 对比型（A 与 B 的区别） | 一句话 → 关键差异（list）→ 怎么选 → 边界 | `q.m4.prune`、`q.m2.forward` |
| 概念型（是什么 / 为什么） | 结论 → 机制 → 取舍 → 实战 | `q.m1.biasvar` |

> 0.9.0 之前那次「按体裁重排 262 条答案」用的补丁机制（`restructure-answers.js` + `answers-patches.json`）已经废弃：内容已经写进 `decks/*.json`，日常不会再跑它。现在改答案直接改 `decks/<id>.json`，然后用上面的两个工具体检。

工具：

- `node tools/audit-answers.js [--deck id] [--list] [--dump]` —— 按可复现的规则扫「结构不合适」的答案：E1 空洞块（正文 < 40 字，带 `list` 的块按 `p`+条目合计算）、E2 单块过长、E3 操作型问句却只有取舍/实战、E4「结论」块里写步骤、E5 该拆 list 的长段落、E6 多块无标题、E7 有嵌套语义却全用 1 级标题。
- `node tools/apply-hints.js [--check] [--deck id]` —— 把 `tools/hints/<deck>.json` 里的知识点「及格线」灌进知识包（幂等，重建后重跑）。
- `node tools/build-pinyin.js` —— 由 `tools/data/pinyin-src.txt` 生成 `app/src/main/assets/pinyin.js`（汉字 → 全拼/首字母表，搜索用）。**换字表才需要重跑**，平时改代码不用。
- `node tools/test-search.js [--dump q1 q2 …]` —— 无头跑一组查询，打印每个查询在新知识点页/问答页的命中条数与首条，并核对高亮；写新查询直接改脚本里的 `CASES`。
- `node tools/split-protocol.js` —— 从 `docs/deck-protocol.src.md` 重新拆出协议三册（总纲 / 知识包 / 计划）。**改协议改 src，再跑这个**，别直接改三册产物。
- `node tools/conformance.js [deck.json …]` —— 无头渲染一份 deck，确认引擎能真的打开它（默认测 `decks/ml-intro.json`）。
- `node tools/test-progress.js [deck.json …]` —— 掌握度交互回归：列表圆点只展示（点它不改状态）、卡片里只亮当前档位、关掉卡片后模块百分比 / 进度条 / 知识包百分比跟着变、再点当前档位能取消；后半段跑问答：`qm` 圆点同样只展示、卡片单亮、覆盖点能拉起知识点卡片、关卡片后能按「会 / 熟练 / 全部」筛出正确条数。需要本机 Edge，CI 不跑。

---

## 搜索（v0.9.1 起）

两个页面的搜索框都走同一套规则，输入即时出结果：

| 输入 | 命中方式 | 例子 |
|---|---|---|
| 任意片段 | 子串（大小写、全半角、空格都不敏感） | `噪声`、`fBm`、`perlin` |
| 汉字全拼 | 按音节开头对齐，越靠后扣分越多 | `zaosheng` → 噪声 |
| 首字母 | 只打声母 | `zs` → 噪声，`td` → 梯度 |
| 子序列 | 退化的兜底，命中但分数低 | `nse` → noise |
| 多词 | 空格分开、全部命中才算（AND） | `噪声 fbm` |
| 答案正文 | 问答页会搜答案的每一块正文与列表；命中处给出「…」片段 | `perlin` |

命中按相关度排序（标题权重最高，其次是模块名、标签、知识点、答案正文），命中的字会高亮。知识包内搜索只搜**当前计划里的包**，与列表、问答页的范围一致。

代价与边界：拼音表是脚本生成的静态表（`pinyin.js` 约 18 KB），不联网、不引第三方库；没有同义词/英文别名（搜 `noise` 不会命中「噪声」），因为那需要一张人工对照表。

---

## 发版流程

```powershell
# 1) 改版本号（app/build.gradle.kts 的 versionCode +1 / versionName）
# 2) 全量自检
node tools/validate-deck.js decks/ml-intro.json   # 其它包同理，或看 CI
node tools/check-links.js decks/*.json
node tools/audit-answers.js
node tools/test-math.js
# 3) 构建正式包
.\gradlew.bat --offline assembleRelease          # → app/build/outputs/apk/release/app-release.apk
# 4) 装机验收（真机，覆盖安装）
adb -s a27457ef install -r app\build\outputs\apk\release\app-release.apk
# 5) 打 tag 并推
git tag -a v0.9.4 -m "题台 0.9.4"
git push origin main --tags
# 6) 在 GitHub 建 Release（附 app-release.apk），发布说明抄 CHANGELOG 对应段落
```

CI（`.github/workflows/ci.yml`）在每次 push 时跑语法检查、各知识包的协议校验、计划校验、跨包引用、答案体检和技能自检；**构建 APK 不在 CI 里**（需要 Android SDK 与本地签名材料）。

---

## 已知取舍

- 同步进度按知识包分桶：电脑端 `sync/states/<id>.json`，手机端 `files/states/<id>.json`；`push`/`pull` 的请求体带 `deck`，两边只碰当前这一个包。多包同时用同步也不会互相覆盖；但**浏览器里的进度是本地的**，与电脑端分桶文件不是同一份，要靠拉取/推送对齐。
- 电脑端页面：`/` 是控制台（配对码、地址、每个包的进度表、点包名进对应界面），`/a/?deck=<id>` 直接打开某个包。
- 更新：侧载 APK 覆盖安装即更新，版本号在「设置」页底部。
- 无账号、无云端：同步只在同一局域网内、点对点，不经过任何服务器。
- WebView 用的是系统内核（模拟器上 Chromium 110），CSS 里避开了 `color-mix()` 这类新语法。
