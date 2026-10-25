import './artifact-list.css';
import './cloud-library.css';
import './cloud-profile.css';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CalendarDays, Copy, Eye, EyeOff, ExternalLink } from 'lucide-react';
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

const FORMAT_TYPES: ArtifactType[] = ['artboard', 'html', 'document'];
const TYPE_LABEL_KEYS: Record<ArtifactType, string> = {
  artboard: 'type.artboard',
  html: 'type.html',
  document: 'type.document',
};
const TYPE_PLURAL_KEYS: Record<ArtifactType, string> = {
  artboard: 'cloudProfile.artboardLabel',
  html: 'cloudProfile.htmlLabel',
  document: 'cloudProfile.documentLabel',
};
const TYPE_COLORS: Record<ArtifactType, string> = {
  artboard: 'var(--profile-artboard)',
  html: 'var(--profile-html)',
  document: 'var(--profile-document)',
};

interface FormatStat {
  format: ArtifactType;
  count: number;
  views: number;
  pct: number;
}

function FormatRing({
  stats,
  total,
  active,
  onSelect,
}: {
  stats: FormatStat[];
  total: number;
  active: ArtifactType | undefined;
  onSelect: (type: ArtifactType | undefined) => void;
}) {
  const { t } = useTranslation();
  const circumference = 2 * Math.PI * 46;
  const gap = 3;
  let offset = 0;
  const segments = stats.map((stat) => {
    const fraction = total > 0 ? stat.count / total : 0;
    const length = Math.max(0, fraction * circumference - gap);
    const segment = {
      ...stat,
      dash: `${length} ${circumference - length}`,
      offset: -offset,
    };
    offset += fraction * circumference;
    return segment;
  });
  const activeStat = active ? stats.find((stat) => stat.format === active) : undefined;
  const centerCount = activeStat ? activeStat.count : total;
  const centerLabel = t(active ? TYPE_PLURAL_KEYS[active] : 'cloudProfile.artifactLabel', { count: centerCount });

  return (
    <aside className="profile-formats" aria-label={t('cloudProfile.formats')}>
      <div className="profile-formats-head">
        <span className="profile-formats-title">{t('cloudProfile.formats')}</span>
        <span className="profile-formats-tools">
          <span aria-live="polite">{active ? t(TYPE_LABEL_KEYS[active]) : t('cloudProfile.allFormats')}</span>
          {active && <button type="button" className="profile-formats-clear" onClick={() => onSelect(undefined)}>{t('cloudProfile.clear')}</button>}
        </span>
      </div>
      <div className="profile-formats-body">
        <div className="profile-donut-wrap">
          <svg className="profile-donut" viewBox="0 0 120 120" aria-hidden="true">
            <circle className="profile-donut-track" cx="60" cy="60" r="46" />
            <g transform="rotate(-90 60 60)">
              {segments.map((segment) => (
                <circle
                  key={segment.format}
                  className={`profile-donut-segment${segment.format === active ? ' is-active' : ''}${active && segment.format !== active ? ' is-muted' : ''}`}
                  cx="60"
                  cy="60"
                  r="46"
                  stroke={TYPE_COLORS[segment.format]}
                  strokeDasharray={segment.dash}
                  strokeDashoffset={segment.offset}
                  onClick={() => onSelect(segment.format === active ? undefined : segment.format)}
                />
              ))}
            </g>
          </svg>
          <div className="profile-donut-center">
            <b>{centerCount}</b>
            <span>{centerLabel}</span>
          </div>
        </div>
        <div className="profile-formats-legend" role="group" aria-label={t('cloudProfile.formats')}>
          {stats.map((stat) => {
            const pressed = stat.format === active;
            const label = t(TYPE_LABEL_KEYS[stat.format]);
            return (
              <button
                key={stat.format}
                type="button"
                className="profile-format-row"
                data-type={stat.format}
                aria-pressed={pressed}
                style={{ '--profile-type': TYPE_COLORS[stat.format] } as CSSProperties}
                title={t('cloudProfile.formatRowTitle', { count: stat.count, views: stat.views.toLocaleString(i18n.language) })}
                onClick={() => onSelect(pressed ? undefined : stat.format)}
              >
                <span className="profile-format-icon"><TypeIcon type={stat.format} size={15} /></span>
                <span className="profile-format-name">{label}</span>
                <span className="profile-format-count">{stat.count}</span>
                <span className="profile-format-pct">{stat.pct}%</span>
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}

const DAY_MS = 86_400_000;
const WEEK_COUNT = 53;
const CELL_STEP = 14;

function ContributionHeatmap({ artifacts, joinedAt }: { artifacts: ProfileArtifact[]; joinedAt: string }) {
  const { t } = useTranslation();
  const scroller = useRef<HTMLDivElement>(null);
  const language = i18n.language;
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    const key = artifact.updatedAt.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  const now = new Date();
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const pad = (value: number) => String(value).padStart(2, '0');
  const keyOf = (date: Date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
  const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
  const todayKey = keyOf(today);
  const endWeek = addDays(today, -today.getUTCDay());
  const start = addDays(endWeek, -(WEEK_COUNT - 1) * 7);
  const monthFormat = new Intl.DateTimeFormat(language, { month: 'short', timeZone: 'UTC' });
  const dateFormat = new Intl.DateTimeFormat(language, { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  const months: { week: number; label: string }[] = [];
  const cells: ReactNode[] = [];

  for (let week = 0; week < WEEK_COUNT; week += 1) {
    for (let day = 0; day < 7; day += 1) {
      const date = addDays(start, week * 7 + day);
      const key = keyOf(date);
      const count = counts.get(key) ?? 0;
      const level = count === 0 ? 0 : count === 1 ? 1 : count <= 3 ? 2 : count <= 5 ? 3 : 4;
      const label = dateFormat.format(date);
      const classes = ['profile-contrib-cell'];
      if (level) classes.push(`is-level-${level}`);
      if (date > today) classes.push('is-future');
      if (key === todayKey) classes.push('is-today');
      cells.push(
        <span
          key={key}
          className={classes.join(' ')}
          title={count ? t('cloudProfile.dayUpdates', { date: label, count }) : t('cloudProfile.dayNoUpdates', { date: label })}
        />,
      );
      if (date.getUTCDate() === 1) months.push({ week, label: monthFormat.format(date) });
    }
  }

  const monthParts: ReactNode[] = [];
  let cursor = 0;
  months.forEach((month, index) => {
    if (month.week > cursor) {
      monthParts.push(<span key={`gap-${cursor}`} style={{ width: (month.week - cursor) * CELL_STEP }} />);
    }
    const next = index + 1 < months.length ? months[index + 1]!.week : WEEK_COUNT;
    const span = next - month.week;
    monthParts.push(
      <span key={`month-${month.week}`} style={{ width: span * CELL_STEP }}>
        {span >= 3 ? month.label : ''}
      </span>,
    );
    cursor = next;
  });
  if (cursor < WEEK_COUNT) {
    monthParts.push(<span key="tail" style={{ width: (WEEK_COUNT - cursor) * CELL_STEP }} />);
  }

  useEffect(() => {
    const element = scroller.current;
    if (element) element.scrollLeft = element.scrollWidth;
  }, [artifacts]);

  const updates = artifacts.length;
  const activeDays = counts.size;
  const joined = new Date(joinedAt).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="profile-contribution">
      <div className="profile-contrib-top">
        <div className="profile-contrib-weekdays" aria-hidden="true">
          <span /> <span>{t('cloudProfile.weekdayMon')}</span> <span /> <span>{t('cloudProfile.weekdayWed')}</span> <span /> <span>{t('cloudProfile.weekdayFri')}</span> <span />
        </div>
        <div className="profile-contrib-scroll" ref={scroller}>
          <div className="profile-contrib-months" aria-hidden="true">{monthParts}</div>
          <div
            className="profile-contrib-grid"
            role="img"
            aria-label={t('cloudProfile.heatmapLabel', { updates, days: activeDays, joined })}
          >
            {cells}
          </div>
        </div>
      </div>
      <div className="profile-contrib-foot">
        <span className="profile-heat-legend" aria-hidden="true">
          {t('cloudProfile.heatLess')}
          <i /> <i className="is-level-1" /> <i className="is-level-2" /> <i className="is-level-3" /> <i className="is-level-4" />
          {t('cloudProfile.heatMore')}
        </span>
      </div>
    </div>
  );
}

function ProfileActivity({ artifacts, joinedAt }: { artifacts: ProfileArtifact[]; joinedAt: string }) {
  const { t } = useTranslation();
  const language = i18n.language;
  const counts = new Map<string, number>();
  for (const artifact of artifacts) {
    const key = artifact.updatedAt.slice(0, 10);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const updates = artifacts.length;
  const activeDays = counts.size;
  const perDay = activeDays ? updates / activeDays : 0;
  let busiestKey = '';
  let busiestCount = 0;
  counts.forEach((count, key) => {
    if (count > busiestCount) {
      busiestKey = key;
      busiestCount = count;
    }
  });
  const busiestLabel = busiestKey
    ? new Date(`${busiestKey}T00:00:00Z`).toLocaleDateString(language, { month: 'short', day: 'numeric', timeZone: 'UTC' })
    : '—';
  const joined = new Date(joinedAt).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <section className="profile-activity" aria-labelledby="profile-activity-title">
      <div className="profile-section-head">
        <div>
          <h2 id="profile-activity-title" className="profile-section-title">
            <CalendarDays size={14} aria-hidden="true" />
            {t('cloudProfile.activity')}
          </h2>
        </div>
        <span className="profile-section-period">{t('cloudProfile.last12Months')}</span>
      </div>
      <div className="profile-activity-body">
        <ContributionHeatmap artifacts={artifacts} joinedAt={joinedAt} />
        <div className="profile-activity-figures">
          <div className="profile-figure-row">
            <div className="profile-figure"><strong>{updates}</strong><span>{t('cloudProfile.updatesLabel', { count: updates })}</span></div>
            <div className="profile-figure"><strong>{activeDays}</strong><span>{t('cloudProfile.activeDaysLabel', { count: activeDays })}</span></div>
            <div className="profile-figure"><strong>{new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(perDay)}</strong><span>{t('cloudProfile.perActiveDay')}</span></div>
          </div>
          <div className="profile-busiest">
            <div className="profile-figure-label">{t('cloudProfile.busiestDay')}</div>
            <div className="profile-busiest-row">
              <strong>{busiestLabel}</strong>
              <span>{t('cloudProfile.artifactUpdates', { count: busiestCount })}</span>
            </div>
          </div>
          <p className="profile-activity-note">{t('cloudProfile.activityNote', { date: joined })}</p>
        </div>
      </div>
    </section>
  );
}

export function CloudProfile({ login }: { login: string }) {
  const { t } = useTranslation();
  const language = i18n.language;
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [viewer, setViewer] = useState<string | null>(null);
  const [type, setType] = useState<ArtifactType | undefined>(undefined);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    document.title = `${login} · Ryugi`;
    fetch('/api/session', { cache: 'no-store', credentials: 'same-origin' })
      .then(async (res) => {
        const body: unknown = await res.json();
        return body && typeof body === 'object' && 'login' in body && typeof body.login === 'string' ? body.login : null;
      })
      .then((name) => !cancelled && setViewer(name))
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
  const visible = all.filter((artifact) => !artifact.hidden);
  const shown = type ? all.filter((artifact) => artifact.type === type) : all;
  const listed = visible.length;
  const now = Date.now();
  const totalViews = visible.reduce((sum, artifact) => sum + artifact.views, 0);
  const projects = new Set(visible.map((artifact) => artifact.project).filter((value): value is string => Boolean(value)));
  const activeDays = new Set(visible.map((artifact) => artifact.updatedAt.slice(0, 10))).size;
  const lastPublished = visible[0]?.updatedAt;
  const formatStats: FormatStat[] = FORMAT_TYPES.map((format) => {
    const items = visible.filter((artifact) => artifact.type === format);
    return {
      format,
      count: items.length,
      views: items.reduce((sum, artifact) => sum + artifact.views, 0),
      pct: listed ? Math.round((items.length / listed) * 100) : 0,
    };
  });
  const pinned = FORMAT_TYPES
    .map((format) => visible.filter((artifact) => artifact.type === format).sort((a, b) => b.views - a.views)[0])
    .filter((artifact): artifact is ProfileArtifact => Boolean(artifact));
  const joinedLabel = profile ? new Date(profile.joinedAt).toLocaleDateString(language, { year: 'numeric', month: 'short', day: 'numeric' }) : '';

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
        <div className="profile-top-actions">
          {profile && !profile.owner && (
            <button type="button" className="cloud-button profile-copy-link" onClick={() => void copy()}>
              <Copy size={13} aria-hidden="true" /><span className="profile-copy-label">{t('cloudProfile.copyLink')}</span>
            </button>
          )}
          {!profile?.owner && notice && <span className="profile-top-notice" role="status">{notice}</span>}
          {viewer ? <Link className="profile-top-link" href="/">{t('cloudProfile.dashboard')}</Link> : <a className="profile-top-link" href={`/auth/login?return=/${login}`}>{t('cloudProfile.signIn')}</a>}
        </div>
      </header>
      {profile?.owner && (
        <div className="profile-owner">
          <Eye size={14} aria-hidden="true" /><span>{t('cloudProfile.ownerNote')}</span>
          <span className="profile-owner-count">{t('cloudProfile.shownHidden', { shown: listed, hidden: all.length - listed })}</span>
          <span className="cloud-grow" />
          {notice && <span role="status">{notice}</span>}
          <button type="button" onClick={() => void copy()}>{t('cloudProfile.copyLink')}</button>
        </div>
      )}
      {loaded.state === 'loading' && <p className="library-empty" role="status">{t('common.loading')}</p>}
      {loaded.state === 'error' && <p className="library-empty" role="alert">{t('cloudProfile.loadFailed')}</p>}
      {loaded.state === 'missing' && <div className="library-empty"><h2>{t('cloudProfile.missingTitle')}</h2><p>{t('cloudProfile.missingBody')}</p><a href="/home">Ryugi</a></div>}
      {profile && (
        <main className="profile-main">
          <section className="profile-hero">
            <div className="profile-identity">
              <div className="profile-avatar-ring">
                {profile.avatarUrl ? <img className="profile-avatar" src={profile.avatarUrl} alt="" /> : <i className="profile-avatar is-fallback" aria-hidden="true" />}
              </div>
              <div className="profile-identity-copy">
                <p className="profile-eyebrow"><span className="profile-live" aria-hidden="true" />{t('cloudProfile.publicProfile')}</p>
                <div className="profile-name-row"><h1>{profile.login}</h1><span>@{profile.login}</span></div>
                <p className="profile-summary">{t('cloudProfile.summary')}</p>
                <div className="profile-numbers">
                  <span><b>{listed}</b> {t('cloudProfile.artifactLabel', { count: listed })}</span>
                  <i aria-hidden="true" />
                  <span><b>{new Intl.NumberFormat(language, { notation: 'compact', maximumFractionDigits: 1 }).format(totalViews)}</b> {t('cloudProfile.viewLabel', { count: totalViews })}</span>
                  <i aria-hidden="true" />
                  <span><b>{projects.size}</b> {t('cloudProfile.projectLabel', { count: projects.size })}</span>
                  <i aria-hidden="true" />
                  <span><b>{activeDays}</b> {t('cloudProfile.activeDayLabel', { count: activeDays })}</span>
                </div>
                <div className="profile-meta">
                  <span>{t('cloudProfile.joinedOn', { date: joinedLabel })}</span>
                  {lastPublished && <><i aria-hidden="true" /><span>{t('cloudProfile.lastPublished', { time: relativeUpdatedAt(Date.parse(lastPublished), now) })}</span></>}
                  <i aria-hidden="true" />
                  <a href={`https://github.com/${profile.login}`} target="_blank" rel="noreferrer">{t('cloudProfile.github', { login: profile.login })} <ExternalLink size={11} aria-hidden="true" /></a>
                </div>
              </div>
            </div>
            <FormatRing stats={formatStats} total={listed} active={type} onSelect={setType} />
          </section>

          {visible.length > 0 && !type && (
            <>
              <ProfileActivity artifacts={visible} joinedAt={profile.joinedAt} />
              <section className="profile-pinned" aria-labelledby="profile-pinned-title">
                <div className="profile-section-head">
                  <div>
                    <h2 id="profile-pinned-title" className="profile-section-title">{t('cloudProfile.pinned')}</h2>
                    <p>{t('cloudProfile.pinnedNote')}</p>
                  </div>
                  <span className="profile-section-count">{t('cloudProfile.pinnedCount', { shown: pinned.length, total: listed })}</span>
                </div>
                <ul className="profile-pin-list">
                  {pinned.map((artifact, index) => {
                    const title = artifact.title ?? artifact.id;
                    const version = Date.parse(artifact.updatedAt);
                    return (
                      <li key={artifact.id}>
                        <a className="profile-pin-row" href={`/a/${artifact.id}`}>
                          <span className="profile-pin-index">{String(index + 1).padStart(2, '0')}</span>
                          <div className="profile-pin-thumb">
                            <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
                          </div>
                          <span className="profile-pin-main">
                            <span className="profile-pin-title">{title}</span>
                            <span className="profile-pin-meta">
                              <span>{artifact.project ?? t('common.other')}</span>
                              <i aria-hidden="true" />
                              <span className="profile-pin-type" style={{ color: TYPE_COLORS[artifact.type] }}>
                                <TypeIcon type={artifact.type} size={12} />{t(TYPE_LABEL_KEYS[artifact.type])}
                              </span>
                              <i aria-hidden="true" />
                              <span>{relativeUpdatedAt(version, now)}</span>
                            </span>
                          </span>
                          <span className="profile-pin-views"><Eye size={12} aria-hidden="true" />{artifact.views.toLocaleString(language)}</span>
                          <span className="profile-pin-arrow"><ExternalLink size={14} aria-hidden="true" /></span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </section>
            </>
          )}

          {all.length === 0 ? (
            <p className="profile-empty">{profile.owner ? t('cloudProfile.emptyOwner') : t('cloudProfile.empty')}</p>
          ) : (
            <section className="profile-artifacts" aria-labelledby="profile-artifacts-title">
              <div className="profile-section-head">
                <div>
                  <h2 id="profile-artifacts-title" className="profile-section-title">
                    {type ? t('cloudProfile.formatArtifacts', { format: t(TYPE_LABEL_KEYS[type]) }) : t('cloudProfile.allArtifacts')}
                    <span className="profile-section-number">{shown.length}</span>
                  </h2>
                  <p>{type ? t('cloudProfile.formatArtifactsNote', { count: shown.length }) : t('cloudProfile.recentlyUpdated')}</p>
                </div>
                {type && <button type="button" className="profile-clear-filter" onClick={() => setType(undefined)}>{t('cloudProfile.clearFilter')}</button>}
              </div>
              {shown.length === 0 ? (
                <p className="profile-empty">{t('cloudProfile.emptyFormat')}</p>
              ) : (
                <ul className="profile-cards">
                  {shown.map((artifact) => {
                    const title = artifact.title ?? artifact.id;
                    const version = Date.parse(artifact.updatedAt);
                    return (
                      <li key={artifact.id} className={artifact.hidden ? 'profile-card-item is-hidden' : 'profile-card-item'}>
                        <a className="profile-card" href={`/a/${artifact.id}`}>
                          <div className="profile-card-thumb">
                            <ArtifactThumbnail title={title} src={`/a/${artifact.id}/preview?v=${version}`} version={version} />
                            <span className="profile-card-type-chip" style={{ '--profile-type': TYPE_COLORS[artifact.type] } as CSSProperties}>
                              <i aria-hidden="true" />{t(TYPE_LABEL_KEYS[artifact.type])}
                            </span>
                          </div>
                          <span className="cloud-card-info">
                            <span className="cloud-card-name">
                              <span className="cloud-card-title">{title}</span>
                            </span>
                            <span className="cloud-card-meta">
                              <span>{artifact.project ?? t('common.other')} · {t('cloudProfile.views', { count: artifact.views, formatted: artifact.views.toLocaleString(language) })}</span>
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
              )}
            </section>
          )}
          <p className="profile-made"><img src={logo} alt="" />{t('cloudProfile.madeWith')}</p>
        </main>
      )}
    </div>
  );
}
