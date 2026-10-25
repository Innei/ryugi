import './artifact-list.css';
import './cloud-library.css';
import './cloud-overview.css';
import './cloud-profile.css';
import { Button, Modal } from '@lobehub/ui';
import { Globe, Terminal } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'wouter';
import { RyugiMark } from '../components/RyugiMark';
import { deleteAccount, signOutSession } from '../lib/cloud-shell';
import { i18n, useTranslation } from '../i18n';

interface Session {
  id: string;
  kind: 'browser' | 'api';
  createdAt: string;
  expiresAt: string;
  current: boolean;
}

interface Account {
  login: string;
  profilePath: string;
  email: string | null;
  avatarUrl: string | null;
  joinedAt: string;
  profile: { shown: number; hidden: number };
  sessions: Session[];
}

type Loaded = { state: 'loading' } | { state: 'signed-out' } | { state: 'error' } | { state: 'ready'; account: Account };

const deleteStyle = { backgroundColor: 'var(--lobe-color-error-active)', color: '#fff' };
const date = (iso: string) => new Date(iso).toLocaleDateString(i18n.language, { year: 'numeric', month: 'short', day: 'numeric' });

export function CloudAccount() {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    document.title = `${t('cloudAccount.title')} · Ryugi Cloud`;
    fetch('/api/account', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) return setLoaded({ state: 'signed-out' });
        if (!res.ok) return setLoaded({ state: 'error' });
        setLoaded({ state: 'ready', account: (await res.json()) as Account });
      })
      .catch(() => !cancelled && setLoaded({ state: 'error' }));
    return () => { cancelled = true; };
  }, []);

  const account = loaded.state === 'ready' ? loaded.account : null;
  const profileUrl = account ? `${location.origin}${account.profilePath}` : '';

  const signOut = async (id: string) => {
    setNotice(null);
    try {
      await signOutSession(id);
      setLoaded((previous) => previous.state === 'ready' ? { ...previous, account: { ...previous.account, sessions: previous.account.sessions.filter((session) => session.id !== id) } } : previous);
    } catch (err) {
      setNotice((err as Error).message);
    }
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(profileUrl);
      setNotice(t('cloudProfile.copied'));
    } catch {
      setNotice(profileUrl);
    }
  };
  const remove = async () => {
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount(typed);
      location.assign('/home');
    } catch (err) {
      setError((err as Error).message);
      setDeleting(false);
    }
  };
  const matches = !!account && typed.trim().toLowerCase() === account.login.toLowerCase();

  return (
    <>
      {loaded.state === 'loading' && <p className="library-empty" role="status">{t('common.loading')}</p>}
      {loaded.state === 'error' && <p className="library-empty" role="alert">{t('cloudAccount.loadFailed')}</p>}
      {loaded.state === 'signed-out' && <div className="library-empty"><RyugiMark size={28} /><h2>Ryugi Cloud</h2><a href="/auth/login?return=/account">{t('common.signInGithub')}</a></div>}
      {account && (
        <main className="account-main">
          <section className="account-section">
            <h2>{t('cloudAccount.profile')}</h2>
            <p className="account-lead">{t('cloudAccount.profileLead')}</p>
            <div className="account-who">
              {account.avatarUrl ? <img className="profile-avatar is-small" src={account.avatarUrl} alt="" /> : <i className="profile-avatar is-small" aria-hidden="true" />}
              <div><b>{account.login}</b><small>{t('cloudAccount.joined', { date: date(account.joinedAt) })}</small></div>
              <span className="cloud-grow" />
              <Link className="cloud-button" href={account.profilePath}>{t('cloudAccount.viewProfile')}</Link>
            </div>
            <dl className="account-rows">
              <dt>{t('cloudAccount.publicProfile')}</dt><dd className="cloud-mono">{profileUrl}</dd><dd><button type="button" className="account-link" onClick={() => void copy()}>{t('cloudAccount.copy')}</button></dd>
              <dt>{t('cloudAccount.onProfile')}</dt><dd>{t('cloudAccount.shownCount', { count: account.profile.shown })} <small>· {t('cloudAccount.hiddenCount', { count: account.profile.hidden })}</small></dd><dd><Link className="account-link" href={account.profilePath}>{t('cloudAccount.manage')}</Link></dd>
              <dt>{t('cloudAccount.email')}</dt><dd><span className="account-email">{account.email ?? '—'}</span> <small>· {t('cloudAccount.emailNote')}</small></dd><dd />
            </dl>
            {notice && <p className="account-notice" role="status">{notice}</p>}
          </section>
          <section className="account-section">
            <h2>{t('cloudAccount.signIns')}</h2>
            <p className="account-lead">{t('cloudAccount.signInsLead')}</p>
            <ul className="account-sessions">
              {account.sessions.map((session) => (
                <li key={session.id}>
                  <span className="account-kind">{session.kind === 'browser' ? <Globe size={14} aria-hidden="true" /> : <Terminal size={14} aria-hidden="true" />}{session.kind === 'browser' ? t('cloudAccount.browser') : t('cloudAccount.cli')}</span>
                  <span>{t('cloudAccount.signedIn', { date: date(session.createdAt) })} <small>· {t('cloudAccount.expires', { date: date(session.expiresAt) })}</small></span>
                  {session.current
                    ? <span className="account-current">{t('cloudAccount.thisBrowser')}</span>
                    : <button type="button" className="account-link" data-session={session.id} onClick={() => void signOut(session.id)}>{t('cloudAccount.signOut')}</button>}
                </li>
              ))}
            </ul>
          </section>
          <section className="account-section">
            <h2>{t('cloudAccount.plan')}</h2>
            <div className="account-who"><span>{t('cloudAccount.planLead')}</span><span className="cloud-grow" /><a className="cloud-button" href="/billing">{t('cloudAccount.openPlan')}</a></div>
          </section>
          <section className="account-danger">
            <div><b>{t('cloudAccount.deleteTitle')}</b><span>{t('cloudAccount.deleteLead')}</span></div>
            <Button danger size="small" onClick={() => { setTyped(''); setError(null); setConfirming(true); }}>{t('cloudAccount.deleteEllipsis')}</Button>
          </section>
        </main>
      )}
      <Modal open={confirming} title={t('cloudAccount.confirmTitle')} width={460} centered
        okText={t('cloudAccount.deleteConfirm')} cancelText={t('common.cancel')} confirmLoading={deleting}
        okButtonProps={{ danger: true, disabled: !matches || deleting, style: matches ? deleteStyle : undefined }} cancelButtonProps={{ disabled: deleting }}
        closable={!deleting} maskClosable={!deleting} onCancel={() => !deleting && setConfirming(false)} onOk={() => void remove()}>
        <p className="cloud-delete-description">{t('cloudAccount.confirmBody')}</p>
        <label className="account-confirm">
          <span>{t('cloudAccount.typeLogin', { login: account?.login ?? '' })}</span>
          <input name="confirm-login" autoComplete="off" spellCheck={false} value={typed} onChange={(event) => setTyped(event.target.value)} />
        </label>
        {error && <p className="cloud-profile-error" role="alert">{error}</p>}
      </Modal>
    </>
  );
}
