# @local/running-sessions-float

在 DSH Web GUI 的左下角浮一块「进行中」坞：把**正在跑**和**卡在等你处理**的会话收成一张小列表，点一行就把主视图切过去；没有这类会话时收成一条细条，只留「暂无进行中」。

官方侧栏本来就会在会话行上标运行状态点（`StateDot`）和待处理状态，但那些行分散在各个工作区分组里 —— 组一折叠就看不见，要判断「现在有几个会话在等我」得逐个展开找。

这个坞不新增数据源，只做聚合：复用同一套标准 Hook（`useSessions` / `useSessionStatus`），筛出 running 或 pending 的会话，按最近更新时间排，固定在侧栏左下。它不轮询、不落盘、没有 Host 状态，也不改任何会话。

| 想知道 | 看 |
|---|---|
| 怎么装、怎么用、怎么排错 | 本文件 |
| 为什么这么实现（overlay 取舍、过滤规则、空态、locale 降级） | [IMPLEMENTATION.md](IMPLEMENTATION.md) |
| 给 agent 的约束、命令、改动连带项 | [AGENTS.md](AGENTS.md) |

本仓库是 DSH 独立插件仓库，当前只有这一个插件；包体在 `running-sessions-float/` 子目录，**仓库根不是包**。

## 功能列表

| 能力 | 说明 |
|---|---|
| 进行中聚合 | `running === true` 的会话进坞，行尾「运行中」 |
| 待处理聚合 | 有 `pendingInteraction` 的会话进坞，按类型显示「等待审批 / 计划待审 / 等待回答」；待处理优先于运行中 |
| 一键切换 | 点行调用 `uiWorkspace.openSession`，主视图切到该会话 |
| 计数徽标 | 坞头右侧显示当前行数 |
| 空态细条 | 无进行中会话时收成圆角细条，灰点静止，不显示计数 |
| 中英双语 | 内置 zh / en 两套文案，跟随界面语言；locale 服务缺失时回落中文 |
| 仅 Web 客户端 | `dsh.client.platform: web`；headless 等没有 Web 客户端的 profile 不加载它 |
| 不占布局 | 注册在 `shell.overlay`（框架级浮层），不挤压侧栏或主区 |
| 键盘可达 | 每行是 `<button>`，可 Tab 聚焦，Enter / Space 触发，`:focus-visible` 有品牌色描边 |

**不提供**：停止运行、回答提问 / 批准审批、归档过滤、设置项 / 开关。那些动作属于官方浮层，坞刻意不复制第二套交互。

## 快速开始

三件事：装插件 → 用起来 → 确认它真的在工作。

### 1. 装插件

三种装法，任选一种。**target 必须指到插件子目录 `running-sessions-float/`，不能指仓库根** —— 根目录没有 `package.json`，装到那一步会失败。

#### 方式一：Web 插件页（推荐）

DSH Web → 左侧栏 **插件** → **添加插件** → 填插件子目录的绝对路径（在仓库根执行 `realpath running-sessions-float`）→ **安装** → 装完点 **立即启用**。

- 只装不启用 = 装着但没生效。
- 「设置 → 内置插件」是只读清单，不能在这里装。

#### 方式二：命令行 · 本地目录（开发）

```bash
# 在仓库根执行；--profile 必填，web 换成你要装进的 profile
dsh plugin --profile web add "link:$(realpath running-sessions-float)"
```

`dsh plugin --profile <name> <pnpm args>` 把参数转发给该 profile 目录里的 pnpm。`link:` 装的是**软链**：改仓库里的 `client.js`，客户端半边会在一两秒内换新（见「生效条件」）。

这条命令要写 profile 目录，在宿主 shell 里跑；受限的 Agent 沙箱通常写不了 `~/.dsh`。

#### 方式三：让 Agent 用插件管理器

```text
action: install_bundle
target: link:<仓库绝对路径>/running-sessions-float
```

`install_bundle` 的 `target` 就是 pnpm 的安装 spec；本地目录给绝对路径或 `link:` 都行。这个动作需要 **danger-full-access** 批准（它会改 profile、装包、可能跑安装脚本）。返回里 `application` 为 `applied` 才算当场生效；`restart-required` 表示这个 profile 在启动时装配，要重启 Harness。

#### 装法四条坑

1. **`--profile` 必填** —— 不写直接报 `required option '--profile <name>'`；例如 `--profile web`。
2. **只装不启用 = 装了不挂载** —— GUI 里装完还要点「立即启用」；命令行装完用「装完确认」的 `--dump-config` 看装配行在不在。
3. **git spec 必须带 `github:` / `git+` 前缀**，`git@github.com:...` 这种 scp 写法会被 pnpm 当成本地路径。但**本仓库就算前缀写对也装不了**：包在子目录、仓库根没有 `package.json`，没有可用的 git 直装路径。仓库地址 `https://github.com/dongasai/running-sessions-float.git` 只用于 clone。
4. **钉版本只能「克隆 + checkout tag」** —— tag `0.1` 真实存在、对应 `0.1.0`；但 `#0.1` 这种 URL 钉法要求仓库根就是包，本仓库不满足。正确做法：`git clone` → `git checkout 0.1` → 按方式一 / 方式三 `link:` 子目录。

本仓库当前版本是 **`0.1.0`**（`running-sessions-float/package.json`）。本包 `private: true`、未发布 npm，所以也没有「按包名从 registry 装」这条路；`package.json` 里没有声明任何 DSH peer 依赖，不会触发版本兼容闸。

### 2. 用起来

装完等一两秒 —— 客户端半边在启动时加载，Web 组合会通过 `client-hmr` 把新模块推给页面；没出现就刷新一次页面。左下角出现坞：

1. 有进行中 / 待处理会话时，坞头是「进行中」+ 计数徽标，下面一行一个会话：左边标题、右边状态。
2. 行按会话的 `updatedAt` **从新到旧**排；刚发过消息的会话在最上面。
3. **点一行**：主视图切到那个会话（不是开新页签）。悬停有提示「打开这个会话 — 标题」。
4. 没有这样的会话时：坞收成一条细条，文字「暂无进行中」，绿点变灰点、停止脉冲。
5. 行多了列表在坞内滚动（坞最高 `min(46vh, 380px)`）。

### 3. 确认它真的在工作

- 插件页「已安装」列表里出现 **进行中会话悬浮坞**（英文界面：**Running Sessions Dock**）。
- 装配层认得它：`dsh --profile web --dump-config` 里能查到装配行（命令与期望输出见下）。
- 在另一个会话发一条要跑一会儿的消息，回到当前会话：坞里应多出一行「运行中」，计数 +1。
- 点那一行：主视图切过去。
- 让某个会话卡在审批上（例如让它执行一条需要确认的命令）：行尾应变成「等待审批」。
- 把所有会话停下来：坞应收成「暂无进行中」细条。

装配层核对（宿主 shell，只读，不启动服务）：

```bash
dsh --profile web --dump-config | grep -A1 running-sessions-float
```

期望输出：

```yaml
- id: running-sessions-float
  name: '@local/running-sessions-float'
```

运行中的实例要重启才会加载新装的插件（插件行在启动时合成）。

看不到坞时按「排错」表逐条对。

### 4. 卸载

Web 插件页：停用这个插件 → 移除。或让 Agent 执行：

```text
action: remove_bundle
target: @local/running-sessions-float
```

`remove_bundle` 会先取消 bundle 选中、再删包。**不要只跑 `pnpm remove`**：依赖没了、`dsh.profile.bundles` 里的选中项还在，下次装配会解析不到这个包。

## 界面长什么样

```text
侧栏（默认 280px，最窄 264px）
┌────────────────────────────┐
│ 工作区 A                   │
│  · 会话 1                  │
│ 工作区 B                   │
│  · 会话 2                  │
│  · 会话 3                  │
│                            │
│  ┌──────────────────────┐  │ ← 坞：左下 10px / 距底 76px
│  │ 进行中             2 │  │     最宽 252px，最高 380px
│  │ 会话 2        运行中 │  │     列表在坞内滚动
│  │ 会话 3      等待审批 │  │
│  └──────────────────────┘  │
└────────────────────────────┘
```

逐块说明：

- **坞头**：状态点 + 标题 + 计数。有内容时绿点脉冲（1.8s 循环）；空态灰点静止。
- **行**：整行是一个按钮。标题单行省略，状态文字不换行、右对齐。
- **状态色**：运行中用 `--dsw-alias-state-success-primary`；待处理用 `--dsw-alias-state-warn-primary`；其余文字 / 边框 / 背景都走主题 token，明暗主题都跟随。
- **空态**：`padding: 3px 10px`、圆角 999px、背景 `bg-layer-1`，文字 11px 次级色。
- **位置**：`position: fixed; left: 10px; bottom: 76px`。252 + 10 = 262，正好落在侧栏最小宽度 264 内；但它是固定定位，不是侧栏的子节点 —— **不跟着侧栏宽度走**。
- **点击范围**：overlay 层本身 `pointer-events: none`，坞恢复 `auto`；只有坞的矩形会吃掉点击，矩形外的内容照常可点，但被坞盖住的那块点不到。

## 它怎么判断「进行中」

会话目录与运行状态都来自框架标准 Hook，插件自己不做任何请求：

| 条件 | 是否进坞 | 行尾状态 |
|---|---|---|
| 有 `pendingInteraction` | 是 | 按 kind 归类（见下表），优先于运行中 |
| `running === true` 且无待处理 | 是 | 运行中 |
| `blank === true`（新建但还没发消息） | 否 | — |
| `origin === 'subagent'` | 否 | — |
| 其余空闲会话 | 否 | — |

- `running` 优先取状态快照；状态里没有这个字段（或没有该会话的状态）时，退回列表快照的 `summary.running`。
- `kind` 是各域自己定的字符串，插件只做**大小写无关的包含匹配**：

| kind 实际值 | 坞里显示 |
|---|---|
| `approval` | 等待审批 |
| `permission`（当前没有发布者，兼容用） | 等待审批 |
| `plan-review` | 计划待审 |
| `question` | 等待回答 |
| 其它 / 未知 | 等待回答 |

官方目前会发布 `approval`、`plan-review`、`question` 三种；未知 kind 不会让会话消失，统一落到「等待回答」。

## 生效条件（客户端半边）

本插件 **Host 半边是空的**（`index.js` 只有一个空 `apply()`），没有 Host 状态、路由或配置，所以不存在「Host 改了要重启」的问题；所有行为都在浏览器半边。

- 装的是 `link:`，改 `client.js`：Web 组合里的 `client-hmr` 每 500ms 轮询 bundle 文件的 mtime / ctime / size，变了就换新 revision 并通过 `/plugins/events` 推给浏览器；通常一两秒内自动换新，不用刷新。没换再刷新页面。
- 部署没挂 `client-hmr`：Host 内存里还是旧字节，**刷新页面也不够** —— 重新安装或重启 Harness 才会重读。
- 装的是副本（git / tarball / npm）：改仓库代码不影响已装副本 → **重新安装**。
- 改 `package.json` 的 `dsh.client` / `dsh.bundle` 字段：需要重新装配（重新安装或重启对应 profile）。

## 结构

```text
running-sessions-float/                 ← 仓库根（不是包）
├─ README.md
├─ IMPLEMENTATION.md
├─ AGENTS.md
├─ test/smoke.mjs                       ← 无 DOM 冒烟 + 包契约（21 项）
├─ .agents/index.json                   ← 架构扫描状态：模块清单 / 覆盖率 / 缺口
└─ running-sessions-float/              ← 包体（安装 target）
   ├─ package.json                      # name / version / exports / files / dsh.bundle + dsh.client
   ├─ cordis.patch.yml                  # insert 一行插件入口
   ├─ index.js                          # Host 半边：export function apply() {}（8 行）
   ├─ client.js                         # 浏览器半边：CSS + 组件 + slot 注册（318 行）
   ├─ locale/en.json                    # 插件页元数据（meta.title / meta.description）
   ├─ locale/zh.json                    # 同上，中文
   ├─ AGENTS.md                         # 模块级文档（职责 / 接口 / 数据形状 / FAQ）
   └─ icon.svg                          # 插件图标
```

| 文件 | 行数 | 作用 |
|---|---:|---|
| `running-sessions-float/package.json` | 32 | 包声明：`dsh.bundle.patch` 指向 patch，`dsh.client` 声明 web 平台、启动即加载、依赖 session UI 包 |
| `running-sessions-float/cordis.patch.yml` | 3 | `insert` 一行 `running-sessions-float` → `@local/running-sessions-float` |
| `running-sessions-float/index.js` | 8 | Host 半边，空 `apply()`；不提供服务、不注册工具、不挂路由 |
| `running-sessions-float/client.js` | 318 | 浏览器半边：样式、组件、locale 注册、`shell.overlay` 注册 |
| `running-sessions-float/locale/*.json` | 6 × 2 | 只给插件页的标题 / 描述；界面文案在 `client.js` 的 `DICTS` 里 |
| `running-sessions-float/icon.svg` | 11 | 插件图标 |
| `AGENTS.md` | — | 给 agent 的命令、硬约束与改动连带项 |
| `test/smoke.mjs` | 209 | 无 DOM 组件冒烟 + 包契约（21 项） |

### 两侧注入

- **Host**：无 `inject`。`index.js` 只导出 `apply()`，不依赖任何 Host 服务。
- **Client**（`client.js` 模块返回）：`inject: ['slots']`；`apply(ctx)` 里 `ctx.get('locale')`、`ctx.get('uiWorkspace')`、`ctx.slots.inject('shell.overlay', ...)`。
- **加载顺序**（`package.json` → `dsh.client.inject`）：`@deepseek-ai/dsh-client-ui-session` —— 它提供 `useSessions` / `useSessionStatus` 这两个全局标准 props，必须排在它之后激活。
- **启动加载**：`immediately: true`，启动时就加载，不等打开某个面板。

### 扩展点占用表

| 扩展点 | 类型 | id / 命名空间 | order | priority | patterns | 条件 | 说明 |
|---|---|---|---:|---|---|---|---|
| `shell.overlay` | list 槽位 | `running-sessions-float` | 60 | 未设 | 无（该槽没有 patterns） | 无条件 | 唯一 UI 注册；list 槽按 priority → order 升序渲染 |
| locale | 字典命名空间 | `local.runningSessions` | — | — | — | locale 服务存在时 | 注册 en / zh 各 7 个 key；不在时用内置中文 |
| `uiWorkspace` | 可选服务 | — | — | — | — | 存在时 | 点击行时调用 `openSession`；缺失则点击无动作 |

不占 `sidebar` / `sidebar.workspaces.*` / `composer.*` 等其它槽位；`shell.overlay` 是本插件唯一的 UI 注册。

## 安全模型

- 没有 Host 路由、没有工具、没有文件读写、没有网络请求；只订阅两个官方 Hook 并读它们的快照。
- 没有 npm 依赖（`package.json` 无 `dependencies`），不加载外部资源；样式、文案、图标都在包内。
- 没有持久化：不写 localStorage、不写状态文件，坞的内容全部来自官方快照。
- 安装动作本身要写 profile（`plugin_manager` 路径需要 danger-full-access 批准）；插件运行时不要求额外权限。

边界说明：**这不是权限隔离**。坞只是把当前用户本来就能在侧栏看到的会话状态聚合到一块；能打开这个 Web GUI 的本机用户，本来就能看到同样的信息。插件没有扩大任何能力，也没有新增数据出口。

## 与 Agent 的关系

- 不注册工具、不注入提示，Agent 侧看不到这个坞，也不会因为装了它改变行为。
- 坞里显示的就是 Agent 的运行状态（`running` / `pendingInteraction`），只读展示，不参与调度。
- 点行只切换视图，不会向会话发消息、不会批准审批、不会回答提问 —— 那些动作仍在官方浮层里由人完成。

## 排错

| 现象 | 原因 | 处理 |
|---|---|---|
| 插件页装不上，报 `not-bundle` 或找不到 manifest | target 指到仓库根 | 指到 `running-sessions-float/running-sessions-float` |
| 装完界面没变化 | 只装没启用 / profile 启动时装配 | 插件页点「立即启用」；`application: restart-required` 时重启 Harness |
| 坞没出现，插件却是启用状态 | 页面还是旧模块代次 / 推送还没到 | 等一两秒；刷新页面；仍无则重启 Harness（无 `client-hmr` 的部署） |
| 坞一直「暂无进行中」 | 没有 running / pending 的会话；或它们都是空白 / subagent 会话（被过滤） | 去另一个会话发一条消息；确认不是刚建的空会话 |
| 点行没反应 | 部署里没有 `uiWorkspace`（无工作区 UI），或会话已删 | 属于降级行为；换有工作区的部署 |
| 改了 `client.js` 没变化 | 装的是副本，或部署没挂 `client-hmr` | `link:` 装等推送，没挂就重启 Harness；副本重新安装 |
| 文案不跟随界面语言 | locale 服务不可用，回落中文 | 检查界面语言设置；locale 服务由官方加载 |
| 坞盖住列表靠下的行 | 固定定位，浮在列表上方 | 已知边界；把列表往上滚，避开被盖住的行 |
| 卸载后仍被装配 | 只跑了 `pnpm remove`，没取消 bundle 选中 | 从插件页卸载，或用 `plugin_manager` 的 `remove_bundle`（先取消选中再删包） |
| 按 `#0.1` 装不出来，或装到旧代码 | 包在子目录，URL 钉版本要求仓库根就是包；`#` 只对能直装的仓库有效 | 克隆后 `git checkout 0.1`，再 `link:` 子目录（见「装法四条坑」第 4 条） |
| 坞里的行数比侧栏会话少 | 空白会话与 subagent 会话被刻意过滤 | 预期行为；去侧栏对应工作区看它们 |
| 改了 `locale/*.json` 文案没变 | 那两份只放插件页 meta，坞内文案在 `client.js` 的 `DICTS` | 改 `DICTS` 后重新装；插件页 meta 要重新装配才刷新 |

## 怎么验证

### 命令行能覆盖的部分

```bash
# 1) 语法
node --check running-sessions-float/client.js
node --check running-sessions-float/index.js

# 2) 包声明与 patch
node -e '
const fs = require("fs");
const dir = "running-sessions-float";
const pkg = JSON.parse(fs.readFileSync(dir + "/package.json", "utf8"));
console.log(pkg.name, pkg.version);
console.log(pkg.dsh.bundle.patch, pkg.dsh.client.inject);
'
# 预期：@local/running-sessions-float 0.1.0
#       ./cordis.patch.yml [ '@deepseek-ai/dsh-client-ui-session' ]

# 3) 组件行为 + 包契约（无 DOM，21 项）
node test/smoke.mjs
# 预期：21 行 PASS + ALL PASS
```

`test/smoke.mjs` 用 Node 的 `vm` 加载 `client.js`，用 React 桩渲染组件，覆盖 **15 项行为**：过滤（blank / subagent / 空闲）、排序、四种行状态、计数徽标、空态、点击转发、locale 回落、无 `openSession` 时不抛异常、en 字典注册；另加 **6 项包契约**：client id 与包名一致、patch 行指向本包、`files` 含运行文件、zh / en 字典键完全一致、源码里每个 `t('key')` 两本字典都有、client bundle 只 `require('react')`。15 + 6 = 21，与 `node test/smoke.mjs` 的 PASS 行数一致。样式与真实布局只能在浏览器看，见下一节。

### 只能在浏览器里看的（逐条打勾）

- [ ] 左下角出现坞；有进行中会话时标题「进行中」，右侧有数字徽标。
- [ ] 行按最近更新时间排，刚发过消息的在最上面。
- [ ] 行标题过长显示省略号，不换行、不撑宽坞。
- [ ] 运行中行尾是绿色「运行中」；待处理是橙色。
- [ ] 点一行，主视图切到该会话；悬停提示「打开这个会话 — 标题」。
- [ ] 没有进行中会话时收成细条，文字「暂无进行中」，点为灰色且不动。
- [ ] 切换界面语言（中 / 英）：标题、状态、空态文案都跟着变。
- [ ] 切明暗主题：边框、背景、文字都跟随，没有写死颜色。
- [ ] Tab 能聚焦到行，聚焦时有品牌色描边，Enter / Space 能打开。
- [ ] 侧栏拖宽 / 收窄：坞位置不变（固定 10px / 76px）—— 这是预期。
- [ ] 侧栏折叠：坞仍留在最左侧，会盖到主内容上 —— 已知边界，不是故障。
- [ ] 让一个会话停在审批 / 计划审阅 / 提问上：行尾分别显示「等待审批 / 计划待审 / 等待回答」。
- [ ] 新建一个空白会话（不发消息）：它不出现在坞里。
- [ ] 启动一个 subagent：它不出现在坞里。
- [ ] 行数很多时：列表在坞内滚动，坞不超过 380px / 46vh。

## 已知边界

每条都带原因与代价；没解决之前不要从文档里删。

- **固定定位，不跟侧栏走**：`left: 10px; bottom: 76px` 是写死的。代价：侧栏折叠（Web 下窄到 56px，桌面端为 0）时坞会压在主内容左下角；侧栏拉宽到 420px 时坞仍只占左边 262px。官方若改侧栏底部高度或最小宽度，需要同步改 CSS。
- **盖住列表下半段**：坞是浮层，占的是列表靠下的一块（底边距视口 76px，最高 380px）。代价：会话多、坞展开时，靠下的几行被完全盖住，要把列表往上滚才能点到。空态细条把这块压到最小。
- **只做导航**：点行只切换会话，不能停止运行、不能回答提问 / 审批。那些动作在官方浮层里；坞刻意不复制第二套交互。
- **不显示「完成未读」**：`completionUnread` 字段没有用上。代价：会话刚跑完就从坞里消失，错过「刚结束」的提醒 —— 那是官方侧栏的职责。
- **不显示 subagent**：`origin === 'subagent'` 被过滤。代价：子代理在跑什么，得进主会话看；换来的是一个任务不会在坞里裂成多行。
- **不显示空白会话**：`blank === true` 被过滤。代价：刚新建、还没发消息的会话不出现在坞里（它本来也不算「进行中」）。
- **排序只看 `updatedAt`**：不跟随侧栏的固定 / 手动排序。代价：长时间不写消息的旧会话可能排在刚启动的会话后面。
- **待处理文案是归类，不是官方原文**：`kind` 做包含匹配，未知 kind 落到「等待回答」。代价：将来新增的交互类型会显示成「等待回答」，需要回来补映射。
- **没有设置项**：没有开关、位置、透明度、快捷键。装了就一直在；不想看只能卸载。改这些要改 `client.js` 的 CSS 常量。
- **界面文案在代码里**：`locale/*.json` 只管插件页标题 / 描述；坞里的 7 个 key 在 `client.js` 的 `DICTS`。代价：加语言要改代码并重新装。
- **不读归档 / 固定状态**：只按 running / pending 筛。代价：若某会话归档后仍带运行状态，坞不会隐藏它 —— 这时它会和侧栏的归档视图不一致。

## 相关文件

| 文件 | 关系 |
|---|---|
| [README.md](README.md) | 本文件：怎么装、怎么用、怎么排错、怎么验证 |
| [IMPLEMENTATION.md](IMPLEMENTATION.md) | 为什么这么实现：overlay 取舍、过滤规则、空态、locale 降级、生效路径 |
| [AGENTS.md](AGENTS.md) | 给 agent 的：命令、硬约束、改动连带项 |
| [running-sessions-float/AGENTS.md](running-sessions-float/AGENTS.md) | 给 agent 的模块级细节：职责、接口契约、数据形状、FAQ |
| [client.js](running-sessions-float/client.js) | 浏览器半边：样式、组件、slot 注册 |
| [index.js](running-sessions-float/index.js) | Host 半边（空 `apply()`） |
| [package.json](running-sessions-float/package.json) | 包声明：bundle patch + client 声明 |
| [cordis.patch.yml](running-sessions-float/cordis.patch.yml) | 装配行 |
| [test/smoke.mjs](test/smoke.mjs) | 无 DOM 冒烟 + 包契约（21 项） |
