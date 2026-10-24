import type { ConfigGroup } from 'cortico/core/types.ts';

/** config.json 的 worlds.figure-persona 段，默认禁用；由 bot 声明或部署配置启用。 */
export interface FigurePersonaConfigSection {
  enabled: boolean;
  /** figure.json 里带人格文本的字段名。未知字段不影响形象包本身，读不到时这一段就是空的。 */
  field: string;
  /** 强制使用的形象包 id；留空时读宿主配置里正在显示的那个。 */
  figure: string;
}

export const FIGURE_PERSONA_DEFAULTS: FigurePersonaConfigSection = {
  enabled: false,
  field: 'persona',
  figure: '',
};

/** World 配置的 JSON Schema 声明；每条路径都要落在 worlds.figure-persona 段里。 */
export const FIGURE_PERSONA_CONFIG_GROUP: ConfigGroup = {
  id: 'world:figure-persona',
  owner: 'world:figure-persona',
  schema: {
    type: 'object',
    title: '形象人格',
    properties: {
      'worlds.figure-persona.field': {
        type: 'string',
        title: '人格字段名',
        description: '形象包 figure.json 里带人格正文的字段；默认 persona。',
        'x-hot': true,
      },
      'worlds.figure-persona.figure': {
        type: 'string',
        title: '固定形象',
        description: '留空时读宿主配置里正在显示的形象；填了就固定用它。',
        'x-hot': true,
      },
    },
  },
};
