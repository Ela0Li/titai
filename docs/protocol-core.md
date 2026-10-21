# 题台 · 协议总纲（core）

## 三册导览

协议自 v1.7 起拆成三册，**章节号沿用总编号不重排**，所以旧链接里的 §9 依然是 §9，只是住进了计划册。

| 册 | 文件 | 章节 | 读者 |
| --- | --- | --- | --- |
| 总纲 | `docs/protocol-core.md` | §0 边界、§2 进度层、§3 同步层、§4 校验器、§5 版本与兼容、§10 掌握度同步、附录 A 字段速查 | 所有人；改任何一册前先读这册 |
| 知识包 | `docs/deck-protocol.md` | §0 快速示例、§1 内容层、§6 制作步骤、§7 数学公式、§8 跨包引用 | 写内容、做包的人 |
| 学习计划 | `docs/plan-protocol.md` | §9 学习计划 | 分发计划、做计划 UI 的人 |

**版本号只在总纲定义**（§5.1）。另两册的修订必须同步在总纲修订表里加一行，写清影响哪一册；三册共用同一个版本号。
**错误码只在总纲定义**（§4 之后那张表）。校验器报出的码，含义一律以总纲为准。

---

## 0. 这份协议管什么

本协议定义「题台」的三个契约层，使**引擎**（App 与电脑端页面）与**内容**（某个知识包）彻底解耦：

| 层 | 载体 | 谁产生 | 谁消费 |
|---|---|---|---|
| 内容层 deck | `deck.json` | 人（或生成脚本） | 引擎渲染 |
| 进度层 state | `state.json` | 引擎运行期写入 | 引擎、同步服务 |
| 同步层 | HTTP / JSON | 电脑端 `tools/sync.js` | 手机 App |

约定：`MUST` = 违反即非法；`SHOULD` = 违反可运行但不推荐；`MAY` = 可选。

### 0.1 这份协议能保证什么，不能保证什么

**能保证**（由 JSON Schema + `tools/validate-deck.js` + 一致性测试共同兑现）：

1. 结构正确：字段类型、枚举、长度、必填项。
2. 引用闭合：任何 `covers` / `next` / `peer` / `m` 都不会指向不存在的 id，因此引擎不会因为“点了找不到”而白屏。
3. id 规则：`check.id = group.id + 序号`，进度的键稳定，换包不串味。
4. 答案结构：`ans` 是有序块数组（`p` 必填，`h` / `lvl` / `list` 可选），标题最多 3 级、不跳级，无 HTML 注入；数学公式的 `$…$` / `$$…$$` 标记成对且花括号闭合（deck §7）。
5. 引擎可渲染：通过校验的包在 `tools/conformance.js` 里能完整渲染出列表、问答、收藏、刷题四个视图，无 JS 异常；带公式的包还要在 DOM 里真的出现 `<math>`。
6. 进度可合并：`state.json` 满足幂等 / 可交换 / 不丢分。

**不能保证**（内容质量，协议管不了）：

- 问题问得好不好、答案对不对；
- 篇幅是否适合手机屏（一屏能读多少字，只能靠人眼）；
- `layer` 标注是否名副其实（是否有“逻辑跳跃”只能由读者判断）；
- 覆盖是否完整 —— 这是**推荐实践**，不是协议要求（见 deck §1.7）。

一句话：**协议保证“这个包能被引擎安全地打开并展示”，不保证“这个包是好内容”。**
第三方作者只要跑通 `validate-deck.js` + `conformance.js`，产物就一定能被本项目加载；至于内容好不好，那是评审的事，不是协议的事。

---

## 2. 进度层：`state.json`

状态与内容**完全分离**：换知识包不必清进度，换设备只搬 `state.json`。

```json
{
  "v": 1,
  "deck": "ml-intro",
  "rev": 6,
  "touched": 1792508824668,
  "checks": { "m1.1": { "m": 2, "t": 1792508671041 } },
  "qm":     { "q.m11.layers": { "m": 1, "t": 1792508800123 } },
  "fav":    { "m1.1": { "on": true, "t": 1792509001993 } },
  "quiz":   { "q.m11.layers": { "ok": 1, "no": 0, "t": 1792508747749 } },
  "settings": { "theme": "dark", "tab": "qa" },
  "sync": { "host": "192.168.0.100:8787", "code": "9878" }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `v` | integer | 状态格式版本，当前 `1`。 |
| `deck` | string | 对应 deck 的 `id`。设备上只装一个包时用于自检。 |
| `rev` | integer | 单调递增的修订号，仅作诊断与日志用，**不参与冲突判断**。 |
| `touched` | integer | 最后写入时间（epoch ms）。 |
| `checks` | map | key = check id；`m` ∈ `0..3` 掌握度（0 未学 / 1 模糊 / 2 会 / 3 熟练）；`t` = 写入时间。 |
| `qm` | map | key = qa id；问答**自己**的掌握度，档位同上，与 `checks` 各记各的（§10.4）。缺省即空表。 |
| `fav` | map | key = check id 或 qa id；`on:false` 是**墓碑**（显式取消收藏），必须保留以覆盖其他设备的 `on:true`。 |
| `quiz` | map | key = qa id；`ok`/`no` 累计次数，用于“薄弱项”抽取。 |
| `settings` | object | `theme` ∈ `dark\|light`，`tab` ∈ `list\|qa\|fav\|drill\|more`。 |
| `sync` | object | 上次使用的电脑地址与配对码。 |

### 2.1 合并规则（LWW-Register per key）

对 `checks` / `qm` / `fav` / `quiz` 四张表，**逐 key 取 `t` 较大的一份**；`t` 相同时保留本地。合并后 `rev = max(local.rev, remote.rev) + 1`。

性质：

- **幂等**：同一份数据合并两次结果相同；
- **可交换**：A 合 B 与 B 合 A 的结果一致（除 `rev`）；
- **不丢分**：任一设备上较新的掌握度不会被旧数据覆盖。

前提：各设备时钟大致准确。时间戳来自各设备本地时间，跨设备时钟偏差超过“学习间隔”时可能出现旧数据覆盖新数据——这是有意的取舍：不做向量时钟，换取零配置。

### 2.2 生命周期

- 首次启动：`state` 为默认空对象，不落盘直到第一次写入。
- 写入：内存改动后 350 ms 防抖，经 `Native.saveState()` 落盘到应用私有目录 `files/states/<deck.id>.json`（网页版回退 `localStorage["studydesk.state.v1:<deck.id>"]`）。老的 `files/state.json` 在首次启动时按其中 `deck` 字段迁移。
- 清空：「设置 → 清空本机进度」删除四张表与 `settings.tab`，保留 `sync` 与 `settings.theme`。

---

## 3. 同步层

电脑端运行 `node tools/sync.js [port]`（默认 8787），手机与电脑在同一局域网即可，无需账号与云端。

### 3.1 端点

| 方法 | 路径 | 请求体 | 响应 |
|---|---|---|---|
| GET | `/api/ping[?deck=<id>]` | — | `{ok, name, port, code, deck, title, groups, qas, rev, checks, decks}` |
| POST | `/api/pull` | `{code, deck}` | `{ok, deck, state}` |
| POST | `/api/push` | `{code, deck, state}` | `{ok, deck, rev, checks}` |
| GET | `/api/decks?code=` | — | `{ok, decks:[{id,title,checks,qas,rev,done,favs,quiz}]}` |
| GET | `/api/deck?id=&code=` | — | 该知识包的 `deck.json` 原文 |
| GET | `/` | — | 人看的控制台（配对码、地址、每个包的进度表） |
| GET | `/a/[?deck=<id>]` | — | 电脑浏览器里的学习界面（同一套 assets） |

约定：

- 所有响应 `Content-Type: application/json; charset=utf-8`，允许跨域（`Access-Control-Allow-Origin: *`，仅为局域网便利）。
- **业务错误也返回 HTTP 200**，用 `{ok:false, msg}` 表达（配对码错误、缺 state 等）；只有路由不存在才 404。这样客户端只需解析一次 JSON。
- `code` 为 4 位数字，首次启动生成并写入 `sync/code.txt`，之后固定。
- **进度按包分桶**：服务端存在 `sync/states/<id>.json`，`pull`/`push` 都只读写 `deck` 指定的那一份。客户端拿到的 `state.deck` 与自己的当前包不一致时必须拒绝合并（引擎会提示并跳过）。老的 `sync/state.json` 在首次启动时按其中的 `deck` 字段迁到分桶目录。

### 3.2 时序

```
手机（拉取）                     电脑端 sync.js
  POST /api/pull {code, deck} ─────────────▶
                              读 states/<deck>.json
  ◀───────────── {ok, deck, state}
  mergeState(local, remote)   // 逐 key 取 t 大者
  saveState()                 // 落盘

手机（推送）                     电脑端 sync.js
  POST /api/push {code, deck, state} ───────▶
                              mergeState(服务器该桶, 手机)
                              写 states/<deck>.json（原子：.tmp + rename）
  ◀───────────── {ok, deck, rev, checks}
```

**双方都做合并**，因此：

- 推送不是覆盖，电脑上更新的记录会保留；
- 拉取也不是覆盖，手机上更新的记录会保留；
- 两台设备交替 push/pull 若干轮后，最终一致。

### 3.3 协议不做的事（有意留白）

| 不做 | 原因 |
|---|---|
| 账号 / 云端 | 个人自用，局域网直连零成本；不上传任何内容。 |
| 内容分发（拉 deck） | deck 随 App 打包，改内容 = 重新构建。内容与进度分离但都走包内更新。 |
| 增量 diff | 状态体量在百 KB 级，整包交换更简单、更不易出错。 |
| 实时同步 | 学习场景无并发要求；收工推一次即可。 |
| 冲突提示 | LWW 的冲突表现为“较新的赢”，无需打扰用户。 |

---

## 4. 校验器

```bash
node tools/validate-deck.js decks/ml-intro.json   # 校验指定文件
node tools/validate-deck.js                      # 不带参数时打印用法
node tools/validate-deck.js --json               # 机器可读输出
node tools/validate-deck.js --verbose            # 展开 notes（软提示）
```

输出（当前知识包的实际结果）：

```
知识包：机器学习入门 · 从数据到上线（ml-intro，schema 1）
  模块 9 · 知识点 54 · 问答 60 · 交叉引用 111（next 45 / peer 66） · 跨包 7
  覆盖 54/54（100.0%） · 分层 L1 4 / L2 20 / L3 27 / L4 9
  覆盖深度：1 条 42 · 2 条 12 · 3 条 0 · 4+ 条 0

✓ 通过协议 v1 校验
```

结果分三级：

| 级别 | 含义 | 影响退出码 |
|---|---|---|
| `problems` | 违反 MUST，包不可用 | 是（退出码 1） |
| `warnings` | 违反 SHOULD，可用但不规范 | 否 |
| `notes` | 软提示：`next` 互引成环、追问层级未递进 | 否 |

`--json` 时三者都是数组，元素形如 `{code, path, msg}`；`stats` 里附带覆盖率、分层分布、覆盖深度直方图。

典型 problems：

```
[E_COVER_REF] q.m10.graph — covers 指向不存在的知识点：m10.99
[E_SELF_REF]  q.m2.vector — next 含自身
[E_ANS_HEAD]  q.m2.vector.ans[0].h — 第一段必须是“结论”
[E_CHECK_PREFIX] m3.7 — check id 必须以 “m3.” 开头，实际 m4.7
```

> 注意 `W_UNCOVERED`（知识点没有问答覆盖）现在是 **warning**，不算 problems，见 deck §1.7。

推荐在 CI 里针对每份包各跑一次：

```bash
for f in decks/*.json; do node tools/validate-deck.js "$f"; done
```

### 4.1 一致性测试：证明“能被引擎打开”

校验器只读 JSON，证明不了“引擎渲染不崩”。`tools/conformance.js` 把 deck 塞进真实引擎资源，用无头浏览器跑一遍：

```bash
node tools/conformance.js                              # 测 decks/ml-intro.json
node tools/conformance.js test/decks/minimal.deck.json # 测最小合法包
node tools/conformance.js a.json b.json                # 一次测多份
```

它检查：

1. 引擎加载后 **无 JS 异常**（`window.onerror` 全捕获）；
2. 模块数、知识点渲染数与 deck 声明一致——**不丢项**；
3. 列表搜索框、底部 tab 的文案确实用上了 `terms`（缺省 `知识点` / 自定义 `知识点` 都能验）；
4. 问答页渲染出全部 qa 行；
5. 点开一条问答，详情面板能打开（`.sheet.on`）。

输出示例：

```
✓ test\decks\minimal.deck.json — 模块 1 · 知识点 2 · 问答 1 · tab「知识点/问答」· 无 JS 异常
✓ decks\ml-intro.json — 模块 9 · 知识点 54 · 问答 60 · tab「知识点/问答」· 无 JS 异常
✓ 全部通过（2 份）
```

`test/decks/minimal.deck.json` 是**最小合法包**：只写必填字段，没有 `signal` / `keypoints` / `traps` / `tags` / `next` / `peer`，还有一条知识点没有任何问答覆盖。它能通过，才说明第三方作者不必照着本项目的写法填满所有可选字段。

浏览器路径可用 `EDGE` 环境变量覆盖，默认 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。

---

## 5. 版本与兼容

| 变更 | 处理 |
|---|---|
| 新增可选字段 | 不升 `schema`；旧引擎忽略 |
| 新增枚举值（如 `layer: 5`） | 升 `schema`；旧引擎应拒载并提示“App 版本过旧” |
| 调整必填项 / 改字段语义 | 升 `schema` |

引擎读到 `schema > 1` 时 SHOULD 显示“知识包需要更新的 App”，而不是静默降级渲染。

### 5.1 修订记录

| 协议版本 | 内容 | `schema` |
|---|---|---|
| v1.0 | 内容 / 进度 / 同步三层，四段式答案 | 1 |
| v1.1（v0.5.0） | 多知识包共存（deck §6.1）；手机端导入体检（deck §6.2）；**数学公式 `$…$` / `$$…$$`（deck §7）**；掌握度圆点改为“按等级统一上色” | 1（不变） |
| v1.2（v0.6.0） | **跨包引用（deck §8）**：`deckId#localId`、`check.seeAlso`、`deps`；`id` 升级为全局唯一命名空间；跳转 = 切包 + 返回栈；跨包默认只读（设置可开）；跨包 `covers` 双向计数；反向引用表随包更新刷新 | 1（不变） |
| v1.3（v0.7.0） | **学习计划（plan §9）**：`plan.json` 与成员顺序；计划内软切包、列表按知识包分区、模块编号按包独立、问答按包筛选；**掌握度同步（§10）**：跨包 `covers` 双向写入；`terms` 统一为“模块 / 知识点 / 问答” | 1（不变） |
| v1.4（v0.8.0） | 知识包分区**可同时展开多个**；计划可**新建/编辑/删除/导入**，新增 `order`（plan §9.1）；多包场景下按主题拆分知识包，机器学习拆出 `ml-math`；模块标题与名词全量统一为「模块X · …」；内置计划换成一个机器学习计划（`order` 决定默认） | 1（不变） |
| v1.5（v0.8.2） | **答案结构自由化（deck §1.6）**：h 自拟、lvl 1..3 层级、可选 list，块上限 4→12；不再要求「结论打头、四段有序」；知识点页只列当前计划内的知识包 | 1（不变） |
| v1.6（v0.8.5） | **计划内外的引用区分（deck §8.5.1）**：目标包在计划内/计划外/未安装三态各有标签样式；计划外可跳转但会临时离开计划，顶部给「回到计划」；判定按计划成员表而非当前渲染列表 | 1（不变） |
| v1.7（v0.8.7） | **协议拆三册**：总纲 `protocol-core.md`（边界、进度、同步、校验、版本、掌握度、附录）、知识包 `deck-protocol.md`（示例、内容层、制作、公式、跨包引用）、计划 `plan-protocol.md`（学习计划），章节号沿用不重排，三册共用版本号；**知识点新增 `hint`（deck §1.3，及格线提示，≤60 字）**；`seeAlso` 由 MAY 升为 SHOULD 并给出唯一判据（deck §1.7） | 1（不变） |
| v1.8（v0.9.3） | **术语统一**：协议正文、界面文案与校验器提示里的「学习包」一律写「知识包」，旧的「自查点」一律写「知识点」（deck §1.3 的 `terms` 默认值本来就是模块 / 知识点 / 问答）；字段与 id 完全不变，老包不用改 | 1（不变） |
| v1.9（v0.9.5） | **问答独立掌握度**：`state.json` 新增 `qm` 表（key = qa id，档位同知识点，合并同 §2.1）；问答页可按掌握度筛选；问答卡片「覆盖点」可点开对应知识点卡片；刷题页可收藏当前题；`checks` 与内容层字段完全不变，老进度照旧可用 | 1（不变） |
| v1.10（v0.9.6） | **取消掌握度自动同步（§10）**：改一个知识点只写它自己，不再联动同一条问答覆盖的其它知识点，也不再写别的包的 `state.json`；旧进度不回溯修正，要整体标记请用问答自己的 `qm` | 1（不变） |

公式是**纯文本语法**，不是新字段，所以 `schema` 保持 1：老引擎会把 `$\frac{a}{b}$` 当普通文字显示，内容不丢、不崩。

---

## 10. 掌握度的记账范围（v1.3 曾自动同步，v1.10 起取消）

### 10.1 现行规则（v1.10 起）

- 改一个知识点，**只**写它自己的 `checks[id]`；同一条问答覆盖的其它知识点一个都不动；
- 跨包 `covers`（`deck#id`）目标**不再**被写入，对方的 `state.json` 保持原样；
- 引擎 MUST NOT 写别的包的进度文件（`deck.json` 与别的包的 `state.json` 都只读）；
- 旧数据不回溯修正：v1.10 之前同步过的那批值原样保留，之后各记各的。

### 10.2 为什么取消

v1.3 的设计假设是“用户点亮一条，就表示这条问答我都懂了”，所以让覆盖到的知识点共享分数、并跨包各写一份。实际用起来这不是用户要的：

- 一条问答常常覆盖三五个知识点，点一个亮一片，`会 / 熟练` 的区分就失真了；
- 同步会悄悄改别的知识包的进度，用户看到“我没点过它，它怎么变了”，无从解释；
- 这份“便利”是引擎自己的假设，不是用户的要求。

所以 v1.10 把自动同步整个移除：掌握度是**逐条**的，要整体标记请用问答自己的掌握度（§10.4），那份额外的分数不参与覆盖率。

### 10.3 历史（v1.3–v1.9 的行为，仅供读旧数据参考）

| 情况 | 当时的行为 |
|---|---|
| 本地 `covers` | 共享掌握度，`state.checks` 里写成同一档 |
| 跨包 `covers`（包已安装） | 写进对方 `state.json` 的 `checks[id] = {m, t}`，同时 `rev++`、`touched = now` |
| 目标包未安装 / 知识点已删 | 跳过，不报错 |
| 冲突 | 时间戳决胜（§2.3 LWW） |

读旧备份时如果看到一组知识点分数一模一样，多半就是那段时间同步写出来的，不代表真的逐条复习过。

### 10.4 问答自己的掌握度（v1.9 起）

知识点太细、有时想整体标一句“这条问答我熟了”，所以 v1.9 给 `qa` 加了一份**独立**的自评：

| 项目 | 规则 |
|---|---|
| 存哪儿 | `state.json` 的 `qm` 表，key = qa id，`m` 同样是 `0..3` |
| 和知识点的关系 | 完全独立：改问答的档位**不会**动 `checks`，反之亦然。问答落在哪些知识点上由 `covers` 表达，两套分数不做加权 |
| 在哪儿改 | 只能在**问答卡片**里改（三档单选、只亮当前档、再点一次取消）；列表、刷题、收藏页只显示三个圆点 |
| 筛选 | 问答页可按 `未学 / 模糊 / 会 / 熟练` 筛；筛选读的就是 `qm` |
| 生效时机 | 与知识点一致：关掉卡片时列表重刷一次 |
| 合并 | 同 §2.1，逐 key 取 `t` 较大的一份 |

---

## 附录 A：字段速查

```
deck
├─ schema:int  id:str  title:str  subtitle?:str  accent?:str  updatedAt?:str
├─ terms?:  {group?:str, check?:str, qa?:str}         # 界面名词，缺省 模块/知识点/问答
├─ deps?:   [ {id, title?} ]                          # v1.2 可选：声明引用了哪些包
├─ groups: [ { id, title, short?, priority, stage:1..4, signal?, keypoints?[], traps?,
│             checks:[ {id, text, lvl, hint?, seeAlso?[]} ] } ]
└─ qas:    [ { id, m, lvl, layer:1..4, q, tags?[], covers[], next?[], peer?[], ans:[ {p, h?, lvl?:1..3, list?[]} ], backNext†, backPeer† } ]

跨包引用（v1.2）：任意 covers/next/peer/seeAlso 元素可写成 "deckId#本地id"
state
├─ v:int  deck:str  rev:int  touched:int
├─ checks: {checkId: {m:0..3, t:int}}
├─ qm:     {qaId:    {m:0..3, t:int}}                  # v1.9：问答自己的掌握度
├─ fav:    {id: {on:bool, t:int}}
├─ quiz:   {qaId: {ok:int, no:int, t:int}}
├─ settings: {theme, tab, crossWrite?}
└─ sync:   {host, code}

† 构建器生成，只读
```
