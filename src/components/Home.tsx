import { useEffect, useState } from 'react';
import { Bell, Cloud, Languages, MessageSquareText, Plus, Trash2, X } from 'lucide-react';
import { emptyProject, useStore } from '../store';
import { dbAll, dbDel, dbSet } from '../lib/db';
import { media } from '../engine/media';
import { useT } from '../lib/i18n';
import { checkForUpdate, notify, notifyState, requestNotify, type NotifyState } from '../lib/notify';
import { SITE_URL } from '../lib/supabase';
import type { Project } from '../types';
import { projectDuration } from '../types';
import { AspectPicker } from './AspectPicker';

export async function openProject(p: Project) {
  await media.restore(p.assets);
  const st = useStore.getState();
  st.loadProject(p);
  st.setScreen('editor');
  localStorage.setItem('cutvid:last', p.id);
}

const NOTIFY_DISMISSED = 'cutvid:notify-dismissed';

export function Home({ onCloud, onFeedback }: { onCloud: () => void; onFeedback: () => void }) {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const [list, setList] = useState<Project[]>([]);
  const [aspect, setAspect] = useState({ w: 1920, h: 1080 });
  const [notifyPerm, setNotifyPerm] = useState<NotifyState>('unsupported');
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(NOTIFY_DISMISSED) === '1');
  const [update, setUpdate] = useState<number | null>(null);

  const refresh = () => dbAll<Project>('projects').then((all) => setList(all.sort((a, b) => b.updatedAt - a.updatedAt)));
  useEffect(() => {
    refresh();
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

  return (
    <div className="home">
      <header className="home-top">
        <div className="brand">
          <img src="./icon.svg" alt="" width={32} height={32} />
          <b>CutVid</b>
        </div>
        <span className="spacer" />
        <button className="icon-btn" onClick={() => useStore.getState().setLang(lang === 'he' ? 'en' : 'he')} aria-label="language" title="עברית / English">
          <Languages size={19} />
        </button>
        <button className="top-btn" onClick={onFeedback}>
          <MessageSquareText size={16} /> <span>{t('feedback')}</span>
        </button>
        <button className="top-btn" onClick={onCloud}>
          <Cloud size={16} /> <span>{t('account')}</span>
        </button>
      </header>

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

        <section>
          <h2>{t('projects')}</h2>
          {!list.length && <p className="muted">{t('noProjects')}</p>}
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
    </div>
  );
}
