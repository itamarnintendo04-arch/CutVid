import { useEffect, useState } from 'react';
import { Cloud, Download, FolderOpen, Languages, Layers, Redo2, SlidersHorizontal, Undo2 } from 'lucide-react';
import { useStore } from './store';
import { dbGet } from './lib/db';
import { useT } from './lib/i18n';
import type { Project } from './types';
import { Library, importFiles } from './components/Library';
import { Inspector } from './components/Inspector';
import { Preview, togglePlay } from './components/Preview';
import { Timeline } from './components/Timeline';
import { ExportDialog } from './components/ExportDialog';
import { CloudDialog } from './components/CloudDialog';
import { ProjectsDialog, openProject } from './components/ProjectsDialog';

type Sheet = 'library' | 'inspector' | null;

export function App() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const name = useStore((s) => s.project.name);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const busy = useStore((s) => s.busy);
  const [dialog, setDialog] = useState<'export' | 'cloud' | 'projects' | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }, [lang]);

  // Restore the last project (and its media) from IndexedDB.
  useEffect(() => {
    const last = localStorage.getItem('cutvid:last');
    if (last)
      dbGet<Project>('projects', last)
        .then((p) => p && openProject(p))
        .catch(() => {});
  }, []);

  // A password-reset link was opened: show the dialog that asks for the new password.
  useEffect(() => {
    const open = () => setDialog('cloud');
    window.addEventListener('cutvid:recovery', open);
    return () => window.removeEventListener('cutvid:recovery', open);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (el.closest('input:not([type=range]), textarea, select, [contenteditable]')) return;
      const st = useStore.getState();
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (mod && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) st.redo();
        else st.undo();
      } else if (mod && key === 'y') {
        e.preventDefault();
        st.redo();
      } else if (mod && key === 'd') {
        e.preventDefault();
        st.duplicateSelection();
      } else if (mod && key === 'a') {
        e.preventDefault();
        st.select(st.project.clips.map((c) => c.id));
      } else if (key === 's' || (mod && key === 'b')) {
        if (!mod || key === 'b') {
          e.preventDefault();
          st.splitAtPlayhead();
        }
      } else if (e.key === 'Delete' || e.key === 'Backspace') st.deleteSelection();
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const step = (e.shiftKey ? 10 : 1) / st.project.fps;
        st.setPlaying(false);
        st.setTime(st.time + (e.key === 'ArrowLeft' ? -step : step));
      } else if (e.key === 'Home') st.setTime(0);
      else if (e.key === 'Escape') st.select([]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div
      className={'app' + (sheet ? ' sheet-' + sheet : '')}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDropping(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDropping(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDropping(false);
        if (e.dataTransfer.files.length) importFiles(e.dataTransfer.files);
      }}
    >
      <header className="topbar">
        <div className="brand">
          <img src="./icon.svg" alt="" width={26} height={26} />
          <b>CutVid</b>
        </div>
        <input
          className="project-name"
          value={name}
          aria-label={t('name')}
          onChange={(e) => useStore.getState().mutate((p) => void (p.name = e.target.value), false)}
        />
        <span className="spacer" />
        <button className="icon-btn" disabled={!canUndo} onClick={useStore.getState().undo} title={`${t('undo')} (Ctrl+Z)`} aria-label={t('undo')}>
          <Undo2 size={18} />
        </button>
        <button className="icon-btn" disabled={!canRedo} onClick={useStore.getState().redo} title={`${t('redo')} (Ctrl+Shift+Z)`} aria-label={t('redo')}>
          <Redo2 size={18} />
        </button>
        <button className="icon-btn" onClick={() => useStore.getState().setLang(lang === 'he' ? 'en' : 'he')} title="עברית / English" aria-label="language">
          <Languages size={18} />
        </button>
        <button className="top-btn" onClick={() => setDialog('projects')}>
          <FolderOpen size={16} /> <span>{t('projects')}</span>
        </button>
        <button className="top-btn" onClick={() => setDialog('cloud')}>
          <Cloud size={16} /> <span>{t('cloud')}</span>
        </button>
        <button className="top-btn primary" onClick={() => setDialog('export')}>
          <Download size={16} /> <span>{t('export')}</span>
        </button>
      </header>

      <aside className="left">
        <Library />
      </aside>
      <main className="center">
        <Preview />
      </main>
      <aside className="right">
        <Inspector />
      </aside>
      <footer className="bottom">
        <Timeline />
      </footer>

      <nav className="mobile-nav">
        <button className={sheet === 'library' ? 'active' : ''} onClick={() => setSheet(sheet === 'library' ? null : 'library')}>
          <Layers size={18} />
          {t('library')}
        </button>
        <button className={sheet === 'inspector' ? 'active' : ''} onClick={() => setSheet(sheet === 'inspector' ? null : 'inspector')}>
          <SlidersHorizontal size={18} />
          {t('inspector')}
        </button>
      </nav>

      {dropping && <div className="drop-overlay">{t('import')}</div>}
      {busy && <div className="toast">{busy === 'importing' ? t('importing') : busy}</div>}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'cloud' && <CloudDialog onClose={() => setDialog(null)} />}
      {dialog === 'projects' && <ProjectsDialog onClose={() => setDialog(null)} />}
    </div>
  );
}
