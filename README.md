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

Coopanion 的扩展目录是它自己那份 Cortico 仓库下的 `extensions/`
(`<Coopanion>/resources/app/build/cortico/extensions`,或由 `CORTICO_EXTENSIONS_DIR` 指定的位置)。
两种装法:

1. WebUI「扩展」页 → 手动安装 → 选本机目录,指到这个包的目录(link 方式,改源码后重启生效)。
2. 命令行:`cd <该目录> && corepack pnpm add <包目录的绝对路径>`。

装完把部署 `config.json` 里 `worlds.figure-persona.enabled` 设成 `true`(或在 World 页打开),重启进程。

## 验证

```bash
corepack pnpm install
corepack pnpm typecheck
corepack pnpm test          # 9 项:干装载、读宿主形象、配置覆盖、缺包兜底、模板渲染、工具回执、挂载事件
```

在 Cortico 检出根下另跑官方校验(两项都要过):

```bash
corepack pnpm describe:extension <本包目录>   # 生成 describe.json
corepack pnpm check:extension <本包目录>
```

## 边界

- 只在环境段注入文本,不覆盖人设。想连人设一起换,得改 `CONSTITUTION.md`,那是另一个动作,本包不做。
- 形象包的代码跑在沙箱 frame 里,没有文件权限;本 World 反过来只读形象包的 `figure.json`,不执行它的代码。
- 人格正文属于形象包作者写的内容,长度不受这里限制 —— 太长会占系统前缀的预算。
