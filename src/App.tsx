import { useEffect, useState } from 'react';
import { Cloud, Download, Home as HomeIcon, Languages, MessageSquareText, Redo2, Undo2 } from 'lucide-react';
import { useStore, type PanelTab } from './store';
import { dbSet } from './lib/db';
import { useT } from './lib/i18n';
import { player } from './engine/player';
import { EDIT_ICON, Library, TABS, importFiles } from './components/Library';
import { Inspector } from './components/Inspector';
import { Preview, togglePlay } from './components/Preview';
import { Timeline } from './components/Timeline';
import { ExportDialog } from './components/ExportDialog';
import { CloudDialog } from './components/CloudDialog';
import { FeedbackDialog } from './components/FeedbackDialog';
import { Home } from './components/Home';

type Sheet = PanelTab | 'inspector' | null;
type DialogName = 'export' | 'cloud' | 'feedback' | null;

/** Save a small poster frame so the home screen can show the project. */
async function leaveEditor() {
  const st = useStore.getState();
  st.setPlaying(false);
  let thumb: string | undefined;
  try {
    const src = player.canvas;
    if (src && src.width) {
      const c = document.createElement('canvas');
      const k = 360 / Math.max(src.width, src.height);
      c.width = Math.round(src.width * k);
      c.height = Math.round(src.height * k);
      c.getContext('2d')!.drawImage(src, 0, 0, c.width, c.height);
      thumb = c.toDataURL('image/jpeg', 0.7);
    }
  } catch {
    /* a poster is optional */
  }
  if (thumb) st.mutate((p) => void (p.thumb = thumb), false);
  const p = useStore.getState().project;
  await dbSet('projects', p.id, p).catch(() => {});
  st.setScreen('home');
}

export function App() {
  const t = useT();
  const lang = useStore((s) => s.lang);
  const screen = useStore((s) => s.screen);
  const name = useStore((s) => s.project.name);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const busy = useStore((s) => s.busy);
  const panelTab = useStore((s) => s.panelTab);
  const [dialog, setDialog] = useState<DialogName>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [dropping, setDropping] = useState(false);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }, [lang]);

  // A password-reset link was opened, or a panel needs the user to sign in.
  useEffect(() => {
    const open = () => setDialog('cloud');
    window.addEventListener('cutvid:recovery', open);
    window.addEventListener('cutvid:open-cloud', open);
    return () => {
      window.removeEventListener('cutvid:recovery', open);
      window.removeEventListener('cutvid:open-cloud', open);
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (useStore.getState().screen !== 'editor') return;
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

  const dialogs = (
    <>
      {busy && <div className="toast">{busy === 'importing' ? t('importing') : busy === 'importFailed' ? t('importFailed') : busy}</div>}
      {dialog === 'export' && <ExportDialog onClose={() => setDialog(null)} />}
      {dialog === 'cloud' && <CloudDialog onClose={() => setDialog(null)} />}
      {dialog === 'feedback' && <FeedbackDialog onClose={() => setDialog(null)} />}
    </>
  );

  if (screen === 'home')
    return (
      <>
        <Home onCloud={() => setDialog('cloud')} onFeedback={() => setDialog('feedback')} />
        {dialogs}
      </>
    );

  const openSheet = (id: Sheet) => {
    if (id && id !== 'inspector') useStore.getState().setPanelTab(id);
    setSheet(sheet === id ? null : id);
  };
  const sheetClass = sheet === 'inspector' ? ' sheet-inspector' : sheet ? ' sheet-library' : '';

  return (
    <div
      className={'app' + sheetClass}
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
        <button className="icon-btn" onClick={leaveEditor} title={t('projects')} aria-label={t('projects')}>
          <HomeIcon size={19} />
        </button>
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
        <button className="icon-btn" onClick={() => setDialog('feedback')} title={t('feedback')} aria-label={t('feedback')}>
          <MessageSquareText size={18} />
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
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} className={sheet && sheet !== 'inspector' && panelTab === id ? 'active' : ''} onClick={() => openSheet(id)}>
            <Icon size={19} />
            {t(label)}
          </button>
        ))}
        <button className={sheet === 'inspector' ? 'active' : ''} onClick={() => openSheet('inspector')}>
          <EDIT_ICON size={19} />
          {t('edit')}
        </button>
      </nav>

      {dropping && <div className="drop-overlay">{t('import')}</div>}
      {dialogs}
    </div>
  );
}
