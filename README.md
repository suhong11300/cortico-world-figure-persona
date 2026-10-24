# cortico-world-figure-persona

给 Coopanion 的形象包绑定人格:读宿主当前正在显示的形象,把该形象包携带的人格正文放进 system 前缀的环境段。
切换形象 → 下次前缀重建时环境段跟着换。它不写 `CONSTITUTION.md`,不动人设文件,也不改形象包。

## 它读什么

| 值 | 来源 |
|---|---|
| 当前形象 id | 部署 `config.json` 的 `worlds."desktop-pet".skin.figure`;配置项 `figure` 非空时用它 |
| 形象显示名 | `<dataDir>/figures/<id>/figure.json` 的 `name`;没有时退回 id |
| 人格正文 | 同一份 `figure.json` 里 `persona` 字段(配置项 `field` 可改字段名) |

`persona` 可以是字符串,也可以是对象:`{ "text": "…" }`。对象形式依次取 `text` / `about` / `prompt` 里第一个非空字符串。
不认识的顶层字段被 Coopanion 与这个 World 一并忽略,所以给形象包加 `persona` 不需要改 Coopanion。

## 环境段长什么样

`src/ENV_PROMPT.md`:

```text
你现在的外形是「{{figure_persona.name}}」(形象包 id:{{figure_persona.figure}})。外形只说明你此刻的样子,不改变你是谁。
{{figure_persona.persona | 这个形象包没有携带人格文本,保持你原本的人设即可。}}
```

形象包没带人格时整段保留前半句,后半句用缺省文案兜底 —— 不抛错,不影响其他 World 的段落。

## 配置项

| 路径 | 默认 | 作用 |
|---|---|---|
| `worlds.figure-persona.enabled` | `false` | 挂载开关。Coopanion 只声明它自带的三个 World,新装的扩展 World 默认关,要手动打开 |
| `worlds.figure-persona.field` | `persona` | 人格正文在 `figure.json` 里的字段名 |
| `worlds.figure-persona.figure` | 空 | 固定用某个形象包;留空时跟随宿主正在显示的那个 |

## 工具与事件

- `figure_persona_current`:报当前形象、人格正文取自哪个字段、共多少字。不会修改任何文件。
- `figure_persona.mounted`:挂载时投一条,说明读到了什么。

## 装到 Coopanion 上

Coopanion 的扩展目录是 `<data>/extensions`,**不是**它的程序目录 —— 实例把 data 目录当作 Cortico 的检出根
(本机实测:`C:\Users\rog\AppData\Local\Programs\Coopanion\data\extensions`;可由 `CORTICO_EXTENSIONS_DIR` 改)。
装之前先开着的实例里 `GET /api/extensions` 看 `dir` 字段,以它为准。

两种装法:

1. WebUI「扩展」页 → 手动安装 → 选本机目录,指到这个包的目录(link 方式,改源码后重启生效)。
2. 命令行:`cd <该目录> && corepack pnpm add <包目录的绝对路径>`。

装完把部署 `config.json` 里 `worlds.figure-persona.enabled` 设成 `true`(或在 World 页打开),重启进程。

## 日常使用

装好并启用之后,平时只有一件事要做:**改完形象或人格,点一次「重载系统前缀」**。

1. **给某个形象写人格** —— 打开 `<data>/figures/<id>/figure.json`,加一个 `persona` 字段:

```json
"persona": "说话像朋友,不像客服:能短就短,一次一两句;不懂就说不懂,不装懂。"
```

   也可以按语言分开写(界面语言是简体中文时取 `zh`):

```json
"persona": { "zh": "…", "en": "…" }
```

2. **换形象** —— 在装扮页换。`figure` 留空时,下一次前缀重建就读新形象的 `figure.json`;想让某个形象固定生效,把配置项 `figure` 填成它的 id。

3. **让当前会话读到新内容** —— `http://127.0.0.1:<web 端口>`(本机是 17788) → 左侧「World 总览」→「形象人格」→「↻ 重载系统前缀」。
   不点也行,但要等上下文交接或重开会话 —— 普通对话不会重算前缀。

### 换掉注入的措辞本身

模板也能覆盖,不用改包源码(升级不丢)。在部署目录放一份:

```text
<botDir>/worlds/figure-persona/ENV_PROMPT.md
```

本机是 `C:\Users\rog\AppData\Local\Programs\Coopanion\data\home\companion\worlds\figure-persona\ENV_PROMPT.md`,内容照抄 `src/ENV_PROMPT.md` 再改。
优先级:部署覆盖 > 包目录里的 `worlds/figure-persona/ENV_PROMPT.md` > 本包 `src/ENV_PROMPT.md`。

### 怎么确认生效

- World 总览的「形象人格」卡片直接显示当前渲染出来的环境段。
- `GET http://127.0.0.1:<web 端口>/api/prompts/prefix`,找 `ENVIRONMENT · figure-persona` 那段。
- 直接问桌宠「你现在是什么形象」,它会调 `figure_persona_current`。

### 一个已知边界

内置形象 `coo`、`whale` 的文件在 desktop-pet 包自己的 `web/` 下,不在 `<data>/figures/` 里 ——
`figure` 填这两个 id 时读不到 `figure.json`,只会显示缺省文案。`figure` 留空(跟随装扮页)最省心。

## 验证

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test          # 11 项:干装载、读宿主形象、语言对象取值、配置覆盖、缺包兜底、模板渲染、兜底文案、工具回执、挂载事件
```

在 Cortico 检出根下另跑官方校验(两项都要过):

```bash
corepack pnpm describe:extension <本包目录>   # 生成 describe.json
corepack pnpm check:extension <本包目录>
```

## 实测记录(2026-10-24,Coopanion 0.2.8)

装进实例并启用后,`GET http://127.0.0.1:<web 端口>/api/prompts/prefix` 返回的分段里出现:

```text
ENVIRONMENT · figure-persona   sourceKey=worlds.figure-persona.envPrompt   153 字符

## figure-persona
你现在的外形是「GPT娘 · 白龙（母本重构版）」(形象包 id:gpt-niang)。外形只说明你此刻的样子,不改变你是谁。
我是白龙 GPT娘,住在你屏幕底边。说话像朋友,不像客服:能短就短,一次一两句;不懂就说不懂,不装懂。句末偶尔带个「呀」「呢」,不堆感叹号。
```

该接口用与真实前缀同一份组装代码现拼(见 `build/cortico/src/web/server.ts` 的 `/api/prompts/prefix`),所以它就是模型看到的那一段。

## 边界

- 只在环境段注入文本,不覆盖人设。想连人设一起换,得改 `CONSTITUTION.md`,那是另一个动作,本包不做。
- 形象包的代码跑在沙箱 frame 里,没有文件权限;本 World 反过来只读形象包的 `figure.json`,不执行它的代码。
- 人格正文属于形象包作者写的内容,长度不受这里限制 —— 太长会占系统前缀的预算。
