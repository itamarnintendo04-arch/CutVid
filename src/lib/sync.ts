import { create } from 'zustand';
import type { Project } from '../types';
import { useStore } from '../store';
import { dbAll, dbDel, dbSet } from './db';
import { cloudDelete, cloudFetch, cloudList, cloudSave, currentUserId, supabase } from './supabase';

export type SyncStatus = 'off' | 'idle' | 'syncing' | 'error';

interface SyncState {
  status: SyncStatus;
  detail: string;
  /** Bumped whenever local projects changed because of a sync, so lists can reload. */
  rev: number;
}

export const useSync = create<SyncState>(() => ({ status: 'off', detail: '', rev: 0 }));
const set = (s: Partial<SyncState>) => useSync.setState(s);

// Projects this device has seen in the cloud. If one of them later disappears from the cloud it
// was deleted on another device, so it is removed here too instead of being uploaded again.
const knownKey = (uid: string) => `cutvid:synced:${uid}`;
const known = (uid: string): Set<string> => {
  try {
    return new Set(JSON.parse(localStorage.getItem(knownKey(uid)) || '[]'));
  } catch {
    return new Set();
  }
};
const saveKnown = (uid: string, ids: Set<string>) => localStorage.setItem(knownKey(uid), JSON.stringify([...ids]));

let running: Promise<void> | null = null;

/** Two-way sync of every project: newest version wins, deletions propagate. */
export function syncAll(): Promise<void> {
  running ??= doSyncAll().finally(() => (running = null));
  return running;
}

async function doSyncAll() {
  const uid = await currentUserId();
  if (!uid) return set({ status: 'off', detail: '' });
  set({ status: 'syncing', detail: '' });
  try {
    const [cloud, local] = await Promise.all([cloudList(), dbAll<Project>('projects')]);
    const seen = known(uid);
    const cloudIds = new Set(cloud.map((c) => c.id));
    const localById = new Map(local.map((p) => [p.id, p]));
    const openId = useStore.getState().screen === 'editor' ? useStore.getState().project.id : null;
    let changed = false;
    const skipped: string[] = [];

    for (const row of cloud) {
      const mine = localById.get(row.id);
      const cloudTime = new Date(row.updated_at).getTime();
      // Never replace the project that is open right now; it will upload itself.
      if (row.id !== openId && (!mine || cloudTime > mine.updatedAt + 1000)) {
        await dbSet('projects', row.id, await cloudFetch(row.id));
        changed = true;
      } else if (mine && mine.updatedAt > cloudTime + 1000) {
        skipped.push(...(await cloudSave(mine)));
      }
      seen.add(row.id);
    }
    for (const p of local) {
      if (cloudIds.has(p.id)) continue;
      if (seen.has(p.id) && p.id !== openId) {
        await dbDel('projects', p.id); // deleted on another device
        seen.delete(p.id);
        changed = true;
      } else if (p.clips.length || p.assets.length) {
        skipped.push(...(await cloudSave(p)));
        seen.add(p.id);
      }
    }
    saveKnown(uid, seen);
    set({ status: 'idle', detail: skipped.length ? `Not uploaded: ${[...new Set(skipped)].slice(0, 3).join(', ')}` : '', rev: useSync.getState().rev + (changed ? 1 : 0) });
  } catch (e) {
    set({ status: 'error', detail: (e as Error).message });
  }
}

let pushTimer: ReturnType<typeof setTimeout> | undefined;

async function pushCurrent() {
  const uid = await currentUserId();
  if (!uid) return;
  const p = useStore.getState().project;
  if (!p.clips.length && !p.assets.length) return;
  set({ status: 'syncing', detail: '' });
  try {
    const skipped = await cloudSave(p);
    const seen = known(uid);
    seen.add(p.id);
    saveKnown(uid, seen);
    set({ status: 'idle', detail: skipped.length ? `Not uploaded: ${skipped.slice(0, 3).join(', ')}` : '' });
  } catch (e) {
    set({ status: 'error', detail: (e as Error).message });
  }
}

/** Delete a project everywhere. */
export async function deleteEverywhere(id: string) {
  const uid = await currentUserId();
  if (!uid) return;
  const seen = known(uid);
  seen.delete(id);
  saveKnown(uid, seen);
  await cloudDelete(id).catch(() => {});
}

let started = false;
/** Start background syncing: upload edits a few seconds after they stop, sync all on sign-in. */
export function startSync() {
  if (started) return;
  started = true;
  useStore.subscribe((s, prev) => {
    if (s.project === prev.project || s.screen !== 'editor' || useSync.getState().status === 'off') return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(pushCurrent, 5000);
  });
  const c = supabase();
  if (!c) return;
  c.auth.onAuthStateChange((_e, session) => {
    if (!session) return set({ status: 'off', detail: '' });
    if (useSync.getState().status === 'off') set({ status: 'idle' });
    // Defer: Supabase forbids awaiting its own client inside this callback.
    setTimeout(syncAll, 0);
  });
  window.addEventListener('online', () => void syncAll());
}
