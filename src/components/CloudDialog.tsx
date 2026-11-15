import { useEffect, useRef, useState } from 'react';
import { CloudUpload, LogOut } from 'lucide-react';
import type { User } from '@supabase/supabase-js';
import { useT } from '../lib/i18n';
import { clearConfig, clearRecovery, getConfig, recoveryPending, sendPasswordReset, sendSignInCode, setConfig, signInWithGoogle, signUpWithEmail, startEmailSignIn, supabase, verifySignInCode } from '../lib/supabase';
import { syncAll, useSync } from '../lib/sync';
import { Dialog } from './ui';

export function CloudDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [cfg, setCfg] = useState(getConfig);
  const [url, setUrl] = useState('');
  const [key, setKey] = useState('');
  const [user, setUser] = useState<User | null>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [working, setWorking] = useState(false);
  const sync = useSync();
  const [recovering, setRecovering] = useState(recoveryPending);
  const [newPassword, setNewPassword] = useState('');
  const [codeStep, setCodeStep] = useState(false);
  const [code, setCode] = useState('');
  // While the password step is in flight a short-lived session exists; do not show it as signed in.
  const gating = useRef(false);

  useEffect(() => {
    const c = supabase();
    if (!c) return;
    c.auth.getSession().then(({ data }) => setUser(data.session?.user ?? null));
    const { data } = c.auth.onAuthStateChange((_e, session) => {
      if (!gating.current) setUser(session?.user ?? null);
    });
    return () => data.subscription.unsubscribe();
  }, [cfg]);

  useEffect(() => {
    const onRecovery = () => setRecovering(true);
    const onAuthError = (e: Event) => setError(String((e as CustomEvent).detail));
    window.addEventListener('cutvid:recovery', onRecovery);
    window.addEventListener('cutvid:auth-error', onAuthError);
    return () => {
      window.removeEventListener('cutvid:recovery', onRecovery);
      window.removeEventListener('cutvid:auth-error', onAuthError);
    };
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setError('');
    setStatus('');
    setWorking(true);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setWorking(false);
    }
  };

  const connect = () => {
    if (!/^https:\/\/.+/.test(url.trim()) || key.trim().length < 20) return setError('URL / key?');
    setConfig(url, key);
    setError('');
    setCfg(getConfig());
  };

  const auth = (mode: 'in' | 'up') =>
    run(async () => {
      if (mode === 'up') {
        if (await signUpWithEmail(email.trim(), password)) setStatus(t('checkEmail'));
        return;
      }
      gating.current = true;
      try {
        await startEmailSignIn(email.trim(), password);
      } finally {
        gating.current = false;
      }
      setCode('');
      setCodeStep(true);
      setStatus(t('codeSent'));
    });

  const verify = () =>
    run(async () => {
      await verifySignInCode(email.trim(), code);
      setCodeStep(false);
      setPassword('');
    });

  const google = () =>
    run(async () => {
      setStatus(t('googleWaiting'));
      await signInWithGoogle();
      setStatus('');
    });

  const forgot = () =>
    run(async () => {
      if (!email.trim()) throw new Error(t('enterEmailFirst'));
      await sendPasswordReset(email.trim());
      setStatus(t('resetSent'));
    });

  const updatePassword = () =>
    run(async () => {
      const { error } = await supabase()!.auth.updateUser({ password: newPassword });
      if (error) throw new Error(error.message);
      clearRecovery();
      setRecovering(false);
      setNewPassword('');
      setStatus(t('passwordUpdated') + ' ✓');
    });

  return (
    <Dialog title={t('cloudTitle')} onClose={onClose}>
      {!cfg ? (
        <div className="stack">
          <p className="muted">{t('cloudIntro')}</p>
          <label className="field">
            <span className="field-label">{t('projectUrl')}</span>
            <input dir="ltr" type="url" placeholder="https://xxxx.supabase.co" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t('anonKey')}</span>
            <input dir="ltr" type="text" placeholder="eyJ… / sb_publishable_…" value={key} onChange={(e) => setKey(e.target.value)} />
          </label>
          <button className="primary" onClick={connect}>
            {t('connect')}
          </button>
        </div>
      ) : recovering && user ? (
        <div className="stack">
          <label className="field">
            <span className="field-label">{t('newPassword')}</span>
            <input dir="ltr" type="password" autoComplete="new-password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          </label>
          <button className="primary" disabled={working || newPassword.length < 6} onClick={updatePassword}>
            {t('updatePassword')}
          </button>
        </div>
      ) : !user && codeStep ? (
        <div className="stack">
          <p className="muted">
            <bdi>{email}</bdi>
          </p>
          <label className="field">
            <span className="field-label">{t('code')}</span>
            <input className="code-input" dir="ltr" type="text" inputMode="numeric" autoComplete="one-time-code" maxLength={10} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          <div className="row">
            <button className="primary" disabled={working || code.length < 6} onClick={verify}>
              {t('verify')}
            </button>
            <button disabled={working} onClick={() => run(() => sendSignInCode(email.trim()).then(() => setStatus(t('codeSent'))))}>
              {t('resend')}
            </button>
            <span className="spacer" />
            <button className="link-btn" onClick={() => setCodeStep(false)}>
              {t('back')}
            </button>
          </div>
        </div>
      ) : !user ? (
        <div className="stack">
          <p className="muted" dir="ltr">
            {cfg.url}
          </p>
          <button className="google-btn" disabled={working} onClick={google}>
            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
              <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.500-4.800 7.200l7.700 6c4.500-4.200 6.900-10.300 6.900-17.700z" />
              <path fill="#FBBC05" d="M10.500 28.600c-.5-1.400-.8-3-.8-4.600s.3-3.200.8-4.600l-7.900-6.200C1 16.500 0 20.100 0 24s1 7.500 2.600 10.800l7.900-6.200z" />
              <path fill="#34A853" d="M24 48c6.500 0 11.900-2.100 15.900-5.800l-7.700-6c-2.200 1.500-4.900 2.300-8.200 2.300-6.300 0-11.600-4.100-13.500-9.900l-7.900 6.200C6.500 42.600 14.600 48 24 48z" />
            </svg>
            {t('google')}
          </button>
          <div className="divider">{t('orEmail')}</div>
          <label className="field">
            <span className="field-label">{t('email')}</span>
            <input dir="ltr" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">{t('password')}</span>
            <input dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <div className="row">
            <button className="primary" disabled={working} onClick={() => auth('in')}>
              {t('signIn')}
            </button>
            <button disabled={working} onClick={() => auth('up')}>
              {t('signUp')}
            </button>
            <button className="link-btn" disabled={working} onClick={forgot}>
              {t('forgotPassword')}
            </button>
            <span className="spacer" />
            {cfg.fromEnv ? (
              <small className="muted">{t('configuredByBuild')}</small>
            ) : (
              <button
                onClick={() => {
                  clearConfig();
                  setCfg(null);
                }}
              >
                {t('disconnect')}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="stack">
          <div className="row">
            <span className="muted">
              {t('signedInAs')}
              <bdi>{user.email}</bdi>
            </span>
            <span className="spacer" />
            <button onClick={() => supabase()!.auth.signOut()}>
              <LogOut size={14} /> {t('signOut')}
            </button>
          </div>
          <p className="muted">{t('syncAuto')}</p>
          <div className="row">
            <button className="primary" disabled={sync.status === 'syncing'} onClick={() => syncAll()}>
              <CloudUpload size={16} /> {t('syncNow')}
            </button>
            <span className={sync.status === 'error' ? 'error' : 'ok'}>{t(sync.status === 'syncing' ? 'syncing' : sync.status === 'error' ? 'syncError' : 'synced')}</span>
          </div>
          {sync.detail && <p className={(sync.status === 'error' ? 'error' : 'muted') + ' small'}>{sync.detail}</p>}
        </div>
      )}
      {status && <p className="muted">{status}</p>}
      {error && <p className="error">{error}</p>}
    </Dialog>
  );
}
