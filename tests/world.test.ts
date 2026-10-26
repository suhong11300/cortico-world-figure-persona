import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext, World } from 'cortico/core/types.ts';
import { renderTemplate } from 'cortico/core/template.ts';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { FIGURE_PERSONA } from '../src/definition.ts';
import { FigurePersonaWorld, type FigureApplyResult, type FigurePanelState } from '../src/world.ts';
import { readPersona, readStore } from '../src/store.ts';
import { FakeHost } from './helpers/fake-host.ts';

let scratchDir: string;
let botDir: string;
let dataDir: string;

beforeEach(() => {
  scratchDir = mkdtempSync(join(tmpdir(), 'figure-persona-'));
  botDir = join(scratchDir, 'deployment');
  dataDir = join(botDir, 'data');
  mkdirSync(dataDir, { recursive: true });
});
afterEach(() => rmSync(scratchDir, { recursive: true, force: true }));

const writeJson = (path: string, value: unknown): void => writeFileSync(path, JSON.stringify(value, null, 2));

/** 造一份宿主部署:config.json 记当前形象,data/figures/<id>/figure.json 是形象包。 */
function seedHost(figure: string, manifest?: Record<string, unknown>): void {
  writeJson(join(botDir, 'config.json'), { worlds: { 'desktop-pet': { enabled: true, skin: { figure } } } });
  if (manifest) {
    mkdirSync(join(dataDir, 'figures', figure), { recursive: true });
    writeJson(join(dataDir, 'figures', figure, 'figure.json'), manifest);
  }
}

const ctxOf = () => fakeWorldContext(FIGURE_PERSONA, { scratchDir });

/** envPromptVars 允许同步或异步、也允许 null;测试里统一成对象。 */
const varsOf = async (world: World): Promise<Record<string, string>> =>
  (await world.envPromptVars()) ?? {};

const templateText = (vars: Record<string, string>): string =>
  renderTemplate(readFileSync(new URL('../src/ENV_PROMPT.md', import.meta.url), 'utf8'), vars);

/** 造一个具体类实例,好在测试里直接问 currentFigure 这类自身方法。 */
const worldOf = (): FigurePersonaWorld => FIGURE_PERSONA.create(ctxOf()) as FigurePersonaWorld;

/** 走 webUi() 声明的面板数据面;invoke 是可选成员,缺了就是契约破了。 */
const panel = (world: World, method: string, args: unknown[] = []): Promise<unknown> => {
  const decl = world.webUi?.();
  const call = decl?.invoke;
  if (!call) throw new Error('webUi().invoke 没声明');
  return call.call(decl, 'figure-persona', method, args);
};

const toolOf = (world: World, name: string) => world.tools().find((t) => t.name === name)!;

/** 部署层的环境模板:存在就会遮蔽模块模板。 */
const overridePath = (): string => join(botDir, 'worlds', 'figure-persona', 'ENV_PROMPT.md');
/** 0.1.0 自动落盘的两行模板,内容与 src/world.ts 的 LEGACY_ENV_PROMPTS 相同。 */
const LEGACY_TEMPLATE = [
  '你现在的外形是「{{figure_persona.name}}」(形象包 id:{{figure_persona.figure}})。外形只说明你此刻的样子,不改变你是谁。',
  '{{figure_persona.persona | 这个形象包没有携带人格文本,保持你原本的人设即可。}}',
  '',
].join('\n');

describe('形象人格 World', () => {
  it('干装载不报失败:装载器会接受它', async () => {
    const report = await dryMountWorld(FIGURE_PERSONA, { scratchDir });
    expect(report.failures).toEqual([]);
  });

  it('读宿主配置里正在显示的形象,把形象包携带的人格正文放进变量', async () => {
    seedHost('gpt-niang', { manifest: 2, api: 2, id: 'gpt-niang', name: 'GPT 娘', persona: '说话轻声细语。' });
    const vars = await varsOf(FIGURE_PERSONA.create(ctxOf()));
    expect(vars['figure_persona.figure']).toBe('gpt-niang');
    expect(vars['figure_persona.name']).toBe('GPT 娘');
    expect(vars['figure_persona.persona']).toBe('说话轻声细语。');
  });

  it('name 与 persona 写成语言对象时按 zh 取,不退回 id', async () => {
    seedHost('gpt-niang', {
      name: { zh: 'GPT娘 · 白龙', en: 'GPT White Dragon' },
      persona: { zh: '说话像朋友。', en: 'Like a friend.' },
    });
    const vars = await varsOf(FIGURE_PERSONA.create(ctxOf()));
    expect(vars['figure_persona.name']).toBe('GPT娘 · 白龙');
    expect(vars['figure_persona.persona']).toBe('说话像朋友。');
  });

  it('persona 对象里的 text 优先于语言键', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: { text: '先看这里。', zh: '不该用这句。' } });
    const vars = await varsOf(FIGURE_PERSONA.create(ctxOf()));
    expect(vars['figure_persona.persona']).toBe('先看这里。');
  });

  it('配置里指定 figure 时压过宿主配置', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: 'A' });
    mkdirSync(join(dataDir, 'figures', 'whale'), { recursive: true });
    writeJson(join(dataDir, 'figures', 'whale', 'figure.json'), { name: '鲸鱼', persona: 'B' });
    const ctx = ctxOf();
    ctx.persist({ figure: 'whale' });
    const vars = await varsOf(FIGURE_PERSONA.create(ctx));
    expect(vars['figure_persona.figure']).toBe('whale');
    expect(vars['figure_persona.persona']).toBe('B');
  });

  it('形象包缺失时不抛,人格正文是空串', async () => {
    seedHost('not-installed');
    const vars = await varsOf(FIGURE_PERSONA.create(ctxOf()));
    expect(vars['figure_persona.figure']).toBe('not-installed');
    expect(vars['figure_persona.name']).toBe('not-installed');
    expect(vars['figure_persona.persona']).toBe('');
  });

  it('宿主配置读不到时整段留空,不抛', async () => {
    const vars = await varsOf(FIGURE_PERSONA.create(ctxOf()));
    expect(vars['figure_persona.figure']).toBe('');
  });

  it('ENV_PROMPT.md 渲染出形象名与人格正文', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '说话轻声细语。' });
    const text = templateText(await varsOf(FIGURE_PERSONA.create(ctxOf())));
    expect(text).toContain('GPT 娘');
    expect(text).toContain('gpt-niang');
    expect(text).toContain('说话轻声细语。');
  });

  it('形象包没带人格时,模板用缺省文案兜底', async () => {
    seedHost('plain', { name: '素体' });
    const text = templateText(await varsOf(FIGURE_PERSONA.create(ctxOf())));
    expect(text).toContain('没有携带人格文本');
    expect(text).not.toContain('figure_persona');
  });

  it('figure_persona_current 报当前形象与人格来源', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '说话轻声细语。' });
    const reply = String(await toolOf(FIGURE_PERSONA.create(ctxOf()), 'figure_persona_current').handler({}, {} as ToolCallContext));
    expect(reply).toContain('GPT 娘');
    expect(reply).toContain('persona');
  });

  it('挂载时投一条 figure_persona.mounted 事件,origin 是 internal', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '说话轻声细语。' });
    const world = FIGURE_PERSONA.create(ctxOf());
    const host = new FakeHost();
    await world.start(host);
    expect(host.events.map((e) => e.type)).toEqual(['figure_persona.mounted']);
    expect(host.events[0].origin).toBe('internal');
    await world.stop();
  });

  it('start 把部署层那份旧版自动模板升级到当前版本', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '说话轻声细语。' });
    mkdirSync(join(botDir, 'worlds', 'figure-persona'), { recursive: true });
    writeFileSync(overridePath(), LEGACY_TEMPLATE, 'utf8');
    const world = FIGURE_PERSONA.create(ctxOf());
    await world.start(new FakeHost());
    const upgraded = readFileSync(overridePath(), 'utf8');
    expect(upgraded).toContain('当前人设档:');
    expect(upgraded).toBe(readFileSync(new URL('../src/ENV_PROMPT.md', import.meta.url), 'utf8'));
    await world.stop();
  });

  it('start 不动用户手改过的部署层模板', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '说话轻声细语。' });
    mkdirSync(join(botDir, 'worlds', 'figure-persona'), { recursive: true });
    writeFileSync(overridePath(), '我自己写的模板:{{figure_persona.name}}\n', 'utf8');
    const world = FIGURE_PERSONA.create(ctxOf());
    await world.start(new FakeHost());
    expect(readFileSync(overridePath(), 'utf8')).toBe('我自己写的模板:{{figure_persona.name}}\n');
    await world.stop();
  });

  it('部署层没有模板时 start 不新建任何文件', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '说话轻声细语。' });
    const world = FIGURE_PERSONA.create(ctxOf());
    await world.start(new FakeHost());
    expect(existsSync(overridePath())).toBe(false);
    await world.stop();
  });

  it('面板 state 列出已装形象与内置形象,标出正在显示的那个', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '说话轻声细语。' });
    mkdirSync(join(dataDir, 'figures', 'another'), { recursive: true });
    writeJson(join(dataDir, 'figures', 'another', 'figure.json'), { name: '另一个' });
    const state = await panel(worldOf(), 'state') as FigurePanelState;
    expect(state.picked).toBe('gpt-niang');
    expect(state.persona).toBe('说话轻声细语。');
    expect(state.options.map((o) => o.id)).toEqual(['another', 'gpt-niang', 'coo', 'whale']);
    expect(state.options.find((o) => o.id === 'gpt-niang')).toMatchObject({ showing: true, builtin: false });
    expect(state.options.find((o) => o.id === 'coo')).toMatchObject({ builtin: true, showing: false });
    expect(state.store).toContain('personas.json');
  });

  it('面板 state 把包里的旧人格虚拟成一档默认档', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '包里旧人格。' });
    const state = await panel(worldOf(), 'state') as FigurePanelState;
    const option = state.options.find((o) => o.id === 'gpt-niang')!;
    expect(option.profiles).toEqual([{ name: '默认', persona: '包里旧人格。', active: true }]);
  });

  it('还没有档位时,包里的人格按「默认」档报出去', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '包里旧人格。' });
    const world = worldOf();
    const state = await panel(world, 'state') as FigurePanelState;
    expect(state.profile).toBe('默认');
    expect(state.source).toBe('pack');
    expect(await varsOf(world)).toMatchObject({ 'figure_persona.profile': '默认' });
  });

  it('切到只存在于包里的「默认」档时,先把它收编成真档', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '包里旧人格。' });
    const world = worldOf();
    expect(readStore(dataDir).figures['gpt-niang']).toBeUndefined();
    const result = await panel(world, 'switch', [{ figure: 'gpt-niang', profile: '默认' }]) as FigureApplyResult;
    expect(result).toMatchObject({ ok: true, profile: '默认' });
    // 收编之后:figure.json 不动,正文进了档位存储
    expect(readPersona(readStore(dataDir), 'gpt-niang', '默认')).toBe('包里旧人格。');
    expect(await varsOf(world)).toMatchObject({
      'figure_persona.profile': '默认',
      'figure_persona.persona': '包里旧人格。',
    });
  });

  it('面板 apply 把人格写进档位存储,figure.json 原样不动', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '旧人格。' });
    const before = readFileSync(join(dataDir, 'figures', 'gpt-niang', 'figure.json'), 'utf8');
    const world = worldOf();
    const result = await panel(world, 'apply', [
      { figure: 'gpt-niang', profile: '工作版', persona: '新人格:说话短一点。' },
    ]) as FigureApplyResult;
    expect(result).toMatchObject({ ok: true, figure: 'gpt-niang', saved: true, builtin: false, profile: '工作版' });
    expect(result.message).toContain('系统前缀已重载');
    expect(result.message).toContain('形象包更新不会冲掉');

    // figure.json 一个字节都没变(旧版本会在这里写回人格)
    expect(readFileSync(join(dataDir, 'figures', 'gpt-niang', 'figure.json'), 'utf8')).toBe(before);

    const store = readStore(dataDir);
    expect(readPersona(store, 'gpt-niang', '工作版')).toBe('新人格:说话短一点。');
    // 首次接管:包里原本的人格被收编成「默认」档,没丢
    expect(readPersona(store, 'gpt-niang', '默认')).toBe('旧人格。');
    expect(await varsOf(world)).toMatchObject({
      'figure_persona.persona': '新人格:说话短一点。',
      'figure_persona.profile': '工作版',
    });
  });

  it('形象包换新版本覆盖 figure.json 后,人设档还在', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '包里旧人格。' });
    await panel(worldOf(), 'apply', [
      { figure: 'gpt-niang', profile: '工作版', persona: '工作档:短句、不寒暄。' },
    ]);

    // 宿主导入新版本形象包:整目录替换,figure.json 被全新内容覆盖
    writeJson(join(dataDir, 'figures', 'gpt-niang', 'figure.json'), {
      name: 'GPT娘 · 白龙',
      version: '2.0.0',
      persona: '新版包里自带的人格(会被档位盖住)。',
    });

    const vars = await varsOf(worldOf());
    expect(vars['figure_persona.name']).toBe('GPT娘 · 白龙');
    expect(vars['figure_persona.persona']).toBe('工作档:短句、不寒暄。');
    expect(vars['figure_persona.profile']).toBe('工作版');
    expect(vars['figure_persona.profiles']).toBe('默认、工作版');
  });

  it('可以给同一个形象建多档,apply 会切到刚写的那一档', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘' });
    const world = worldOf();
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '日常版', persona: '日常:A' }]);
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '工作版', persona: '工作:B' }]);

    const store = readStore(dataDir);
    expect(Object.keys(store.figures['gpt-niang'].profiles)).toEqual(['日常版', '工作版']);
    expect(store.figures['gpt-niang'].active).toBe('工作版');
    expect(await varsOf(world)).toMatchObject({ 'figure_persona.persona': '工作:B' });
  });

  it('面板 switch 只切档,不碰正文', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘' });
    const world = worldOf();
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '日常版', persona: '日常:A' }]);
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '工作版', persona: '工作:B' }]);

    const result = await panel(world, 'switch', [{ figure: 'gpt-niang', profile: '日常版' }]) as FigureApplyResult;
    expect(result).toMatchObject({ ok: true, profile: '日常版', saved: false });
    expect(result.message).toContain('日常版');
    const store = readStore(dataDir);
    expect(store.figures['gpt-niang'].active).toBe('日常版');
    expect(readPersona(store, 'gpt-niang', '工作版')).toBe('工作:B');
  });

  it('面板 switch 到不存在的档时报错,列出已有档', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘' });
    const world = worldOf();
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '日常版', persona: 'A' }]);
    await expect(panel(world, 'switch', [{ figure: 'gpt-niang', profile: '工作版' }]))
      .rejects.toThrow('工作版');
  });

  it('面板 remove 删掉当前档后顺位到剩下的第一档', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘' });
    const world = worldOf();
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '日常版', persona: 'A' }]);
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '工作版', persona: 'B' }]);

    const result = await panel(world, 'remove', [{ figure: 'gpt-niang', profile: '工作版' }]) as { ok: boolean; message: string };
    expect(result.ok).toBe(true);
    expect(result.message).toContain('日常版');
    const store = readStore(dataDir);
    expect(profileNamesOf(store, 'gpt-niang')).toEqual(['日常版']);
    expect(await varsOf(world)).toMatchObject({ 'figure_persona.persona': 'A' });
  });

  it('面板 apply 选内置形象时不写档位,回执说清楚用缺省文案', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '旧人格。' });
    const world = worldOf();
    const result = await panel(world, 'apply', [
      { figure: 'coo', persona: '随便写' },
    ]) as FigureApplyResult;
    expect(result).toMatchObject({ ok: true, builtin: true, saved: false });
    expect(result.message).toContain('缺省文案');
    expect(world.currentFigure()).toBe('coo');
    expect(readStore(dataDir).figures.coo).toBeUndefined();
  });

  it('figure_persona_switch 工具能切档,并把档位写进当前配置', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘' });
    const ctx = ctxOf();
    const world = FIGURE_PERSONA.create(ctx) as FigurePersonaWorld;
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '日常版', persona: '日常:A' }]);
    await panel(world, 'apply', [{ figure: 'gpt-niang', profile: '工作版', persona: '工作:B' }]);

    const reply = String(await toolOf(world, 'figure_persona_switch').handler({ profile: '日常版' }, {} as ToolCallContext));
    expect(reply).toContain('日常版');
    expect(readStore(dataDir).figures['gpt-niang'].active).toBe('日常版');
  });

  it('面板调用未知面板或未知方法时报错', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '旧人格。' });
    const decl = worldOf().webUi();
    const call = decl?.invoke;
    if (!call) throw new Error('webUi().invoke 没声明');
    await expect(call.call(decl, 'nope', 'state', [])).rejects.toThrow();
    await expect(call.call(decl, 'figure-persona', 'nope', [])).rejects.toThrow();
  });
});

/** 只取档名,断言顺序用。 */
function profileNamesOf(store: ReturnType<typeof readStore>, figure: string): string[] {
  const record = store.figures[figure];
  return record ? Object.keys(record.profiles) : [];
}
