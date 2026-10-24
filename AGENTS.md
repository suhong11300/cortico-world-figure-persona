# 包内约定

这是 `cortico-world-figure-persona` 的仓库,不是 Cortico 本体。改这个包时按下面的约定来。

## 结构

- `src/definition.ts`:定义(id `figure-persona`、默认值、`create`、自描述)。`describe` 里的工具与事件必须覆盖实例可能返回的全部。
- `src/world.ts`:读形象包的纯函数(`readFigure`、`hostFigureId`)与 `FigurePersonaWorld`。
- `src/config.ts`:配置段与 JSON Schema。每条 schema 路径都要落在 `worlds.figure-persona.` 下,且 `defaults()` 里有同名默认值 —— 缺一个,官方 check 会报失败。
- `src/ENV_PROMPT.md`:环境段模板。占位符名只允许 `[\w.]`(不能带连字符),所以变量是 `figure_persona.*`。
- `describe.json`:由 `pnpm describe:extension` 生成,不手写。

## 改动后必须做的验证

```bash
corepack pnpm typecheck && corepack pnpm test
```

以及在 Cortico 检出根下:

```bash
corepack pnpm describe:extension <本包目录>
corepack pnpm check:extension <本包目录>
```

`check:extension` 是硬门槛:它用临时部署、默认配置、不调 `start()` 造一遍实例。

## 不要做的事

- 不要写 `CONSTITUTION.md` 或任何人设文件。本包只产出一段环境提示词。
- 不要执行形象包里的代码。形象包是不可信输入,只读它的 `figure.json`。
- 不要把宿主配置当成自己的配置来写。想改形象走 Coopanion 自己的页面。
- 读不到形象或人格时不要抛错 —— 前缀渲染失败会连累整个会话,兜底成空串或一句说明。
