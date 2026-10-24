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
  }),
  describe: {
    tools: describeTools(FIGURE_PERSONA_TOOL_DECLS, {
      figure_persona_current: {
        zh: '报当前正在显示的形象包,以及它有没有携带人格文本。',
        en: 'Reports the figure pack the host is showing and whether it carries persona text.',
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
