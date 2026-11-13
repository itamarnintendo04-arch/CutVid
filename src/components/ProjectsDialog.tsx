import { useEffect, useState } from 'react';
import { FilePlus2, Trash2 } from 'lucide-react';
import { emptyProject, useStore } from '../store';
import { dbAll, dbDel, dbSet } from '../lib/db';
import { media } from '../engine/media';
import { useT } from '../lib/i18n';
import type { Project } from '../types';
import { Dialog } from './ui';

export async function openProject(p: Project) {
  await media.restore(p.assets);
  useStore.getState().loadProject(p);
  localStorage.setItem('cutvid:last', p.id);
}

export function ProjectsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const currentId = useStore((s) => s.project.id);
  const [list, setList] = useState<Project[]>([]);

  const refresh = () => dbAll<Project>('projects').then((all) => setList(all.sort((a, b) => b.updatedAt - a.updatedAt)));
  useEffect(() => {
    // Flush the current project first so the list is up to date.
    const cur = useStore.getState().project;
    dbSet('projects', cur.id, cur).then(refresh, refresh);
  }, []);

  const create = async () => {
    const p = emptyProject(t('untitled'));
    await dbSet('projects', p.id, p);
    await openProject(p);
    onClose();
  };

  const remove = async (p: Project) => {
    await dbDel('projects', p.id);
    // Media blobs are only deleted when no other local project references them.
    const others = (await dbAll<Project>('projects')).flatMap((x) => x.assets.map((a) => a.id));
    for (const a of p.assets) if (!others.includes(a.id)) media.release(a.id, true);
    refresh();
  };

  return (
    <Dialog title={t('localProjects')} onClose={onClose}>
      <div className="stack">
        <button className="primary" onClick={create}>
          <FilePlus2 size={16} /> {t('newProject')}
        </button>
        <ul className="list">
          {list.map((p) => (
            <li key={p.id}>
              <span className="list-name">
                {p.name} {p.id === currentId && <small className="muted">({t('current')})</small>}
              </span>
              <small className="muted">{new Date(p.updatedAt).toLocaleString()}</small>
              <button
                disabled={p.id === currentId}
                onClick={async () => {
                  await openProject(p);
                  onClose();
                }}
              >
                {t('open')}
              </button>
              <button className="icon-btn small" disabled={p.id === currentId} aria-label={t('delete')} onClick={() => remove(p)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </Dialog>
  );
}
