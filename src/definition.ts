import { describeTools, type WorldDefinition } from 'cortico/world.ts';
import { FIGURE_PERSONA_DEFAULTS, type FigurePersonaConfigSection } from './config.ts';
import { FIGURE_PERSONA_TOOL_DECLS, FigurePersonaWorld } from './world.ts';

export const FIGURE_PERSONA: WorldDefinition<FigurePersonaConfigSection> = {
  id: 'figure-persona',
  label: '形象人格',
  defaults: () => ({ ...FIGURE_PERSONA_DEFAULTS }),
  // ctx.cfg 是 worlds.figure-persona 的活引用:热改的键现读即生效。
  create: (ctx) => new FigurePersonaWorld({
    cfg: ctx.cfg,
    timezone: ctx.timezone,
    botDir: ctx.botDir,
    dataDir: ctx.dataDir,
    // 面板「确定并生效」走这两条:写回 worlds.figure-persona 活引用,再重建本 World。
    persist: (patch) => ctx.persist(patch),
    restart: () => ctx.restart(),
  }),
  describe: {
    tools: describeTools(FIGURE_PERSONA_TOOL_DECLS, {
      figure_persona_current: {
        zh: '报当前正在显示的形象包、生效的人设档,以及这个形象一共有几档。',
        en: 'Reports the figure pack in use, the persona profile in effect, and how many profiles the figure has.',
      },
      figure_persona_switch: {
        zh: '切到当前形象的另一档人设,或换一个已装形象,然后重载系统前缀。',
        en: 'Switches to another persona profile of the current figure, or to another installed figure, then reloads the system prefix.',
      },
    }),
    events: [
      {
        type: 'figure_persona.mounted',
        description: {
          zh: 'World 挂载完成,附当前形象与人格文本的来源。',
          en: 'The World was mounted, with the current figure and where its persona text came from.',
        },
      },
    ],
  },
};
