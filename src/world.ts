/** 形象人格 World：读宿主配置里正在显示的形象，把该形象包携带的人格正文注入环境提示词，并给面板提供读写入口。 */
import { copyFileSync, existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDef, World, WorldWebUiDecl, WorldHost } from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { FIGURE_PERSONA_CONFIG_GROUP, type FigurePersonaConfigSection } from './config.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

/** 宿主 World 的段名：当前形象记在 config.json 的 worlds['desktop-pet'].skin.figure。 */
const HOST_WORLD_ID = 'desktop-pet';
/** 形象包 id 的形状，与 Coopanion 的 data/figures/<id>/ 目录名一致。 */
const FIGURE_ID = /^[a-z0-9][a-z0-9-]{0,31}$/;
/** 面板 id：同一页内唯一，不带 World 前缀。 */
export const FIGURE_PERSONA_PANEL = 'figure-persona';
/** 宿主自带、不在 data/figures 下的形象；它们的 figure.json 在程序目录里，只读。 */
export const BUILTIN_FIGURES: ReadonlyArray<{ id: string; name: string }> = [
  { id: 'coo', name: 'Coo' },
  { id: 'whale', name: 'Whale' },
];

export interface FigurePersonaWorldOptions {
  /** worlds.figure-persona 的活引用。 */
  cfg: FigurePersonaConfigSection;
  timezone: string;
  /** 部署目录：config.json 在这里。 */
  botDir: string;
  /** 数据目录：形象包在 dataDir/figures/<id>/figure.json。 */
  dataDir: string;
  /** 把补丁深合并进 worlds.figure-persona 并落盘；面板写入走它。 */
  persist?: (patch: Partial<FigurePersonaConfigSection>) => void;
  /** 按 cfg.enabled 重建本 World；重建会连带重载 system 前缀。 */
  restart?: () => Promise<void>;
}

export interface FigureReading {
  /** 形象包 id；空串表示没读到当前形象。 */
  id: string;
  /** 形象包里声明的显示名；没有时退回 id。 */
  name: string;
  /** 人格正文；空串表示形象包没带。 */
  persona: string;
  /** 人格正文取自 figure.json 的哪个字段；没有正文时为空串。 */
  field: string;
}

/** 面板里的一行形象。 */
export interface FigureOption {
  id: string;
  name: string;
  persona: string;
  /** 宿主自带形象：只读，写不了人格。 */
  builtin: boolean;
  /** 宿主此刻正在显示它。 */
  showing: boolean;
}

/** 面板首屏：全部可选形象 + 当前生效的那一份。 */
export interface FigurePanelState {
  options: FigureOption[];
  picked: string;
  field: string;
  persona: string;
}

/** 面板「确定并生效」的回执。 */
export interface FigureApplyResult {
  ok: boolean;
  figure: string;
  name: string;
  builtin: boolean;
  saved: boolean;
  message: string;
}

function readJson(path: string): unknown {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

/** 宿主部署配置里正在显示的形象 id；读不到或形状不对时返回空串。 */
export function hostFigureId(botDir: string): string {
  const config = readJson(join(botDir, 'config.json')) as
    | { worlds?: Record<string, { skin?: { figure?: unknown } } | undefined> }
    | undefined;
  const figure = config?.worlds?.[HOST_WORLD_ID]?.skin?.figure;
  return typeof figure === 'string' && FIGURE_ID.test(figure) ? figure : '';
}

/** 语言对象取值：先 zh、再 en、再任意非空字符串。宿主 figure.json 的 name/about 都是这个形状。 */
function localizedText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['zh', 'en']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
    }
    for (const candidate of Object.values(record)) {
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
    }
  }
  return '';
}

/** 人格字段的取值：对象先认 text / about / prompt，其余交给语言对象规则。 */
function personaText(value: unknown): string {
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'about', 'prompt']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
    }
  }
  return localizedText(value);
}

/** 读一个形象包：只用到 id、name 与人格字段，其余字段原样不碰。 */
export function readFigure(dataDir: string, figure: string, field: string): FigureReading {
  if (figure === '') return { id: '', name: '', persona: '', field: '' };
  const manifest = readJson(join(dataDir, 'figures', figure, 'figure.json'));
  if (manifest === null || typeof manifest !== 'object') return { id: figure, name: figure, persona: '', field: '' };
  const record = manifest as Record<string, unknown>;
  const name = localizedText(record.name) || figure;
  const persona = personaText(record[field]);
  return { id: figure, name, persona, field: persona === '' ? '' : field };
}

/** data/figures 下装了哪些形象包。 */
export function installedFigures(dataDir: string): string[] {
  let entries: Array<{ name: string; isDirectory(): boolean }> = [];
  try {
    entries = readdirSync(join(dataDir, 'figures'), { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isDirectory() && FIGURE_ID.test(entry.name))
    .map((entry) => entry.name)
    .sort();
}

/** 面板用：已装形象 + 内置形象，各自带当前人格与是否正在显示。 */
export function listFigures(dataDir: string, showing: string, field: string): FigureOption[] {
  const options: FigureOption[] = installedFigures(dataDir).map((id) => {
    const reading = readFigure(dataDir, id, field);
    return { id, name: reading.name, persona: reading.persona, builtin: false, showing: id === showing };
  });
  for (const builtin of BUILTIN_FIGURES) {
    if (options.some((option) => option.id === builtin.id)) continue;
    options.push({
      id: builtin.id,
      name: builtin.name,
      persona: '',
      builtin: true,
      showing: builtin.id === showing,
    });
  }
  return options;
}

/**
 * 把人格正文写回形象包的 figure.json。
 *
 * 原来 persona 是语言对象（{zh, en}）时只覆盖 zh 并保留其余语言；
 * 其余情况写字符串。首次写入前留一份 `figure.json.bak-cortina`。
 */
export function savePersona(dataDir: string, figure: string, field: string, text: string): void {
  const dir = join(dataDir, 'figures', figure);
  const file = join(dir, 'figure.json');
  const manifest = readJson(file);
  if (manifest === null || typeof manifest !== 'object') {
    throw new Error('形象包 ' + figure + ' 里没有可解析的 figure.json');
  }
  const backup = file + '.bak-cortina';
  if (!existsSync(backup)) copyFileSync(file, backup);
  const record = manifest as Record<string, unknown>;
  const previous = record[field];
  if (previous !== null && typeof previous === 'object' && !Array.isArray(previous)) {
    record[field] = { ...(previous as Record<string, unknown>), zh: text };
  } else {
    record[field] = text;
  }
  writeFileSync(file, JSON.stringify(record, null, 2) + '\n', 'utf8');
}

/** 全部工具的声明；定义里的 describe 与 tools() 都取它。 */
export const FIGURE_PERSONA_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'figure_persona_current',
    description: 'Report which figure pack the host is showing and whether it carries persona text.',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
];

export class FigurePersonaWorld implements World {
  readonly id = 'figure-persona';

  constructor(private readonly opts: FigurePersonaWorldOptions) {}

  /** 当前形象：配置指定优先，否则读宿主部署配置。 */
  currentFigure(): string {
    const forced = this.opts.cfg.figure.trim();
    if (forced !== '') return FIGURE_ID.test(forced) ? forced : '';
    return hostFigureId(this.opts.botDir);
  }

  read(): FigureReading {
    return readFigure(this.opts.dataDir, this.currentFigure(), this.opts.cfg.field);
  }

  /** 只报值；段落文本一律来自 ENV_PROMPT.md 模板。 */
  envPromptVars(): Record<string, string> {
    const reading = this.read();
    return {
      'figure_persona.figure': reading.id,
      'figure_persona.name': reading.name === '' ? reading.id : reading.name,
      'figure_persona.persona': reading.persona,
    };
  }

  tools(): ToolDef[] {
    return [this.currentTool()];
  }

  webUi(): WorldWebUiDecl {
    return {
      panels: [
        {
          id: FIGURE_PERSONA_PANEL,
          title: '形象与人格',
          description: '选形象、改人格文本,一次点击写回并重载系统前缀。',
        },
      ],
      invoke: (panel, method, args) => this.invoke(panel, method, args),
      config: [FIGURE_PERSONA_CONFIG_GROUP],
      promptDocs: [
        {
          key: 'worlds.figure-persona.envPrompt',
          title: '形象人格 · 环境提示词',
          description: '把当前形象包携带的人格正文放进 system 前缀的那一段。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            { name: 'figure_persona.figure', description: '当前形象包 id,此刻的值。' },
            { name: 'figure_persona.name', description: '形象包声明的显示名,此刻的值。' },
            { name: 'figure_persona.persona', description: '形象包携带的人格正文;没有时为空,模板用缺省文案兜底。' },
          ],
        },
      ],
    };
  }

  /** 面板数据面：state 读，apply 写。 */
  async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel !== FIGURE_PERSONA_PANEL) throw new Error('未知面板: ' + panel);
    if (method === 'state') return this.panelState();
    if (method === 'apply') return this.apply(args[0]);
    throw new Error('未知面板方法: ' + panel + '/' + method);
  }

  panelState(): FigurePanelState {
    const showing = hostFigureId(this.opts.botDir);
    const picked = this.currentFigure();
    return {
      options: listFigures(this.opts.dataDir, showing, this.opts.cfg.field),
      picked,
      field: this.opts.cfg.field,
      persona: readFigure(this.opts.dataDir, picked, this.opts.cfg.field).persona,
    };
  }

  /** 一次点击：写人格、锁到该形象、重建本 World(连带重载 system 前缀)。 */
  async apply(raw: unknown): Promise<FigureApplyResult> {
    const arg = (raw ?? {}) as { figure?: unknown; persona?: unknown };
    const figure = typeof arg.figure === 'string' ? arg.figure.trim() : '';
    const persona = typeof arg.persona === 'string' ? arg.persona.trim() : '';
    if (!FIGURE_ID.test(figure)) throw new Error('形象 id 不合法:只接受小写字母、数字与连字符。');

    const builtin = BUILTIN_FIGURES.some((entry) => entry.id === figure);
    if (!builtin) savePersona(this.opts.dataDir, figure, this.opts.cfg.field, persona);

    this.opts.persist?.({ figure, field: this.opts.cfg.field });
    await this.opts.restart?.();

    const reading = readFigure(this.opts.dataDir, figure, this.opts.cfg.field);
    const name = reading.name === '' ? figure : reading.name;
    const showing = hostFigureId(this.opts.botDir);
    const appearance = showing === figure
      ? ''
      : ' 桌面外观现在还是「' + (showing === '' ? '未设置' : showing) + '」,要一起换请在装扮页选同一个形象(Cortico 没给扩展改外观的接口)。';
    const message = builtin
      ? '已切到内置形象「' + name + '」。内置形象不带人格文本,解释段会用缺省文案。' + appearance
      : persona === ''
        ? '已清空「' + name + '」的人格,解释段会用缺省文案。' + appearance
        : '已把「' + name + '」的人格换成 ' + Array.from(persona).length + ' 字,系统前缀已重载。' + appearance;

    return { ok: true, figure, name, builtin, saved: !builtin, message };
  }

  /** 挂载时投一条状态事件；origin: internal 表示 World 的内部机制事件。 */
  async start(host: WorldHost): Promise<void> {
    const reading = this.read();
    const text = reading.id === ''
      ? '形象人格 World 已挂载:还没读到当前形象,这一段暂时是空的。'
      : reading.persona === ''
        ? '形象人格 World 已挂载:当前形象「' + reading.name + '」没有携带人格文本。'
        : '形象人格 World 已挂载:当前形象「' + reading.name + '」,人格文本取自 figure.json 的 ' + reading.field + ' 字段。';
    await host.pushEvent({
      type: 'figure_persona.mounted',
      ts: nowIso(this.opts.timezone),
      source: this.id,
      origin: 'internal',
      senderKey: this.id,
      text,
    });
  }

  async stop(): Promise<void> {}

  private currentTool(): ToolDef {
    return {
      ...FIGURE_PERSONA_TOOL_DECLS[0],
      handler: async () => {
        const reading = this.read();
        if (reading.id === '') {
          return '没读到当前形象:宿主配置里没有 worlds.desktop-pet.skin.figure,这一段配置也没指定 figure。';
        }
        if (reading.persona === '') {
          return '当前形象是「' + reading.name + '」(' + reading.id + '),它的 figure.json 里没有 ' + this.opts.cfg.field + ' 字段。';
        }
        return '当前形象是「' + reading.name + '」(' + reading.id + '),人格取自 figure.json 的 ' + reading.field + ' 字段,共 ' + reading.persona.length + ' 字。';
      },
    };
  }
}
