import { useState } from 'react';
import { Star } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useT } from '../lib/i18n';
import { sendFeedback } from '../lib/supabase';
import { APP_VERSION } from '../version';
import { Dialog } from './ui';

export function FeedbackDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState('');

  const submit = async () => {
    setError('');
    setState('sending');
    try {
      const platform = `${window.cutvidAuth ? 'desktop' : Capacitor.getPlatform()} v${APP_VERSION}`;
      await sendFeedback(message, rating || null, email, platform);
      setState('sent');
    } catch (e) {
      setError((e as Error).message);
      setState('idle');
    }
  };

  return (
    <Dialog title={t('feedback')} onClose={onClose}>
      {state === 'sent' ? (
        <div className="stack">
          <p className="ok">{t('feedbackThanks')}</p>
          <button onClick={onClose}>{t('close')}</button>
        </div>
      ) : (
        <div className="stack">
          <p className="muted">{t('feedbackIntro')}</p>
          <div className="stars" dir="ltr" role="radiogroup" aria-label={t('rating')}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} className={'star' + (n <= rating ? ' on' : '')} onClick={() => setRating(n === rating ? 0 : n)} role="radio" aria-checked={n === rating} aria-label={`${n}`}>
                <Star size={26} fill={n <= rating ? 'currentColor' : 'none'} />
              </button>
            ))}
          </div>
          <textarea rows={5} dir="auto" maxLength={4000} placeholder={t('feedbackPlaceholder')} value={message} onChange={(e) => setMessage(e.target.value)} />
          <label className="field">
            <span className="field-label">{t('feedbackEmail')}</span>
            <input dir="ltr" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <button className="primary" disabled={state === 'sending' || message.trim().length < 3} onClick={submit}>
            {t('send')}
          </button>
          {error && <p className="error">{error}</p>}
        </div>
      )}
    </Dialog>
  );
}
