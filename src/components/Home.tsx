import { useEffect, useState } from 'react';
import { Bell, Clapperboard, CloudAlert, CloudCheck, FolderOpen, MessageSquareText, Plus, RefreshCw, Settings, Trash2, X } from 'lucide-react';
import { SettingsPanel } from './Panels';
import { emptyProject, useStore } from '../store';
import { dbAll, dbDel, dbSet } from '../lib/db';
import { media } from '../engine/media';
import { useT } from '../lib/i18n';
import { checkForUpdate, notify, notifyState, requestNotify, type NotifyState } from '../lib/notify';
import { SITE_URL, downloadMissing, useSignedIn } from '../lib/supabase';
import { deleteEverywhere, syncAll, useSync } from '../lib/sync';
import type { Project } from '../types';
import { projectDuration } from '../types';
import { AspectPicker } from './AspectPicker';

export async function openProject(p: Project) {
  // Media that only exists in the cloud is fetched now; whatever is still missing shows a warning badge.
  useStore.getState().setBusy('loading');
  try {
    await downloadMissing(p);
  } catch {
    await media.restore(p.assets);
  } finally {
    useStore.getState().setBusy(null);
  }
  const st = useStore.getState();
  st.loadProject(p);
  st.setScreen('editor');
  localStorage.setItem('cutvid:last', p.id);
}

type HomeTab = 'create' | 'projects' | 'settings';

const NOTIFY_DISMISSED = 'cutvid:notify-dismissed';

export function Home() {
  const t = useT();
  const [tab, setTab] = useState<HomeTab>('create');
  const [list, setList] = useState<Project[]>([]);
  const [aspect, setAspect] = useState({ w: 1920, h: 1080 });
  const [notifyPerm, setNotifyPerm] = useState<NotifyState>('unsupported');
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(NOTIFY_DISMISSED) === '1');
  const [update, setUpdate] = useState<number | null>(null);
  const sync = useSync();
  const signedIn = useSignedIn();

  const refresh = () => dbAll<Project>('projects').then((all) => setList(all.sort((a, b) => b.updatedAt - a.updatedAt)));
  // Reload the list whenever a sync pulled or removed projects.
  useEffect(() => {
    refresh();
  }, [sync.rev]);
  useEffect(() => {
    syncAll();
    notifyState().then(setNotifyPerm);
    checkForUpdate(SITE_URL).then((v) => {
      setUpdate(v);
      if (v) notify('CutVid', t('updateAvailable'));
    });
  }, []);

  const create = async () => {
    const p = { ...emptyProject(t('untitled')), width: aspect.w, height: aspect.h };
    await dbSet('projects', p.id, p);
    await openProject(p);
  };

  const remove = async (p: Project) => {
    if (!confirm(`${t('delete')} "${p.name}"?`)) return;
    await dbDel('projects', p.id);
    await deleteEverywhere(p.id);
    // Media blobs are only deleted when no other local project references them.
    const others = (await dbAll<Project>('projects')).flatMap((x) => x.assets.map((a) => a.id));
    for (const a of p.assets) if (!others.includes(a.id)) media.release(a.id, true);
    refresh();
  };

  const enable = async () => {
    const res = await requestNotify();
    setNotifyPerm(res);
    if (res === 'granted') notify('CutVid', t('notifyEnabled'));
  };

  const tabs = [
    { id: 'create', icon: Clapperboard },
    { id: 'projects', icon: FolderOpen },
    { id: 'settings', icon: Settings },
  ] as const;

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <img src="./icon.svg" alt="" width={32} height={32} />
          <b>CutVid</b>
        </div>
      </header>

      <nav className="home-tabs" aria-label="CutVid">
        {tabs.map(({ id, icon: Icon }) => (
          <button key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)} aria-current={tab === id}>
            <Icon size={19} />
            {t(id)}
          </button>
        ))}
      </nav>

      {tab === 'settings' && (
        <div className="home-body settings-body">
          <SettingsPanel />
        </div>
      )}
      {tab === 'create' && (
      <div className="home-body">
        {update && <div className="banner accent">{t('updateAvailable')}</div>}
        {notifyPerm === 'prompt' && !dismissed && (
          <div className="banner">
            <Bell size={20} />
            <div>
              <b>{t('notifyTitle')}</b>
              <p>{t('notifyBody')}</p>
            </div>
            <button className="primary" onClick={enable}>
              {t('notifyAllow')}
            </button>
            <button
              className="icon-btn"
              aria-label={t('close')}
              onClick={() => {
                localStorage.setItem(NOTIFY_DISMISSED, '1');
                setDismissed(true);
              }}
            >
              <X size={16} />
            </button>
          </div>
        )}

        <section className="home-new">
          <h2>{t('newProject')}</h2>
          <AspectPicker width={aspect.w} height={aspect.h} onPick={(w, h) => setAspect({ w, h })} />
          <button className="primary big" onClick={create}>
            <Plus size={20} /> {t('createProject')}
          </button>
        </section>

      </div>
      )}
      {tab === 'projects' && !signedIn && (
        <div className="home-body">
          <div className="sign-in-gate">
            <FolderOpen size={36} />
            <p>{t('signInForProjects')}</p>
            <button className="primary" onClick={() => setTab('settings')}>
              {t('signIn')}
            </button>
          </div>
        </div>
      )}
      {tab === 'projects' && signedIn && (
      <div className="home-body">
        <section>
          <h2 className="with-status">
            {t('projects')}
            {sync.status !== 'off' && (
              <button className={'sync-chip ' + sync.status} onClick={() => syncAll()} title={sync.detail || t('syncNow')}>
                {sync.status === 'syncing' ? <RefreshCw size={13} className="spin" /> : sync.status === 'error' ? <CloudAlert size={14} /> : <CloudCheck size={14} />}
                {t(sync.status === 'syncing' ? 'syncing' : sync.status === 'error' ? 'syncError' : 'synced')}
              </button>
            )}
          </h2>
          {sync.status === 'off' && <p className="muted small pad-b">{t('syncOff')}</p>}
          {sync.detail && <p className={(sync.status === 'error' ? 'error' : 'muted') + ' small pad-b'}>{sync.detail}</p>}
          {!list.length && (
            <div className="empty-projects">
              <p className="muted">{t('noProjects')}</p>
              <button className="primary" onClick={() => setTab('create')}>
                <Plus size={18} /> {t('newProject')}
              </button>
            </div>
          )}
          <div className="project-grid">
            {list.map((p) => (
              <div key={p.id} className="project-card">
                <button className="project-thumb" onClick={() => openProject(p)} style={{ aspectRatio: `${p.width} / ${p.height}` }} aria-label={`${t('open')} ${p.name}`}>
                  {p.thumb ? <img src={p.thumb} alt="" draggable={false} /> : <span className="muted">{p.width > p.height ? '16:9' : p.width === p.height ? '1:1' : '9:16'}</span>}
                </button>
                <div className="project-meta">
                  <div>
                    <b>{p.name}</b>
                    <small className="muted">
                      {new Date(p.updatedAt).toLocaleDateString()} · {Math.round(projectDuration(p))}s
                    </small>
                  </div>
                  <button className="icon-btn small" aria-label={t('delete')} onClick={() => remove(p)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
      )}

      <button className="feedback-fab" onClick={() => window.dispatchEvent(new Event('cutvid:open-feedback'))} aria-label={t('feedback')} title={t('feedback')}>
        <MessageSquareText size={16} />
        <span>{t('feedback')}</span>
      </button>
    </div>
  );
}
