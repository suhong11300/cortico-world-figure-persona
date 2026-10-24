/** 形象人格 World：读宿主配置里正在显示的形象，把该形象包携带的人格正文注入环境提示词。 */
import { readFileSync } from 'node:fs';
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

export interface FigurePersonaWorldOptions {
  /** worlds.figure-persona 的活引用。 */
  cfg: FigurePersonaConfigSection;
  timezone: string;
  /** 部署目录：config.json 在这里。 */
  botDir: string;
  /** 数据目录：形象包在 dataDir/figures/<id>/figure.json。 */
  dataDir: string;
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

/** 人格字段的取值：字符串直接用；对象取 text / about / prompt 里第一个非空字符串。 */
function personaText(value: unknown): string {
  if (typeof value === 'string') return value.trim();
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of ['text', 'about', 'prompt']) {
      const candidate = record[key];
      if (typeof candidate === 'string' && candidate.trim() !== '') return candidate.trim();
    }
  }
  return '';
}

/** 读一个形象包：只用到 id、name 与人格字段，其余字段原样不碰。 */
export function readFigure(dataDir: string, figure: string, field: string): FigureReading {
  if (figure === '') return { id: '', name: '', persona: '', field: '' };
  const manifest = readJson(join(dataDir, 'figures', figure, 'figure.json'));
  if (manifest === null || typeof manifest !== 'object') return { id: figure, name: figure, persona: '', field: '' };
  const record = manifest as Record<string, unknown>;
  const name = typeof record.name === 'string' && record.name.trim() !== '' ? record.name.trim() : figure;
  const persona = personaText(record[field]);
  return { id: figure, name, persona, field: persona === '' ? '' : field };
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

  /** 挂载时投一条状态事件；origin: internal 表示 World 的内部机制事件。 */
  async start(host: WorldHost): Promise<void> {
    const reading = this.read();
    const text = reading.id === ''
      ? '形象人格 World 已挂载:还没读到当前形象,这一段暂时是空的。'
      : reading.persona === ''
        ? `形象人格 World 已挂载:当前形象「${reading.name}」没有携带人格文本。`
        : `形象人格 World 已挂载:当前形象「${reading.name}」,人格文本取自 figure.json 的 ${reading.field} 字段。`;
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
          return `当前形象是「${reading.name}」(${reading.id}),它的 figure.json 里没有 ${this.opts.cfg.field} 字段。`;
        }
        return `当前形象是「${reading.name}」(${reading.id}),人格取自 figure.json 的 ${reading.field} 字段,共 ${reading.persona.length} 字。`;
      },
    };
  }
}
