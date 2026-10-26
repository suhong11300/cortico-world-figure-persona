import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DEFAULT_PROFILE,
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
} from '../src/store.ts';

let dataDir: string;

beforeEach(() => {
  dataDir = mkdtempSync(join(tmpdir(), 'figure-persona-store-'));
});
afterEach(() => rmSync(dataDir, { recursive: true, force: true }));

describe('档位存储', () => {
  it('没有文件时读回空存储,不抛', () => {
    expect(readStore(dataDir)).toEqual({ version: 1, figures: {} });
  });

  it('文件坏了也退回空存储,不抛', () => {
    const file = personaStoreFile(dataDir);
    mkdirSync(join(dataDir, 'figure-persona'), { recursive: true });
    writeFileSync(file, '{ 这不是 JSON', 'utf8');
    expect(readStore(dataDir)).toEqual({ version: 1, figures: {} });
  });

  it('写一档后能读回,并且它就是当前档', () => {
    const store = readStore(dataDir);
    expect(setPersona(store, 'gpt-niang', '日常版', '说话像朋友。')).toBe(6);
    writeStore(dataDir, store);
    const back = readStore(dataDir);
    expect(profileNames(back, 'gpt-niang')).toEqual(['日常版']);
    expect(readPersona(back, 'gpt-niang')).toBe('说话像朋友。');
  });

  it('一个形象挂多档,谁也不覆盖谁', () => {
    const store = readStore(dataDir);
    setPersona(store, 'gpt-niang', '日常版', '日常:A');
    setPersona(store, 'gpt-niang', '工作版', '工作:B');
    expect(profileNames(store, 'gpt-niang')).toEqual(['日常版', '工作版']);
    expect(readPersona(store, 'gpt-niang', '日常版')).toBe('日常:A');
    expect(readPersona(store, 'gpt-niang', '工作版')).toBe('工作:B');
    expect(store.figures['gpt-niang'].active).toBe('工作版');
  });

  it('切档只动 active,不动正文', () => {
    const store = readStore(dataDir);
    setPersona(store, 'gpt-niang', '日常版', 'A');
    setPersona(store, 'gpt-niang', '工作版', 'B');
    expect(activateProfile(store, 'gpt-niang', '日常版')).toBe(true);
    expect(store.figures['gpt-niang'].active).toBe('日常版');
    expect(readPersona(store, 'gpt-niang', '工作版')).toBe('B');
  });

  it('切到不存在的档返回 false,不改存储', () => {
    const store = readStore(dataDir);
    setPersona(store, 'gpt-niang', '日常版', 'A');
    expect(activateProfile(store, 'gpt-niang', '工作版')).toBe(false);
    expect(store.figures['gpt-niang'].active).toBe('日常版');
  });

  it('删掉当前档时顺位到剩下的第一档', () => {
    const store = readStore(dataDir);
    setPersona(store, 'gpt-niang', '日常版', 'A');
    setPersona(store, 'gpt-niang', '工作版', 'B');
    expect(removeProfile(store, 'gpt-niang', '工作版')).toBe(true);
    expect(store.figures['gpt-niang'].active).toBe('日常版');
    expect(profileNames(store, 'gpt-niang')).toEqual(['日常版']);
  });

  it('删光了整条记录消失', () => {
    const store = readStore(dataDir);
    setPersona(store, 'gpt-niang', '日常版', 'A');
    expect(removeProfile(store, 'gpt-niang', '日常版')).toBe(true);
    expect(store.figures['gpt-niang']).toBeUndefined();
    expect(profileNames(store, 'gpt-niang')).toEqual([]);
  });

  it('首次接管只收编一次,已有记录时不动', () => {
    const store = readStore(dataDir);
    expect(adoptLegacyPersona(store, 'plain', '  ')).toBe(false);
    expect(adoptLegacyPersona(store, 'gpt-niang', '包里原本的人格。')).toBe(true);
    expect(profileNames(store, 'gpt-niang')).toEqual([DEFAULT_PROFILE]);
    expect(readPersona(store, 'gpt-niang')).toBe('包里原本的人格。');
    expect(adoptLegacyPersona(store, 'gpt-niang', '不该覆盖。')).toBe(false);
    expect(readPersona(store, 'gpt-niang')).toBe('包里原本的人格。');
  });

  it('档名规整:压空白、拒空、拒超长', () => {
    expect(normalizeProfile('  工作  版 ')).toBe('工作 版');
    expect(() => normalizeProfile('   ')).toThrow();
    expect(() => normalizeProfile(42)).toThrow();
    expect(() => normalizeProfile('一'.repeat(25))).toThrow();
    expect(normalizeProfile('一'.repeat(24))).toHaveLength(24);
  });

  it('原子写不留临时文件', () => {
    const store = readStore(dataDir);
    setPersona(store, 'gpt-niang', '日常版', 'A');
    writeStore(dataDir, store);
    expect(existsSync(personaStoreFile(dataDir) + '.tmp')).toBe(false);
    expect(existsSync(personaStoreFile(dataDir))).toBe(true);
  });

  it('存储里混进非字符串的正文时跳过该档', () => {
    mkdirSync(join(dataDir, 'figure-persona'), { recursive: true });
    writeFileSync(
      personaStoreFile(dataDir),
      JSON.stringify({ version: 1, figures: { x: { active: 'a', profiles: { a: 'ok', b: 42 } } } }),
      'utf8',
    );
    const store = readStore(dataDir);
    expect(profileNames(store, 'x')).toEqual(['a']);
  });
});
