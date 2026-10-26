# 🐉 cortico-world-figure-persona

给 Coopanion 的桌宠形象接上**人格档位**。

一个形象可以挂好几档人设（日常版、工作版、深夜版……），面板里点一下就能切；
这些档位存在**形象包之外**，形象包更新、重装、换新版本都不会把它们冲掉。

> 换外观不等于换人格；换形象包也不该等于丢人设。
>
> 0.1.0 把人格写回 `figure.json`，形象包整目录覆盖时人设跟着没了。0.2.0 起人格存进独立的档位仓库，
> `figure.json` 只当作**形象包自带的默认人设**来读，一个字节都不写。

它只往系统前缀的环境段注入文本：不动形象包的美术，不执行形象包的代码，不写 `CONSTITUTION.md`。

*Cortico World · `kind: world` · `api: 6` · `tags: external-setup / experimental` · MIT · Coopanion 0.2.8 实测*

## 目录

- [为什么需要它](#为什么需要它)
- [一个形象，几档人设](#一个形象几档人设)
- [它接的是哪一段](#它接的是哪一段)
- [工作边界](#工作边界)
- [它读什么](#它读什么)
- [档位仓库长什么样](#档位仓库长什么样)
- [环境段长什么样](#环境段长什么样)
- [安装](#安装)
- [图形面板](#图形面板)
- [手工路径](#手工路径)
- [参数](#参数)
- [工具与事件](#工具与事件)
- [验证到哪一级](#验证到哪一级)
- [已知边界](#已知边界)
- [许可](#许可)

## 为什么需要它

形象包决定「长什么样」，人格由 `CONSTITUTION.md` 和形象包自带的人设决定 —— 两者原本各管各的，换形象不会换语气。

| 没有它 | 有它 |
| --- | --- |
| 装了十个形象，说话永远是同一个人 | 每个形象带自己的人格式，换谁像谁 |
| 想换语气得手改 `CONSTITUTION.md`，覆盖原有设定，还得重开会话 | 人格挂在形象上，改完点一次「保存并生效」 |
| 形象包作者想附一段人设，没地方放（写进 `figure.json`，包一更新就没了） | 人设落在档位仓库，形象包只提供默认值 |
| 同一个形象，上班想正经、下班想随便，只能二选一 | 一个形象挂几档，切换是点一下的事 |

## 一个形象，几档人设

档位是**按形象分开**的：`gpt-niang` 的「日常版」和 `whale` 的「日常版」互不相干，同名的档在不同形象里是不同的内容。

| 操作 | 在面板上 | 函数上 |
| --- | --- | --- |
| 保存当前文本到某一档并生效 | 选档 → 改文本 → **保存并生效** | `apply{ figure, profile, persona }` |
| 换到另一档（不改内容） | 选档 → **切到这一档** | `switch{ figure, profile }` |
| 新建一档 | 输入新档名 → **新建档** → 改文本 → 保存 | `apply{ profile: 新档名, persona }` |
| 删掉一档 | 选档 → **删除此档**（删当前档会自动顺位到下一档） | `remove{ figure, profile }` |
| 让桌宠自己去切 | 直接说「换成工作版」 | 工具 `figure_persona_switch` |

档名规则：去掉首尾空白、内部连续空白压成一个空格，**最多 24 个字符**；空档名会被拒（面板会显示原因）。

## 它接的是哪一段

Coopanion 里跟「我是谁」有关的东西分三层，本包只接中间一层：

| 层 | 存在哪 | 谁管 |
|---|---|---|
| 长什么样、有什么动作 | 形象包 `<data>/figures/<id>/`（`figure.json` + 美术资源） | 装扮页 / 形象包作者 |
| 用这个形象时怎么说话 | `<data>/figure-persona/personas.json`（档位仓库），缺省读 `figure.json` 的 `persona` | 本包（面板读写） |
| 你本身是谁 | 工作区 `CONSTITUTION.md` | 开发者自己 |

所以换形象带来的语气变化是可逆的；真要改「你是谁」，仍然只有 `CONSTITUTION.md` 一条路。

## 工作边界

- 不写 `CONSTITUTION.md`、`PARTNER.md` 或任何工作区人设文件。
- **不写形象包**：`figure.json` 只读。删掉、重装、升级形象包，档位仓库都不受影响。
- 不改 `worlds.desktop-pet.skin.figure`：Cortico 没给扩展留这个接口，外观仍由装扮页决定。
- 不执行形象包里的代码。形象包的脚本跑在沙箱 frame 里，本 World 只读它的 `figure.json`。
- 读不到形象或人格时不抛错：没有配置给空串，形象包缺失时名字退回 id，人格缺失时用缺省文案兜底。前缀渲染抛错会连累整个会话。
- 只在环境段注入，不接管人设。

## 它读什么

| 值 | 来源 |
|---|---|
| 当前形象 id | 部署 `config.json` 的 `worlds."desktop-pet".skin.figure`；配置项 `figure` 非空时用它 |
| 形象显示名 | `<dataDir>/figures/<id>/figure.json` 的 `name`；没有时退回 id |
| 生效的人格正文 | 档位仓库里该形象的 **active 档**；该形象还没有任何档时，退回 `figure.json` 的 `persona` 字段（配置项 `field` 可改字段名） |
| 档位列表 | 档位仓库里的档名；一档都没有、但包里有人设时，显示一个虚拟的「默认」档（只用于显示，不落盘） |

`persona` 可以是字符串，也可以是对象。对象形式先认 `text` / `about` / `prompt`，再认语言键：界面语言是简体中文时取 `zh`，`en` 次之，最后取第一个非空字符串 —— 所以 `{ "zh": "…", "en": "…" }` 直接可用。

从 0.1.0 升级上来时，如果 `figure.json` 里已经有旧版写进去的人格，**第一次保存该形象时会自动收编成「默认」档**，不用手工搬。

## 档位仓库长什么样

`<data>/figure-persona/personas.json`，纯 JSON，可以直接备份、`git` 管、拷到别的机器：

```json
{
  "version": 1,
  "figures": {
    "gpt-niang": {
      "active": "工作版",
      "profiles": {
        "日常版": "我是白龙 GPT娘,住在你屏幕底边。说话像朋友,不像客服。",
        "工作版": "现在是工作档:先给结论,再说依据;一次不超过三句,不寒暄。"
      }
    }
  }
}
```

写入是 **先写 `.tmp` 再 rename** 的原子替换；文件坏了、缺字段、值是别的类型，一律当成「没有档位」退回形象包默认值，不让它把一个会话拖崩。

面板底部直接显示这个文件的绝对路径，方便你确认自己在改哪份存档。

## 环境段长什么样

`src/ENV_PROMPT.md`（0.2.0 起三行）：

```text
你现在的外形是「{{figure_persona.name}}」(形象包 id:{{figure_persona.figure}})。外形只说明你此刻的样子,不改变你是谁。
{{figure_persona.persona | 这个形象包没有携带人格文本,保持你原本的人设即可。}}
当前人设档:{{figure_persona.profile | 未设档}}(全部档:{{figure_persona.profiles | 无}})。换档只换说话的样子,不换你是谁。
```

第三行让模型知道自己**在哪一档、还有哪些档**，用户说「换成工作版」时它才能自己调工具切，而不是干猜。
形象包没带人格时整段保留前后两行，中间用缺省文案兜底 —— 不抛错，也不影响其他 World 的段落。

模板可覆盖，不用改包源码（升级不丢）：在部署目录放 `<botDir>/worlds/figure-persona/ENV_PROMPT.md`。
优先级：部署覆盖 > 包目录里的 `worlds/figure-persona/ENV_PROMPT.md` > 本包 `src/ENV_PROMPT.md`。

**部署覆盖会遮蔽新版模板。** 0.1.0 时代宿主把当时的两行模板落到了部署目录，那份文件一存在，插件升级后也读不到新模板 —— 现象是「第三行当前人设档没出现」。0.2.0 挂载时会检查这份覆盖：**逐字等于旧自动版本就地升级成三行**，手改过的一律不动。想用新版又保留了手改内容，就把覆盖文件里缺的那行手工补上。
占位符只允许 `[\w.]` 形式，写别的会被原样留在文本里。
## 安装

### 前置条件

| 项目 | 要求 |
| --- | --- |
| 宿主 | Coopanion 0.2.8+（Cortico 扩展 api 6） |
| 形象包 | `manifest: 2` / `api: 2`，落在 `<data>/figures/<id>/` |
| Node | 22+（`corepack` 随 Node 提供，`pnpm` 不用单独装） |

扩展目录是 `<data>/extensions`，**不是**程序目录 —— 实例把 data 目录当作 Cortico 的检出根（本机实测 `%LOCALAPPDATA%\Programs\Coopanion\data\extensions`，可用 `CORTICO_EXTENSIONS_DIR` 改）。装之前先看运行中实例 `GET /api/extensions` 返回的 `dir` 字段，以它为准，别按源码注释猜路径。

### 1 · 装进扩展目录

两种装法选一个：

- **市场 / WebUI**：「扩展」页 → 搜 `cortico-world-figure-persona` 装，或手动安装选本机目录（link 方式，改源码后重启生效）。
- **命令行**：`cd <扩展目录> && corepack pnpm add cortico-world-figure-persona`。

### 2 · 激活 World

部署 `config.json` 里 `worlds.figure-persona.enabled` 设成 `true`，或在 World 总览页点「激活 World」。

Coopanion 只声明它自带的三个 World，新装的扩展 World 默认是关的 —— **装 ≠ 启用**。

### 3 · 建第一档人设

打开面板 → 输入档名（比如「日常版」）→ 点「新建档」→ 写文本 → 「保存并生效」。

不想开面板也行：直接往 `<data>/figure-persona/personas.json` 里写（格式见[档位仓库](#档位仓库长什么样)），刷新页面就能看到。
**不用再改形象包的 `figure.json`** —— 那已经是「形象包自带的默认人设」的位置。

### 4 · 装完自检

```bash
# 扩展是否被识别（看 state=loaded、enabled=true、webUi=served）
curl -s "http://127.0.0.1:<web 端口>/api/extensions"

# 环境段是否进了系统前缀（找 ENVIRONMENT · figure-persona，应有三行）
curl -s "http://127.0.0.1:<web 端口>/api/prompts/prefix"

# World 是否 active
curl -s "http://127.0.0.1:<web 端口>/api/worlds"
```

Web 端口在实例启动日志里，或用 `netstat -ano | findstr LISTENING` 找 —— 本机是 17788，别当常量。

## 图形面板

入口：`http://127.0.0.1:<web 端口>`（本机 17788）→ 左侧「World 总览」→「形象人格」→「详情」→ 页签「形象与人格」。
也可以直接开 `http://127.0.0.1:<web 端口>/#/provider/world:figure-persona`。

页面上是这样几样：

1. **形象** —— 下拉列出 `<data>/figures/` 下所有已装形象，外加内置的 Coo / Whale（带「(内置)」后缀）。换选项时，这个形象的人设档与当前档的文本会一起刷新。
2. **人设档** —— 下拉列出该形象的所有档，生效中的那一档标「(生效中)」。
3. **新档名 + 新建档 / 删除此档** —— 新建后会自动切到新档并在编辑框里留空；删除当前档会自动顺位到下一档，删最后一档会清掉该形象的全部记录。
4. **人格文本** —— 多行编辑框，内容就是当前档的正文。
5. **保存并生效 / 切到这一档** —— 前者写档 + 把 `worlds.figure-persona.figure` 锁到选中形象 + 重启本 World + 重载系统前缀；后者只切 active 档。**下一句话就按新的人设说**，不用重启 Coopanion。
6. **档位仓库路径** —— 底部一行灰字，显示 `personas.json` 的绝对路径。

两个例外：

- **桌面外观不会跟着变。** Cortico 没给扩展改 `skin.figure` 的接口。想让外观和人格一起换：先在装扮页换形象，再回面板下拉里选同一个。回执会提示这一点。
- **选内置 Coo / Whale 不落盘。** 它们没有 `<data>/figures/<id>/figure.json`，也没有档位可存，只会用到缺省文案。

面板走与其他 WebUI 面板同一条 RPC，脚本调试可直接调：

```bash
# 读当前状态（选项、各形象的档、当前档、仓库路径）
curl -s -X POST "http://127.0.0.1:17788/api/webui/providers/world%3Afigure-persona/panels/figure-persona/state" \
  -H "content-type: application/json" -d "{\"args\":[]}"

# 保存到「工作版」并生效
curl -s -X POST "http://127.0.0.1:17788/api/webui/providers/world%3Afigure-persona/panels/figure-persona/apply" \
  -H "content-type: application/json" -d "{\"args\":[{\"figure\":\"gpt-niang\",\"profile\":\"工作版\",\"persona\":\"先给结论,再说依据。\"}]}"

# 只切档
curl -s -X POST "http://127.0.0.1:17788/api/webui/providers/world%3Afigure-persona/panels/figure-persona/switch" \
  -H "content-type: application/json" -d "{\"args\":[{\"profile\":\"日常版\"}]}"
```

## 手工路径

不用面板时三步：

1. **写档位** —— 编辑 `<data>/figure-persona/personas.json`（格式见上），或在形象包 `figure.json` 里写 `persona` 当默认值。
2. **换形象** —— 在装扮页换。`figure` 留空时，下一次前缀重建就读新形象的档位。
3. **让当前会话读到新内容** —— World 总览 →「形象人格」→「↻ 重载系统前缀」。不点也行，但要等上下文交接或重开会话：普通对话轮次不会重算前缀。

### 怎么确认生效

- World 总览的「形象人格」卡片直接显示当前渲染出来的环境段。
- `GET http://127.0.0.1:<web 端口>/api/prompts/prefix`，找 `ENVIRONMENT · figure-persona` 那一段。
- 问桌宠「你现在是什么形象、哪一档」，它会调 `figure_persona_current`。

## 参数

| 参数 | 默认 | 作用 |
| --- | :---: | --- |
| `worlds.figure-persona.enabled` | `false` | 挂载开关。Coopanion 只声明自带的三个 World，扩展 World 默认关 |
| `worlds.figure-persona.field` | `persona` | 形象包自带的默认人设，在 `figure.json` 里的字段名 |
| `worlds.figure-persona.figure` | 空 | 固定用某个形象包；留空时跟随宿主正在显示的那个 |

三项都带 `x-hot`，在配置页改完即时进内存，不用重启。档名与档位内容不在配置里，在 `personas.json`（配置页改不了，面板或手工改文件）。

## 工具与事件

| 名称 | 类型 | 说明 |
| --- | --- | --- |
| `figure_persona_current` | 工具（`read`） | 报当前形象、生效的档名、一共有几档。不改任何文件 |
| `figure_persona_switch` | 工具（`write`） | 切到另一档（`profile`），或换一个已装形象（`figure`），然后重载系统前缀。档不存在时回执会列出有哪些档 |
| `figure_persona.mounted` | 事件 | 挂载时投一条，说明读到了什么 |

所以「换成工作版」这句话可以只说，不用你自己点面板 —— 模型能看到档位表，也能自己切。

## 验证到哪一级

分层给证，互不替代：

| 层 | 做了什么 | 能证明 | 不能证明 |
|---|---|---|---|
| 静态 | `pnpm typecheck` 干净；`pnpm test` **39 项**全绿（`store.test.ts` 12 + `world.test.ts` 27） | 代码自洽、边界行为符合预期 | 宿主里跑得起来 |
| 契约 | `describe.json` 由 `exportDescribe` 重新生成，`checkDescribe` 三项全 ok、0 warning | 包形状合 Cortico 规范 | 行为与观感 |
| 关键用例 | 「形象包换新版本覆盖 `figure.json` 后，人设档还在」「面板 apply 只写档位仓库，`figure.json` 前后字节相等」 | 本次要修的清零问题真的不再发生 | 真机注入效果 |
| 运行时 / 交互 | **0.2.0 尚未在宿主里复测**（0.1.0 做过，见下） | — | — |

```bash
corepack pnpm install
corepack pnpm build        # 重新生成 dist/webui.js（面板的浏览器产物，随仓库提交）
corepack pnpm typecheck
corepack pnpm test         # 39 项
```

`dist/webui.js` 进仓库也进 npm 包 —— 无论从 npm 还是从 git 装，面板都要有产物。发布前 `prepublishOnly` 会自动再 build 一次兜底。改了 `src/webui/client.ts` 就 `pnpm build` 后一起提交，否则线上还是旧面板。

**自检通过不等于验收。** 本包当前状态：0.2.0 的静态与契约层已过，宿主里的交互层（面板点按、工具调用、前缀文本）等装进 Coopanion 后复测补齐。

### 0.1.0 的历史记录（人格还写在形象包里时）

2026-10-24，Coopanion 0.2.8。`GET /api/prompts/prefix` 第 19 段 `ENVIRONMENT · figure-persona` 153 字符，正文为当时写进 `figure.json` 的 persona 两行。这条记录说明环境段确实会进系统前缀；0.2.0 改了人格来源（档位仓库）与模板行数，字符数与文本都会变，装机后重新取一次为准。

## 已知边界

- **内置形象读不到。** `coo`、`whale` 的文件在 desktop-pet 包自己的 `web/` 下，不在 `<data>/figures/` 里；`figure` 填这两个 id 时只会用缺省文案。留空（跟随装扮页）最省心。
- **外观不同步。** 见[图形面板](#图形面板)的两个例外第一条。
- **人格长度吃前缀预算。** 人设直接进系统前缀，越长每轮越贵。建议一两句；档位多少不影响预算，只有生效那一档进前缀。
- **WebUI 端口浮动。** 本机是 17788，换机器请从实例启动日志或 `netstat` 找实际端口。
- **没有做单元测试隔离宿主。** 测试用临时目录造 `config.json`、`figure.json` 与 `personas.json`，不碰真实部署。
- **空档不校验。** 允许存一档空文本（当作「这个形象不说话、用缺省文案」），面板不会拦 —— 要删就删档。
- **部署覆盖优先于新版模板。** 见[环境段长什么样](#环境段长什么样)末尾：旧自动模板会在挂载时升级，手改过的保持原样，需要有新行就自己补。

## 许可

MIT，见 [LICENSE](LICENSE)。
