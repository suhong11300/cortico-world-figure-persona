/** 形象人格 World：把形象包绑定到「一键切换」的人设档，档位正文存在形象包之外，包更新不会冲掉。 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ToolDef, World, WorldWebUiDecl, WorldHost } from 'cortico/core/types.ts';
import { nowIso } from 'cortico/core/util.ts';
import { FIGURE_PERSONA_CONFIG_GROUP, type FigurePersonaConfigSection } from './config.ts';
import {
  DEFAULT_PROFILE,
  activeProfile,
  activateProfile,
  adoptLegacyPersona,
  normalizeProfile,
  personaStoreFile,
  profileNames,
  readPersona,
  readStore,
  removeProfile,
  setPersona,
  writeStore,
  type PersonaStore,
} from './store.ts';

const ENV_PROMPT_FILE = fileURLToPath(new URL('./ENV_PROMPT.md', import.meta.url));

/**
 * 早期版本落进部署目录的两行模板。部署层的 worlds/<id>/ENV_PROMPT.md 一存在就会遮蔽模块模板,
 * 所以只在它逐字等于这些历史版本时升级;用户手改过的内容一律保持原样。
 */
const LEGACY_ENV_PROMPTS = [
  [
    '你现在的外形是「{{figure_persona.name}}」(形象包 id:{{figure_persona.figure}})。外形只说明你此刻的样子,不改变你是谁。',
    '{{figure_persona.persona | 这个形象包没有携带人格文本,保持你原本的人设即可。}}',
  ].join('\n'),
];

/**
 * 把部署层那份自动生成的环境模板升级到当前模块版本；手改过的、缺失的都不动。
 * 返回同步结果，供挂载日志记录一次。
 */
function syncEnvPromptOverride(botDir: string): 'absent' | 'kept' | 'current' | 'upgraded' | 'failed' {
  const override = join(botDir, 'worlds', 'figure-persona', 'ENV_PROMPT.md');
  try {
    if (!existsSync(override)) return 'absent';
    const normalize = (text: string): string => text.replace(/\r\n/g, '\n').trim();
    const current = normalize(readFileSync(override, 'utf8'));
    if (!LEGACY_ENV_PROMPTS.some((legacy) => normalize(legacy) === current)) return 'kept';
    const next = readFileSync(ENV_PROMPT_FILE, 'utf8');
    if (normalize(next) === current) return 'current';
    writeFileSync(override, next, 'utf8');
    return 'upgraded';
  } catch {
    // 部署层不可写时保持原样:模板仍能渲染,只是少了档位那一行。
    return 'failed';
  }
}

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
  /** 数据目录：形象包在 dataDir/figures/<id>/figure.json，档位在 dataDir/figure-persona/personas.json。 */
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
  /** 人格正文；空串表示没有可用的正文。 */
  persona: string;
  /** 正文的出处说明：档位名，或形象包里的字段名；没有正文时为空串。 */
  field: string;
  /** 正文取自哪一档；来自形象包或没有正文时为空串。 */
  profile: string;
  /** 正文来源：档位存储 / 形象包 figure.json / 没有。 */
  source: 'store' | 'pack' | 'none';
}

/** 面板里的一档人设。 */
export interface FigureProfileView {
  name: string;
  persona: string;
  /** 是不是这个形象当前生效的档。 */
  active: boolean;
}

/** 面板里的一行形象。 */
export interface FigureOption {
  id: string;
  name: string;
  /** 当前生效那一档的正文，方便面板直接填进编辑框。 */
  persona: string;
  /** 这一档人设的全部档位；空数组表示还没建过档。 */
  profiles: FigureProfileView[];
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
  /** 当前生效的档名。 */
  profile: string;
  /** 正文来源说明。 */
  source: FigureReading['source'];
  /** 档位存储的落盘位置，面板上直接显示给人看。 */
  store: string;
}

/** 面板「确定并生效」的回执。 */
export interface FigureApplyResult {
  ok: boolean;
  figure: string;
  name: string;
  builtin: boolean;
  saved: boolean;
  /** 这次动到的是哪一档。 */
  profile: string;
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
  if (figure === '') return { id: '', name: '', persona: '', field: '', profile: '', source: 'none' };
  const manifest = readJson(join(dataDir, 'figures', figure, 'figure.json'));
  if (manifest === null || typeof manifest !== 'object') {
    return { id: figure, name: figure, persona: '', field: '', profile: '', source: 'none' };
  }
  const record = manifest as Record<string, unknown>;
  const name = localizedText(record.name) || figure;
  const persona = personaText(record[field]);
  return {
    id: figure,
    name,
    persona,
    field: persona === '' ? '' : field,
    profile: '',
    source: persona === '' ? 'none' : 'pack',
  };
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

/**
 * 一个形象的档位清单。
 *
 * 存储里还没有记录、而形象包本来带着人格时，虚拟出一档「默认」——
 * 显示上跟已经迁过来一样，真正的写入等用户点保存。
 */
export function profileViews(
  dataDir: string,
  figure: string,
  field: string,
  store: PersonaStore,
): FigureProfileView[] {
  const names = profileNames(store, figure);
  if (names.length > 0) {
    const active = activeProfile(store, figure);
    return names.map((name) => ({
      name,
      persona: readPersona(store, figure, name),
      active: name === active,
    }));
  }
  const legacy = readFigure(dataDir, figure, field).persona;
  if (legacy === '') return [];
  return [{ name: DEFAULT_PROFILE, persona: legacy, active: true }];
}

/** 当前生效的人格：先看档位存储，再退回形象包自带的字段。 */
export function resolveReading(dataDir: string, figure: string, field: string): FigureReading {
  const pack = readFigure(dataDir, figure, field);
  if (figure === '') return pack;
  const store = readStore(dataDir);
  const profile = activeProfile(store, figure);
  if (profile === '') {
    // 还没有档位时：包里自带的人格就是「默认」档，面板与解释段才对得上
    return pack.persona.trim() === '' ? pack : { ...pack, profile: DEFAULT_PROFILE };
  }
  const persona = readPersona(store, figure, profile);
  if (persona.trim() === '') {
    return { ...pack, persona: '', field: '', profile, source: 'store' };
  }
  return { ...pack, persona, field: '人设档「' + profile + '」', profile, source: 'store' };
}

/** 面板用：已装形象 + 内置形象，各自带档位与是否正在显示。 */
export function listFigures(dataDir: string, showing: string, field: string): FigureOption[] {
  const store = readStore(dataDir);
  const options: FigureOption[] = installedFigures(dataDir).map((id) => {
    const reading = resolveReading(dataDir, id, field);
    return {
      id,
      name: reading.name,
      persona: reading.persona,
      profiles: profileViews(dataDir, id, field, store),
      builtin: false,
      showing: id === showing,
    };
  });
  for (const builtin of BUILTIN_FIGURES) {
    if (options.some((option) => option.id === builtin.id)) continue;
    options.push({
      id: builtin.id,
      name: builtin.name,
      persona: '',
      profiles: [],
      builtin: true,
      showing: builtin.id === showing,
    });
  }
  return options;
}

/** 全部工具的声明；定义里的 describe 与 tools() 都取它。 */
export const FIGURE_PERSONA_TOOL_DECLS: ReadonlyArray<Omit<ToolDef, 'handler'>> = [
  {
    name: 'figure_persona_current',
    description: 'Report the figure pack the host is showing, the persona profile in effect, and how many profiles exist.',
    tags: ['read'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {},
      required: [],
    },
  },
  {
    name: 'figure_persona_switch',
    description: 'Switch to another persona profile of the current figure pack, or to another installed figure, then reload the system prefix.',
    tags: ['write'],
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        figure: { type: 'string', description: 'Figure pack id; omit to keep the current one.' },
        profile: { type: 'string', description: 'Persona profile name; omit to use the profile already in effect.' },
      },
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
    return resolveReading(this.opts.dataDir, this.currentFigure(), this.opts.cfg.field);
  }

  /** 只报值；段落文本一律来自 ENV_PROMPT.md 模板。 */
  envPromptVars(): Record<string, string> {
    const reading = this.read();
    const store = readStore(this.opts.dataDir);
    return {
      'figure_persona.figure': reading.id,
      'figure_persona.name': reading.name === '' ? reading.id : reading.name,
      'figure_persona.persona': reading.persona,
      'figure_persona.profile': reading.profile,
      'figure_persona.profiles': profileViews(this.opts.dataDir, reading.id, this.opts.cfg.field, store)
        .map((view) => view.name)
        .join('、'),
    };
  }

  tools(): ToolDef[] {
    return [this.currentTool(), this.switchTool()];
  }

  webUi(): WorldWebUiDecl {
    return {
      panels: [
        {
          id: FIGURE_PERSONA_PANEL,
          title: '形象与人格',
          description: '给每个形象建几档人设,一键切换。档位存在形象包之外,包更新不会把它们冲掉。',
        },
      ],
      invoke: (panel, method, args) => this.invoke(panel, method, args),
      config: [FIGURE_PERSONA_CONFIG_GROUP],
      promptDocs: [
        {
          key: 'worlds.figure-persona.envPrompt',
          title: '形象人格 · 环境提示词',
          description: '把当前形象、当前人设档的正文放进 system 前缀的那一段。',
          path: ENV_PROMPT_FILE,
          role: 'envPrompt',
          vars: [
            { name: 'figure_persona.figure', description: '当前形象包 id,此刻的值。' },
            { name: 'figure_persona.name', description: '形象包声明的显示名,此刻的值。' },
            { name: 'figure_persona.persona', description: '当前人设档的正文;没有时为空,模板用缺省文案兜底。' },
            { name: 'figure_persona.profile', description: '当前生效的档名;没有档位时为空。' },
            { name: 'figure_persona.profiles', description: '这个形象的全部档名,用顿号隔开。' },
          ],
        },
      ],
    };
  }

  /** 面板数据面：state 读，apply / switch / remove 写。 */
  async invoke(panel: string, method: string, args: unknown[]): Promise<unknown> {
    if (panel !== FIGURE_PERSONA_PANEL) throw new Error('未知面板: ' + panel);
    if (method === 'state') return this.panelState();
    if (method === 'apply') return this.apply(args[0]);
    if (method === 'switch') return this.switchTo(args[0]);
    if (method === 'remove') return this.dropProfile(args[0]);
    throw new Error('未知面板方法: ' + panel + '/' + method);
  }

  panelState(): FigurePanelState {
    const showing = hostFigureId(this.opts.botDir);
    const picked = this.currentFigure();
    const reading = resolveReading(this.opts.dataDir, picked, this.opts.cfg.field);
    return {
      options: listFigures(this.opts.dataDir, showing, this.opts.cfg.field),
      picked,
      field: this.opts.cfg.field,
      persona: reading.persona,
      profile: reading.profile,
      source: reading.source,
      store: personaStoreFile(this.opts.dataDir),
    };
  }

  /**
   * 一次点击：把正文写进这一档、并把它切成当前档，然后锁到该形象并重载前缀。
   *
   * 正文落在档位存储里，不再回写 figure.json —— 形象包升级是整目录替换，
   * 写进包里的人格会被新版本直接覆盖掉。
   */
  async apply(raw: unknown): Promise<FigureApplyResult> {
    const arg = (raw ?? {}) as { figure?: unknown; profile?: unknown; persona?: unknown };
    const figure = typeof arg.figure === 'string' ? arg.figure.trim() : '';
    const persona = typeof arg.persona === 'string' ? arg.persona.trim() : '';
    if (!FIGURE_ID.test(figure)) throw new Error('形象 id 不合法:只接受小写字母、数字与连字符。');
    const profile = normalizeProfile(
      typeof arg.profile === 'string' && arg.profile.trim() !== '' ? arg.profile : DEFAULT_PROFILE,
    );

    const builtin = BUILTIN_FIGURES.some((entry) => entry.id === figure);
    let chars = 0;
    if (!builtin) {
      const store = readStore(this.opts.dataDir);
      // 旧版本把人格写在 figure.json 里:第一次接管时先收编,别让用户以为内容丢了
      adoptLegacyPersona(store, figure, readFigure(this.opts.dataDir, figure, this.opts.cfg.field).persona);
      chars = setPersona(store, figure, profile, persona);
      writeStore(this.opts.dataDir, store);
    }

    this.opts.persist?.({ figure, field: this.opts.cfg.field });
    await this.opts.restart?.();

    const reading = readFigure(this.opts.dataDir, figure, this.opts.cfg.field);
    const name = reading.name === '' ? figure : reading.name;
    const message = builtin
      ? '已切到内置形象「' + name + '」。内置形象不带人格文本,解释段会用缺省文案。' + this.appearanceNote(figure)
      : persona === ''
        ? '已清空「' + name + '」的「' + profile + '」档。' + this.appearanceNote(figure)
        : '已把「' + name + '」的「' + profile + '」档存成 ' + chars + ' 字,存在 data/figure-persona/personas.json,形象包更新不会冲掉。系统前缀已重载。' + this.appearanceNote(figure);

    return { ok: true, figure, name, builtin, saved: !builtin, profile, message };
  }

  /** 切档或换形象：只改「当前用哪一档」，不动正文。 */
  async switchTo(raw: unknown): Promise<FigureApplyResult> {
    const arg = (raw ?? {}) as { figure?: unknown; profile?: unknown };
    const figure = typeof arg.figure === 'string' && arg.figure.trim() !== ''
      ? arg.figure.trim()
      : this.currentFigure();
    if (!FIGURE_ID.test(figure)) throw new Error('形象 id 不合法:只接受小写字母、数字与连字符。');
    const builtin = BUILTIN_FIGURES.some((entry) => entry.id === figure);

    let profile = '';
    let chars = 0;
    if (!builtin) {
      const store = readStore(this.opts.dataDir);
      profile = typeof arg.profile === 'string' && arg.profile.trim() !== ''
        ? normalizeProfile(arg.profile)
        : activeProfile(store, figure);
      if (profile !== '') {
        // 面板上那个「默认」档可能还只是包里的人格：第一次切它先收编成真档
        if (
          !activateProfile(store, figure, profile) &&
          profile === DEFAULT_PROFILE &&
          adoptLegacyPersona(store, figure, readFigure(this.opts.dataDir, figure, this.opts.cfg.field).persona)
        ) {
          activateProfile(store, figure, profile);
        }
        if (activeProfile(store, figure) !== profile) {
          const known = profileNames(store, figure);
          throw new Error('「' + figure + '」还没有「' + profile + '」这一档;现有档:' + (known.length === 0 ? '无' : known.join('、')));
        }
        writeStore(this.opts.dataDir, store);
        chars = Array.from(readPersona(store, figure, profile)).length;
      }
    }

    this.opts.persist?.({ figure });
    await this.opts.restart?.();

    const reading = readFigure(this.opts.dataDir, figure, this.opts.cfg.field);
    const name = reading.name === '' ? figure : reading.name;
    const message = builtin
      ? '已切到内置形象「' + name + '」。内置形象不带人格文本,解释段会用缺省文案。' + this.appearanceNote(figure)
      : profile === ''
        ? '已切到「' + name + '」,它还没有人设档,解释段会用缺省文案。' + this.appearanceNote(figure)
        : '已切到「' + name + '」的「' + profile + '」档(共 ' + chars + ' 字),系统前缀已重载。' + this.appearanceNote(figure);

    return { ok: true, figure, name, builtin, saved: false, profile, message };
  }

  /** 删一档；删掉的正是当前档时重载前缀，让解释段换回下一档。 */
  async dropProfile(raw: unknown): Promise<{ ok: boolean; message: string }> {
    const arg = (raw ?? {}) as { figure?: unknown; profile?: unknown };
    const figure = typeof arg.figure === 'string' && arg.figure.trim() !== ''
      ? arg.figure.trim()
      : this.currentFigure();
    if (!FIGURE_ID.test(figure)) throw new Error('形象 id 不合法:只接受小写字母、数字与连字符。');
    const profile = normalizeProfile(arg.profile);
    const store = readStore(this.opts.dataDir);
    const wasActive = activeProfile(store, figure) === profile;
    if (!removeProfile(store, figure, profile)) {
      throw new Error('「' + figure + '」没有「' + profile + '」这一档。');
    }
    writeStore(this.opts.dataDir, store);
    if (wasActive) await this.opts.restart?.();
    const rest = profileNames(store, figure);
    return {
      ok: true,
      message: '已删掉「' + profile + '」档,还剩:' + (rest.length === 0 ? '无' : rest.join('、')),
    };
  }

  /** 挂载时投一条状态事件；origin: internal 表示 World 的内部机制事件。 */
  async start(host: WorldHost): Promise<void> {
    const synced = syncEnvPromptOverride(this.opts.botDir);
    if (synced === 'upgraded' || synced === 'failed') {
      host.log.info(
        '形象人格:部署层环境模板 ' + (synced === 'upgraded' ? '已升级到当前版本' : '同步失败,保持原样')
        + '(部署目录 ' + this.opts.botDir + ')',
      );
    }
    const reading = this.read();
    const text = reading.id === ''
      ? '形象人格 World 已挂载:还没读到当前形象,这一段暂时是空的。'
      : reading.persona === ''
        ? '形象人格 World 已挂载:当前形象「' + reading.name + '」没有可用的人设文本。'
        : '形象人格 World 已挂载:当前形象「' + reading.name + '」,人设取自' + reading.field + '。';
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

  /** 宿主外观和这里选的形象不是一回事时提醒一句；一致就不啰嗦。 */
  private appearanceNote(figure: string): string {
    const showing = hostFigureId(this.opts.botDir);
    if (showing === figure) return '';
    return ' 桌面外观现在还是「' + (showing === '' ? '未设置' : showing) + '」,要一起换请在装扮页选同一个形象(Cortico 没给扩展改外观的接口)。';
  }

  private currentTool(): ToolDef {
    return {
      ...FIGURE_PERSONA_TOOL_DECLS[0],
      handler: async () => {
        const reading = this.read();
        const store = readStore(this.opts.dataDir);
        const names = profileViews(this.opts.dataDir, reading.id, this.opts.cfg.field, store).map((view) => view.name);
        const roster = names.length === 0 ? '还没有建档' : '现有档:' + names.join('、');
        if (reading.id === '') {
          return '没读到当前形象:宿主配置里没有 worlds.desktop-pet.skin.figure,这一段配置也没指定 figure。';
        }
        if (reading.persona === '') {
          return '当前形象是「' + reading.name + '」(' + reading.id + '),' + roster + ',没有可用的正文。';
        }
        return '当前形象是「' + reading.name + '」(' + reading.id + '),生效的是' + reading.field
          + ',共 ' + Array.from(reading.persona).length + ' 字;' + roster + '。';
      },
    };
  }

  private switchTool(): ToolDef {
    return {
      ...FIGURE_PERSONA_TOOL_DECLS[1],
      handler: async (args: Record<string, unknown>) => {
        const result = await this.switchTo(args);
        return result.message;
      },
    };
  }
}
