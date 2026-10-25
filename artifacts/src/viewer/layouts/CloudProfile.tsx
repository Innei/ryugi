import './artifact-list.css';
import './cloud-library.css';
import './cloud-profile.css';
import { useEffect, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Link } from 'wouter';
import logo from '../../../../assets/ryugi-small.svg';
import type { ArtifactType } from '../../shared/types';
import { ArtifactThumbnail } from '../components/ArtifactThumbnail';
import { TypeIcon } from '../components/TypeIcon';
import { relativeUpdatedAt } from '../lib/artifact-list';
import { setOnProfile } from '../lib/cloud-shell';
import { i18n, useTranslation } from '../i18n';

interface ProfileArtifact {
  id: string;
  title: string | null;
  type: ArtifactType;
  project: string | null;
  updatedAt: string;
  views: number;
  hidden?: boolean;
}

interface Profile {
  login: string;
  profilePath: string;
  avatarUrl: string | null;
  joinedAt: string;
  owner: boolean;
  artifacts: ProfileArtifact[];
}

type Loaded = { state: 'loading' } | { state: 'missing' } | { state: 'error' } | { state: 'ready'; profile: Profile };

const TYPES: (ArtifactType | undefined)[] = [undefined, 'artboard', 'document', 'html'];

export function CloudProfile({ login }: { login: string }) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [viewer, setViewer] = useState<string | null>(null);
  const [project, setProject] = useState<string | null | undefined>(undefined);
  const [type, setType] = useState<ArtifactType | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    document.title = `${login} · Ryugi`;
    fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => ((await res.json()) as { login?: unknown }).login)
      .then((name) => !cancelled && setViewer(typeof name === 'string' ? name : null))
      .catch(() => {});
    fetch(`/api/u/${encodeURIComponent(login)}`, { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 404) return setLoaded({ state: 'missing' });
        if (!res.ok) return setLoaded({ state: 'error' });
        setLoaded({ state: 'ready', profile: (await res.json()) as Profile });
      })
      .catch(() => !cancelled && setLoaded({ state: 'error' }));
    return () => { cancelled = true; };
  }, [login]);

  const profile = loaded.state === 'ready' ? loaded.profile : null;
  const all = profile?.artifacts ?? [];
  const projects = [...new Set(all.map((artifact) => artifact.project))].sort((a, b) => (a === null ? 1 : b === null ? -1 : a.localeCompare(b)));
  const shown = all.filter((artifact) => (project === undefined || artifact.project === project) && (!type || artifact.type === type));
  const listed = all.filter((artifact) => !artifact.hidden).length;
  const now = Date.now();

  const toggle = async (artifact: ProfileArtifact) => {
    const hidden = !artifact.hidden;
    const apply = (value: boolean) => setLoaded((previous) => previous.state === 'ready'
      ? { ...previous, profile: { ...previous.profile, artifacts: previous.profile.artifacts.map((item) => item.id === artifact.id ? { ...item, hidden: value } : item) } }
      : previous);
    apply(hidden);
    setNotice(null);
    try {
      await setOnProfile(artifact.id, !hidden);
    } catch (err) {
      apply(!hidden);
      setNotice((err as Error).message);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${location.origin}${profile!.profilePath}`);
      setNotice(t('cloudProfile.copied'));
    } catch {
      setNotice(`${location.origin}${profile!.profilePath}`);
    }
  };

  return (
    <div className="artifact-library cloud-library cloud-profile">
      <header className="library-topbar">
        <div className="library-breadcrumb"><a href="/home" aria-label="Ryugi"><img className="library-logo" src={logo} alt="" /></a><strong>ryugi</strong><span>/</span><b>{profile?.login ?? login}</b></div>
        {viewer ? <Link className="profile-top-link" href="/">{t('cloudProfile.dashboard')}</Link> : <a className="profile-top-link" href={`/auth/login?return=/${login}`}>{t('cloudProfile.signIn')}</a>}
      </header>
      {profile?.owner && (
        <div className="profile-owner">
          <Eye size={14} aria-hidden="true" /><span>{t('cloudProfile.ownerNote')}</span><span className="cloud-grow" />
          {notice && <span role="status">{notice}</span>}
          <button type="button" onClick={() => void copy()}>{t('cloudProfile.copyLink')}</button>
        </div>
      )}
      {loaded.state === 'loading' && <p className="library-empty" role="status">{t('common.loading')}</p>}
      {loaded.state === 'error' && <p className="library-empty" role="alert">{t('cloudProfile.loadFailed')}</p>}
      {loaded.state === 'missing' && <div className="library-empty"><h2>{t('cloudProfile.missingTitle')}</h2><p>{t('cloudProfile.missingBody')}</p><a href="/home">Ryugi</a></div>}
      {profile && (
        <main className="profile-main">
          <section className="profile-who">
            {profile.avatarUrl ? <img className="profile-avatar" src={profile.avatarUrl} alt="" /> : <i className="profile-avatar" aria-hidden="true" />}
            <div>
              <h1>{profile.login}</h1>
              <p>
                <span>{profile.owner ? t('cloudProfile.shownHidden', { shown: listed, hidden: all.length - listed }) : t('cloudProfile.publicCount', { count: all.length })}</span>
                <span aria-hidden="true">·</span>
                <span>{t('cloudProfile.since', { date: new Date(profile.joinedAt).toLocaleDateString(i18n.language, { year: 'numeric', month: 'long' }) })}</span>
              </p>
            </div>
          </section>
          <nav className="profile-tabs" aria-label={t('common.project')}>
            <button type="button" aria-pressed={project === undefined} onClick={() => setProject(undefined)}>{t('type.all')}<i>{all.length}</i></button>
            {projects.map((name) => (
              <button key={name ?? ''} type="button" aria-pressed={project === name} onClick={() => setProject(name)}>{name ?? t('common.other')}<i>{all.filter((artifact) => artifact.project === name).length}</i></button>
            ))}
            <span className="cloud-grow" />
            <span className="cloud-segmented" role="group" aria-label={t('cloudLibrary.filterByType')}>
              {TYPES.map((value) => <button key={value ?? 'all'} type="button" aria-pressed={type === value} onClick={() => setType(value)}>{t(value ? `type.${value}` : 'type.all')}</button>)}
            </span>
          </nav>
          {all.length === 0 && <p className="profile-empty">{profile.owner ? t('cloudProfile.emptyOwner') : t('cloudProfile.empty')}</p>}
          <ul className="profile-cards">
            {shown.map((artifact) => {
              const title = artifact.title ?? artifact.id;
              const version = Date.parse(artifact.updatedAt);
              return (
                <li key={artifact.id} className={artifact.hidden ? 'profile-card-item is-hidden' : 'profile-card-item'}>
                  <a className="profile-card" href={`/a/${artifact.id}`}>
                    <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
                    <span className="cloud-card-info">
                      <span className="cloud-card-name"><span className="cloud-card-title">{title}</span><TypeIcon type={artifact.type} size={13} /></span>
                      <span className="cloud-card-meta">
                        <span>{artifact.project ?? t('common.other')} · {t('cloudProfile.views', { count: artifact.views, formatted: artifact.views.toLocaleString(i18n.language) })}</span>
                        <time dateTime={artifact.updatedAt}>{relativeUpdatedAt(version, now)}</time>
                      </span>
                    </span>
                  </a>
                  {artifact.hidden && <span className="profile-hidden-badge"><EyeOff size={12} aria-hidden="true" />{t('cloudProfile.hiddenBadge')}</span>}
                  {profile.owner && (
                    <button type="button" className="profile-card-toggle" onClick={() => void toggle(artifact)}>
                      {artifact.hidden ? <Eye size={13} aria-hidden="true" /> : <EyeOff size={13} aria-hidden="true" />}
                      {artifact.hidden ? t('cloudProfile.show') : t('cloudProfile.hide')}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="profile-made"><img src={logo} alt="" />{t('cloudProfile.madeWith')}</p>
        </main>
      )}
    </div>
  );
}
