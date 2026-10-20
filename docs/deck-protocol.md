# 题台 · 学习包协议 v1.1

本协议定义「题台」的三个契约层，使**引擎**（App 与电脑端页面）与**内容**（某个学习包）彻底解耦：

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
4. 答案结构：`结论` 打头、四段有序、无 HTML 注入；数学公式的 `$…$` / `$$…$$` 标记成对且花括号闭合（§7）。
5. 引擎可渲染：通过校验的包在 `tools/conformance.js` 里能完整渲染出列表、问答、收藏、刷题四个视图，无 JS 异常；带公式的包还要在 DOM 里真的出现 `<math>`。
6. 进度可合并：`state.json` 满足幂等 / 可交换 / 不丢分。

**不能保证**（内容质量，协议管不了）：

- 问题问得好不好、答案对不对；
- 篇幅是否适合手机屏（一屏能读多少字，只能靠人眼）；
- `layer` 标注是否名副其实（是否有“逻辑跳跃”只能由读者判断）；
- 覆盖是否完整 —— 这是**推荐实践**，不是协议要求（见 §1.7）。

一句话：**协议保证“这个包能被引擎安全地打开并展示”，不保证“这个包是好内容”。**
第三方作者只要跑通 `validate-deck.js` + `conformance.js`，产物就一定能被本项目加载；至于内容好不好，那是评审的事，不是协议的事。

---

## 0. 快速示例

```json
{
  "schema": 1,
  "id": "ue5-pcg",
  "title": "UE5 PCG 面试复习",
  "subtitle": "18 个模块 · 194 个自查点 · 178 条问答",
  "accent": "#2f81f7",
  "updatedAt": "2026-10-20T15:07:44.467Z",
  "groups": [
    {
      "id": "m1",
      "title": "模块一 · C++ 语言机制",
      "short": "C++ 语言机制",
      "priority": "P0",
      "stage": 1,
      "signal": "不是考语法背诵，而是考能否解释“对象在内存与时间里发生了什么”。",
      "keypoints": ["值语义 vs 引用语义：谁拥有、谁观察、谁负责释放"],
      "traps": ["把 std::move 当成“执行移动”的动作"],
      "checks": [{ "id": "m1.1", "text": "基本类型、const、指针与引用的语义差异", "lvl": "P0" }]
    }
  ],
  "qas": [
    {
      "id": "q.m1.types",
      "m": "m1",
      "lvl": "P0",
      "layer": 1,
      "q": "值、引用、指针和 const 各自表达什么？参数该怎么传？",
      "tags": ["值语义", "const 正确性"],
      "covers": ["m1.1"],
      "next": ["q.m1.memory"],
      "peer": ["q.m2.vector"],
      "ans": [
        { "h": "结论", "p": "默认用值语义；只读的大对象用 const 引用……" },
        { "h": "机制", "p": "引用必须绑定到有效对象且不可重新绑定……" },
        { "h": "取舍", "p": "小且可平凡拷贝的类型传值更快……" },
        { "h": "实战", "p": "UE 中 FVector/FLinearColor 习惯传值……" }
      ]
    }
  ]
}
```

---

## 1. 内容层：`deck.json`

### 1.1 顶层字段

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `schema` | integer | MUST | 协议版本。当前为 `1`。破坏性变更才 +1。 |
| `id` | string | MUST | 学习包标识，`^[a-z0-9][a-z0-9-]{1,40}$`，**全局唯一**：它就是跨包引用的命名空间（见 §8）。同步时用于区分不同包。 |
| `title` | string | MUST | 显示在顶栏与电脑端页面。 |
| `subtitle` | string | MAY | 顶栏第二行，缺省由引擎按“N 个模块 · M 条问答”生成。 |
| `accent` | string | MAY | 主色，`#rrggbb`。深/浅色主题下由引擎自行调整明度。 |
| `terms` | object | MAY | 界面上怎么称呼这三类东西：`{group, check, qa}`，缺省 `模块 / 知识点 / 问答`。见 §1.8。 |
| `updatedAt` | string | MAY | ISO-8601 时间，供人看，引擎不参与逻辑。 |
| `groups` | Group[] | MUST | 模块（自查清单的分组），至少 1 个。 |
| `qas` | Qa[] | MUST | 问答，至少 1 条。 |

未知字段 MUST 被忽略（向前兼容）。

### 1.2 Group（模块）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | MUST | 模块 id，`^[A-Za-z][A-Za-z0-9_-]{0,15}$`。**列表中顺序即展示顺序**。 |
| `title` | string | MUST | 完整标题，如“模块一 · C++ 语言机制”。 |
| `short` | string | MAY | 短名，窄屏与标签处使用；缺省回退 `title`。 |
| `priority` | `"P0"\|"P1"\|"P2"` | MUST | 模块优先级。 |
| `stage` | integer `1..4` | MUST | 阶段，对应筛选条 S1 基础 / S2 图形 / S3 PCG 工程 / S4 实战。 |
| `signal` | string | SHOULD | 一句话说明“这一组真正在考什么”，用于消除题面歧义。 |
| `keypoints` | string[] | MAY | 要点，展示在模块展开区。 |
| `traps` | string[] | MAY | 易错点，与要点并排两列。 |
| `checks` | Check[] | MUST | 至少 1 个自查点。 |

### 1.3 Check（自查点）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | MUST | **MUST 等于 `${group.id}.${序号}`**，序号从 1 起递增，全文件唯一。 |
| `text` | string | MUST | 一句话可自测的条目；动词开头，避免“了解/熟悉”。 |
| `lvl` | `"P0"\|"P1"\|"P2"` | MUST | 该点的重要性。 |
| `seeAlso` | string[] | MAY | 展开看哪里：qa id 或跨包引用（`deckId#qaId`），最多 2 条。见 §8。 |

自查点是**掌握度的最小单位**：进度、筛选、覆盖率都以 check id 为键。

### 1.4 Qa（问答）

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| `id` | string | MUST | `^q\.[A-Za-z0-9_]+(\.[A-Za-z0-9_]+)*$`，如 `q.m10.graph`、`q.x.spatial`。全局唯一。 |
| `m` | string | MUST | **主归属模块** id，MUST 存在。决定卡片上的模块标签与模块内筛选。 |
| `lvl` | `"P0"\|"P1"\|"P2"` | MUST | 重要性。 |
| `layer` | integer `1..4` | MUST | 认知层级，见 §1.5。 |
| `q` | string | MUST | 问题本身。一句话，能直接念出来问人。 |
| `tags` | string[] | MAY | 2–4 个关键词，用于搜索与标签展示。 |
| `covers` | string[] | MUST | 该问答能回答哪些自查点。至少 1 个，元素 MUST 是存在的 check id。**允许跨模块**（桥梁题）；v1.2 起**允许跨包**（`deckId#checkId`，见 §8）。 |
| `next` | string[] | MAY | 追问的下一层：“面试官接着会问什么”。元素 MUST 是存在的 qa id，且 MUST NOT 等于自身。v1.2 起允许 `deckId#qaId`。 |
| `peer` | string[] | MAY | 横向关联：换个角度/换个模块看同一件事。同上约束，v1.2 起同样允许跨包。 |
| `ans` | Ans[] | MUST | 答案分段，见 §1.6。 |
| `backNext` | string[] | 只读 | 由构建器生成：哪些问答把本条目列进了 `next`。**手写源里不要写**。 |
| `backPeer` | string[] | 只读 | 同上，对应 `peer`。 |

### 1.5 layer：四层认知

| 值 | 名称 | 判定标准 | 典型问法 |
|---|---|---|---|
| 1 | 概念识记 | 能说清定义与区别 | “X 和 Y 有什么不同？” |
| 2 | 原理推演 | 能说出内部机制与代价 | “为什么是这样？代价在哪？” |
| 3 | 权衡取舍 | 能给出选型理由与边界 | “什么时候选 A 不选 B？” |
| 4 | 实战排错 | 能定位现象、给出验证手段 | “线上炸了你先看什么？” |

一条好的链应满足：`next` 的 `layer` ≥ 当前条目的 `layer`（层层递进），且同一模块内 L1 数量 SHOULD 少于 L2/L3。

### 1.6 Ans：答案分段

| 字段 | 类型 | 说明 |
|---|---|---|
| `h` | string | 小标题，取值 MUST ∈ `{结论, 机制, 取舍, 实战}`。 |
| `p` | string | 纯文本段落。行内代码用反引号包裹（`` `TArray` ``），引擎转义后渲染为 `<code>`。数学公式用 `$…$`（行内）与 `$$…$$`（块级），见 §7。 |

规则：

- MUST 含 `结论`；
- 其余三节 MAY 省略，但一旦出现，MUST 按 `结论 → 机制 → 取舍 → 实战` 的顺序；
- 每节长度 SHOULD 控制在 40–160 字；`p` 中 MUST NOT 出现 HTML 标签（会被转义显示）；
- 块级公式（`$$…$$`）SHOULD 放在段落末尾，后面不要再接标点或半句（它会被排成独立块）。

### 1.7 引用不变量与覆盖（推荐）

校验器（`tools/validate-deck.js`）保证以下 **MUST** 项：

1. **引用闭合**：`next` / `peer` / `covers` / `m` 指向的 id 全部存在。
2. **无自引用**：`next`、`peer` 不含自身；数组内无重复元素。
3. **无环约束**：`next` 图 MUST NOT 含自环；允许 A→B→A 的双向追问，但 `A.next` 含 B 时 `B.next` SHOULD NOT 再含 A（用 `peer` 表达互看）。
4. **id 唯一**：group、check、qa 三套 id 各自唯一；check id 由 group id 派生，天然不冲突。
5. **答案分段**：见 §1.6。

以下则属于 **SHOULD（推荐，非协议要求）**：

- **覆盖**：每个 check 最好至少被 1 条 qa 的 `covers` 命中。
  这不是协议强制项——没有问答覆盖的 check 依然能正常渲染，点开详情会显示“还没有对应问答”。
  校验器只报 `W_UNCOVERED` 警告，不影响 `ok`。
  是否追求 100% 覆盖是**内容作者的选择**：本项目（UE5 PCG 包）把 100% 当成自己的验收线，由 `tools/mkdeck.js` 在构建时强制；
  换一个学习包，作者完全可以先写清单、后补问答，慢慢补到全覆盖。

> 之所以不把它写成 MUST：清单和问答是两种不同的写作节奏。先列“我该会什么”，再逐个写出答案，是很正常的工作方式；把覆盖当门槛会逼作者把没想清楚的点草草配上答案。

### 1.8 terms：界面名词

引擎内部一律用 `group` / `check` / `qa` 三个键，但界面上显示什么由学习包决定：

```json
"terms": { "group": "章节", "check": "知识点", "qa": "问答" }
```

| 键 | 缺省 | 出现在哪里 |
|---|---|---|
| `group` | `模块` | 顶栏副标题、设置页统计 |
| `check` | `知识点` | 底部 tab、搜索框占位、“没有符合条件的…”、收藏夹标题、详情里的“收藏此…” |
| `qa` | `问答` | 底部 tab、对应问答区标题 |

- 缺省值是**通用词**（模块 / 知识点 / 问答），适合任何主题。
- 需要“考题味”的包可以覆盖成 `{ "check": "自查点" }`，本项目就这么做（`tools/mkdeck.js` 默认写入 `自查点`）。
- 只影响**显示文案**，不影响 id、进度键、同步协议——换词不会让已有进度失效。

---

## 2. 进度层：`state.json`

状态与内容**完全分离**：换学习包不必清进度，换设备只搬 `state.json`。

```json
{
  "v": 1,
  "deck": "ue5-pcg",
  "rev": 6,
  "touched": 1792508824668,
  "checks": { "m1.1": { "m": 2, "t": 1792508671041 } },
  "fav":    { "m1.1": { "on": true, "t": 1792509001993 } },
  "quiz":   { "q.m11.layers": { "ok": 1, "no": 0, "t": 1792508747749 } },
  "settings": { "theme": "dark", "tab": "qa" },
  "sync": { "host": "192.168.0.106:8787", "code": "9878" }
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `v` | integer | 状态格式版本，当前 `1`。 |
| `deck` | string | 对应 deck 的 `id`。设备上只装一个包时用于自检。 |
| `rev` | integer | 单调递增的修订号，仅作诊断与日志用，**不参与冲突判断**。 |
| `touched` | integer | 最后写入时间（epoch ms）。 |
| `checks` | map | key = check id；`m` ∈ `0..3` 掌握度（0 未学 / 1 模糊 / 2 会 / 3 熟练）；`t` = 写入时间。 |
| `fav` | map | key = check id 或 qa id；`on:false` 是**墓碑**（显式取消收藏），必须保留以覆盖其他设备的 `on:true`。 |
| `quiz` | map | key = qa id；`ok`/`no` 累计次数，用于“薄弱项”抽取。 |
| `settings` | object | `theme` ∈ `dark\|light`，`tab` ∈ `list\|qa\|fav\|drill\|more`。 |
| `sync` | object | 上次使用的电脑地址与配对码。 |

### 2.1 合并规则（LWW-Register per key）

对 `checks` / `fav` / `quiz` 三张表，**逐 key 取 `t` 较大的一份**；`t` 相同时保留本地。合并后 `rev = max(local.rev, remote.rev) + 1`。

性质：

- **幂等**：同一份数据合并两次结果相同；
- **可交换**：A 合 B 与 B 合 A 的结果一致（除 `rev`）；
- **不丢分**：任一设备上较新的掌握度不会被旧数据覆盖。

前提：各设备时钟大致准确。时间戳来自各设备本地时间，跨设备时钟偏差超过“学习间隔”时可能出现旧数据覆盖新数据——这是有意的取舍：不做向量时钟，换取零配置。

### 2.2 生命周期

- 首次启动：`state` 为默认空对象，不落盘直到第一次写入。
- 写入：内存改动后 350 ms 防抖，经 `Native.saveState()` 落盘到应用私有目录 `files/states/<deck.id>.json`（网页版回退 `localStorage["studydesk.state.v1:<deck.id>"]`）。老的 `files/state.json` 在首次启动时按其中 `deck` 字段迁移。
- 清空：「设置 → 清空本机进度」删除三张表与 `settings.tab`，保留 `sync` 与 `settings.theme`。

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
| GET | `/api/deck?id=&code=` | — | 该学习包的 `deck.json` 原文 |
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
node tools/validate-deck.js dist/deck.json      # 校验指定文件
node tools/validate-deck.js                     # 默认 dist/deck.json
node tools/validate-deck.js --json              # 机器可读输出
node tools/validate-deck.js --verbose           # 展开 notes（软提示）
```

输出（当前学习包的实际结果）：

```
学习包：UE5 PCG 面试复习（ue5-pcg，schema 1）
  模块 18 · 自查点 194 · 问答 178 · 交叉引用 560（next 367 / peer 193）
  覆盖 194/194（100.0%） · 分层 L1 16 / L2 55 / L3 70 / L4 37
  覆盖深度：1 条 163 · 2 条 31 · 3 条 0 · 4+ 条 0

notes（213，协议允许的软提示，加 --verbose 展开）

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
[E_COVER_REF] q.m10.graph — covers 指向不存在的自查点：m10.99
[E_SELF_REF]  q.m2.vector — next 含自身
[E_ANS_HEAD]  q.m2.vector.ans[0].h — 第一段必须是“结论”
[E_CHECK_PREFIX] m3.7 — check id 必须以 “m3.” 开头，实际 m4.7
```

> 注意 `W_UNCOVERED`（自查点没有问答覆盖）现在是 **warning**，不算 problems，见 §1.7。

推荐在 CI 与 `mkdeck.js` 之后各跑一次：

```bash
node tools/mkdeck.js && node tools/validate-deck.js dist/deck.json
```

### 4.1 一致性测试：证明“能被引擎打开”

校验器只读 JSON，证明不了“引擎渲染不崩”。`tools/conformance.js` 把 deck 塞进真实引擎资源，用无头浏览器跑一遍：

```bash
node tools/conformance.js                              # 测 dist/deck.json
node tools/conformance.js test/decks/minimal.deck.json # 测最小合法包
node tools/conformance.js a.json b.json                # 一次测多份
```

它检查：

1. 引擎加载后 **无 JS 异常**（`window.onerror` 全捕获）；
2. 模块数、自查点渲染数与 deck 声明一致——**不丢项**；
3. 列表搜索框、底部 tab 的文案确实用上了 `terms`（缺省 `知识点` / 自定义 `自查点` 都能验）；
4. 问答页渲染出全部 qa 行；
5. 点开一条问答，详情面板能打开（`.sheet.on`）。

输出示例：

```
✓ test\decks\minimal.deck.json — 模块 1 · 自查点 2 · 问答 1 · tab「知识点/问答」· 无 JS 异常
✓ dist\deck.json — 模块 18 · 自查点 194 · 问答 178 · tab「自查点/问答」· 无 JS 异常
✓ 全部通过（2 份）
```

`test/decks/minimal.deck.json` 是**最小合法包**：只写必填字段，没有 `signal` / `keypoints` / `traps` / `tags` / `next` / `peer`，还有一条自查点没有任何问答覆盖。它能通过，才说明第三方作者不必照着本项目的写法填满所有可选字段。

浏览器路径可用 `EDGE` 环境变量覆盖，默认 `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`。

---

## 5. 版本与兼容

| 变更 | 处理 |
|---|---|
| 新增可选字段 | 不升 `schema`；旧引擎忽略 |
| 新增枚举值（如 `layer: 5`） | 升 `schema`；旧引擎应拒载并提示“App 版本过旧” |
| 调整必填项 / 改字段语义 | 升 `schema` |

引擎读到 `schema > 1` 时 SHOULD 显示“学习包需要更新的 App”，而不是静默降级渲染。

### 5.1 修订记录

| 协议版本 | 内容 | `schema` |
|---|---|---|
| v1.0 | 内容 / 进度 / 同步三层，四段式答案 | 1 |
| v1.1（v0.5.0） | 多学习包共存（§6.1）；手机端导入体检（§6.2）；**数学公式 `$…$` / `$$…$$`（§7）**；掌握度圆点改为“按等级统一上色” | 1（不变） |
| v1.2（v0.6.0） | **跨包引用（§8）**：`deckId#localId`、`check.seeAlso`、`deps`；`id` 升级为全局唯一命名空间；跳转 = 切包 + 返回栈；跨包默认只读（设置可开）；跨包 `covers` 双向计数；反向引用表随包更新刷新 | 1（不变） |
| v1.3（v0.7.0） | **学习计划（§9）**：`plan.json` 与成员顺序；计划内软切包、列表按知识包分区、模块编号按包独立、问答按包筛选；**掌握度同步（§10）**：跨包 `covers` 双向写入；`terms` 统一为“模块 / 知识点 / 问答” | 1（不变） |

公式是**纯文本语法**，不是新字段，所以 `schema` 保持 1：老引擎会把 `$\frac{a}{b}$` 当普通文字显示，内容不丢、不崩。

---

## 6. 制作新学习包的步骤

1. 复制 `pcg-doc/data/` 的结构：`modules.js`（groups）+ `qa-*.js`（qas），或在任意语言里直接产出 `deck.json`。
2. 遵循 §1 的 id 规则与不变量；桥梁题用 `covers` 跨模块，用 `peer` 表达横向关联。
3. 生成并校验（可选再加一致性测试）：

   ```bash
   node tools/mkdeck.js                              # 生成 dist/deck.json 与 assets/deck.js
   node tools/validate-deck.js dist/deck.json        # 必须 ok:true
   node tools/conformance.js dist/deck.json          # 建议：证明引擎能渲染
   ```

4. 分发方式三选一：
   - **内置**：`./gradlew assembleRelease` 重新打包 → 覆盖安装（内容写进 APK，卸了重装还在）。
   - **下发**：把 deck JSON 放进仓库根的 `decks/` 目录，手机端「设置 → 学习包 → 从电脑获取学习包」下载即可，不用重装 APK。
   - **直接导入**：把 JSON 发到手机，用「其他应用打开」选「题台」，或在「设置 → 学习包 → 从文件导入」里选文件。手机端会先做一遍结构体检（§6.2），不合格不入库。

---

## 6.2 手机端导入的体检范围

引擎不自带完整的校验器，但导入时会跑一遍**会导致崩溃或渲染错乱**的硬规则，等价于 §1 里带 MUST 的部分：

| 检查 | 对应错误码 |
|---|---|
| 是合法 JSON、`schema === 1`、`id` 匹配 `[A-Za-z0-9_-.]{1,64}`、有 `title` | `E_SCHEMA` `E_ID` `E_TITLE` |
| 模块有 `id`/`title`、id 不重复、至少一条自查点 | `E_GROUP_ID` `E_GROUP_TITLE` `E_CHECKS` `E_GROUP_DUP` |
| 自查点 id 派生规则 `group.id + "." + 序号`、`lvl` ∈ P0/P1/P2、`text` 非空 | `E_CHECK_PREFIX` `E_CHECK_LVL` `E_CHECK_TEXT` |
| 问答 id 形如 `q.模块.名字`、`m` 指向存在的模块、`layer` ∈ 1–4、`lvl` 合法 | `E_QA_ID_RE` `E_QA_M` `E_QA_LAYER` `E_QA_LVL` |
| `covers` 非空且指向存在的自查点、`next`/`peer` 指向存在的问答、不能自引用 | `E_COVER_REF` `E_QA_REF` `E_SELF_REF` |
| 答案四段：第一段必须是「结论」，段落非空、不含 HTML 标签 | `E_ANS_HEAD` `E_ANS_P` `E_ANS_HTML` |

覆盖率**不在**导入体检里——它只是 SHOULD，手机上不拦。

---

## 6.1 多学习包共存（v1.1 起）

引擎可以同时装着多个学习包，规则如下：

| 项 | 规则 |
|---|---|
| 存放位置 | 内置包在 `assets/decks/<id>.json`；导入包在应用私有目录 `decks/<id>.json` |
| 同名覆盖 | 同一个 `id` 时，导入包覆盖内置包（方便改内容而不动 APK） |
| 进度隔离 | 每个包一份 `states/<id>.json`，`m1.1` 只在它所属的包里成立 |
| 切换 | 设置页「学习包」列表，点「切换」；切换只改当前指针，不复制数据 |
| 删除 | 只有导入包能删（连同它的进度）；内置包删不掉 |
| 旧进度 | 升级到多包版本后，老的 `state.json` 会一次性迁移到内置包名下 |
| 同步 | 服务端进度同样按包分桶（`sync/states/<id>.json`），`pull`/`push` 只碰当前包 |

协议上不新增任何字段：`id` 仍然是唯一标识，只是现在可以有多个 `id` 同时存在。`/api/decks`、`/api/deck?id=` 只在电脑端 `tools/sync.js` 上提供，用于下发学习包；电脑端 `/a/?deck=<id>` 也按 `id` 选包。

---

## 7. 数学公式（v1.1 起）

公式写在**文本字段里**，不新增 JSON 字段，所以老引擎读到公式只会当成普通文本显示，不会崩。

### 7.1 标记

| 写法 | 含义 | 渲染结果 |
|---|---|---|
| `$…$` | 行内公式，跟在句子里 | 与文字同基线的小公式 |
| `$$…$$` | 块级公式，单独一行 | 独立块，上下留白，可横向滚动 |
| `\$` | 字面美元符 | 输出 `$` |

**反引号里的内容不解析公式**：`` `$Species` `` 就是属性名，不会去找配对的 `$`（UE5 包里真有这种属性名）。

能够使用公式的字段：`ans[].p`、`q`（问题）、`check.text`。`title`、`group.title`、`tags` 里不解析。

### 7.2 支持的命令

只支持**面试/教材级别**的子集，够用且能离线渲染（引擎用 `app/src/main/assets/math.js` 转成原生 MathML）：

- 结构：`\frac{}{}`、`\sqrt{}`、`\sqrt[n]{}`、`^{}`、`_{}`、`\left( \right)`、`\text{中文}`
- 大型运算符：`\sum`、`\prod`、`\int`、`\oint`，带上下限时排成上下夹
- 函数：`\log \ln \exp \sin \cos \tan \max \min \argmax`
- 希腊字母与常用符号：`\alpha … \omega`、`\Delta`、`\partial`、`\nabla`、`\cdot \times \pm \le \ge \ne \approx \infty \to \in \subset \cup \cap \forall \exists`
- 间距：`\,`、`\;`、`\quad`、`\qquad`

不支持的写法（如 `\begin{align}`、`\ce{}`、矩阵环境）会被**原样保留**成等宽文本，不会被吞掉；校验器会给一条 `W_MATH_CMD` 警告。

### 7.3 什么时候该用公式

| 场景 | 建议 |
|---|---|
| 真正的公式（分式、求和、上下标、根号、偏导） | 用 `$…$` / `$$…$$` |
| 单个符号（`≥`、`≈`、`±`、`×`、`σ`） | **保留 Unicode**，不要包 `$`，否则行文会碎 |
| 代码、类型名、API | 用反引号 `` `TArray` ``，不要用公式 |
| 一个段落里最多几块公式 | 一块 `$$…$$` 足够；整段都是公式说明该拆题 |

### 7.4 校验与降级

- `tools/validate-deck.js` 检查：`$`/`$$` 是否配对（`E_MATH_BALANCE`）、空公式（`E_MATH_EMPTY`）、花括号不配对（`E_MATH_BRACE`）、未知命令（`W_MATH_CMD`）。
- `tools/conformance.js` 会断言带公式的包渲染后 DOM 里出现 `<math>`，且没有 JS 异常。
- 引擎降级：WebView < Chromium 109 不支持 MathML Core，此时公式仍以源码文本显示（不丢内容）；也可以通过 `node tools/test-math.js` 单独验证转换器。

### 7.5 已知边界

- MathML Core 没有 `\begin{align}` 这类对齐环境，多行推导请拆成多块 `$$…$$`；
- 公式用数学字体（衬线斜体），和正文的 sans 不完全同形，这是 MathML 的默认排版；
- 块级公式放在段落中间会让后面的文字换行，所以约定放段末（见 §1.6）。

---

## 8. 跨包引用（v1.2 起）

学习包之间可以**互相指向**（引用式），但内容不合并：每个包仍然自带自己的模块、自查点、问答与进度。这样「数学基础」只写一遍，PCG 包和机器学习包都能指向它。

### 8.1 标识符

跨包引用靠 `deck.id` 做命名空间，所以 `id` 从“本机区分用”升级为**全局唯一标识符**：

| 规则 | 说明 |
|---|---|
| 语法 | `^[a-z0-9][a-z0-9-]{1,40}$`，全小写，不得含 `#`（`#` 是引用分隔符） |
| 唯一性 | SHOULD 全局唯一。建议写成 `作者-主题`，如 `ela-math`、`ue5-pcg`、`ml-intro` |
| 冲突 | 同一台设备上同 `id` 的两个包按「后导入者生效」处理（§6.1），跨包引用会跟着指向新内容——导入时引擎提示一次 |
| 不可变 | 包一旦发布过、被别人引用，`id` SHOULD NOT 再改；改 `id` 等于让所有外部引用失效 |

### 8.2 语法与可用字段

引用写成 `deckId#本地id`：

```json
"next":   ["q.m11.poisson", "ml-intro#q.m2.grad"],
"covers": ["m11.3", "ml-intro#m2.4"],
"seeAlso": ["ml-intro#q.m4.ce"]
```

| 字段 | 允许跨包 | 说明 |
|---|---|---|
| `qa.next` / `qa.peer` | 是 | 追问链、横向关联 |
| `qa.covers` | 是 | 这条问答顺带讲清了别的包的某个自查点 |
| `check.seeAlso` | 是 | 自查点视角的展开入口 |
| `qa.m`、`groups`、`tags`、`title` | **否** | 结构与文本，不解析 `#` |

约束：

- MUST NOT 引用自己的包（写裸 id 即可）→ `E_SELF_DECK_REF`；
- 列表内 MUST NOT 重复；
- `next`/`peer` 各 ≤ 3 条，`seeAlso` ≤ 2 条；
- 跨包引用**允许成环**（A↔B），导航靠返回栈收敛，不做环检测。

### 8.3 解析的三种状态

| 状态 | 判定 | 界面 |
|---|---|---|
| 已装 · 目标存在 | 目标包在本机且能找到该 id | 正常按钮，带包名徽标（`ml-intro`） |
| 已装 · 目标不存在 | 包在，id 已被删/改名 | 灰掉的“链接失效”，点了提示“目标已删除”，不跳转 |
| 未装 | 本机没有这个 `deck.id` | 虚线按钮“机器学习入门 · 未安装”，点了给一键去导入 |

协议要求：**失效链接必须可见**，MUST NOT 静默丢弃——否则作者不知道内容被谁引用过。

### 8.4 跳转与返回栈

- 跨包跳转 = **切换当前学习包**再打开目标条目（不是弹层叠加）。
- 引擎 MUST 记住来源 `{deck, id}`，在详情页顶部给出「← 返回 UE5 PCG」；返回时切回原包并恢复到原条目。
- 返回栈只有一层（从哪来回哪去），不做无限栈。

### 8.5 进度：默认只读

| 场景 | 规则 |
|---|---|
| 浏览别的包 | **只读**：可以看问答、看清单，但掌握度按钮不写数据 |
| 设置页开关「允许在关联包里打点」 | 默认关；打开后，在关联包详情里记掌握度会写进**那个包自己的** `states/<id>.json` |
| 被两个包的 `covers` 命中同一条自查点 | 统计时**两边各算一次**：每个包的覆盖率只看自己的自查点，但被跨包覆盖到的点也算“已覆盖”，并标注来源 |

进度写入一律 LWW（§2.1），跨包写同样遵循，不新建合并规则。

### 8.6 反向引用（本次实现）

引擎 SHOULD 显示“被谁引用”：本地 `backNext`/`backPeer` 由构建器算（§1.4），跨包部分在运行时汇总。

- **缓存**：跨包引用表按 `deck.id + 文件 mtime/size` 缓存，学习包新增/更新/删除时才重建；平时只查内存。
- 展示：详情页底部「被引用」区，跨包条目弱化显示（`ml-intro · 2 条`）。
- 上限：一屏最多列 5 条，其余折叠成“+N”。

### 8.7 校验

**硬规则（单包可判）**

| 规则 | 错误码 |
|---|---|
| `deckId` 段匹配 `^[a-z0-9][a-z0-9-]{1,40}$` | `E_CROSS_SYNTAX` |
| `#` 只能出现一次，且两侧非空 | `E_CROSS_SYNTAX` |
| `deckId` 不得等于本包 `id` | `E_SELF_DECK_REF` |
| 出现在 `m`/`tags` 等禁止字段 | `E_CROSS_REF_PLACE` |
| 列表重复、条数超限 | `E_REF_DUP` `E_REF_LIMIT` |

**软规则（目标包在场才能判）**

| 规则 | 级别 |
|---|---|
| 目标包已装但找不到该 id | `W_CROSS_MISSING` |
| 声明的 `deps[].id` 没装 | `W_DEP_MISSING` |
| 跨包环 | 仅报告，不告警 |

跨包检查用独立工具（可以一次传多个包）：

```bash
node tools/check-links.js dist/deck.json decks/ml-intro.json
# 本地 560 条 · 跨包 12 条（已解析 10 / 失效 1 / 未装 1）· 跨包环 1
```

### 8.8 兼容性

| 引擎 | 遇到 `deck#id` | 结果 |
|---|---|---|
| < 0.6.0 | 当普通 id 找，找不到 | 按钮点了提示“找不到”，不崩；内容不丢 |
| ≥ 0.6.0 | 按 §8.3 三级解析 | 正常 |

因为只是字符串里多一个分隔符、没有新必填字段，`schema` 保持 `1`。

### 8.9 可选字段 `deps`

```json
"deps": [{ "id": "ml-intro", "title": "机器学习入门 · 从数据到上线" }]
```

纯提示用：让“未安装”状态能显示人类可读的包名，并在设置页建议先导入。引擎 MUST NOT 因缺依赖而拒绝加载。

---

## 9. 学习计划（v1.3 起）

一个**计划**（plan）把多个知识包串成一条学习路径。它不复制内容，只引用 `deck.id`，所以：

- 包可以同时属于多个计划；
- 改包内容不需要改计划；
- 删包时计划不崩，只把缺失成员标灰。

### 9.1 文件与字段

计划文件是独立 JSON（`plans/<id>.plan.json` 或导入目录），与 `deck.json` 不同文件：

```json
{
  "schema": 1,
  "id": "ue5-ml",
  "title": "UE5 PCG 与机器学习",
  "subtitle": "一个计划装四个知识包：基础 → 视觉 → PCG → 机器学习",
  "members": ["cs-base", "cv-graphics", "ue5-pcg", "ml-intro"],
  "primary": "ue5-pcg"
}
```

| 字段 | 必填 | 含义 |
|---|---|---|
| `schema` | ✔ | 目前为 `1` |
| `id` | ✔ | 计划标识符，规则同 `deck.id`（小写字母数字连字符） |
| `title` | ✔ | 顶部标题 |
| `subtitle` | | 副标题 |
| `members` | ✔ | 有序成员：`deck.id` 数组；**顺序即学习顺序**，也决定列表里知识包分区的先后 |
| `primary` | | 默认打开哪个成员；缺省取 `members[0]` |

### 9.2 不变量

- `members` MUST 非空、无重复；
- `primary` 若存在 MUST 属于 `members`；
- 引擎 MUST 忽略不存在于本机的成员（不报错），并在设置页标注“未安装”。

### 9.3 引擎行为

1. **顶部**显示计划标题，下面一行 `知识包 chip 条`；
2. 同一计划内切包 MUST **不重载页面**，正文就地换索引与进度；
3. 列表主体按**知识包分区**（可展开/收起），只有当前包展开模块；**模块编号按包各自从 1 起**，不跨包连号；
4. 问答页提供**按知识包筛选**，默认勾选计划内全部知识包；
5. 进度、收藏、刷题记录仍然**按包**存（§2），计划层不合并计数。

### 9.4 命名（`terms`）

计划本身不带 `terms`；界面名词取**当前包**的 `terms`。所以同一个 App 里可以有“模块/知识点”和“章节/自查点”两套说法同时存在。

### 9.5 校验

```bash
node tools/validate-plan.js plans/ue5-ml.plan.json
node tools/validate-plan.js plans/*.plan.json --decks decks     # 连成员是否可解析一起查
```

`schema/plan.schema.json` 是机器可读版本。

---

## 10. 掌握度同步（v1.3 起）

同一条问答可以覆盖多个自查点（§1.7），这些自查点可以在不同包里。用户点亮其中一个，默认希望“这条我会了”。

### 10.1 规则

- 一条问答的所有**本地** `covers` 目标共享掌握度（本来就在同一个包里，之前也是这么做的）；
- 跨包 `covers`（`deck#id`）目标也同步，**前提是那些包已安装**；
- 同步写入对方包的 `state.json`：`checks[id] = {m, t}`，同时 `rev++`、`touched = now`；
- 冲突用时间戳决胜（§2.3 LWW），所以两边都会留下自己的 `t`；
- 引擎 MUST NOT 因此改写对方包的**内容**（`deck.json` 只读）。

### 10.2 边界

| 情况 | 行为 |
|---|---|
| 目标包未安装 | 跳过，不报错 |
| 目标自查点已被删（失效引用） | 跳过 |
| 跨包会话处于“只读” | 仍按 §10.1 同步（只读限制的是“在别人包里打点”，不是“自己的点传染过去”） |

### 10.3 为什么要写两份

计划里的知识包是**独立文件**（可能分批导入、可能单独备份）。写两份让任何一份单独拿出来都自带掌握度，不需要“先找它的兄弟包”。

---

## 附录 A：字段速查

```
deck
├─ schema:int  id:str  title:str  subtitle?:str  accent?:str  updatedAt?:str
├─ terms?:  {group?:str, check?:str, qa?:str}         # 界面名词，缺省 模块/知识点/问答
├─ deps?:   [ {id, title?} ]                          # v1.2 可选：声明引用了哪些包
├─ groups: [ { id, title, short?, priority, stage:1..4, signal?, keypoints?[], traps?,
│             checks:[ {id, text, lvl, seeAlso?[]} ] } ]
└─ qas:    [ { id, m, lvl, layer:1..4, q, tags?[], covers[], next?[], peer?[], ans:[ {h, p} ], backNext†, backPeer† } ]

跨包引用（v1.2）：任意 covers/next/peer/seeAlso 元素可写成 "deckId#本地id"
state
├─ v:int  deck:str  rev:int  touched:int
├─ checks: {checkId: {m:0..3, t:int}}
├─ fav:    {id: {on:bool, t:int}}
├─ quiz:   {qaId: {ok:int, no:int, t:int}}
├─ settings: {theme, tab, crossWrite?}
└─ sync:   {host, code}

† 构建器生成，只读
```
