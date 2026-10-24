# cortico-world-figure-persona

给 Coopanion 的桌宠形象接上人格。**换外观不等于换人格** —— 这个 World 让「谁在说话」和「它长什么样」可以分别设置、由同一次点击对齐。

它只往系统前缀的环境段注入文本：不动形象包的美术，不执行形象包的代码，不写 `CONSTITUTION.md`。

## 它接的是哪一段

Coopanion 里跟「我是谁」有关的东西分三层，本包只接中间一层：

| 层 | 存在哪 | 谁管 |
|---|---|---|
| 长什么样、有什么动作 | 形象包 `<data>/figures/<id>/`（`figure.json` + 美术资源） | 装扮页 / 形象包作者 |
| 用这个形象时怎么说话 | 同一个 `figure.json` 里的 `persona` 字段 | 本包（读，面板可写） |
| 你本身是谁 | 工作区 `CONSTITUTION.md` | 开发者自己 |

所以换形象带来的语气变化是可逆的、跟着形象走的；真要改「你是谁」，仍然只有 `CONSTITUTION.md` 一条路。

## 工作边界

- 不写 `CONSTITUTION.md`、`PARTNER.md` 或任何工作区人设文件。
- 不改 `worlds.desktop-pet.skin.figure`：Cortico 没给扩展留这个接口，外观仍由装扮页决定。
- 不执行形象包里的代码。形象包的脚本跑在沙箱 frame 里，本 World 只读它的 `figure.json`。
- 读不到形象或人格时不抛错：没有配置给空串，形象包缺失时名字退回 id，人格缺失时用缺省文案兜底。前缀渲染抛错会连累整个会话。
- 只在环境段注入，不接管人设。

## 它读什么

| 值 | 来源 |
|---|---|
| 当前形象 id | 部署 `config.json` 的 `worlds."desktop-pet".skin.figure`；配置项 `figure` 非空时用它 |
| 形象显示名 | `<dataDir>/figures/<id>/figure.json` 的 `name`；没有时退回 id |
| 人格正文 | 同一份 `figure.json` 里 `persona` 字段（配置项 `field` 可改字段名） |

`persona` 可以是字符串，也可以是对象。对象形式先认 `text` / `about` / `prompt`，再认语言键：界面语言是简体中文时取 `zh`，`en` 次之，最后取第一个非空字符串 —— 所以 `{ "zh": "…", "en": "…" }` 直接可用。

`figure.json` 里不认识的顶层字段会被 Coopanion 与这个 World 一并忽略，所以给形象包加 `persona` 不需要改 Coopanion，也不影响旧版本读取。

## 环境段长什么样

`src/ENV_PROMPT.md`：

```text
你现在的外形是「{{figure_persona.name}}」(形象包 id:{{figure_persona.figure}})。外形只说明你此刻的样子,不改变你是谁。
{{figure_persona.persona | 这个形象包没有携带人格文本,保持你原本的人设即可。}}
```

形象包没带人格时整段保留前半句，后半句用缺省文案兜底 —— 不抛错，也不影响其他 World 的段落。

模板可覆盖，不用改包源码（升级不丢）：在部署目录放 `<botDir>/worlds/figure-persona/ENV_PROMPT.md`。
优先级：部署覆盖 > 包目录里的 `worlds/figure-persona/ENV_PROMPT.md` > 本包 `src/ENV_PROMPT.md`。

## 配置项

| 路径 | 默认 | 作用 |
|---|---|---|
| `worlds.figure-persona.enabled` | `false` | 挂载开关。Coopanion 只声明它自带的三个 World，新装的扩展 World 默认关 |
| `worlds.figure-persona.field` | `persona` | 人格正文在 `figure.json` 里的字段名 |
| `worlds.figure-persona.figure` | 空 | 固定用某个形象包；留空时跟随宿主正在显示的那个 |

三项都带 `x-hot`，在配置页改完即时进内存，不用重启。

## 图形面板：选形象、改人格、一次点击生效

入口：`http://127.0.0.1:<web 端口>`（本机 17788）→ 左侧「World 总览」→「形象人格」→「详情」→ 页签「形象与人格」。
也可以直接开 `http://127.0.0.1:<web 端口>/#/provider/world:figure-persona`。

页面上只有三样：

1. **形象** —— 下拉列出 `<data>/figures/` 下所有已装形象，外加内置的 Coo / Whale（带「(内置)」后缀）。换选项时，这个形象的人格文本会被填进编辑框。
2. **人格文本** —— 多行编辑框，内容就是 `figure.json` 的 `persona`。
3. **确定并生效** —— 一次点击做四件事：写回 `figure.json`（第一次写留一份 `figure.json.bak-cortina`）、把 `worlds.figure-persona.figure` 锁到选中形象、重启本 World、重载系统前缀。

**下一句话就按新的人格说**，不用重启 Coopanion，也不用再点「↻ 重载系统前缀」。

两个例外：

- **桌面外观不会跟着变。** Cortico 没给扩展改 `skin.figure` 的接口。想让外观和人格一起换：先在装扮页换形象，再回面板下拉里选同一个，点确定。回执会提示这一点。
- **选内置 Coo / Whale 不落盘。** 它们没有 `<data>/figures/<id>/figure.json`，只会用到缺省文案。

面板走与其他 WebUI 面板同一条 RPC，脚本调试可直接调：

```bash
# 读当前状态（选项、当前人格、正在显示的是哪个）
curl -s -X POST "http://127.0.0.1:17788/api/webui/providers/world%3Afigure-persona/panels/figure-persona/state" \
  -H "content-type: application/json" -d "{\"args\":[]}"

# 一键写回并生效
curl -s -X POST "http://127.0.0.1:17788/api/webui/providers/world%3Afigure-persona/panels/figure-persona/apply" \
  -H "content-type: application/json" -d "{\"args\":[{\"figure\":\"gpt-niang\",\"persona\":\"说话短一点。\"}]}"
```

## 装到 Coopanion 上

扩展目录是 `<data>/extensions`，**不是**程序目录 —— 实例把 data 目录当作 Cortico 的检出根
（本机实测 `C:\Users\rog\AppData\Local\Programs\Coopanion\data\extensions`，可用 `CORTICO_EXTENSIONS_DIR` 改）。
装之前先看运行中实例 `GET /api/extensions` 返回的 `dir` 字段，以它为准，别按源码注释猜路径。

两种装法：

1. WebUI「扩展」页 → 手动安装 → 选本机目录，指到这个包（link 方式，改源码后重启生效）。
2. 命令行：`cd <该目录> && corepack pnpm add <本包绝对路径>`。

装完把部署 `config.json` 里 `worlds.figure-persona.enabled` 设成 `true`（或在 World 总览页点「激活 World」），重启进程。

## 手工路径（不用面板时）

1. **给形象写人格** —— 打开 `<data>/figures/<id>/figure.json`，加一个 `persona` 字段：

```json
"persona": "说话像朋友,不像客服:能短就短,一次一两句;不懂就说不懂,不装懂。"
```

2. **换形象** —— 在装扮页换。`figure` 留空时，下一次前缀重建就读新形象的 `figure.json`。

3. **让当前会话读到新内容** —— World 总览 →「形象人格」→「↻ 重载系统前缀」。不点也行，但要等上下文交接或重开会话：普通对话轮次不会重算前缀。

### 怎么确认生效

- World 总览的「形象人格」卡片直接显示当前渲染出来的环境段。
- `GET http://127.0.0.1:<web 端口>/api/prompts/prefix`，找 `ENVIRONMENT · figure-persona` 那一段。
- 问桌宠「你现在是什么形象」，它会调 `figure_persona_current`。

## 工具与事件

- `figure_persona_current`：报当前形象、人格取自哪个字段、共多少字。不改任何文件。
- `figure_persona.mounted`：挂载时投一条，说明读到了什么。

## 验证到哪一级

分层给证，互不替代：

| 层 | 做了什么 | 能证明 | 不能证明 |
|---|---|---|---|
| 静态 | `pnpm typecheck` 干净，`pnpm test` 16 项全绿 | 代码自洽、边界行为符合预期 | 宿主里跑得起来 |
| 契约 | `pnpm describe:extension` / `check:extension` 通过（`panels: 1, config groups: 1, prompt docs: 1`） | 包形状合 Cortico 规范 | 行为与观感 |
| 运行时 | 装进 Coopanion 0.2.8 并启用后，`/api/prompts/prefix` 的分段里出现 `ENVIRONMENT · figure-persona`（153 字符） | 这段真的进了系统前缀 | 文案是否合适 |
| 交互 | headless Chrome 打开面板，点「确定并生效」拿到回执；落盘 `figure.json` 与备份只差 `persona` 一个键 | 一键链路通、写入面收敛 | 美术与人设层面的验收 |

```bash
corepack pnpm install
corepack pnpm build        # 生成 dist/webui.js（面板的浏览器产物，不进 git）
corepack pnpm typecheck
corepack pnpm test         # 16 项：干装载、读宿主形象、语言对象取值、配置覆盖、缺包兜底、模板渲染、兜底文案、工具回执、挂载事件、面板 state/apply 五项
```

在 Cortico 检出根下再跑官方两项（都要过）：

```bash
corepack pnpm describe:extension <本包目录>
corepack pnpm check:extension <本包目录>
```

发布前 `prepublishOnly` 会自动 `pnpm build`；`files` 白名单带 `dist/`，`.gitignore` 忽略它。

**自检通过不等于验收。** 本包当前状态：可试用，待开发者验收 —— 面板文案与默认 persona 措辞都还可以改。

## 实测记录（2026-10-24，Coopanion 0.2.8）

`GET /api/prompts/prefix` 返回的第 19 段：

```text
ENVIRONMENT · figure-persona   sourceKey=worlds.figure-persona.envPrompt   153 字符

## figure-persona
你现在的外形是「GPT娘 · 白龙（母本重构版）」(形象包 id:gpt-niang)。外形只说明你此刻的样子,不改变你是谁。
我是白龙 GPT娘,住在你屏幕底边。说话像朋友,不像客服:能短就短,一次一两句;不懂就说不懂,不装懂。句末偶尔带个「呀」「呢」,不堆感叹号。
```

该接口与真实前缀用同一份组装代码现拼（`build/cortico/src/web/server.ts` 的 `/api/prompts/prefix` 走 `assembleSystemSegments`），所以这就是模型看到的那一段。

## 未覆盖 / 已知边界

- **内置形象读不到。** `coo`、`whale` 的文件在 desktop-pet 包自己的 `web/` 下，不在 `<data>/figures/` 里；`figure` 填这两个 id 时只会用缺省文案。留空（跟随装扮页）最省心。
- **外观不同步。** 见「两个例外」第一条。
- **人格长度吃前缀预算。** persona 直接进系统前缀，越长每轮越贵。建议一两句。
- **WebUI 端口浮动。** 本机是 17788，换机器请从实例启动日志或 `netstat` 找实际端口。
- **没有做单元测试隔离宿主。** 测试用临时目录造 `config.json` 与 `figure.json`，不碰真实部署。

## 许可

MIT，见 [LICENSE](LICENSE)。
