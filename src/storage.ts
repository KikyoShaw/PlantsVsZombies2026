import { invoke, isTauri } from '@tauri-apps/api/core';
import type { GameRecord, GameState, Profile } from './game/types';

const KEY = 'garden-guard:profile:v1';
const PENDING_KEY = `${KEY}:pending`;
const MAX_INTEGER = 4_294_967_295;
let writeQueue = Promise.resolve();
const defaultProfile = (): Profile => ({ version: 1, sound: true, totalRuns: 0, records: {} });
const integer = (value: unknown): number => typeof value === 'number' && Number.isFinite(value) ? Math.min(MAX_INTEGER, Math.max(0, Math.floor(value))) : 0;

function parseProfile(value: unknown): Profile {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('存档格式不正确');
  const raw = value as Record<string, unknown>;
  if (raw.version !== 1) throw new Error('存档版本不兼容');
  if (typeof raw.sound !== 'boolean' || !raw.records || typeof raw.records !== 'object' || Array.isArray(raw.records)) throw new Error('存档内容不完整');
  const profile: Profile = { version: 1, sound: raw.sound, totalRuns: integer(raw.totalRuns), records: {} };
  for (const [key, entry] of Object.entries(raw.records)) {
    if (!/^(campaign|endless):(easy|normal|hard|nightmare)$/.test(key) || !entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const record = entry as Record<string, unknown>;
    profile.records[key] = { wave: integer(record.wave), kills: integer(record.kills), score: integer(record.score), won: record.won === true };
  }
  return profile;
}

function browserProfile(key: string): Profile | null {
  const saved = localStorage.getItem(key);
  return saved === null ? null : parseProfile(JSON.parse(saved));
}

export async function loadProfile(): Promise<{ profile: Profile; warning?: string }> {
  await writeQueue.catch(() => {});
  if (isTauri()) {
    let pending: Profile | null = null;
    try { pending = browserProfile(PENDING_KEY); } catch { /* An invalid optional backup must not prevent native loading. */ }
    if (pending) {
      try {
        await saveProfile(pending);
        return { profile: pending, warning: '上次保存未完成，已从本地备份恢复设置与成绩。' };
      } catch {
        return { profile: pending, warning: '本地文件暂时无法保存，已恢复本地备份。你可以继续游戏。' };
      }
    }
    try {
      return { profile: parseProfile(await invoke<unknown>('load_profile')) };
    } catch {
      try {
        const backup = browserProfile(KEY);
        if (backup) return { profile: backup, warning: '本地文件读取失败，已恢复浏览器备份。你可以继续游戏。' };
      } catch { /* The native profile and its optional web backup may both be unavailable. */ }
      return { profile: defaultProfile(), warning: '本地记录读取失败，已使用默认设置。你可以继续游戏。' };
    }
  }
  try {
    return { profile: browserProfile(KEY) ?? defaultProfile() };
  } catch {
    return { profile: defaultProfile(), warning: '浏览器记录读取失败，已使用默认设置。' };
  }
}

export async function saveProfile(profile: Profile): Promise<void> {
  const snapshot = parseProfile(profile);
  const serialized = JSON.stringify(snapshot);
  writeQueue = writeQueue.catch(() => {}).then(async () => {
    if (isTauri()) {
      // Retain the requested snapshot until its native replacement has committed.
      try { localStorage.setItem(PENDING_KEY, serialized); } catch { /* Native saving also works when web storage is unavailable. */ }
      await invoke('save_profile', { profile: snapshot });
      try { localStorage.setItem(KEY, serialized); } catch { /* Native storage is the source of truth. */ }
      try { localStorage.removeItem(PENDING_KEY); } catch { /* Replaying this committed snapshot is harmless. */ }
    } else {
      localStorage.setItem(KEY, serialized);
    }
  });
  return writeQueue;
}

export function recordRun(profile: Profile, state: GameState): Profile {
  const next = parseProfile(profile);
  const key = `${state.mode}:${state.difficulty}`;
  const candidate: GameRecord = { wave: integer(state.completedWave), kills: integer(state.kills), score: integer(state.score), won: state.phase === 'won' };
  const previous = next.records[key];
  const better = !previous || (candidate.won && !previous.won) ||
    (candidate.won === previous.won && (candidate.wave > previous.wave || (candidate.wave === previous.wave && candidate.score > previous.score)));
  if (better) next.records[key] = candidate;
  next.totalRuns = integer(next.totalRuns + 1);
  return next;
}
