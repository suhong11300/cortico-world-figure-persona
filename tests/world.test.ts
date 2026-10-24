import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ToolCallContext, World } from 'cortico/core/types.ts';
import { renderTemplate } from 'cortico/core/template.ts';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { FIGURE_PERSONA } from '../src/definition.ts';
import { FigurePersonaWorld, type FigureApplyResult, type FigurePanelState } from '../src/world.ts';
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
    const tool = FIGURE_PERSONA.create(ctxOf()).tools().find((t) => t.name === 'figure_persona_current')!;
    const reply = String(await tool.handler({}, {} as ToolCallContext));
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
  });

  it('面板 apply 把人格写回 figure.json,留一份备份,并让新值进变量', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '旧人格。' });
    const world = worldOf();
    const result = await panel(world, 'apply', [
      { figure: 'gpt-niang', persona: '新人格:说话短一点。' },
    ]) as FigureApplyResult;
    expect(result).toMatchObject({ ok: true, figure: 'gpt-niang', saved: true, builtin: false });
    expect(result.message).toContain('系统前缀已重载');
    const saved = JSON.parse(readFileSync(join(dataDir, 'figures', 'gpt-niang', 'figure.json'), 'utf8'));
    expect(saved.persona).toBe('新人格:说话短一点。');
    expect(saved.name).toBe('GPT 娘');
    const backup = JSON.parse(readFileSync(join(dataDir, 'figures', 'gpt-niang', 'figure.json.bak-cortina'), 'utf8'));
    expect(backup.persona).toBe('旧人格。');
    expect(await varsOf(world)).toMatchObject({ 'figure_persona.persona': '新人格:说话短一点。' });
  });

  it('面板 apply 保留 persona 里其余语言键', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: { zh: '旧中文。', en: 'Old.' } });
    const world = worldOf();
    await panel(world, 'apply', [{ figure: 'gpt-niang', persona: '新中文。' }]);
    const saved = JSON.parse(readFileSync(join(dataDir, 'figures', 'gpt-niang', 'figure.json'), 'utf8'));
    expect(saved.persona).toEqual({ zh: '新中文。', en: 'Old.' });
  });

  it('面板 apply 选内置形象时不写文件,回执说清楚用缺省文案', async () => {
    seedHost('gpt-niang', { name: 'GPT 娘', persona: '旧人格。' });
    const world = worldOf();
    const result = await panel(world, 'apply', [
      { figure: 'coo', persona: '随便写' },
    ]) as FigureApplyResult;
    expect(result).toMatchObject({ ok: true, builtin: true, saved: false });
    expect(result.message).toContain('缺省文案');
    expect(world.currentFigure()).toBe('coo');
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
