/**
 * 人格外置存储。
 *
 * 形象包是宿主整目录导入的,新版本一覆盖,`figure.json` 里写的东西就跟着没了 ——
 * 所以人格正文不写在包里,落在 `dataDir/figure-persona/personas.json`。
 * 一个形象包可以挂多档人设(日常版 / 工作版 …),`active` 记当前生效的那一档,
 * 换包、换档都只改这一个文件。
 */
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** 存储格式版本;以后要迁移就靠它认旧文件。 */
export const PERSONA_STORE_VERSION = 1;

/** 从 `figure.json` 收编进来的内容,以及没额外建档时用的档名。 */
export const DEFAULT_PROFILE = '默认';

/** 档名长度上限:面板下拉要放得下,进提示词也不该占太多位。 */
const PROFILE_MAX_CHARS = 24;

export interface FigurePersonaRecord {
  /** 当前生效的档名;不在 profiles 里时按第一个档算。 */
  active: string;
  /** 档名 → 人格正文。 */
  profiles: Record<string, string>;
}

export interface PersonaStore {
  version: number;
  figures: Record<string, FigurePersonaRecord>;
}

/** 存储文件位置:在 figures/<id>/ 之外,形象包被覆盖也碰不到它。 */
export function personaStoreFile(dataDir: string): string {
  return join(dataDir, 'figure-persona', 'personas.json');
}

function emptyStore(): PersonaStore {
  return { version: PERSONA_STORE_VERSION, figures: {} };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

/**
 * 读存储。文件缺失、JSON 坏了、形状不对都退回空存储,不抛 ——
 * 这里读失败只该让前缀少一段,不该连累会话。
 */
export function readStore(dataDir: string): PersonaStore {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(personaStoreFile(dataDir), 'utf8'));
  } catch {
    return emptyStore();
  }
  const store = emptyStore();
  const figuresRaw = asRecord(asRecord(parsed)?.figures);
  if (!figuresRaw) return store;
  for (const [id, value] of Object.entries(figuresRaw)) {
    const profilesRaw = asRecord(asRecord(value)?.profiles);
    if (!profilesRaw) continue;
    const profiles: Record<string, string> = {};
    for (const [name, text] of Object.entries(profilesRaw)) {
      if (name.trim() !== '' && typeof text === 'string') profiles[name] = text;
    }
    if (Object.keys(profiles).length === 0) continue;
    const activeRaw = asRecord(value)?.active;
    const active = typeof activeRaw === 'string' && profiles[activeRaw] !== undefined
      ? activeRaw
      : Object.keys(profiles)[0];
    store.figures[id] = { active, profiles };
  }
  return store;
}

/** 原子写:先落 .tmp 再 rename,写到一半断电不会留下半截 JSON。 */
export function writeStore(dataDir: string, store: PersonaStore): void {
  const file = personaStoreFile(dataDir);
  mkdirSync(dirname(file), { recursive: true });
  const tmp = file + '.tmp';
  writeFileSync(tmp, JSON.stringify(store, null, 2) + '\n', 'utf8');
  renameSync(tmp, file);
}

/** 档名规整:压掉换行与多余空白;非法时抛错,面板会把这句话显示在状态行。 */
export function normalizeProfile(raw: unknown): string {
  if (typeof raw !== 'string') throw new Error('档名要是一个字符串。');
  const name = raw.replace(/\s+/g, ' ').trim();
  if (name === '') throw new Error('档名不能是空的。');
  if (Array.from(name).length > PROFILE_MAX_CHARS) {
    throw new Error('档名最多 ' + PROFILE_MAX_CHARS + ' 个字。');
  }
  return name;
}

/** 该形象的全部档名,按存储里的声明顺序。 */
export function profileNames(store: PersonaStore, figure: string): string[] {
  const record = store.figures[figure];
  return record ? Object.keys(record.profiles) : [];
}

/** 当前生效的档名;没有记录时是空串。 */
export function activeProfile(store: PersonaStore, figure: string): string {
  return store.figures[figure]?.active ?? '';
}

/** 取某一档正文;不给档名就取 active 档。没有时返回空串。 */
export function readPersona(store: PersonaStore, figure: string, profile?: string): string {
  const record = store.figures[figure];
  if (!record) return '';
  return record.profiles[profile ?? record.active] ?? '';
}

/** 写入一档并把它设为当前档;返回正文的字数。 */
export function setPersona(store: PersonaStore, figure: string, profile: string, text: string): number {
  const record = store.figures[figure] ?? { active: profile, profiles: {} };
  record.profiles[profile] = text;
  record.active = profile;
  store.figures[figure] = record;
  return Array.from(text).length;
}

/** 只切档、不动正文;档不存在时返回 false。 */
export function activateProfile(store: PersonaStore, figure: string, profile: string): boolean {
  const record = store.figures[figure];
  if (!record || record.profiles[profile] === undefined) return false;
  record.active = profile;
  return true;
}

/** 删一档;删掉的是当前档就顺位到剩下的第一档,删空了整条记录消失。 */
export function removeProfile(store: PersonaStore, figure: string, profile: string): boolean {
  const record = store.figures[figure];
  if (!record || record.profiles[profile] === undefined) return false;
  delete record.profiles[profile];
  const rest = Object.keys(record.profiles);
  if (rest.length === 0) {
    delete store.figures[figure];
    return true;
  }
  if (record.active === profile) record.active = rest[0];
  return true;
}

/**
 * 首次接管:存储里还没有这个形象、而包里原本带着人格时,把它收编成「默认」档。
 * 这样从旧版本升上来的用户第一次打开面板就能看到原来那段字,不会以为被清空了。
 */
export function adoptLegacyPersona(store: PersonaStore, figure: string, text: string): boolean {
  if (figure === '' || store.figures[figure] !== undefined) return false;
  if (text.trim() === '') return false;
  store.figures[figure] = { active: DEFAULT_PROFILE, profiles: { [DEFAULT_PROFILE]: text } };
  return true;
}
